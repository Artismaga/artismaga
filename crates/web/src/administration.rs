//! Administrator configuration and user-directory transport; analytics are explicitly not implemented.
use crate::{ApiResult, AppState, Mutation, SignedIn, admin, error, unavailable};
use artismaga_administration::{Administration, ConfigurationUpdate, validate};
use rocket::{State, http::Status, serde::json::Json};
use serde_json::json;
pub fn service(state: &AppState) -> Administration {
    Administration::new(state.auth.store.clone(), &state.config)
}
#[rocket::get("/configuration")]
pub async fn configuration(user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    Ok(Json(
        json!({"settings":service(state).configuration().await.map_err(unavailable)?}),
    ))
}
#[rocket::post("/configuration", data = "<data>")]
pub async fn save(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<ConfigurationUpdate>,
) -> ApiResult {
    admin(state, &user.0).await?;
    validate(&data).map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    if let Some(id) = &data.configuration.default_cover {
        let asset = state
            .storage
            .asset(id)
            .await
            .map_err(unavailable)?
            .ok_or_else(|| error(Status::BadRequest, "Default cover unavailable"))?;
        if asset.purpose != "default_cover" {
            return Err(error(
                Status::BadRequest,
                "Choose an administrator default cover",
            ));
        }
    }
    let revision = service(state).save(data.into_inner()).await.map_err(|_| {
        error(
            Status::Conflict,
            "Configuration changed elsewhere. Reload before saving.",
        )
    })?;
    Ok(Json(
        json!({"message":"Site configuration saved.","revision":revision}),
    ))
}
#[rocket::get("/users?<offset>&<search>")]
pub async fn users(
    user: SignedIn,
    state: &State<AppState>,
    offset: Option<u32>,
    search: Option<&str>,
) -> ApiResult {
    admin(state, &user.0).await?;
    let offset = offset.unwrap_or(0);
    let users = service(state)
        .users(offset, search.unwrap_or(""))
        .await
        .map_err(|_| error(Status::BadRequest, "Invalid directory search"))?;
    Ok(Json(
        json!({"has_more":users.len()==20,"users":users,"offset":offset}),
    ))
}
#[rocket::get("/roles")]
pub async fn roles(user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    Ok(Json(
        json!({"roles":artismaga_administration::roles::list(&state.auth.store).await.map_err(unavailable)?}),
    ))
}
#[rocket::post("/roles", data = "<data>")]
pub async fn save_role(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<artismaga_administration::roles::RoleUpdate>,
) -> ApiResult {
    admin(state, &user.0).await?;
    artismaga_administration::roles::validate(&data)
        .map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let revision = artismaga_administration::roles::save(&state.auth.store, data.into_inner())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Role changed or key already exists. Reload before saving.",
            )
        })?;
    Ok(Json(json!({"message":"Role saved.","revision":revision})))
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteRole {
    revision: i64,
}
#[rocket::post("/roles/<key>/delete", data = "<data>")]
pub async fn delete_role(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    key: &str,
    data: Json<DeleteRole>,
) -> ApiResult {
    admin(state, &user.0).await?;
    artismaga_administration::roles::delete(&state.auth.store, key, data.revision)
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Cannot remove a built-in, assigned or changed role.",
            )
        })?;
    Ok(Json(json!({"message":"Role removed."})))
}
#[rocket::get("/storage")]
pub async fn storage(user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    Ok(Json(
        json!({"settings":state.storage.settings().await.map_err(unavailable)?}),
    ))
}
#[rocket::post("/storage", data = "<data>")]
pub async fn save_storage(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<artismaga_storage::StorageUpdate>,
) -> ApiResult {
    admin(state, &user.0).await?;
    artismaga_storage::validate(&data).map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let revision=state.storage.save(data.into_inner()).await.map_err(|_|error(Status::Conflict,"Could not save storage. Supply credentials for new locations, or reload if settings changed."))?;
    Ok(Json(
        json!({"message":"Storage configuration saved. Credentials are never returned.","revision":revision}),
    ))
}

#[rocket::get("/announcements?<offset>&<search>")]
pub async fn announcements(
    user: SignedIn,
    state: &State<AppState>,
    offset: Option<u32>,
    search: Option<&str>,
) -> ApiResult {
    if !state
        .auth
        .allowed(&user.0, artismaga_core::Permission::ManageAnnouncements)
        .await
        .map_err(unavailable)?
    {
        return Err(error(
            Status::Forbidden,
            "Announcement management permission required",
        ));
    }
    let offset = offset.unwrap_or(0);
    let mut rows = artismaga_administration::announcements::history(
        &state.auth.store,
        offset,
        search.unwrap_or(""),
    )
    .await
    .map_err(unavailable)?;
    let has_more = rows.len() > 50;
    rows.truncate(50);
    Ok(Json(
        json!({"next_offset":offset.saturating_add(rows.len() as u32),"announcements":rows,"has_more":has_more}),
    ))
}
#[rocket::post("/announcements", data = "<data>")]
pub async fn save_announcement(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<artismaga_administration::announcements::Update>,
) -> ApiResult {
    if !state
        .auth
        .allowed(&user.0, artismaga_core::Permission::ManageAnnouncements)
        .await
        .map_err(unavailable)?
    {
        return Err(error(
            Status::Forbidden,
            "Announcement management permission required",
        ));
    }
    artismaga_administration::announcements::validate(&data)
        .map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    if let Some(image) = &data.value.image {
        let asset = state
            .storage
            .asset(image)
            .await
            .map_err(unavailable)?
            .ok_or_else(|| error(Status::BadRequest, "Image unavailable"))?;
        if asset.purpose != "announcement" {
            return Err(error(
                Status::Forbidden,
                "Choose your own announcement image",
            ));
        }
    }
    let uid = artismaga_administration::announcements::save(
        &state.auth.store,
        &user.0.uid,
        data.into_inner(),
        artismaga_auth::now(),
    )
    .await
    .map_err(|_| {
        error(
            Status::Conflict,
            "Announcement changed or audience unavailable",
        )
    })?;
    Ok(Json(json!({"message":"Announcement saved.","uid":uid})))
}
#[rocket::get("/identity-keys")]
pub async fn identity_keys(user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    let localisation = artismaga_localisation::Localisation::new(state.auth.store.clone());
    let locale = localisation
        .settings()
        .await
        .map_err(unavailable)?
        .source_locale;
    let rows: Vec<_> = localisation
        .overrides()
        .await
        .map_err(unavailable)?
        .into_iter()
        .filter(|r| {
            r.locale == locale && ["site.name", "discovery.headline"].contains(&r.key.as_str())
        })
        .collect();
    Ok(Json(json!({"locale":locale,"keys":rows})))
}
