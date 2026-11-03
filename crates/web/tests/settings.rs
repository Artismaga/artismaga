//! Private-network account/configuration regression tests. No real credentials or mail provider.
use artismaga_accounts::{Accounts, PreferencesUpdate, Profile, ProfileUpdate};
use artismaga_administration::Administration;
use artismaga_auth::{Auth, digest, now, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_render::PageRenderer;
use artismaga_web::{AppState, build};
use rocket::{
    http::{ContentType, Header, Status},
    local::asynchronous::Client,
};
use serde_json::{Value, json};
fn post<'a>(
    client: &'a Client,
    path: &'a str,
    body: Value,
) -> rocket::local::asynchronous::LocalRequest<'a> {
    client
        .post(path)
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(body.to_string())
}
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn account_and_administration_settings_are_persistent_private_and_authorized() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("settings_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "a long synthetic settings password";
    auth.install(
        "owner@example.com".into(),
        "Owner".into(),
        password.into(),
        SignupMode::Open,
    )
    .await
    .unwrap();
    auth.register(
        "reader@example.com".into(),
        "Reader".into(),
        password.into(),
        None,
    )
    .await
    .unwrap();
    let reader = store.by_email("reader@example.com").await.unwrap().unwrap();
    let owner = store.by_email("owner@example.com").await.unwrap().unwrap();
    let accounts = Accounts::new(store.clone());
    let initial = accounts.own(&reader.uid).await.unwrap();
    assert!(
        initial.preferences.privacy.private_library
            && initial.preferences.privacy.private_history
            && !initial.preferences.privacy.public_activity
    );
    accounts
        .save_profile(
            &reader.uid,
            ProfileUpdate {
                revision: 0,
                display_name: "New Reader".into(),
                profile: Profile {
                    pen_name: "A Pen Name".into(),
                    biography: "A little about me. <script>alert(1)</script>".into(),
                    website: "https://example.com".into(),
                    links: vec![],
                },
            },
        )
        .await
        .unwrap();
    let mut prefs = initial.preferences;
    prefs.reading.theme = "dark".into();
    prefs.notifications.chapter_edits = true;
    prefs.accessibility.reduced_motion = true;
    accounts
        .save_preferences(
            &reader.uid,
            PreferencesUpdate {
                revision: 0,
                preferences: prefs.clone(),
            },
        )
        .await
        .unwrap();
    assert!(
        accounts
            .save_preferences(
                &reader.uid,
                PreferencesUpdate {
                    revision: 0,
                    preferences: prefs.clone()
                }
            )
            .await
            .is_err()
    );
    store.migrate().await.unwrap();
    let saved = accounts.own(&reader.uid).await.unwrap();
    assert_eq!(saved.user.display_name, "New Reader");
    assert_eq!(saved.preferences.reading.theme, "dark");
    assert!(saved.preferences.notifications.chapter_edits);
    let renderer = PageRenderer::new(&config).unwrap();
    let client = Client::tracked(build(AppState::new(
        auth.clone(),
        config.clone(),
        renderer.clone(),
    )))
    .await
    .unwrap();
    assert_eq!(
        post(&client, "/api/account/profile", json!({}))
            .dispatch()
            .await
            .status(),
        Status::Unauthorized
    );
    assert_eq!(
        post(
            &client,
            "/api/auth/login",
            json!({"email":"reader@example.com","password":password})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert_eq!(
        client.get("/admin").dispatch().await.status(),
        Status::Forbidden
    );
    assert_eq!(
        client
            .get("/api/admin/configuration")
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    let response = client.get("/account/settings").dispatch().await;
    assert_eq!(response.status(), Status::Ok);
    let csp = response
        .headers()
        .get_one("Content-Security-Policy")
        .unwrap()
        .to_string();
    assert!(csp.contains("'nonce-") && !csp.contains("script-src 'unsafe-inline'"));
    let html = response.into_string().await.unwrap();
    assert!(!html.contains("owner@example.com") && html.contains("reader@example.com"));
    assert!(!html.contains("<script>alert(1)</script>"));
    let home = client
        .get("/")
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(!home.contains("reader@example.com") && !home.contains("A little about me"));
    let export: Value = client
        .get("/api/account/export")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    let text = export.to_string();
    assert!(
        text.contains("reader@example.com")
            && !text.contains("password_hash")
            && !text.contains("token_hash")
            && !text.contains("$argon2")
    );
    assert_eq!(
        post(
            &client,
            "/api/account/email",
            json!({"current_password":password,"email":"new@example.com"})
        )
        .dispatch()
        .await
        .status(),
        Status::ServiceUnavailable
    );
    assert_eq!(post(&client,"/api/account/profile",json!({"revision":1,"display_name":"Reader","profile":{"pen_name":"","biography":"","website":"javascript:alert(1)","links":[]}})).dispatch().await.status(),Status::BadRequest);
    let (_, extra_session) = auth
        .login("reader@example.com".into(), password.into())
        .await
        .unwrap();
    let list: Value = client
        .get("/api/account/sessions")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    assert_eq!(list["sessions"].as_array().unwrap().len(), 2);
    assert!(
        list["sessions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["current"] == true)
    );
    assert!(!list.to_string().contains("token_hash"));
    let owner_sessions = auth
        .login("owner@example.com".into(), password.into())
        .await
        .unwrap();
    let sid = auth.sessions(&owner.uid, &owner_sessions.1).await.unwrap()[0]
        .sid
        .clone()
        .unwrap();
    assert_eq!(
        post(
            &client,
            &format!("/api/account/sessions/{sid}/revoke"),
            json!({})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert!(auth.current(&owner_sessions.1).await.unwrap().is_some());
    assert_eq!(
        post(
            &client,
            "/api/account/password",
            json!({"current_password":"wrong","new_password":"a valid long replacement password"})
        )
        .dispatch()
        .await
        .status(),
        Status::BadRequest
    );
    assert_eq!(
        post(
            &client,
            "/api/account/password",
            json!({"current_password":password,"new_password":"a valid long replacement password"})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert!(auth.current(&extra_session).await.unwrap().is_none());
    assert!(
        auth.login("reader@example.com".into(), password.into())
            .await
            .is_err()
    );
    let (_, changed_session) = auth
        .login(
            "reader@example.com".into(),
            "a valid long replacement password".into(),
        )
        .await
        .unwrap();
    let email_token = token();
    assert!(store.query(artismaga_db::queries::REQUEST_EMAIL_CHANGE,json!({"uid":reader.uid,"email":"changed@example.com","hash":digest(&email_token),"expiry":now()+1800,"old":"stale password hash"})).await.is_err());
    let current_hash = store
        .by_uid(&reader.uid)
        .await
        .unwrap()
        .unwrap()
        .password_hash;
    store.query(artismaga_db::queries::REQUEST_EMAIL_CHANGE,json!({"uid":reader.uid,"email":"changed@example.com","hash":digest(&email_token),"expiry":now()+1800,"old":current_hash})).await.unwrap();
    assert!(
        store
            .by_email("reader@example.com")
            .await
            .unwrap()
            .is_some()
    );
    auth.consume_account_token(email_token.clone(), "change_email", None)
        .await
        .unwrap();
    assert!(
        auth.consume_account_token(email_token, "change_email", None)
            .await
            .is_err()
    );
    assert!(auth.current(&changed_session).await.unwrap().is_none());
    assert!(
        store
            .by_email("changed@example.com")
            .await
            .unwrap()
            .unwrap()
            .email_verified
    );
    let admin_client = Client::tracked(build(AppState::new(
        auth.clone(),
        config.clone(),
        renderer.clone(),
    )))
    .await
    .unwrap();
    post(
        &admin_client,
        "/api/auth/login",
        json!({"email":"owner@example.com","password":password}),
    )
    .dispatch()
    .await;
    assert_eq!(
        admin_client.get("/admin").dispatch().await.status(),
        Status::Ok
    );
    let administration = Administration::new(store.clone(), &config);
    let mut update = administration.configuration().await.unwrap();
    update.configuration.site_name = "Fiction Harbour".into();
    update.configuration.tagline = "Your next world awaits.".into();
    update.configuration.default_group = "author".into();
    let mut invalid = update.clone();
    invalid.configuration.default_group = "administrator".into();
    assert!(administration.save(invalid).await.is_err());
    let body = serde_json::to_value(&update).unwrap();
    assert_eq!(
        post(&admin_client, "/api/admin/configuration", body.clone())
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    assert_eq!(
        post(&admin_client, "/api/admin/configuration", body)
            .dispatch()
            .await
            .status(),
        Status::Conflict
    );
    auth.register(
        "author@example.com".into(),
        "Author".into(),
        password.into(),
        None,
    )
    .await
    .unwrap();
    assert_eq!(
        store
            .by_email("author@example.com")
            .await
            .unwrap()
            .unwrap()
            .group_key,
        "author"
    );
    assert!(
        admin_client
            .get("/")
            .dispatch()
            .await
            .into_string()
            .await
            .unwrap()
            .contains("Fiction Harbour")
    );
    let users: Value = admin_client
        .get("/api/admin/users?search=Reader")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    assert_eq!(users["users"].as_array().unwrap().len(), 1);
    assert!(!users.to_string().contains("password_hash"));
    assert!(
        accounts
            .delete(&auth, &owner.uid, password.into(), "DELETE")
            .await
            .is_err()
    );
    accounts
        .delete(
            &auth,
            &reader.uid,
            "a valid long replacement password".into(),
            "DELETE",
        )
        .await
        .unwrap();
    assert!(store.by_uid(&reader.uid).await.unwrap().is_none());
    let remnants: Vec<Value> = store
        .rows(
            "SELECT * FROM account_profile WHERE uid=$uid",
            json!({"uid":reader.uid}),
        )
        .await
        .unwrap();
    assert!(remnants.is_empty());
    let second = store.by_email("author@example.com").await.unwrap().unwrap();
    store
        .query(
            artismaga_db::queries::ASSIGN_GROUP,
            json!({"uid":second.uid,"group":"administrator"}),
        )
        .await
        .unwrap();
    let (first, second_result) = tokio::join!(
        accounts.delete(&auth, &owner.uid, password.into(), "DELETE"),
        accounts.delete(&auth, &second.uid, password.into(), "DELETE")
    );
    assert_eq!(
        usize::from(first.is_ok()) + usize::from(second_result.is_ok()),
        1
    );
    let remaining: Vec<Value> = store
        .rows(
            "SELECT uid FROM account WHERE group_key='administrator'",
            json!({}),
        )
        .await
        .unwrap();
    assert_eq!(remaining.len(), 1);
    renderer.shutdown().await;
}
