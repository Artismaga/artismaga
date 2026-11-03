//! Author-controlled public story status and optional abandonment policy.
use crate::{Actor, Studio};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Lifecycle {
    pub revision: i64,
    pub status: String,
    pub hiatus_until: Option<i64>,
}
impl Default for Lifecycle {
    fn default() -> Self {
        Self {
            revision: 0,
            status: "ongoing".into(),
            hiatus_until: None,
        }
    }
}
impl Lifecycle {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            (0..i64::MAX).contains(&self.revision)
                && ["ongoing", "hiatus", "abandoned", "completed"].contains(&self.status.as_str()),
            "Invalid story status"
        );
        ensure!(
            self.hiatus_until
                .is_none_or(|t| (0..=253402214400).contains(&t))
                && (self.status == "hiatus" || self.hiatus_until.is_none()),
            "Check hiatus date"
        );
        Ok(())
    }
}
pub fn after_months(timestamp: i64, months: u16) -> Option<i64> {
    let date = time::OffsetDateTime::from_unix_timestamp(timestamp).ok()?;
    let total = date.year() * 12 + i32::from(u8::from(date.month())) - 1 + i32::from(months);
    let year = total.div_euclid(12);
    let month = time::Month::try_from((total.rem_euclid(12) + 1) as u8).ok()?;
    let mut day = date.day();
    let target = loop {
        if let Ok(value) = time::Date::from_calendar_date(year, month, day) {
            break value;
        }
        day = day.checked_sub(1)?;
    };
    Some(target.with_time(date.time()).assume_utc().unix_timestamp())
}
impl Studio {
    pub async fn lifecycle(&self, work: &str) -> Result<Lifecycle> {
        let value: Option<Lifecycle> = self
            .store
            .rows(
                "SELECT VALUE value FROM story_lifecycle WHERE work=$work",
                json!({"work":work}),
            )
            .await?
            .pop();
        if let Some(value) = value {
            return Ok(value);
        }
        let status = self
            .publication(work)
            .await?
            .map(|p| {
                if p.status == "discontinued" {
                    "abandoned".into()
                } else {
                    p.status
                }
            })
            .unwrap_or_else(|| "ongoing".into());
        Ok(Lifecycle {
            status,
            ..Default::default()
        })
    }
    pub async fn save_lifecycle(
        &self,
        actor: &Actor<'_>,
        work: &str,
        value: Lifecycle,
        now: i64,
    ) -> Result<()> {
        value.validate()?;
        ensure!(
            actor.can_write && self.get(actor, work, None).await?.can_share,
            "Owner publishing access required"
        );
        self.store.query(include_str!("lifecycle_save.surql"),json!({"work":work,"actor":actor.uid,"admin":actor.administrator,"revision":value.revision,"value":value,"now":now})).await?;
        Ok(())
    }
    pub async fn transition_abandoned(&self, now: i64, months: Option<u16>) -> Result<()> {
        let Some(months) = months else {
            return Ok(());
        };
        ensure!((1..=120).contains(&months), "Invalid abandonment period");
        #[derive(Deserialize)]
        struct Candidate {
            uid: String,
            latest_chapter_release: i64,
        }
        let stories:Vec<Candidate>=self.store.rows("SELECT work AS uid,value.latest_chapter_release AS latest_chapter_release FROM work_publication WHERE value.status='ongoing' ORDER BY value.latest_chapter_release ASC LIMIT 100",json!({})).await?;
        for story in stories {
            if after_months(story.latest_chapter_release, 4 + months).is_some_and(|t| now > t) {
                self.store.query("BEGIN TRANSACTION; LET $p=(SELECT VALUE value FROM work_publication WHERE work=$work)[0]; IF $p.status='ongoing' AND $p.latest_chapter_release=$last { LET $life=(SELECT VALUE value FROM story_lifecycle WHERE work=$work)[0]; UPSERT type::record('story_lifecycle',$work) SET work=$work,value={revision:($life.revision ?? 0)+1,status:'abandoned',hiatus_until:NULL}; UPDATE work_publication SET value.status='abandoned',value.hiatus_until=NULL,value.updated_at=$now WHERE work=$work; UPDATE work SET revision+=1 WHERE uid=$work; }; COMMIT TRANSACTION;",json!({"work":story.uid,"last":story.latest_chapter_release,"now":now})).await?;
            }
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_and_calendar_are_bounded() {
        assert!(Lifecycle::default().validate().is_ok());
        assert!(
            Lifecycle {
                status: "ongoing".into(),
                hiatus_until: Some(2),
                ..Default::default()
            }
            .validate()
            .is_err()
        );
        let jan = time::Date::from_calendar_date(2024, time::Month::January, 31)
            .unwrap()
            .midnight()
            .assume_utc()
            .unix_timestamp();
        let feb = time::Date::from_calendar_date(2024, time::Month::February, 29)
            .unwrap()
            .midnight()
            .assume_utc()
            .unix_timestamp();
        assert_eq!(after_months(jan, 1), Some(feb));
    }
}
