//! Persisted notice/promotion lifecycle, audience checks and immutable creator attribution.
use anyhow::{Result, ensure};
use artismaga_core::PublicUser;
use artismaga_db::Store;
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Value {
    pub kind: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub image: Option<String>,
    pub cta_text: String,
    pub cta_url: String,
    pub dismissible: bool,
    pub starts_at: Option<i64>,
    pub ends_at: Option<i64>,
    pub audience: String,
    pub roles: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    pub uid: Option<String>,
    pub revision: i64,
    pub value: Value,
    pub cancelled: bool,
}
#[derive(Deserialize, Serialize)]
pub struct Announcement {
    pub uid: String,
    pub revision: i64,
    pub value: Value,
    pub creator: String,
    pub created_at: i64,
    pub cancelled: bool,
    #[serde(default)]
    pub initiator: Option<PublicUser>,
}
pub fn validate(u: &Update) -> Result<()> {
    let v = &u.value;
    ensure!(
        (0..i64::MAX).contains(&u.revision)
            && ["notice", "promotion"].contains(&v.kind.as_str())
            && ["info", "warning", "critical"].contains(&v.severity.as_str()),
        "Invalid announcement type or revision"
    );
    ensure!(
        (v.kind == "promotion" || !v.title.trim().is_empty())
            && v.title.chars().count() <= 160
            && v.description.chars().count() <= 2000
            && v.cta_text.chars().count() <= 80,
        "Check announcement text lengths"
    );
    ensure!(
        [
            "everyone",
            "guests",
            "authenticated",
            "subscribers",
            "non_subscribers",
            "roles"
        ]
        .contains(&v.audience.as_str())
            && v.roles.len() <= 50,
        "Choose an announcement audience"
    );
    ensure!(
        v.starts_at.is_none_or(|t| t >= 0)
            && v.ends_at.is_none_or(|t| t >= 0)
            && !(v.starts_at.is_some() && v.ends_at.is_some() && v.starts_at >= v.ends_at),
        "End time must follow start time"
    );
    if v.kind == "promotion" {
        ensure!(
            v.image.is_some() && safe_url(&v.cta_url),
            "Promotions need an image and a safe CTA link"
        );
    }
    if let Some(image) = &v.image {
        ensure!(
            image.starts_with("asset_") && image.len() == 42,
            "Choose an uploaded announcement image"
        );
    }
    ensure!(
        v.audience != "roles" || !v.roles.is_empty(),
        "Choose at least one role"
    );
    Ok(())
}
fn safe_url(value: &str) -> bool {
    (value.starts_with('/') && !value.starts_with("//") && !value.contains(['\\', '\r', '\n']))
        || url::Url::parse(value).ok().is_some_and(|u| {
            u.scheme() == "https"
                && u.host_str().is_some()
                && u.username().is_empty()
                && u.password().is_none()
        })
}
async fn attribution(store: &Store, mut rows: Vec<Announcement>) -> Result<Vec<Announcement>> {
    let ids: Vec<_> = rows
        .iter()
        .map(|r| r.creator.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let users: Vec<artismaga_db::Account> = store
        .rows(
            "SELECT * FROM account WHERE uid IN $uids",
            json!({"uids":ids}),
        )
        .await?;
    let users: std::collections::BTreeMap<_, _> = users
        .into_iter()
        .map(|u| (u.uid.clone(), u.public()))
        .collect();
    for row in &mut rows {
        row.initiator = users.get(&row.creator).cloned();
    }
    Ok(rows)
}
pub async fn list(store: &Store) -> Result<Vec<Announcement>> {
    history(store, 0, "").await
}
/// Fetch an extra record so every past/future/cancelled entry remains reachable.
pub async fn history(store: &Store, offset: u32, search: &str) -> Result<Vec<Announcement>> {
    ensure!(search.chars().count() <= 120, "Search is too long");
    let rows=store.rows("SELECT * FROM announcement WHERE string::contains(string::lowercase(value.title),$search) OR string::contains(string::lowercase(value.description),$search) ORDER BY created_at DESC,uid ASC LIMIT 51 START $offset",json!({"search":search.trim().to_lowercase(),"offset":offset})).await?;
    attribution(store, rows).await
}
pub async fn visible_list(
    store: &Store,
    group: Option<&str>,
    subscriber: bool,
    now: i64,
) -> Result<Vec<Announcement>> {
    let rows=store.rows("SELECT * FROM announcement WHERE cancelled=false AND (value.starts_at ?? 0)<=$now AND (value.ends_at=NULL OR value.ends_at=NONE OR value.ends_at>$now) AND (value.audience='everyone' OR (value.audience='guests' AND !$authenticated) OR (value.audience='authenticated' AND $authenticated) OR (value.audience='subscribers' AND $authenticated AND $subscriber) OR (value.audience='non_subscribers' AND !$subscriber) OR (value.audience='roles' AND $group IN value.roles)) ORDER BY created_at DESC LIMIT 1000",json!({"group":group,"authenticated":group.is_some(),"subscriber":subscriber,"now":now})).await?;
    attribution(store, rows).await
}
pub async fn save(store: &Store, actor: &str, u: Update, now: i64) -> Result<String> {
    validate(&u)?;
    let uid = u
        .uid
        .unwrap_or_else(|| format!("ann_{}", uuid::Uuid::new_v4()));
    ensure!(
        uid.starts_with("ann_") && uid.len() == 40 && uuid::Uuid::parse_str(&uid[4..]).is_ok(),
        "Invalid announcement identifier"
    );
    for role in &u.value.roles {
        let rows: Vec<serde_json::Value> = store
            .rows(
                "SELECT key FROM permission_group WHERE key=$key",
                json!({"key":role}),
            )
            .await?;
        ensure!(!rows.is_empty(), "Unknown audience role");
    }
    store.query("BEGIN TRANSACTION; LET $old=(SELECT * FROM announcement WHERE uid=$uid)[0]; IF ($old.revision ?? 0)!=$revision {THROW 'changed';}; UPSERT type::record('announcement',$uid) SET uid=$uid,revision=$revision+1,value=$value,cancelled=$cancelled,creator=$old.creator ?? $actor,created_at=$old.created_at ?? $now; COMMIT TRANSACTION;",json!({"uid":uid,"revision":u.revision,"value":u.value,"cancelled":u.cancelled,"actor":actor,"now":now})).await?;
    Ok(uid)
}
pub fn visible(a: &Announcement, group: Option<&str>, subscriber: bool, now: i64) -> bool {
    !a.cancelled
        && a.value.starts_at.is_none_or(|t| t <= now)
        && a.value.ends_at.is_none_or(|t| t > now)
        && match a.value.audience.as_str() {
            "everyone" => true,
            "guests" => group.is_none(),
            "authenticated" => group.is_some(),
            "subscribers" => group.is_some() && subscriber,
            "non_subscribers" => !subscriber,
            "roles" => group.is_some_and(|g| a.value.roles.iter().any(|r| r == g)),
            _ => false,
        }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Announcement {
        Announcement {
            uid: "ann_example".into(),
            revision: 1,
            creator: "owner".into(),
            created_at: 0,
            cancelled: false,
            initiator: None,
            value: Value {
                kind: "notice".into(),
                severity: "info".into(),
                title: "Hello".into(),
                description: String::new(),
                image: None,
                cta_text: String::new(),
                cta_url: String::new(),
                dismissible: true,
                starts_at: Some(100),
                ends_at: Some(200),
                audience: "roles".into(),
                roles: vec!["author".into()],
            },
        }
    }
    #[test]
    fn schedules_audiences_and_cancellation_do_not_leak() {
        let mut a = fixture();
        assert!(!visible(&a, None, false, 150));
        assert!(!visible(&a, Some("reader"), false, 150));
        assert!(visible(&a, Some("author"), false, 100));
        assert!(!visible(&a, Some("author"), false, 200));
        a.cancelled = true;
        assert!(!visible(&a, Some("author"), false, 150));
        a.cancelled = false;
        a.value.audience = "subscribers".into();
        assert!(!visible(&a, Some("author"), false, 150));
        assert!(visible(&a, Some("author"), true, 150));
    }
    #[test]
    fn image_only_promotions_allow_empty_copy_but_require_safe_destination() {
        let mut u = Update {
            uid: None,
            revision: 0,
            value: fixture().value,
            cancelled: false,
        };
        u.value.kind = "promotion".into();
        u.value.title.clear();
        u.value.image = Some(format!("asset_{}", uuid::Uuid::new_v4()));
        u.value.cta_url = "/stories/example".into();
        assert!(validate(&u).is_ok());
        for url in ["", "javascript:alert(1)", "//example.test"] {
            u.value.cta_url = url.into();
            assert!(validate(&u).is_err());
        }
        u.value.kind = "notice".into();
        assert!(validate(&u).is_err(), "notices still need a title");
    }
    #[test]
    fn cta_links_reject_executable_and_protocol_relative_urls() {
        for bad in [
            "javascript:alert(1)",
            "//evil.test",
            "/\\evil.test",
            "https://user:secret@example.test",
        ] {
            assert!(!safe_url(bad));
        }
        assert!(safe_url("/stories/example"));
        assert!(safe_url("https://example.test/promo"));
    }
}
