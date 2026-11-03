//! Explicit opt-in integration test: requires an isolated SurrealDB and the React worker.
use artismaga_auth::{Auth, digest, now, token};
use artismaga_config::Config;
use artismaga_core::{Permission, SignupMode};
use artismaga_db::Store;
use artismaga_render::PageRenderer;
use artismaga_web::{AppState, build};
use rocket::{
    http::{ContentType, Header, Status},
    local::asynchronous::Client,
};
use serde_json::json;

#[rocket::async_test]
#[ignore = "requires private disposable SurrealDB; see docs/testing.md"]
async fn foundation_end_to_end() {
    let mut config = Config::load("../../config/example.toml").unwrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL required");
    config.database.username = None;
    config.database.password = None;
    config.database.database = format!("test_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "a sufficiently long test password".to_string();
    auth.bootstrap_admin("admin@example.com".into(), password.clone())
        .await
        .unwrap();
    assert!(
        auth.bootstrap_admin("second@example.com".into(), password.clone())
            .await
            .is_err()
    );
    assert_eq!(auth.signup_mode().await.unwrap(), SignupMode::Invitation);
    assert!(
        auth.register(
            "reader@example.com".into(),
            "Reader".into(),
            password.clone(),
            None
        )
        .await
        .is_err()
    );
    let invite = auth.invite().await.unwrap();
    let (first, second) = rocket::tokio::join!(
        auth.register(
            "reader@example.com".into(),
            "<script>Reader</script>".into(),
            password.clone(),
            Some(invite.clone())
        ),
        auth.register(
            "racer@example.com".into(),
            "Racer".into(),
            password.clone(),
            Some(invite)
        )
    );
    assert_ne!(
        first.is_ok(),
        second.is_ok(),
        "one invitation may create exactly one account"
    );
    let reader_email = if first.is_ok() {
        "reader@example.com"
    } else {
        "racer@example.com"
    };
    assert!(
        auth.login(reader_email.into(), "wrong".into())
            .await
            .is_err()
    );
    let (reader, session) = auth
        .login(reader_email.into(), password.clone())
        .await
        .unwrap();
    assert!(auth.current(&session).await.unwrap().is_some());
    assert!(!auth.allowed(&reader, Permission::Administer).await.unwrap());
    assert!(!auth.allowed(&reader, Permission::Comment).await.unwrap());
    let expired_session = token();
    store
        .query(
            "CREATE session SET token_hash = $hash, uid = $uid, expires_at = $expiry",
            json!({"hash":digest(&expired_session),"uid":reader.uid,"expiry":now()-1}),
        )
        .await
        .unwrap();
    assert!(auth.current(&expired_session).await.unwrap().is_none());
    let expired_verify = token();
    store.query("CREATE account_token SET token_hash = $hash, uid = $uid, purpose = 'verify', expires_at = $expiry",json!({"hash":digest(&expired_verify),"uid":reader.uid,"expiry":now()-1})).await.unwrap();
    assert!(
        auth.consume_account_token(expired_verify, "verify", None)
            .await
            .is_err()
    );
    let rollback_invite = auth.invite().await.unwrap();
    assert!(
        auth.register(
            reader_email.into(),
            "Duplicate".into(),
            password.clone(),
            Some(rollback_invite.clone())
        )
        .await
        .is_err()
    );
    auth.register(
        "rollback@example.com".into(),
        "2026-10-28T00:00:00Z".into(),
        password.clone(),
        Some(rollback_invite),
    )
    .await
    .unwrap();
    assert_eq!(
        store
            .by_email("rollback@example.com")
            .await
            .unwrap()
            .unwrap()
            .display_name,
        "2026-10-28T00:00:00Z"
    );
    let verify = token();
    store.query("CREATE account_token SET token_hash = $hash, uid = $uid, purpose = 'verify', expires_at = $expiry",json!({"hash":digest(&verify),"uid":reader.uid,"expiry":now()+60})).await.unwrap();
    auth.consume_account_token(verify.clone(), "verify", None)
        .await
        .unwrap();
    assert!(
        auth.consume_account_token(verify, "verify", None)
            .await
            .is_err()
    );
    let verified = auth.current(&session).await.unwrap().unwrap();
    assert!(verified.email_verified);
    assert!(auth.allowed(&verified, Permission::Comment).await.unwrap());
    let reset = token();
    store.query("CREATE account_token SET token_hash = $hash, uid = $uid, purpose = 'reset', expires_at = $expiry",json!({"hash":digest(&reset),"uid":reader.uid,"expiry":now()+60})).await.unwrap();
    let replacement = "a different sufficiently long password".to_string();
    auth.consume_account_token(reset.clone(), "reset", Some(replacement.clone()))
        .await
        .unwrap();
    assert!(auth.current(&session).await.unwrap().is_none());
    assert!(
        auth.consume_account_token(reset, "reset", Some(replacement.clone()))
            .await
            .is_err()
    );
    assert!(
        auth.login(reader_email.into(), password.clone())
            .await
            .is_err()
    );
    let (_, new_session) = auth.login(reader_email.into(), replacement).await.unwrap();
    auth.revoke_all(&reader.uid).await.unwrap();
    assert!(auth.current(&new_session).await.unwrap().is_none());
    // Query values cannot escape into SurrealQL.
    assert!(
        store
            .by_email("'; DELETE account; --")
            .await
            .unwrap()
            .is_none()
    );
    assert!(store.by_email("admin@example.com").await.unwrap().is_some());
    let renderer = PageRenderer::new(&config).unwrap();
    let html = renderer
        .page("home", None, SignupMode::Invitation, false)
        .await
        .unwrap();
    assert!(!html.contains(">Featured / recommended stories<"));
    assert!(html.contains(">Popular<"));
    let client = Client::tracked(build(AppState::new(auth.clone(), config, renderer)))
        .await
        .unwrap();
    let response = client.get("/").dispatch().await;
    assert_eq!(response.status(), Status::Ok);
    assert!(
        response
            .into_string()
            .await
            .unwrap()
            .contains("<!doctype html>")
    );
    let response = client
        .post("/api/auth/login")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(json!({"email":"admin@example.com","password":password}).to_string())
        .dispatch()
        .await;
    assert_eq!(response.status(), Status::Ok);
    let cookie = response.headers().get_one("Set-Cookie").unwrap();
    assert!(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"));
    let response = client
        .post("/api/admin/settings")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(r#"{"signup_mode":"disabled"}"#)
        .dispatch()
        .await;
    assert_eq!(response.status(), Status::Ok);
    assert!(
        auth.register(
            "closed@example.com".into(),
            "Closed".into(),
            "long enough test password".into(),
            None
        )
        .await
        .is_err()
    );
    store
        .query(
            "UPDATE site_settings:main SET signup_mode = 'open'",
            json!({}),
        )
        .await
        .unwrap();
    auth.register(
        "open@example.com".into(),
        "Open".into(),
        "long enough test password".into(),
        None,
    )
    .await
    .unwrap();
    assert!(
        auth.register(
            "OPEN@example.com".into(),
            "Duplicate".into(),
            "long enough test password".into(),
            None
        )
        .await
        .is_err()
    );
    let response = client
        .post("/api/auth/logout")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .dispatch()
        .await;
    assert_eq!(response.status(), Status::Ok);
    assert_eq!(
        client.get("/api/auth/me").dispatch().await.status(),
        Status::Unauthorized
    );
}
