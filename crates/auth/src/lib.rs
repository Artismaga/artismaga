//! Account lifecycle, password hashing, permission checks, and opaque session/token rotation.
use anyhow::{Result, bail, ensure};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use artismaga_config::{Config, Mail};
use artismaga_core::{Permission, PermissionGroup, SignupMode, normalize_email};
use artismaga_db::{Account, Store};
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::authentication::Credentials,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;

pub const SESSION_SECONDS: i64 = 60 * 60 * 24 * 7;
#[derive(Clone)]
pub struct Auth {
    pub store: Store,
    config: Config,
    hashing: Arc<Semaphore>,
    mailing: Arc<Semaphore>,
    dummy_hash: String,
}
#[derive(Deserialize)]
struct Session {
    uid: String,
}

#[derive(Deserialize)]
struct StoredSession {
    sid: Option<String>,
    created_at: Option<i64>,
    expires_at: i64,
    device: Option<String>,
    token_hash: String,
}
#[derive(Serialize)]
pub struct ActiveSession {
    pub sid: Option<String>,
    pub created_at: Option<i64>,
    pub expires_at: i64,
    pub device: String,
    pub current: bool,
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
pub fn token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
/// Compare fixed-length credentials without an early-exit equality check.
pub fn credential_matches(expected: &str, provided: &str) -> bool {
    use subtle::ConstantTimeEq;
    expected.len() == provided.len() && bool::from(expected.as_bytes().ct_eq(provided.as_bytes()))
}
fn hash(password: &str) -> Result<String> {
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map_err(|_| anyhow::anyhow!("Password hashing failed"))?
        .to_string())
}
fn password_valid(password: &str) -> Result<()> {
    ensure!(
        (15..=128).contains(&password.chars().count()) && password.len() <= 512,
        "Use a password of 15–128 characters"
    );
    Ok(())
}
impl Auth {
    pub fn new(store: Store, config: Config) -> Result<Self> {
        Ok(Self {
            store,
            config,
            hashing: Arc::new(Semaphore::new(4)),
            mailing: Arc::new(Semaphore::new(4)),
            dummy_hash: hash(&token())?,
        })
    }
    async fn password_hash(&self, password: String) -> Result<String> {
        password_valid(&password)?;
        let permit = self.hashing.clone().acquire_owned().await?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            hash(&password)
        })
        .await?
    }
    pub async fn signup_mode(&self) -> Result<SignupMode> {
        #[derive(Deserialize)]
        struct Settings {
            signup_mode: SignupMode,
        }
        let settings: Vec<Settings> = self
            .store
            .rows("SELECT signup_mode FROM site_settings:main", json!({}))
            .await?;
        Ok(settings
            .first()
            .map(|s| s.signup_mode)
            .unwrap_or(SignupMode::Disabled))
    }
    pub async fn register(
        &self,
        email: String,
        display_name: String,
        password: String,
        invitation: Option<String>,
    ) -> Result<()> {
        let email = normalize_email(&email).map_err(anyhow::Error::msg)?;
        let display_name = display_name.trim();
        ensure!(
            !display_name.is_empty()
                && display_name.chars().count() <= 80
                && !display_name.chars().any(char::is_control),
            "Display name must contain 1–80 characters"
        );
        let password_hash = self.password_hash(password).await?;
        // Mode and single-use invitation consumption are checked atomically with account creation.
        self.store.query(artismaga_db::queries::REGISTER, json!({
            "invite":digest(&invitation.unwrap_or_default()), "now":now(),
            "account":{"uid":format!("usr_{}", uuid::Uuid::new_v4()),"email":email,"display_name":display_name,
                "password_hash":password_hash,"group_key":"reader","email_verified":false}
        })).await?;
        Ok(())
    }
    pub async fn login(&self, email: String, password: String) -> Result<(Account, String)> {
        self.login_device(email, password, "Unknown device".into())
            .await
    }
    pub async fn login_device(
        &self,
        email: String,
        password: String,
        device: String,
    ) -> Result<(Account, String)> {
        ensure!(password.len() <= 512, "Invalid credentials");
        let email = normalize_email(&email).unwrap_or_default();
        let account = self.store.by_email(&email).await?;
        let encoded = account
            .as_ref()
            .map(|a| a.password_hash.clone())
            .unwrap_or_else(|| self.dummy_hash.clone());
        let permit = self.hashing.clone().acquire_owned().await?;
        let valid = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            PasswordHash::new(&encoded)
                .map(|h| {
                    Argon2::default()
                        .verify_password(password.as_bytes(), &h)
                        .is_ok()
                })
                .unwrap_or(false)
        })
        .await?;
        ensure!(valid, "Invalid credentials");
        let account = account.ok_or_else(|| anyhow::anyhow!("Invalid credentials"))?;
        let raw = token();
        self.store
            .query(
                artismaga_db::queries::CREATE_SESSION,
                json!({"hash":digest(&raw),"uid":account.uid,"expiry":now()+SESSION_SECONDS,"password_hash":account.password_hash,"sid":format!("sess_{}",uuid::Uuid::new_v4()),"now":now(),"device":device.chars().filter(|c|!c.is_control()).take(80).collect::<String>()}),
            )
            .await?;
        Ok((account, raw))
    }
    pub async fn current(&self, raw: &str) -> Result<Option<Account>> {
        if raw.len() != 64 {
            return Ok(None);
        }
        let session: Option<Session> = self
            .store
            .rows(
                "SELECT uid FROM session WHERE token_hash = $hash AND expires_at > $now LIMIT 1",
                json!({"hash":digest(raw),"now":now()}),
            )
            .await?
            .pop();
        match session {
            Some(s) => self.store.by_uid(&s.uid).await,
            None => Ok(None),
        }
    }
    pub async fn logout(&self, raw: &str) -> Result<()> {
        self.store
            .query(
                "DELETE session WHERE token_hash = $hash",
                json!({"hash":digest(raw)}),
            )
            .await?;
        Ok(())
    }
    pub async fn revoke_all(&self, uid: &str) -> Result<()> {
        self.store
            .query("DELETE session WHERE uid = $uid", json!({"uid":uid}))
            .await?;
        Ok(())
    }
    pub async fn verify_current_password(&self, uid: &str, password: String) -> Result<String> {
        ensure!(password.len() <= 512, "Invalid password");
        let account = self
            .store
            .by_uid(uid)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Account unavailable"))?;
        let encoded = account.password_hash.clone();
        let permit = self.hashing.clone().acquire_owned().await?;
        let valid = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            PasswordHash::new(&encoded)
                .map(|h| {
                    Argon2::default()
                        .verify_password(password.as_bytes(), &h)
                        .is_ok()
                })
                .unwrap_or(false)
        })
        .await?;
        ensure!(valid, "Current password is incorrect");
        Ok(account.password_hash)
    }
    pub async fn change_password(&self, uid: &str, current: String, new: String) -> Result<()> {
        let old = self.verify_current_password(uid, current).await?;
        let new = self.password_hash(new).await?;
        self.store
            .query(
                artismaga_db::queries::CHANGE_PASSWORD,
                json!({"uid":uid,"old":old,"new":new}),
            )
            .await?;
        Ok(())
    }
    pub async fn sessions(&self, uid: &str, current: &str) -> Result<Vec<ActiveSession>> {
        let sessions:Vec<StoredSession>=self.store.rows("SELECT sid,created_at,expires_at,device,token_hash FROM session WHERE uid = $uid AND expires_at > $now ORDER BY expires_at DESC",json!({"uid":uid,"now":now()})).await?;
        Ok(sessions
            .into_iter()
            .map(|v| ActiveSession {
                sid: v.sid,
                created_at: v.created_at,
                expires_at: v.expires_at,
                device: v.device.unwrap_or_else(|| "Older session".into()),
                current: credential_matches(&v.token_hash, &digest(current)),
            })
            .collect())
    }
    pub async fn revoke_session(&self, uid: &str, sid: &str) -> Result<()> {
        self.store
            .query(
                "DELETE session WHERE uid = $uid AND sid = $sid",
                json!({"uid":uid,"sid":sid}),
            )
            .await?;
        Ok(())
    }
    pub async fn request_email_change(
        &self,
        uid: &str,
        password: String,
        email: String,
    ) -> Result<()> {
        let mail = self
            .config
            .mail
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Email delivery is unavailable"))?;
        let old_hash = self.verify_current_password(uid, password).await?;
        let email = normalize_email(&email).map_err(anyhow::Error::msg)?;
        let raw = token();
        self.store.query(artismaga_db::queries::REQUEST_EMAIL_CHANGE,json!({"uid":uid,"email":email,"hash":digest(&raw),"expiry":now()+1800,"old":old_hash})).await?;
        let (subject, body) = self
            .localised_mail(
                uid,
                "change",
                &format!("{}/account/email#{raw}", self.config.public_url),
            )
            .await?;
        send_mail(mail, &email, &subject, &body).await?;
        Ok(())
    }
    pub async fn permissions(&self, account: &Account) -> Result<Vec<Permission>> {
        let group: Option<PermissionGroup> = self
            .store
            .rows(
                "SELECT * FROM permission_group WHERE key=$key LIMIT 1",
                json!({"key":account.group_key}),
            )
            .await?
            .pop();
        Ok(group
            .map(|g| {
                let mut permissions = g.permissions;
                if permissions.contains(&Permission::Administer) {
                    for p in [
                        Permission::ConfigureLocalisation,
                        Permission::ManageAnnouncements,
                        Permission::ManageComments,
                        Permission::ViewAnalytics,
                    ] {
                        if !permissions.contains(&p) {
                            permissions.push(p);
                        }
                    }
                }
                let administrative = permissions.contains(&Permission::Administer);
                permissions
                    .into_iter()
                    .filter(|p| {
                        account.email_verified
                            || *p == Permission::Administer
                            || (administrative
                                && matches!(
                                    p,
                                    Permission::ConfigureLocalisation
                                        | Permission::ManageAnnouncements
                                        | Permission::ManageComments
                                        | Permission::ViewAnalytics
                                ))
                    })
                    .collect()
            })
            .unwrap_or_default())
    }
    /// Groups are loaded on each check, so role changes affect existing sessions immediately.
    pub async fn allowed(&self, account: &Account, permission: Permission) -> Result<bool> {
        let group: Option<PermissionGroup> = self
            .store
            .rows(
                "SELECT * FROM permission_group WHERE key = $key LIMIT 1",
                json!({"key":account.group_key}),
            )
            .await?
            .pop();
        Ok(group.is_some_and(|g| {
            g.permissions.contains(&permission)
                || (g.permissions.contains(&Permission::Administer)
                    && matches!(
                        permission,
                        Permission::ConfigureLocalisation
                            | Permission::ManageAnnouncements
                            | Permission::ManageComments
                            | Permission::ViewAnalytics
                    ))
        }) && (account.email_verified
            || permission == Permission::Administer
            || (account.group_key == "administrator"
                && matches!(
                    permission,
                    Permission::ConfigureLocalisation
                        | Permission::ManageAnnouncements
                        | Permission::ManageComments
                        | Permission::ViewAnalytics
                ))))
    }
    pub async fn bootstrap_admin(&self, email: String, password: String) -> Result<()> {
        let email = normalize_email(&email).map_err(anyhow::Error::msg)?;
        ensure!(
            self.store.by_email(&email).await?.is_none(),
            "Account exists; bootstrap will never promote or overwrite it"
        );
        let password_hash = self.password_hash(password).await?;
        self.store.query(artismaga_db::queries::BOOTSTRAP_ADMIN,json!({"account":{"uid":format!("usr_{}", uuid::Uuid::new_v4()),"email":email,"display_name":"Administrator","password_hash":password_hash,"group_key":"administrator","email_verified":true}})).await?;
        Ok(())
    }
    /// Installation is claimed atomically with the first administrator and signup policy.
    pub async fn install(
        &self,
        email: String,
        name: String,
        password: String,
        mode: SignupMode,
    ) -> Result<()> {
        let email = normalize_email(&email).map_err(anyhow::Error::msg)?;
        let name = name.trim();
        ensure!(
            !name.is_empty() && name.chars().count() <= 80 && !name.chars().any(char::is_control),
            "Display name must contain 1–80 characters"
        );
        let password_hash = self.password_hash(password).await?;
        self.store.query(artismaga_db::queries::INSTALL,json!({"mode":mode,"account":{
            "uid":format!("usr_{}",uuid::Uuid::new_v4()),"email":email,"display_name":name,"password_hash":password_hash
        }})).await?;
        Ok(())
    }
    pub async fn invite(&self) -> Result<String> {
        let raw = token();
        self.store
            .query(
                "CREATE invitation SET token_hash = $hash, expires_at = $expiry, used = false",
                json!({"hash":digest(&raw),"expiry":now()+60*60*24*7}),
            )
            .await?;
        Ok(raw)
    }
    /// A bounded best-effort dispatch hides account lookup/SMTP timing from HTTP callers.
    pub fn queue_account_token(&self, email: String, purpose: String) -> Result<()> {
        let permit = self.mailing.clone().try_acquire_owned()?;
        let auth = self.clone();
        tokio::spawn(async move {
            let _permit = permit;
            if auth.send_account_token(email, &purpose).await.is_err() {
                eprintln!("Account email dispatch failed; no credential details logged");
            }
        });
        Ok(())
    }
    pub fn mail_enabled(&self) -> bool {
        self.config.mail.is_some()
    }
    /// Unknown addresses receive the same HTTP response as known ones. Tokens never enter logs.
    pub async fn send_account_token(&self, email: String, purpose: &str) -> Result<()> {
        ensure!(
            matches!(purpose, "verify" | "reset"),
            "Invalid token purpose"
        );
        let mail = self
            .config
            .mail
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("SMTP is not configured"))?;
        let email = normalize_email(&email).unwrap_or_default();
        if let Some(account) = self.store.by_email(&email).await? {
            if purpose == "verify" && account.email_verified {
                return Ok(());
            }
            let raw = token();
            self.store.query(artismaga_db::queries::ISSUE_ACCOUNT_TOKEN, json!({"uid":account.uid,"purpose":purpose,"hash":digest(&raw),"expiry":now()+1800})).await?;
            // Fragment keeps the credential out of HTTP request URLs, access logs and Referer.
            let link = format!("{}/account/{purpose}#{raw}", self.config.public_url);
            let (subject, body) = self.localised_mail(&account.uid, purpose, &link).await?;
            send_mail(mail, &email, &subject, &body).await?;
        }
        Ok(())
    }
    async fn localised_mail(
        &self,
        uid: &str,
        purpose: &str,
        link: &str,
    ) -> Result<(String, String)> {
        let localisation = artismaga_localisation::Localisation::new(self.store.clone());
        let settings = localisation.settings().await?;
        let prefs: Vec<serde_json::Value> = self
            .store
            .rows(
                "SELECT value FROM account_preferences WHERE uid=$uid",
                serde_json::json!({"uid":uid}),
            )
            .await?;
        let locale = prefs
            .first()
            .and_then(|p| p["value"]["content"]["language"].as_str())
            .unwrap_or(&settings.source_locale);
        let messages = localisation.bundle(locale, false).await?;
        let values = std::collections::BTreeMap::from([
            (
                "site".into(),
                messages
                    .get("site.name")
                    .cloned()
                    .unwrap_or_else(|| self.config.site_name.clone()),
            ),
            ("link".into(), link.into()),
        ]);
        let text = |suffix: &str| -> Result<String> {
            Ok(artismaga_localisation::interpolate(
                messages
                    .get(&format!("mail.{purpose}.{suffix}"))
                    .ok_or_else(|| anyhow::anyhow!("Email template unavailable"))?,
                &values,
            ))
        };
        Ok((text("subject")?, text("body")?))
    }
    pub async fn consume_account_token(
        &self,
        raw: String,
        purpose: &str,
        password: Option<String>,
    ) -> Result<()> {
        ensure!(raw.len() == 64, "Invalid token");
        let password_hash = if purpose == "reset" {
            Some(
                self.password_hash(password.ok_or_else(|| anyhow::anyhow!("Password required"))?)
                    .await?,
            )
        } else {
            None
        };
        let sql = match purpose {
            "verify" => artismaga_db::queries::VERIFY_EMAIL,
            "reset" => artismaga_db::queries::RESET_PASSWORD,
            "change_email" => artismaga_db::queries::CHANGE_EMAIL,
            _ => bail!("Invalid token purpose"),
        };
        self.store
            .query(
                sql,
                json!({"hash":digest(&raw),"now":now(),"password":password_hash}),
            )
            .await?;
        Ok(())
    }
    pub async fn cleanup(&self) -> Result<()> {
        self.store.query("DELETE session WHERE expires_at <= $now; DELETE account_token WHERE expires_at <= $now; DELETE invitation WHERE expires_at <= $now OR used = true;", json!({"now":now()})).await?;
        Ok(())
    }
}
async fn send_mail(config: &Mail, recipient: &str, subject: &str, body: &str) -> Result<()> {
    let message = Message::builder()
        .from(config.from.parse()?)
        .to(recipient.parse()?)
        .subject(subject)
        .body(body.to_string())?;
    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)?
        .credentials(Credentials::new(
            config.username.clone(),
            config.password.clone(),
        ))
        .build();
    tokio::time::timeout(std::time::Duration::from_secs(10), transport.send(message)).await??;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn passwords_are_salted_and_verified() {
        let a = hash("a long unique passphrase").unwrap();
        let b = hash("a long unique passphrase").unwrap();
        assert_ne!(a, b);
        let parsed = PasswordHash::new(&a).unwrap();
        assert!(
            Argon2::default()
                .verify_password(b"a long unique passphrase", &parsed)
                .is_ok()
        );
        assert!(
            Argon2::default()
                .verify_password(b"wrong", &parsed)
                .is_err()
        );
        assert!(password_valid("short").is_err());
    }
    #[test]
    fn tokens_are_random_and_hashed() {
        let a = token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, token());
        assert_ne!(a, digest(&a));
    }
}
