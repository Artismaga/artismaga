//! Fixed transactional queries shared by account use cases and HTTP administration.
pub const ASSIGN_GROUP: &str = include_str!("queries/assign_group.surql");
pub const BOOTSTRAP_ADMIN: &str = include_str!("queries/bootstrap_admin.surql");
pub const CREATE_SESSION: &str = include_str!("queries/create_session.surql");
pub const ISSUE_ACCOUNT_TOKEN: &str = include_str!("queries/issue_account_token.surql");
pub const REGISTER: &str = include_str!("queries/register.surql");
pub const RESET_PASSWORD: &str = include_str!("queries/reset_password.surql");
pub const VERIFY_EMAIL: &str = include_str!("queries/verify_email.surql");
pub const INSTALL: &str = include_str!("queries/install.surql");
pub const SAVE_PROFILE: &str = include_str!("queries/save_profile.surql");
pub const SAVE_PREFERENCES: &str = include_str!("queries/save_preferences.surql");
pub const SAVE_SITE_CONFIGURATION: &str = include_str!("queries/save_site_configuration.surql");
pub const CHANGE_PASSWORD: &str = include_str!("queries/change_password.surql");
pub const DELETE_ACCOUNT: &str = include_str!("queries/delete_account.surql");
pub const CHANGE_EMAIL: &str = include_str!("queries/change_email.surql");

pub const REQUEST_EMAIL_CHANGE: &str = include_str!("queries/request_email_change.surql");

pub const SAVE_ROLE: &str = include_str!("queries/save_role.surql");
pub const DELETE_ROLE: &str = include_str!("queries/delete_role.surql");

pub const SAVE_STORAGE: &str = include_str!("queries/save_storage.surql");
pub const STUDIO_CREATE: &str = include_str!("queries/studio_create.surql");
pub const STUDIO_UPDATE: &str = include_str!("queries/studio_update.surql");
pub const STUDIO_SHARE: &str = include_str!("queries/studio_share.surql");
