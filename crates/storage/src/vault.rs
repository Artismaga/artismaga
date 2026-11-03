//! Authenticated encryption; the key is stored atomically in the owner-private app volume.
use anyhow::{Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use std::{io::Write, path::Path};
#[derive(Deserialize, Serialize)]
pub struct Credentials {
    pub access_key_id: String,
    pub secret_access_key: String,
}
fn key(root: &Path) -> Result<Vec<u8>> {
    std::fs::create_dir_all(root)?;
    let path = root.join("storage.key");
    if !path.try_exists()? {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        let mut file = tempfile::NamedTempFile::new_in(root)?;
        file.write_all(&key)?;
        file.as_file().sync_all()?;
        if let Err(e) = file.persist_noclobber(&path) {
            ensure!(
                e.error.kind() == std::io::ErrorKind::AlreadyExists,
                "Could not persist storage key"
            );
        }
    }
    let key = std::fs::read(path)?;
    ensure!(key.len() == 32, "Storage key is invalid");
    Ok(key)
}
pub fn seal(root: &Path, credentials: &Credentials, context: &str) -> Result<String> {
    let key = key(root)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|_| anyhow::anyhow!("Invalid storage key"))?;
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let message = serde_json::to_vec(credentials)?;
    let encrypted = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &message,
                aad: context.as_bytes(),
            },
        )
        .map_err(|_| anyhow::anyhow!("Could not protect credentials"))?;
    Ok(STANDARD.encode([nonce.as_slice(), &encrypted].concat()))
}
pub fn open(root: &Path, value: &str, context: &str) -> Result<Credentials> {
    let data = STANDARD.decode(value)?;
    ensure!(data.len() > 24, "Invalid encrypted credentials");
    let key = key(root)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|_| anyhow::anyhow!("Invalid storage key"))?;
    let plain = cipher
        .decrypt(
            XNonce::from_slice(&data[..24]),
            Payload {
                msg: &data[24..],
                aad: context.as_bytes(),
            },
        )
        .map_err(|_| anyhow::anyhow!("Cannot unlock storage credentials; restore storage.key"))?;
    Ok(serde_json::from_slice(&plain)?)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credentials_are_encrypted_and_bound_to_their_provider() {
        let root = tempfile::tempdir().unwrap();
        let c = Credentials {
            access_key_id: "synthetic-access".into(),
            secret_access_key: "synthetic-secret".into(),
        };
        let encrypted = seal(root.path(), &c, "store_a").unwrap();
        assert!(!encrypted.contains("synthetic"));
        assert_eq!(
            open(root.path(), &encrypted, "store_a")
                .unwrap()
                .secret_access_key,
            c.secret_access_key
        );
        assert!(open(root.path(), &encrypted, "store_b").is_err());
    }
}
