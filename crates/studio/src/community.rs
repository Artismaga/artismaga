//! Chapter discussion and account-owned inbox. Writes use one permission-checked transaction.
use crate::Studio;
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Command {
    pub action: String,
    #[serde(default)]
    pub uid: String,
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub gif: Option<String>,
    #[serde(default)]
    pub revision: i64,
}
impl Command {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            ["create", "edit", "delete", "like", "mute"].contains(&self.action.as_str()),
            "Invalid comment action"
        );
        ensure!(
            self.body.chars().count() <= 4000
                && self.body.len() <= 16000
                && !self
                    .body
                    .chars()
                    .any(|c| c.is_control() && c != '\n' && c != '\t'),
            "Comment too long or invalid"
        );
        ensure!(
            self.uid.len() <= 80
                && self.parent.as_ref().is_none_or(|s| s.len() <= 80)
                && self.revision >= 0,
            "Invalid comment identity"
        );
        ensure!(
            self.gif
                .as_ref()
                .is_none_or(|v| v.starts_with("gif_") && v.len() <= 80),
            "Choose a GIF from search"
        );
        if ["create", "edit"].contains(&self.action.as_str()) {
            ensure!(
                !self.body.trim().is_empty() || self.gif.is_some(),
                "Write a comment first"
            );
        }
        Ok(())
    }
}
#[derive(Deserialize, Serialize)]
pub struct Comment {
    pub uid: String,
    pub account: String,
    pub parent: Option<String>,
    pub body: String,
    pub gif: Option<String>,
    pub created_at: i64,
    pub revision: i64,
    pub deleted: bool,
    pub likes: usize,
    pub liked: bool,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub avatar: String,
    #[serde(default)]
    pub manager: bool,
    #[serde(default)]
    pub author: bool,
}
impl Studio {
    pub async fn comments(
        &self,
        work: &str,
        chapter: &str,
        account: Option<&str>,
    ) -> Result<Vec<Comment>> {
        let released = self.reader(work, chapter).await?;
        ensure!(released.is_some(), "Chapter unavailable");
        let publication = self
            .publication(work)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Story unavailable"))?;
        let mut rows: Vec<Comment> = self.store.rows("SELECT uid,account,parent,body,gif,created_at,revision,deleted, count(SELECT id FROM comment_like WHERE comment=$parent.uid) AS likes, array::len(SELECT id FROM comment_like WHERE comment=$parent.uid AND account=$account)>0 AS liked FROM chapter_comment WHERE work=$work AND chapter=$chapter ORDER BY created_at ASC, uid ASC LIMIT 500", json!({"work":work,"chapter":chapter,"account":account.unwrap_or("")})).await?;
        let account_ids: Vec<&str> = rows.iter().map(|r| r.account.as_str()).collect();
        let users: Vec<artismaga_db::Account> = self
            .store
            .rows(
                "SELECT * FROM account WHERE uid IN $accounts",
                json!({"accounts":account_ids}),
            )
            .await?;
        let groups: Vec<artismaga_core::PermissionGroup> = self
            .store
            .rows("SELECT * FROM permission_group", json!({}))
            .await?;
        for row in &mut rows {
            if let Some(user) = users.iter().find(|u| u.uid == row.account) {
                row.name = user.display_name.clone();
                row.avatar = artismaga_core::gravatar(&user.email);
                row.manager = groups.iter().filter(|g| g.key == user.group_key).any(|g| {
                    g.permissions
                        .contains(&artismaga_core::Permission::Administer)
                        || (user.email_verified
                            && g.permissions
                                .contains(&artismaga_core::Permission::ManageComments))
                });
                row.author = row.account == publication.author;
            }
            if row.deleted {
                row.body.clear();
                row.gif = None;
            }
        }
        Ok(rows)
    }
    pub async fn comment_command(
        &self,
        account: &str,
        work: &str,
        chapter: &str,
        input: Command,
        now: i64,
    ) -> Result<()> {
        input.validate()?;
        self.reader(work, chapter)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Chapter unavailable"))?;
        self.store.query(include_str!("community_write.surql"), json!({"account":account,"work":work,"chapter":chapter,"action":input.action,"uid":input.uid,"parent":input.parent,"body":input.body.trim(),"gif":input.gif,"revision":input.revision,"new_uid":format!("comment_{}",uuid::Uuid::new_v4()),"notification":format!("notice_{}",uuid::Uuid::new_v4()),"author_notification":format!("notice_{}",uuid::Uuid::new_v4()),"now":now})).await?;
        Ok(())
    }
    pub async fn notifications(&self, account: &str) -> Result<Vec<Value>> {
        self.store.rows("SELECT uid,work,chapter,comment,kind,created_at,read FROM notification WHERE account=$account AND work IN (SELECT VALUE work FROM work_publication) AND chapter IN (SELECT VALUE chapter FROM chapter_publication WHERE work=$parent.work) ORDER BY created_at DESC LIMIT 100",json!({"account":account})).await
    }
    pub async fn notification_command(
        &self,
        account: &str,
        uid: &str,
        dismiss: bool,
    ) -> Result<()> {
        ensure!(uid.len() <= 80, "Invalid notification");
        let sql = if dismiss {
            "DELETE notification WHERE account=$account AND uid=$uid"
        } else {
            "UPDATE notification SET read=true WHERE account=$account AND uid=$uid"
        };
        self.store
            .query(sql, json!({"account":account,"uid":uid}))
            .await?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_closed_comment_commands() {
        let mut c = Command {
            action: "create".into(),
            uid: String::new(),
            parent: None,
            body: "Hello **world**".into(),
            gif: None,
            revision: 0,
        };
        assert!(c.validate().is_ok());
        c.body = "x".repeat(4001);
        assert!(c.validate().is_err());
        c.body = " ".into();
        assert!(c.validate().is_err());
        c.body = "hello".into();
        c.gif = Some("https://evil.example/a.gif".into());
        assert!(c.validate().is_err());
        c.gif = None;
        c.action = "grant_admin".into();
        assert!(c.validate().is_err());
    }
}
