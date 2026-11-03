//! Discussion/inbox transport and bounded, server-only KLIPY adapter.
use crate::{ApiResult, AppState, Mutation, SignedIn, WritingMutation, error, studio, unavailable};
use rocket::{
    State,
    http::{CookieJar, Status},
    serde::json::Json,
};
use serde_json::{Value, json};
use std::time::Duration;

async fn current(
    state: &AppState,
    jar: &CookieJar<'_>,
) -> Result<Option<artismaga_db::Account>, Status> {
    match jar.get("session") {
        Some(cookie) => state
            .auth
            .current(cookie.value())
            .await
            .map_err(|_| Status::ServiceUnavailable),
        None => Ok(None),
    }
}
#[rocket::get("/comments/<work>/<chapter>", rank = 2)]
pub async fn list(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    work: &str,
    chapter: &str,
) -> Result<Json<Value>, Status> {
    let user = current(state, jar).await?;
    let mut permissions = Vec::new();
    if let Some(u) = &user {
        permissions = state
            .auth
            .permissions(u)
            .await
            .map_err(|_| Status::ServiceUnavailable)?;
    }
    let comments = studio::service(state)
        .comments(work, chapter, user.as_ref().map(|u| u.uid.as_str()))
        .await
        .map_err(|_| Status::NotFound)?;
    let muted: Vec<String> = state
        .auth
        .store
        .rows(
            "SELECT VALUE target FROM comment_mute WHERE account=$account",
            json!({"account":user.as_ref().map(|u|u.uid.as_str()).unwrap_or("")}),
        )
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    Ok(Json(
        json!({"comments":comments,"account":user.map(|u|u.uid),"can_comment":permissions.contains(&artismaga_core::Permission::Comment),"can_manage":permissions.contains(&artismaga_core::Permission::ManageComments),"muted":muted}),
    ))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommentCommand {
    account: String,
    command: artismaga_studio::community::Command,
}
#[rocket::post("/comments/<work>/<chapter>", data = "<input>", rank = 2)]
pub async fn command(
    _guard: WritingMutation,
    user: SignedIn,
    state: &State<AppState>,
    work: &str,
    chapter: &str,
    input: Json<CommentCommand>,
) -> ApiResult {
    if input.account != user.0.uid {
        return Err(error(
            Status::Conflict,
            "Account changed. Reload before commenting.",
        ));
    }
    studio::service(state)
        .comment_command(
            &user.0.uid,
            work,
            chapter,
            input.into_inner().command,
            artismaga_auth::now(),
        )
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Comment unavailable, changed, or permission denied. Reload and try again.",
            )
        })?;
    Ok(Json(json!({"message":"Comment updated."})))
}
#[rocket::get("/notifications")]
pub async fn inbox(user: SignedIn, state: &State<AppState>) -> Result<Json<Value>, Status> {
    let mut entries = studio::service(state)
        .notifications(&user.0.uid)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    for entry in &mut entries {
        if let Some(story) = studio::service(state)
            .publication(entry["work"].as_str().unwrap_or(""))
            .await
            .map_err(|_| Status::ServiceUnavailable)?
        {
            entry["title"] = json!(story.title);
            entry["thumbnail"] = json!(format!("/media/{}", story.cover));
        }
    }
    Ok(Json(json!({"account":user.0.uid,"notifications":entries})))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InboxCommand {
    uid: String,
    dismiss: bool,
}
#[rocket::post("/notifications", data = "<input>")]
pub async fn inbox_command(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<InboxCommand>,
) -> ApiResult {
    studio::service(state)
        .notification_command(&user.0.uid, &input.uid, input.dismiss)
        .await
        .map_err(unavailable)?;
    Ok(Json(json!({"message":"Notification updated."})))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderCommand {
    api_key: String,
}
#[rocket::post("/admin/comments/klipy", data = "<input>")]
pub async fn configure(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<ProviderCommand>,
) -> ApiResult {
    crate::admin(state, &user.0).await?;
    if input.api_key.len() > 256
        || !input
            .api_key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(error(Status::UnprocessableEntity, "Invalid API key"));
    }
    let secret = state
        .storage
        .seal_secret(&input.api_key, "comments-klipy")
        .map_err(unavailable)?;
    state
        .auth
        .store
        .query(
            "UPSERT comment_provider:klipy SET secret=$secret",
            json!({"secret":secret}),
        )
        .await
        .map_err(unavailable)?;
    Ok(Json(json!({"message":"GIF provider saved."})))
}
async fn key(state: &AppState) -> anyhow::Result<String> {
    let saved: Vec<String> = state
        .auth
        .store
        .rows("SELECT VALUE secret FROM comment_provider:klipy", json!({}))
        .await?;
    if let Some(secret) = saved.first() {
        return state.storage.open_secret(secret, "comments-klipy");
    }
    // Development-only explicit opt-in. This file is never read in a normal installation.
    if std::env::var("ARTISMAGA_DEV_CONFIG").ok().as_deref() == Some("config/dev.toml") {
        let raw = std::fs::read_to_string("config/dev.toml")?;
        let value: toml::Value = toml::from_str(&raw)?;
        return Ok(value
            .get("klipy")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned());
    }
    anyhow::bail!("GIF provider not configured")
}
fn client() -> anyhow::Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
async fn bounded(mut response: reqwest::Response, limit: usize) -> anyhow::Result<Vec<u8>> {
    anyhow::ensure!(response.status().is_success(), "Provider unavailable");
    anyhow::ensure!(
        response.content_length().is_none_or(|n| n <= limit as u64),
        "Response too large"
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        anyhow::ensure!(bytes.len() + chunk.len() <= limit, "Response too large");
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
fn gif_url(value: &str) -> bool {
    value.len() <= 2048
        && !value.chars().any(char::is_control)
        && url::Url::parse(value).is_ok_and(|u| {
            u.scheme() == "https"
                && matches!(
                    u.host_str(),
                    Some("static.klipy.com" | "static1.klipy.com" | "static2.klipy.com")
                )
                && u.username().is_empty()
                && u.password().is_none()
                && u.port().is_none()
        })
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Search {
    query: String,
}
#[rocket::post("/comments/gifs/search", data = "<input>")]
pub async fn search(
    _guard: WritingMutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<Search>,
) -> Result<Json<Value>, Status> {
    if !state
        .auth
        .allowed(&user.0, artismaga_core::Permission::Comment)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
    {
        return Err(Status::Forbidden);
    }
    if input.query.chars().count() > 100 {
        return Err(Status::UnprocessableEntity);
    }
    let key = key(state).await.map_err(|_| Status::ServiceUnavailable)?;
    if key.is_empty()
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(Status::ServiceUnavailable);
    }
    let query = input.query.trim();
    let endpoint = if query.is_empty() {
        "trending"
    } else {
        "search"
    };
    let request = client()
        .map_err(|_| Status::ServiceUnavailable)?
        .get(format!(
            "https://api.klipy.com/api/v1/{key}/gifs/{endpoint}"
        ))
        .query(&[
            ("per_page", "12"),
            ("page", "1"),
            ("content_filter", "high"),
        ]);
    let request = if query.is_empty() {
        request
    } else {
        request.query(&[("q", query)])
    };
    let response = request
        .send()
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let bytes = bounded(response, 512 * 1024)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let data: Value = serde_json::from_slice(&bytes).map_err(|_| Status::ServiceUnavailable)?;
    let mut results = Vec::new();
    for row in data["data"]["data"]
        .as_array()
        .into_iter()
        .flatten()
        .take(12)
    {
        let Some(url) = row["file"]["sm"]["gif"]["url"]
            .as_str()
            .filter(|v| gif_url(v))
        else {
            continue;
        };
        let id = format!("gif_{}", artismaga_auth::digest(url));
        state
            .auth
            .store
            .query(
                "UPSERT type::record('comment_gif',$uid) SET uid=$uid,url=$url",
                json!({"uid":id,"url":url}),
            )
            .await
            .map_err(|_| Status::ServiceUnavailable)?;
        results.push(json!({"uid":id}));
    }
    Ok(Json(json!({"results":results})))
}
#[rocket::get("/comments/gifs/<uid>")]
pub async fn gif(state: &State<AppState>, uid: &str) -> Result<rocket::response::Redirect, Status> {
    if uid.len() > 80 {
        return Err(Status::NotFound);
    }
    let urls: Vec<String> = state
        .auth
        .store
        .rows(
            "SELECT VALUE url FROM comment_gif WHERE uid=$uid",
            json!({"uid":uid}),
        )
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let url = urls
        .first()
        .filter(|u| gif_url(u))
        .ok_or(Status::NotFound)?;
    // KLIPY requires direct media delivery; do not create a partner media cache.
    Ok(rocket::response::Redirect::to(url.clone()))
}
