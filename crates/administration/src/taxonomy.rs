//! Shared catalogue vocabulary and administrator-controlled classification policy.
use anyhow::{Result, ensure};
use artismaga_db::Store;
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Genre {
    pub key: String,
    pub name: String,
    pub parent: Option<String>,
    pub colour: String,
    /// Name from the shipped icon vocabulary, never arbitrary markup.
    pub icon: String,
    pub image: Option<String>,
    pub hero: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Vocabulary {
    pub premade_genres: bool,
    pub allow_arbitrary_tags: bool,
    pub premade_tags: bool,
    pub genres: Vec<Genre>,
    pub tags: Vec<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub revision: i64,
    pub value: Vocabulary,
}
pub fn seed_tags() -> Vec<String> {
    include_str!("../data/tags.txt")
        .lines()
        .filter(|l| !l.starts_with('#'))
        .flat_map(|l| l.split('|'))
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect()
}
pub fn seed_genres() -> Vec<Genre> {
    let rows = [
        (
            "fantasy",
            "Fantasy",
            "#7950b0",
            "sparkles",
            "Epic Fantasy|Urban Fantasy|Dark Fantasy|Cozy Fantasy|Progression Fantasy|Portal Fantasy|Historical Fantasy|Mythic Fantasy",
        ),
        (
            "science-fiction",
            "Science Fiction",
            "#1971a3",
            "planet",
            "Space Opera|Hard Science Fiction|Cyberpunk|Solarpunk|Military Science Fiction|Time Travel|First Contact|Post-Apocalyptic",
        ),
        (
            "romance",
            "Romance",
            "#b03569",
            "heart",
            "Contemporary Romance|Historical Romance|Paranormal Romance|Romantic Fantasy|Romantic Comedy|Queer Romance",
        ),
        (
            "mystery",
            "Mystery",
            "#5c650a",
            "search",
            "Cozy Mystery|Police Procedural|Historical Mystery|Noir|Amateur Detective|Locked Room Mystery",
        ),
        (
            "thriller",
            "Thriller",
            "#b24c22",
            "bolt",
            "Psychological Thriller|Political Thriller|Espionage|Legal Thriller|Techno Thriller|Crime Thriller",
        ),
        (
            "horror",
            "Horror",
            "#8b3546",
            "ghost",
            "Gothic Horror|Cosmic Horror|Folk Horror|Supernatural Horror|Psychological Horror|Survival Horror",
        ),
        (
            "adventure",
            "Adventure",
            "#25734b",
            "compass",
            "Survival Adventure|Exploration|Swashbuckling|Historical Adventure|Quest Adventure",
        ),
        (
            "drama",
            "Drama",
            "#996d14",
            "masks",
            "Family Saga|Coming of Age|Literary Fiction|Social Drama|Historical Drama|Slice of Life",
        ),
        (
            "comedy",
            "Comedy",
            "#a14c87",
            "smile",
            "Satire|Parody|Absurdist Comedy|Dark Comedy|Comedy of Manners",
        ),
        (
            "speculative",
            "Speculative Fiction",
            "#476a9d",
            "world",
            "Alternate History|Dystopia|Utopia|Magical Realism|Slipstream|Weird Fiction",
        ),
        (
            "historical",
            "Historical Fiction",
            "#87644b",
            "building",
            "Ancient History|Medieval History|Early Modern History|Modern History|Historical Epic",
        ),
        (
            "western",
            "Western",
            "#a25d35",
            "sun",
            "Frontier Western|Revisionist Western|Weird West|Contemporary Western",
        ),
    ];
    let mut result = Vec::new();
    for (key, name, colour, icon, children) in rows {
        result.push(Genre {
            key: key.into(),
            name: name.into(),
            parent: None,
            colour: colour.into(),
            icon: icon.into(),
            image: None,
            hero: None,
        });
        for child in children.split('|') {
            result.push(Genre {
                key: format!("{key}-{}", child.to_lowercase().replace(' ', "-")),
                name: child.into(),
                parent: Some(key.into()),
                colour: colour.into(),
                icon: icon.into(),
                image: None,
                hero: None,
            });
        }
    }
    result
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            revision: 0,
            value: Vocabulary {
                premade_genres: true,
                allow_arbitrary_tags: true,
                premade_tags: true,
                genres: seed_genres(),
                tags: Vec::new(),
            },
        }
    }
}
pub async fn load(store: &Store) -> Result<Settings> {
    Ok(store
        .rows("SELECT revision,value FROM taxonomy:main", json!({}))
        .await?
        .pop()
        .unwrap_or_default())
}
pub fn tag_valid(tag: &str) -> bool {
    !tag.trim().is_empty()
        && tag.chars().count() <= 64
        && !tag.chars().any(char::is_control)
        && !tag.contains([',', '|'])
}
pub fn validate(settings: &Settings) -> Result<()> {
    ensure!(
        (0..i64::MAX).contains(&settings.revision),
        "Invalid revision"
    );
    ensure!(
        settings.value.genres.len() <= 300 && settings.value.tags.len() <= 5000,
        "Vocabulary is too large"
    );
    ensure!(
        serde_json::to_vec(&settings.value)?.len() <= 131_072,
        "Vocabulary exceeds the initial 128 KiB limit"
    );
    let mut keys = std::collections::HashSet::new();
    for g in &settings.value.genres {
        ensure!(
            !g.key.is_empty()
                && g.key.len() <= 100
                && g.key
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
                && keys.insert(&g.key),
            "Use unique lowercase genre keys"
        );
        ensure!(tag_valid(&g.name), "Genre names must be 1–64 characters");
        ensure!(
            g.colour.len() == 7
                && g.colour.starts_with('#')
                && g.colour[1..].bytes().all(|c| c.is_ascii_hexdigit()),
            "Use a six-digit colour"
        );
        ensure!(
            [
                "sparkles", "planet", "heart", "search", "bolt", "ghost", "compass", "masks",
                "smile", "world", "building", "sun", "book"
            ]
            .contains(&g.icon.as_str()),
            "Unknown genre icon"
        );
        if let Some(parent) = &g.parent {
            ensure!(
                settings
                    .value
                    .genres
                    .iter()
                    .any(|p| &p.key == parent && p.parent.is_none()),
                "Subgenres need a top-level genre"
            );
        }
    }
    ensure!(
        settings.value.tags.iter().all(|t| tag_valid(t)),
        "Tags must be 1–64 characters without commas, pipes or control characters"
    );
    Ok(())
}
pub async fn save(store: &Store, mut settings: Settings) -> Result<i64> {
    if settings.value.premade_genres {
        for genre in seed_genres() {
            if !settings.value.genres.iter().any(|g| g.key == genre.key) {
                settings.value.genres.push(genre);
            }
        }
    }
    validate(&settings)?;
    for g in &settings.value.genres {
        for (id, purpose) in [(&g.image, "genre_image"), (&g.hero, "genre_hero")] {
            if let Some(id) = id {
                let assets: Vec<serde_json::Value> = store
                    .rows(
                        "SELECT uid FROM media_asset WHERE uid=$uid AND purpose=$purpose",
                        json!({"uid":id,"purpose":purpose}),
                    )
                    .await?;
                ensure!(assets.len() == 1, "Genre artwork unavailable");
            }
        }
    }
    store.query("BEGIN TRANSACTION; LET $r=(SELECT VALUE revision FROM taxonomy:main)[0] ?? 0; IF $r!=$revision { THROW 'vocabulary changed'; }; UPSERT taxonomy:main SET revision=$revision+1,value=$value; COMMIT TRANSACTION;",json!({"revision":settings.revision,"value":settings.value})).await?;
    Ok(settings.revision + 1)
}
#[cfg(test)]
mod tests {
    #[test]
    fn seed_is_useful_and_unique() {
        let tags = super::seed_tags();
        assert!(tags.len() >= 1000);
        let unique: std::collections::HashSet<_> = tags.iter().map(|t| t.to_lowercase()).collect();
        assert_eq!(tags.len(), unique.len());
        assert!(tags.iter().all(|t| super::tag_valid(t)));
        super::validate(&super::Settings::default()).unwrap();
    }
}
