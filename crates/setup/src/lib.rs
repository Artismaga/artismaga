//! Installation ownership, persisted configuration, and recoverable one-time account creation.
use anyhow::{Context, Result, ensure};
use artismaga_auth::{Auth, credential_matches, token};
use artismaga_config::{Config, Mail};
use artismaga_core::SignupMode;
use serde::Deserialize;
use serde_json::json;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tokio::sync::Mutex;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetupRequest {
    pub setup_code: String,
    pub site_name: String,
    pub public_url: String,
    pub signup_mode: SignupMode,
    pub admin_email: String,
    pub admin_name: String,
    pub admin_password: String,
    pub mail: Option<Mail>,
}
pub struct Installer {
    pub auth: Auth,
    base: Config,
    path: PathBuf,
    code: String,
    lock: Mutex<()>,
}
impl Installer {
    pub fn new(auth: Auth, base: Config, config_path: PathBuf, code_path: &Path) -> Result<Self> {
        Ok(Self {
            auth,
            base,
            path: config_path,
            code: setup_code(code_path)?,
            lock: Mutex::new(()),
        })
    }
    pub fn authorized(&self, candidate: &str) -> bool {
        credential_matches(&self.code, candidate)
    }
    pub async fn claimed(&self) -> Result<bool> {
        claimed(&self.auth).await
    }
    pub async fn complete(&self, request: SetupRequest) -> Result<Config> {
        ensure!(self.authorized(&request.setup_code), "Invalid setup code");
        let _lock = self.lock.lock().await;
        ensure!(
            !self.claimed().await?,
            "This installation is already configured"
        );
        let config = Config {
            site_name: request.site_name.trim().into(),
            secure_cookies: request.public_url.starts_with("https://"),
            public_url: request.public_url,
            database: self.base.database.clone(),
            mail: request.mail,
        };
        config.validate()?;
        // Validate all account input before staging the configuration. No administrator password is persisted.
        artismaga_core::normalize_email(&request.admin_email).map_err(anyhow::Error::msg)?;
        ensure!(
            (15..=128).contains(&request.admin_password.chars().count())
                && request.admin_password.len() <= 512,
            "Use a password of 15–128 characters"
        );
        ensure!(
            !request.admin_name.trim().is_empty()
                && request.admin_name.chars().count() <= 80
                && !request.admin_name.chars().any(char::is_control),
            "Display name must contain 1–80 characters"
        );
        // Serialize file writers across processes, in addition to in-process installation requests.
        let parent = self.path.parent().unwrap_or(Path::new("."));
        fs::create_dir_all(parent)?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(parent.join("installation.lock"))?;
        file.try_lock().context("Another installer is running")?;
        ensure!(
            !self.claimed().await?,
            "This installation is already configured"
        );
        config.save(&self.path)?;
        self.auth
            .install(
                request.admin_email,
                request.admin_name,
                request.admin_password,
                request.signup_mode,
            )
            .await?;
        Ok(config)
    }
}
/// Existing administrator accounts also close setup, including installations predating the marker.
pub async fn claimed(auth: &Auth) -> Result<bool> {
    let rows: Vec<serde_json::Value> = auth
        .store
        .rows(
            "SELECT uid FROM account WHERE group_key = 'administrator' LIMIT 1",
            json!({}),
        )
        .await?;
    let markers: Vec<serde_json::Value> = auth
        .store
        .rows("SELECT completed FROM installation:main", json!({}))
        .await?;
    Ok(!rows.is_empty() || !markers.is_empty())
}
/// The code is written only to an owner-private file and explicitly requested operator output.
/// It is never embedded in a page, URL, request log, or startup log.
pub fn setup_code(path: &Path) -> Result<String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(path) {
        Ok(mut file) => {
            let code = token();
            file.write_all(code.as_bytes())?;
            file.sync_all()?;
            Ok(code)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let mut code = String::new();
            fs::File::open(path)?.read_to_string(&mut code)?;
            ensure!(
                code.len() == 64 && code.bytes().all(|b| b.is_ascii_hexdigit()),
                "Invalid setup code file; restore the installation data volume"
            );
            Ok(code)
        }
        Err(error) => Err(error.into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn setup_codes_are_private_stable_and_unpredictable() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("code");
        let first = setup_code(&path).unwrap();
        assert_eq!(first.len(), 64);
        assert_eq!(setup_code(&path).unwrap(), first);
        assert_ne!(setup_code(&temp.path().join("another")).unwrap(), first);
        assert!(credential_matches(&first, &first));
        assert!(!credential_matches(&first, "wrong"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
}
