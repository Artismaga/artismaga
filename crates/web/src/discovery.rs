//! Public catalogue transport. Reads only explicit publication DTOs, never private works.
use crate::{ApiResult, AppState, Mutation, SignedIn, error, pages, studio};
use artismaga_core::Permission;
use rocket::{
    State,
    http::{CookieJar, Status},
    serde::json::Json,
};
use serde::Deserialize;
use serde_json::json;

#[rocket::get("/discover/genres/<genre>?<subgenre>&<page>")]
pub async fn genre(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    genre: &str,
    subgenre: Option<&str>,
    page: Option<u32>,
) -> Result<pages::PageResponse, Status> {
    let taxonomy = artismaga_administration::taxonomy::load(&state.auth.store)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    if !taxonomy
        .value
        .genres
        .iter()
        .any(|g| g.key == genre && g.parent.is_none())
    {
        return Err(Status::NotFound);
    }
    let subgenre = subgenre.unwrap_or("");
    if !subgenre.is_empty()
        && !taxonomy
            .value
            .genres
            .iter()
            .any(|g| g.key == subgenre && g.parent.as_deref() == Some(genre))
    {
        return Err(Status::NotFound);
    }
    let page = page.unwrap_or(1);
    if !(1..=5).contains(&page) {
        return Err(Status::BadRequest);
    }
    pages::render_discovery(state, jar, genre, subgenre, page).await
}
#[rocket::get("/stories/<uid>")]
pub async fn story(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    uid: &str,
) -> Result<pages::PageResponse, Status> {
    if studio::service(state)
        .publication(uid)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        .is_none()
    {
        return Err(Status::NotFound);
    }
    pages::render_tab(state, jar, "story", uid, None).await
}
async fn publisher(
    state: &AppState,
    user: &artismaga_db::Account,
) -> Result<(), (Status, Json<serde_json::Value>)> {
    if !state
        .auth
        .allowed(user, Permission::PublishStory)
        .await
        .map_err(crate::unavailable)?
    {
        return Err(error(Status::Forbidden, "Publishing permission required"));
    }
    Ok(())
}
#[rocket::post("/works/<uid>/publish", data = "<input>")]
pub async fn publish(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<artismaga_studio::publishing::Publish>,
) -> ApiResult {
    publisher(state, &user.0).await?;
    let actor = studio::actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    studio::service(state)
        .publish(&actor, uid, input.into_inner(), artismaga_auth::now())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Publication failed. Check the required fields and reload if the draft changed.",
            )
        })?;
    Ok(Json(
        json!({"message":"Story published.","redirect":format!("/stories/{uid}")}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Revision {
    revision: i64,
}
#[rocket::post("/works/<uid>/unpublish", data = "<input>")]
pub async fn unpublish(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<Revision>,
) -> ApiResult {
    publisher(state, &user.0).await?;
    let actor = studio::actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    studio::service(state)
        .unpublish(&actor, uid, input.revision)
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Could not unpublish. Reload the current draft.",
            )
        })?;
    Ok(Json(
        json!({"message":"Story unpublished.","redirect":format!("/studio/{uid}/publishing")}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Feature {
    featured: bool,
}
#[rocket::post("/stories/<uid>/feature", data = "<input>")]
pub async fn feature(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<Feature>,
) -> ApiResult {
    crate::admin(state, &user.0).await?;
    state
        .auth
        .store
        .query(
            "UPDATE work_publication SET value.featured=$featured WHERE work=$uid",
            json!({"uid":uid,"featured":input.featured}),
        )
        .await
        .map_err(crate::unavailable)?;
    Ok(Json(json!({"message":"Featured placement saved."})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Hide {
    author: bool,
}
#[rocket::post("/stories/<uid>/hide", data = "<input>")]
pub async fn hide(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<Hide>,
) -> ApiResult {
    let story = studio::service(state)
        .publication(uid)
        .await
        .map_err(crate::unavailable)?
        .ok_or_else(|| error(Status::NotFound, "Story unavailable"))?;
    // Own-account mutation; bounded arrays and revision serialize concurrent preference edits.
    let accounts = artismaga_accounts::Accounts::new(state.auth.store.clone());
    let own = accounts
        .own(&user.0.uid)
        .await
        .map_err(crate::unavailable)?;
    let mut value = own.preferences;
    let (list, id) = if input.author {
        (&mut value.content.hidden_authors, story.author)
    } else {
        (&mut value.content.hidden_stories, story.uid)
    };
    if !list.contains(&id) {
        list.push(id);
    }
    accounts
        .save_preferences(
            &user.0.uid,
            artismaga_accounts::PreferencesUpdate {
                revision: own.preferences_revision,
                preferences: value,
            },
        )
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Could not save preference. Reload and try again.",
            )
        })?;
    Ok(Json(json!({"message":"Recommendation preference saved."})))
}

/// A closed list of bundled genre assets; no caller path enters the filesystem.
#[rocket::get("/assets/genres/<name>")]
pub fn genre_art(name: &str) -> Option<(rocket::http::ContentType, &'static [u8])> {
    let bytes: &'static [u8] = match name {
        "fantasy.webp" => include_bytes!("../assets/genres/fantasy.webp"),
        "science-fiction.webp" => include_bytes!("../assets/genres/science-fiction.webp"),
        "romance.webp" => include_bytes!("../assets/genres/romance.webp"),
        "mystery.webp" => include_bytes!("../assets/genres/mystery.webp"),
        "thriller.webp" => include_bytes!("../assets/genres/thriller.webp"),
        "horror.webp" => include_bytes!("../assets/genres/horror.webp"),
        "adventure.webp" => include_bytes!("../assets/genres/adventure.webp"),
        "drama.webp" => include_bytes!("../assets/genres/drama.webp"),
        "comedy.webp" => include_bytes!("../assets/genres/comedy.webp"),
        "speculative.webp" => include_bytes!("../assets/genres/speculative.webp"),
        "historical.webp" => include_bytes!("../assets/genres/historical.webp"),
        "western.webp" => include_bytes!("../assets/genres/western.webp"),
        _ => return None,
    };
    Some((rocket::http::ContentType::new("image", "webp"), bytes))
}
