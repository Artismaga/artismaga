//! Private database + local-disk workflow. No requests are sent to AWS or Cloudflare.
use artismaga_auth::{Auth, now, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_render::PageRenderer;
use artismaga_studio::{Actor, Studio, WorkInput};
use artismaga_web::{AppState, build};
use rocket::{
    http::{ContentType, Header, Status},
    local::asynchronous::{Client, LocalRequest},
};
use serde_json::{Value, json};
fn post<'a>(client: &'a Client, path: &'a str, body: Value) -> LocalRequest<'a> {
    client
        .post(path)
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(body.to_string())
}
async fn login(client: &Client, email: &str, password: &str) {
    assert_eq!(
        post(
            client,
            "/api/auth/login",
            json!({"email":email,"password":password})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
}
async fn upload(client: &Client, purpose: &str, bytes: Vec<u8>) -> Value {
    let response = client
        .post(format!("/api/artwork?purpose={purpose}"))
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::PNG)
        .body(bytes)
        .dispatch()
        .await;
    assert_eq!(response.status(), Status::Ok);
    response.into_json().await.unwrap()
}
fn image() -> Vec<u8> {
    let image = image::RgbImage::from_fn(40, 60, |x, y| {
        if x < 20 {
            image::Rgb([40, 95, 170])
        } else if y < 30 {
            image::Rgb([205, 125, 65])
        } else {
            image::Rgb([195, 205, 160])
        }
    });
    let mut output = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .unwrap();
    output.into_inner()
}
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn studio_roles_storage_and_private_artwork_work_end_to_end() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("studio_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "synthetic studio integration password";
    auth.install(
        "owner@example.com".into(),
        "Owner".into(),
        password.into(),
        SignupMode::Open,
    )
    .await
    .unwrap();
    for (email, name) in [
        ("writer@example.com", "Writer"),
        ("viewer@example.com", "Viewer"),
        ("stranger@example.com", "Stranger"),
    ] {
        auth.register(email.into(), name.into(), password.into(), None)
            .await
            .unwrap();
    }
    store
        .query("UPDATE account SET email_verified=true", json!({}))
        .await
        .unwrap();
    let writer = store.by_email("writer@example.com").await.unwrap().unwrap();
    let viewer = store.by_email("viewer@example.com").await.unwrap().unwrap();
    let stranger = store
        .by_email("stranger@example.com")
        .await
        .unwrap()
        .unwrap();
    let renderer = PageRenderer::new(&config).unwrap();
    let root = tempfile::tempdir().unwrap();
    let admin = Client::tracked(build(
        AppState::new(auth.clone(), config.clone(), renderer.clone())
            .with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    let author = Client::tracked(build(
        AppState::new(auth.clone(), config.clone(), renderer.clone())
            .with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    let reader = Client::tracked(build(
        AppState::new(auth.clone(), config.clone(), renderer.clone())
            .with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    login(&admin, "owner@example.com", password).await;
    login(&author, "writer@example.com", password).await;
    login(&reader, "viewer@example.com", password).await;
    assert_eq!(
        reader.get("/admin/roles").dispatch().await.status(),
        Status::Forbidden
    );
    assert_eq!(
        author.get("/studio/new").dispatch().await.status(),
        Status::Forbidden
    );
    let role = json!({"key":"novelist","name":"Novelist","permissions":["create_story"],"revision":0,"create":true});
    assert_eq!(
        post(&admin, "/api/admin/roles", role.clone())
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    assert_eq!(
        post(&admin, "/api/admin/roles", role)
            .dispatch()
            .await
            .status(),
        Status::Conflict
    );
    assert_eq!(post(&admin,"/api/admin/roles",json!({"key":"administrator","name":"Locked","permissions":[],"revision":0,"create":false})).dispatch().await.status(),Status::BadRequest);
    assert_eq!(
        post(
            &admin,
            &format!("/api/admin/users/{}/group", writer.uid),
            json!({"group_key":"novelist"})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert_eq!(
        author.get("/studio/new").dispatch().await.status(),
        Status::Ok
    );
    assert_eq!(
        post(
            &admin,
            "/api/admin/roles/novelist/delete",
            json!({"revision":1})
        )
        .dispatch()
        .await
        .status(),
        Status::Conflict
    );
    assert_eq!(
        post(
            &admin,
            "/api/admin/roles",
            json!({"key":"novelist","name":"Novelist","permissions":[],"revision":1,"create":false})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert_eq!(
        author.get("/studio/new").dispatch().await.status(),
        Status::Forbidden
    );
    assert_eq!(post(&admin,"/api/admin/roles",json!({"key":"novelist","name":"Novelist","permissions":["create_story"],"revision":2,"create":false})).dispatch().await.status(),Status::Ok);
    // Configuration can be exercised without contacting a cloud account.
    let r2 = json!({"revision":0,"location":{"kind":"r2","bucket":"synthetic-bucket","region":"auto","account_id":"0123456789abcdef0123456789abcdef"},"access_key_id":"SYNTHETIC_ACCESS_KEY","secret_access_key":"SYNTHETIC_SECRET_VALUE"});
    assert_eq!(
        post(&admin, "/api/admin/storage", r2)
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    let settings: Value = admin
        .get("/api/admin/storage")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    let text = settings.to_string();
    assert!(
        settings["settings"]["credentials_set"] == true
            && !text.contains("SYNTHETIC_ACCESS_KEY")
            && !text.contains("SYNTHETIC_SECRET_VALUE")
            && !text.contains("credentials\":")
    );
    let encrypted: Vec<Value> = store
        .rows("SELECT * FROM storage_provider", json!({}))
        .await
        .unwrap();
    assert!(
        !serde_json::to_string(&encrypted)
            .unwrap()
            .contains("SYNTHETIC_SECRET_VALUE")
    );
    assert!(root.path().join("storage.key").exists());
    assert_eq!(post(&admin,"/api/admin/storage",json!({"revision":1,"location":settings["settings"]["location"],"access_key_id":"","secret_access_key":""})).dispatch().await.status(),Status::Ok);
    let html = admin
        .get("/admin/storage")
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(!html.contains("SYNTHETIC_ACCESS_KEY") && !html.contains("SYNTHETIC_SECRET_VALUE"));
    assert_eq!(post(&admin,"/api/admin/storage",json!({"revision":2,"location":{"kind":"local","bucket":"","region":"","account_id":""},"access_key_id":null,"secret_access_key":null})).dispatch().await.status(),Status::Ok);
    let asset = upload(&author, "cover", image()).await["asset"].clone();
    let asset_id = asset["uid"].as_str().unwrap();
    assert!(asset["palette"].as_array().unwrap().len() >= 2);
    let path = format!("/media/{asset_id}");
    assert_eq!(
        reader.get(&path).dispatch().await.status(),
        Status::NotFound
    );
    let bytes = author
        .get(&path)
        .dispatch()
        .await
        .into_bytes()
        .await
        .unwrap();
    assert_eq!(&bytes[..2], &[255, 216]);
    let bad = author
        .post("/api/artwork?purpose=cover")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .body("<svg onload='alert(1)'/>")
        .dispatch()
        .await;
    assert_eq!(bad.status(), Status::BadRequest);
    let work_body = json!({"title":"The Lantern Archive","subtitle":"A borrowed world","synopsis":"A private draft.","work_type":"book","cover":asset_id,"hero":null});
    let created: Value = post(&author, "/api/studio/works", work_body.clone())
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    let route = created["redirect"].as_str().unwrap();
    assert!(route.starts_with("/studio/work_"));
    let uid = route.trim_start_matches("/studio/");
    assert_eq!(
        reader.get(route).dispatch().await.status(),
        Status::NotFound
    );
    assert_eq!(
        reader.get(&path).dispatch().await.status(),
        Status::NotFound
    );
    let api = format!("/api/studio/works/{uid}");
    assert_eq!(
        post(&reader, &api, json!({"revision":0,"value":work_body}))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    let shares = format!("{api}/shares");
    assert_eq!(
        post(
            &author,
            &shares,
            json!({"uid":viewer.uid,"can_edit":false,"remove":false})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert_eq!(reader.get(route).dispatch().await.status(), Status::Ok);
    assert_eq!(reader.get(&path).dispatch().await.status(), Status::Ok);
    let studio = Studio::new(store.clone());
    let reader_actor = Actor {
        uid: &viewer.uid,
        can_write: false,
        administrator: false,
    };
    let writer_actor = Actor {
        uid: &writer.uid,
        can_write: true,
        administrator: false,
    };
    let list = studio
        .list(&reader_actor, "Lantern", "shared", "accessed", 0)
        .await
        .unwrap();
    assert_eq!(list.works.len(), 1);
    assert_eq!(list.works[0].uid, uid);
    assert!(
        studio
            .list(
                &Actor {
                    uid: &stranger.uid,
                    can_write: false,
                    administrator: false
                },
                "",
                "all",
                "name",
                0
            )
            .await
            .unwrap()
            .works
            .is_empty()
    );
    let work = studio.get(&writer_actor, uid, None).await.unwrap().work;
    let mut update = work_body.clone();
    update["title"] = json!("The Renamed Archive");
    assert_eq!(
        post(
            &author,
            &api,
            json!({"revision":work.revision,"value":update})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert_eq!(
        post(
            &author,
            &api,
            json!({"revision":work.revision,"value":update})
        )
        .dispatch()
        .await
        .status(),
        Status::Conflict
    );
    assert_eq!(
        post(
            &author,
            &shares,
            json!({"uid":viewer.uid,"can_edit":false,"remove":true})
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    assert_eq!(
        reader.get(route).dispatch().await.status(),
        Status::NotFound
    );
    assert_eq!(
        reader.get(&path).dispatch().await.status(),
        Status::NotFound
    );
    let other = studio
        .create(
            &writer_actor,
            WorkInput {
                title: "Zebra".into(),
                subtitle: "".into(),
                synopsis: "".into(),
                work_type: "book".into(),
                cover: None,
                hero: None,
            },
            now() + 1,
        )
        .await
        .unwrap();
    let list = studio
        .list(&writer_actor, "", "owned", "name", 0)
        .await
        .unwrap();
    assert_eq!(list.works[0].title, "The Renamed Archive");
    assert_eq!(list.works[1].uid, other);
    studio
        .get(&writer_actor, uid, Some(now() + 5))
        .await
        .unwrap();
    assert_eq!(
        studio
            .list(&writer_actor, "", "drafts", "accessed", 0)
            .await
            .unwrap()
            .works[0]
            .uid,
        uid
    );
    let default = upload(&admin, "default_cover", image()).await["asset"].clone();
    let mut configuration: Value = admin
        .get("/api/admin/configuration")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    configuration["settings"]["configuration"]["default_cover"] = default["uid"].clone();
    configuration["settings"]["configuration"]["primary_colour"] = json!("#4655a5");
    configuration["settings"]["configuration"]["default_group"] = json!("novelist");
    assert_eq!(
        post(
            &admin,
            "/api/admin/configuration",
            configuration["settings"].clone()
        )
        .dispatch()
        .await
        .status(),
        Status::Ok
    );
    let default_path = default["url"].as_str().unwrap();
    assert_eq!(
        reader.get(default_path).dispatch().await.status(),
        Status::Ok
    );
    let blank_html = author
        .get(format!("/studio/{other}/chapters"))
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(
        blank_html.contains(default["uid"].as_str().unwrap()) && blank_html.contains("chapters")
    );
    auth.register(
        "newauthor@example.com".into(),
        "New author".into(),
        password.into(),
        None,
    )
    .await
    .unwrap();
    assert_eq!(
        store
            .by_email("newauthor@example.com")
            .await
            .unwrap()
            .unwrap()
            .group_key,
        "novelist"
    );
    let export: Value = author
        .get("/api/account/export")
        .dispatch()
        .await
        .into_json()
        .await
        .unwrap();
    assert_eq!(export["works"].as_array().unwrap().len(), 2);
    assert!(!export.to_string().contains("SYNTHETIC_SECRET_VALUE"));
    artismaga_accounts::Accounts::new(store.clone())
        .delete(&auth, &writer.uid, password.into(), "DELETE")
        .await
        .unwrap();
    let storage = artismaga_storage::Storage::new(store.clone(), root.path().into());
    assert!(storage.asset(asset_id).await.unwrap().is_none());
    storage.cleanup().await.unwrap();
    assert!(
        !root
            .path()
            .join(format!("media/artwork/{asset_id}.jpg"))
            .exists()
    );
    assert!(studio.get(&writer_actor, uid, None).await.is_err());
    renderer.shutdown().await;
}
