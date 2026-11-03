//! Declarative built-in theme options and public social-link configuration.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Theme {
    pub enabled: bool,
    pub primary_colour: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Themes {
    pub light: Theme,
    pub dark: Theme,
    pub sepia: Theme,
}
impl Default for Themes {
    fn default() -> Self {
        let theme = Theme {
            enabled: true,
            primary_colour: super::default_colour(),
        };
        Self {
            light: theme.clone(),
            dark: theme.clone(),
            sepia: theme,
        }
    }
}
pub fn validate(themes: &Themes, socials: &BTreeMap<String, String>) -> anyhow::Result<()> {
    anyhow::ensure!(
        themes.light.enabled || themes.dark.enabled,
        "Enable at least Light or Dark"
    );
    for theme in [&themes.light, &themes.dark, &themes.sepia] {
        let colour = &theme.primary_colour;
        anyhow::ensure!(
            colour.len() == 7
                && colour.starts_with('#')
                && colour[1..].bytes().all(|c| c.is_ascii_hexdigit()),
            "Choose a six-digit hex colour"
        );
    }
    for (network, link) in socials {
        anyhow::ensure!(
            [
                "x",
                "youtube",
                "instagram",
                "facebook",
                "bluesky",
                "discord"
            ]
            .contains(&network.as_str()),
            "Unknown social network"
        );
        if !link.is_empty() {
            anyhow::ensure!(
                link.len() <= 500
                    && url::Url::parse(link)
                        .ok()
                        .is_some_and(|u| u.scheme() == "https"
                            && u.host_str().is_some()
                            && u.username().is_empty()
                            && u.password().is_none()),
                "Social links must use HTTPS"
            );
        }
    }
    Ok(())
}
