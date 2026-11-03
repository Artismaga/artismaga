//! Typed settings, environment bootstrap defaults, and atomic private configuration persistence.
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use url::Url;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub site_name: String,
    pub public_url: String,
    pub secure_cookies: bool,
    pub database: Database,
    pub mail: Option<Mail>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Database {
    pub url: String,
    pub namespace: String,
    pub database: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Mail {
    pub host: String,
    pub username: String,
    pub password: String,
    pub from: String,
}

pub fn data_dir() -> PathBuf {
    std::env::var_os("ARTISMAGA_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"))
}
pub fn config_path() -> PathBuf {
    std::env::var_os("ARTISMAGA_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|| data_dir().join("config.toml"))
}
impl Config {
    /// No operator-managed database secrets are needed on the isolated Compose network.
    pub fn bootstrap() -> Self {
        Self {
            site_name: "Artismaga".into(),
            public_url: "http://localhost:8000".into(),
            secure_cookies: false,
            database: Database {
                url: std::env::var("ARTISMAGA_DATABASE_URL")
                    .unwrap_or_else(|_| "http://database:8000".into()),
                namespace: "artismaga".into(),
                database: "platform".into(),
                username: None,
                password: None,
            },
            mail: None,
        }
    }
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let text = fs::read_to_string(path).context("Cannot read saved site configuration")?;
        let config: Self =
            toml::from_str(&text).context("Invalid configuration; see config/example.toml")?;
        config.validate()?;
        Ok(config)
    }
    /// Write before committing installation in the database. A retry can recover this staged file.
    pub fn save(&self, path: &Path) -> Result<()> {
        self.validate()?;
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        fs::create_dir_all(parent)?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        temporary.write_all(toml::to_string_pretty(self)?.as_bytes())?;
        temporary.as_file().sync_all()?;
        temporary.persist(path).map_err(|e| e.error)?;
        #[cfg(unix)]
        fs::File::open(parent)?.sync_all()?;
        Ok(())
    }
    pub fn validate(&self) -> Result<()> {
        let public =
            Url::parse(&self.public_url).context("Website address must be an absolute URL")?;
        ensure!(
            matches!(public.scheme(), "http" | "https"),
            "Website address must use HTTP or HTTPS"
        );
        ensure!(
            public.origin().ascii_serialization() == self.public_url,
            "Website address must not have a trailing slash or path"
        );
        ensure!(
            self.secure_cookies == (public.scheme() == "https"),
            "Cookie security must match HTTPS"
        );
        ensure!(
            self.secure_cookies
                || matches!(public.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")),
            "Public websites require HTTPS"
        );
        let endpoint = Url::parse(&self.database.url)?;
        ensure!(
            matches!(endpoint.scheme(), "http" | "https") && endpoint.host_str().is_some(),
            "Database URL must use HTTP(S)"
        );
        ensure!(
            self.database.username.is_some() == self.database.password.is_some(),
            "Database username and password must both be supplied or both omitted"
        );
        ensure!(
            self.database
                .password
                .as_ref()
                .is_none_or(|p| p.len() >= 16),
            "Database password must contain at least 16 characters"
        );
        ensure!(
            !self.site_name.trim().is_empty()
                && self.site_name.len() <= 100
                && !self.site_name.chars().any(char::is_control),
            "Site name must be 1–100 bytes without control characters"
        );
        ensure!(
            !self.secure_cookies || self.mail.is_some(),
            "Public HTTPS websites require verification and recovery email settings"
        );
        if let Some(mail) = &self.mail {
            ensure!(
                !mail.host.trim().is_empty()
                    && !mail.username.trim().is_empty()
                    && !mail.password.is_empty(),
                "Complete all SMTP settings"
            );
            ensure!(
                !mail.host.contains(['/', ':']) && !mail.host.chars().any(char::is_whitespace),
                "SMTP host must be a hostname without a port or URL scheme"
            );
            ensure!(
                mail.from.contains('@') && !mail.from.chars().any(char::is_control),
                "Enter a valid sender email address"
            );
        }
        Ok(())
    }
}
/// During first-time setup, require the browser Origin authority to match the request Host.
/// No forwarded headers are trusted. The separate setup code prevents DNS-rebinding claims.
pub fn setup_origin_matches(origin: &str, host: &str) -> bool {
    Url::parse(origin).ok().is_some_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && (url.scheme() == "https"
                || matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
            && url.origin().ascii_serialization() == origin
            && origin.strip_prefix(&format!("{}://", url.scheme())) == Some(host)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_configuration_and_credentials_fail_closed() {
        let mut config = Config::bootstrap();
        config.validate().unwrap();
        config.public_url = "http://fiction.example".into();
        assert!(config.validate().is_err());
        config.public_url = "https://fiction.example".into();
        config.secure_cookies = true;
        assert!(config.validate().is_err());
        config.mail = Some(Mail {
            host: "smtp.example.com".into(),
            username: "mailer".into(),
            password: "secret".into(),
            from: "stories@example.com".into(),
        });
        config.validate().unwrap();
        config.database.username = Some("root".into());
        assert!(config.validate().is_err());
    }
    #[test]
    fn settings_survive_atomic_private_save() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config.toml");
        let config = Config::bootstrap();
        config.save(&path).unwrap();
        assert_eq!(Config::load(&path).unwrap().site_name, "Artismaga");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    #[test]
    fn setup_origin_requires_exact_authority() {
        assert!(setup_origin_matches(
            "http://localhost:8000",
            "localhost:8000"
        ));
        assert!(setup_origin_matches(
            "https://stories.example",
            "stories.example"
        ));
        assert!(!setup_origin_matches(
            "http://stories.example",
            "stories.example"
        ));
        for origin in [
            "null",
            "https://evil.example",
            "http://localhost:8000/path",
            "http://localhost:8000/",
        ] {
            assert!(!setup_origin_matches(origin, "localhost:8000"));
        }
    }
}
