//! Bounded aggregate operational telemetry. No IPs, user agents or reading history are retained.
use crate::{ApiResult, AppState, SignedIn, error};
use artismaga_core::Permission;
use rocket::{
    Request, Response, State,
    fairing::{Fairing, Info, Kind},
    http::Status,
    serde::json::Json,
};
use serde_json::json;
use std::{collections::VecDeque, sync::Mutex, time::Instant};
#[derive(Default)]
struct Counters {
    total: u64,
    errors: u64,
    logins: u64,
    registrations: u64,
    samples: VecDeque<(i64, u64, u64)>,
    cpu: Option<(Instant, u64)>,
}
pub struct Metrics {
    started: Instant,
    counters: Mutex<Counters>,
    ticks: f64,
}
impl Default for Metrics {
    fn default() -> Self {
        let ticks = std::process::Command::new("getconf")
            .arg("CLK_TCK")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|t| t.trim().parse::<f64>().ok())
            .filter(|n| *n > 0.0)
            .unwrap_or(100.0);
        Self {
            started: Instant::now(),
            counters: Mutex::new(Counters::default()),
            ticks,
        }
    }
}
impl Metrics {
    pub fn snapshot(&self) -> serde_json::Value {
        let mut c = self.counters.lock().unwrap_or_else(|p| p.into_inner());
        let now = Instant::now();
        let epoch = artismaga_auth::now();
        while c.samples.front().is_some_and(|s| s.0 < epoch - 900) {
            c.samples.pop_front();
        }
        let process = process_tree(std::process::id());
        let ticks = process.map(|p| p.0);
        let cpu = ticks.and_then(|ticks| {
            let previous = c.cpu.replace((now, ticks));
            previous.and_then(|(at, old)| {
                let secs = now.duration_since(at).as_secs_f64();
                (secs >= 0.1).then(|| 100.0 * ticks.saturating_sub(old) as f64 / self.ticks / secs)
            })
        });
        let memory = process.map(|p| p.1);
        let recent: Vec<_> = c.samples.iter().filter(|s| s.0 >= epoch - 60).collect();
        let minute = recent.iter().map(|s| s.1).sum::<u64>();
        let latency = recent.iter().map(|s| s.2).sum::<u64>();
        // Linux AMD exposes utilisation through sysfs. Other platforms report unavailable.
        let gpu = std::fs::read_dir("/sys/class/drm")
            .ok()
            .and_then(|entries| {
                entries.flatten().find_map(|e| {
                    std::fs::read_to_string(e.path().join("device/gpu_busy_percent"))
                        .ok()?
                        .trim()
                        .parse::<u32>()
                        .ok()
                })
            });
        json!({"uptime_seconds":self.started.elapsed().as_secs(),"requests":c.total,"errors":c.errors,"requests_last_minute":minute,"mean_response_ms":if minute>0 {Some(latency as f64/minute as f64/1000.0)}else{None},"logins":c.logins,"registrations":c.registrations,"cpu_percent":cpu,"memory_bytes":memory,"gpu_percent":gpu,"series":c.samples.iter().map(|s|json!({"at":s.0,"requests":s.1})).collect::<Vec<_>>(),"scope":"app_process_tree_since_start","sampled_at":epoch})
    }
}
pub struct Monitor;
#[rocket::async_trait]
impl Fairing for Monitor {
    fn info(&self) -> Info {
        Info {
            name: "Aggregate operational metrics",
            kind: Kind::Request | Kind::Response,
        }
    }
    async fn on_request(&self, request: &mut Request<'_>, _: &mut rocket::Data<'_>) {
        request.local_cache(Instant::now);
    }
    async fn on_response<'r>(&self, request: &'r Request<'_>, response: &mut Response<'r>) {
        let path = request.uri().path().as_str();
        if path.starts_with("/assets/")
            || path.starts_with("/health/")
            || path == "/api/analytics/live"
            || path == "/api/localisation/runtime"
        {
            return;
        }
        let Some(state) = request.rocket().state::<AppState>() else {
            return;
        };
        let mut c = state
            .metrics
            .counters
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        c.total += 1;
        if response.status().code >= 500 {
            c.errors += 1;
        }
        if response.status().code < 300 {
            if path == "/api/auth/login" {
                c.logins += 1;
            }
            if path == "/api/auth/register" {
                c.registrations += 1;
            }
        }
        let epoch = artismaga_auth::now();
        let elapsed = request
            .local_cache(Instant::now)
            .elapsed()
            .as_micros()
            .min(u64::MAX as u128) as u64;
        if let Some(last) = c.samples.back_mut().filter(|s| s.0 == epoch) {
            last.1 += 1;
            last.2 += elapsed;
        } else {
            c.samples.push_back((epoch, 1, elapsed));
        }
        while c.samples.len() > 900 {
            c.samples.pop_front();
        }
    }
}
#[rocket::get("/api/analytics/live")]
pub async fn live(user: SignedIn, state: &State<AppState>) -> ApiResult {
    if !state
        .auth
        .allowed(&user.0, Permission::ViewAnalytics)
        .await
        .map_err(crate::unavailable)?
    {
        return Err(error(Status::Forbidden, "Analytics permission required"));
    }
    let db = state.auth.signup_mode().await.is_ok();
    Ok(Json(
        json!({"metrics":state.metrics.snapshot(),"database_available":db,"translator":state.translator.local.status().await}),
    ))
}
#[rocket::get("/analytics")]
pub async fn page(
    user: SignedIn,
    state: &State<AppState>,
    jar: &rocket::http::CookieJar<'_>,
) -> Result<crate::pages::PageResponse, Status> {
    section(user, state, jar, "performance").await
}
#[rocket::get("/analytics/<tab>")]
pub async fn section(
    user: SignedIn,
    state: &State<AppState>,
    jar: &rocket::http::CookieJar<'_>,
    tab: &str,
) -> Result<crate::pages::PageResponse, Status> {
    if !state
        .auth
        .allowed(&user.0, Permission::ViewAnalytics)
        .await
        .map_err(|_| Status::ServiceUnavailable)?
    {
        return Err(Status::Forbidden);
    }
    if ![
        "performance",
        "traffic",
        "accounts",
        "stories",
        "genres",
        "tags",
        "monetisation",
        "retention",
        "discovery",
        "community",
    ]
    .contains(&tab)
    {
        return Err(Status::NotFound);
    }
    crate::pages::render_tab(state, jar, "analytics", tab, None).await
}

