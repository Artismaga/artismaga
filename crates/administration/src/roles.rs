//! Role editing. The built-in administrator role is immutable to preserve site ownership.
use anyhow::{Result, ensure};
use artismaga_core::{Permission, PermissionGroup};
use artismaga_db::Store;
use serde::Deserialize;
use serde_json::json;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoleUpdate {
    pub key: String,
    pub name: String,
    pub permissions: Vec<Permission>,
    pub revision: i64,
    pub create: bool,
}
pub fn validate(value: &RoleUpdate) -> Result<()> {
    ensure!((0..i64::MAX).contains(&value.revision), "Invalid revision");
    ensure!(
        (3..=40).contains(&value.key.len())
            && value
                .key
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
            && value.key.starts_with(|c: char| c.is_ascii_lowercase()),
        "Use a role key of 3–40 lowercase letters, digits or underscores"
    );
    ensure!(
        !value.name.trim().is_empty()
            && value.name.chars().count() <= 60
            && !value.name.chars().any(char::is_control),
        "Use a role name of 1–60 characters"
    );
    ensure!(
        value.key != "administrator" && !value.permissions.contains(&Permission::Administer),
        "Site administration is reserved for the protected Administrator role"
    );
    ensure!(
        value.permissions.len() <= 7
            && value
                .permissions
                .iter()
                .enumerate()
                .all(|(i, p)| !value.permissions[..i].contains(p)),
        "Choose distinct permissions"
    );
    Ok(())
}
pub async fn list(store: &Store) -> Result<Vec<PermissionGroup>> {
    store
        .rows("SELECT * FROM permission_group ORDER BY name", json!({}))
        .await
}
pub async fn save(store: &Store, update: RoleUpdate) -> Result<i64> {
    validate(&update)?;
    store.query(artismaga_db::queries::SAVE_ROLE, json!({"key":update.key,"name":update.name.trim(),"permissions":update.permissions,"revision":update.revision,"create":update.create})).await?;
    Ok(update.revision + 1)
}
pub async fn delete(store: &Store, key: &str, revision: i64) -> Result<()> {
    ensure!(
        !["administrator", "reader", "author"].contains(&key),
        "Built-in roles cannot be removed"
    );
    store
        .query(
            artismaga_db::queries::DELETE_ROLE,
            json!({"key":key,"revision":revision}),
        )
        .await?;
    Ok(())
}
