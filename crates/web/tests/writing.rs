//! Real private-database coverage for manuscripts, snapshots, conflicts and chapter expiry.
use artismaga_auth::{Auth, now, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_studio::{
    Actor, Studio, WorkInput,
    details::{Command, Kind, Update},
    writing::{Manuscript, Restore, Save},
};
use serde_json::json;
fn value(text: &str) -> Manuscript {
    serde_json::from_value(json!({"language":"en","document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text,"marks":[{"type":"bold"}]}]}]},"notes":[{"uid":"bbf18fbc-7a8d-4a8f-8f23-e4b8e209d52c","text":"Plan the next scene","anchor":{"from":1,"to":5,"quote":"Once","detached":false}}]})).unwrap()
}
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn writing_permissions_checkpoints_conflicts_restore_and_expiry() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("writing_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "synthetic chapter editor password";
    auth.install(
        "owner@example.test".into(),
        "Owner".into(),
        password.into(),
        SignupMode::Open,
    )
    .await
    .unwrap();
    for (email, name) in [
        ("editor@example.test", "Editor"),
        ("viewer@example.test", "Viewer"),
        ("other@example.test", "Other"),
    ] {
        auth.register(email.into(), name.into(), password.into(), None)
            .await
            .unwrap();
    }
    let owner = store.by_email("owner@example.test").await.unwrap().unwrap();
    let editor = store
        .by_email("editor@example.test")
        .await
        .unwrap()
        .unwrap();
    let viewer = store
        .by_email("viewer@example.test")
        .await
        .unwrap()
        .unwrap();
    let other = store.by_email("other@example.test").await.unwrap().unwrap();
    let actor = Actor {
        uid: &owner.uid,
        can_write: true,
        administrator: true,
    };
    let edit = Actor {
        uid: &editor.uid,
        can_write: true,
        administrator: false,
    };
    let view = Actor {
        uid: &viewer.uid,
        can_write: true,
        administrator: false,
    };
    let stranger = Actor {
        uid: &other.uid,
        can_write: true,
        administrator: false,
    };
    let studio = Studio::new(store.clone());
    let time = now();
    let work = studio
        .create(
            &actor,
            WorkInput {
                title: "Chapter editor regression".into(),
                subtitle: String::new(),
                synopsis: String::new(),
                work_type: "book".into(),
                cover: None,
                hero: None,
            },
            time,
        )
        .await
        .unwrap();
    let details = studio
        .change_details(
            &actor,
            &work,
            Update {
                revision: 0,
                command: Command::SaveNode {
                    disclosures: vec![],
                    uid: None,
                    kind: Kind::Chapter,
                    parent: None,
                    title: "The first scene".into(),
                    synopsis: String::new(),
                    cover: None,
                },
            },
            time,
        )
        .await
        .unwrap();
    let chapter = details.value.nodes[0].uid.clone();
    studio
        .share_many(
            &actor,
            &work,
            std::slice::from_ref(&editor.uid),
            true,
            false,
        )
        .await
        .unwrap();
    studio
        .share_many(
            &actor,
            &work,
            std::slice::from_ref(&viewer.uid),
            false,
            false,
        )
        .await
        .unwrap();
    assert!(
        studio
            .writing(&stranger, &work, &chapter, time)
            .await
            .is_err()
    );
    assert!(
        !studio
            .writing(&view, &work, &chapter, time)
            .await
            .unwrap()
            .can_edit
    );
    assert!(
        studio
            .save_writing(
                &view,
                &work,
                &chapter,
                Save {
                    revision: 0,
                    value: value("Once upon a time"),
                    checkpoint: true
                },
                time
            )
            .await
            .is_err()
    );
    let first = studio
        .save_writing(
            &edit,
            &work,
            &chapter,
            Save {
                revision: 0,
                value: value("Once upon a time"),
                checkpoint: false,
            },
            time,
        )
        .await
        .unwrap();
    assert_eq!(first.revision, 1);
    let second = studio
        .save_writing(
            &edit,
            &work,
            &chapter,
            Save {
                revision: 1,
                value: value("Once the door opened"),
                checkpoint: false,
            },
            time + 2,
        )
        .await
        .unwrap();
    assert_eq!(second.revision, 2);
    let history = studio
        .writing_history(&actor, &work, &chapter, i64::MAX, time + 2)
        .await
        .unwrap();
    assert_eq!(history.revisions.len(), 1);
    assert_eq!(history.revisions[0].revision, 1);
    assert_eq!(
        history.revisions[0].avatar_url.as_deref(),
        Some(artismaga_core::gravatar(&editor.email).as_str())
    );
    let public_history = serde_json::to_value(&history).unwrap();
    assert!(public_history["revisions"][0].get("updated_by").is_none());
    assert!(public_history["revisions"][0].get("email").is_none());
    let third = studio
        .save_writing(
            &edit,
            &work,
            &chapter,
            Save {
                revision: 2,
                value: value("Once beyond the horizon"),
                checkpoint: false,
            },
            time + 3,
        )
        .await
        .unwrap();
    assert_eq!(third.revision, 3);
    let restored = studio
        .restore_writing(
            &edit,
            &work,
            &chapter,
            Restore {
                revision: 3,
                source_revision: 1,
            },
            time + 4,
        )
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(restored.value).unwrap(),
        serde_json::to_value(first.value).unwrap()
    );
    assert_eq!(restored.revision, 4);
    // Restoration preserves the latest autosave even when it was not a checkpoint.
    let preserved = studio
        .writing_revision(&actor, &work, &chapter, 3, time + 4)
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(preserved.value).unwrap(),
        serde_json::to_value(third.value).unwrap()
    );
    let (a, b) = tokio::join!(
        studio.save_writing(
            &edit,
            &work,
            &chapter,
            Save {
                revision: 4,
                value: value("Once writer A"),
                checkpoint: true
            },
            time + 5
        ),
        studio.save_writing(
            &edit,
            &work,
            &chapter,
            Save {
                revision: 4,
                value: value("Once writer B"),
                checkpoint: true
            },
            time + 5
        )
    );
    assert_eq!(
        usize::from(a.is_ok()) + usize::from(b.is_ok()),
        1,
        "only one simultaneous editor can win"
    );
    let current = studio
        .writing(&actor, &work, &chapter, time + 6)
        .await
        .unwrap()
        .draft;
    assert_eq!(current.revision, 5);
    assert!(
        studio
            .writing_revision(&actor, &work, "node_unknown", 1, time)
            .await
            .is_err()
    );
    let page = studio
        .writing_history(&actor, &work, &chapter, 4, time)
        .await
        .unwrap();
    assert_eq!(
        page.revisions
            .iter()
            .map(|r| r.revision)
            .collect::<Vec<_>>(),
        vec![3, 1]
    );
    studio
        .share_many(
            &actor,
            &work,
            std::slice::from_ref(&editor.uid),
            false,
            true,
        )
        .await
        .unwrap();
    assert!(
        studio
            .save_writing(
                &edit,
                &work,
                &chapter,
                Save {
                    revision: 5,
                    value: value("Once revoked"),
                    checkpoint: true
                },
                time
            )
            .await
            .is_err()
    );
    assert!(
        studio
            .writing_history(&edit, &work, &chapter, i64::MAX, time)
            .await
            .is_err()
    );
    // Actual Rocket SSR and mutation guards, including a logged-in viewer without editing grants.
    let renderer = artismaga_render::PageRenderer::new(&config).unwrap();
    let client = rocket::local::asynchronous::Client::tracked(artismaga_web::build(
        artismaga_web::AppState::new(auth.clone(), config, renderer.clone()),
    ))
    .await
    .unwrap();
    use rocket::http::{ContentType, Header, Status};
    let path = format!("/studio/{work}/chapters/{chapter}");
    assert_eq!(
        client.get(&path).dispatch().await.status(),
        Status::Unauthorized
    );
    assert_eq!(
        client
            .post("/api/auth/login")
            .remote("127.0.0.1:45101".parse().unwrap())
            .header(ContentType::JSON)
            .header(Header::new("Origin", "http://localhost:8000"))
            .body(json!({"email":"owner@example.test","password":password}).to_string())
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    let html = client
        .get(&path)
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(html.contains("The first scene"));
    assert!(html.contains("Once writer"));
    assert!(html.contains("Plan the next scene"));
    assert!(html.contains("Revision history"));
    assert!(!html.contains(&owner.password_hash));
    assert!(!html.contains("&quot;password_hash&quot;:"));
    assert!(!html.contains("owner@example.test"));
    let savepath = format!("/api/studio/works/{work}/chapters/{chapter}/draft");
    assert_eq!(
        client
            .post(&savepath)
            .remote("127.0.0.1:45101".parse().unwrap())
            .header(ContentType::JSON)
            .header(Header::new("Origin", "https://untrusted.test"))
            .body(
                json!({"revision":5,"value":value("Once bad origin"),"checkpoint":true})
                    .to_string()
            )
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    // Continuous authenticated autosaving must outlive the low unauthenticated login budget.
    for revision in 5..37 {
        let result=client.post(&savepath).remote("127.0.0.1:45101".parse().unwrap()).header(ContentType::JSON).header(Header::new("Origin","http://localhost:8000")).body(json!({"revision":revision,"value":value("Once an HTTP autosave"),"checkpoint":false}).to_string()).dispatch().await;
        assert_eq!(result.status(), Status::Ok, "autosave revision {revision}");
    }
    let large = client
        .post(&savepath)
        .remote("127.0.0.1:45101".parse().unwrap())
        .header(ContentType::JSON)
        .header(Header::new("Origin", "http://localhost:8000"))
        .body(
            json!({"revision":37,"value":value(&"Once ".repeat(60000)),"checkpoint":false})
                .to_string(),
        )
        .dispatch()
        .await;
    assert_eq!(
        large.status(),
        Status::Ok,
        "valid manuscripts may exceed small account-form payload sizes"
    );
    let details = studio
        .change_details(
            &actor,
            &work,
            Update {
                revision: details.revision,
                command: Command::Archive {
                    uid: chapter.clone(),
                },
            },
            time + 10,
        )
        .await
        .unwrap();
    assert!(
        studio
            .writing(&actor, &work, &chapter, time + 11)
            .await
            .is_err()
    );
    let details = studio
        .change_details(
            &actor,
            &work,
            Update {
                revision: details.revision,
                command: Command::Restore {
                    uid: chapter.clone(),
                },
            },
            time + 12,
        )
        .await
        .unwrap();
    assert_eq!(
        studio
            .writing(&actor, &work, &chapter, time + 12)
            .await
            .unwrap()
            .draft
            .revision,
        38
    );
    studio
        .change_details(
            &actor,
            &work,
            Update {
                revision: details.revision,
                command: Command::Archive {
                    uid: chapter.clone(),
                },
            },
            time + 13,
        )
        .await
        .unwrap();
    studio
        .purge_chapters(time + 13 + 7 * 24 * 3600)
        .await
        .unwrap();
    let drafts: Vec<serde_json::Value> = store
        .rows(
            "SELECT * FROM chapter_draft WHERE work=$work",
            json!({"work":work}),
        )
        .await
        .unwrap();
    let revisions: Vec<serde_json::Value> = store
        .rows(
            "SELECT * FROM chapter_revision WHERE work=$work",
            json!({"work":work}),
        )
        .await
        .unwrap();
    assert!(drafts.is_empty() && revisions.is_empty());
    renderer.shutdown().await;
}
