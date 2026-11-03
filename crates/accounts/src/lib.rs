//! Own-account profile, preferences, export and deletion. HTTP supplies the authenticated UID.
use anyhow::{Result, ensure};
use artismaga_auth::Auth;
use artismaga_core::PublicUser;
use artismaga_db::Store;
use serde::{Deserialize, Serialize};
use serde_json::json;
use url::Url;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub pen_name: String,
    pub biography: String,
    pub website: String,
    pub links: Vec<ProfileLink>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileLink {
    pub label: String,
    pub url: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileUpdate {
    pub revision: i64,
    pub display_name: String,
    pub profile: Profile,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Reading {
    pub theme: String,
    pub font_family: String,
    pub font_size: u16,
    pub line_height: f64,
    pub content_width: u16,
    pub speech_speed: f64,
    pub offline_enabled: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Content {
    #[serde(default = "default_true")]
    pub automatic_translations: bool,
    pub language: String,
    pub timezone: String,
    pub mature_content: String,
    pub show_warnings: bool,
    pub hidden_genres: Vec<String>,
    pub hidden_tags: Vec<String>,
    pub hidden_authors: Vec<String>,
    pub hidden_stories: Vec<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Notifications {
    pub in_app: bool,
    pub email: bool,
    pub frequency: String,
    pub new_chapters: bool,
    pub chapter_edits: bool,
    pub new_stories: bool,
    pub author_updates: bool,
    pub hiatus_returns: bool,
    pub replies: bool,
    pub mentions: bool,
    pub reviews: bool,
    pub reactions: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Privacy {
    pub public_profile: bool,
    pub public_activity: bool,
    pub private_library: bool,
    pub private_history: bool,
    pub list_visibility: String,
    pub review_visibility: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Accessibility {
    pub reduced_motion: bool,
    pub high_contrast: bool,
    pub large_controls: bool,
    pub screen_reader_announcements: bool,
    pub keyboard_navigation: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    pub reading: Reading,
    pub content: Content,
    pub notifications: Notifications,
    pub privacy: Privacy,
    pub accessibility: Accessibility,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            reading: Reading {
                theme: "light".into(),
                font_family: "serif".into(),
                font_size: 18,
                line_height: 1.8,
                content_width: 720,
                speech_speed: 1.0,
                offline_enabled: false,
            },
            content: Content {
                automatic_translations: true,
                language: "en".into(),
                timezone: "UTC".into(),
                mature_content: "hide".into(),
                show_warnings: true,
                hidden_genres: vec![],
                hidden_tags: vec![],
                hidden_authors: vec![],
                hidden_stories: vec![],
            },
            notifications: Notifications {
                in_app: true,
                email: false,
                frequency: "daily".into(),
                new_chapters: true,
                chapter_edits: false,
                new_stories: true,
                author_updates: true,
                hiatus_returns: true,
                replies: true,
                mentions: true,
                reviews: true,
                reactions: false,
            },
            privacy: Privacy {
                public_profile: false,
                public_activity: false,
                private_library: true,
                private_history: true,
                list_visibility: "private".into(),
                review_visibility: "private".into(),
            },
            accessibility: Accessibility {
                reduced_motion: false,
                high_contrast: false,
                large_controls: false,
                screen_reader_announcements: true,
                keyboard_navigation: true,
            },
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PreferencesUpdate {
    pub revision: i64,
    pub preferences: Preferences,
}
#[derive(Deserialize)]
struct Stored<T> {
    revision: i64,
    value: T,
}
#[derive(Serialize)]
pub struct OwnAccount {
    pub user: PublicUser,
    pub email: String,
    pub profile: Profile,
    pub profile_revision: i64,
    pub preferences: Preferences,
    pub preferences_revision: i64,
}
#[derive(Clone)]
pub struct Accounts {
    store: Store,
}
impl Accounts {
    pub fn new(store: Store) -> Self {
        Self { store }
    }
    pub async fn own(&self, uid: &str) -> Result<OwnAccount> {
        let account = self
            .store
            .by_uid(uid)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Account unavailable"))?;
        let profile: Option<Stored<Profile>> = self
            .store
            .rows(
                "SELECT revision, value FROM account_profile WHERE uid = $uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop();
        let preferences: Option<Stored<Preferences>> = self
            .store
            .rows(
                "SELECT revision, value FROM account_preferences WHERE uid = $uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop();
        Ok(OwnAccount {
            user: account.public(),
            email: account.email,
            profile_revision: profile.as_ref().map_or(0, |p| p.revision),
            profile: profile.map(|p| p.value).unwrap_or_default(),
            preferences_revision: preferences.as_ref().map_or(0, |p| p.revision),
            preferences: preferences.map(|p| p.value).unwrap_or_default(),
        })
    }
    pub async fn save_profile(&self, uid: &str, update: ProfileUpdate) -> Result<i64> {
        validate_profile(&update)?;
        self.store.query(artismaga_db::queries::SAVE_PROFILE,json!({"uid":uid,"revision":update.revision,"name":update.display_name.trim(),"value":update.profile})).await?;
        Ok(update.revision + 1)
    }
    pub async fn save_preferences(&self, uid: &str, update: PreferencesUpdate) -> Result<i64> {
        ensure!((0..i64::MAX).contains(&update.revision), "Invalid revision");
        validate_preferences(&update.preferences)?;
        self.store
            .query(
                artismaga_db::queries::SAVE_PREFERENCES,
                json!({"uid":uid,"revision":update.revision,"value":update.preferences}),
            )
            .await?;
        Ok(update.revision + 1)
    }
    pub async fn delete(
        &self,
        auth: &Auth,
        uid: &str,
        password: String,
        confirmation: &str,
    ) -> Result<()> {
        ensure!(confirmation == "DELETE", "Type DELETE to confirm");
        let old = auth.verify_current_password(uid, password).await?;
        self.store
            .query(
                artismaga_db::queries::DELETE_ACCOUNT,
                json!({"uid":uid,"old":old,"reader_viewer":artismaga_auth::digest(&format!("reader-account:{uid}"))}),
            )
            .await?;
        Ok(())
    }
}
fn bounded(value: &str, max: usize) -> bool {
    value.chars().count() <= max
        && !value
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
}
fn safe_url(value: &str) -> bool {
    Url::parse(value).ok().is_some_and(|url| {
        matches!(url.scheme(), "https" | "http")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}
pub fn validate_profile(update: &ProfileUpdate) -> Result<()> {
    ensure!(
        (0..i64::MAX).contains(&update.revision)
            && !update.display_name.trim().is_empty()
            && bounded(&update.display_name, 80)
            && !update.display_name.chars().any(char::is_control),
        "Display name must contain 1–80 characters"
    );
    let p = &update.profile;
    ensure!(
        bounded(&p.pen_name, 80)
            && bounded(&p.biography, 3000)
            && p.website.len() <= 500
            && (p.website.is_empty() || safe_url(&p.website)),
        "Check pen name, biography length and website URL"
    );
    ensure!(
        p.links.len() <= 5
            && p.links.iter().all(|l| !l.label.trim().is_empty()
                && bounded(&l.label, 40)
                && l.url.len() <= 500
                && safe_url(&l.url)),
        "Use up to five labelled HTTP(S) links"
    );
    Ok(())
}
pub fn validate_preferences(p: &Preferences) -> Result<()> {
    let r = &p.reading;
    ensure!(
        ["light", "dark", "sepia", "system"].contains(&r.theme.as_str())
            && ["serif", "sans", "dyslexic"].contains(&r.font_family.as_str())
            && (14..=30).contains(&r.font_size)
            && (1.2..=2.4).contains(&r.line_height)
            && (480..=1100).contains(&r.content_width)
            && (0.5..=2.0).contains(&r.speech_speed),
        "Reading appearance is outside the supported range"
    );
    ensure!(
        ["en", "es", "fr", "de", "ja", "zh", "pt", "ar", "hi"]
            .contains(&p.content.language.as_str())
            && !p.content.timezone.is_empty()
            && p.content.timezone.len() <= 80
            && p.content
                .timezone
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '+')),
        "Choose a supported language and time zone"
    );
    ensure!(
        ["hide", "blur", "show"].contains(&p.content.mature_content.as_str()),
        "Invalid mature-content preference"
    );
    for list in [
        &p.content.hidden_tags,
        &p.content.hidden_genres,
        &p.content.hidden_authors,
        &p.content.hidden_stories,
    ] {
        ensure!(
            list.len() <= 30 && list.iter().all(|v| !v.trim().is_empty() && bounded(v, 80)),
            "Use up to 30 exclusions of 80 characters each"
        );
    }
    ensure!(
        ["immediate", "daily", "weekly", "disabled"].contains(&p.notifications.frequency.as_str()),
        "Invalid notification frequency"
    );
    ensure!(
        ["private", "public"].contains(&p.privacy.list_visibility.as_str())
            && ["private", "public"].contains(&p.privacy.review_visibility.as_str()),
        "Invalid privacy setting"
    );
    Ok(())
}
fn default_true() -> bool {
    true
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_private_and_ranges_and_urls_are_validated() {
        let mut p = Preferences::default();
        validate_preferences(&p).unwrap();
        assert!(
            p.privacy.private_history && p.privacy.private_library && !p.privacy.public_activity
        );
        p.reading.font_size = 80;
        assert!(validate_preferences(&p).is_err());
        let update = ProfileUpdate {
            revision: 0,
            display_name: "Reader".into(),
            profile: Profile {
                website: "javascript:alert(1)".into(),
                ..Default::default()
            },
        };
        assert!(validate_profile(&update).is_err());
    }
}