// Safe /proc reads include app-owned renderer/model children, without libc/unsafe code.
fn process_tree(root: u32) -> Option<(u64, u64)> {
    let mut pending = vec![root];
    let mut seen = std::collections::BTreeSet::new();
    let (mut ticks, mut memory) = (0u64, 0u64);
    while let Some(pid) = pending.pop() {
        if seen.len() >= 64 || !seen.insert(pid) {
            continue;
        }
        let path = format!("/proc/{pid}");
        let Some(stat) = std::fs::read_to_string(format!("{path}/stat")).ok() else {
            if pid == root {
                return None;
            }
            continue;
        };
        let (_, tail) = stat.rsplit_once(") ")?;
        let fields: Vec<_> = tail.split_whitespace().collect();
        ticks = ticks
            .saturating_add(fields.get(11)?.parse::<u64>().ok()?)
            .saturating_add(fields.get(12)?.parse::<u64>().ok()?);
        if let Ok(status) = std::fs::read_to_string(format!("{path}/status")) {
            memory = memory.saturating_add(
                status
                    .lines()
                    .find(|l| l.starts_with("VmRSS:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(0)
                    .saturating_mul(1024),
            );
        }
        if let Ok(tasks) = std::fs::read_dir(format!("{path}/task")) {
            for task in tasks.flatten().take(256) {
                if let Ok(children) = std::fs::read_to_string(task.path().join("children")) {
                    pending.extend(
                        children
                            .split_whitespace()
                            .filter_map(|s| s.parse::<u32>().ok())
                            .take(64),
                    );
                }
            }
        }
    }
    Some((ticks, memory))
}
