//! Language-specific drafting/review rights and source-bound human-approved translations.
use crate::{Actor, Studio, details::Kind};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
#[derive(Clone, Deserialize, Serialize)]
pub struct Grant {
    pub uid: String,
    pub locale: String,
    pub can_draft: bool,
    pub can_approve: bool,
    #[serde(default)]
    pub display_name: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Translation {
    pub scope: String,
    pub locale: String,
    pub revision: i64,
    pub value: Value,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Value {
    pub source_hash: String,
    pub draft: Option<BTreeMap<String, String>>,
    pub live: Option<BTreeMap<String, String>>,
    pub author: String,
    pub approver: Option<String>,
    #[serde(default)]
    pub live_source_hash: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    pub scope: String,
    pub locale: String,
    pub revision: i64,
    pub fields: BTreeMap<String, String>,
    pub source_hash: String,
    pub approve: bool,
}
#[derive(Serialize)]
pub struct Page {
    pub work_revision: i64,
    pub source_locale: String,
    pub can_manage: bool,
    pub grants: Vec<Grant>,
    pub translations: Vec<Translation>,
    pub scopes: Vec<Scope>,
}
#[derive(Serialize)]
pub struct Scope {
    pub uid: String,
    pub title: String,
    pub source_hash: String,
    pub fields: BTreeMap<String, String>,
}
impl Studio {
    pub async fn translation_page(
        &self,
        actor: &Actor<'_>,
        work: &str,
        now: i64,
        selection: Option<(&str, &str)>,
    ) -> Result<Page> {
        let page = self.get(actor, work, None).await?;
        let details = self.details(actor, work, now).await?;
        let source = self.translation_source(work).await?;
        let mut scopes = vec![scope(
            "overview".into(),
            page.work.title.clone(),
            BTreeMap::from([
                ("title".into(), page.work.title),
                ("subtitle".into(), page.work.subtitle),
                ("synopsis".into(), page.work.synopsis),
            ]),
            &source,
        )?];
        for chapter in details
            .value
            .nodes
            .into_iter()
            .filter(|n| n.kind == Kind::Chapter && n.delete_after.is_none())
        {
            scopes.push(scope(
                chapter.uid,
                chapter.title.clone(),
                BTreeMap::from([
                    ("title".into(), chapter.title),
                    ("synopsis".into(), chapter.synopsis),
                ]),
                &source,
            )?);
        }
        let own = page.work.owner == actor.uid || actor.administrator;
        let mut grants:Vec<Grant>=self.store.rows("SELECT uid,locale,can_draft,can_approve FROM work_translation_access WHERE work=$work",json!({"work":work})).await?;
        if !own {
            grants.retain(|g| g.uid == actor.uid);
        }
        for g in &mut grants {
            if let Some(user) = self.store.by_uid(&g.uid).await? {
                g.display_name = user.display_name;
            }
        }
        let target = selection.map(|s| s.0).unwrap_or("overview");
        let locale = selection
            .map(|s| s.1)
            .unwrap_or(if source == "en" { "ja" } else { "en" });
        let mut translations:Vec<Translation>=self.store.rows("SELECT scope,locale,revision,value FROM work_translation WHERE work=$work AND scope=$scope AND locale=$locale LIMIT 1",json!({"work":work,"scope":target,"locale":locale})).await?;
        for scope in &mut scopes {
            if scope.uid != target {
                scope.fields.clear();
            }
        }
        for t in &mut translations {
            if !own
                && !grants.iter().any(|g| {
                    g.uid == actor.uid && g.locale == t.locale && (g.can_draft || g.can_approve)
                })
            {
                t.value.draft = None;
            }
        }
        Ok(Page {
            work_revision: page.work.revision,
            source_locale: source,
            can_manage: page.can_share,
            grants,
            translations,
            scopes,
        })
    }
    pub async fn translation_source(&self, work: &str) -> Result<String> {
        let rows: Vec<String> = self
            .store
            .rows(
                "SELECT VALUE locale FROM work_translation_source WHERE work=$work",
                json!({"work":work}),
            )
            .await?;
        if let Some(locale) = rows.into_iter().next() {
            Ok(locale)
        } else {
            Ok(
                artismaga_localisation::Localisation::new(self.store.clone())
                    .settings()
                    .await?
                    .source_locale,
            )
        }
    }
    pub async fn set_translation_source(
        &self,
        actor: &Actor<'_>,
        work: &str,
        locale: &str,
    ) -> Result<()> {
        ensure!(
            self.get(actor, work, None).await?.can_share
                && artismaga_localisation::valid_locale(locale),
            "Source language permission required"
        );
        self.store.query("BEGIN TRANSACTION; LET $w=(SELECT * FROM work WHERE uid=$work)[0]; IF !$admin AND $w.owner!=$actor {THROW 'access revoked';}; UPDATE work SET revision=revision+1 WHERE uid=$work; UPSERT type::record('work_translation_source',$work) SET work=$work,locale=$locale; COMMIT TRANSACTION;",json!({"work":work,"locale":locale,"actor":actor.uid,"admin":actor.administrator})).await?;
        Ok(())
    }
    pub async fn translation_grants(
        &self,
        actor: &Actor<'_>,
        work: &str,
        grant: Access<'_>,
    ) -> Result<()> {
        let Access {
            recipients,
            locale,
            can_draft,
            can_approve,
            remove,
        } = grant;
        ensure!(
            self.get(actor, work, None).await?.can_share
                && artismaga_localisation::valid_locale(locale)
                && !recipients.is_empty()
                && recipients.len() <= 50
                && (remove || can_draft || can_approve),
            "Translation sharing permission required"
        );
        let mut ids = Vec::new();
        for r in recipients {
            let user = if r.contains('@') {
                self.store
                    .by_email(&artismaga_core::normalize_email(r).map_err(anyhow::Error::msg)?)
                    .await?
            } else {
                self.store.by_uid(r).await?
            }
            .ok_or_else(|| anyhow::anyhow!("Recipient unavailable"))?;
            if !ids.contains(&user.uid) {
                ids.push(user.uid);
            }
        }
        self.store.query(include_str!("translation_grants.surql"),json!({"work":work,"recipients":ids,"locale":locale,"can_draft":can_draft,"can_approve":can_approve,"remove":remove,"actor":actor.uid,"admin":actor.administrator})).await?;
        Ok(())
    }
    pub async fn save_translation(
        &self,
        actor: &Actor<'_>,
        work: &str,
        update: Update,
        now: i64,
    ) -> Result<i64> {
        ensure!(
            artismaga_localisation::valid_locale(&update.locale)
                && (0..i64::MAX).contains(&update.revision),
            "Invalid translation language or revision"
        );
        let work_revision = self.get(actor, work, None).await?.work.revision;
        let page = self
            .translation_page(actor, work, now, Some((&update.scope, &update.locale)))
            .await?;
        let source = page
            .scopes
            .iter()
            .find(|s| s.uid == update.scope)
            .ok_or_else(|| anyhow::anyhow!("Translation source unavailable"))?;
        ensure!(
            source.source_hash == update.source_hash,
            "Source content changed; reload before translating"
        );
        ensure!(
            update.fields.keys().eq(source.fields.keys())
                && update.fields.values().all(|v| v.chars().count() <= 12000)
                && update
                    .fields
                    .get("title")
                    .is_some_and(|t| !t.trim().is_empty() && t.chars().count() <= 160),
            "Translation fields are invalid"
        );
        let grant = page
            .grants
            .iter()
            .find(|g| g.uid == actor.uid && g.locale == update.locale);
        ensure!(
            page.can_manage
                || grant.is_some_and(|g| if update.approve {
                    g.can_approve
                } else {
                    g.can_draft
                }),
            "This language requires translation drafting or approval permission"
        );
        self.store.query(include_str!("translation_save.surql"),json!({"work":work,"scope":update.scope,"locale":update.locale,"revision":update.revision,"fields":update.fields,"hash":update.source_hash,"actor":actor.uid,"admin":actor.administrator,"approve":update.approve,"key":format!("{:x}",Sha256::digest(format!("{work}:{}:{}",update.scope,update.locale))),"work_revision":work_revision})).await?;
        Ok(update.revision + 1)
    }
}
fn scope(
    uid: String,
    title: String,
    fields: BTreeMap<String, String>,
    locale: &str,
) -> Result<Scope> {
    let hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&json!([locale, &fields]))?)
    );
    Ok(Scope {
        uid,
        title,
        source_hash: hash,
        fields,
    })
}

pub struct Access<'a> {
    pub recipients: &'a [String],
    pub locale: &'a str,
    pub can_draft: bool,
    pub can_approve: bool,
    pub remove: bool,
}
