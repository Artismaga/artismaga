//! Shared account contracts and permission vocabulary; no infrastructure dependencies.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SignupMode {
    Open,
    Invitation,
    Disabled,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    CreateStory,
    PublishStory,
    Comment,
    Review,
    Administer,
    ConfigureLocalisation,
    ManageAnnouncements,
    ManageComments,
    ViewAnalytics,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PermissionGroup {
    pub key: String,
    pub name: String,
    pub permissions: Vec<Permission>,
    #[serde(default)]
    pub revision: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PublicUser {
    pub uid: String,
    pub display_name: String,
    pub group_key: String,
    pub email_verified: bool,
    pub avatar_url: String,
}

/// Normalize once, both for unique account lookup and Gravatar's SHA-256 identifier.
pub fn normalize_email(value: &str) -> Result<String, &'static str> {
    let value = value.trim().to_lowercase();
    let parts: Vec<_> = value.split('@').collect();
    if value.len() > 254
        || parts.len() != 2
        || parts[0].is_empty()
        || !parts[1].contains('.')
        || parts[1].starts_with('.')
        || parts[1].ends_with('.')
        || !value.is_ascii()
        || value.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("Enter a valid email address (ASCII addresses are currently supported).");
    }
    Ok(value)
}

pub fn gravatar(email: &str) -> String {
    let hash = format!(
        "{:x}",
        Sha256::digest(email.trim().to_lowercase().as_bytes())
    );
    format!("https://www.gravatar.com/avatar/{hash}?d=identicon&s=160&r=g")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn email_and_avatar_are_canonical() {
        assert_eq!(
            normalize_email(" Reader@Example.com ").unwrap(),
            "reader@example.com"
        );
        assert!(normalize_email("x@@example.com").is_err());
        assert_eq!(
            gravatar("Reader@Example.com"),
            gravatar("reader@example.com")
        );
        assert!(!gravatar("reader@example.com").contains("reader@"));
    }
}
