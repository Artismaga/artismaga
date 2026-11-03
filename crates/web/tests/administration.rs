//! Announcement history, immutable attribution and role audience persistence.
use artismaga_administration::announcements::{self, Update, Value};
use artismaga_auth::{Auth, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn announcements_preserve_history_creator_and_audiences() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("announcements_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    auth.install(
        "owner@example.test".into(),
        "Owner".into(),
        "synthetic administration password".into(),
        SignupMode::Open,
    )
    .await
    .unwrap();
    let owner = store.by_email("owner@example.test").await.unwrap().unwrap();
    let value = Value {
        kind: "notice".into(),
        severity: "warning".into(),
        title: "Scheduled notice".into(),
        description: "A synthetic test".into(),
        image: None,
        cta_text: String::new(),
        cta_url: String::new(),
        dismissible: true,
        starts_at: Some(100),
        ends_at: Some(200),
        audience: "roles".into(),
        roles: vec!["author".into()],
    };
    let uid = announcements::save(
        &store,
        &owner.uid,
        Update {
            uid: None,
            revision: 0,
            value: value.clone(),
            cancelled: false,
        },
        50,
    )
    .await
    .unwrap();
    let rows = announcements::list(&store).await.unwrap();
    assert_eq!(rows.len(), 1);
    assert!(!announcements::visible(&rows[0], None, false, 150));
    assert!(announcements::visible(&rows[0], Some("author"), false, 150));
    assert_eq!(rows[0].initiator.as_ref().unwrap().display_name, "Owner");
    assert_eq!(
        announcements::visible_list(&store, Some("author"), false, 150)
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(
        announcements::visible_list(&store, None, false, 150)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        announcements::visible_list(&store, Some("author"), false, 250)
            .await
            .unwrap()
            .is_empty()
    );
    announcements::save(
        &store,
        "different-editor",
        Update {
            uid: Some(uid.clone()),
            revision: 1,
            value: value.clone(),
            cancelled: true,
        },
        160,
    )
    .await
    .unwrap();
    let rows = announcements::list(&store).await.unwrap();
    assert_eq!(rows[0].creator, owner.uid);
    assert_eq!(rows[0].created_at, 50);
    assert!(rows[0].cancelled);
    assert!(!announcements::visible(
        &rows[0],
        Some("author"),
        false,
        170
    ));
    assert!(
        announcements::save(
            &store,
            &owner.uid,
            Update {
                uid: Some(uid.clone()),
                revision: 1,
                value,
                cancelled: false
            },
            180
        )
        .await
        .is_err()
    );
    let archived = Value {
        kind: "notice".into(),
        severity: "info".into(),
        title: "Archived fixture".into(),
        description: "Pagination coverage".into(),
        image: None,
        cta_text: String::new(),
        cta_url: String::new(),
        dismissible: false,
        starts_at: None,
        ends_at: None,
        audience: "everyone".into(),
        roles: vec![],
    };
    for n in 0..55 {
        announcements::save(
            &store,
            &owner.uid,
            Update {
                uid: None,
                revision: 0,
                value: archived.clone(),
                cancelled: true,
            },
            2000 + n,
        )
        .await
        .unwrap();
    }
    assert_eq!(
        announcements::history(&store, 0, "").await.unwrap().len(),
        51
    );
    assert!(
        announcements::history(&store, 50, "")
            .await
            .unwrap()
            .iter()
            .any(|a| a.uid == uid)
    );
    assert_eq!(
        announcements::history(&store, 0, "Scheduled notice")
            .await
            .unwrap()[0]
            .uid,
        uid
    );
    assert!(
        announcements::visible_list(&store, None, false, 3000)
            .await
            .unwrap()
            .is_empty()
    );
    let admin = artismaga_administration::Administration::new(store.clone(), &config);
    let mut settings = admin.configuration().await.unwrap();
    settings.configuration.themes.dark.primary_colour = "#62459f".into();
    settings.configuration.themes.dark.enabled = false;
    settings.configuration.socials.insert(
        "bluesky".into(),
        "https://bsky.app/profile/example.test".into(),
    );
    admin.save(settings).await.unwrap();
    let settings = admin.configuration().await.unwrap();
    assert_eq!(settings.configuration.themes.dark.primary_colour, "#62459f");
    assert!(!settings.configuration.themes.dark.enabled);
    use rocket::http::{ContentType, Cookie, Header, Status};
    use serde_json::json;
    for (email, name) in [
        ("editor@example.test", "Editor"),
        ("reader@example.test", "Reader"),
        ("author@example.test", "Author"),
    ] {
        auth.register(
            email.into(),
            name.into(),
            "synthetic administration password".into(),
            None,
        )
        .await
        .unwrap();
    }
    artismaga_administration::roles::save(
        &store,
        artismaga_administration::roles::RoleUpdate {
            key: "announcer".into(),
            name: "Announcer".into(),
            permissions: vec![artismaga_core::Permission::ManageAnnouncements],
            revision: 0,
            create: true,
        },
    )
    .await
    .unwrap();
    store.query("UPDATE account SET group_key='announcer' WHERE email='editor@example.test'; UPDATE account SET group_key='author' WHERE email='author@example.test'; UPDATE account SET email_verified=true;",json!({})).await.unwrap();
    let (_, editor_session) = auth
        .login(
            "editor@example.test".into(),
            "synthetic administration password".into(),
        )
        .await
        .unwrap();
    let (_, reader_session) = auth
        .login(
            "reader@example.test".into(),
            "synthetic administration password".into(),
        )
        .await
        .unwrap();
    let (_, author_session) = auth
        .login(
            "author@example.test".into(),
            "synthetic administration password".into(),
        )
        .await
        .unwrap();
    let renderer = artismaga_render::PageRenderer::new(&config).unwrap();
    let root = tempfile::tempdir().unwrap();
    let client = rocket::local::asynchronous::Client::tracked(artismaga_web::build(
        artismaga_web::AppState::new(auth, config, renderer.clone())
            .with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    assert_eq!(
        client
            .get("/api/admin/announcements")
            .cookie(Cookie::new("session", reader_session.clone()))
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    assert_eq!(
        client
            .get("/api/admin/announcements")
            .cookie(Cookie::new("session", editor_session.clone()))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    assert_eq!(
        client
            .get("/analytics")
            .cookie(Cookie::new("session", editor_session.clone()))
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    assert_eq!(
        client
            .get("/admin/announcements")
            .cookie(Cookie::new("session", editor_session.clone()))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    let pixels = image::RgbImage::from_pixel(8, 8, image::Rgb([120, 80, 160]));
    let mut png = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(pixels)
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
    let bytes = png.into_inner();
    assert_eq!(
        client
            .post("/api/artwork?purpose=announcement")
            .cookie(Cookie::new("session", reader_session.clone()))
            .remote("127.0.0.1:43000".parse().unwrap())
            .header(Header::new("Origin", "http://localhost:8000"))
            .body(bytes.clone())
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    let upload = client
        .post("/api/artwork?purpose=announcement")
        .cookie(Cookie::new("session", editor_session.clone()))
        .remote("127.0.0.1:43000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .body(bytes)
        .dispatch()
        .await;
    assert_eq!(upload.status(), Status::Ok);
    let upload: serde_json::Value = upload.into_json().await.unwrap();
    let image = upload["asset"]["uid"].as_str().unwrap();
    let promotion = json!({"uid":null,"revision":0,"cancelled":false,"value":{"kind":"promotion","severity":"info","title":"A promotion","description":"Synthetic preview","image":image,"cta_text":"Read","cta_url":"/","dismissible":true,"starts_at":null,"ends_at":null,"audience":"roles","roles":["author"]}});
    assert_eq!(
        client
            .post("/api/admin/announcements")
            .cookie(Cookie::new("session", reader_session.clone()))
            .remote("127.0.0.1:43000".parse().unwrap())
            .header(Header::new("Origin", "http://localhost:8000"))
            .header(ContentType::JSON)
            .body(promotion.to_string())
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    assert_eq!(
        client
            .post("/api/admin/announcements")
            .cookie(Cookie::new("session", editor_session.clone()))
            .remote("127.0.0.1:43000".parse().unwrap())
            .header(Header::new("Origin", "http://localhost:8000"))
            .header(ContentType::JSON)
            .body(promotion.to_string())
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    assert_eq!(
        client
            .get(format!("/media/{image}"))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    assert_eq!(
        client
            .get(format!("/media/{image}"))
            .cookie(Cookie::new("session", reader_session))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    assert_eq!(
        client
            .get(format!("/media/{image}"))
            .cookie(Cookie::new("session", editor_session))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    assert_eq!(
        client
            .get(format!("/media/{image}"))
            .cookie(Cookie::new("session", author_session))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    renderer.shutdown().await;
}
