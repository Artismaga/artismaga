//! Authenticated Studio transport and same-origin private artwork delivery.
use crate::{ApiResult, AppState, Mutation, SignedIn, WritingMutation, error, pages, unavailable};
use artismaga_core::Permission;
use artismaga_storage::{Asset, MAX_UPLOAD};
use artismaga_studio::{Actor, Studio, Work, WorkInput, WorkUpdate};
use rocket::{
    Data, State,
    data::ToByteUnit,
    http::{ContentType, CookieJar, Status},
    serde::json::Json,
};
use serde::Deserialize;
use serde_json::{Value, json};
pub fn service(state: &AppState) -> Studio {
    Studio::new(state.auth.store.clone())
}
pub async fn actor<'a>(
    state: &AppState,
    user: &'a artismaga_db::Account,
) -> Result<Actor<'a>, Status> {
    Ok(Actor {
        uid: &user.uid,
        can_write: state
            .auth
            .allowed(user, Permission::CreateStory)
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        administrator: state
            .auth
            .allowed(user, Permission::Administer)
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
    })
}
pub(crate) async fn artwork(state: &AppState, work: Option<&Work>) -> Result<Value, Status> {
    let config = crate::administration::service(state)
        .configuration()
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let cover = work
        .and_then(|w| w.cover.as_ref())
        .or(config.configuration.default_cover.as_ref());
    let asset = match cover {
        Some(id) => state
            .storage
            .asset(id)
            .await
            .map_err(|_| Status::ServiceUnavailable)?,
        None => None,
    };
    let primary = config.configuration.primary_colour;
    Ok(
        json!({"cover_url":asset.as_ref().map(|a|format!("/media/{}",a.uid)).unwrap_or_else(||format!("/assets/default-cover.svg?colour=%23{}",&primary[1..])),"hero_url":work.and_then(|w|w.hero.as_ref()).map(|id|format!("/media/{id}")),"palette":asset.map(|a|a.palette).unwrap_or(vec![primary,"#172b31".into()])}),
    )
}
#[rocket::get("/studio?<search>&<filter>&<sort>&<offset>")]
pub async fn catalogue(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    search: Option<&str>,
    filter: Option<&str>,
    sort: Option<&str>,
    offset: Option<u32>,
) -> Result<pages::PageResponse, Status> {
    let actor = actor(state, &user.0).await?;
    let list = service(state)
        .list(
            &actor,
            search.unwrap_or(""),
            filter.unwrap_or("all"),
            sort.unwrap_or("accessed"),
            offset.unwrap_or(0),
        )
        .await
        .map_err(|_| Status::BadRequest)?;
    let mut artworks = serde_json::Map::new();
    for work in &list.works {
        artworks.insert(work.uid.clone(), artwork(state, Some(work)).await?);
    }
    pages::render_tab(state,jar,"studio","",Some(json!({"list":list,"work":null,"artwork":artworks,"default_artwork":artwork(state,None).await?}))).await
}
#[rocket::get("/studio/new")]
pub async fn new_work(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
) -> Result<pages::PageResponse, Status> {
    if !actor(state, &user.0).await?.can_write {
        return Err(Status::Forbidden);
    }
    pages::render_tab(state,jar,"new_work","",Some(json!({"list":null,"work":null,"artwork":{},"default_artwork":artwork(state,None).await?}))).await
}
#[rocket::get("/studio/<uid>")]
pub async fn work(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    uid: &str,
) -> Result<pages::PageResponse, Status> {
    work_section(user, state, jar, uid, "overview").await
}
#[rocket::get("/studio/<uid>/<section>")]
pub async fn work_section(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    uid: &str,
    section: &str,
) -> Result<pages::PageResponse, Status> {
    if ![
        "overview",
        "publishing",
        "chapters",
        "related",
        "analytics",
        "settings",
        "audience",
        "disclosures",
        "translations",
    ]
    .contains(&section)
    {
        return Err(Status::NotFound);
    }
    let actor = actor(state, &user.0).await?;
    let work = service(state)
        .get(&actor, uid, Some(artismaga_auth::now()))
        .await
        .map_err(|_| Status::NotFound)?;
    let art = artwork(state, Some(&work.work)).await?;
    let publication = service(state)
        .publication(uid)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let publishing = publication.map(|p| json!({"language":p.language,"status":p.status,"mature":p.mature,"related":p.related,"release_schedule":p.release_schedule}));
    let publishing_options: Vec<Value> = service(state)
        .publications()
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        .into_iter()
        .filter(|p| p.uid != uid)
        .map(|p| json!({"uid":p.uid,"title":p.title,"author_name":p.author_name}))
        .collect();

    pages::render_tab(state,jar,"work",section,Some(json!({"lifecycle":service(state).lifecycle(uid).await.map_err(|_|Status::ServiceUnavailable)?,"published_chapters":state.auth.store.rows::<String>("SELECT VALUE chapter FROM chapter_publication WHERE work=$work",json!({"work":uid})).await.map_err(|_|Status::ServiceUnavailable)?,"analytics":service(state).studio_analytics(&actor,uid).await.map_err(|_|Status::ServiceUnavailable)?,"publishing":publishing,"publishing_options":publishing_options,"list":null,"details":service(state).details(&actor,uid,artismaga_auth::now()).await.map_err(|_|Status::ServiceUnavailable)?,"translations":if section=="translations" {Some(service(state).translation_page(&actor,uid,artismaga_auth::now(),None).await.map_err(|_|Status::ServiceUnavailable)?)}else{None},"work":work,"artwork":{uid:art},"default_artwork":artwork(state,None).await?}))).await
}
#[rocket::post("/works", data = "<input>")]
pub async fn create(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<WorkInput>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Writing access unavailable"))?;
    if !actor.can_write {
        return Err(error(
            Status::Forbidden,
            "Your role needs permission to create works",
        ));
    }
    artismaga_studio::validate(&input).map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let uid = service(state)
        .create(&actor, input.into_inner(), artismaga_auth::now())
        .await
        .map_err(|_| {
            error(
                Status::BadRequest,
                "Could not create work. Check the artwork selections.",
            )
        })?;
    Ok(Json(
        json!({"message":"Your new work is ready.","redirect":format!("/studio/{uid}")}),
    ))
}
#[rocket::post("/works/<uid>", data = "<input>")]
pub async fn update(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<WorkUpdate>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Writing access unavailable"))?;
    let page = service(state)
        .get(&actor, uid, None)
        .await
        .map_err(|_| error(Status::NotFound, "Work unavailable"))?;
    if !page.can_edit {
        return Err(error(Status::Forbidden, "Editing permission required"));
    }
    artismaga_studio::validate(&input.value)
        .map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let revision = service(state)
        .update(&actor, uid, input.into_inner(), artismaga_auth::now())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Work changed or artwork is unavailable. Reload before saving.",
            )
        })?;
    Ok(Json(json!({"message":"Work saved.","revision":revision})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShareRequest {
    #[serde(default)]
    uid: Option<String>,
    #[serde(default)]
    recipients: Vec<String>,
    can_edit: bool,
    remove: bool,
}
#[rocket::post("/works/<uid>/shares", data = "<input>")]
pub async fn share(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<ShareRequest>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Writing access unavailable"))?;
    let page = service(state)
        .get(&actor, uid, None)
        .await
        .map_err(|_| error(Status::NotFound, "Work unavailable"))?;
    if !page.can_share {
        return Err(error(
            Status::Forbidden,
            "Only the owner can manage sharing",
        ));
    }
    service(state)
        .share_many(
            &actor,
            uid,
            &input
                .uid
                .clone()
                .map(|id| vec![id])
                .unwrap_or_else(|| input.recipients.clone()),
            input.can_edit,
            input.remove,
        )
        .await
        .map_err(|_| {
            error(
                Status::BadRequest,
                "Could not update sharing. Choose matching accounts or exact email addresses.",
            )
        })?;
    Ok(Json(
        json!({"message":"Sharing updated.","redirect":format!("/studio/{uid}/settings")}),
    ))
}
#[rocket::post("/api/artwork?<purpose>", data = "<data>")]
pub async fn upload(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    purpose: &str,
    data: Data<'_>,
) -> ApiResult {
    let permission =
        if ["default_cover", "genre_image", "genre_hero", "reaction"].contains(&purpose) {
            Permission::Administer
        } else if purpose == "announcement" {
            Permission::ManageAnnouncements
        } else {
            Permission::CreateStory
        };
    if !state
        .auth
        .allowed(&user.0, permission)
        .await
        .map_err(unavailable)?
    {
        return Err(error(
            Status::Forbidden,
            "Artwork upload permission required",
        ));
    }
    let _slot = state
        .upload_slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| {
            error(
                Status::ServiceUnavailable,
                "Artwork processing is busy; try again shortly",
            )
        })?;
    let bytes = tokio::time::timeout(
        std::time::Duration::from_secs(20),
        data.open((MAX_UPLOAD as u64).bytes()).into_bytes(),
    )
    .await
    .map_err(|_| error(Status::RequestTimeout, "Artwork upload timed out"))?
    .map_err(|_| error(Status::BadRequest, "Could not read artwork"))?;
    if !bytes.is_complete() {
        return Err(error(
            Status::PayloadTooLarge,
            "Use an image smaller than 8 MiB",
        ));
    }
    let asset=state.storage.upload(&user.0.uid,purpose,bytes.into_inner(),artismaga_auth::now()).await.map_err(|_|error(Status::BadRequest,"Could not store artwork. Use JPEG, PNG or WebP, up to 8 MiB and 32 megapixels; check storage configuration."))?;
    Ok(Json(
        json!({"asset":{"uid":asset.uid,"url":format!("/media/{}",asset.uid),"palette":asset.palette}}),
    ))
}
#[rocket::get("/media/<uid>")]
pub async fn media(
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    uid: &str,
) -> Result<(ContentType, Vec<u8>), Status> {
    let asset: Asset = state
        .storage
        .asset(uid)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        .ok_or(Status::NotFound)?;
    let config = crate::administration::service(state)
        .configuration()
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let vocabulary = artismaga_administration::taxonomy::load(&state.auth.store)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    let announcement_visible = if asset.purpose == "announcement" {
        let visitor = match jar.get("session") {
            Some(c) => state
                .auth
                .current(c.value())
                .await
                .map_err(|_| Status::ServiceUnavailable)?,
            None => None,
        };
        let rows: Vec<artismaga_administration::announcements::Announcement> = state
            .auth
            .store
            .rows(
                "SELECT * FROM announcement WHERE value.image=$image",
                json!({"image":uid}),
            )
            .await
            .map_err(|_| Status::ServiceUnavailable)?;
        let editor = match &visitor {
            Some(user) => state
                .auth
                .allowed(user, Permission::ManageAnnouncements)
                .await
                .map_err(|_| Status::ServiceUnavailable)?,
            None => false,
        };
        editor
            || rows.iter().any(|a| {
                artismaga_administration::announcements::visible(
                    a,
                    visitor.as_ref().map(|u| u.group_key.as_str()),
                    false,
                    artismaga_auth::now(),
                )
            })
    } else {
        false
    };
    let public = service(state)
        .public_asset(uid)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
        || (asset.purpose == "reaction"
            && service(state)
                .reaction_configuration()
                .await
                .map_err(|_| Status::ServiceUnavailable)?
                .reactions
                .iter()
                .any(|r| r.image == format!("/media/{uid}")))
        || announcement_visible
        || (config.configuration.default_cover.as_deref() == Some(uid)
            && asset.purpose == "default_cover")
        || vocabulary
            .value
            .genres
            .iter()
            .any(|g| g.image.as_deref() == Some(uid) || g.hero.as_deref() == Some(uid));
    if !public {
        let cookie = jar.get("session").ok_or(Status::NotFound)?;
        let user = state
            .auth
            .current(cookie.value())
            .await
            .map_err(|_| Status::ServiceUnavailable)?
            .ok_or(Status::NotFound)?;
        let actor = actor(state, &user).await?;
        if asset.owner != user.uid
            && !service(state)
                .can_view_asset(&actor, uid)
                .await
                .map_err(|_| Status::ServiceUnavailable)?
        {
            return Err(Status::NotFound);
        }
    }
    let bytes = state
        .storage
        .bytes(&asset)
        .await
        .map_err(|_| Status::ServiceUnavailable)?;
    Ok((ContentType::JPEG, bytes))
}
#[rocket::get("/assets/default-cover.svg?<colour>")]
pub fn default_cover(colour: Option<&str>) -> (ContentType, String) {
    let colour = colour
        .filter(|c| {
            c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|v| v.is_ascii_hexdigit())
        })
        .unwrap_or("#24675a");
    (
        ContentType::SVG,
        format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="{colour}"/><stop offset="1" stop-color="#172b31"/></linearGradient></defs><rect width="600" height="900" fill="url(#a)"/><path d="M44 0v900M65 52h470v796H65" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/><circle cx="300" cy="375" r="108" fill="#fff" fill-opacity=".06"/><path d="M240 325h120v135H240zM257 348h86M257 365h64M257 441h86" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="5"/><path d="m270 550 30 20 30-20M300 570v80" stroke="#fff" stroke-opacity=".4" fill="none" stroke-width="2"/></svg>"##
        ),
    )
}
#[rocket::get("/assets/noise.svg")]
pub fn noise() -> (ContentType, &'static str) {
    (
        ContentType::SVG,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" opacity=".23" filter="url(#n)"/></svg>"#,
    )
}

#[rocket::get("/works/<uid>/people?<search>")]
pub async fn people(user: SignedIn, state: &State<AppState>, uid: &str, search: &str) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let people = service(state)
        .search_people(&actor, uid, search)
        .await
        .map_err(|_| error(Status::BadRequest, "Search unavailable"))?;
    Ok(Json(json!({"people":people})))
}
#[rocket::get("/works/<uid>/details")]
pub async fn details(user: SignedIn, state: &State<AppState>, uid: &str) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let details = service(state)
        .details(&actor, uid, artismaga_auth::now())
        .await
        .map_err(|_| error(Status::NotFound, "Work unavailable"))?;
    Ok(Json(json!({"details":details})))
}
#[rocket::post("/works/<uid>/details", data = "<input>")]
pub async fn change_details(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<artismaga_studio::details::Update>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let details = service(state)
        .change_details(&actor, uid, input.into_inner(), artismaga_auth::now())
        .await
        .map_err(|e| error(Status::Conflict, &e.to_string()))?;
    let page = service(state)
        .get(&actor, uid, None)
        .await
        .map_err(unavailable)?;
    Ok(Json(
        json!({"details":details,"revision":page.work.revision,"message":"Work configuration saved."}),
    ))
}

