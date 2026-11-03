//! Public chapter projection, private reading state and bounded reaction policy.
use crate::{
    Studio,
    details::{Kind, Node},
    writing::RichNode,
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone, Deserialize, Serialize)]
pub struct Body {
    pub document: RichNode,
    pub language: String,
    pub revision: i64,
    pub released_at: i64,
    pub updated_at: i64,
}
#[derive(Serialize)]
pub struct Chapter {
    pub stats: crate::engagement::Stats,
    pub work: String,
    pub story_title: String,
    pub chapter: Node,
    pub body: Body,
    pub chapters: Vec<Node>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Reaction {
    pub id: String,
    pub title: String,
    pub image: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Configuration {
    pub revision: i64,
    pub show_titles: bool,
    pub reactions: Vec<Reaction>,
}
impl Default for Configuration {
    fn default() -> Self {
        Self {
            revision: 0,
            show_titles: true,
            reactions: [
                ("upvote", "Upvote", "1f44d"),
                ("funny", "Funny", "1f923"),
                ("love", "Love", "1f60d"),
                ("surprised", "Surprised", "1f62f"),
                ("angry", "Angry", "1f624"),
                ("sad", "Sad", "1f62d"),
            ]
            .into_iter()
            .map(|(id, title, image)| Reaction {
                id: id.into(),
                title: title.into(),
                image: format!("/assets/reactions/{image}.png"),
            })
            .collect(),
        }
    }
}
impl Configuration {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            (0..i64::MAX).contains(&self.revision) && self.reactions.len() <= 6,
            "Use up to six reactions"
        );
        let mut ids = std::collections::HashSet::new();
        for r in &self.reactions {
            ensure!(
                !r.id.is_empty()
                    && r.id.len() <= 64
                    && r.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    && ids.insert(&r.id),
                "Use distinct stable reaction IDs"
            );
            ensure!(
                !r.title.trim().is_empty()
                    && r.title.chars().count() <= 40
                    && !r.title.chars().any(char::is_control),
                "Check reaction title"
            );
            ensure!(
                r.image
                    .strip_prefix("/assets/reactions/")
                    .and_then(|v| v.strip_suffix(".png"))
                    .is_some_and(|code| include_str!("twemoji.txt").lines().any(|v| v == code))
                    || r.image
                        .strip_prefix("/media/asset_")
                        .is_some_and(|v| uuid::Uuid::parse_str(v).is_ok()),
                "Choose bundled or uploaded reaction artwork"
            );
        }
        Ok(())
    }
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct ReadingState {
    pub revision: i64,
    pub position: f64,
    pub reactions: Vec<String>,
    pub rating: Option<u8>,
    pub updated_at: i64,
}
impl ReadingState {
    pub fn validate(&self, config: &Configuration) -> Result<()> {
        ensure!(
            (0..i64::MAX).contains(&self.revision)
                && self.position.is_finite()
                && (0.0..=1.0).contains(&self.position),
            "Invalid reading position"
        );
        ensure!(
            self.rating.is_none_or(|v| v <= 5) && self.reactions.len() <= 6,
            "Invalid chapter feedback"
        );
        let mut unique = std::collections::HashSet::new();
        ensure!(
            self.reactions
                .iter()
                .all(|id| unique.insert(id) && config.reactions.iter().any(|r| &r.id == id)),
            "Choose configured reactions"
        );
        Ok(())
    }
}
impl Studio {
    pub async fn reader(&self, work: &str, chapter: &str) -> Result<Option<Chapter>> {
        let Some(mut story) = self.publication(work).await? else {
            return Ok(None);
        };
        let Some(node) = story
            .details
            .nodes
            .iter()
            .find(|n| n.uid == chapter && n.kind == Kind::Chapter)
            .cloned()
        else {
            return Ok(None);
        };
        let body: Option<Body> = self
            .store
            .rows(
                "SELECT VALUE value FROM chapter_publication WHERE work=$work AND chapter=$chapter",
                json!({"work":work,"chapter":chapter}),
            )
            .await?
            .pop();
        let available: Vec<String> = self
            .store
            .rows(
                "SELECT VALUE chapter FROM chapter_publication WHERE work=$work",
                json!({"work":work}),
            )
            .await?;
        story
            .details
            .nodes
            .retain(|n| n.kind != Kind::Chapter || available.contains(&n.uid));
        let stats = self
            .chapter_stats(work)
            .await?
            .into_iter()
            .find(|s| s.chapter == chapter)
            .unwrap_or_else(|| crate::engagement::Stats {
                chapter: chapter.into(),
                ..Default::default()
            });
        Ok(body.map(|body| Chapter {
            stats,
            work: work.into(),
            story_title: story.title,
            chapter: node,
            body,
            chapters: story.details.nodes,
        }))
    }
    pub async fn publish_chapter(
        &self,
        actor: &crate::Actor<'_>,
        work: &str,
        chapter: &str,
        revision: i64,
        now: i64,
    ) -> Result<()> {
        let access = self.get(actor, work, None).await?;
        ensure!(
            actor.can_write && access.can_share,
            "Publishing access required"
        );
        let writing = self.writing(actor, work, chapter, now).await?;
        ensure!(
            writing.draft.revision == revision && revision > 0,
            "Saved chapter changed"
        );
        let details = self.raw_details(work).await?;

        self.store.query(include_str!("chapter_publish.surql"),json!({"work":work,"chapter":chapter,"actor":actor.uid,"admin":actor.administrator,"revision":revision,"work_revision":access.work.revision,"details_revision":details.revision,"node":writing.chapter,"now":now})).await?;
        Ok(())
    }
    pub async fn reaction_configuration(&self) -> Result<Configuration> {
        Ok(self.store.rows::<Configuration>("SELECT revision,value.show_titles AS show_titles,value.reactions AS reactions FROM reaction_configuration:site",json!({})).await?.pop().unwrap_or_default())
    }
    /// HTTP adapter must require administrator authority before calling this command.
    pub async fn configure_reactions(&self, actor: &str, config: Configuration) -> Result<()> {
        self.configure_reactions_retiring(actor, config, &[]).await
    }
    pub async fn configure_reactions_retiring(
        &self,
        actor: &str,
        config: Configuration,
        retired: &[String],
    ) -> Result<()> {
        config.validate()?;
        ensure!(
            retired.len() <= 100
                && retired.iter().all(|v| v
                    .strip_prefix("/media/asset_")
                    .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())),
            "Invalid retired artwork"
        );
        for r in &config.reactions {
            if let Some(asset) = r.image.strip_prefix("/media/") {
                let rows:Vec<serde_json::Value>=self.store.rows("SELECT uid FROM media_asset WHERE uid=$uid AND owner=$actor AND purpose='reaction'",json!({"uid":asset,"actor":actor})).await?;
                // Existing configured assets may be owned by another administrator.
                let existing = self.reaction_configuration().await?;
                ensure!(
                    !rows.is_empty() || existing.reactions.iter().any(|v| v.image == r.image),
                    "Reaction artwork unavailable"
                );
            }
        }
        self.store.query("BEGIN TRANSACTION; LET $old=(SELECT * FROM reaction_configuration:site)[0]; IF ($old.revision ?? 0)!=$revision {THROW 'configuration changed';}; FOR $r IN $value.reactions { IF string::starts_with($r.image,'/media/') { UPDATE media_asset SET purpose=purpose WHERE uid=string::slice($r.image,7); }; }; FOR $r IN ($old.value.reactions ?? []) { IF string::starts_with($r.image,'/media/') AND $r.image NOT IN $value.reactions.image { LET $uid=string::slice($r.image,7); LET $asset=(SELECT * FROM media_asset WHERE uid=$uid AND purpose='reaction')[0]; IF $asset!=NONE { CREATE storage_deletion SET uid=$asset.uid,provider=$asset.provider,object_key=$asset.object_key; DELETE media_asset WHERE uid=$uid AND purpose='reaction'; }; }; }; FOR $image IN $retired { IF $image NOT IN $value.reactions.image { LET $uid=string::slice($image,7); LET $asset=(SELECT * FROM media_asset WHERE uid=$uid AND owner=$actor AND purpose='reaction')[0]; IF $asset!=NONE { CREATE storage_deletion SET uid=$asset.uid,provider=$asset.provider,object_key=$asset.object_key; DELETE media_asset WHERE uid=$uid AND owner=$actor AND purpose='reaction'; }; }; }; UPSERT reaction_configuration:site SET revision=$revision+1,value=$value; COMMIT TRANSACTION;",json!({"revision":config.revision,"value":config,"actor":actor,"retired":retired})).await?;
        Ok(())
    }
    pub async fn reading_state(
        &self,
        account: &str,
        work: &str,
        chapter: &str,
    ) -> Result<ReadingState> {
        let mut value:ReadingState=self.store.rows("SELECT VALUE value FROM reader_state WHERE account=$account AND work=$work AND chapter=$chapter",json!({"account":account,"work":work,"chapter":chapter})).await?.pop().unwrap_or_default();
        let config = self.reaction_configuration().await?;
        value
            .reactions
            .retain(|id| config.reactions.iter().any(|r| &r.id == id));
        Ok(value)
    }
    pub async fn save_reading_state(
        &self,
        account: &str,
        work: &str,
        chapter: &str,
        mut value: ReadingState,
        now: i64,
    ) -> Result<ReadingState> {
        value.validate(&self.reaction_configuration().await?)?;
        let revision = value.revision;
        value.revision += 1;
        value.updated_at = now;
        self.store.query(include_str!("reader_save.surql"),json!({"account":account,"work":work,"chapter":chapter,"revision":revision,"value":value})).await?;
        Ok(value)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn feedback_and_configuration_are_bounded() {
        let config = Configuration::default();
        assert!(config.validate().is_ok());
        assert_eq!(
            config
                .reactions
                .iter()
                .map(|v| v.id.as_str())
                .collect::<Vec<_>>(),
            vec!["upvote", "funny", "love", "surprised", "angry", "sad"]
        );
        let mut bad = config.clone();
        bad.reactions.push(bad.reactions[0].clone());
        assert!(bad.validate().is_err());
        bad = config.clone();
        bad.reactions[0].image = "https://example.test/tracker.png".into();
        assert!(bad.validate().is_err());
        for value in [
            ReadingState {
                position: f64::NAN,
                ..Default::default()
            },
            ReadingState {
                position: 1.1,
                ..Default::default()
            },
            ReadingState {
                rating: Some(6),
                ..Default::default()
            },
            ReadingState {
                reactions: vec!["unknown".into()],
                ..Default::default()
            },
            ReadingState {
                reactions: vec!["upvote".into(), "upvote".into()],
                ..Default::default()
            },
        ] {
            assert!(value.validate(&config).is_err());
        }
        assert!(
            ReadingState {
                rating: Some(0),
                ..Default::default()
            }
            .validate(&config)
            .is_ok()
        );
    }
}
