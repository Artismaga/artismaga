//! Explicit public catalogue snapshots. Private manuscripts and notes never enter this DTO.
use crate::{
    Actor, Studio,
    details::{Details, Kind},
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Publication {
    #[serde(default)]
    pub hiatus_until: Option<i64>,
    #[serde(default)]
    pub chapter_dates: std::collections::BTreeMap<String, ChapterDates>,
    #[serde(default)]
    pub related: Vec<String>,
    #[serde(default, deserialize_with = "crate::schedule::read_legacy")]
    pub release_schedule: Option<crate::schedule::ReleaseSchedule>,
    pub latest_chapter_release: i64,
    pub completed_at: Option<i64>,
    pub uid: String,
    pub author: String,
    pub author_name: String,
    pub title: String,
    pub subtitle: String,
    pub synopsis: String,
    pub cover: String,
    pub hero: String,
    pub details: Details,
    pub language: String,
    pub status: String,
    pub mature: bool,
    pub featured: bool,
    pub first_published: i64,
    pub updated_at: i64,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct ChapterDates {
    #[serde(default)]
    pub body_revision: Option<i64>,
    pub released_at: i64,
    pub updated_at: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Publish {
    pub revision: i64,
    pub details_revision: i64,
    pub language: String,
    pub status: String,
    pub mature: bool,
    pub disclosures_reviewed: bool,
    #[serde(default)]
    pub related: Vec<String>,
    #[serde(default)]
    pub release_schedule: Option<crate::schedule::ReleaseSchedule>,
}
impl Studio {
    pub async fn publish(
        &self,
        actor: &Actor<'_>,
        uid: &str,
        input: Publish,
        now: i64,
    ) -> Result<()> {
        let page = self.get(actor, uid, None).await?;
        ensure!(
            page.can_share,
            "Only the owner or an administrator can publish"
        );
        let doc = self.raw_details(uid).await?;
        ensure!(
            page.work.revision == input.revision && doc.revision == input.details_revision,
            "Draft changed; reload"
        );
        ensure!(!page.work.synopsis.trim().is_empty(), "Add a synopsis");
        let cover = page
            .work
            .cover
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Upload a cover"))?;
        let hero = page
            .work
            .hero
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Upload a hero"))?;
        ensure!(!doc.value.genres.is_empty(), "Choose a genre");
        ensure!(
            (doc.value.target_audience.minimum_age.is_some()
                || doc.value.target_audience.maximum_age.is_some()),
            "Configure the target audience"
        );
        ensure!(input.disclosures_reviewed, "Review the content disclosures");
        ensure!(
            ["en", "ja", "zh", "es", "fr"].contains(&input.language.as_str()),
            "Choose a supported language"
        );
        ensure!(
            [
                "ongoing",
                "completed",
                "hiatus",
                "abandoned",
                "discontinued"
            ]
            .contains(&input.status.as_str()),
            "Choose a public status"
        );
        ensure!(
            input.related.len() <= 20,
            "Related works or release schedule exceeds limits"
        );
        if let Some(schedule) = &input.release_schedule {
            schedule.validate()?;
        }
        let mut unique = std::collections::HashSet::new();
        for related in &input.related {
            ensure!(
                related != uid
                    && unique.insert(related)
                    && self.publication(related).await?.is_some(),
                "Choose distinct public related works"
            );
        }
        let mut details = doc.value;
        #[derive(Deserialize)]
        struct Released {
            chapter: String,
            value: crate::reader::Body,
        }
        let released: Vec<Released> = self
            .store
            .rows(
                "SELECT chapter,value FROM chapter_publication WHERE work=$work",
                json!({"work":uid}),
            )
            .await?;
        details.nodes.retain(|n| {
            n.delete_after.is_none()
                && (n.kind != Kind::Chapter || released.iter().any(|b| b.chapter == n.uid))
        });
        ensure!(
            details.nodes.iter().any(|n| n.kind == Kind::Chapter),
            "Publish at least one chapter before publishing the story"
        );
        let author = self
            .store
            .by_uid(&page.work.owner)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Author unavailable"))?;
        let mature = input.mature
            || details.disclosures.adult.is_some()
            || details.target_audience.minimum_age.is_some_and(|v| v >= 18);
        let previous = self.publication(uid).await?;
        let lifecycle = self.lifecycle(uid).await?;
        let status = if lifecycle.revision > 0 {
            lifecycle.status.clone()
        } else if input.status == "discontinued" {
            "abandoned".into()
        } else {
            input.status.clone()
        };
        let chapter_dates: std::collections::BTreeMap<String, ChapterDates> = details
            .nodes
            .iter()
            .filter(|n| n.kind == Kind::Chapter)
            .filter_map(|node| {
                released.iter().find(|b| b.chapter == node.uid).map(|b| {
                    (
                        node.uid.clone(),
                        ChapterDates {
                            body_revision: Some(b.value.revision),
                            released_at: b.value.released_at,
                            updated_at: b.value.updated_at,
                        },
                    )
                })
            })
            .collect();
        let latest_chapter_release = chapter_dates
            .values()
            .map(|d| d.released_at)
            .max()
            .unwrap_or(now);
        let completed_at = if status == "completed" {
            Some(
                previous
                    .as_ref()
                    .filter(|p| p.status == "completed")
                    .and_then(|p| p.completed_at)
                    .unwrap_or(now),
            )
        } else {
            None
        };
        let snapshot = Publication {
            hiatus_until: lifecycle.hiatus_until,
            related: input.related,
            release_schedule: input.release_schedule,
            latest_chapter_release,
            completed_at,
            chapter_dates,
            uid: uid.into(),
            author: author.uid,
            author_name: author.display_name,
            title: page.work.title,
            subtitle: page.work.subtitle,
            synopsis: page.work.synopsis,
            cover,
            hero,
            details,
            language: input.language,
            status,
            mature,
            featured: false,
            first_published: now,
            updated_at: now,
        };
        ensure!(
            serde_json::to_vec(&snapshot)?.len() <= 750_000,
            "Public catalogue exceeds the initial 750 KB limit"
        );
        self.store.query(include_str!("publish.surql"),json!({"uid":uid,"actor":actor.uid,"admin":actor.administrator,"revision":input.revision,"details_revision":input.details_revision,"snapshot":snapshot,"now":now})).await?;
        Ok(())
    }
    pub async fn unpublish(&self, actor: &Actor<'_>, uid: &str, revision: i64) -> Result<()> {
        ensure!(
            self.get(actor, uid, None).await?.can_share,
            "Publishing access required"
        );
        self.store.query(include_str!("unpublish.surql"),json!({"uid":uid,"actor":actor.uid,"admin":actor.administrator,"revision":revision})).await?;
        Ok(())
    }
    pub async fn publications(&self) -> Result<Vec<Publication>> {
        self.store
            .rows(
                "SELECT VALUE object::extend(value,{details:object::extend(value.details,{nodes:[],disclosures:{gore:NULL,self_harm:NULL,assault:NULL,adult:NULL}}),chapter_dates:{},synopsis:string::slice(value.synopsis,0,600)}) FROM (SELECT * FROM work_publication ORDER BY value.featured DESC,value.updated_at DESC LIMIT 120)",
                json!({}),
            )
            .await
    }
    pub async fn publication(&self, uid: &str) -> Result<Option<Publication>> {
        let mut result: Option<Publication> = self
            .store
            .rows(
                "SELECT VALUE value FROM work_publication WHERE work=$uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop();
        if let Some(story) = &mut result {
            let chapters: Vec<String> = self
                .store
                .rows(
                    "SELECT VALUE chapter FROM chapter_publication WHERE work=$uid",
                    json!({"uid":uid}),
                )
                .await?;
            story
                .details
                .nodes
                .retain(|n| n.kind != Kind::Chapter || chapters.contains(&n.uid));
        }
        Ok(result)
    }
    pub async fn public_asset(&self, asset: &str) -> Result<bool> {
        let rows: Vec<serde_json::Value> = self.store.rows("SELECT work FROM work_publication WHERE value.cover=$asset OR value.hero=$asset OR value.details.nodes[WHERE cover=$asset]!=[] LIMIT 1", json!({"asset":asset})).await?;
        Ok(!rows.is_empty())
    }
}
