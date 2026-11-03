//! App composition and installation handover. Rocket owns the managed React child's lifetime.
use anyhow::{Context, Result, bail, ensure};
use artismaga_auth::Auth;
use artismaga_config::{Config, config_path, data_dir};
use artismaga_db::Store;
use artismaga_render::PageRenderer;
use artismaga_setup::{Installer, claimed};
use artismaga_web::{AppState, installation::SetupState};

#[rocket::main]
async fn main() -> Result<()> {
    let command = std::env::args().nth(1);
    let code_path = data_dir().join("setup-code");
    if command.as_deref() == Some("setup-code") {
        let code=std::fs::read_to_string(&code_path).context("Setup code unavailable. Wait for the app to start; completed sites cannot be set up again.")?;
        println!("{}", code.trim());
        return Ok(());
    }
    let path = config_path();
    let saved = path.try_exists()?;
    let mut config = if saved {
        Config::load(&path)?
    } else {
        Config::bootstrap()
    };
    let store = Store::new(config.database.clone())?;
    store
        .migrate()
        .await
        .context("Could not initialize the private SurrealDB instance")?;
    let mut auth = Auth::new(store.clone(), config.clone())?;
    let installed = claimed(&auth).await?;
    ensure!(
        !installed || saved,
        "Existing accounts were found without their configuration. Restore the app data volume or set ARTISMAGA_CONFIG to the previous configuration; setup will not overwrite an existing site."
    );
    match command.as_deref() {
        Some("migrate") => {
            println!("Database schema is up to date");
            return Ok(());
        }
        Some("cleanup") => {
            auth.cleanup().await?;
            return Ok(());
        }
        None | Some("serve") => {}
        _ => bail!("Use serve, setup-code, migrate or cleanup"),
    }
    let renderer = PageRenderer::new(&config)?;
    // Fail startup with a clear diagnostic if the shipped renderer build/runtime is missing.
    renderer
        .page(
            if installed { "home" } else { "setup" },
            None,
            artismaga_core::SignupMode::Disabled,
            false,
        )
        .await?;
    if !installed {
        let installer = Installer::new(auth.clone(), config.clone(), path.clone(), &code_path)?;
        println!(
            "Open the website to finish setup. Retrieve its private code with: docker compose exec app artismaga setup-code"
        );
        let result =
            artismaga_web::installation::build(SetupState::new(installer, renderer.clone()))
                .launch()
                .await;
        if let Err(error) = result {
            renderer.shutdown().await;
            return Err(error.into());
        }
        if !claimed(&auth).await? {
            renderer.shutdown().await;
            return Ok(());
        }
        config = Config::load(&path)?;
        auth = Auth::new(store, config.clone())?;
    }
    // Also remove a stale claim code after recovery from a post-commit crash.
    let _ = std::fs::remove_file(&code_path);
    let background = auth.clone();
    let storage_cleanup = artismaga_storage::Storage::new(auth.store.clone(), data_dir());
    let cache_cleanup =
        artismaga_localisation::translation::Translator::new(background.store.clone(), data_dir());
    let lifecycle_config = config.clone();
    let cleanup = rocket::tokio::spawn(async move {
        let mut interval = rocket::tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            let _ = artismaga_studio::Studio::new(background.store.clone())
                .purge_chapters(artismaga_auth::now())
                .await;
            let studio = artismaga_studio::Studio::new(background.store.clone());
            let _ = studio.cleanup_reading(artismaga_auth::now()).await;
            if let Ok(settings) = artismaga_administration::Administration::new(
                background.store.clone(),
                &lifecycle_config,
            )
            .configuration()
            .await
            {
                let _ = studio
                    .transition_abandoned(
                        artismaga_auth::now(),
                        settings.configuration.auto_abandon_after_months,
                    )
                    .await;
            }
            let _ = storage_cleanup.cleanup().await;
            let _ = cache_cleanup.cleanup(artismaga_auth::now()).await;
            if background.cleanup().await.is_err() {
                eprintln!("Expired credential cleanup failed; will retry");
            }
        }
    });
    let state = AppState::new(auth, config.clone(), renderer.with_site(&config));
    let translator = state.translator.clone();
    let warmup = translator.clone();
    let translation_task = rocket::tokio::spawn(async move {
        let _ = warmup.prepare().await;
    });
    let result = artismaga_web::build(state).launch().await;
    translation_task.abort();
    translator.local.stop().await;
    cleanup.abort();
    renderer.shutdown().await;
    result?;
    Ok(())
}
