//! Write-only provider secrets and content/version/provider-scoped database translation caching.
use crate::{Localisation, runtime::LocalRuntime, valid_locale};
use anyhow::{Context, Result, ensure};
use artismaga_db::Store;
use artismaga_storage::vault::{self, Credentials};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{path::PathBuf, time::Duration};
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub provider: String,
    pub cache_days: u32,
}
impl Default for Policy {
    fn default() -> Self {
        Self {
            provider: "local".into(),
            cache_days: 30,
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Settings {
    pub revision: i64,
    pub value: Policy,
    pub credentials_set: bool,
}
#[derive(Deserialize)]
struct Saved {
    revision: i64,
    value: Policy,
    secret: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Update {
    pub revision: i64,
    pub value: Policy,
    pub api_key: Option<String>,
}
#[derive(Deserialize)]
struct Cache {
    value: String,
    encoding: Option<String>,
}
impl Cache {
    fn text(self) -> Result<String> {
        if self.encoding.as_deref() == Some("json") {
            Ok(serde_json::from_str(&self.value)?)
        } else {
            Ok(self.value)
        }
    }
}
/// Stable cache identity shared with maintenance and controlled cache fixtures.
pub fn cache_identity(
    scope: &str,
    source: &str,
    target: &str,
    text: &str,
    revision: i64,
) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&json!([
            scope, source, target, text, revision
        ]))?)
    ))
}
#[derive(Clone)]
pub struct Translator {
    store: Store,
    root: PathBuf,
    pub local: LocalRuntime,
    pending: std::sync::Arc<tokio::sync::Mutex<std::collections::BTreeSet<String>>>,
    jobs: std::sync::Arc<tokio::sync::Semaphore>,
}
impl Translator {
    pub fn new(store: Store, root: PathBuf) -> Self {
        Self {
            store,
            local: LocalRuntime::new(root.join("translation")),
            root,
            pending: Default::default(),
            jobs: std::sync::Arc::new(tokio::sync::Semaphore::new(4)),
        }
    }
    async fn saved(&self) -> Result<Saved> {
        Ok(self
            .store
            .rows(
                "SELECT revision,value,secret FROM translation_settings:main",
                json!({}),
            )
            .await?
            .pop()
            .unwrap_or(Saved {
                revision: 0,
                value: Policy::default(),
                secret: None,
            }))
    }
    pub async fn settings(&self) -> Result<Settings> {
        let saved = self.saved().await?;
        Ok(Settings {
            revision: saved.revision,
            value: saved.value,
            credentials_set: saved.secret.is_some(),
        })
    }
    pub async fn save(&self, update: Update) -> Result<i64> {
        ensure!(
            (0..i64::MAX).contains(&update.revision)
                && ["local", "google", "disabled"].contains(&update.value.provider.as_str())
                && (1..=365).contains(&update.value.cache_days),
            "Choose a provider and 1–365 cache days"
        );
        let old = self.saved().await?;
        let secret = if let Some(key) = update.api_key.filter(|s| !s.is_empty()) {
            ensure!(key.len() <= 4096, "API key too long");
            Some(vault::seal(
                &self.root,
                &Credentials {
                    access_key_id: "translation".into(),
                    secret_access_key: key,
                },
                "translation.google",
            )?)
        } else {
            old.secret
        };
        ensure!(
            update.value.provider != "google" || secret.is_some(),
            "Set a Google Translate API key"
        );
        self.store.query("BEGIN TRANSACTION; IF ((SELECT VALUE revision FROM translation_settings:main)[0] ?? 0)!=$revision {THROW 'changed';}; UPSERT translation_settings:main SET revision=$revision+1,value=$value,secret=IF $secret=NULL {NONE} ELSE {$secret}; DELETE translation_cache; COMMIT TRANSACTION;",json!({"revision":update.revision,"value":update.value,"secret":secret})).await?;
        if update.value.provider != "local" {
            self.local.stop().await;
        }
        Ok(update.revision + 1)
    }
    pub async fn prepare(&self) -> Result<()> {
        if self.settings().await?.value.provider == "local" {
            self.local.prepare().await?;
            if self.settings().await?.value.provider != "local" {
                self.local.stop().await;
            }
        }
        Ok(())
    }
    pub async fn text(
        &self,
        scope: &str,
        source: &str,
        target: &str,
        text: &str,
        now: i64,
    ) -> Result<String> {
        ensure!(
            valid_locale(source) && valid_locale(target) && !text.is_empty() && text.len() <= 96000,
            "Use a supported language and text up to 96000 bytes"
        );
        if source == target {
            return Ok(text.into());
        }
        let policy = self.saved().await.context("Read translation policy")?;
        ensure!(
            policy.value.provider != "disabled",
            "Automatic translation is disabled"
        );
        let hash = cache_identity(scope, source, target, text, policy.revision)?;
        if let Some(c)=self.store.rows::<Cache>("SELECT * FROM translation_cache WHERE key=$key AND expires>$now AND provider_revision=$revision",json!({"key":hash,"now":now,"revision":policy.revision})).await.context("Read translation cache")?.pop(){return c.text();}
        let mut result = String::new();
        for chunk in chunks(text, 3000) {
            let part = if policy.value.provider == "local" {
                self.local
                    .translate(source, target, chunk)
                    .await
                    .context("Local inference")?
            } else {
                let encrypted = policy
                    .secret
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("Provider credentials unavailable"))?;
                let key =
                    vault::open(&self.root, encrypted, "translation.google")?.secret_access_key;
                let response = reqwest::Client::builder()
                    .timeout(Duration::from_secs(30))
                    .build()?
                    .post("https://translation.googleapis.com/language/translate/v2")
                    .header("X-Goog-Api-Key", key)
                    .json(&json!({"q":chunk,"source":source,"target":target,"format":"text"}))
                    .send()
                    .await?;
                let response = crate::runtime::bounded_json(response).await?;
                response["data"]["translations"][0]["translatedText"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("Invalid provider response"))?
                    .to_owned()
            };
            ensure!(
                !part.trim().is_empty() && part.len() <= 24000,
                "Invalid translation size"
            );
            result.push_str(&part);
        }
        self.store.query("IF ((SELECT VALUE revision FROM translation_settings:main)[0] ?? 0)=$revision { UPSERT type::record('translation_cache',$key) SET key=$key,scope=$scope,value=$value,encoding='json',expires=$expiry,provider_revision=$revision; };",json!({"revision":policy.revision,"scope":scope.split(':').next().unwrap_or(scope),"key":hash,"value":serde_json::to_string(&result)?,"expiry":now+i64::from(policy.value.cache_days)*86400})).await.context("Write translation cache")?;
        Ok(result)
    }
    /// Return cached text immediately; bounded background jobs preserve fast SSR on cache misses.
    pub async fn cached_or_schedule(
        &self,
        scope: &str,
        source: &str,
        target: &str,
        text: &str,
        now: i64,
    ) -> Result<Option<String>> {
        if text.is_empty() || source == target {
            return Ok(Some(text.into()));
        }
        let policy = self.settings().await?;
        if policy.value.provider == "disabled" {
            return Ok(None);
        }
        let key = cache_identity(scope, source, target, text, policy.revision)?;
        if let Some(c)=self.store.rows::<Cache>("SELECT value,encoding FROM translation_cache WHERE key=$key AND expires>$now AND provider_revision=$revision",json!({"key":key,"now":now,"revision":policy.revision})).await?.pop(){return Ok(Some(c.text()?));}
        if policy.value.provider == "local" && self.local.status().await != "ready" {
            return Ok(None);
        }
        let Ok(permit) = self.jobs.clone().try_acquire_owned() else {
            return Ok(None);
        };
        if !self.pending.lock().await.insert(key.clone()) {
            return Ok(None);
        }
        let translator = self.clone();
        let scope = scope.to_owned();
        let source = source.to_owned();
        let target = target.to_owned();
        let text = text.to_owned();
        tokio::spawn(async move {
            let _permit = permit;
            let _ = translator.text(&scope, &source, &target, &text, now).await;
            translator.pending.lock().await.remove(&key);
        });
        Ok(None)
    }
    pub async fn key(&self, key: &str, locale: &str, now: i64) -> Result<String> {
        let l = Localisation::new(self.store.clone());
        let source = l.settings().await?.source_locale;
        let def = l
            .definitions()
            .await?
            .into_iter()
            .find(|d| d.key == key)
            .ok_or_else(|| anyhow::anyhow!("Unknown key"))?;
        let text = l
            .bundle(&source, false)
            .await
            .context("Read source bundle")?
            .remove(key)
            .or_else(|| def.defaults.get("en").cloned())
            .ok_or_else(|| anyhow::anyhow!("Source text unavailable"))?;
        let value = self
            .text(&format!("key:{key}"), &source, locale, &text, now)
            .await?;
        crate::validate_text(&def, &value)?;
        Ok(value)
    }
    pub async fn cleanup(&self, now: i64) -> Result<()> {
        self.store
            .query(
                "DELETE translation_cache WHERE expires<=$now",
                json!({"now":now}),
            )
            .await?;
        Ok(())
    }
}

// Bound each inference without splitting UTF-8; prefer paragraph/sentence boundaries.
fn chunks(mut text: &str, limit: usize) -> Vec<&str> {
    let mut parts = Vec::new();
    while text.len() > limit {
        let mut at = limit;
        while !text.is_char_boundary(at) {
            at -= 1;
        }
        if let Some(boundary) = text[..at].rfind(['\n', '.', '。', '!', '?']) {
            let end = boundary + text[boundary..].chars().next().map_or(0, char::len_utf8);
            if end > limit / 2 {
                at = end;
            }
        }
        parts.push(&text[..at]);
        text = &text[at..];
    }
    if !text.is_empty() {
        parts.push(text);
    }
    parts
}
#[cfg(test)]
mod tests {
    #[test]
    fn chunks_preserve_unicode_and_content() {
        let source = "図書室は夕暮れ時に閉館します。\n".repeat(700);
        let parts = super::chunks(&source, 3000);
        assert!(parts.iter().all(|p| p.len() <= 3000));
        assert_eq!(parts.concat(), source);
    }
}