#[rocket::get("/works/<uid>/translations?<scope>&<locale>")]
pub async fn translations(
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    scope: Option<&str>,
    locale: Option<&str>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let page = service(state)
        .translation_page(
            &actor,
            uid,
            artismaga_auth::now(),
            Some((scope.unwrap_or("overview"), locale.unwrap_or("ja"))),
        )
        .await
        .map_err(|_| error(Status::NotFound, "Work unavailable"))?;
    Ok(Json(json!({"translations":page})))
}
#[rocket::post("/works/<uid>/translations", data = "<input>")]
pub async fn save_translation(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<artismaga_studio::translations::Update>,
) -> ApiResult {
    if !user.0.email_verified {
        return Err(error(
            Status::Forbidden,
            "Verify your email before translating",
        ));
    }
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let revision = service(state)
        .save_translation(&actor, uid, input.into_inner(), artismaga_auth::now())
        .await
        .map_err(|e| error(Status::Conflict, &e.to_string()))?;
    Ok(Json(
        json!({"revision":revision,"message":"Translation saved."}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TranslationGrant {
    recipients: Vec<String>,
    locale: String,
    can_draft: bool,
    can_approve: bool,
    remove: bool,
}
#[rocket::post("/works/<uid>/translations/access", data = "<input>")]
pub async fn translation_access(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<TranslationGrant>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    service(state)
        .translation_grants(
            &actor,
            uid,
            artismaga_studio::translations::Access {
                recipients: &input.recipients,
                locale: &input.locale,
                can_draft: input.can_draft,
                can_approve: input.can_approve,
                remove: input.remove,
            },
        )
        .await
        .map_err(|_| {
            error(
                Status::BadRequest,
                "Could not update translation permissions",
            )
        })?;
    Ok(Json(json!({"message":"Translation permissions updated."})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceLanguage {
    locale: String,
}
#[rocket::post("/works/<uid>/translations/source", data = "<input>")]
pub async fn translation_source(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<SourceLanguage>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    service(state)
        .set_translation_source(&actor, uid, &input.locale)
        .await
        .map_err(|_| error(Status::Forbidden, "Source language permission required"))?;
    Ok(Json(json!({"message":"Source language saved."})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AutomaticContent {
    scope: String,
    locale: String,
    field: String,
}
#[rocket::post("/works/<uid>/translate-content", data = "<input>")]
pub async fn translate_content(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    input: Json<AutomaticContent>,
) -> ApiResult {
    let own = artismaga_accounts::Accounts::new(state.auth.store.clone())
        .own(&user.0.uid)
        .await
        .map_err(unavailable)?;
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let page = service(state)
        .translation_page(
            &actor,
            uid,
            artismaga_auth::now(),
            Some((&input.scope, &input.locale)),
        )
        .await
        .map_err(|_| error(Status::NotFound, "Content unavailable"))?;
    let scope = page
        .scopes
        .iter()
        .find(|s| s.uid == input.scope)
        .ok_or_else(|| error(Status::NotFound, "Content unavailable"))?;
    if let Some(text) = page
        .translations
        .iter()
        .find(|t| {
            t.locale == input.locale
                && t.value.live_source_hash.as_ref() == Some(&scope.source_hash)
        })
        .and_then(|t| t.value.live.as_ref())
        .and_then(|f| f.get(&input.field))
    {
        return Ok(Json(json!({"text":text,"automatic":false})));
    }
    if !own.preferences.content.automatic_translations {
        return Err(error(
            Status::Forbidden,
            "Automatic content translations are disabled in your preferences",
        ));
    }
    let text = scope
        .fields
        .get(&input.field)
        .ok_or_else(|| error(Status::BadRequest, "Unknown field"))?;
    let text = state
        .translator
        .text(
            &format!("{uid}:{}:{}", input.scope, input.field),
            &page.source_locale,
            &input.locale,
            text,
            artismaga_auth::now(),
        )
        .await
        .map_err(|_| {
            error(
                Status::ServiceUnavailable,
                "Translation unavailable; original content remains available",
            )
        })?;
    Ok(Json(json!({"text":text,"automatic":true})))
}

#[rocket::get("/studio/<uid>/chapters/<chapter>")]
pub async fn chapter_editor(
    user: SignedIn,
    state: &State<AppState>,
    jar: &CookieJar<'_>,
    uid: &str,
    chapter: &str,
) -> Result<pages::PageResponse, Status> {
    let actor = actor(state, &user.0).await?;
    let work = service(state)
        .get(&actor, uid, None)
        .await
        .map_err(|_| Status::NotFound)?;
    let editor = service(state)
        .writing(&actor, uid, chapter, artismaga_auth::now())
        .await
        .map_err(|_| Status::NotFound)?;
    pages::render_tab(
        state,
        jar,
        "chapter",
        "",
        Some(json!({"list":null,"work":work,"artwork":{},"default_artwork":artwork(state,None).await?,"editor":editor})),
    )
    .await
}
#[rocket::get("/works/<uid>/chapters/<chapter>/draft")]
pub async fn chapter_draft(
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    chapter: &str,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let page = service(state)
        .writing(&actor, uid, chapter, artismaga_auth::now())
        .await
        .map_err(|_| error(Status::NotFound, "Chapter unavailable"))?;
    Ok(Json(json!({"editor":page})))
}
#[rocket::post("/works/<uid>/chapters/<chapter>/draft", data = "<input>")]
pub async fn save_chapter(
    _guard: WritingMutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    chapter: &str,
    input: Json<artismaga_studio::writing::Save>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    artismaga_studio::writing::validate(&input.value)
        .map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let draft=service(state).save_writing(&actor,uid,chapter,input.into_inner(),artismaga_auth::now()).await.map_err(|_|error(Status::Conflict,"Draft changed or editing access was revoked. Compare with the latest draft before saving again."))?;
    Ok(Json(json!({"draft":draft})))
}
#[rocket::get("/works/<uid>/chapters/<chapter>/history?<before>")]
pub async fn chapter_history(
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    chapter: &str,
    before: Option<i64>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let history = service(state)
        .writing_history(
            &actor,
            uid,
            chapter,
            before.unwrap_or(i64::MAX),
            artismaga_auth::now(),
        )
        .await
        .map_err(|_| error(Status::NotFound, "Revision history unavailable"))?;
    Ok(Json(json!({"history":history})))
}
#[rocket::get("/works/<uid>/chapters/<chapter>/history/<revision>")]
pub async fn chapter_revision(
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    chapter: &str,
    revision: i64,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let draft = service(state)
        .writing_revision(&actor, uid, chapter, revision, artismaga_auth::now())
        .await
        .map_err(|_| error(Status::NotFound, "Revision unavailable"))?;
    Ok(Json(json!({"draft":draft})))
}
#[rocket::post("/works/<uid>/chapters/<chapter>/restore", data = "<input>")]
pub async fn restore_chapter(
    _guard: WritingMutation,
    user: SignedIn,
    state: &State<AppState>,
    uid: &str,
    chapter: &str,
    input: Json<artismaga_studio::writing::Restore>,
) -> ApiResult {
    let actor = actor(state, &user.0)
        .await
        .map_err(|s| error(s, "Account unavailable"))?;
    let draft = service(state)
        .restore_writing(
            &actor,
            uid,
            chapter,
            input.into_inner(),
            artismaga_auth::now(),
        )
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Draft changed or revision restoration is unavailable. Reload the latest draft.",
            )
        })?;
    Ok(Json(json!({"draft":draft})))
}
