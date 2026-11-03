//! Authenticated own-account routes. Target identity always comes from the session guard.
use crate::{ApiResult, AppState, Mutation, SignedIn, error, unavailable};
use artismaga_accounts::{
    Accounts, PreferencesUpdate, ProfileUpdate, validate_preferences, validate_profile,
};
use rocket::{
    State,
    http::{Cookie, CookieJar, Header, Status},
    serde::json::Json,
};
use serde::Deserialize;
use serde_json::json;
fn accounts(state: &AppState) -> Accounts {
    Accounts::new(state.auth.store.clone())
}
#[rocket::get("/")]
pub async fn own(user: SignedIn, state: &State<AppState>) -> ApiResult {
    Ok(Json(
        json!({"account":accounts(state).own(&user.0.uid).await.map_err(unavailable)?}),
    ))
}
#[rocket::post("/profile", data = "<data>")]
pub async fn profile(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<ProfileUpdate>,
) -> ApiResult {
    validate_profile(&data).map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let revision = accounts(state)
        .save_profile(&user.0.uid, data.into_inner())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Profile changed elsewhere. Reload this page before saving.",
            )
        })?;
    Ok(Json(
        json!({"message":"Profile saved.","revision":revision}),
    ))
}
#[rocket::post("/preferences", data = "<data>")]
pub async fn preferences(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<PreferencesUpdate>,
) -> ApiResult {
    validate_preferences(&data.preferences)
        .map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let revision = accounts(state)
        .save_preferences(&user.0.uid, data.into_inner())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Preferences changed elsewhere. Reload this page before saving.",
            )
        })?;
    Ok(Json(
        json!({"message":"Preferences saved.","revision":revision}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PasswordChange {
    current_password: String,
    new_password: String,
}
#[rocket::post("/password", data = "<data>")]
pub async fn password(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    data: Json<PasswordChange>,
) -> ApiResult {
    let data = data.into_inner();
    state
        .auth
        .change_password(&user.0.uid, data.current_password, data.new_password)
        .await
        .map_err(|_| {
            error(
                Status::BadRequest,
                "Check your current password and use a new password of 15–128 characters.",
            )
        })?;
    jar.remove(Cookie::build("session").path("/").build());
    Ok(Json(
        json!({"message":"Password changed. Every device has been signed out.","redirect":"/account/login"}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmailChange {
    current_password: String,
    email: String,
}
#[rocket::post("/email", data = "<data>")]
pub async fn email(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<EmailChange>,
) -> ApiResult {
    if !state.auth.mail_enabled() {
        return Err(error(
            Status::ServiceUnavailable,
            "Email delivery must be configured before changing your address.",
        ));
    }
    let data = data.into_inner();
    state
        .auth
        .request_email_change(&user.0.uid, data.current_password, data.email)
        .await
        .map_err(|_| {
            error(
                Status::BadRequest,
                "Unable to send confirmation. Check your password, new address and email delivery.",
            )
        })?;
    Ok(Json(
        json!({"message":"A confirmation link has been sent to the new address. Your current address stays active until you confirm."}),
    ))
}
#[rocket::get("/sessions")]
pub async fn sessions(user: SignedIn, state: &State<AppState>, jar: &CookieJar<'_>) -> ApiResult {
    Ok(Json(
        json!({"sessions":state.auth.sessions(&user.0.uid,jar.get("session").map_or("",|c|c.value())).await.map_err(unavailable)?}),
    ))
}
#[rocket::post("/sessions/<sid>/revoke")]
pub async fn revoke_session(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    sid: &str,
) -> ApiResult {
    let list = state
        .auth
        .sessions(&user.0.uid, jar.get("session").map_or("", |c| c.value()))
        .await
        .map_err(unavailable)?;
    let current = list
        .iter()
        .any(|s| s.sid.as_deref() == Some(sid) && s.current);
    state
        .auth
        .revoke_session(&user.0.uid, sid)
        .await
        .map_err(unavailable)?;
    if current {
        jar.remove(Cookie::build("session").path("/").build());
    }
    let mut result = json!({"message":"Session signed out."});
    if current {
        result["redirect"] = json!("/account/login");
    }
    Ok(Json(result))
}
#[derive(rocket::response::Responder)]
pub struct Export {
    body: Json<serde_json::Value>,
    disposition: Header<'static>,
}
#[rocket::get("/export")]
pub async fn export(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
) -> Result<Export, (Status, Json<serde_json::Value>)> {
    let account = accounts(state)
        .own(&user.0.uid)
        .await
        .map_err(unavailable)?;
    let sessions = state
        .auth
        .sessions(&user.0.uid, jar.get("session").map_or("", |c| c.value()))
        .await
        .map_err(unavailable)?;
    let works: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT * FROM work WHERE owner=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let shares: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT work,can_edit FROM work_share WHERE uid=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let access: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT work,accessed_at FROM work_access WHERE uid=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let artwork: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT uid,purpose,palette,created_at FROM media_asset WHERE owner=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let details: Vec<serde_json::Value> = state.auth.store.rows("SELECT work,revision,value FROM work_details WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let translations: Vec<serde_json::Value> = state.auth.store.rows("SELECT * FROM work_translation WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid) OR value.author=$uid",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let grants: Vec<serde_json::Value> = state.auth.store.rows("SELECT * FROM work_translation_access WHERE uid=$uid OR work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let publications: Vec<serde_json::Value> = state.auth.store.rows("SELECT work,value FROM work_publication WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let chapter_drafts: Vec<serde_json::Value> = state.auth.store.rows("SELECT * FROM chapter_draft WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let chapter_revisions: Vec<serde_json::Value> = state.auth.store.rows("SELECT * FROM chapter_revision WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let reading_state: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT work,chapter,value FROM reader_state WHERE account=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let staged_chapters:Vec<serde_json::Value>=state.auth.store.rows("SELECT work,chapter,value FROM chapter_publication WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let lifecycle:Vec<serde_json::Value>=state.auth.store.rows("SELECT work,value FROM story_lifecycle WHERE work IN (SELECT VALUE uid FROM work WHERE owner=$uid)",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let reading_reports: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT work,chapter,day,completed FROM chapter_visit WHERE viewer=$viewer",
            json!({"viewer":artismaga_auth::digest(&format!("reader-account:{}",user.0.uid))}),
        )
        .await
        .map_err(unavailable)?;
    let comments:Vec<serde_json::Value>=state.auth.store.rows("SELECT uid,work,chapter,parent,body,gif,created_at,revision,deleted FROM chapter_comment WHERE account=$uid",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    let comment_likes: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT comment FROM comment_like WHERE account=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let comment_mutes: Vec<serde_json::Value> = state
        .auth
        .store
        .rows(
            "SELECT target FROM comment_mute WHERE account=$uid",
            json!({"uid":user.0.uid}),
        )
        .await
        .map_err(unavailable)?;
    let notifications:Vec<serde_json::Value>=state.auth.store.rows("SELECT uid,work,chapter,comment,kind,created_at,read FROM notification WHERE account=$uid",json!({"uid":user.0.uid})).await.map_err(unavailable)?;
    Ok(Export {
        body: Json(
            json!({"format_version":8,"comments":comments,"comment_likes":comment_likes,"comment_mutes":comment_mutes,"notifications":notifications,"staged_chapters":staged_chapters,"story_lifecycle":lifecycle,"reading_reports":reading_reports,"reading_state":reading_state,"publications":publications,"chapter_drafts":chapter_drafts,"chapter_revisions":chapter_revisions,"translations":translations,"translation_access":grants,"work_configuration":details,"works":works,"shared_access":shares,"work_access":access,"artwork":artwork,"exported_at":artismaga_auth::now(),"account":account,"sessions":sessions}),
        ),
        disposition: Header::new(
            "Content-Disposition",
            "attachment; filename=artismaga-account.json",
        ),
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Delete {
    current_password: String,
    confirmation: String,
}
#[rocket::post("/delete", data = "<data>")]
pub async fn delete(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    data: Json<Delete>,
) -> ApiResult {
    let data = data.into_inner();
    accounts(state).delete(&state.auth,&user.0.uid,data.current_password,&data.confirmation).await.map_err(|_|error(Status::BadRequest,"Unable to delete account. Check your password and confirmation. The last site administrator cannot be deleted."))?;
    let storage = state.storage.clone();
    rocket::tokio::spawn(async move {
        let _ = storage.cleanup().await;
    });
    jar.remove(Cookie::build("session").path("/").build());
    Ok(Json(
        json!({"message":"Your account and stored preferences have been deleted.","redirect":"/"}),
    ))
}
