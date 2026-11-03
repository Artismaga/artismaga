//! Bounded authenticated suggestion lookup; no private work titles or email search.
use crate::{ApiResult, AppState, Mutation, SignedIn, admin, error, unavailable};
use artismaga_administration::taxonomy;
use rocket::{State, http::Status, serde::json::Json};
use serde_json::json;
#[rocket::get("/api/vocabulary")]
pub async fn vocabulary(_user: SignedIn, state: &State<AppState>) -> ApiResult {
    let settings = taxonomy::load(&state.auth.store)
        .await
        .map_err(unavailable)?;
    let mut tags = settings.value.tags.clone();
    if settings.value.premade_tags {
        tags.extend(taxonomy::seed_tags());
    }
    Ok(Json(json!({"settings":settings,"tags":tags})))
}
#[rocket::post("/taxonomy", data = "<input>")]
pub async fn save(
    _guard: Mutation,
    user: SignedIn,
    state: &State<AppState>,
    input: Json<taxonomy::Settings>,
) -> ApiResult {
    admin(state, &user.0).await?;
    taxonomy::validate(&input).map_err(|e| error(Status::BadRequest, &e.to_string()))?;
    let revision = taxonomy::save(&state.auth.store, input.into_inner())
        .await
        .map_err(|_| {
            error(
                Status::Conflict,
                "Vocabulary changed or artwork is unavailable. Reload before saving.",
            )
        })?;
    Ok(Json(
        json!({"revision":revision,"message":"Vocabulary saved."}),
    ))
}
#[rocket::get("/api/suggestions?<kind>&<search>&<selected>&<scope>")]
pub async fn suggestions(
    _user: SignedIn,
    state: &State<AppState>,
    kind: &str,
    search: &str,
    selected: Option<&str>,
    scope: Option<&str>,
) -> ApiResult {
    if search.chars().count() > 100 {
        return Err(error(Status::BadRequest, "Search too long"));
    }
    let scope = scope.unwrap_or("known");
    if !["known", "allowed"].contains(&scope) {
        return Err(error(Status::BadRequest, "Unknown suggestion scope"));
    }
    let selected: Vec<&str> = selected
        .unwrap_or("")
        .split(',')
        .filter(|s| !s.is_empty())
        .collect();
    if selected.len() > 40 || selected.iter().any(|s| s.len() > 100) {
        return Err(error(Status::BadRequest, "Too many selections"));
    }
    let s = search.trim().to_lowercase();
    let settings = taxonomy::load(&state.auth.store)
        .await
        .map_err(unavailable)?;
    let mut options: Vec<serde_json::Value> = match kind {
        "genres" => settings.value.genres.iter().filter(|g|g.name.to_lowercase().contains(&s)).take(30).map(|g|json!({"value":g.key,"label":g.name})).collect(),
        "tags" => {
            let mut tags=settings.value.tags.clone();
            if settings.value.premade_tags {tags.extend(taxonomy::seed_tags());}
            if scope=="known" || settings.value.allow_arbitrary_tags {
                let known:Vec<Vec<String>>=state.auth.store.rows("SELECT VALUE value.tags FROM work_details WHERE work IN (SELECT VALUE uid FROM work WHERE status IN ['ongoing','completed','hiatus','discontinued']) AND value.tags[WHERE string::contains(string::lowercase($this),$search)] != [] LIMIT 30",json!({"search":s})).await.map_err(unavailable)?;
                tags.extend(known.into_iter().flatten());
            }
            tags.sort_by_key(|t|t.to_lowercase()); tags.dedup_by(|a,b|a.eq_ignore_ascii_case(b));
            tags.into_iter().filter(|t|t.to_lowercase().contains(&s)).take(30).map(|t|json!({"value":t,"label":t})).collect()
        },
        "authors" if s.chars().count()>=2 => state.auth.store.rows("SELECT uid AS value,display_name AS label FROM account WHERE uid IN (SELECT VALUE owner FROM work WHERE status IN ['ongoing','completed','hiatus','discontinued']) AND string::contains(string::lowercase(display_name),$search) ORDER BY display_name LIMIT 30",json!({"search":s})).await.map_err(unavailable)?,
        "stories" if s.chars().count()>=2 => state.auth.store.rows("SELECT uid AS value,title AS label FROM work WHERE status IN ['ongoing','completed','hiatus','discontinued'] AND string::contains(string::lowercase(title),$search) ORDER BY title LIMIT 30",json!({"search":s})).await.map_err(unavailable)?,
        "authors"|"stories" => Vec::new(),
        _ => return Err(error(Status::BadRequest,"Unknown suggestion type")),
    };
    options.truncate(30);
    let labels: Vec<serde_json::Value> = match kind {
        "genres" => settings.value.genres.iter().filter(|g|selected.contains(&g.key.as_str())).map(|g|json!({"value":g.key,"label":g.name})).collect(),
        "authors" => state.auth.store.rows("SELECT uid AS value,display_name AS label FROM account WHERE uid IN $selected AND uid IN (SELECT VALUE owner FROM work WHERE status IN ['ongoing','completed','hiatus','discontinued']) LIMIT 40",json!({"selected":selected})).await.map_err(unavailable)?,
        "stories" => state.auth.store.rows("SELECT uid AS value,title AS label FROM work WHERE uid IN $selected AND status IN ['ongoing','completed','hiatus','discontinued'] LIMIT 40",json!({"selected":selected})).await.map_err(unavailable)?,
        _ => Vec::new(),
    };
    for label in labels {
        if !options.iter().any(|o| o["value"] == label["value"]) {
            options.push(label);
        }
    }
    Ok(Json(json!({"options":options})))
}
