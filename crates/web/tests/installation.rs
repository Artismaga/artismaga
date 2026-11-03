//! Run in the integration image on the private database network; no published DB ports.
use artismaga_auth::{Auth, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_render::PageRenderer;
use artismaga_setup::{Installer, SetupRequest, claimed};
use artismaga_web::{
    AppState,
    installation::{self, SetupState},
};
use rocket::{
    http::{ContentType, Header, Status},
    local::asynchronous::Client,
};
use serde_json::{Value, json};

async fn fixture() -> (Config, Auth) {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL required");
    config.database.database = format!("install_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store, config.clone()).unwrap();
    (config, auth)
}
fn request(code: &str) -> Value {
    json!({"setup_code":code,"site_name":"A New Chapter","public_url":"http://localhost:8000","signup_mode":"disabled",
        "admin_email":"owner@example.com","admin_name":"Site Owner","admin_password":"an unusually long test passphrase","mail":null})
}
fn post<'a>(client: &'a Client, body: Value) -> rocket::local::asynchronous::LocalRequest<'a> {
    client
        .post("/api/setup")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Host", "localhost:8000"))
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(body.to_string())
}
#[rocket::async_test]
#[ignore = "requires private disposable SurrealDB; see docs/testing.md"]
async fn visual_installation_is_authorized_single_use_persistent_and_recoverable() {
    let (config, auth) = fixture().await;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("config.toml");
    let code_path = temp.path().join("code");
    let installer = Installer::new(auth.clone(), config.clone(), path.clone(), &code_path).unwrap();
    let code = std::fs::read_to_string(&code_path).unwrap();
    let renderer = PageRenderer::new(&config).unwrap();
    let client = Client::tracked(installation::build(SetupState::new(
        installer,
        renderer.clone(),
    )))
    .await
    .unwrap();
    assert_eq!(client.get("/").dispatch().await.status(), Status::SeeOther);
    let html = client
        .get("/setup")
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(html.contains("setup-form") && !html.contains(&code));
    assert_eq!(
        client.get("/account/login").dispatch().await.status(),
        Status::NotFound
    );
    assert_eq!(
        client.post("/api/auth/register").dispatch().await.status(),
        Status::NotFound
    );
    assert_eq!(
        client
            .post("/api/setup")
            .header(ContentType::JSON)
            .body(request(&code).to_string())
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    let response = client
        .post("/api/setup")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Host", "localhost:8000"))
        .header(Header::new("Origin", "https://evil.example"))
        .header(ContentType::JSON)
        .body(request(&code).to_string())
        .dispatch()
        .await;
    assert_eq!(response.status(), Status::Forbidden);
    assert_eq!(
        post(&client, request("wrong")).dispatch().await.status(),
        Status::Forbidden
    );
    let mut weak = request(&code);
    weak["admin_password"] = json!("short");
    assert_eq!(
        post(&client, weak).dispatch().await.status(),
        Status::BadRequest
    );
    assert!(!path.exists());
    assert!(!claimed(&auth).await.unwrap());
    let mut public_without_mail = request(&code);
    public_without_mail["public_url"] = json!("https://stories.example");
    assert_eq!(
        post(&client, public_without_mail).dispatch().await.status(),
        Status::BadRequest
    );
    let (one, two) = rocket::tokio::join!(
        post(&client, request(&code)).dispatch(),
        post(&client, request(&code)).dispatch()
    );
    assert_eq!(
        [one.status(), two.status()]
            .into_iter()
            .filter(|s| *s == Status::Ok)
            .count(),
        1
    );
    assert!(claimed(&auth).await.unwrap());
    assert_eq!(auth.signup_mode().await.unwrap(), SignupMode::Disabled);
    assert_eq!(
        post(&client, request(&code)).dispatch().await.status(),
        Status::Conflict
    );
    let saved = Config::load(&path).unwrap();
    assert_eq!(saved.site_name, "A New Chapter");
    let file = std::fs::read_to_string(&path).unwrap();
    assert!(!file.contains("an unusually long test passphrase") && !file.contains(&code));
    let (owner, _) = auth
        .login(
            "owner@example.com".into(),
            "an unusually long test passphrase".into(),
        )
        .await
        .unwrap();
    assert_eq!(owner.display_name, "Site Owner");
    assert!(owner.email_verified);
    // Restarted configured servers do not mount the installer, regardless of the old setup code.
    let normal = Client::tracked(artismaga_web::build(AppState::new(
        auth.clone(),
        saved.clone(),
        renderer.with_site(&saved),
    )))
    .await
    .unwrap();
    assert_eq!(
        normal.get("/setup").dispatch().await.status(),
        Status::NotFound
    );
    assert_eq!(
        post(&normal, request(&code)).dispatch().await.status(),
        Status::NotFound
    );
    let html = normal
        .get("/")
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(html.contains("A New Chapter"));
    // The marker closes setup even if every administrator record is later removed.
    auth.store.query("DELETE account", json!({})).await.unwrap();
    assert!(claimed(&auth).await.unwrap());
    assert!(
        auth.install(
            "replacement@example.com".into(),
            "Replacement".into(),
            "another long test passphrase".into(),
            SignupMode::Open
        )
        .await
        .is_err()
    );
    renderer.shutdown().await;
    // A configuration file staged before an interrupted DB transaction is retryable.
    let (config, auth) = fixture().await;
    let recovery_path = temp.path().join("recovery.toml");
    config.save(&recovery_path).unwrap();
    let installer =
        Installer::new(auth.clone(), config, recovery_path.clone(), &code_path).unwrap();
    let value: SetupRequest = serde_json::from_value(request(&code)).unwrap();
    installer.complete(value).await.unwrap();
    assert!(claimed(&auth).await.unwrap());
    assert_eq!(
        Config::load(&recovery_path).unwrap().site_name,
        "A New Chapter"
    );
}
