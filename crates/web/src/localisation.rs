//! Language selection, privileged draft/live editing and automated translation configuration.
use crate::{ApiResult, AppState, Mutation, SignedIn, error, unavailable};
use artismaga_core::Permission;
use artismaga_localisation::{Localisation, Settings};
use rocket::{
    State,
    http::{Cookie, CookieJar, SameSite, Status},
    serde::json::Json,
};
use serde::Deserialize;
use serde_json::json;
async fn editor(
    state: &AppState,
    user: &SignedIn,
) -> Result<(), (Status, Json<serde_json::Value>)> {
    if state
        .auth
        .allowed(&user.0, Permission::ConfigureLocalisation)
        .await
        .map_err(unavailable)?
    {
        Ok(())
    } else {
        Err(error(
            Status::Forbidden,
            "Localisation configuration permission required",
        ))
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Select {
    locale: String,
}
#[rocket::post("/api/localisation/select", data = "<input>")]
pub async fn select(
    _guard: Mutation,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    input: Json<Select>,
) -> ApiResult {
    let settings = Localisation::new(state.auth.store.clone())
        .settings()
        .await
        .map_err(unavailable)?;
    if !settings.enabled.contains(&input.locale) {
        return Err(error(Status::BadRequest, "Language unavailable"));
    }
    jar.add(
        Cookie::build(("locale", input.locale.clone()))
            .path("/")
            .secure(state.config.secure_cookies)
            .same_site(SameSite::Lax)
            .http_only(true),
    );
    Ok(Json(json!({"message":"Language changed."})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Edit {
    key: String,
    locale: String,
    text: String,
    revision: i64,
    #[serde(default)]
    publish: bool,
    #[serde(default)]
    discard: bool,
}
#[rocket::post("/api/localisation/keys", data = "<input>")]
pub async fn edit(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<Edit>,
) -> ApiResult {
    editor(state, &user).await?;
    let revision = Localisation::new(state.auth.store.clone())
        .edit(artismaga_localisation::Edit {
            key: &input.key,
            locale: &input.locale,
            text: &input.text,
            revision: input.revision,
            actor: &user.0.uid,
            publish: input.publish,
            discard: input.discard,
        })
        .await
        .map_err(|e| error(Status::Conflict, &e.to_string()))?;
    Ok(Json(
        json!({"revision":revision,"message":if input.publish{"Translation published."}else{"Draft saved."}}),
    ))
}
#[rocket::post("/api/localisation/settings", data = "<input>")]
pub async fn settings(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<Settings>,
) -> ApiResult {
    editor(state, &user).await?;
    let revision = input.revision;
    Localisation::new(state.auth.store.clone())
        .save_settings(input.into_inner())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Localisation settings changed or are invalid",
            )
        })?;
    Ok(Json(
        json!({"revision":revision+1,"message":"Languages saved."}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preview {
    enabled: bool,
}
#[rocket::post("/api/localisation/preview", data = "<input>")]
pub async fn preview(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    input: Json<Preview>,
) -> ApiResult {
    editor(state, &user).await?;
    jar.add(
        Cookie::build(("locale_preview", if input.enabled { "on" } else { "off" }))
            .path("/")
            .secure(state.config.secure_cookies)
            .same_site(SameSite::Lax)
            .http_only(true),
    );
    Ok(Json(json!({"message":"Preview preference saved."})))
}
#[rocket::post("/api/localisation/translation", data = "<input>")]
pub async fn translation(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<artismaga_localisation::translation::Update>,
) -> ApiResult {
    editor(state, &user).await?;
    let revision = state
        .translator
        .save(input.into_inner())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Provider settings changed or need credentials",
            )
        })?;
    let translator = state.translator.clone();
    tokio::spawn(async move {
        let _ = translator.prepare().await;
    });
    Ok(Json(
        json!({"revision":revision,"message":"Translation provider saved."}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Auto {
    key: String,
    locale: String,
}
#[rocket::post("/api/localisation/translate-key", data = "<input>")]
pub async fn translate_key(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<Auto>,
) -> ApiResult {
    editor(state, &user).await?;
    let text = state
        .translator
        .key(&input.key, &input.locale, artismaga_auth::now())
        .await
        .map_err(|cause| {
            eprintln!("Localisation generation failed: {cause:#}");
            error(
                Status::ServiceUnavailable,
                "Translation unavailable. Check the provider status and try again.",
            )
        })?;
    Ok(Json(
        json!({"text":text,"message":"Translation generated. Review and save it as a draft."}),
    ))
}
#[rocket::get("/api/localisation/runtime")]
pub async fn runtime(user: SignedIn, state: &State<AppState>) -> ApiResult {
    editor(state, &user).await?;
    Ok(Json(
        json!({"status":state.translator.local.status().await}),
    ))
}
