//! Persisted branding/registration policy, roles and bounded public account-directory queries.
pub mod announcements;
pub mod identity;
pub mod roles;
use anyhow::{Result, ensure};
use artismaga_config::Config;
use artismaga_core::{PublicUser, SignupMode};
use artismaga_db::{Account, Store};
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SiteConfiguration {
    #[serde(default)]
    pub auto_abandon_after_months: Option<u16>,
    #[serde(default)]
    pub themes: identity::Themes,
    #[serde(default)]
    pub socials: std::collections::BTreeMap<String, String>,
    pub site_name: String,
    pub tagline: String,
    pub description: String,
    pub announcement: String,
    pub support_url: String,
    pub default_language: String,
    pub timezone: String,
    pub signup_mode: SignupMode,
    pub default_group: String,
    #[serde(default = "default_colour")]
    pub primary_colour: String,
    #[serde(default)]
    pub default_cover: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ConfigurationUpdate {
    pub revision: i64,
    pub configuration: SiteConfiguration,
}
#[derive(Deserialize)]
struct Stored {
    revision: i64,
    value: SiteConfiguration,
}
#[derive(Clone)]
pub struct Administration {
    store: Store,
    initial_name: String,
}
impl Administration {
    pub fn new(store: Store, config: &Config) -> Self {
        Self {
            store,
            initial_name: config.site_name.clone(),
        }
    }
    pub async fn configuration(&self) -> Result<ConfigurationUpdate> {
        let value: Option<Stored> = self
            .store
            .rows(
                "SELECT revision,value FROM site_configuration:main",
                json!({}),
            )
            .await?
            .pop();
        #[derive(Deserialize)]
        struct Policy {
            signup_mode: SignupMode,
            default_group: Option<String>,
        }
        let policy: Policy = self
            .store
            .rows(
                "SELECT signup_mode, default_group FROM site_settings:main",
                json!({}),
            )
            .await?
            .pop()
            .ok_or_else(|| anyhow::anyhow!("Site settings unavailable"))?;
        let mut result = match value {
            Some(v) => ConfigurationUpdate {
                revision: v.revision,
                configuration: v.value,
            },
            None => ConfigurationUpdate {
                revision: 0,
                configuration: SiteConfiguration {
                    auto_abandon_after_months: None,
                    themes: identity::Themes::default(),
                    socials: std::collections::BTreeMap::new(),
                    site_name: self.initial_name.clone(),
                    tagline: "Find your next chapter.".into(),
                    description: "A home for independent fiction and the people who love it."
                        .into(),
                    announcement: String::new(),
                    support_url: String::new(),
                    default_language: "en".into(),
                    timezone: "UTC".into(),
                    signup_mode: policy.signup_mode,
                    default_group: "reader".into(),
                    primary_colour: default_colour(),
                    default_cover: None,
                },
            },
        };
        result.configuration.signup_mode = policy.signup_mode;
        result.configuration.default_group =
            policy.default_group.unwrap_or_else(|| "reader".into());
        Ok(result)
    }
    pub async fn save(&self, update: ConfigurationUpdate) -> Result<i64> {
        validate(&update)?;
        let c = &update.configuration;
        self.store.query(artismaga_db::queries::SAVE_SITE_CONFIGURATION,json!({"revision":update.revision,"value":c,"mode":c.signup_mode,"group":c.default_group})).await?;
        Ok(update.revision + 1)
    }
    pub async fn users(&self, offset: u32, search: &str) -> Result<Vec<PublicUser>> {
        ensure!(offset <= 100000 && search.len() <= 80, "Search is too long");
        let users:Vec<Account>=self.store.rows("SELECT * FROM account WHERE string::contains(string::lowercase(display_name), $search) ORDER BY display_name LIMIT 20 START $offset",json!({"search":search.trim().to_lowercase(),"offset":offset})).await?;
        Ok(users.into_iter().map(|u| u.public()).collect())
    }
}
pub fn default_colour() -> String {
    "#24675a".into()
}
pub fn validate(update: &ConfigurationUpdate) -> Result<()> {
    let c = &update.configuration;
    ensure!(
        c.auto_abandon_after_months
            .is_none_or(|v| (1..=120).contains(&v)),
        "Choose 1–120 months after the inactivity warning, or disable automatic abandonment"
    );
    identity::validate(&c.themes, &c.socials)?;
    ensure!(
        c.primary_colour.len() == 7
            && c.primary_colour.starts_with('#')
            && c.primary_colour[1..].chars().all(|v| v.is_ascii_hexdigit()),
        "Choose a six-digit hex colour"
    );
    ensure!(
        c.default_cover
            .as_ref()
            .is_none_or(|id| id.starts_with("asset_")
                && id.len() == 42
                && id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')),
        "Invalid default cover"
    );
    ensure!(
        (0..i64::MAX).contains(&update.revision)
            && !c.site_name.trim().is_empty()
            && c.site_name.len() <= 100
            && !c.site_name.chars().any(char::is_control),
        "Use a site name of 1–100 bytes"
    );
    ensure!(
        c.tagline.chars().count() <= 100
            && c.description.chars().count() <= 500
            && c.announcement.chars().count() <= 500,
        "Branding text is too long"
    );
    ensure!(
        c.default_group != "administrator"
            && (3..=40).contains(&c.default_group.len())
            && c.default_group
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'),
        "Choose a non-administrator role for new accounts"
    );
    ensure!(
        ["en", "es", "fr", "de", "ja", "zh", "pt", "ar", "hi"]
            .contains(&c.default_language.as_str())
            && !c.timezone.is_empty()
            && c.timezone.len() <= 80
            && c.timezone
                .chars()
                .all(|v| v.is_ascii_alphanumeric() || matches!(v, '/' | '_' | '-' | '+')),
        "Choose supported language/time-zone settings"
    );
    ensure!(
        c.support_url.is_empty()
            || url::Url::parse(&c.support_url)
                .ok()
                .is_some_and(|url| url.scheme() == "https"
                    && url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none()),
        "Support link must use HTTPS"
    );
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registration_cannot_default_to_administrator() {
        let mut c = SiteConfiguration {
            auto_abandon_after_months: None,
            themes: identity::Themes::default(),
            socials: std::collections::BTreeMap::new(),
            site_name: "Stories".into(),
            tagline: String::new(),
            description: String::new(),
            announcement: String::new(),
            support_url: String::new(),
            default_language: "en".into(),
            timezone: "UTC".into(),
            signup_mode: SignupMode::Open,
            default_group: "reader".into(),
            primary_colour: default_colour(),
            default_cover: None,
        };
        validate(&ConfigurationUpdate {
            revision: 0,
            configuration: c.clone(),
        })
        .unwrap();
        c.default_group = "administrator".into();
        assert!(
            validate(&ConfigurationUpdate {
                revision: 0,
                configuration: c
            })
            .is_err()
        );
    }
}

pub mod taxonomy;
