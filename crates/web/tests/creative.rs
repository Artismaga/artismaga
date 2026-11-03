//! Real SurrealDB regression coverage for chapter lifecycle, hierarchy and vocabulary.
use artismaga_auth::{Auth, now, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_studio::{
    Actor, Studio, WorkInput,
    details::{Command, Kind, Update},
};
use serde_json::json;
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn chapter_lifecycle_batch_sharing_and_taxonomy() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("creative_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "synthetic creative regression password";
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
        ("reader@example.test", "Reader"),
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
    let reader = store
        .by_email("reader@example.test")
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
    let read = Actor {
        uid: &reader.uid,
        can_write: false,
        administrator: false,
    };
    let stranger = Actor {
        uid: &other.uid,
        can_write: true,
        administrator: false,
    };
    let studio = Studio::new(store.clone());
    let t = now();
    let media_root = tempfile::tempdir().unwrap();
    let storage = artismaga_storage::Storage::new(store.clone(), media_root.path().into());
    let mut encoded = std::io::Cursor::new(Vec::new());
    image::RgbImage::from_pixel(16, 24, image::Rgb([24, 72, 150]))
        .write_to(&mut encoded, image::ImageFormat::Png)
        .unwrap();
    let cover = storage
        .upload(&editor.uid, "chapter_cover", encoded.into_inner(), t)
        .await
        .unwrap();

    let work = studio
        .create(
            &actor,
            WorkInput {
                title: "Lantern Archive".into(),
                subtitle: String::new(),
                synopsis: String::new(),
                work_type: "book".into(),
                cover: None,
                hero: None,
            },
            t,
        )
        .await
        .unwrap();
    assert!(studio.details(&stranger, &work, t).await.is_err());
    assert!(
        studio
            .share_many(
                &actor,
                &work,
                &["editor@example.test".into(), "missing@example.test".into()],
                true,
                false
            )
            .await
            .is_err()
    );
    assert!(
        studio.get(&edit, &work, None).await.is_err(),
        "a failed batch must grant nobody"
    );
    studio
        .share_many(
            &actor,
            &work,
            &["EDITOR@example.test".into(), reader.uid.clone()],
            true,
            false,
        )
        .await
        .unwrap();
    assert!(studio.get(&edit, &work, None).await.unwrap().can_edit);
    assert!(!studio.get(&read, &work, None).await.unwrap().can_edit);
    let names = studio.search_people(&actor, &work, "Edit").await.unwrap();
    assert_eq!(names.len(), 1);
    assert!(
        studio
            .search_people(&actor, &work, "editor@example.test")
            .await
            .unwrap()
            .is_empty()
    );
    let create = |kind, parent: Option<String>, title: &str| Command::SaveNode {
        disclosures: vec![],
        uid: None,
        kind,
        parent,
        title: title.into(),
        synopsis: String::new(),
        cover: None,
    };
    let mut doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: 0,
                command: create(Kind::Volume, None, "Volume I"),
            },
            t,
        )
        .await
        .unwrap();
    let volume = doc.value.nodes[0].uid.clone();
    assert!(
        studio
            .change_details(
                &edit,
                &work,
                Update {
                    revision: 0,
                    command: create(Kind::Chapter, None, "Stale edit")
                },
                t
            )
            .await
            .is_err()
    );
    assert!(
        studio
            .change_details(
                &read,
                &work,
                Update {
                    revision: 1,
                    command: create(Kind::Chapter, None, "Forbidden")
                },
                t
            )
            .await
            .is_err()
    );
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: create(Kind::Arc, Some(volume.clone()), "Arc I"),
            },
            t,
        )
        .await
        .unwrap();
    let arc = doc.value.nodes[1].uid.clone();
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: create(Kind::Chapter, Some(arc.clone()), "First Light"),
            },
            t,
        )
        .await
        .unwrap();
    let first = doc.value.nodes[2].uid.clone();
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: create(Kind::Chapter, Some(arc.clone()), "Second Light"),
            },
            t,
        )
        .await
        .unwrap();
    let second = doc.value.nodes[3].uid.clone();
    assert!(
        studio
            .change_details(
                &edit,
                &work,
                Update {
                    revision: doc.revision,
                    command: create(Kind::Arc, Some(first.clone()), "Invalid arc")
                },
                t
            )
            .await
            .is_err()
    );
    assert!(
        studio
            .change_details(
                &edit,
                &work,
                Update {
                    revision: doc.revision,
                    command: Command::Move {
                        uid: volume.clone(),
                        parent: Some(arc.clone()),
                        before: None
                    }
                },
                t
            )
            .await
            .is_err()
    );
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: Command::Move {
                    uid: second.clone(),
                    parent: Some(arc.clone()),
                    before: Some(first.clone()),
                },
            },
            t,
        )
        .await
        .unwrap();
    assert_eq!(doc.value.nodes[2].uid, second);
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: Command::SaveNode {
                    disclosures: vec![],
                    uid: Some(first.clone()),
                    kind: Kind::Chapter,
                    parent: Some(arc.clone()),
                    title: "First dawn".into(),
                    synopsis: "A brief synopsis".into(),
                    cover: Some(cover.uid.clone()),
                },
            },
            t,
        )
        .await
        .unwrap();
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: Command::Archive { uid: first.clone() },
            },
            t,
        )
        .await
        .unwrap();
    assert_eq!(
        doc.value
            .nodes
            .iter()
            .find(|n| n.uid == first)
            .unwrap()
            .delete_after,
        Some(t + 604800)
    );
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: Command::Restore { uid: first.clone() },
            },
            t + 604799,
        )
        .await
        .unwrap();
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: Command::Archive { uid: first.clone() },
            },
            t,
        )
        .await
        .unwrap();
    assert!(
        studio
            .change_details(
                &edit,
                &work,
                Update {
                    revision: doc.revision,
                    command: Command::Restore { uid: first.clone() }
                },
                t + 604800
            )
            .await
            .is_err()
    );
    assert!(
        !studio
            .details(&edit, &work, t + 604800)
            .await
            .unwrap()
            .value
            .nodes
            .iter()
            .any(|n| n.uid == first)
    );
    assert!(studio.can_view_asset(&read, &cover.uid).await.unwrap());
    assert!(!studio.can_view_asset(&stranger, &cover.uid).await.unwrap());
    studio.purge_chapters(t + 604800).await.unwrap();
    assert!(storage.asset(&cover.uid).await.unwrap().is_none());
    storage.cleanup().await.unwrap();
    assert!(storage.bytes(&cover).await.is_err());
    doc = studio.details(&edit, &work, t).await.unwrap();
    assert!(!doc.value.nodes.iter().any(|n| n.uid == first));
    let mut vocabulary = artismaga_administration::taxonomy::load(&store)
        .await
        .unwrap();
    assert!(vocabulary.value.premade_genres);
    assert!(artismaga_administration::taxonomy::seed_tags().len() >= 1000);
    vocabulary.value.allow_arbitrary_tags = false;
    vocabulary.revision = artismaga_administration::taxonomy::save(&store, vocabulary.clone())
        .await
        .unwrap();
    assert!(
        artismaga_administration::taxonomy::save(
            &store,
            artismaga_administration::taxonomy::Settings {
                revision: 0,
                ..vocabulary.clone()
            }
        )
        .await
        .is_err()
    );
    let metadata = |tags| Command::Metadata {
        genres: vec![],
        tags,
        disclosures: Default::default(),
    };
    assert!(
        studio
            .change_details(
                &edit,
                &work,
                Update {
                    revision: doc.revision,
                    command: metadata(vec!["not in the vocabulary".into()])
                },
                t
            )
            .await
            .is_err()
    );
    doc = studio
        .change_details(
            &edit,
            &work,
            Update {
                revision: doc.revision,
                command: metadata(vec!["Found family".into()]),
            },
            t,
        )
        .await
        .unwrap();
    assert_eq!(doc.value.tags, vec!["Found family"]);
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
            .change_details(
                &edit,
                &work,
                Update {
                    revision: doc.revision,
                    command: metadata(vec![])
                },
                t
            )
            .await
            .is_err()
    );
    vocabulary.value.allow_arbitrary_tags = true;
    artismaga_administration::taxonomy::save(&store, vocabulary)
        .await
        .unwrap();
    let doc = studio.details(&actor, &work, t).await.unwrap();
    studio
        .change_details(
            &actor,
            &work,
            Update {
                revision: doc.revision,
                command: metadata(vec!["Secret Asterism".into()]),
            },
            t,
        )
        .await
        .unwrap();
    // SSR renders hierarchy and titles before hydration; private lookups require sign-in.
    let renderer = artismaga_render::PageRenderer::new(&config).unwrap();
    let client = rocket::local::asynchronous::Client::tracked(artismaga_web::build(
        artismaga_web::AppState::new(auth.clone(), config, renderer.clone()),
    ))
    .await
    .unwrap();
    use rocket::http::{ContentType, Header, Status};
    assert_eq!(
        client
            .get("/api/suggestions?kind=stories&search=Lantern")
            .dispatch()
            .await
            .status(),
        Status::Unauthorized
    );
    let login = client
        .post("/api/auth/login")
        .remote("127.0.0.1:45001".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(json!({"email":"owner@example.test","password":password}).to_string())
        .dispatch()
        .await;
    assert_eq!(login.status(), Status::Ok);
    let page = client
        .get(format!("/studio/{work}/chapters"))
        .dispatch()
        .await;
    assert_eq!(page.status(), Status::Ok);
    let html = page.into_string().await.unwrap();
    assert!(html.contains("Volume I"));
    assert!(html.contains("Chapters · Lantern Archive •"));
    assert!(html.contains("Create chapter"));
    let suggestions = client
        .get("/api/suggestions?kind=stories&search=Lantern")
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(
        suggestions["options"],
        json!([]),
        "private draft titles must not appear"
    );
    let hidden_tags = client
        .get("/api/suggestions?kind=tags&search=Asterism")
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(
        hidden_tags["options"],
        json!([]),
        "private draft tags must not leak"
    );
    // Synthetic publication fixture: production publication is intentionally not exposed yet.
    store
        .query(
            "UPDATE work SET status='ongoing' WHERE uid=$work",
            json!({"work":work}),
        )
        .await
        .unwrap();
    let public_tags = client
        .get("/api/suggestions?kind=tags&search=Asterism")
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(public_tags["options"][0]["label"], "Secret Asterism");
    let public_story = client
        .get(format!(
            "/api/suggestions?kind=stories&search=&selected={work}"
        ))
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(public_story["options"][0]["label"], "Lantern Archive");
    let public_author = client
        .get("/api/suggestions?kind=authors&search=Own")
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(public_author["options"][0]["label"], "Owner");
    assert!(!public_author.to_string().contains("owner@example.test"));
    let mut policy = artismaga_administration::taxonomy::load(&store)
        .await
        .unwrap();
    policy.value.allow_arbitrary_tags = false;
    artismaga_administration::taxonomy::save(&store, policy)
        .await
        .unwrap();
    let known = client
        .get("/api/suggestions?kind=tags&search=Asterism")
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(
        known["options"][0]["label"], "Secret Asterism",
        "readers can still exclude historical public tags"
    );
    let allowed = client
        .get("/api/suggestions?kind=tags&search=Asterism&scope=allowed")
        .dispatch()
        .await
        .into_json::<serde_json::Value>()
        .await
        .unwrap();
    assert_eq!(
        allowed["options"],
        json!([]),
        "authors only see currently permitted tags"
    );
    // Audience intent uses the same persisted revision/access boundary as chapters.
    let audience_command = || Command::Audience {
        target_audience: artismaga_studio::details::TargetAudience {
            minimum_age: Some(13),
            maximum_age: Some(17),
        },
    };
    let revision = studio.details(&actor, &work, t).await.unwrap().revision;
    for denied in [&read, &stranger] {
        assert!(
            studio
                .change_details(
                    denied,
                    &work,
                    Update {
                        revision,
                        command: audience_command()
                    },
                    t
                )
                .await
                .is_err()
        );
    }
    let saved = studio
        .change_details(
            &actor,
            &work,
            Update {
                revision,
                command: audience_command(),
            },
            t,
        )
        .await
        .unwrap();
    let loaded = studio.details(&actor, &work, t).await.unwrap();
    assert_eq!(loaded.value.target_audience.minimum_age, Some(13));
    assert_eq!(loaded.value.target_audience.maximum_age, Some(17));
    assert!(
        studio
            .change_details(
                &actor,
                &work,
                Update {
                    revision,
                    command: audience_command()
                },
                t
            )
            .await
            .is_err(),
        "stale audience edits must not overwrite"
    );
    assert!(
        studio
            .change_details(
                &actor,
                &work,
                Update {
                    revision: saved.revision,
                    command: Command::Audience {
                        target_audience: artismaga_studio::details::TargetAudience {
                            minimum_age: Some(18),
                            maximum_age: Some(12)
                        }
                    }
                },
                t
            )
            .await
            .is_err()
    );
    assert_eq!(
        studio.details(&actor, &work, t).await.unwrap().revision,
        saved.revision,
        "invalid range must not write"
    );
    studio
        .change_details(
            &actor,
            &work,
            Update {
                revision: saved.revision,
                command: Command::Audience {
                    target_audience: Default::default(),
                },
            },
            t,
        )
        .await
        .unwrap();
    assert!(
        studio
            .details(&actor, &work, t)
            .await
            .unwrap()
            .value
            .target_audience
            .minimum_age
            .is_none()
    );
    renderer.shutdown().await;
}
