//! Public-name search and atomic multi-account collaborator grants.
use crate::{Actor, Studio};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Deserialize, Serialize)]
pub struct Person {
    pub uid: String,
    pub display_name: String,
}
impl Studio {
    pub async fn search_people(
        &self,
        actor: &Actor<'_>,
        work: &str,
        search: &str,
    ) -> Result<Vec<Person>> {
        ensure!(
            self.get(actor, work, None).await?.can_share,
            "Sharing permission required"
        );
        ensure!(search.chars().count() <= 100, "Search too long");
        if search.trim().chars().count() < 2 || search.contains('@') {
            return Ok(Vec::new());
        }
        self.store.rows("SELECT uid,display_name FROM account WHERE uid!=$owner AND string::contains(string::lowercase(display_name),$search) ORDER BY display_name,uid LIMIT 20",json!({"owner":actor.uid,"search":search.trim().to_lowercase()})).await
    }
    pub async fn share_many(
        &self,
        actor: &Actor<'_>,
        work: &str,
        recipients: &[String],
        can_edit: bool,
        remove: bool,
    ) -> Result<()> {
        let page = self.get(actor, work, None).await?;
        ensure!(
            page.can_share && !recipients.is_empty() && recipients.len() <= 50,
            "Choose 1–50 collaborators"
        );
        let mut ids = Vec::new();
        for recipient in recipients {
            ensure!(recipient.len() <= 254, "Recipient too long");
            let account = if recipient.contains('@') {
                self.store
                    .by_email(
                        &artismaga_core::normalize_email(recipient).map_err(anyhow::Error::msg)?,
                    )
                    .await?
            } else {
                self.store.by_uid(recipient).await?
            };
            let account = account
                .ok_or_else(|| anyhow::anyhow!("One or more recipients could not be matched"))?;
            ensure!(
                account.uid != page.work.owner,
                "The owner already has access"
            );
            if !ids.contains(&account.uid) {
                ids.push(account.uid);
            }
        }
        self.store.query(include_str!("shares_update.surql"),json!({"work":work,"actor":actor.uid,"admin":actor.administrator,"recipients":ids,"can_edit":can_edit,"remove":remove})).await?;
        Ok(())
    }
}
