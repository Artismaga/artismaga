//! Private artwork storage, write-only encrypted provider credentials and image sanitization.
mod images;
pub mod vault;
use anyhow::{Result, ensure};
use artismaga_db::Store;
use object_store::{
    ObjectStore, ObjectStoreExt, aws::AmazonS3Builder, local::LocalFileSystem, path::Path,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{path::PathBuf, sync::Arc};
use tokio::sync::Semaphore;

pub use images::MAX_UPLOAD;
#[derive(Clone)]
pub struct Storage {
    store: Store,
    root: PathBuf,
    decoding: Arc<Semaphore>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Location {
    pub kind: String,
    pub bucket: String,
    pub region: String,
    pub account_id: String,
}
#[derive(Clone, Deserialize, Serialize)]
struct Provider {
    uid: String,
    location: Location,
    credentials: Option<String>,
}
#[derive(Deserialize)]
struct StoredProvider {
    value: Provider,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct StorageSettings {
    pub revision: i64,
    pub location: Location,
    pub credentials_set: bool,
    pub retained_locations: Vec<PublicLocation>,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct PublicLocation {
    pub uid: String,
    pub location: Location,
    pub credentials_set: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StorageUpdate {
    pub revision: i64,
    pub location: Location,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
}
#[derive(Deserialize)]
struct State {
    revision: i64,
    active: String,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Asset {
    pub uid: String,
    pub owner: String,
    pub provider: String,
    pub object_key: String,
    pub purpose: String,
    pub palette: Vec<String>,
    pub created_at: i64,
}
impl Storage {
    /// Share the owner-private vault without exposing its root or encryption key.
    pub fn seal_secret(&self, secret: &str, context: &str) -> Result<String> {
        vault::seal(
            &self.root,
            &vault::Credentials {
                access_key_id: String::new(),
                secret_access_key: secret.into(),
            },
            context,
        )
    }
    pub fn open_secret(&self, value: &str, context: &str) -> Result<String> {
        Ok(vault::open(&self.root, value, context)?.secret_access_key)
    }

    pub fn new(store: Store, root: PathBuf) -> Self {
        Self {
            store,
            root,
            decoding: Arc::new(Semaphore::new(2)),
        }
    }
    async fn state(&self) -> Result<State> {
        Ok(self
            .store
            .rows("SELECT revision,active FROM storage_state:main", json!({}))
            .await?
            .pop()
            .unwrap_or(State {
                revision: 0,
                active: "local".into(),
            }))
    }
    async fn provider(&self, uid: &str) -> Result<Provider> {
        if uid == "local" {
            return Ok(Provider {
                uid: uid.into(),
                location: Location {
                    kind: "local".into(),
                    ..Default::default()
                },
                credentials: None,
            });
        }
        let value: StoredProvider = self
            .store
            .rows(
                "SELECT * FROM storage_provider WHERE uid=$uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await?
            .pop()
            .ok_or_else(|| anyhow::anyhow!("Storage location unavailable"))?;
        Ok(value.value)
    }
    pub async fn settings(&self) -> Result<StorageSettings> {
        let state = self.state().await?;
        let provider = self.provider(&state.active).await?;
        let providers: Vec<StoredProvider> = self
            .store
            .rows("SELECT * FROM storage_provider", json!({}))
            .await?;
        Ok(StorageSettings {
            revision: state.revision,
            location: provider.location,
            credentials_set: provider.credentials.is_some(),
            retained_locations: providers
                .into_iter()
                .map(|p| PublicLocation {
                    uid: p.value.uid,
                    location: p.value.location,
                    credentials_set: p.value.credentials.is_some(),
                })
                .collect(),
        })
    }
    pub async fn save(&self, value: StorageUpdate) -> Result<i64> {
        validate(&value)?;
        let location = normalized(value.location);
        let mut provider = if location.kind == "local" {
            self.provider("local").await?
        } else {
            let found: Option<StoredProvider> = self
                .store
                .rows(
                    "SELECT * FROM storage_provider WHERE value.location=$location LIMIT 1",
                    json!({"location":location}),
                )
                .await?
                .pop();
            found.map(|p| p.value).unwrap_or(Provider {
                uid: format!("store_{}", uuid::Uuid::new_v4()),
                location: location.clone(),
                credentials: None,
            })
        };
        if location.kind != "local" {
            let access = value.access_key_id.filter(|s| !s.is_empty());
            let secret = value.secret_access_key.filter(|s| !s.is_empty());
            let old = if access.is_none() || secret.is_none() {
                provider
                    .credentials
                    .as_ref()
                    .map(|c| vault::open(&self.root, c, &provider.uid))
                    .transpose()?
            } else {
                None
            };
            let credentials = vault::Credentials {
                access_key_id: access
                    .or_else(|| old.as_ref().map(|c| c.access_key_id.clone()))
                    .ok_or_else(|| anyhow::anyhow!("Supply an access key"))?,
                secret_access_key: secret
                    .or_else(|| old.map(|c| c.secret_access_key))
                    .ok_or_else(|| anyhow::anyhow!("Supply a secret key"))?,
            };
            provider.credentials = Some(vault::seal(&self.root, &credentials, &provider.uid)?);
        }
        self.store
            .query(
                artismaga_db::queries::SAVE_STORAGE,
                json!({"revision":value.revision,"uid":provider.uid,"value":provider}),
            )
            .await?;
        Ok(value.revision + 1)
    }
    async fn backend(&self, provider: &Provider) -> Result<Arc<dyn ObjectStore>> {
        if provider.location.kind == "local" {
            let path = self.root.join("media");
            std::fs::create_dir_all(&path)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
            }
            return Ok(Arc::new(LocalFileSystem::new_with_prefix(path)?));
        }
        let encrypted = provider
            .credentials
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Credentials unavailable"))?;
        let credentials = vault::open(&self.root, encrypted, &provider.uid)?;
        let mut builder = AmazonS3Builder::new()
            .with_bucket_name(&provider.location.bucket)
            .with_region(&provider.location.region)
            .with_access_key_id(credentials.access_key_id)
            .with_secret_access_key(credentials.secret_access_key);
        if provider.location.kind == "r2" {
            builder = builder
                .with_endpoint(format!(
                    "https://{}.r2.cloudflarestorage.com",
                    provider.location.account_id
                ))
                .with_virtual_hosted_style_request(false);
        }
        Ok(Arc::new(builder.build()?))
    }
    pub async fn upload(
        &self,
        owner: &str,
        purpose: &str,
        bytes: Vec<u8>,
        now: i64,
    ) -> Result<Asset> {
        ensure!(
            [
                "cover",
                "hero",
                "default_cover",
                "chapter_cover",
                "reaction",
                "genre_image",
                "announcement",
                "genre_hero"
            ]
            .contains(&purpose),
            "Invalid artwork purpose"
        );
        ensure!(bytes.len() <= MAX_UPLOAD, "Artwork is too large");
        let permit = self.decoding.clone().acquire_owned().await?;
        let is_hero = ["hero", "genre_hero", "announcement"].contains(&purpose);
        let processed = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            images::process(bytes, is_hero)
        })
        .await??;
        let uid = format!("asset_{}", uuid::Uuid::new_v4());
        let provider = self.provider(&self.state().await?.active).await?;
        let asset = Asset {
            object_key: format!("artwork/{uid}.jpg"),
            uid,
            owner: owner.into(),
            provider: provider.uid.clone(),
            purpose: purpose.into(),
            palette: processed.palette,
            created_at: now,
        };
        let backend = self.backend(&provider).await?;
        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            backend.put(
                &Path::from(asset.object_key.clone()),
                processed.bytes.into(),
            ),
        )
        .await??;
        if self
            .store
            .query("CREATE media_asset CONTENT $asset", json!({"asset":asset}))
            .await
            .is_err()
        {
            let _ = backend.delete(&Path::from(asset.object_key.clone())).await;
            anyhow::bail!("Could not save artwork metadata");
        }
        Ok(asset)
    }
    pub async fn asset(&self, uid: &str) -> Result<Option<Asset>> {
        self.store
            .rows(
                "SELECT * FROM media_asset WHERE uid=$uid LIMIT 1",
                json!({"uid":uid}),
            )
            .await
            .map(|mut v| v.pop())
    }
    pub async fn bytes(&self, asset: &Asset) -> Result<Vec<u8>> {
        let provider = self.provider(&asset.provider).await?;
        let backend = self.backend(&provider).await?;
        let bytes = tokio::time::timeout(std::time::Duration::from_secs(30), async {
            let data = backend.get(&Path::from(asset.object_key.clone())).await?;
            ensure!(
                data.meta.size <= 12 * 1024 * 1024,
                "Artwork exceeds size limit"
            );
            Ok::<_, anyhow::Error>(data.bytes().await?.to_vec())
        })
        .await??;
        Ok(bytes)
    }
    /// Retryable physical removal after account data and access have been deleted atomically.
    pub async fn cleanup(&self) -> Result<()> {
        #[derive(Deserialize)]
        struct Job {
            uid: String,
            provider: String,
            object_key: String,
        }
        let jobs: Vec<Job> = self
            .store
            .rows(
                "SELECT uid,provider,object_key FROM storage_deletion LIMIT 32",
                json!({}),
            )
            .await?;
        for job in jobs {
            let result = async {
                let provider = self.provider(&job.provider).await?;
                let backend = self.backend(&provider).await?;
                let result = tokio::time::timeout(
                    std::time::Duration::from_secs(30),
                    backend.delete(&Path::from(job.object_key)),
                )
                .await?;
                match result {
                    Ok(()) | Err(object_store::Error::NotFound { .. }) => {}
                    Err(e) => return Err(e.into()),
                }
                self.store
                    .query(
                        "DELETE storage_deletion WHERE uid=$uid",
                        json!({"uid":job.uid}),
                    )
                    .await?;
                Ok::<_, anyhow::Error>(())
            }
            .await;
            if result.is_err() {
                continue;
            }
        }
        Ok(())
    }
    pub async fn owned_asset(&self, uid: &str, owner: &str, purpose: &str) -> Result<()> {
        let a = self
            .asset(uid)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Artwork unavailable"))?;
        ensure!(
            a.owner == owner && a.purpose == purpose,
            "Choose your own artwork of the correct type"
        );
        Ok(())
    }
}
fn normalized(mut location: Location) -> Location {
    if location.kind == "local" {
        location.bucket.clear();
        location.region.clear();
        location.account_id.clear();
    }
    if location.kind == "r2" {
        location.region = "auto".into();
        location.account_id = location.account_id.to_lowercase();
    }
    if location.kind == "s3" {
        location.account_id.clear();
    }
    location
}
pub fn validate(v: &StorageUpdate) -> Result<()> {
    ensure!(
        (0..i64::MAX).contains(&v.revision),
        "Invalid settings revision"
    );
    ensure!(
        ["local", "s3", "r2"].contains(&v.location.kind.as_str()),
        "Choose Local Disk, AWS S3 or Cloudflare R2"
    );
    for value in [&v.access_key_id, &v.secret_access_key]
        .into_iter()
        .flatten()
    {
        ensure!(
            value.len() <= 4096 && value.is_ascii() && !value.chars().any(char::is_control),
            "Invalid credential format"
        );
    }
    if v.location.kind != "local" {
        let bucket = &v.location.bucket;
        ensure!(
            (3..=63).contains(&bucket.len())
                && bucket.chars().all(|c| c.is_ascii_lowercase()
                    || c.is_ascii_digit()
                    || matches!(c, '-' | '.'))
                && bucket.starts_with(|c: char| c.is_ascii_alphanumeric())
                && bucket.ends_with(|c: char| c.is_ascii_alphanumeric())
                && !bucket.contains("..")
                && bucket.parse::<std::net::Ipv4Addr>().is_err(),
            "Enter a valid bucket name"
        );
        if v.location.kind == "r2" {
            ensure!(
                v.location.account_id.len() == 32
                    && v.location.account_id.chars().all(|c| c.is_ascii_hexdigit()),
                "Enter the Cloudflare account ID (32 hexadecimal characters)"
            );
        } else {
            ensure!(
                (3..=40).contains(&v.location.region.len())
                    && v.location
                        .region
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                "Enter an AWS region"
            );
        }
    }
    Ok(())
}
