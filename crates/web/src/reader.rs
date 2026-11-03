//! Reader transport: public SSR and own-account state; all writes retain Origin guards.
use crate::{ApiResult, AppState, Mutation, SignedIn, WritingMutation, error, pages, studio};
use rocket::{
    State,
    http::{ContentType, CookieJar, Status},
    serde::json::Json,
};
use serde_json::json;
#[rocket::get("/read/<work>/<chapter>")]
pub async fn page(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    work: &str,
    chapter: &str,
) -> Result<pages::PageResponse, Status> {
    if studio::service(state)
        .reader(work, chapter)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        .is_none()
    {
        return Err(Status::NotFound);
    }
    pages::render_tab(state, jar, "reader", &format!("{work}/{chapter}"), None).await
}
#[rocket::get("/reader/<work>/<chapter>/state")]
pub async fn own(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    work: &str,
    chapter: &str,
) -> Result<Json<serde_json::Value>, Status> {
    let user = match jar.get("session") {
        Some(c) => state
            .auth
            .current(c.value())
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        None => None,
    };
    let can_react = match &user {
        Some(u) => state
            .auth
            .allowed(u, artismaga_core::Permission::Comment)
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        None => false,
    };
    let can_rate = match &user {
        Some(u) => state
            .auth
            .allowed(u, artismaga_core::Permission::Review)
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        None => false,
    };
    let account = user.as_ref().map(|u| u.uid.clone());
    let value = match user {
        Some(u) => Some(
            studio::service(state)
                .reading_state(&u.uid, work, chapter)
                .await
                .map_err(|_| Status::ServiceUnavailable)?,
        ),
        None => None,
    };
    Ok(Json(
        json!({"account":account,"state":value,"can_react":can_react,"can_rate":can_rate}),
    ))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StateUpdate {
    account: String,
    state: artismaga_studio::reader::ReadingState,
}
#[rocket::post("/reader/<work>/<chapter>/state", data = "<input>")]
pub async fn save(
    _guard: WritingMutation,
    user: SignedIn,
    state: &State<AppState>,
    work: &str,
    chapter: &str,
    input: Json<StateUpdate>,
) -> ApiResult {
    if input.account != user.0.uid {
        return Err(error(
            Status::Conflict,
            "Reader account changed. Reload before syncing.",
        ));
    }
    let previous = studio::service(state)
        .reading_state(&user.0.uid, work, chapter)
        .await
        .map_err(crate::unavailable)?;
    if input.state.reactions != previous.reactions
        && !state
            .auth
            .allowed(&user.0, artismaga_core::Permission::Comment)
            .await
            .map_err(crate::unavailable)?
    {
        return Err(error(Status::Forbidden, "Reaction permission required"));
    }
    if input.state.rating != previous.rating
        && !state
            .auth
            .allowed(&user.0, artismaga_core::Permission::Review)
            .await
            .map_err(crate::unavailable)?
    {
        return Err(error(Status::Forbidden, "Rating permission required"));
    }
    let value = studio::service(state)
        .save_reading_state(
            &user.0.uid,
            work,
            chapter,
            input.into_inner().state,
            artismaga_auth::now(),
        )
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Reading state changed or chapter unavailable. Reload to sync.",
            )
        })?;
    Ok(Json(
        json!({"message":"Reading state saved.","state":value}),
    ))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReactionSave {
    revision: i64,
    show_titles: bool,
    reactions: Vec<artismaga_studio::reader::Reaction>,
    #[serde(default)]
    retired_images: Vec<String>,
}
#[rocket::post("/admin/comments", data = "<input>")]
pub async fn configure(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<ReactionSave>,
) -> ApiResult {
    crate::admin(state, &user.0).await?;
    let value = input.into_inner();
    studio::service(state)
        .configure_reactions_retiring(
            &user.0.uid,
            artismaga_studio::reader::Configuration {
                revision: value.revision,
                show_titles: value.show_titles,
                reactions: value.reactions,
            },
            &value.retired_images,
        )
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Check reaction configuration and reload if changed.",
            )
        })?;
    Ok(Json(json!({"message":"Reaction configuration saved."})))
}
#[rocket::get("/reader-sw.js")]
pub fn worker() -> (ContentType, &'static str) {
    (
        ContentType::JavaScript,
        include_str!("../assets/reader-sw.js"),
    )
}
#[rocket::get("/assets/reactions/<name>")]
pub fn image(name: &str) -> Option<(ContentType, &'static [u8])> {
    let data = crate::reaction_assets::image(name)?;
    Some((ContentType::PNG, data))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishChapter {
    revision: i64,
}
#[rocket::post("/reader/<work>/<chapter>/publish", data = "<input>")]
pub async fn publish(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    work: &str,
    chapter: &str,
    input: Json<PublishChapter>,
) -> ApiResult {
    if !state
        .auth
        .allowed(&user.0, artismaga_core::Permission::PublishStory)
        .await
        .map_err(crate::unavailable)?
    {
        return Err(error(Status::Forbidden, "Publishing permission required"));
    }
    let actor = studio::actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    studio::service(state)
        .publish_chapter(&actor, work, chapter, input.revision, artismaga_auth::now())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Publish the story first and reload the current saved chapter.",
            )
        })?;
    Ok(Json(
        json!({"message":"Chapter published.","redirect":format!("/read/{work}/{chapter}")}),
    ))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Measurement {
    position: f64,
}
#[rocket::post("/reader/<work>/<chapter>/measure", data = "<input>")]
pub async fn measure(
    _guard: crate::ReaderMutation,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    work: &str,
    chapter: &str,
    input: Json<Measurement>,
) -> ApiResult {
    let user = match jar.get("session") {
        Some(c) => state
            .auth
            .current(c.value())
            .await
            .map_err(crate::unavailable)?,
        None => None,
    };
    let viewer = if let Some(user) = user {
        artismaga_auth::digest(&format!("reader-account:{}", user.uid))
    } else {
        let raw = jar
            .get("reader_device")
            .filter(|c| c.value().len() == 64 && c.value().bytes().all(|b| b.is_ascii_hexdigit()))
            .map(|c| c.value().to_owned())
            .unwrap_or_else(artismaga_auth::token);
        jar.add(
            rocket::http::Cookie::build(("reader_device", raw.clone()))
                .path("/")
                .http_only(true)
                .secure(state.config.secure_cookies)
                .same_site(rocket::http::SameSite::Strict)
                .max_age(rocket::time::Duration::days(32))
                .build(),
        );
        artismaga_auth::digest(&format!("reader-device:{raw}"))
    };
    studio::service(state)
        .record_reading(
            work,
            chapter,
            &viewer,
            input.position,
            artismaga_auth::now(),
        )
        .await
        .map_err(|_| error(Status::Conflict, "Reading measurement unavailable"))?;
    Ok(Json(json!({"message":"Reading recorded."})))
}
#[rocket::get("/reader/<work>/<chapter>/stats")]
pub async fn stats(
    state: &State<AppState>,
    work: &str,
    chapter: &str,
) -> Result<Json<serde_json::Value>, Status> {
    let service = studio::service(state);
    if service
        .reader(work, chapter)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        .is_none()
    {
        return Err(Status::NotFound);
    }
    let data = service
        .chapter_stats(work)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        .into_iter()
        .find(|s| s.chapter == chapter)
        .unwrap_or_else(|| artismaga_studio::engagement::Stats {
            chapter: chapter.into(),
            ..Default::default()
        });
    Ok(Json(json!({"stats":data})))
}
#[rocket::post("/studio/works/<work>/status", data = "<input>")]
pub async fn status(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    work: &str,
    input: Json<artismaga_studio::lifecycle::Lifecycle>,
) -> ApiResult {
    let actor = studio::actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    studio::service(state)
        .save_lifecycle(&actor, work, input.into_inner(), artismaga_auth::now())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Could not save story status. Reload and try again.",
            )
        })?;
    Ok(Json(json!({"message":"Story status saved."})))
}

#[derive(rocket::response::Responder)]
pub struct SpeechAsset {
    body: (ContentType, &'static [u8]),
    policy: rocket::http::Header<'static>,
}
#[rocket::get("/assets/tts/<name>")]
pub fn speech_asset(name: &str) -> Option<SpeechAsset> {
    let (kind, bytes): (ContentType, &'static [u8]) = match name {
        "speech-worker.js" => (
            ContentType::JavaScript,
            include_bytes!("../../../web/dist/tts/speech-worker.js"),
        ),
        "ort-wasm-simd-threaded.jsep.mjs" => (
            ContentType::JavaScript,
            include_bytes!("../../../web/dist/tts/ort-wasm-simd-threaded.jsep.mjs"),
        ),
        "ort-wasm-simd-threaded.jsep.wasm" => (
            ContentType::new("application", "wasm"),
            include_bytes!("../../../web/dist/tts/ort-wasm-simd-threaded.jsep.wasm"),
        ),
        _ => return None,
    };
    Some(SpeechAsset {
        body: (kind, bytes),
        policy: rocket::http::Header::new(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://*.hf.co; object-src 'none'",
        ),
    })
}
