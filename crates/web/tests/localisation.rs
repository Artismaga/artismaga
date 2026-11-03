//! Draft isolation, source-bound language approvals, cache invalidation and SSR locale tests.
use artismaga_auth::{Auth, now, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_localisation::{Localisation, Settings};
use artismaga_studio::{Actor, Studio, WorkInput};
use serde_json::json;
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn localisation_drafts_and_work_approval_are_private_and_versioned() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("locale_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "synthetic localisation test password";
    auth.install(
        "owner@example.test".into(),
        "Owner".into(),
        password.into(),
        SignupMode::Open,
    )
    .await
    .unwrap();
    for (email, name) in [
        ("translator@example.test", "Translator"),
        ("reviewer@example.test", "Reviewer"),
        ("reader@example.test", "Reader"),
    ] {
        auth.register(email.into(), name.into(), password.into(), None)
            .await
            .unwrap();
    }
    store
        .query("UPDATE account SET email_verified=true", json!({}))
        .await
        .unwrap();
    let owner = store.by_email("owner@example.test").await.unwrap().unwrap();
    let writer = store
        .by_email("translator@example.test")
        .await
        .unwrap()
        .unwrap();
    let reviewer = store
        .by_email("reviewer@example.test")
        .await
        .unwrap()
        .unwrap();
    let reader = store
        .by_email("reader@example.test")
        .await
        .unwrap()
        .unwrap();
    let localisation = Localisation::new(store.clone());
    localisation
        .seed_identity("Test site", "Test discovery")
        .await
        .unwrap();
    localisation
        .register(
            "plugin.example",
            vec![artismaga_localisation::Definition {
                key: "plugin.example.greeting".into(),
                owner: "plugin.example".into(),
                description: "Example extension greeting".into(),
                defaults: std::collections::BTreeMap::from([(
                    "en".into(),
                    "Hello {reader}".into(),
                )]),
                placeholders: std::collections::BTreeMap::from([("reader".into(), "Alex".into())]),
            }],
        )
        .await
        .unwrap();
    localisation
        .edit(artismaga_localisation::Edit {
            key: "plugin.example.greeting",
            locale: "en",
            text: "Welcome {reader}",
            revision: 0,
            actor: &owner.uid,
            publish: false,
            discard: false,
        })
        .await
        .unwrap();
    assert_eq!(
        localisation.bundle("zh", false).await.unwrap()["plugin.example.greeting"],
        "Hello {reader}"
    );
    assert_eq!(
        localisation.bundle("zh", true).await.unwrap()["plugin.example.greeting"],
        "Welcome {reader}"
    );
    localisation
        .edit(artismaga_localisation::Edit {
            key: "discovery.headline",
            locale: "es",
            text: "Label:chapter.1",
            revision: 0,
            actor: &owner.uid,
            publish: false,
            discard: false,
        })
        .await
        .unwrap();
    assert_eq!(
        localisation.bundle("es", true).await.unwrap()["discovery.headline"],
        "Label:chapter.1"
    );
    assert_eq!(
        localisation.bundle("ja", false).await.unwrap()["site.name"],
        "Test site"
    );
    let key = "discovery.headline";
    localisation
        .edit(artismaga_localisation::Edit {
            key,
            locale: "ja",
            text: "秘密の見出し",
            revision: 0,
            actor: &owner.uid,
            publish: false,
            discard: false,
        })
        .await
        .unwrap();
    assert_ne!(
        localisation.bundle("ja", false).await.unwrap()[key],
        "秘密の見出し"
    );
    assert_eq!(
        localisation.bundle("ja", true).await.unwrap()[key],
        "秘密の見出し"
    );
    localisation
        .edit(artismaga_localisation::Edit {
            key,
            locale: "fr",
            text: "Un autre titre",
            revision: 0,
            actor: &owner.uid,
            publish: false,
            discard: false,
        })
        .await
        .unwrap();
    assert_eq!(
        localisation.bundle("ja", true).await.unwrap()[key],
        "秘密の見出し"
    );
    assert!(
        localisation
            .edit(artismaga_localisation::Edit {
                key,
                locale: "ja",
                text: "Unsaved publication",
                revision: 1,
                actor: &owner.uid,
                publish: true,
                discard: false
            })
            .await
            .is_err()
    );
    localisation
        .edit(artismaga_localisation::Edit {
            key,
            locale: "ja",
            text: "秘密の見出し",
            revision: 1,
            actor: &owner.uid,
            publish: true,
            discard: false,
        })
        .await
        .unwrap();
    assert_eq!(
        localisation.bundle("ja", false).await.unwrap()[key],
        "秘密の見出し"
    );
    assert!(
        localisation
            .edit(artismaga_localisation::Edit {
                key,
                locale: "ja",
                text: "Stale",
                revision: 1,
                actor: &owner.uid,
                publish: false,
                discard: false
            })
            .await
            .is_err()
    );
    assert!(
        localisation
            .edit(artismaga_localisation::Edit {
                key: "site.copyright",
                locale: "en",
                text: "Missing placeholders",
                revision: 0,
                actor: &owner.uid,
                publish: false,
                discard: false
            })
            .await
            .is_err()
    );
    localisation
        .save_settings(Settings {
            revision: 0,
            source_locale: "en".into(),
            enabled: vec!["en".into(), "ja".into()],
        })
        .await
        .unwrap();
    assert!(
        localisation
            .save_settings(Settings::default())
            .await
            .is_err()
    );
    let root = tempfile::tempdir().unwrap();
    let translator =
        artismaga_localisation::translation::Translator::new(store.clone(), root.path().into());
    let cache_key = artismaga_localisation::translation::cache_identity(
        "key:example.greeting",
        "en",
        "ja",
        "Source:version.1",
        0,
    )
    .unwrap();
    store.query("CREATE translation_cache SET key=$key,scope='key',value=$value,encoding='json',expires=$expiry,provider_revision=0",json!({"key":cache_key,"value":serde_json::to_string("翻訳:内容.1").unwrap(),"expiry":now()+10})).await.unwrap();
    assert_eq!(
        translator
            .text(
                "key:example.greeting",
                "en",
                "ja",
                "Source:version.1",
                now()
            )
            .await
            .unwrap(),
        "翻訳:内容.1"
    );
    assert!(
        translator
            .text("key:example.greeting", "en", "ja", "Changed source", now())
            .await
            .is_err()
    );
    assert!(
        translator
            .text(
                "key:example.greeting",
                "en",
                "ja",
                "Source:version.1",
                now() + 11
            )
            .await
            .is_err()
    );
    store.query("CREATE translation_cache SET key='fixture',value='cached',expires=$expiry,provider_revision=0",json!({"expiry":now()+86400})).await.unwrap();
    translator
        .save(artismaga_localisation::translation::Update {
            revision: 0,
            value: artismaga_localisation::translation::Policy {
                provider: "disabled".into(),
                cache_days: 30,
            },
            api_key: None,
        })
        .await
        .unwrap();
    let cache: Vec<serde_json::Value> = store
        .rows("SELECT * FROM translation_cache", json!({}))
        .await
        .unwrap();
    assert!(cache.is_empty());
    let studio = Studio::new(store.clone());
    let owner_actor = Actor {
        uid: &owner.uid,
        can_write: true,
        administrator: true,
    };
    let writer_actor = Actor {
        uid: &writer.uid,
        can_write: false,
        administrator: false,
    };
    let review_actor = Actor {
        uid: &reviewer.uid,
        can_write: false,
        administrator: false,
    };
    let reader_actor = Actor {
        uid: &reader.uid,
        can_write: false,
        administrator: false,
    };
    let work = studio
        .create(
            &owner_actor,
            WorkInput {
                title: "First light".into(),
                subtitle: "A story".into(),
                synopsis: "A library at sunset.".into(),
                work_type: "book".into(),
                cover: None,
                hero: None,
            },
            now(),
        )
        .await
        .unwrap();
    studio
        .translation_grants(
            &owner_actor,
            &work,
            artismaga_studio::translations::Access {
                recipients: std::slice::from_ref(&writer.uid),
                locale: "ja",
                can_draft: true,
                can_approve: false,
                remove: false,
            },
        )
        .await
        .unwrap();
    studio
        .translation_grants(
            &owner_actor,
            &work,
            artismaga_studio::translations::Access {
                recipients: std::slice::from_ref(&reviewer.uid),
                locale: "ja",
                can_draft: false,
                can_approve: true,
                remove: false,
            },
        )
        .await
        .unwrap();
    studio
        .share_many(
            &owner_actor,
            &work,
            std::slice::from_ref(&reader.uid),
            false,
            false,
        )
        .await
        .unwrap();
    studio
        .translation_grants(
            &owner_actor,
            &work,
            artismaga_studio::translations::Access {
                recipients: std::slice::from_ref(&writer.uid),
                locale: "fr",
                can_draft: true,
                can_approve: false,
                remove: false,
            },
        )
        .await
        .unwrap();
    let page = studio
        .translation_page(&writer_actor, &work, now(), Some(("overview", "ja")))
        .await
        .unwrap();
    let fields = std::collections::BTreeMap::from([
        ("title".into(), "最初の光".into()),
        ("subtitle".into(), "物語".into()),
        ("synopsis".into(), "夕暮れの図書館。".into()),
    ]);
    let update = |revision, approve| artismaga_studio::translations::Update {
        scope: "overview".into(),
        locale: "ja".into(),
        revision,
        fields: fields.clone(),
        source_hash: page.scopes[0].source_hash.clone(),
        approve,
    };
    assert!(
        studio
            .save_translation(&review_actor, &work, update(0, true), now())
            .await
            .is_err(),
        "approval requires a saved draft"
    );
    studio
        .save_translation(&writer_actor, &work, update(0, false), now())
        .await
        .unwrap();
    assert!(
        studio
            .save_translation(&writer_actor, &work, update(1, true), now())
            .await
            .is_err()
    );
    let hidden = studio
        .translation_page(&reader_actor, &work, now(), Some(("overview", "ja")))
        .await
        .unwrap();
    assert!(hidden.translations[0].value.draft.is_none());
    assert!(hidden.translations[0].value.live.is_none());
    studio
        .save_translation(&review_actor, &work, update(1, true), now())
        .await
        .unwrap();
    let approved = studio
        .translation_page(&reader_actor, &work, now(), Some(("overview", "ja")))
        .await
        .unwrap();
    assert_eq!(
        approved.translations[0].value.live.as_ref().unwrap()["title"],
        "最初の光"
    );
    store
        .query(
            "UPDATE work SET title='Changed source',revision=revision+1 WHERE uid=$work",
            json!({"work":work}),
        )
        .await
        .unwrap();
    assert!(
        studio
            .save_translation(&review_actor, &work, update(2, true), now())
            .await
            .is_err()
    );
    studio
        .translation_grants(
            &owner_actor,
            &work,
            artismaga_studio::translations::Access {
                recipients: std::slice::from_ref(&writer.uid),
                locale: "ja",
                can_draft: false,
                can_approve: false,
                remove: true,
            },
        )
        .await
        .unwrap();
    assert!(
        studio.get(&writer_actor, &work, None).await.is_ok(),
        "French access must survive Japanese grant revocation"
    );
    studio
        .translation_grants(
            &owner_actor,
            &work,
            artismaga_studio::translations::Access {
                recipients: std::slice::from_ref(&writer.uid),
                locale: "fr",
                can_draft: false,
                can_approve: false,
                remove: true,
            },
        )
        .await
        .unwrap();
    assert!(
        studio.get(&writer_actor, &work, None).await.is_err(),
        "translation-only access must be revoked"
    );
    let renderer = artismaga_render::PageRenderer::new(&config).unwrap();
    let client = rocket::local::asynchronous::Client::tracked(artismaga_web::build(
        artismaga_web::AppState::new(auth.clone(), config, renderer.clone())
            .with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    use rocket::http::{ContentType, Header, Status};
    let selected = client
        .post("/api/localisation/select")
        .remote("127.0.0.1:43000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(json!({"locale":"ja"}).to_string())
        .dispatch()
        .await;
    assert_eq!(selected.status(), Status::Ok);
    let home = client.get("/").dispatch().await;
    assert_eq!(home.status(), Status::Ok);
    let html = home.into_string().await.unwrap();
    assert!(html.contains("lang=\"ja\""));
    assert!(html.contains("秘密の見出し"));
    assert!(!html.contains("localisation_editor&quot;:{"));
    assert_eq!(client.post("/api/localisation/keys").remote("127.0.0.1:43000".parse().unwrap()).header(Header::new("Origin","http://localhost:8000")).header(ContentType::JSON).body(json!({"key":key,"locale":"ja","text":"No permission","revision":2,"publish":false,"discard":false}).to_string()).dispatch().await.status(),Status::Unauthorized);
    renderer.shutdown().await;
}
