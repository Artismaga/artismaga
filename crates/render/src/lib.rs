//! Managed React child process. Private bounded JSON-lines pipes replace a renderer service.
use anyhow::{Context, Result, bail, ensure};
use artismaga_config::Config;
use artismaga_core::{PublicUser, SignupMode};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

const MAX_FRAME: u64 = 8_388_608;
#[derive(Clone)]
pub struct PageRenderer {
    shared: Arc<Mutex<Option<Worker>>>,
    site_name: String,
    script: PathBuf,
    executable: PathBuf,
}
struct Worker {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}
#[derive(Deserialize)]
struct Reply {
    html: String,
}
impl PageRenderer {
    pub fn new(config: &Config) -> Result<Self> {
        let script = std::env::var_os("ARTISMAGA_RENDERER_SCRIPT")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../web/dist/server/worker.js")
            });
        let executable = std::env::var_os("ARTISMAGA_NODE")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("node"));
        Ok(Self {
            shared: Arc::new(Mutex::new(None)),
            site_name: config.site_name.clone(),
            script,
            executable,
        })
    }
    pub fn with_site(&self, config: &Config) -> Self {
        Self {
            site_name: config.site_name.clone(),
            ..self.clone()
        }
    }
    pub async fn page(
        &self,
        page: &str,
        user: Option<PublicUser>,
        signup_mode: SignupMode,
        mail_enabled: bool,
    ) -> Result<String> {
        self.page_data(page, user, signup_mode, mail_enabled, json!({}))
            .await
    }
    pub async fn page_data(
        &self,
        page: &str,
        user: Option<PublicUser>,
        signup_mode: SignupMode,
        mail_enabled: bool,
        extra: Value,
    ) -> Result<String> {
        let mut request = json!({"page":page,"user":user,"siteName":self.site_name,"signupMode":signup_mode,"mailEnabled":mail_enabled,"styleNonce":"render-worker-internal-styles"});
        if let Some(extra) = extra.as_object() {
            for (key, value) in extra {
                request[key] = value.clone();
            }
        }

        // A short lock timeout bounds queueing, without killing a worker serving another request.
        let mut slot = tokio::time::timeout(Duration::from_secs(5), self.shared.lock())
            .await
            .context("Renderer queue timeout")?;
        let result = tokio::time::timeout(Duration::from_secs(5), async {
            if slot.is_none() {
                *slot = Some(self.spawn().await?);
            }
            let worker = slot.as_mut().context("Renderer unavailable")?;
            let mut frame = serde_json::to_vec(&request)?;
            ensure!(frame.len() <= 2_097_152, "Page data too large");
            frame.push(b'\n');
            worker.input.write_all(&frame).await?;
            worker.input.flush().await?;
            let reply = read_frame(&mut worker.output).await?;
            let reply: Reply =
                serde_json::from_slice(&reply).context("Renderer rejected page data")?;
            Ok(reply.html)
        })
        .await;
        match result {
            Ok(Ok(html)) => Ok(html),
            failure => {
                // Drop kills the child even if timeout interrupted a partially received frame.
                if let Some(mut worker) = slot.take() {
                    let _ = worker.child.kill().await;
                    let _ = worker.child.wait().await;
                }
                match failure {
                    Ok(Err(error)) => Err(error),
                    Err(_) => bail!("Renderer timed out"),
                    Ok(Ok(_)) => unreachable!(),
                }
            }
        }
    }
    async fn spawn(&self) -> Result<Worker> {
        let mut child = Command::new(&self.executable).arg(&self.script)
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit())
            .env_clear()
            .env("PATH",std::env::var_os("PATH").unwrap_or_default()).kill_on_drop(true).spawn().context("Cannot start React renderer; run npm --prefix web ci and npm --prefix web run build, and install Node 24+")?;
        let input = child.stdin.take().context("Missing renderer input")?;
        let output = BufReader::new(child.stdout.take().context("Missing renderer output")?);
        let mut worker = Worker {
            child,
            input,
            output,
        };
        let ready: Value = serde_json::from_slice(&read_frame(&mut worker.output).await?)?;
        ensure!(ready == json!({"ready":true}), "Renderer startup failed");
        Ok(worker)
    }
    pub async fn shutdown(&self) {
        if let Some(mut worker) = self.shared.lock().await.take() {
            let _ = worker.child.kill().await;
            let _ = worker.child.wait().await;
        }
    }
}
async fn read_frame(output: &mut BufReader<ChildStdout>) -> Result<Vec<u8>> {
    let mut frame = Vec::new();
    output
        .take(MAX_FRAME + 1)
        .read_until(b'\n', &mut frame)
        .await?;
    ensure!(
        !frame.is_empty() && frame.len() as u64 <= MAX_FRAME && frame.last() == Some(&b'\n'),
        "Renderer protocol closed or exceeded response limit"
    );
    Ok(frame)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn child_is_started_restarted_and_reaped_by_the_app() {
        let renderer = PageRenderer::new(&Config::bootstrap()).unwrap();
        let html = renderer
            .page("home", None, SignupMode::Invitation, false)
            .await
            .unwrap();
        assert!(!html.contains(">Featured / recommended stories<"));
        assert!(html.contains(">Popular<"));
        {
            let mut slot = renderer.shared.lock().await;
            slot.as_mut().unwrap().child.kill().await.unwrap();
        }
        assert!(
            renderer
                .page("home", None, SignupMode::Invitation, false)
                .await
                .is_err()
        );
        assert!(renderer.shared.lock().await.is_none());
        assert!(
            renderer
                .page("setup", None, SignupMode::Disabled, false)
                .await
                .unwrap()
                .contains("setup-form")
        );
        renderer.shutdown().await;
        assert!(renderer.shared.lock().await.is_none());
    }
}
