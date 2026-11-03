//! SurrealDB HTTP RPC adapter. All user values are bound in `vars`, never SQL text.
pub mod queries;

use anyhow::{Context, Result, bail};
use artismaga_config::Database;
use artismaga_core::{PublicUser, gravatar};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Clone)]
pub struct Store {
    client: reqwest::Client,
    config: Database,
}
#[derive(Clone, Deserialize)]
pub struct Account {
    pub uid: String,
    pub email: String,
    pub display_name: String,
    pub password_hash: String,
    pub group_key: String,
    pub email_verified: bool,
}
impl Account {
    pub fn public(&self) -> PublicUser {
        PublicUser {
            uid: self.uid.clone(),
            display_name: self.display_name.clone(),
            group_key: self.group_key.clone(),
            email_verified: self.email_verified,
            avatar_url: gravatar(&self.email),
        }
    }
}
impl Store {
    pub fn new(config: Database) -> Result<Self> {
        for name in [&config.namespace, &config.database] {
            anyhow::ensure!(
                !name.is_empty()
                    && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                    && !name.starts_with(|c: char| c.is_ascii_digit()),
                "Database and namespace names must be ASCII identifiers"
            );
        }
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            config,
        })
    }
    pub async fn migrate(&self) -> Result<()> {
        // SurrealDB 3 requires explicit namespace/database creation. Identifiers are validated in new().
        self.query(
            &format!(
                "DEFINE NAMESPACE IF NOT EXISTS {}; DEFINE DATABASE IF NOT EXISTS {};",
                self.config.namespace, self.config.database
            ),
            json!({}),
        )
        .await?;
        self.query(include_str!("schema.surql"), json!({})).await?;
        self.query(include_str!("installation.surql"), json!({}))
            .await?;
        self.query(include_str!("account_settings.surql"), json!({}))
            .await?;
        self.query(include_str!("studio.surql"), json!({})).await?;
        self.query(include_str!("writing.surql"), json!({})).await?;
        self.query(include_str!("publishing.surql"), json!({}))
            .await?;
        self.query(include_str!("reader.surql"), json!({})).await?;
        self.query(include_str!("community.surql"), json!({}))
            .await?;
        self.query(include_str!("engagement.surql"), json!({}))
            .await?;
        self.query(include_str!("creative.surql"), json!({}))
            .await?;
        self.query(include_str!("announcements.surql"), json!({}))
            .await?;
        self.query(include_str!("localisation.surql"), json!({}))
            .await?;
        Ok(())
    }
    /// Return statement results only after checking *every* statement for errors.
    /// Database diagnostics may contain sensitive values; never expose them to HTTP clients.
    pub async fn query(&self, sql: &str, vars: Value) -> Result<Vec<Value>> {
        // RPC may infer record references from strings such as "key:part.1".
        // Decode an inert JSON document in SQL so arbitrary user/localisation text
        // remains strings. Only validated parameter identifiers enter SQL text.
        let bindings = vars
            .as_object()
            .context("Bind variables must be an object")?;
        let mut wire_sql = String::new();
        let mut prefix = 0usize;
        let wire_vars = if bindings.is_empty() {
            vars.clone()
        } else {
            wire_sql.push_str(
                "LET $artismaga_bound_values = encoding::json::decode($artismaga_json_payload); ",
            );
            prefix += 1;
            for key in bindings.keys() {
                anyhow::ensure!(
                    !key.starts_with("artismaga_")
                        && !key.is_empty()
                        && key.bytes().enumerate().all(|(i, c)| c.is_ascii_alphabetic()
                            || c == b'_'
                            || (i > 0 && c.is_ascii_digit())),
                    "Invalid bind identifier"
                );
                wire_sql.push_str(&format!("LET ${key} = $artismaga_bound_values.{key}; "));
                prefix += 1;
            }
            json!({"artismaga_json_payload":serde_json::to_string(&vars)?})
        };
        wire_sql.push_str(sql);

        let request = self
            .client
            .post(format!("{}/rpc", self.config.url.trim_end_matches('/')))
            .header("surreal-ns", &self.config.namespace)
            .header("surreal-db", &self.config.database)
            .json(&json!({"id": 1, "method": "query", "params": [wire_sql, wire_vars]}));
        let request = match (&self.config.username, &self.config.password) {
            (Some(username), Some(password)) => request.basic_auth(username, Some(password)),
            _ => request,
        };
        let reply: Value = request
            .send()
            .await
            .context("Database connection failed")?
            .error_for_status()?
            .json()
            .await?;
        if reply.get("error").is_some() {
            bail!("Database RPC failed");
        }
        let statements = reply["result"]
            .as_array()
            .context("Malformed database RPC response")?;
        let mut results = Vec::new();
        for statement in statements {
            if statement["status"] != "OK" {
                bail!("Database statement failed");
            }
            results.push(statement["result"].clone());
        }
        Ok(results.into_iter().skip(prefix).collect())
    }
    pub async fn rows<T: DeserializeOwned>(&self, sql: &str, vars: Value) -> Result<Vec<T>> {
        let results = self.query(sql, vars).await?;
        serde_json::from_value(results.last().cloned().unwrap_or(json!([])))
            .context("Unexpected database record shape")
    }
    pub async fn by_email(&self, email: &str) -> Result<Option<Account>> {
        Ok(self
            .rows(
                "SELECT * FROM account WHERE email = $email LIMIT 1",
                json!({"email":email}),
            )
            .await?
            .pop())
    }
    pub async fn by_uid(&self, uid: &str) -> Result<Option<Account>> {
        Ok(self
            .rows(
                "SELECT * FROM account WHERE uid = $uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop())
    }
}
