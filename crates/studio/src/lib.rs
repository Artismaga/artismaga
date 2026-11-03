//! Private work catalogue, metadata editing, sharing and per-reader access ordering.
pub mod writing;
use anyhow::{Result, ensure};
use artismaga_db::Store;
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone)]
pub struct Studio {
    store: Store,
}
pub struct Actor<'a> {
    pub uid: &'a str,
    pub can_write: bool,
    pub administrator: bool,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Work {
    pub uid: String,
    pub owner: String,
    pub title: String,
    pub subtitle: String,
    pub synopsis: String,
    pub work_type: String,
    pub status: String,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub revision: i64,
    #[serde(default)]
    pub accessed_at: i64,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Share {
    pub uid: String,
    pub can_edit: bool,
    #[serde(default)]
    pub display_name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkInput {
    pub title: String,
    pub subtitle: String,
    pub synopsis: String,
    pub work_type: String,
    pub cover: Option<String>,
    pub hero: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkUpdate {
    pub revision: i64,
    pub value: WorkInput,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct WorkPage {
    pub work: Work,
    pub can_edit: bool,
    pub can_share: bool,
    pub shares: Vec<Share>,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct WorkList {
    pub works: Vec<Work>,
    pub has_more: bool,
    pub offset: u32,
    pub search: String,
    pub filter: String,
    pub sort: String,
    pub can_create: bool,
}
impl Studio {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
    pub async fn list(
        &self,
        actor: &Actor<'_>,
        search: &str,
        filter: &str,
        sort: &str,
        offset: u32,
    ) -> Result<WorkList> {
        ensure!(
            search.chars().count() <= 120 && offset <= 100000,
            "Invalid catalogue query"
        );
        ensure!(
            ["all", "owned", "drafts", "shared"].contains(&filter),
            "Invalid filter"
        );
        let order = match sort {
            "accessed" => "accessed_at DESC, uid ASC",
            "edited" => "updated_at DESC, uid ASC",
            "name" => "title ASC, uid ASC",
            "created" => "created_at DESC, uid ASC",
            _ => anyhow::bail!("Invalid sort"),
        };
        let shared: Vec<String> = self
            .store
            .rows(
                "SELECT VALUE work FROM work_share WHERE uid=$uid",
                json!({"uid":actor.uid}),
            )
            .await?;
        let sql = format!(
            "SELECT *, ((SELECT VALUE accessed_at FROM work_access WHERE work=$parent.uid AND uid=$uid LIMIT 1)[0] ?? updated_at) AS accessed_at FROM work WHERE (owner=$uid OR uid IN $shared) AND ($filter='all' OR ($filter='owned' AND owner=$uid) OR ($filter='drafts' AND uid NOT IN (SELECT VALUE work FROM work_publication)) OR ($filter='shared' AND owner!=$uid)) AND (string::contains(string::lowercase(title),$search) OR string::contains(string::lowercase(subtitle),$search)) ORDER BY {order} LIMIT 25 START $offset"
        );
        let mut works:Vec<Work>=self.store.rows(&sql,json!({"uid":actor.uid,"shared":shared,"search":search.trim().to_lowercase(),"filter":filter,"offset":offset})).await?;
        let has_more = works.len() > 24;
        works.truncate(24);
        for work in &mut works {
            work.status = self.public_status(&work.uid).await?;
            work.synopsis = work.synopsis.chars().take(200).collect();
        }
        Ok(WorkList {
            works,
            has_more,
            offset,
            search: search.into(),
            filter: filter.into(),
            sort: sort.into(),
            can_create: actor.can_write,
        })
    }
    pub async fn get(&self, actor: &Actor<'_>, uid: &str, now: Option<i64>) -> Result<WorkPage> {
        let mut work: Work = self
            .store
            .rows(
                "SELECT * FROM work WHERE uid=$uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop()
            .ok_or_else(|| anyhow::anyhow!("Work unavailable"))?;
        let own = work.owner == actor.uid;
        let share: Option<Share> = self
            .store
            .rows(
                "SELECT uid,can_edit FROM work_share WHERE work=$work AND uid=$uid LIMIT 1",
                json!({"work":uid,"uid":actor.uid}),
            )
            .await?
            .pop();
        ensure!(
            own || actor.administrator || share.is_some(),
            "Work unavailable"
        );
        let can_edit = actor.can_write
            && (own || actor.administrator || share.as_ref().is_some_and(|s| s.can_edit));
        let can_share = actor.can_write && (own || actor.administrator);
        let mut shares: Vec<Share> = if can_share {
            self.store
                .rows(
                    "SELECT uid,can_edit FROM work_share WHERE work=$work",
                    json!({"work":uid}),
                )
                .await?
        } else {
            Vec::new()
        };
        for share in &mut shares {
            if let Some(account) = self.store.by_uid(&share.uid).await? {
                share.display_name = account.display_name;
            }
        }
        if let Some(now) = now {
            self.store.query("UPSERT type::record('work_access',$key) SET uid=$uid,work=$work,accessed_at=$now",json!({"key":format!("{}_{}",actor.uid,uid),"uid":actor.uid,"work":uid,"now":now})).await?;
        }
        work.status = self.public_status(uid).await?;
        Ok(WorkPage {
            work,
            can_edit,
            can_share,
            shares,
        })
    }
    async fn public_status(&self, uid: &str) -> Result<String> {
        Ok(self
            .store
            .rows(
                "SELECT VALUE value.status FROM work_publication WHERE work=$uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop()
            .unwrap_or_else(|| "draft".into()))
    }
    async fn artwork(&self, uid: &str, input: &WorkInput) -> Result<()> {
        for (id, purpose) in [(&input.cover, "cover"), (&input.hero, "hero")] {
            if let Some(id) = id {
                let count:Vec<serde_json::Value>=self.store.rows("SELECT uid FROM media_asset WHERE uid=$id AND owner=$uid AND purpose=$purpose",json!({"id":id,"uid":uid,"purpose":purpose})).await?;
                ensure!(
                    count.len() == 1,
                    "Choose artwork uploaded by this work's owner"
                );
            }
        }
        Ok(())
    }
    pub async fn create(&self, actor: &Actor<'_>, input: WorkInput, now: i64) -> Result<String> {
        ensure!(actor.can_write, "Writing permission required");
        validate(&input)?;
        self.artwork(actor.uid, &input).await?;
        let uid = format!("work_{}", uuid::Uuid::new_v4());
        self.store.query(artismaga_db::queries::STUDIO_CREATE,json!({"uid":uid,"owner":actor.uid,"title":input.title.trim(),"subtitle":input.subtitle.trim(),"synopsis":input.synopsis,"cover":input.cover,"hero":input.hero,"now":now})).await?;
        Ok(uid)
    }
    pub async fn update(
        &self,
        actor: &Actor<'_>,
        uid: &str,
        update: WorkUpdate,
        now: i64,
    ) -> Result<i64> {
        ensure!((0..i64::MAX).contains(&update.revision), "Invalid revision");
        validate(&update.value)?;
        let page = self.get(actor, uid, None).await?;
        ensure!(page.can_edit, "Editing permission required");
        // Editors can retain the owner's artwork or replace it with their own sanitized upload.
        for (id, old, purpose) in [
            (&update.value.cover, &page.work.cover, "cover"),
            (&update.value.hero, &page.work.hero, "hero"),
        ] {
            if let Some(id) = id
                && Some(id) != old.as_ref()
            {
                let a:Vec<serde_json::Value>=self.store.rows("SELECT uid FROM media_asset WHERE uid=$id AND owner=$owner AND purpose=$purpose",json!({"id":id,"owner":actor.uid,"purpose":purpose})).await?;
                ensure!(a.len() == 1, "Choose your own uploaded artwork");
            }
        }
        self.store.query(artismaga_db::queries::STUDIO_UPDATE,json!({"uid":uid,"actor":actor.uid,"admin":actor.administrator,"revision":update.revision,"title":update.value.title.trim(),"subtitle":update.value.subtitle.trim(),"synopsis":update.value.synopsis,"cover":update.value.cover,"hero":update.value.hero,"now":now})).await?;
        Ok(update.revision + 1)
    }
    pub async fn share(
        &self,
        actor: &Actor<'_>,
        uid: &str,
        recipient: &str,
        can_edit: bool,
        remove: bool,
    ) -> Result<()> {
        self.share_many(actor, uid, &[recipient.to_owned()], can_edit, remove)
            .await
    }

    pub async fn can_view_asset(&self, actor: &Actor<'_>, asset: &str) -> Result<bool> {
        let works: Vec<Work> = self
            .store
            .rows(
                "SELECT * FROM work WHERE cover=$asset OR hero=$asset",
                json!({"asset":asset}),
            )
            .await?;
        for work in works {
            if self.get(actor, &work.uid, None).await.is_ok() {
                return Ok(true);
            }
        }
        #[derive(Deserialize)]
        struct Ref {
            work: String,
        }
        let refs: Vec<Ref> = self.store.rows("SELECT work FROM work_details WHERE value.nodes[WHERE cover=$asset AND (delete_after=NULL OR delete_after>$now)] != []", json!({"asset":asset,"now":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs()})).await?;
        for r in refs {
            if self.get(actor, &r.work, None).await.is_ok() {
                return Ok(true);
            }
        }
        Ok(false)
    }
}
pub fn validate(v: &WorkInput) -> Result<()> {
    ensure!(
        !v.title.trim().is_empty()
            && v.title.chars().count() <= 160
            && !v.title.chars().any(char::is_control),
        "Use a title of 1–160 characters"
    );
    ensure!(
        v.subtitle.chars().count() <= 240
            && !v.subtitle.chars().any(char::is_control)
            && v.synopsis.chars().count() <= 10000,
        "Subtitle or synopsis is too long"
    );
    ensure!(
        v.work_type == "book",
        "Only Book works are supported currently"
    );
    for uid in [&v.cover, &v.hero].into_iter().flatten() {
        ensure!(
            uid.starts_with("asset_")
                && uid.len() == 42
                && uid
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-')),
            "Invalid artwork reference"
        );
    }
    Ok(())
}

pub mod details;

pub mod collaboration;

pub mod translations;

pub mod engagement;
pub mod lifecycle;
pub mod publishing;
pub mod reader;

pub mod schedule;

pub mod community;
