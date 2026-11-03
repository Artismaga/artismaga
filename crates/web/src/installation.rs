//! Unconfigured-site HTTP surface. Account and administration APIs are not mounted here.
use crate::{
    ApiResult, SecurityHeaders, catcher, client_js, error, security::RateLimiter, theme_css,
};
use artismaga_config::setup_origin_matches;
use artismaga_core::SignupMode;
use artismaga_render::PageRenderer;
use artismaga_setup::{Installer, SetupRequest};
use rocket::{
    Request, Shutdown, State,
    http::Status,
    request::{FromRequest, Outcome},
    response::Redirect,
    serde::json::Json,
};
use serde_json::json;
use std::sync::Arc;

pub struct SetupState {
    pub installer: Arc<Installer>,
    pub renderer: PageRenderer,
    limiter: RateLimiter,
}
impl SetupState {
    pub fn new(installer: Installer, renderer: PageRenderer) -> Self {
        Self {
            installer: Arc::new(installer),
            renderer,
            limiter: RateLimiter::default(),
        }
    }
}
struct SetupMutation;
#[rocket::async_trait]
impl<'r> FromRequest<'r> for SetupMutation {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, ()> {
        let origins: Vec<_> = req.headers().get("Origin").collect();
        let hosts: Vec<_> = req.headers().get("Host").collect();
        if origins.len() != 1 || hosts.len() != 1 || !setup_origin_matches(origins[0], hosts[0]) {
            return Outcome::Error((Status::Forbidden, ()));
        }
        let Some(state) = req.rocket().state::<SetupState>() else {
            return Outcome::Error((Status::InternalServerError, ()));
        };
        let Some(ip) = req.remote().map(|r| r.ip()) else {
            return Outcome::Error((Status::BadRequest, ()));
        };
        match state.limiter.check(ip) {
            Ok(()) => Outcome::Success(Self),
            Err(status) => Outcome::Error((status, ())),
        }
    }
}
#[rocket::get("/")]
fn home() -> Redirect {
    Redirect::to("/setup")
}
#[rocket::get("/setup?<locale>")]
async fn page(
    state: &State<SetupState>,
    locale: Option<&str>,
    jar: &rocket::http::CookieJar<'_>,
) -> Result<crate::pages::PageResponse, Status> {
    let locale = locale
        .filter(|l| artismaga_localisation::valid_locale(l))
        .unwrap_or("en");
    jar.add(
        rocket::http::Cookie::build(("locale", locale.to_owned()))
            .path("/")
            .http_only(true)
            .same_site(rocket::http::SameSite::Lax),
    );
    let messages: std::collections::BTreeMap<_, _> = artismaga_localisation::builtins()
        .map_err(|_| Status::ServiceUnavailable)?
        .into_iter()
        .filter_map(|d| d.defaults.get(locale).cloned().map(|t| (d.key, t)))
        .collect();
    let nonce = artismaga_auth::token();
    let html = state
        .renderer
        .page_data(
            "setup",
            None,
            SignupMode::Disabled,
            false,
            json!({"styleNonce":nonce,"localisation":{"locale":locale,"source_locale":"en","enabled":artismaga_localisation::LOCALES,"messages":messages,"preview":false}}),
        )
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    Ok(crate::pages::response(html, &nonce))
}
#[rocket::get("/health/live")]
fn live() -> Json<serde_json::Value> {
    Json(json!({"status":"ok"}))
}
#[rocket::get("/health/ready")]
async fn ready(state: &State<SetupState>) -> ApiResult {
    state
        .installer
        .auth
        .signup_mode()
        .await
        .map_err(crate::unavailable)?;
    state
        .renderer
        .page("setup", None, SignupMode::Disabled, false)
        .await
        .map_err(crate::unavailable)?;
    Ok(Json(json!({"status":"setup_required"})))
}
#[rocket::post("/api/setup", data = "<request>")]
async fn complete(
    _guard: SetupMutation,
    state: &State<SetupState>,
    shutdown: Shutdown,
    request: Json<SetupRequest>,
) -> ApiResult {
    let request = request.into_inner();
    if !state.installer.authorized(&request.setup_code) {
        return Err(error(
            Status::Forbidden,
            "The setup code is incorrect. Retrieve it from the running app.",
        ));
    }
    if state
        .installer
        .claimed()
        .await
        .map_err(crate::unavailable)?
    {
        return Err(error(
            Status::Conflict,
            "This site has already been configured.",
        ));
    }
    state.installer.complete(request).await.map_err(|_|error(Status::BadRequest,"Setup could not be completed. Check your website address, administrator details, password length, and email settings. Your installation can be retried."))?;
    rocket::tokio::spawn(async move {
        // Allow the successful response to reach the browser before handing over the listener.
        rocket::tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        shutdown.notify();
    });
    Ok(Json(
        json!({"message":"Your site is ready. Opening sign in…"}),
    ))
}
pub fn build(state: SetupState) -> rocket::Rocket<rocket::Build> {
    use rocket::data::{Limits, ToByteUnit};
    let figment =
        rocket::Config::figment().merge(("limits", Limits::new().limit("json", 16.kibibytes())));
    rocket::custom(figment)
        .manage(state)
        .attach(SecurityHeaders)
        .mount(
            "/",
            rocket::routes![home, page, live, ready, complete, client_js, theme_css],
        )
        .register("/", rocket::catchers![catcher])
}
