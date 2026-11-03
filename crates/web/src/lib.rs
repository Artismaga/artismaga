//! Rocket routes, transport guards, request limits, and security headers.
mod account;
mod administration;
mod analytics;
mod community;
mod discovery;
pub mod installation;
mod localisation;
mod pages;
mod reaction_assets;
mod reader;
mod security;
mod studio;
mod vocabulary;
use security::RateLimiter;

use artismaga_auth::{Auth, SESSION_SECONDS};
use artismaga_config::Config;
use artismaga_core::{Permission, SignupMode};
use artismaga_db::Account;
use artismaga_render::PageRenderer;
use rocket::{
    Request, Response, State,
    fairing::{Fairing, Info, Kind},
    http::{Cookie, CookieJar, Header, SameSite, Status},
    request::{FromRequest, Outcome},
    serde::json::Json,
};
use serde::Deserialize;
use serde_json::{Value, json};

pub struct AppState {
    pub metrics: analytics::Metrics,
    pub auth: Auth,
    pub config: Config,
    pub renderer: PageRenderer,
    pub storage: artismaga_storage::Storage,
    pub translator: artismaga_localisation::translation::Translator,
    limiter: RateLimiter,
    writing_limiter: security::WritingRateLimiter,
    upload_slots: std::sync::Arc<tokio::sync::Semaphore>,
}
impl AppState {
    pub fn new(auth: Auth, config: Config, renderer: PageRenderer) -> Self {
        let storage =
            artismaga_storage::Storage::new(auth.store.clone(), artismaga_config::data_dir());
        Self {
            metrics: analytics::Metrics::default(),
            translator: artismaga_localisation::translation::Translator::new(
                auth.store.clone(),
                artismaga_config::data_dir(),
            ),
            storage,
            auth,
            config,
            renderer,
            limiter: RateLimiter::default(),
            writing_limiter: security::WritingRateLimiter::default(),
            upload_slots: std::sync::Arc::new(tokio::sync::Semaphore::new(2)),
        }
    }
    pub fn with_storage_root(mut self, root: std::path::PathBuf) -> Self {
        self.translator = artismaga_localisation::translation::Translator::new(
            self.auth.store.clone(),
            root.clone(),
        );
        self.storage = artismaga_storage::Storage::new(self.auth.store.clone(), root);
        self
    }
}
type ApiResult = Result<Json<Value>, (Status, Json<Value>)>;
fn error(status: Status, message: &str) -> (Status, Json<Value>) {
    (status, Json(json!({"error":message})))
}
fn unavailable(_: anyhow::Error) -> (Status, Json<Value>) {
    error(
        Status::ServiceUnavailable,
        "Service temporarily unavailable",
    )
}

