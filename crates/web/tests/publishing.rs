//! Real-database publication boundaries and public catalogue regression coverage.
use artismaga_auth::{Auth, now, token};
use artismaga_config::Config;
use artismaga_core::SignupMode;
use artismaga_db::Store;
use artismaga_render::PageRenderer;
use artismaga_studio::{
    Actor, Studio, WorkInput, WorkUpdate,
    details::{Command, GenreSelection, Kind, TargetAudience, Update},
    publishing::Publish,
};
use artismaga_web::{AppState, build};
use rocket::{
    http::{ContentType, Header, Status},
    local::asynchronous::Client,
};
use serde_json::json;
#[rocket::async_test]
#[ignore = "requires private SurrealDB; run scripts/test-integration.sh"]
async fn public_snapshots_preserve_drafts_and_revoke_media() {
    let mut config = Config::bootstrap();
    config.database.url = std::env::var("TEST_DATABASE_URL").unwrap();
    config.database.database = format!("publishing_{}", token());
    let store = Store::new(config.database.clone()).unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let auth = Auth::new(store.clone(), config.clone()).unwrap();
    let password = "synthetic publishing regression password";
    auth.install(
        "publisher@example.test".into(),
        "Publisher".into(),
        password.into(),
        SignupMode::Open,
    )
    .await
    .unwrap();
    let owner = store
        .by_email("publisher@example.test")
        .await
        .unwrap()
        .unwrap();
    let actor = Actor {
        uid: &owner.uid,
        can_write: true,
        administrator: true,
    };
    let root = tempfile::tempdir().unwrap();
    let storage = artismaga_storage::Storage::new(store.clone(), root.path().into());
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::RgbImage::from_pixel(24, 36, image::Rgb([32, 64, 128]))
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    let cover = storage
        .upload(&owner.uid, "cover", bytes.get_ref().clone(), now())
        .await
        .unwrap();
    let hero = storage
        .upload(&owner.uid, "hero", bytes.get_ref().clone(), now())
        .await
        .unwrap();
    let chapter_cover = storage
        .upload(&owner.uid, "chapter_cover", bytes.into_inner(), now())
        .await
        .unwrap();
    let studio = Studio::new(store.clone());
    let time = now();
    let input = || WorkInput {
        title: "Public fixture".into(),
        subtitle: "Test subtitle".into(),
        synopsis: "Public synopsis".into(),
        work_type: "book".into(),
        cover: Some(cover.uid.clone()),
        hero: Some(hero.uid.clone()),
    };
    let uid = studio.create(&actor, input(), time).await.unwrap();
    assert!(studio.publications().await.unwrap().is_empty());
    assert!(!studio.public_asset(&cover.uid).await.unwrap());
    let publish_input = |revision, details_revision| Publish {
        revision,
        details_revision,
        language: "en".into(),
        status: "ongoing".into(),
        mature: false,
        disclosures_reviewed: true,
        related: vec![],
        release_schedule: Some(artismaga_studio::schedule::ReleaseSchedule {
            frequency: artismaga_studio::schedule::Frequency::Weekly,
            hour: 12,
            weekday: Some(5),
            month_day: None,
            timezone: "Australia/Sydney".into(),
        }),
    };
    assert!(
        studio
            .publish(&actor, &uid, publish_input(0, 0), time)
            .await
            .is_err()
    );
    let taxonomy = artismaga_administration::taxonomy::load(&store)
        .await
        .unwrap();
    let genre = taxonomy
        .value
        .genres
        .iter()
        .find(|g| g.parent.is_none())
        .unwrap()
        .key
        .clone();
    let commands = [
        Command::Metadata {
            genres: vec![GenreSelection {
                genre: genre.clone(),
                subgenre: None,
            }],
            tags: vec![],
            disclosures: Default::default(),
        },
        Command::Audience {
            target_audience: TargetAudience {
                minimum_age: Some(18),
                maximum_age: None,
            },
        },
        Command::SaveNode {
            disclosures: vec![artismaga_studio::details::Disclosure::Assault],
            uid: None,
            kind: Kind::Chapter,
            parent: None,
            title: "First chapter".into(),
            synopsis: "Chapter blurb".into(),
            cover: Some(chapter_cover.uid.clone()),
        },
    ];
    let mut details = studio.details(&actor, &uid, time).await.unwrap();
    for command in commands {
        details = studio
            .change_details(
                &actor,
                &uid,
                Update {
                    revision: details.revision,
                    command,
                },
                time,
            )
            .await
            .unwrap();
    }
    let chapter = details.value.nodes[0].uid.clone();
    assert!(studio.reader(&uid, &chapter).await.unwrap().is_none());
    let manuscript = artismaga_studio::writing::Manuscript {
        chapter_note: "PRIVATE_OUTLINE_FIXTURE_917".into(),
        ..Default::default()
    };
    studio
        .save_writing(
            &actor,
            &uid,
            &chapter,
            artismaga_studio::writing::Save {
                revision: 0,
                value: manuscript,
                checkpoint: true,
            },
            time,
        )
        .await
        .unwrap();
    let before = studio.get(&actor, &uid, None).await.unwrap().work;
    assert!(
        studio
            .publish(
                &actor,
                &uid,
                publish_input(before.revision, details.revision),
                time
            )
            .await
            .is_err()
    );
    studio
        .publish_chapter(&actor, &uid, &chapter, 1, time)
        .await
        .unwrap();
    assert!(
        studio.reader(&uid, &chapter).await.unwrap().is_none(),
        "staged chapter is private before story publication"
    );
    let work = studio.get(&actor, &uid, None).await.unwrap().work;
    let unauthorized = Actor {
        uid: "usr_unrelated",
        can_write: true,
        administrator: false,
    };
    assert!(
        studio
            .publish(
                &unauthorized,
                &uid,
                publish_input(work.revision, details.revision),
                time
            )
            .await
            .is_err()
    );
    let (one, two) = tokio::join!(
        studio.publish(
            &actor,
            &uid,
            publish_input(work.revision, details.revision),
            time
        ),
        studio.publish(
            &actor,
            &uid,
            publish_input(work.revision, details.revision),
            time
        )
    );
    assert_ne!(
        one.is_ok(),
        two.is_ok(),
        "only one concurrent publication may consume a work revision"
    );
    let published = studio.publication(&uid).await.unwrap().unwrap();
    let public_body = studio.reader(&uid, &chapter).await.unwrap().unwrap();
    assert_eq!(public_body.body.revision, 1);
    assert!(
        !serde_json::to_string(&public_body)
            .unwrap()
            .contains("PRIVATE_OUTLINE_FIXTURE_917")
    );
    use artismaga_studio::reader::{Configuration, ReadingState};
    let state = ReadingState {
        position: 0.4,
        reactions: vec!["upvote".into()],
        rating: Some(0),
        ..Default::default()
    };
    let (left, right) = tokio::join!(
        studio.save_reading_state(&owner.uid, &uid, &chapter, state.clone(), time),
        studio.save_reading_state(&owner.uid, &uid, &chapter, state, time)
    );
    assert_ne!(left.is_ok(), right.is_ok());
    let saved = studio
        .reading_state(&owner.uid, &uid, &chapter)
        .await
        .unwrap();
    assert_eq!(saved.revision, 1);
    assert_eq!(saved.rating, Some(0));
    let measured = studio.chapter_stats(&uid).await.unwrap();
    assert_eq!(measured[0].feedback.ratings, 1);
    assert_eq!(measured[0].feedback.reactions["upvote"], 1);
    let viewer = artismaga_auth::digest("synthetic reader browser");
    let (a, b) = tokio::join!(
        studio.record_reading(&uid, &chapter, &viewer, 0.0, time),
        studio.record_reading(&uid, &chapter, &viewer, 1.0, time)
    );
    a.unwrap();
    b.unwrap();
    studio
        .record_reading(&uid, &chapter, &viewer, 1.0, time)
        .await
        .unwrap();
    let measured = studio.chapter_stats(&uid).await.unwrap();
    assert_eq!(measured[0].counts.views, 1);
    assert_eq!(measured[0].counts.completions, 1);
    assert_eq!(
        studio
            .studio_analytics(&actor, &uid)
            .await
            .unwrap()
            .days
            .len(),
        1
    );
    assert!(studio.studio_analytics(&unauthorized, &uid).await.is_err());
    assert!(
        studio
            .popular_scores(std::slice::from_ref(&uid))
            .await
            .unwrap()[&uid]
            > 0
    );
    let mut feedback = saved.clone();
    feedback.rating = Some(5);
    feedback.reactions.clear();
    studio
        .save_reading_state(&owner.uid, &uid, &chapter, feedback, time + 1)
        .await
        .unwrap();
    let measured = studio.chapter_stats(&uid).await.unwrap();
    assert_eq!(measured[0].feedback.ratings, 1);
    assert_eq!(measured[0].feedback.rating_sum, 5);
    assert_eq!(measured[0].feedback.reactions["upvote"], 0);

    assert_eq!(
        studio
            .reading_state("usr_other", &uid, &chapter)
            .await
            .unwrap()
            .position,
        0.0
    );
    auth.register(
        "metrics-reader@example.test".into(),
        "Synthetic reader".into(),
        password.into(),
        None,
    )
    .await
    .unwrap();
    let other = store
        .by_email("metrics-reader@example.test")
        .await
        .unwrap()
        .unwrap();
    community_regression(
        &studio, &store, &auth, &owner.uid, &other.uid, &uid, &chapter, time,
    )
    .await;
    studio
        .save_reading_state(
            &other.uid,
            &uid,
            &chapter,
            ReadingState {
                rating: Some(4),
                reactions: vec!["upvote".into()],
                ..Default::default()
            },
            time,
        )
        .await
        .unwrap();
    assert_eq!(
        studio.chapter_stats(&uid).await.unwrap()[0]
            .feedback
            .ratings,
        2
    );
    artismaga_accounts::Accounts::new(store.clone())
        .delete(&auth, &other.uid, password.into(), "DELETE")
        .await
        .unwrap();
    let after_delete = studio.chapter_stats(&uid).await.unwrap();
    assert_eq!(after_delete[0].feedback.ratings, 1);
    assert_eq!(after_delete[0].feedback.rating_sum, 5);
    assert_eq!(after_delete[0].feedback.reactions["upvote"], 0);
    let mut config_reactions = Configuration::default();
    config_reactions.reactions.reverse();
    studio
        .configure_reactions(&owner.uid, config_reactions.clone())
        .await
        .unwrap();
    assert!(
        studio
            .configure_reactions(&owner.uid, config_reactions)
            .await
            .is_err()
    );
    assert_eq!(
        studio.reaction_configuration().await.unwrap().reactions[0].id,
        "sad"
    );
    let custom = storage
        .upload(
            &owner.uid,
            "reaction",
            storage.bytes(&cover).await.unwrap(),
            time,
        )
        .await
        .unwrap();
    let mut reaction_policy = studio.reaction_configuration().await.unwrap();
    reaction_policy.reactions[0].image = format!("/media/{}", custom.uid);
    studio
        .configure_reactions(&owner.uid, reaction_policy)
        .await
        .unwrap();
    let mut reaction_policy = studio.reaction_configuration().await.unwrap();
    reaction_policy.reactions[0].image = "/assets/reactions/1f408-200d-2b1b.png".into();
    studio
        .configure_reactions(&owner.uid, reaction_policy)
        .await
        .unwrap();
    assert!(
        storage.asset(&custom.uid).await.unwrap().is_none(),
        "replacing custom art queues its deletion"
    );
    let unused = storage
        .upload(
            &owner.uid,
            "reaction",
            storage.bytes(&cover).await.unwrap(),
            time,
        )
        .await
        .unwrap();
    studio
        .configure_reactions_retiring(
            &owner.uid,
            studio.reaction_configuration().await.unwrap(),
            &[format!("/media/{}", unused.uid)],
        )
        .await
        .unwrap();
    assert!(
        storage.asset(&unused.uid).await.unwrap().is_none(),
        "replaced unsaved custom art is also retired on save"
    );
    assert!(
        studio
            .publish_chapter(&unauthorized, &uid, &chapter, 1, time)
            .await
            .is_err()
    );
    assert!(
        studio
            .publish_chapter(&actor, &uid, &chapter, 0, time)
            .await
            .is_err()
    );
    studio
        .publish_chapter(&actor, &uid, &chapter, 1, time)
        .await
        .unwrap();
    assert_eq!(
        studio.get(&actor, &uid, None).await.unwrap().work.status,
        "ongoing"
    );
    assert!(
        studio
            .list(&actor, "", "drafts", "edited", 0)
            .await
            .unwrap()
            .works
            .is_empty()
    );
    let raw: Vec<String> = store
        .rows(
            "SELECT VALUE status FROM work WHERE uid=$uid",
            json!({"uid":uid}),
        )
        .await
        .unwrap();
    assert_eq!(
        raw,
        vec!["draft"],
        "public status projection must not expose private draft fields to existing status-based queries"
    );
    assert_eq!(published.release_schedule.as_ref().unwrap().hour, 12);
    assert_eq!(
        published.release_schedule.as_ref().unwrap().timezone,
        "Australia/Sydney"
    );

    assert!(
        published.mature,
        "adult audience cannot bypass mature notices"
    );
    assert_eq!(published.chapter_dates[&chapter].released_at, time);
    assert!(studio.public_asset(&cover.uid).await.unwrap());
    let summaries = studio.publications().await.unwrap();
    assert_eq!(summaries.len(), 1);
    assert!(summaries[0].details.nodes.is_empty());
    let renderer = PageRenderer::new(&config).unwrap();
    let guest = Client::tracked(build(
        AppState::new(auth.clone(), config.clone(), renderer.clone())
            .with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    assert_eq!(
        guest
            .get(format!("/media/{}", cover.uid))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    for name in [
        "fantasy",
        "science-fiction",
        "romance",
        "mystery",
        "thriller",
        "horror",
        "adventure",
        "drama",
        "comedy",
        "speculative",
        "historical",
        "western",
    ] {
        let response = guest
            .get(format!("/assets/genres/{name}.webp"))
            .dispatch()
            .await;
        assert_eq!(response.status(), Status::Ok);
        assert_eq!(response.content_type().unwrap().to_string(), "image/webp");
    }
    let response = guest.get(format!("/read/{uid}/{chapter}")).dispatch().await;
    assert_eq!(response.status(), Status::Ok);
    let reader_html = response.into_string().await.unwrap();
    assert!(reader_html.contains("depictions of assault"));
    assert!(!reader_html.contains("PRIVATE_OUTLINE_FIXTURE_917"));
    assert!(!reader_html.contains(&owner.password_hash));
    let response = guest.get(format!("/stories/{uid}")).dispatch().await;
    assert_eq!(response.status(), Status::Ok);
    let html = response.into_string().await.unwrap();
    assert!(html.contains("Public synopsis"));
    assert!(html.contains("First chapter"));
    // Software translation keys may mention password_hash; actual fields and values must be absent.
    assert!(!html.contains("&quot;password_hash&quot;:"));
    assert!(!html.contains(&owner.password_hash));
    assert!(!html.contains("PRIVATE_OUTLINE_FIXTURE_917"));
    assert_eq!(
        guest
            .get(format!("/discover/genres/{genre}"))
            .dispatch()
            .await
            .status(),
        Status::Ok
    );
    use artismaga_studio::lifecycle::Lifecycle;
    studio
        .save_lifecycle(
            &actor,
            &uid,
            Lifecycle {
                status: "hiatus".into(),
                hiatus_until: Some(time - 1),
                ..Default::default()
            },
            time,
        )
        .await
        .unwrap();
    assert_eq!(
        studio.publication(&uid).await.unwrap().unwrap().status,
        "hiatus"
    );
    studio
        .transition_abandoned(time + 400 * 86400, Some(2))
        .await
        .unwrap();
    assert_eq!(
        studio.publication(&uid).await.unwrap().unwrap().status,
        "hiatus",
        "hiatus never transitions automatically"
    );
    assert!(
        studio
            .save_lifecycle(&unauthorized, &uid, Lifecycle::default(), time)
            .await
            .is_err()
    );
    studio
        .save_lifecycle(
            &actor,
            &uid,
            Lifecycle {
                revision: 1,
                ..Default::default()
            },
            time,
        )
        .await
        .unwrap();
    let deadline = artismaga_studio::lifecycle::after_months(time, 6).unwrap();
    studio
        .transition_abandoned(deadline + 1, None)
        .await
        .unwrap();
    assert_eq!(
        studio.publication(&uid).await.unwrap().unwrap().status,
        "ongoing"
    );
    studio
        .transition_abandoned(deadline - 1, Some(2))
        .await
        .unwrap();
    assert_eq!(
        studio.publication(&uid).await.unwrap().unwrap().status,
        "ongoing"
    );
    studio
        .transition_abandoned(deadline + 1, Some(2))
        .await
        .unwrap();
    assert_eq!(
        studio.publication(&uid).await.unwrap().unwrap().status,
        "abandoned"
    );
    studio
        .save_lifecycle(
            &actor,
            &uid,
            Lifecycle {
                revision: 3,
                ..Default::default()
            },
            time,
        )
        .await
        .unwrap();
    let current = studio.get(&actor, &uid, None).await.unwrap().work;
    let mut draft = input();
    draft.title = "Unpublished private title".into();
    studio
        .update(
            &actor,
            &uid,
            WorkUpdate {
                revision: current.revision,
                value: draft,
            },
            time + 1,
        )
        .await
        .unwrap();
    assert_eq!(
        studio.publication(&uid).await.unwrap().unwrap().title,
        "Public fixture"
    );
    assert!(
        studio
            .publish(
                &actor,
                &uid,
                publish_input(current.revision, details.revision),
                time + 1
            )
            .await
            .is_err()
    );
    // An unpublished work can create a fresh public snapshot using its current revisions.
    let current = studio.get(&actor, &uid, None).await.unwrap().work;
    studio
        .unpublish(&actor, &uid, current.revision)
        .await
        .unwrap();
    assert!(studio.publication(&uid).await.unwrap().is_none());
    assert!(studio.reader(&uid, &chapter).await.unwrap().is_none());
    let saved = studio
        .reading_state(&owner.uid, &uid, &chapter)
        .await
        .unwrap();
    assert!(
        studio
            .save_reading_state(&owner.uid, &uid, &chapter, saved, time + 2)
            .await
            .is_err()
    );
    let current = studio.get(&actor, &uid, None).await.unwrap().work;
    let details = studio.details(&actor, &uid, time + 2).await.unwrap();
    studio
        .publish(
            &actor,
            &uid,
            publish_input(current.revision, details.revision),
            time + 2,
        )
        .await
        .unwrap();
    assert!(studio.publication(&uid).await.unwrap().is_some());
    let author = Client::tracked(build(
        AppState::new(auth, config, renderer.clone()).with_storage_root(root.path().into()),
    ))
    .await
    .unwrap();
    let login = author
        .post("/api/auth/login")
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "http://localhost:8000"))
        .header(ContentType::JSON)
        .body(json!({"email":"publisher@example.test","password":password}).to_string())
        .dispatch()
        .await;
    assert_eq!(login.status(), Status::Ok);
    let own_state = author
        .get(format!("/api/reader/{uid}/{chapter}/state"))
        .dispatch()
        .await;
    assert_eq!(own_state.status(), Status::Ok);
    let body = own_state.into_json::<serde_json::Value>().await.unwrap();
    assert_eq!(body["account"], owner.uid);
    for (account, expected) in [
        ("usr_other", Status::Conflict),
        (owner.uid.as_str(), Status::Ok),
    ] {
        let response = author
            .post(format!("/api/reader/{uid}/{chapter}/state"))
            .remote("127.0.0.1:45000".parse().unwrap())
            .header(Header::new("Origin", "http://localhost:8000"))
            .header(ContentType::JSON)
            .body(json!({"account":account,"state":body["state"]}).to_string())
            .dispatch()
            .await;
        assert_eq!(response.status(), expected);
    }

    for (origin, account, expected) in [
        (
            "https://untrusted.example",
            owner.uid.as_str(),
            Status::Forbidden,
        ),
        ("http://localhost:8000", "usr_changed", Status::Conflict),
    ] {
        let response=author.post(format!("/api/comments/{uid}/{chapter}"))
            .remote("127.0.0.1:45000".parse().unwrap())
            .header(Header::new("Origin",origin)).header(ContentType::JSON)
            .body(json!({"account":account,"command":{"action":"create","body":"Synthetic HTTP comment"}}).to_string()).dispatch().await;
        assert_eq!(response.status(), expected);
    }
    let inbox = author.get("/api/notifications").dispatch().await;
    assert_eq!(inbox.status(), Status::Ok);
    assert_eq!(inbox.headers().get_one("Cache-Control"), Some("no-store"));
    let anonymous = guest.get("/api/notifications").dispatch().await;
    assert_eq!(anonymous.status(), Status::Unauthorized);

    let foreign = author
        .post(format!("/api/reader/{uid}/{chapter}/state"))
        .remote("127.0.0.1:45000".parse().unwrap())
        .header(Header::new("Origin", "https://untrusted.example"))
        .header(ContentType::JSON)
        .body(body["state"].to_string())
        .dispatch()
        .await;
    assert_eq!(foreign.status(), Status::Forbidden);
    let public = author
        .get(format!("/read/{uid}/{chapter}"))
        .dispatch()
        .await
        .into_string()
        .await
        .unwrap();
    assert!(
        !public.contains(&owner.uid),
        "downloadable SSR must remain anonymous even with a session"
    );
    let current = studio.get(&actor, &uid, None).await.unwrap().work;
    assert_eq!(
        author
            .post(format!("/api/studio/works/{uid}/unpublish"))
            .remote("127.0.0.1:45000".parse().unwrap())
            .header(Header::new("Origin", "https://untrusted.example"))
            .header(ContentType::JSON)
            .body(json!({"revision":current.revision}).to_string())
            .dispatch()
            .await
            .status(),
        Status::Forbidden
    );
    for (path, body) in [
        (
            format!("/api/studio/stories/{uid}/feature"),
            json!({"featured":true}),
        ),
        (
            format!("/api/studio/stories/{uid}/hide"),
            json!({"author":false}),
        ),
    ] {
        assert_eq!(
            author
                .post(path)
                .remote("127.0.0.1:45000".parse().unwrap())
                .header(Header::new("Origin", "http://localhost:8000"))
                .header(ContentType::JSON)
                .body(body.to_string())
                .dispatch()
                .await
                .status(),
            Status::Ok
        );
    }
    assert!(studio.publication(&uid).await.unwrap().unwrap().featured);
    let accounts = artismaga_accounts::Accounts::new(store.clone());
    let own = accounts.own(&owner.uid).await.unwrap();
    assert!(own.preferences.content.hidden_stories.contains(&uid));
    let mut preferences = own.preferences;
    preferences.content.mature_content = "hide".into();
    accounts
        .save_preferences(
            &owner.uid,
            artismaga_accounts::PreferencesUpdate {
                revision: own.preferences_revision,
                preferences,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        author
            .get(format!("/stories/{uid}"))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    let response = author.get("/").dispatch().await;
    assert_eq!(response.status(), Status::Ok);
    assert!(
        !response
            .into_string()
            .await
            .unwrap()
            .contains("Public fixture")
    );
    studio
        .change_details(
            &actor,
            &uid,
            Update {
                revision: details.revision,
                command: Command::Archive {
                    uid: chapter.clone(),
                },
            },
            time,
        )
        .await
        .unwrap();
    studio.purge_chapters(time + 604800).await.unwrap();
    assert!(
        storage.asset(&chapter_cover.uid).await.unwrap().is_some(),
        "public snapshot keeps retired chapter artwork alive"
    );
    let current = studio.get(&actor, &uid, None).await.unwrap().work;
    studio
        .unpublish(&actor, &uid, current.revision)
        .await
        .unwrap();
    assert_eq!(
        guest
            .get(format!("/stories/{uid}"))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    assert_eq!(
        guest
            .get(format!("/media/{}", cover.uid))
            .dispatch()
            .await
            .status(),
        Status::NotFound
    );
    assert_eq!(
        studio.get(&actor, &uid, None).await.unwrap().work.status,
        "draft"
    );
    assert!(!studio.public_asset(&chapter_cover.uid).await.unwrap());
    studio.purge_chapters(time + 604801).await.unwrap();
    assert!(storage.asset(&chapter_cover.uid).await.unwrap().is_none());
    renderer.shutdown().await;
}

#[allow(clippy::too_many_arguments)]
async fn community_regression(
    studio: &Studio,
    store: &Store,
    auth: &Auth,
    owner: &str,
    other: &str,
    work: &str,
    chapter: &str,
    time: i64,
) {
    use artismaga_studio::community::Command;
    let command =
        |action: &str, uid: &str, revision: i64, parent: Option<String>, body: &str| Command {
            action: action.into(),
            uid: uid.into(),
            revision,
            parent,
            body: body.into(),
            gif: None,
        };
    assert!(
        studio
            .comment_command(
                other,
                work,
                chapter,
                command("create", "", 0, None, "unverified"),
                time
            )
            .await
            .is_err()
    );
    store
        .query(
            "UPDATE account SET email_verified=true WHERE uid=$uid",
            json!({"uid":other}),
        )
        .await
        .unwrap();
    studio
        .comment_command(
            other,
            work,
            chapter,
            command("create", "", 0, None, "**Synthetic comment**"),
            time,
        )
        .await
        .unwrap();
    let rows = studio.comments(work, chapter, Some(owner)).await.unwrap();
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert!(!row.avatar.contains("@"));
    let notices = studio.notifications(owner).await.unwrap();
    assert_eq!(notices.len(), 1);
    assert!(studio.notifications(other).await.unwrap().is_empty());
    let notice = notices[0]["uid"].as_str().unwrap();
    studio
        .notification_command(other, notice, true)
        .await
        .unwrap();
    assert_eq!(studio.notifications(owner).await.unwrap().len(), 1);
    studio
        .notification_command(owner, notice, false)
        .await
        .unwrap();
    assert_eq!(studio.notifications(owner).await.unwrap()[0]["read"], true);
    // Ownership is checked independently of administrator delete rights.
    assert!(
        studio
            .comment_command(
                owner,
                work,
                chapter,
                command("edit", &row.uid, row.revision, None, "forged edit"),
                time
            )
            .await
            .is_err()
    );
    let (a, b) = tokio::join!(
        studio.comment_command(
            other,
            work,
            chapter,
            command("edit", &row.uid, row.revision, None, "first edit"),
            time
        ),
        studio.comment_command(
            other,
            work,
            chapter,
            command("edit", &row.uid, row.revision, None, "second edit"),
            time
        )
    );
    assert_ne!(a.is_ok(), b.is_ok());
    studio
        .comment_command(
            owner,
            work,
            chapter,
            command("create", "", 0, Some(row.uid.clone()), "||reply||"),
            time + 1,
        )
        .await
        .unwrap();
    assert_eq!(studio.notifications(other).await.unwrap().len(), 1);
    studio
        .comment_command(
            owner,
            work,
            chapter,
            command("like", &row.uid, 0, None, ""),
            time,
        )
        .await
        .unwrap();
    let liked = studio.comments(work, chapter, Some(owner)).await.unwrap();
    assert_eq!(liked[0].likes, 1);
    assert!(liked[0].liked);
    studio
        .comment_command(
            owner,
            work,
            chapter,
            command("like", &row.uid, 0, None, ""),
            time,
        )
        .await
        .unwrap();
    let rows = studio.comments(work, chapter, None).await.unwrap();
    assert_eq!(rows[0].likes, 0);
    studio
        .comment_command(
            owner,
            work,
            chapter,
            command("mute", &row.uid, 0, None, ""),
            time,
        )
        .await
        .unwrap();
    studio
        .comment_command(
            other,
            work,
            chapter,
            command("create", "", 0, None, "muted notification"),
            time + 2,
        )
        .await
        .unwrap();
    assert!(studio.notifications(owner).await.unwrap().is_empty());
    let fresh = studio.comments(work, chapter, None).await.unwrap();
    let target = fresh.iter().find(|r| r.uid == row.uid).unwrap();
    studio
        .comment_command(
            owner,
            work,
            chapter,
            command("delete", &row.uid, target.revision, None, ""),
            time,
        )
        .await
        .unwrap();
    let rows = studio.comments(work, chapter, None).await.unwrap();
    assert!(rows[0].deleted);
    assert!(rows[0].body.is_empty());
    assert!(rows[1].parent.is_some());
    // A delegated manager can delete another account's reply without Comment permission.
    store.query("CREATE permission_group:comment_moderator SET key='comment_moderator',name='Comment moderator',permissions=['manage_comments'],revision=0; UPDATE account SET group_key='comment_moderator' WHERE uid=$uid",json!({"uid":other})).await.unwrap();
    let reply = rows.iter().find(|r| r.parent.is_some()).unwrap();
    studio
        .comment_command(
            other,
            work,
            chapter,
            command("delete", &reply.uid, reply.revision, None, ""),
            time,
        )
        .await
        .unwrap();
    assert!(
        studio
            .comments(work, chapter, None)
            .await
            .unwrap()
            .iter()
            .find(|r| r.uid == reply.uid)
            .unwrap()
            .deleted
    );
    assert!(
        studio
            .comment_command(
                other,
                work,
                chapter,
                command("create", "", 0, Some(row.uid.clone()), "invalid reply"),
                time
            )
            .await
            .is_err()
    );
    store
        .query(
            "UPDATE account SET group_key='reader' WHERE uid=$uid",
            json!({"uid":other}),
        )
        .await
        .unwrap();
    // Current persisted role revocation overrides the previously authenticated account.
    store
        .query(
            "UPDATE account SET email_verified=false WHERE uid=$uid",
            json!({"uid":other}),
        )
        .await
        .unwrap();
    assert!(
        studio
            .comment_command(
                other,
                work,
                chapter,
                command("create", "", 0, None, "revoked"),
                time
            )
            .await
            .is_err()
    );
    assert!(
        !auth
            .allowed(
                &store.by_uid(other).await.unwrap().unwrap(),
                artismaga_core::Permission::Comment
            )
            .await
            .unwrap()
    );
}
