# Setup and operations

## Visual first-time setup

The only prerequisite is Docker with Compose:

```sh
docker compose up --build -d
docker compose exec app artismaga setup-code
```

Open http://localhost:8000. The site redirects to a four-step setup wizard:

1. Enter the private setup code, choose a site name/address, and set registration
   to open, invitation-only, or disabled.
2. Create the first administrator with a display name, email, and a unique password
   of 15–128 characters. Confirm the password.
3. Optionally configure SMTP. Local HTTP exploration may skip email; a public HTTPS
   site must configure verification/recovery delivery.
4. Review the non-secret settings and create the site. The app saves configuration,
   claims installation and creates the administrator atomically in SurrealDB, then
   hands the same website port to the configured site. Sign in when redirected.

The code is generated automatically, stored privately in the app data volume, and
shown only by the explicit `setup-code` command. It is not in startup logs, HTML,
URLs, or a default password. This prevents the first visitor to a new public site
from claiming ownership. Wait for app startup before retrieving the code. Once
configured, setup routes are absent and the code file is removed. Restarting the
app does not reopen setup.

No `.env`, `SURREAL_USER`, `SURREAL_PASS`, renderer token, Python setup script, or
host-side configuration file is required. Compose has two services: `app` and
`database`. Only `127.0.0.1:8000` is published. SurrealDB is on an `internal` Docker
network shared with the app; it has no published port or external network access.
The app also has an outbound network for configured email providers.

Fresh-volume ownership is baked into both images, so both services run as non-root
without a separate initialization service. The renderer runs inside the app container,
uses private stdin/stdout pipes, and has no network listener or separate service.

## Persistence and interrupted setup

- `app-data`: generated configuration, one-time setup code before installation,
  and the installation file lock. The config is `/app/data/config.toml` (mode 0600).
- `database`: persistent SurrealDB data, including accounts, groups, signup policy,
  and the installation-completed marker.

Configuration is staged through an atomic private file write before the database
installation transaction. If interrupted before the transaction, the same setup
code can retry. If interrupted after it, the next startup reads the saved settings
and launches the configured site. The transaction rejects repeat claims and existing
administrators; file locking also serializes installers writing the same settings.

Back up **both volumes together**. If accounts exist but app configuration is missing,
the app refuses to offer setup and asks for restored configuration. It never silently
creates a replacement administrator. Removing only the app volume is not a reset.

## Email and public hosting

Use a TLS reverse proxy in front of the app. Keep the database network internal and
publish only the app port to that proxy. Set the exact external HTTPS origin in the
wizard, with no trailing slash/path, and preserve the original `Host` and `Origin`
headers. Forwarded headers are not trusted for installation authorization or rate
limiting. Restrict access to the initial installer until you can enter its code.
Enable HSTS and appropriate request/rate limits at the proxy.

The initial email adapter supports authenticated implicit TLS on port 465. Supply
its SMTP hostname, username, password, and sender email in the wizard. The installer
validates settings but does not claim to have tested actual delivery. Test verification
and recovery with an account you control before inviting readers. STARTTLS/alternate
ports, other providers, and durable email queues remain future work.

Local exploration can omit SMTP. New readers then cannot verify their email or
recover passwords until delivery is configured; the explicitly created site owner
is verified. Operator changes after setup currently use the saved configuration:
edit a protected copy, then copy it into the app container and restart. Treat SMTP
credentials as secrets. No email secret is returned through an API or SSR props.

## Configuration and development

`config/example.toml` documents persisted settings. Optional `database.username`
and `database.password` support separately managed authenticated databases. The
bundled database intentionally uses unauthenticated mode behind its private network;
never publish its port or attach untrusted containers to that network.

Environment options:

| Variable | Purpose |
| --- | --- |
| `ARTISMAGA_DATA_DIR` | App state directory; defaults to `data`, `/app/data` in Docker |
| `ARTISMAGA_CONFIG` | Override saved configuration path |
| `ARTISMAGA_DATABASE_URL` | Initial database endpoint before setup; defaults to `http://database:8000` |
| `ARTISMAGA_NODE` | Node executable for the managed renderer; defaults to `node` |
| `ARTISMAGA_RENDERER_SCRIPT` | Built worker path; set by the image |
| `ROCKET_ADDRESS`, `ROCKET_PORT` | App listener; Compose publishes port 8000 on loopback |

