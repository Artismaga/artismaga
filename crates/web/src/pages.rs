//! Request-specific SSR DTO assembly and nonce-scoped Mantine stylesheet policy.
use crate::{AppState, admin, administration};
use artismaga_accounts::Accounts;
use rocket::{
    http::{CookieJar, Header, Status},
    response::content::RawHtml,
};
use serde_json::json;
#[derive(rocket::response::Responder)]
pub struct PageResponse {
    body: RawHtml<String>,
    policy: Header<'static>,
}
pub fn response(html: String, nonce: &str) -> PageResponse {
    PageResponse {
        body: RawHtml(html),
        policy: Header::new(
            "Content-Security-Policy",
            format!(
                "default-src 'none'; script-src 'self'; style-src 'self' 'nonce-{nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' https://www.gravatar.com https://static.klipy.com https://static1.klipy.com https://static2.klipy.com data:; connect-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'"
            ),
        ),
    }
}
pub async fn render(
    state: &AppState,
    jar: &CookieJar<'_>,
    page: &str,
) -> Result<PageResponse, Status> {
    render_tab(state, jar, page, "", None).await
}
pub async fn render_tab(
    state: &AppState,
    jar: &CookieJar<'_>,
    page: &str,
    section: &str,
    studio: Option<serde_json::Value>,
) -> Result<PageResponse, Status> {
    render_context(state, jar, page, section, studio, "", 1).await
}
pub async fn render_discovery(
    state: &AppState,
    jar: &CookieJar<'_>,
    genre: &str,
    subgenre: &str,
    catalogue_page: u32,
) -> Result<PageResponse, Status> {
    render_context(state, jar, "genre", genre, None, subgenre, catalogue_page).await
}
async fn render_context(
    state: &AppState,
    jar: &CookieJar<'_>,
    page: &str,
    section: &str,
    studio: Option<serde_json::Value>,
    subgenre: &str,
    catalogue_page: u32,
) -> Result<PageResponse, Status> {
    let account = match jar.get("session").filter(|_| page != "reader") {
        Some(c) => state
            .auth
            .current(c.value())
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        None => None,
    };
    let settings = administration::service(state)
        .configuration()
        .await
        .map_err(|_| {
            eprintln!("Page assembly failed at line {}", line!());
            Status::ServiceUnavailable
        })?;
    let own = match &account {
        Some(u) => Some(
            Accounts::new(state.auth.store.clone())
                .own(&u.uid)
                .await
                .map_err(|_| Status::ServiceUnavailable)?,
        ),
        None => None,
    };
    let permissions = match &account {
        Some(u) => state
            .auth
            .permissions(u)
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        None => Vec::new(),
    };
    let locale_service = artismaga_localisation::Localisation::new(state.auth.store.clone());
    locale_service
        .seed_identity(
            &settings.configuration.site_name,
            &settings.configuration.tagline,
        )
        .await
        .map_err(|_| {
            eprintln!("Page assembly failed at line {}", line!());
            Status::ServiceUnavailable
        })?;
    let locale_settings = locale_service.settings().await.map_err(|_| {
        eprintln!("Page assembly failed at line {}", line!());
        Status::ServiceUnavailable
    })?;
    let selected = jar
        .get("locale")
        .map(|c| c.value().to_owned())
        .or_else(|| own.as_ref().map(|a| a.preferences.content.language.clone()))
        .unwrap_or_else(|| locale_settings.source_locale.clone());
    let selected = if locale_settings.enabled.contains(&selected) {
        selected
    } else {
        locale_settings.source_locale.clone()
    };
    let preview = permissions.contains(&artismaga_core::Permission::ConfigureLocalisation)
        && jar.get("locale_preview").is_none_or(|c| c.value() != "off");
    let messages = locale_service
        .bundle(&selected, preview)
        .await
        .map_err(|_| {
            eprintln!("Page assembly failed at line {}", line!());
            Status::ServiceUnavailable
        })?;
    let localisation_editor = if page == "admin" && section == "localisation" {
        if !permissions.contains(&artismaga_core::Permission::ConfigureLocalisation) {
            return Err(Status::Forbidden);
        }
        Some(
            json!({"settings":locale_settings,"definitions":locale_service.definitions().await.map_err(|_|Status::ServiceUnavailable)?,"overrides":locale_service.overrides().await.map_err(|_|Status::ServiceUnavailable)?,"translation":state.translator.settings().await.map_err(|_|Status::ServiceUnavailable)?,"runtime":state.translator.local.status().await}),
        )
    } else {
        None
    };
    let administrator = if page == "admin"
        && permissions.contains(&artismaga_core::Permission::Administer)
    {
        let user = account.as_ref().ok_or(Status::Unauthorized)?;
        admin(state, user).await.map_err(|e| e.0)?;
        Some(
            json!({"settings":settings,"users":administration::service(state).users(0,"").await.map_err(|_|Status::ServiceUnavailable)?,"mail_enabled":state.auth.mail_enabled(),"analytics_status":"not_connected","roles":artismaga_administration::roles::list(&state.auth.store).await.map_err(|_|Status::ServiceUnavailable)?,"taxonomy":artismaga_administration::taxonomy::load(&state.auth.store).await.map_err(|_|Status::ServiceUnavailable)?,"storage":state.storage.settings().await.map_err(|_|Status::ServiceUnavailable)?}),
        )
    } else {
        None
    };
    let announcements = if page == "home" || (page == "admin" && section == "announcements") {
        let mut rows = if page == "admin" {
            artismaga_administration::announcements::history(&state.auth.store, 0, "").await
        } else {
            artismaga_administration::announcements::visible_list(
                &state.auth.store,
                account.as_ref().map(|u| u.group_key.as_str()),
                false,
                artismaga_auth::now(),
            )
            .await
        }
        .map_err(|_| Status::ServiceUnavailable)?;
        let manager = permissions.contains(&artismaga_core::Permission::ManageAnnouncements);
        rows.retain(|a| {
            (page == "admin" && manager)
                || artismaga_administration::announcements::visible(
                    a,
                    account.as_ref().map(|u| u.group_key.as_str()),
                    false,
                    artismaga_auth::now(),
                )
        });
        if page == "home"
            && own
                .as_ref()
                .is_none_or(|a| a.preferences.content.automatic_translations)
            && selected != locale_settings.source_locale
        {
            for row in &mut rows {
                for (field, text) in [
                    ("title", &mut row.value.title),
                    ("description", &mut row.value.description),
                    ("cta", &mut row.value.cta_text),
                ] {
                    if let Ok(Some(translated)) = state
                        .translator
                        .cached_or_schedule(
                            &format!("announcement:{}:{field}", row.uid),
                            &locale_settings.source_locale,
                            &selected,
                            text,
                            artismaga_auth::now(),
                        )
                        .await
                    {
                        *text = translated;
                    }
                }
            }
        }
        serde_json::to_value(rows).map_err(|_| Status::ServiceUnavailable)?
    } else {
        json!([])
    };
    let appearance = own.as_ref().map(
        |a| json!({"reading":a.preferences.reading,"accessibility":a.preferences.accessibility}),
    );
    let timezone = own
        .as_ref()
        .map(|a| a.preferences.content.timezone.clone())
        .unwrap_or_else(|| settings.configuration.timezone.clone());
    let discovery = if matches!(page, "home" | "genre" | "story") {
        let service = crate::studio::service(state);
        let mut stories = service
            .publications()
            .await
            .map_err(|_| Status::ServiceUnavailable)?;
        if page == "story" {
            let selected_story = service
                .publication(section)
                .await
                .map_err(|_| Status::ServiceUnavailable)?
                .ok_or(Status::NotFound)?;
            for related in &selected_story.related {
                if !stories.iter().any(|s| &s.uid == related)
                    && let Some(mut linked) = service
                        .publication(related)
                        .await
                        .map_err(|_| Status::ServiceUnavailable)?
                {
                    linked.details.nodes.clear();
                    linked.chapter_dates.clear();
                    linked.details.disclosures = Default::default();
                    linked.synopsis = linked.synopsis.chars().take(600).collect();
                    stories.push(linked);
                }
            }
            stories.retain(|s| s.uid != section);
            stories.insert(0, selected_story);
        }
        for story in &mut stories {
            if page != "story" || story.uid != section {
                story.details.nodes.clear();
                story.chapter_dates.clear();
                story.details.disclosures = Default::default();
                story.synopsis = story.synopsis.chars().take(600).collect();
            }
        }
        let work_ids: Vec<String> = stories.iter().map(|s| s.uid.clone()).collect();
        let scores = service
            .popular_scores(&work_ids)
            .await
            .map_err(|_| Status::ServiceUnavailable)?;
        let mut resume = std::collections::BTreeMap::new();
        if let Some(user) = &account {
            for row in service
                .continue_reading(&user.uid)
                .await
                .map_err(|_| Status::ServiceUnavailable)?
            {
                if resume.len() >= 12 {
                    break;
                }
                if work_ids.contains(&row.work)
                    && !resume.contains_key(&row.work)
                    && service
                        .reader(&row.work, &row.chapter)
                        .await
                        .map_err(|_| Status::ServiceUnavailable)?
                        .is_some()
                {
                    resume.insert(row.work.clone(), row);
                }
            }
        }
        let chapter_stats = if page == "story" {
            service
                .chapter_stats(section)
                .await
                .map_err(|_| Status::ServiceUnavailable)?
        } else {
            Vec::new()
        };
        let content = own.as_ref().map(|a| &a.preferences.content);
        let mature = content.map(|c| c.mature_content.as_str()).unwrap_or("blur");
        stories.retain(|s| {
            if s.mature && mature == "hide" {
                return false;
            }
            if page == "story" && s.uid == section {
                return true;
            }
            content.is_none_or(|c| {
                !c.hidden_stories.contains(&s.uid)
                    && !c.hidden_authors.contains(&s.author)
                    && !s.details.genres.iter().any(|g| {
                        c.hidden_genres.contains(&g.genre)
                            || g.subgenre
                                .as_ref()
                                .is_some_and(|v| c.hidden_genres.contains(v))
                    })
                    && !s.details.tags.iter().any(|t| c.hidden_tags.contains(t))
            })
        });
        if page == "story" && !stories.iter().any(|s| s.uid == section) {
            return Err(Status::NotFound);
        }
        let taxonomy = artismaga_administration::taxonomy::load(&state.auth.store)
            .await
            .map_err(|_| Status::ServiceUnavailable)?;
        let mut genres = Vec::new();
        for genre in taxonomy.value.genres {
            let palette = match &genre.image {
                Some(id) => state
                    .storage
                    .asset(id)
                    .await
                    .map_err(|_| Status::ServiceUnavailable)?
                    .map(|a| a.palette)
                    .unwrap_or_default(),
                None => Vec::new(),
            };
            let mut value = serde_json::to_value(genre).map_err(|_| Status::ServiceUnavailable)?;
            value["image_palette"] = json!(palette);
            genres.push(value);
        }
        Some(
            json!({"scores":scores,"continue_reading":resume,"chapter_stats":chapter_stats,"catalogue_page":catalogue_page,"subgenre":subgenre,"stories":stories,"genres":genres,"mature_content":mature}),
        )
    } else {
        None
    };
    let private_account = if matches!(page, "profile" | "settings") {
        own
    } else {
        None
    };
    let announcement_roles = if page == "admin"
        && permissions.contains(&artismaga_core::Permission::ManageAnnouncements)
    {
        state
            .auth
            .store
            .rows::<serde_json::Value>("SELECT key,name FROM permission_group", json!({}))
            .await
            .map_err(|_| Status::ServiceUnavailable)?
    } else {
        Vec::new()
    };
    let operational = if permissions.contains(&artismaga_core::Permission::ViewAnalytics)
        && ["admin", "analytics"].contains(&page)
    {
        json!({"metrics":state.metrics.snapshot(),"database_available":true,"translator":state.translator.local.status().await})
    } else {
        json!(null)
    };
    let reader = if page == "reader" {
        let (work, chapter) = section.split_once('/').ok_or(Status::NotFound)?;
        Some(
            crate::studio::service(state)
                .reader(work, chapter)
                .await
                .map_err(|_| Status::ServiceUnavailable)?
                .ok_or(Status::NotFound)?,
        )
    } else {
        None
    };
    let reactions = crate::studio::service(state)
        .reaction_configuration()
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let nonce = artismaga_auth::token();
    let extra = json!({"reader":reader,"reactions":reactions,"discovery":discovery,"operational":operational,"announcement_roles":announcement_roles,"announcements":announcements,"localisation_editor":localisation_editor,"localisation":{"timezone":timezone,"now":artismaga_auth::now(),"locale":selected,"source_locale":locale_settings.source_locale,"enabled":locale_settings.enabled,"messages":messages,"preview":preview},"styleNonce":nonce,"section":section,"permissions":permissions,"studio":studio,"site":settings.configuration,"siteName":messages.get("site.name").unwrap_or(&settings.configuration.site_name),"account":private_account,"appearance":appearance,"administrator":administrator});
    let html = state
        .renderer
        .page_data(
            page,
            account.map(|u| u.public()),
            settings.configuration.signup_mode,
            state.auth.mail_enabled(),
            extra,
        )
        .await
        .map_err(|_| {
            eprintln!("Page assembly failed at line {}", line!());
            Status::ServiceUnavailable
        })?;
    Ok(response(html, &nonce))
}
