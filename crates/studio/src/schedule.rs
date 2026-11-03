//! Expected-release metadata, not an automatic publication job.
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReleaseSchedule {
    pub frequency: Frequency,
    pub hour: u8,
    pub weekday: Option<u8>,
    pub month_day: Option<u8>,
    pub timezone: String,
}
impl ReleaseSchedule {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.hour < 24
                && !self.timezone.is_empty()
                && self.timezone.len() <= 80
                && self
                    .timezone
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '+' | '-')),
            "Invalid expected release time"
        );
        ensure!(
            include_str!("timezones.txt")
                .lines()
                .any(|zone| zone == self.timezone),
            "Choose a supported IANA time zone"
        );
        ensure!(
            match self.frequency {
                Frequency::Daily => self.weekday.is_none() && self.month_day.is_none(),
                Frequency::Weekly =>
                    self.weekday.is_some_and(|d| d < 7) && self.month_day.is_none(),
                Frequency::Monthly =>
                    self.month_day.is_some_and(|d| (1..=31).contains(&d)) && self.weekday.is_none(),
            },
            "Invalid release recurrence"
        );
        Ok(())
    }
}
/// Old free-text values remain in storage until republishing, but are not treated as recurrence rules.
pub fn read_legacy<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> std::result::Result<Option<ReleaseSchedule>, D::Error> {
    let value = serde_json::Value::deserialize(d)?;
    if value.is_string() || value.is_null() {
        return Ok(None);
    }
    serde_json::from_value(value)
        .map(Some)
        .map_err(serde::de::Error::custom)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recurrence_rejects_unknown_zones_and_invalid_calendar_fields() {
        let mut schedule = ReleaseSchedule {
            frequency: Frequency::Weekly,
            hour: 12,
            weekday: Some(1),
            month_day: None,
            timezone: "Australia/Sydney".into(),
        };
        assert!(schedule.validate().is_ok());
        schedule.timezone = "Imaginary/City".into();
        assert!(schedule.validate().is_err());
        schedule.timezone = "UTC".into();
        schedule.weekday = Some(7);
        assert!(schedule.validate().is_err());
        schedule.frequency = Frequency::Monthly;
        schedule.weekday = None;
        schedule.month_day = Some(31);
        assert!(schedule.validate().is_ok());
        schedule.month_day = Some(32);
        assert!(schedule.validate().is_err());
    }
}
