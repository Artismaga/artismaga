//! Revisioned chapter hierarchy, archive and work-wide classification/disclosures.
use crate::{Actor, Studio};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Volume,
    Arc,
    Chapter,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Node {
    #[serde(default)]
    pub disclosures: Vec<Disclosure>,
    pub uid: String,
    pub kind: Kind,
    pub parent: Option<String>,
    pub title: String,
    pub synopsis: String,
    pub cover: Option<String>,
    pub delete_after: Option<i64>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Disclosure {
    Gore,
    Assault,
    SexualContent,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GenreSelection {
    pub genre: String,
    pub subgenre: Option<String>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Disclosures {
    pub gore: Option<String>,
    pub self_harm: Option<String>,
    pub assault: Option<String>,
    pub adult: Option<String>,
}
/// Author intent, independent of content disclosures or access restrictions.
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct TargetAudience {
    pub minimum_age: Option<u8>,
    pub maximum_age: Option<u8>,
}
impl TargetAudience {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.minimum_age.is_none_or(|v| v <= 120) && self.maximum_age.is_none_or(|v| v <= 120),
            "Audience ages must be between 0 and 120"
        );
        ensure!(
            self.minimum_age
                .zip(self.maximum_age)
                .is_none_or(|(min, max)| min <= max),
            "Maximum audience age must not be below minimum age"
        );
        Ok(())
    }
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Details {
    pub nodes: Vec<Node>,
    pub genres: Vec<GenreSelection>,
    pub tags: Vec<String>,
    pub disclosures: Disclosures,
    pub target_audience: TargetAudience,
}
#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Document {
    pub revision: i64,
    pub value: Details,
}
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    SaveNode {
        #[serde(default)]
        disclosures: Vec<Disclosure>,
        uid: Option<String>,
        kind: Kind,
        parent: Option<String>,
        title: String,
        synopsis: String,
        cover: Option<String>,
    },
    Move {
        uid: String,
        parent: Option<String>,
        before: Option<String>,
    },
    Archive {
        uid: String,
    },
    Restore {
        uid: String,
    },
    RemoveGroup {
        uid: String,
    },
    Audience {
        target_audience: TargetAudience,
    },
    Metadata {
        genres: Vec<GenreSelection>,
        tags: Vec<String>,
        disclosures: Disclosures,
    },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    pub revision: i64,
    pub command: Command,
}
impl Studio {
    pub async fn details(&self, actor: &Actor<'_>, uid: &str, now: i64) -> Result<Document> {
        self.get(actor, uid, None).await?;
        let mut d = self.raw_details(uid).await?;
        // Expiry is enforced even when the background cleanup worker is delayed.
        d.value
            .nodes
            .retain(|n| n.delete_after.is_none_or(|t| t > now));
        Ok(d)
    }
    pub(crate) async fn raw_details(&self, uid: &str) -> Result<Document> {
        Ok(self
            .store
            .rows(
                "SELECT revision,value FROM work_details WHERE work=$work",
                json!({"work":uid}),
            )
            .await?
            .pop()
            .unwrap_or_default())
    }
    pub async fn change_details(
        &self,
        actor: &Actor<'_>,
        uid: &str,
        update: Update,
        now: i64,
    ) -> Result<Document> {
        ensure!(actor.can_write, "Writing permission required");
        let page = self.get(actor, uid, None).await?;
        ensure!(page.can_edit, "Editing permission required");
        let mut doc = self.raw_details(uid).await?;
        ensure!(
            doc.revision == update.revision && (0..i64::MAX).contains(&update.revision),
            "Work configuration changed; reload"
        );
        doc.value
            .nodes
            .retain(|n| n.delete_after.is_none_or(|t| t > now));
        match update.command {
            Command::SaveNode {
                disclosures,
                uid,
                kind,
                parent,
                title,
                synopsis,
                cover,
            } => {
                let old = uid
                    .as_ref()
                    .and_then(|id| doc.value.nodes.iter().find(|n| &n.uid == id));
                if uid.is_some() {
                    ensure!(
                        old.is_some_and(|n| n.kind == kind && n.delete_after.is_none()),
                        "Chapter unavailable"
                    );
                }
                if let Some(cover) = &cover {
                    ensure!(kind == Kind::Chapter, "Only chapters have covers");
                    if old.and_then(|n| n.cover.as_ref()) != Some(cover) {
                        let assets: Vec<serde_json::Value> = self.store.rows("SELECT uid FROM media_asset WHERE uid=$id AND owner=$actor AND purpose='chapter_cover'",json!({"id":cover,"actor":actor.uid})).await?;
                        ensure!(assets.len() == 1, "Choose your own chapter cover upload");
                    }
                }
                ensure!(
                    disclosures.len() <= 3
                        && disclosures
                            .iter()
                            .collect::<std::collections::HashSet<_>>()
                            .len()
                            == disclosures.len(),
                    "Choose distinct chapter disclosures"
                );
                ensure!(
                    kind == Kind::Chapter || disclosures.is_empty(),
                    "Only chapters have disclosures"
                );
                let node = Node {
                    disclosures,
                    uid: uid
                        .clone()
                        .unwrap_or_else(|| format!("node_{}", uuid::Uuid::new_v4())),
                    kind,
                    parent,
                    title: title.trim().into(),
                    synopsis,
                    cover,
                    delete_after: None,
                };
                if let Some(index) =
                    uid.and_then(|id| doc.value.nodes.iter().position(|n| n.uid == id))
                {
                    doc.value.nodes[index] = node;
                } else {
                    doc.value.nodes.push(node);
                }
            }
            Command::Move {
                uid,
                parent,
                before,
            } => {
                let index = doc
                    .value
                    .nodes
                    .iter()
                    .position(|n| n.uid == uid && n.delete_after.is_none())
                    .ok_or_else(|| anyhow::anyhow!("Chapter unavailable"))?;
                let mut node = doc.value.nodes.remove(index);
                node.parent = parent;
                let index = if let Some(before) = before {
                    doc.value
                        .nodes
                        .iter()
                        .position(|n| {
                            n.uid == before
                                && n.parent == node.parent
                                && n.kind == node.kind
                                && n.delete_after.is_none()
                        })
                        .ok_or_else(|| anyhow::anyhow!("Invalid drop target"))?
                } else {
                    doc.value.nodes.len()
                };
                doc.value.nodes.insert(index, node);
            }
            Command::Archive { uid } => {
                let n = doc
                    .value
                    .nodes
                    .iter_mut()
                    .find(|n| n.uid == uid && n.kind == Kind::Chapter && n.delete_after.is_none())
                    .ok_or_else(|| anyhow::anyhow!("Chapter unavailable"))?;
                n.delete_after = Some(now + 7 * 24 * 3600);
            }
            Command::Restore { uid } => {
                let n = doc
                    .value
                    .nodes
                    .iter_mut()
                    .find(|n| n.uid == uid && n.delete_after.is_some_and(|t| t > now))
                    .ok_or_else(|| anyhow::anyhow!("Recovery period ended"))?;
                n.delete_after = None;
            }
            Command::RemoveGroup { uid } => {
                ensure!(
                    !doc.value
                        .nodes
                        .iter()
                        .any(|n| n.parent.as_ref() == Some(&uid)),
                    "Move all children, including archived chapters, before removing this group"
                );
                ensure!(
                    doc.value
                        .nodes
                        .iter()
                        .any(|n| n.uid == uid && n.kind != Kind::Chapter),
                    "Group unavailable"
                );
                doc.value.nodes.retain(|n| n.uid != uid);
            }
            Command::Audience { target_audience } => {
                target_audience.validate()?;
                doc.value.target_audience = target_audience;
            }
            Command::Metadata {
                genres,
                mut tags,
                disclosures,
            } => {
                let taxonomy = artismaga_administration::taxonomy::load(&self.store).await?;
                ensure!(genres.len() <= 2, "Choose up to two genres");
                let mut used = std::collections::HashSet::new();
                for g in &genres {
                    ensure!(
                        used.insert(&g.genre)
                            && taxonomy
                                .value
                                .genres
                                .iter()
                                .any(|v| v.key == g.genre && v.parent.is_none()),
                        "Choose distinct known genres"
                    );
                    if let Some(sub) = &g.subgenre {
                        ensure!(
                            taxonomy
                                .value
                                .genres
                                .iter()
                                .any(|v| &v.key == sub && v.parent.as_ref() == Some(&g.genre)),
                            "Subgenre does not belong to this genre"
                        );
                    }
                }
                for tag in &mut tags {
                    *tag = tag.trim().to_owned();
                }
                ensure!(
                    tags.len() <= 40
                        && tags
                            .iter()
                            .all(|t| artismaga_administration::taxonomy::tag_valid(t)),
                    "Use up to 40 tags of 1–64 characters"
                );
                let mut unique = std::collections::HashSet::new();
                ensure!(
                    tags.iter().all(|t| unique.insert(t.to_lowercase())),
                    "Remove duplicate tags"
                );
                if !taxonomy.value.allow_arbitrary_tags {
                    let mut allowed = taxonomy.value.tags;
                    if taxonomy.value.premade_tags {
                        allowed.extend(artismaga_administration::taxonomy::seed_tags());
                    }
                    ensure!(
                        tags.iter()
                            .all(|t| allowed.iter().any(|a| a.eq_ignore_ascii_case(t))),
                        "Choose tags from the site list"
                    );
                }
                for reason in [
                    &disclosures.gore,
                    &disclosures.self_harm,
                    &disclosures.assault,
                    &disclosures.adult,
                ]
                .into_iter()
                .flatten()
                {
                    ensure!(
                        !reason.trim().is_empty() && reason.chars().count() <= 2000,
                        "Explain each enabled disclosure in 1–2000 characters"
                    );
                }
                doc.value.genres = genres;
                doc.value.tags = tags;
                doc.value.disclosures = disclosures;
            }
        }
        validate_tree(&doc.value.nodes)?;
        ensure!(
            serde_json::to_vec(&doc.value)?.len() <= 1_000_000,
            "Work configuration exceeds the initial 1 MB limit"
        );
        self.persist_details(actor, uid, &doc, now).await?;
        doc.revision += 1;
        Ok(doc)
    }
    async fn persist_details(
        &self,
        actor: &Actor<'_>,
        uid: &str,
        doc: &Document,
        now: i64,
    ) -> Result<()> {
        self.store.query(include_str!("details_update.surql"),json!({"work":uid,"actor":actor.uid,"admin":actor.administrator,"revision":doc.revision,"value":doc.value,"now":now})).await?;
        Ok(())
    }
    async fn queue_unused_cover(&self, asset: &str) -> Result<()> {
        self.store
            .query(
                include_str!("chapter_cover_delete.surql"),
                json!({"asset":asset}),
            )
            .await?;
        Ok(())
    }
    pub async fn purge_chapters(&self, now: i64) -> Result<()> {
        #[derive(Deserialize)]
        struct Row {
            work: String,
            revision: i64,
            value: Details,
        }
        let docs: Vec<Row> = self.store.rows("SELECT work,revision,value FROM work_details WHERE value.nodes[WHERE delete_after != NULL AND delete_after <= $now] != [] LIMIT 100", json!({"now":now})).await?;
        for d in docs {
            let mut value = d.value;
            value
                .nodes
                .retain(|n| n.delete_after.is_none_or(|t| t > now));
            // Same row revision serializes recovery versus the scheduled purge.
            self.store
                .query(
                    include_str!("chapters_purge.surql"),
                    json!({"work":d.work,"revision":d.revision,"value":value,"now":now}),
                )
                .await?;
        }
        #[derive(Deserialize)]
        struct Retirement {
            uid: String,
        }
        let jobs: Vec<Retirement> = self
            .store
            .rows(
                "SELECT uid FROM chapter_cover_retirement LIMIT 100",
                json!({}),
            )
            .await?;
        for job in jobs {
            self.queue_unused_cover(&job.uid).await?;
        }
        Ok(())
    }
}
pub fn validate_tree(nodes: &[Node]) -> Result<()> {
    ensure!(
        nodes.len() <= 2000,
        "This initial Studio supports up to 2000 chapter/group records per work"
    );
    let mut ids = std::collections::HashSet::new();
    for n in nodes {
        ensure!(
            ids.insert(&n.uid)
                && !n.title.trim().is_empty()
                && n.title.chars().count() <= 160
                && !n.title.chars().any(char::is_control)
                && n.synopsis.chars().count() <= 1000,
            "Use a title of 1–160 characters and synopsis up to 1000 characters"
        );
        let parent = n
            .parent
            .as_ref()
            .and_then(|id| nodes.iter().find(|p| &p.uid == id));
        if n.parent.is_some() {
            ensure!(
                parent.is_some_and(|p| p.delete_after.is_none()),
                "Parent group unavailable"
            );
        }
        ensure!(
            match n.kind {
                Kind::Volume => n.parent.is_none(),
                Kind::Arc => parent.is_some_and(|p| p.kind == Kind::Volume),
                Kind::Chapter => parent.is_none_or(|p| p.kind != Kind::Chapter),
            },
            "Hierarchy must be volume, then arc, then chapter"
        );
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn node(id: &str, kind: Kind, parent: Option<&str>) -> Node {
        Node {
            disclosures: vec![],
            uid: id.into(),
            kind,
            parent: parent.map(String::from),
            title: id.into(),
            synopsis: String::new(),
            cover: None,
            delete_after: None,
        }
    }
    #[test]
    fn audience_range_is_optional_bounded_and_ordered() {
        for (minimum_age, maximum_age) in [
            (None, None),
            (None, Some(12)),
            (Some(0), Some(12)),
            (Some(18), None),
            (Some(12), Some(12)),
        ] {
            assert!(
                TargetAudience {
                    minimum_age,
                    maximum_age
                }
                .validate()
                .is_ok()
            );
        }
        for (minimum_age, maximum_age) in [
            (Some(18), Some(12)),
            (Some(121), None),
            (Some(0), Some(121)),
        ] {
            assert!(
                TargetAudience {
                    minimum_age,
                    maximum_age
                }
                .validate()
                .is_err()
            );
        }
        assert!(serde_json::from_value::<TargetAudience>(json!({"minimum_age":-1})).is_err());
        assert!(serde_json::from_value::<TargetAudience>(json!({"minimum_age":12.5})).is_err());
        assert!(
            serde_json::from_value::<Details>(json!({}))
                .unwrap()
                .target_audience
                .minimum_age
                .is_none()
        );
    }
    #[test]
    fn hierarchy_rejects_cycles_and_inverted_groups() {
        assert!(
            validate_tree(&[
                node("v", Kind::Volume, None),
                node("a", Kind::Arc, Some("v")),
                node("c", Kind::Chapter, Some("a"))
            ])
            .is_ok()
        );
        assert!(validate_tree(&[node("a", Kind::Arc, None)]).is_err());
        assert!(
            validate_tree(&[
                node("v", Kind::Volume, Some("a")),
                node("a", Kind::Arc, Some("v"))
            ])
            .is_err()
        );
        assert!(
            validate_tree(&[
                node("c", Kind::Chapter, None),
                node("d", Kind::Chapter, Some("c"))
            ])
            .is_err()
        );
    }
}