struct Mutation;
#[rocket::async_trait]
impl<'r> FromRequest<'r> for Mutation {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, ()> {
        let Some(state) = req.rocket().state::<AppState>() else {
            return Outcome::Error((Status::InternalServerError, ()));
        };
        // Reject missing, multiple, null, and foreign Origin values. JSON clients must send Origin too.
        let origins: Vec<_> = req.headers().get("Origin").collect();
        if origins != [state.config.public_url.as_str()] {
            return Outcome::Error((Status::Forbidden, ()));
        }
        // Direct peer only: untrusted forwarding headers cannot bypass throttling.
        let Some(ip) = req.remote().map(|r| r.ip()) else {
            return Outcome::Error((Status::BadRequest, ()));
        };
        if let Err(status) = state.limiter.check(ip) {
            return Outcome::Error((status, ()));
        }
        Outcome::Success(Mutation)
    }
}
/// Same-origin authenticated writing uses a separate per-account autosave budget.
struct WritingMutation;
#[rocket::async_trait]
impl<'r> FromRequest<'r> for WritingMutation {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, ()> {
        let Some(state) = req.rocket().state::<AppState>() else {
            return Outcome::Error((Status::InternalServerError, ()));
        };
        if req.headers().get("Origin").collect::<Vec<_>>() != [state.config.public_url.as_str()] {
            return Outcome::Error((Status::Forbidden, ()));
        }
        if req.remote().is_none() {
            return Outcome::Error((Status::BadRequest, ()));
        }
        let user = match req.guard::<SignedIn>().await {
            Outcome::Success(user) => user,
            _ => return Outcome::Error((Status::Unauthorized, ())),
        };
        match state.writing_limiter.check(&user.0.uid) {
            Ok(()) => Outcome::Success(Self),
            Err(status) => Outcome::Error((status, ())),
        }
    }
}
/// Reading measurements retain Origin validation and a bounded per-account/device budget.
struct ReaderMutation;
#[rocket::async_trait]
impl<'r> FromRequest<'r> for ReaderMutation {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, ()> {
        let Some(state) = req.rocket().state::<AppState>() else {
            return Outcome::Error((Status::ServiceUnavailable, ()));
        };
        if req.headers().get("Origin").collect::<Vec<_>>() != [state.config.public_url.as_str()] {
            return Outcome::Error((Status::Forbidden, ()));
        }
        let Some(peer) = req.remote() else {
            return Outcome::Error((Status::BadRequest, ()));
        };
        let key = match req.guard::<SignedIn>().await {
            Outcome::Success(user) => user.0.uid,
            _ => format!("reader:{}", peer.ip()),
        };
        match state.writing_limiter.check(&key) {
            Ok(()) => Outcome::Success(Self),
            Err(s) => Outcome::Error((s, ())),
        }
    }
}
/// Informational coarse label only; raw user agents and IPs are not persisted.
struct DeviceLabel(String);
#[rocket::async_trait]
impl<'r> FromRequest<'r> for DeviceLabel {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, ()> {
        let ua = req.headers().get_one("User-Agent").unwrap_or("");
        let browser = if ua.contains("Edg/") {
            "Edge"
        } else if ua.contains("Firefox/") {
            "Firefox"
        } else if ua.contains("Chrome/") {
            "Chrome"
        } else if ua.contains("Safari/") {
            "Safari"
        } else {
            "Browser"
        };
        let platform = if ua.contains("Android") {
            "Android"
        } else if ua.contains("iPhone") || ua.contains("iPad") {
            "iOS"
        } else if ua.contains("Windows") {
            "Windows"
        } else if ua.contains("Macintosh") {
            "macOS"
        } else if ua.contains("Linux") {
            "Linux"
        } else {
            "unknown platform"
        };
        Outcome::Success(Self(format!("{browser} on {platform}")))
    }
}
struct SignedIn(Account);
#[rocket::async_trait]
impl<'r> FromRequest<'r> for SignedIn {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, ()> {
        let Some(state) = req.rocket().state::<AppState>() else {
            return Outcome::Error((Status::InternalServerError, ()));
        };
        let Some(cookie) = req.cookies().get("session") else {
            return Outcome::Error((Status::Unauthorized, ()));
        };
        match state.auth.current(cookie.value()).await {
            Ok(Some(account)) => Outcome::Success(SignedIn(account)),
            Ok(None) => Outcome::Error((Status::Unauthorized, ())),
            Err(_) => Outcome::Error((Status::ServiceUnavailable, ())),
        }
    }
}
async fn admin(state: &AppState, user: &Account) -> Result<(), (Status, Json<Value>)> {
    if !state
        .auth
        .allowed(user, Permission::Administer)
        .await
        .map_err(unavailable)?
    {
        return Err(error(
            Status::Forbidden,
            "Administrator permission required",
        ));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Register {
    email: String,
    display_name: String,
    password: String,
    invitation: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    email: String,
    password: String,
}
#[rocket::post("/register", data = "<data>")]
async fn register(_mutation: Mutation, state: &State<AppState>, data: Json<Register>) -> ApiResult {
    let data = data.into_inner();
    state.auth.register(data.email,data.display_name,data.password,data.invitation).await
        .map_err(|_|error(Status::BadRequest,"Could not create account. Check the details, password length (15–128 characters), signup policy and invitation."))?;
    Ok(Json(
        json!({"message":"Account created. Sign in and request email verification from your account page."}),
    ))
}
#[rocket::post("/login", data = "<data>")]
async fn login(
    _mutation: Mutation,
    device: DeviceLabel,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    data: Json<Login>,
) -> ApiResult {
    let data = data.into_inner();
    let (user, raw) = state
        .auth
        .login_device(data.email, data.password, device.0)
        .await
        .map_err(|_| error(Status::Unauthorized, "Invalid email or password"))?;
    if let Some(old) = jar.get("session") {
        state.auth.logout(old.value()).await.map_err(unavailable)?;
    }
    jar.add(
        Cookie::build(("session", raw))
            .path("/")
            .http_only(true)
            .secure(state.config.secure_cookies)
            .same_site(SameSite::Strict)
            .max_age(rocket::time::Duration::seconds(SESSION_SECONDS))
            .build(),
    );
    Ok(Json(json!({"user":user.public()})))
}
#[rocket::post("/logout")]
async fn logout(_mutation: Mutation, state: &State<AppState>, jar: &CookieJar<'_>) -> ApiResult {
    if let Some(cookie) = jar.get("session") {
        state
            .auth
            .logout(cookie.value())
            .await
            .map_err(unavailable)?;
    }
    jar.remove(Cookie::build("session").path("/").build());
    Ok(Json(json!({"message":"Signed out"})))
}
#[rocket::get("/me")]
fn me(user: SignedIn) -> Json<Value> {
    Json(json!({"user":user.0.public()}))
}
#[rocket::post("/sessions/revoke")]
async fn revoke(
    _mutation: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
) -> ApiResult {
    state
        .auth
        .revoke_all(&user.0.uid)
        .await
        .map_err(unavailable)?;
    jar.remove(Cookie::build("session").path("/").build());
    Ok(Json(json!({"message":"All sessions revoked"})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmailRequest {
    email: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TokenRequest {
    token: String,
    password: Option<String>,
}
#[rocket::post("/email/<purpose>/request", data = "<data>")]
async fn request_token(
    _mutation: Mutation,
    state: &State<AppState>,
    purpose: &str,
    data: Json<EmailRequest>,
) -> ApiResult {
    if !matches!(purpose, "verify" | "reset") {
        return Err(error(Status::NotFound, "Unknown operation"));
    }
    if !state.auth.mail_enabled() {
        return Err(error(
            Status::ServiceUnavailable,
            "Email delivery has not been configured by the site operator",
        ));
    }
    state
        .auth
        .queue_account_token(data.into_inner().email, purpose.to_string())
        .map_err(|_| {
            error(
                Status::TooManyRequests,
                "Email delivery is busy; try again shortly",
            )
        })?;
    Ok(Json(
        json!({"message":"If the account is eligible, an email will arrive shortly."}),
    ))
}
#[rocket::post("/email/<purpose>/confirm", data = "<data>")]
async fn confirm_token(
    _mutation: Mutation,
    state: &State<AppState>,
    purpose: &str,
    data: Json<TokenRequest>,
) -> ApiResult {
    let data = data.into_inner();
    state
        .auth
        .consume_account_token(data.token, purpose, data.password)
        .await
        .map_err(|_| {
            error(
                Status::BadRequest,
                "Invalid or expired link, or password shorter than 15 characters",
            )
        })?;
    Ok(Json(json!({"message":"Account updated. You can sign in."})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Policy {
    signup_mode: SignupMode,
}
#[rocket::get("/settings")]
async fn settings(user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    Ok(Json(
        json!({"signup_mode":state.auth.signup_mode().await.map_err(unavailable)?}),
    ))
}
#[rocket::post("/settings", data = "<data>")]
async fn set_settings(
    _mutation: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    data: Json<Policy>,
) -> ApiResult {
    admin(state, &user.0).await?;
    let mut configuration = administration::service(state)
        .configuration()
        .await
        .map_err(unavailable)?;
    configuration.configuration.signup_mode = data.signup_mode;
    administration::service(state)
        .save(configuration)
        .await
        .map_err(unavailable)?;
    Ok(Json(json!({"message":"Signup policy updated"})))
}
#[rocket::post("/invitations")]
async fn invite(_mutation: Mutation, user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    Ok(Json(
        json!({"invitation":state.auth.invite().await.map_err(unavailable)?,"expires_in_days":7}),
    ))
}
#[rocket::get("/groups")]
async fn groups(user: SignedIn, state: &State<AppState>) -> ApiResult {
    admin(state, &user.0).await?;
    let groups: Vec<artismaga_core::PermissionGroup> = state
        .auth
        .store
        .rows("SELECT * FROM permission_group", json!({}))
        .await
        .map_err(unavailable)?;
    Ok(Json(json!({"groups":groups})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AssignGroup {
    group_key: String,
}
#[rocket::post("/users/<uid>/group", data = "<data>")]
async fn assign_group(
    _mutation: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    data: Json<AssignGroup>,
) -> ApiResult {
    admin(state, &user.0).await?;
    // Preserve the administrator's own access; multi-admin invariants can grow here later.
    if uid == user.0.uid {
        return Err(error(
            Status::BadRequest,
            "You cannot change your own permission group",
        ));
    }
    state
        .auth
        .store
        .query(
            artismaga_db::queries::ASSIGN_GROUP,
            json!({"uid":uid,"group":data.group_key}),
        )
        .await
        .map_err(|_| error(Status::BadRequest, "Unknown account or group"))?;
    Ok(Json(json!({"message":"Permission group updated"})))
}
#[rocket::get("/health/live")]
fn live() -> Json<Value> {
    Json(json!({"status":"ok"}))
}
#[rocket::get("/health/ready")]
async fn ready(state: &State<AppState>) -> ApiResult {
    state.auth.signup_mode().await.map_err(unavailable)?;
    state
        .renderer
        .page("home", None, SignupMode::Disabled, false)
        .await
        .map_err(unavailable)?;
    Ok(Json(json!({"status":"ready"})))
}
#[rocket::get("/")]
async fn home(state: &State<AppState>, jar: &CookieJar<'_>) -> Result<pages::PageResponse, Status> {
    pages::render(state, jar, "home").await
}
#[rocket::get("/account/<page>")]
async fn account_page(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    page: &str,
) -> Result<pages::PageResponse, Status> {
    if !matches!(
        page,
        "login" | "register" | "profile" | "settings" | "verify" | "reset" | "email" | "admin"
    ) {
        return Err(Status::NotFound);
    }
    pages::render(state, jar, page).await
}
#[rocket::get("/admin")]
async fn dashboard(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
) -> Result<pages::PageResponse, Status> {
    admin(state, &user.0).await.map_err(|e| e.0)?;
    pages::render(state, jar, "admin").await
}
#[rocket::get("/account/settings/<section>")]
async fn account_section(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    section: &str,
) -> Result<pages::PageResponse, Status> {
    if ![
        "profile",
        "account",
        "reading",
        "content",
        "notifications",
        "privacy",
        "accessibility",
    ]
    .contains(&section)
    {
        return Err(Status::NotFound);
    }
    pages::render_tab(state, jar, "settings", section, None).await
}
#[rocket::get("/admin/identity/<panel>")]
async fn identity_section(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    panel: &str,
) -> Result<pages::PageResponse, Status> {
    admin(state, &user.0).await.map_err(|e| e.0)?;
    if !["site", "themes"].contains(&panel) {
        return Err(Status::NotFound);
    }
    pages::render_tab(state, jar, "admin", &format!("identity/{panel}"), None).await
}
#[rocket::get("/admin/<section>")]
async fn admin_section(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    section: &str,
) -> Result<pages::PageResponse, Status> {
    if section == "localisation" {
        if !state
            .auth
            .allowed(&user.0, Permission::ConfigureLocalisation)
            .await
            .map_err(|_| Status::ServiceUnavailable)?
        {
            return Err(Status::Forbidden);
        }
    } else if section == "announcements" {
        if !state
            .auth
            .allowed(&user.0, Permission::ManageAnnouncements)
            .await
            .map_err(|_| Status::ServiceUnavailable)?
        {
            return Err(Status::Forbidden);
        }
    } else {
        admin(state, &user.0).await.map_err(|e| e.0)?;
    }
    if ![
        "overview",
        "configuration",
        "people",
        "roles",
        "storage",
        "comments",
        "taxonomy",
        "localisation",
        "identity",
        "announcements",
    ]
    .contains(&section)
    {
        return Err(Status::NotFound);
    }
    pages::render_tab(
        state,
        jar,
        "admin",
        if section == "storage" {
            "configuration"
        } else {
            section
        },
        None,
    )
    .await
}
#[rocket::get("/assets/client.js")]
fn client_js() -> (rocket::http::ContentType, &'static str) {
    (
        rocket::http::ContentType::JavaScript,
        include_str!("../../../web/dist/client.js"),
    )
}
#[rocket::get("/assets/theme.css")]
fn theme_css() -> (rocket::http::ContentType, &'static str) {
    (
        rocket::http::ContentType::CSS,
        include_str!("../../../web/dist/client.css"),
    )
}
#[rocket::catch(default)]
fn catcher(status: Status, _: &Request<'_>) -> Json<Value> {
    Json(json!({"error":status.reason_lossy()}))
}
struct SecurityHeaders;
#[rocket::async_trait]
impl Fairing for SecurityHeaders {
    fn info(&self) -> Info {
        Info {
            name: "Security headers",
            kind: Kind::Response,
        }
    }
    async fn on_response<'r>(&self, _: &'r Request<'_>, response: &mut Response<'r>) {
        for (name, value) in [
            (
                "Content-Security-Policy",
                "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://www.gravatar.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
            ),
            ("X-Content-Type-Options", "nosniff"),
            ("Referrer-Policy", "no-referrer"),
            ("Cache-Control", "no-store"),
            (
                "Permissions-Policy",
                "camera=(), microphone=(), geolocation=()",
            ),
        ] {
            if name != "Content-Security-Policy" || !response.headers().contains(name) {
                response.set_header(Header::new(name, value));
            }
        }
    }
}
pub fn build(state: AppState) -> rocket::Rocket<rocket::Build> {
    use rocket::data::{Limits, ToByteUnit};
    let figment =
        rocket::Config::figment().merge(("limits", Limits::new().limit("json", 1.mebibytes())));
    rocket::custom(figment)
        .manage(state)
        .attach(SecurityHeaders)
        .attach(analytics::Monitor)
        .mount(
            "/",
            rocket::routes![
                home,
                account_page,
                account_section,
                admin_section,
                identity_section,
                analytics::page,
                analytics::section,
                analytics::live,
                reader::page,
                reader::worker,
                reader::image,
                reader::speech_asset,
                discovery::genre_art,
                discovery::genre,
                discovery::story,
                studio::catalogue,
                studio::new_work,
                studio::work,
                studio::work_section,
                studio::chapter_editor,
                studio::upload,
                studio::media,
                studio::default_cover,
                studio::noise,
                vocabulary::vocabulary,
                vocabulary::suggestions,
                localisation::select,
                localisation::edit,
                localisation::settings,
                localisation::preview,
                localisation::translation,
                localisation::translate_key,
                localisation::runtime,
                dashboard,
                live,
                ready,
                client_js,
                theme_css
            ],
        )
        .mount(
            "/api/auth",
            rocket::routes![
                register,
                login,
                logout,
                me,
                revoke,
                request_token,
                confirm_token
            ],
        )
        .mount(
            "/api/admin",
            rocket::routes![
                settings,
                set_settings,
                invite,
                groups,
                assign_group,
                administration::configuration,
                administration::announcements,
                administration::save_announcement,
                administration::identity_keys,
                administration::save,
                administration::users,
                administration::roles,
                administration::save_role,
                administration::delete_role,
                administration::storage,
                administration::save_storage,
                vocabulary::save
            ],
        )
        .mount(
            "/api",
            rocket::routes![
                community::list,
                community::command,
                community::inbox,
                community::inbox_command,
                community::configure,
                community::search,
                community::gif,
                reader::own,
                reader::save,
                reader::publish,
                reader::configure,
                reader::measure,
                reader::stats,
                reader::status
            ],
        )
        .mount(
            "/api/studio",
            rocket::routes![
                discovery::publish,
                discovery::unpublish,
                discovery::feature,
                discovery::hide,
                studio::create,
                studio::update,
                studio::share,
                studio::people,
                studio::details,
                studio::change_details,
                studio::chapter_draft,
                studio::save_chapter,
                studio::chapter_history,
                studio::chapter_revision,
                studio::restore_chapter,
                studio::translations,
                studio::save_translation,
                studio::translation_access,
                studio::translation_source,
                studio::translate_content
            ],
        )
        .mount(
            "/api/account",
            rocket::routes![
                account::own,
                account::profile,
                account::preferences,
                account::password,
                account::email,
                account::sessions,
                account::revoke_session,
                account::export,
                account::delete
            ],
        )
        .register("/", rocket::catchers![catcher])
}

#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> AppState {
        let config: Config = artismaga_config::Config::load("../../config/example.toml").unwrap();
        let store = artismaga_db::Store::new(config.database.clone()).unwrap();
        AppState::new(
            Auth::new(store, config.clone()).unwrap(),
            config.clone(),
            PageRenderer::new(&config).unwrap(),
        )
    }
    #[rocket::async_test]
    async fn csrf_auth_and_headers_fail_closed_without_database() {
        let client = rocket::local::asynchronous::Client::tracked(build(state()))
            .await
            .unwrap();
        let response = client.post("/api/auth/logout").dispatch().await;
        assert_eq!(response.status(), Status::Forbidden);
        let response = client
            .post("/api/auth/logout")
            .header(Header::new("Origin", "https://evil.example"))
            .dispatch()
            .await;
        assert_eq!(response.status(), Status::Forbidden);
        assert_eq!(
            client.get("/api/auth/me").dispatch().await.status(),
            Status::Unauthorized
        );
        let response = client.get("/health/live").dispatch().await;
        assert_eq!(response.status(), Status::Ok);
        assert_eq!(
            response.headers().get_one("Cache-Control"),
            Some("no-store")
        );
        assert!(response.headers().contains("Content-Security-Policy"));
    }
}
