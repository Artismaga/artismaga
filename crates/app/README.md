# artismaga

Executable composition, startup mode selection, installer/site handover, and service lifetime.

## Important logic

`src/main.rs`: saved/default config, schema checks, setup-code command, claim detection, installer listener handover, managed renderer and hourly cleanup.

## Boundaries

Assembles auth/config/db/setup/render/web/studio/storage. Domain rules and installation persistence live in their own crates. Binary/package name: artismaga.

Maintain this file and [the architecture map](../../docs/architecture.md) when
responsibilities, dependencies, or important logic move. Follow [AGENTS.md](../../AGENTS.md)
and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and
review of every LLM-assisted contribution.

The hourly cleanup task also retries queued private-artwork deletion through the
storage crate. Preserve storage.key and local media in the existing app-data volume;
cloud provider credentials never enter the renderer environment.

The hourly worker runs Studio chapter expiry/cover retirement before storage deletion retries. Expired chapters are inaccessible even if cleanup is delayed.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`src/main.rs` warms the configured translator in the background after installation,
stops its private child on shutdown, and runs hourly translation-cache expiry with
credential, chapter-archive and storage maintenance. Download/loading does not block
website availability; configuration can disable the local provider.

The existing hourly worker cleans expired reader deduplication rows and applies the administration abandonment policy through Studio, rechecking current story status/release and processing bounded batches.
