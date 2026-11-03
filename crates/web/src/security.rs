//! Shared bounded direct-peer throttling. Forwarding headers are deliberately ignored.
use rocket::http::Status;
use std::{
    collections::HashMap,
    net::IpAddr,
    sync::Mutex,
    time::{Duration, Instant},
};
#[derive(Default)]
pub(crate) struct RateLimiter(Mutex<HashMap<IpAddr, (Instant, u32)>>);
impl RateLimiter {
    pub(crate) fn check(&self, ip: IpAddr) -> Result<(), Status> {
        let mut entries = self.0.lock().map_err(|_| Status::ServiceUnavailable)?;
        entries.retain(|_, (start, _)| start.elapsed() < Duration::from_secs(900));
        if entries.len() >= 10000 && !entries.contains_key(&ip) {
            return Err(Status::TooManyRequests);
        }
        let entry = entries.entry(ip).or_insert((Instant::now(), 0));
        if entry.1 >= 30 {
            return Err(Status::TooManyRequests);
        }
        entry.1 += 1;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_attempts_are_limited_per_peer() {
        let limiter = RateLimiter::default();
        let ip = "127.0.0.1".parse().unwrap();
        for _ in 0..30 {
            limiter.check(ip).unwrap();
        }
        assert_eq!(limiter.check(ip), Err(Status::TooManyRequests));
        limiter.check("127.0.0.2".parse().unwrap()).unwrap();
    }
}

/// Authenticated writing traffic must not consume the deliberately low login budget.
#[derive(Default)]
pub(crate) struct WritingRateLimiter(Mutex<HashMap<String, (Instant, u32)>>);
impl WritingRateLimiter {
    pub(crate) fn check(&self, uid: &str) -> Result<(), Status> {
        let mut entries = self.0.lock().map_err(|_| Status::ServiceUnavailable)?;
        entries.retain(|_, (start, _)| start.elapsed() < Duration::from_secs(60));
        if entries.len() >= 10000 && !entries.contains_key(uid) {
            return Err(Status::TooManyRequests);
        }
        let entry = entries.entry(uid.to_owned()).or_insert((Instant::now(), 0));
        if entry.1 >= 120 {
            return Err(Status::TooManyRequests);
        }
        entry.1 += 1;
        Ok(())
    }
}
#[cfg(test)]
mod writing_tests {
    use super::*;
    #[test]
    fn writing_is_bounded_per_account_and_separate_from_login() {
        let writing = WritingRateLimiter::default();
        let login = RateLimiter::default();
        for _ in 0..120 {
            writing.check("author").unwrap();
        }
        assert_eq!(writing.check("author"), Err(Status::TooManyRequests));
        writing.check("another_author").unwrap();
        login.check("127.0.0.1".parse().unwrap()).unwrap();
    }
}
