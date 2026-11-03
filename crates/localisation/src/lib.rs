//! Versioned dot-key registry, safe interpolation and separate draft/live translations.
pub mod runtime;
pub mod translation;
use anyhow::{Result, ensure};
use artismaga_db::Store;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
pub const LOCALES: [&str; 5] = ["en", "ja", "zh", "es", "fr"];
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    pub key: String,
    pub owner: String,
    pub description: String,
    pub defaults: BTreeMap<String, String>,
    pub placeholders: BTreeMap<String, String>,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Override {
    pub key: String,
    pub locale: String,
    pub live: Option<String>,
    pub draft: Option<String>,
    pub revision: i64,
    pub author: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Settings {
    pub revision: i64,
    pub source_locale: String,
    pub enabled: Vec<String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            revision: 0,
            source_locale: "en".into(),
            enabled: LOCALES.map(String::from).to_vec(),
        }
    }
}
pub fn builtins() -> Result<Vec<Definition>> {
    Ok(serde_json::from_str(include_str!("../data/keys.json"))?)
}
pub fn valid_locale(locale: &str) -> bool {
    LOCALES.contains(&locale)
}
pub fn placeholders(text: &str) -> Result<Vec<String>> {
    let mut result = Vec::new();
    let mut rest = text;
    while let Some(at) = rest.find('{') {
        ensure!(
            !rest[..at].contains('}'),
            "Unexpected placeholder delimiter"
        );
        rest = &rest[at + 1..];
        let end = rest
            .find('}')
            .ok_or_else(|| anyhow::anyhow!("Unclosed placeholder"))?;
        let key = &rest[..end];
        ensure!(
            !key.is_empty() && key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_'),
            "Invalid placeholder"
        );
        result.push(key.into());
        rest = &rest[end + 1..];
    }
    ensure!(!rest.contains('}'), "Unexpected placeholder delimiter");
    result.sort();
    result.dedup();
    Ok(result)
}
pub fn validate_text(def: &Definition, text: &str) -> Result<()> {
    if def.key == "site.name" {
        ensure!(
            text.len() <= 100 && !text.chars().any(char::is_control),
            "Use a site name of 1–100 bytes"
        );
    }
    if def.key == "discovery.headline" {
        ensure!(text.chars().count() <= 100, "Branding text is too long");
    }

    ensure!(
        !text.trim().is_empty() && text.len() <= 16000,
        "Translation must contain 1–16000 bytes"
    );
    ensure!(
        placeholders(text)? == def.placeholders.keys().cloned().collect::<Vec<_>>(),
        "Preserve exactly the registered placeholders"
    );
    Ok(())
}
pub fn interpolate(text: &str, values: &BTreeMap<String, String>) -> String {
    // Replacement is single-pass: interpolated user text cannot become a new placeholder.
    let mut result = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('{') {
        result.push_str(&rest[..start]);
        let tail = &rest[start + 1..];
        if let Some(end) = tail.find('}') {
            let name = &tail[..end];
            if let Some(value) = values.get(name) {
                result.push_str(value);
            } else {
                result.push('{');
                result.push_str(name);
                result.push('}');
            }
            rest = &tail[end + 1..];
        } else {
            result.push_str(&rest[start..]);
            rest = "";
            break;
        }
    }
    result.push_str(rest);
    result
}
pub struct Edit<'a> {
    pub key: &'a str,
    pub locale: &'a str,
    pub text: &'a str,
    pub revision: i64,
    pub actor: &'a str,
    pub publish: bool,
    pub discard: bool,
}
#[derive(Clone)]
pub struct Localisation {
    pub store: Store,
}
impl Localisation {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
    pub async fn settings(&self) -> Result<Settings> {
        Ok(self
            .store
            .rows(
                "SELECT revision,source_locale,enabled FROM localisation_state:main",
                json!({}),
            )
            .await?
            .pop()
            .unwrap_or_default())
    }
    pub async fn save_settings(&self, s: Settings) -> Result<()> {
        ensure!(
            (0..i64::MAX).contains(&s.revision)
                && valid_locale(&s.source_locale)
                && !s.enabled.is_empty()
                && s.enabled.contains(&s.source_locale)
                && s.enabled.len() <= 5
                && s.enabled.iter().all(|l| valid_locale(l)),
            "Choose supported languages and include the source language"
        );
        self.store.query("BEGIN TRANSACTION; IF ((SELECT VALUE revision FROM localisation_state:main)[0] ?? 0)!=$revision {THROW 'changed';}; UPSERT localisation_state:main SET revision=$revision+1,source_locale=$source,enabled=$enabled; COMMIT TRANSACTION;",json!({"revision":s.revision,"source":s.source_locale,"enabled":s.enabled})).await?;
        Ok(())
    }
    pub async fn definitions(&self) -> Result<Vec<Definition>> {
        let mut definitions = builtins()?;
        let extensions: Vec<DefinitionRow> = self
            .store
            .rows(
                "SELECT definition FROM localisation_key LIMIT 2000",
                json!({}),
            )
            .await?;
        definitions.extend(extensions.into_iter().map(|r| r.definition));
        Ok(definitions)
    }
    /// Trusted registration API for future sandbox-host adapters; not an unrestricted HTTP endpoint.
    pub async fn register(&self, owner: &str, definitions: Vec<Definition>) -> Result<()> {
        ensure!(
            (owner.starts_with("plugin.") || owner.starts_with("theme."))
                && owner.split('.').count() == 2
                && owner.split('.').all(|part| !part.is_empty()
                    && part
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-')))
                && owner.len() <= 80,
            "Use an extension namespace"
        );
        ensure!(
            definitions.len() <= 200,
            "Register at most 200 keys per operation"
        );
        for def in definitions {
            ensure!(
                def.owner == owner
                    && def.key.starts_with(&format!("{owner}."))
                    && def.key.len() <= 180
                    && def.key.split('.').all(|part| !part.is_empty())
                    && def
                        .key
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-')),
                "Invalid key namespace"
            );
            ensure!(
                def.defaults.contains_key("en"),
                "Supply an English fallback default"
            );
            for text in def.defaults.values() {
                validate_text(&def, text)?;
            }
            self.store.query("UPSERT type::record('localisation_key',$record) SET key=$key,definition=$definition",json!({"key":def.key,"definition":def,"record":format!("{:x}",Sha256::digest(def.key.as_bytes()))})).await?;
        }
        Ok(())
    }
    pub async fn overrides(&self) -> Result<Vec<Override>> {
        self.store.rows("SELECT key,locale,live,draft,revision,author FROM localisation_override LIMIT 10000",json!({})).await
    }
    pub async fn edit(&self, edit: Edit<'_>) -> Result<i64> {
        let Edit {
            key,
            locale,
            text,
            revision,
            actor,
            publish,
            discard,
        } = edit;
        ensure!(
            valid_locale(locale) && (0..i64::MAX).contains(&revision),
            "Invalid locale or revision"
        );
        let def = self
            .definitions()
            .await?
            .into_iter()
            .find(|d| d.key == key)
            .ok_or_else(|| anyhow::anyhow!("Unknown localisation key"))?;
        if !discard {
            validate_text(&def, text)?;
        }
        self.store.query(include_str!("edit.surql"),json!({"key":key,"locale":locale,"text":text,"revision":revision,"actor":actor,"publish":publish,"discard":discard,"record":format!("{:x}",Sha256::digest(format!("{locale}:{key}")))})).await?;
        Ok(revision + 1)
    }
    pub async fn bundle(&self, locale: &str, preview: bool) -> Result<BTreeMap<String, String>> {
        let settings = self.settings().await?;
        let locale = if settings.enabled.iter().any(|l| l == locale) {
            locale
        } else {
            &settings.source_locale
        };
        let overrides = self.overrides().await?;
        let live = |key: &str, language: &str| {
            overrides
                .iter()
                .find(|r| r.key == key && r.locale == language)
                .and_then(|row| {
                    if preview {
                        row.draft.as_ref().or(row.live.as_ref())
                    } else {
                        row.live.as_ref()
                    }
                })
        };
        let result = self
            .definitions()
            .await?
            .into_iter()
            .filter_map(|def| {
                live(&def.key, locale)
                    .or_else(|| {
                        if def.key == "site.name" {
                            live(&def.key, &settings.source_locale)
                        } else {
                            None
                        }
                    })
                    .or(def.defaults.get(locale))
                    .or_else(|| live(&def.key, &settings.source_locale))
                    .or(def.defaults.get(&settings.source_locale))
                    .or_else(|| live(&def.key, "en"))
                    .or(def.defaults.get("en"))
                    .map(|value| (def.key.clone(), value.clone()))
            })
            .collect();
        Ok(result)
    }
    pub async fn seed_identity(&self, name: &str, headline: &str) -> Result<()> {
        let locale = self.settings().await?.source_locale;
        for (key, text) in [("site.name", name), ("discovery.headline", headline)] {
            self.store.query("IF array::len(SELECT key FROM localisation_override WHERE key=$key AND locale=$locale)=0 {CREATE type::record('localisation_override',$record) SET key=$key,locale=$locale,live=$text,revision=0,author='installation';};",json!({"key":key,"locale":locale,"text":text,"record":format!("{:x}",Sha256::digest(format!("{locale}:{key}")))})).await?;
        }
        Ok(())
    }
}
#[derive(Deserialize)]
struct DefinitionRow {
    definition: Definition,
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_limits_keep_admin_pages_renderable() {
        let definitions = builtins().unwrap();
        let name = definitions.iter().find(|d| d.key == "site.name").unwrap();
        assert!(validate_text(name, &"x".repeat(101)).is_err());
        assert!(validate_text(name, "A\nB").is_err());
    }
    #[test]
    fn interpolation_cannot_reinterpret_values() {
        assert_eq!(
            interpolate(
                "Hi {name}",
                &BTreeMap::from([("name".into(), "{admin}".into())])
            ),
            "Hi {admin}"
        );
    }
    #[test]
    fn defaults_are_complete_and_placeholders_consistent() {
        let keys = builtins().unwrap();
        assert!(!keys.is_empty());
        let mut seen = std::collections::HashSet::new();
        for def in keys {
            assert!(seen.insert(def.key.clone()));
            for l in LOCALES {
                validate_text(&def, &def.defaults[l]).unwrap();
            }
        }
    }
}
