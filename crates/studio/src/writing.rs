//! Private typed chapter documents, bounded validation and immutable revision checkpoints.
use crate::{
    Actor, Studio,
    details::{Kind, Node},
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Mark {
    pub r#type: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub attrs: BTreeMap<String, Value>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RichNode {
    pub r#type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub attrs: BTreeMap<String, Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub marks: Vec<Mark>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub content: Vec<RichNode>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Anchor {
    pub from: u32,
    pub to: u32,
    pub quote: String,
    pub detached: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Note {
    pub uid: String,
    pub text: String,
    pub anchor: Option<Anchor>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manuscript {
    #[serde(default)]
    pub chapter_note: String,
    pub document: RichNode,
    pub notes: Vec<Note>,
    pub language: String,
}
impl Default for Manuscript {
    fn default() -> Self {
        Self {
            document: RichNode {
                r#type: "doc".into(),
                text: None,
                attrs: BTreeMap::new(),
                marks: vec![],
                content: vec![RichNode {
                    r#type: "paragraph".into(),
                    text: None,
                    attrs: BTreeMap::new(),
                    marks: vec![],
                    content: vec![],
                }],
            },
            chapter_note: String::new(),
            notes: vec![],
            language: "en".into(),
        }
    }
}
#[derive(Clone, Deserialize, Serialize, Default)]
pub struct Draft {
    pub revision: i64,
    pub value: Manuscript,
    pub updated_at: i64,
    #[serde(default)]
    pub author_name: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Revision {
    #[serde(default, skip_serializing)]
    updated_by: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    pub revision: i64,
    pub updated_at: i64,
    pub author_name: String,
    pub reason: String,
}
#[derive(Serialize)]
pub struct History {
    pub revisions: Vec<Revision>,
    pub has_more: bool,
    pub next_before: i64,
}
#[derive(Serialize)]
pub struct Page {
    pub chapter: Node,
    pub draft: Draft,
    pub can_edit: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Save {
    pub revision: i64,
    pub value: Manuscript,
    pub checkpoint: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Restore {
    pub revision: i64,
    pub source_revision: i64,
}
pub fn safe_link(href: &str) -> bool {
    if href.is_empty() || href.len() > 2000 || href.chars().any(|c| c.is_control() || c == '\\') {
        return false;
    }
    if href.starts_with('#') || (href.starts_with('/') && !href.starts_with("//")) {
        return true;
    }
    url::Url::parse(href).is_ok_and(|u| {
        ["https", "http"].contains(&u.scheme())
            && u.host_str().is_some()
            && u.username().is_empty()
            && u.password().is_none()
    })
}
pub fn validate(value: &Manuscript) -> Result<()> {
    ensure!(
        ["en", "ja", "zh", "es", "fr"].contains(&value.language.as_str()),
        "Choose a supported writing language"
    );
    ensure!(
        value.document.r#type == "doc" && serde_json::to_vec(value)?.len() <= 750_000,
        "Chapter document exceeds the 750 KB limit"
    );
    let mut count = 0;
    validate_node(&value.document, 0, &mut count)?;
    ensure!(value.notes.len() <= 100, "Use up to 100 author notes");
    let mut ids = std::collections::HashSet::new();
    for n in &value.notes {
        ensure!(
            uuid::Uuid::parse_str(&n.uid).is_ok()
                && ids.insert(&n.uid)
                && n.text.chars().count() <= 4000,
            "Check author note IDs and lengths"
        );
        if let Some(a) = &n.anchor {
            ensure!(
                a.from <= a.to && a.to <= 1_000_000 && a.quote.chars().count() <= 500,
                "Invalid note anchor"
            );
        }
    }
    Ok(())
}
fn validate_node(n: &RichNode, depth: usize, count: &mut usize) -> Result<()> {
    *count += 1;
    ensure!(
        depth <= 16 && *count <= 10000,
        "Chapter structure is too complex"
    );
    let block = |v: &str| {
        [
            "paragraph",
            "heading",
            "blockquote",
            "bulletList",
            "orderedList",
            "horizontalRule",
        ]
        .contains(&v)
    };
    let inline = |v: &str| ["text", "hardBreak"].contains(&v);
    ensure!(
        match n.r#type.as_str() {
            "doc" =>
                depth == 0 && !n.content.is_empty() && n.content.iter().all(|c| block(&c.r#type)),
            "paragraph" | "heading" => n.content.iter().all(|c| inline(&c.r#type)),
            "blockquote" => !n.content.is_empty() && n.content.iter().all(|c| block(&c.r#type)),
            "bulletList" | "orderedList" =>
                !n.content.is_empty() && n.content.iter().all(|c| c.r#type == "listItem"),
            "listItem" =>
                n.content.first().is_some_and(|c| c.r#type == "paragraph")
                    && n.content.iter().all(|c| block(&c.r#type)),
            "text" => n.text.as_ref().is_some_and(|t| !t.is_empty()) && n.content.is_empty(),
            "hardBreak" | "horizontalRule" => n.content.is_empty(),
            _ => false,
        },
        "Unsupported chapter structure"
    );
    ensure!(
        n.r#type == "text" || n.text.is_none(),
        "Only text nodes may contain text"
    );
    ensure!(
        inline(&n.r#type) || n.marks.is_empty(),
        "Unsupported block formatting"
    );
    match n.r#type.as_str() {
        "heading" => ensure!(
            n.attrs.len() == 1
                && n.attrs
                    .get("level")
                    .and_then(Value::as_u64)
                    .is_some_and(|l| (2..=4).contains(&l)),
            "Use headings 2–4"
        ),
        "orderedList" => ensure!(
            n.attrs
                .keys()
                .all(|k| ["start", "type"].contains(&k.as_str()))
                && n.attrs
                    .get("type")
                    .is_none_or(|v| v.is_null() || v.as_str() == Some("1"))
                && n.attrs
                    .get("start")
                    .is_none_or(|s| s.as_u64().is_some_and(|s| (1..=10000).contains(&s))),
            "Invalid list numbering"
        ),
        _ => ensure!(n.attrs.is_empty(), "Unsupported node attributes"),
    }
    ensure!(n.marks.len() <= 3, "Too many text styles");
    let mut marks = std::collections::HashSet::new();
    for m in &n.marks {
        ensure!(marks.insert(&m.r#type), "Duplicate text style");
        match m.r#type.as_str() {
            "bold" | "italic" => ensure!(m.attrs.is_empty(), "Unsupported text style attributes"),
            "link" => ensure!(
                m.attrs
                    .keys()
                    .all(|k| ["href", "target", "rel", "class"].contains(&k.as_str()))
                    && m.attrs
                        .get("href")
                        .and_then(Value::as_str)
                        .is_some_and(safe_link)
                    && m.attrs.get("class").is_none_or(Value::is_null)
                    && m.attrs.get("target").is_none_or(|v| v.is_null()
                        || v.as_str().is_some_and(|s| ["_blank", "_self"].contains(&s)))
                    && m.attrs.get("rel").is_none_or(|v| v.is_null()
                        || v.as_str().is_some_and(|s| [
                            "noopener noreferrer nofollow",
                            "noopener noreferrer"
                        ]
                        .contains(&s))),
                "Use a safe HTTP, HTTPS or local link"
            ),
            _ => anyhow::bail!("Unsupported text style"),
        }
    }
    for child in &n.content {
        validate_node(child, depth + 1, count)?;
    }
    Ok(())
}
impl Studio {
    pub async fn writing(
        &self,
        actor: &Actor<'_>,
        work: &str,
        chapter: &str,
        now: i64,
    ) -> Result<Page> {
        let access = self.get(actor, work, None).await?;
        let details = self.details(actor, work, now).await?;
        let node = details
            .value
            .nodes
            .into_iter()
            .find(|n| n.uid == chapter && n.kind == Kind::Chapter && n.delete_after.is_none())
            .ok_or_else(|| anyhow::anyhow!("Chapter unavailable"))?;
        let mut draft=self.store.rows::<Draft>("SELECT revision,value,updated_at,author_name FROM chapter_draft WHERE work=$work AND chapter=$chapter",json!({"work":work,"chapter":chapter})).await?.pop().unwrap_or_default();
        if draft.revision == 0 {
            draft.value.language = self.translation_source(work).await?;
        }
        Ok(Page {
            chapter: node,
            draft,
            can_edit: access.can_edit && actor.can_write,
        })
    }
    pub async fn writing_history(
        &self,
        actor: &Actor<'_>,
        work: &str,
        chapter: &str,
        before: i64,
        now: i64,
    ) -> Result<History> {
        self.writing(actor, work, chapter, now).await?;
        ensure!(before > 0, "Invalid revision cursor");
        let mut rows=self.store.rows::<Revision>("SELECT revision,updated_at,author_name,reason,updated_by FROM chapter_revision WHERE work=$work AND chapter=$chapter AND revision<$before ORDER BY revision DESC LIMIT 21",json!({"work":work,"chapter":chapter,"before":before})).await?;
        let has_more = rows.len() > 20;
        rows.truncate(20);
        // Resolve public avatar URLs in one bounded query; emails never enter the DTO.
        #[derive(Deserialize)]
        struct EditorIdentity {
            uid: String,
            email: String,
        }
        let ids: Vec<_> = rows
            .iter()
            .map(|r| r.updated_by.clone())
            .filter(|id| !id.is_empty())
            .collect();
        let editors: Vec<EditorIdentity> = self
            .store
            .rows(
                "SELECT uid,email FROM account WHERE uid IN $uids",
                json!({"uids":ids}),
            )
            .await?;
        let avatars: BTreeMap<_, _> = editors
            .into_iter()
            .map(|u| (u.uid, artismaga_core::gravatar(&u.email)))
            .collect();
        for row in &mut rows {
            row.avatar_url = avatars.get(&row.updated_by).cloned();
        }
        let next_before = rows.last().map_or(0, |r| r.revision);
        Ok(History {
            revisions: rows,
            has_more,
            next_before,
        })
    }
    pub async fn writing_revision(
        &self,
        actor: &Actor<'_>,
        work: &str,
        chapter: &str,
        revision: i64,
        now: i64,
    ) -> Result<Draft> {
        self.writing(actor, work, chapter, now).await?;
        self.store.rows::<Draft>("SELECT revision,value,updated_at,author_name FROM chapter_revision WHERE work=$work AND chapter=$chapter AND revision=$revision",json!({"work":work,"chapter":chapter,"revision":revision})).await?.pop().ok_or_else(||anyhow::anyhow!("Revision unavailable"))
    }
    pub async fn save_writing(
        &self,
        actor: &Actor<'_>,
        work: &str,
        chapter: &str,
        input: Save,
        now: i64,
    ) -> Result<Draft> {
        validate(&input.value)?;
        let reason = if input.checkpoint {
            "manual"
        } else {
            "autosave"
        };
        self.persist_writing(actor, work, chapter, input, reason, now)
            .await
    }

    pub async fn restore_writing(
        &self,
        actor: &Actor<'_>,
        work: &str,
        chapter: &str,
        input: Restore,
        now: i64,
    ) -> Result<Draft> {
        let source = self
            .writing_revision(actor, work, chapter, input.source_revision, now)
            .await?;
        self.persist_writing(
            actor,
            work,
            chapter,
            Save {
                revision: input.revision,
                value: source.value,
                checkpoint: true,
            },
            "restore",
            now,
        )
        .await
    }
    async fn persist_writing(
        &self,
        actor: &Actor<'_>,
        work: &str,
        chapter: &str,
        input: Save,
        reason: &str,
        now: i64,
    ) -> Result<Draft> {
        let Save {
            revision, value, ..
        } = input;
        ensure!(
            actor.can_write && self.writing(actor, work, chapter, now).await?.can_edit,
            "Editing permission required"
        );
        ensure!((0..i64::MAX).contains(&revision), "Invalid draft revision");
        let author = self
            .store
            .by_uid(actor.uid)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Account unavailable"))?
            .display_name;
        let key = format!("{:x}", Sha256::digest(format!("{work}/{chapter}")));
        self.store.query(include_str!("writing_save.surql"),json!({"actor":actor.uid,"admin":actor.administrator,"work":work,"chapter":chapter,"revision":revision,"value":value,"reason":reason,"now":now,"key":key,"author":author})).await?;
        Ok(Draft {
            revision: revision + 1,
            value,
            updated_at: now,
            author_name: author,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn manuscript(document: Value) -> Manuscript {
        serde_json::from_value(json!({"document":document,"notes":[],"language":"en"})).unwrap()
    }
    #[test]
    fn structured_documents_reject_active_content_and_invalid_hierarchy() {
        let valid = json!({"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Opening"}]},{"type":"paragraph","content":[{"type":"text","text":"Safe <script> fiction","marks":[{"type":"bold"},{"type":"italic"},{"type":"link","attrs":{"href":"https://example.test"}}]}]},{"type":"orderedList","attrs":{"start":1,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},{"type":"horizontalRule"}]});
        assert!(validate(&manuscript(valid)).is_ok());
        for bad in [
            json!({"type":"doc","content":[{"type":"image","attrs":{"src":"https://example.test"}}]}),
            json!({"type":"doc","content":[{"type":"paragraph","attrs":{"style":"color:red"}}]}),
            json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1}}]}),
            json!({"type":"doc","content":[{"type":"text","text":"outside paragraph"}]}),
            json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"link","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}),
            json!({"type":"doc","content":[{"type":"bulletList","content":[{"type":"paragraph"}]}]}),
        ] {
            assert!(validate(&manuscript(bad)).is_err());
        }
        let mut deep = json!({"type":"paragraph"});
        for _ in 0..17 {
            deep = json!({"type":"blockquote","content":[deep]});
        }
        assert!(validate(&manuscript(json!({"type":"doc","content":[deep]}))).is_err());
        let notes = Manuscript {
            notes: vec![
                Note {
                    uid: uuid::Uuid::new_v4().to_string(),
                    text: "Outline".into(),
                    anchor: None
                };
                2
            ],
            ..Default::default()
        };
        assert!(validate(&notes).is_err());
        assert!(validate(&manuscript(json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x".repeat(750000)}]}]}))).is_err());
    }
    #[test]
    fn links_reject_scheme_and_authority_tricks() {
        for link in [
            "javascript:alert(1)",
            "data:text/html,unsafe",
            "//example.test",
            "/\\example.test",
            "https://user:password@example.test",
            "https://example.test\n/path",
            "ftp://example.test",
        ] {
            assert!(!safe_link(link), "{link}");
        }
        for link in [
            "https://example.test/path",
            "http://example.test",
            "/story/example",
            "#scene",
        ] {
            assert!(safe_link(link));
        }
    }
}
