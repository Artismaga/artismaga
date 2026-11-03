//! Deduplicated daily reading measurements and public feedback aggregates.
use crate::{Actor, Studio};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Feedback {
    pub ratings: u64,
    pub rating_sum: u64,
    pub reactions: BTreeMap<String, u64>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Counts {
    pub views: u64,
    pub completions: u64,
}
#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Stats {
    pub chapter: String,
    #[serde(flatten)]
    pub counts: Counts,
    #[serde(flatten)]
    pub feedback: Feedback,
}
#[derive(Deserialize, Serialize)]
pub struct Day {
    pub day: i64,
    pub views: u64,
    pub completions: u64,
}
#[derive(Serialize)]
pub struct Analytics {
    pub chapters: Vec<Stats>,
    pub days: Vec<Day>,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Continue {
    pub work: String,
    pub chapter: String,
    pub position: f64,
    pub updated_at: i64,
}
impl Studio {
    pub async fn record_reading(
        &self,
        work: &str,
        chapter: &str,
        viewer: &str,
        position: f64,
        now: i64,
    ) -> Result<()> {
        ensure!(
            position.is_finite() && (0.0..=1.0).contains(&position) && viewer.len() == 64,
            "Invalid measurement"
        );
        let values = json!({"work":work,"chapter":chapter,"viewer":viewer,"day":now.div_euclid(86400),"complete":position>=0.95});
        for attempt in 0..3 {
            match self
                .store
                .query(include_str!("engagement_record.surql"), values.clone())
                .await
            {
                Ok(_) => return Ok(()),
                Err(error) if attempt == 2 => return Err(error),
                Err(_) => tokio::task::yield_now().await,
            }
        }
        anyhow::bail!("Measurement unavailable")
    }
    pub async fn chapter_stats(&self, work: &str) -> Result<Vec<Stats>> {
        #[derive(Deserialize)]
        struct FeedbackRow {
            chapter: String,
            value: Feedback,
        }
        #[derive(Deserialize)]
        struct CountRow {
            chapter: String,
            views: u64,
            completions: u64,
        }
        let counts:Vec<CountRow>=self.store.rows("SELECT chapter,math::sum(views) AS views,math::sum(completions) AS completions FROM chapter_metrics WHERE work=$work GROUP BY chapter",json!({"work":work})).await?;
        let feedback: Vec<FeedbackRow> = self
            .store
            .rows(
                "SELECT chapter,value FROM chapter_feedback WHERE work=$work",
                json!({"work":work}),
            )
            .await?;
        let mut stats: BTreeMap<String, Stats> = BTreeMap::new();
        for row in counts {
            stats.insert(
                row.chapter.clone(),
                Stats {
                    chapter: row.chapter,
                    counts: Counts {
                        views: row.views,
                        completions: row.completions,
                    },
                    ..Default::default()
                },
            );
        }
        for row in feedback {
            stats
                .entry(row.chapter.clone())
                .or_insert_with(|| Stats {
                    chapter: row.chapter,
                    ..Default::default()
                })
                .feedback = row.value;
        }
        Ok(stats.into_values().collect())
    }
    pub async fn studio_analytics(&self, actor: &Actor<'_>, work: &str) -> Result<Analytics> {
        self.get(actor, work, None).await?;
        let days=self.store.rows("SELECT day,math::sum(views) AS views,math::sum(completions) AS completions FROM chapter_metrics WHERE work=$work GROUP BY day ORDER BY day DESC LIMIT 90",json!({"work":work})).await?;
        Ok(Analytics {
            chapters: self.chapter_stats(work).await?,
            days,
        })
    }
    pub async fn continue_reading(&self, account: &str) -> Result<Vec<Continue>> {
        self.store.rows("SELECT work,chapter,value.position AS position,value.updated_at AS updated_at FROM reader_state WHERE account=$account ORDER BY value.updated_at DESC LIMIT 240",json!({"account":account})).await
    }
    pub async fn popular_scores(&self, works: &[String]) -> Result<BTreeMap<String, u64>> {
        #[derive(Deserialize)]
        struct Row {
            work: String,
            score: u64,
        }
        let rows:Vec<Row>=self.store.rows("SELECT work,math::sum(views+completions*2) AS score FROM chapter_metrics WHERE work IN $works GROUP BY work",json!({"works":works})).await?;
        let mut scores: BTreeMap<String, u64> =
            rows.into_iter().map(|r| (r.work, r.score)).collect();
        let ratings:Vec<Row>=self.store.rows("SELECT work,math::sum(value.rating_sum) AS score FROM chapter_feedback WHERE work IN $works GROUP BY work",json!({"works":works})).await?;
        for row in ratings {
            *scores.entry(row.work).or_default() += row.score;
        }
        Ok(scores)
    }
    pub async fn cleanup_reading(&self, now: i64) -> Result<()> {
        self.store
            .query(
                "DELETE chapter_visit WHERE day<$day",
                json!({"day":now.div_euclid(86400)-32}),
            )
            .await?;
        Ok(())
    }
}