For local source work, run `npm --prefix web ci` and `npm --prefix web run build`
before Rust checks because Rocket embeds the built browser bundle. Then use
`cargo run -p artismaga` with an accessible independently managed SurrealDB endpoint,
or rebuild the app container. The default Compose database stays private throughout
normal development. Database integration tests run inside its network (testing.md),
not through host port forwarding. Do not add a database port mapping as a workaround.

Node 24+ must be installed for a source-run app. Rocket starts the compiled worker
and reuses it across requests. The child inherits only PATH, receives public page
props over bounded pipes, is restarted on the next request after failure, and is
killed/reaped on shutdown. There is no separate renderer start command.

## Existing installations from the initial framework

Back up the old database volume and configuration before switching layouts. Compose
preserves the `database` volume name and `platform.db` contents while mounting them
at `/artismaga-data`. The old `.env` is no longer consumed by this Compose file.

Move the existing configuration into the new app-data volume as `config.toml`, or
mount it privately and set `ARTISMAGA_CONFIG`. Remove the obsolete `[renderer]`
section, update `[database].url` to `http://database:8000`, and omit username/password
when using the bundled private database. Preserve site/email settings and secure
file ownership. Existing administrators close setup even without the new marker.
Do not delete data or run the installer to migrate ownership.

## Operations and troubleshooting

- Start/stop: `docker compose up -d` / `docker compose stop`.
- Logs: `docker compose logs --tail=100 app` (no request bodies or credential values).
- Health: `/health/live`; `/health/ready` returns `setup_required` during installation
  and `ready` on the configured site. Both check the database and actual SSR.
- Schema/cleanup: `docker compose exec app artismaga migrate` / `... cleanup`.
- Setup rejected: check the code and exact Host/Origin, password length, website
  URL, and SMTP requirements. Repeat claims are refused.
- Rendering unavailable: ensure Node and the built worker are shipped; the app
  logs a startup diagnostic. A failed worker causes 503 and restarts on the next render.
- Missing configuration with existing accounts: restore the app-data backup.

Stopping containers preserves volumes. Never use `docker compose down --volumes`
unless intentionally deleting the entire installation. Use authenticated export
through application/container tooling or a consistent offline volume backup; never
publish SurrealDB to run a backup tool. Encrypt backups and practice restoration
in an isolated stack. Automated backup/restore and general schema upgrades remain planned.

## Artwork and cloud storage

After setup, open the account menu → Site administration → Storage. Local Disk
uses the existing app-data volume; no additional Compose service is needed. AWS S3
and Cloudflare R2 settings accept write-only bucket credentials and retain existing
locations when changing providers. Back up `storage.key`, local media and database
contents together. Saving cloud settings does not perform a connectivity test.
See [Studio and storage](studio_and_storage.md) before changing locations or rotating keys.

The app's default local translator downloads approximately 2.5 GB of pinned model
weights into persistent app data and starts its own private CPU inference child.
Allow additional RAM and disk space. See `localisation.md` for the selected model,
checksums, source references, opt-out and native runtime setup. The installer language
selector and the site's language selector support English, Japanese, Chinese,
Spanish and French. Translation-provider keys can only be replaced after saving.

## Reader storage

The additive reader schema is applied with normal startup migration. Existing public catalogues need explicit republishing to release saved bodies. Offline downloads require HTTPS or localhost and browser storage/service workers. Backups include chapter_publication, reader_state and reaction_configuration database records; browser downloads are separate device data. See reader_progress.md.

The additive engagement migration backfills existing current ratings/reactions once. The existing hourly app worker expires 32-day deduplication rows and applies optional automatic abandonment; no extra service or public port is added.

## Speech and GIFs

The web build bundles a dedicated Kokoro.js worker and its pinned ONNX WASM runtime.
English readers with WebGPU, at least four logical processors and (when reported)
at least 4 GB device memory try local speech. Data-saving connections skip it.
The first play downloads the immutable Kokoro model from Hugging Face. Other devices,
unsupported languages and failures use available browser voices. Browser speech may
use its vendor's network voice if a matching local voice is unavailable.

Configure a KLIPY API key in Administration → Comments. It remains write-only and
is encrypted with storage.key; include that key in backups. An empty key disables
search. Development may explicitly opt into the ignored config/dev.toml key using
ARTISMAGA_DEV_CONFIG=config/dev.toml. Do not copy development keys into images.
