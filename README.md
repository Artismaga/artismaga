# Artismaga

A Rust foundation for a self-hosted fiction publishing platform. Rocket serves the
API and React-rendered HTML. The website uses strict TypeScript, modular React
components, Mantine, and a shared Material design system. SurrealDB stores accounts and
permissions on a private Docker network.

## Start your site

Install Docker with Compose, then run:

```sh
docker compose up --build -d
docker compose exec app artismaga setup-code
```

Open [your local site](http://localhost:8000). Enter the one-time setup code and
follow the visual wizard to name your site, choose registration policy, create
your administrator account, and configure optional email delivery. No `.env`,
database credentials, or configuration scripts are required.

Compose runs **two services**: the app and its private database. Only the website
port is published. The app starts, monitors, restarts after failure, and stops its
React renderer as a child process over private pipes; the renderer has no port.
Settings and database contents persist in separate named volumes.

The framework includes invitations, permission groups, Gravatar avatars, password
login, device-session revocation, email verification/recovery, profile editing,
persisted preferences, account export/deletion, and an administrator dashboard.
Studio now supports private Book drafts, optional artwork, collaboration, search and sorting.
Administrators manage custom roles, theme colours, default covers and private local/S3/R2 storage.
Guided publishing now exposes explicit public metadata/chapter-catalogue snapshots,
discovery shelves and genre/story pages. Chapter-body publication and the responsive
reader now support disclosures, progress sync, offline downloads and reactions/ratings;
see [reader progress](docs/reader_progress.md). Discovery includes measured Popular and Continue reading shelves.
Live operational analytics are available. The full scope remains in the [roadmap](docs/planned_features.md).

Email can be skipped for local exploration. Public HTTPS installations require
SMTP settings. See [setup and operations](docs/setup.md) for public hosting,
development, and preserving existing installations.

## Documentation

- [Architecture, crate ownership, and logic map](docs/architecture.md)
- [Setup, configuration, persistence, and operations](docs/setup.md)
- [API](docs/api.md), [security](docs/security.md), [testing](docs/testing.md)
- [Design system and UI guidelines](docs/design_system.md)
- [Account settings coverage](docs/account_settings.md)
- [Studio and storage operations](docs/studio_and_storage.md)
- [Chapters, taxonomy and content disclosures](docs/chapters_and_taxonomy.md)
- [Chapter editor, drafts and revision history](docs/chapter_editor.md)
- [Localisation and translation](docs/localisation.md)
- [Administration, identity and analytics](docs/administration.md)
- [Frontend module guide](web/README.md)
- [Reader and chapter publishing progress](docs/reader_progress.md)
- [Complete planned features](docs/planned_features.md)
- [Contributing](CONTRIBUTORS.md), [agent instructions](AGENTS.md)

Development requires Rust 1.93+ and Node 24+. First-party Rust forbids unsafe code.
Licensed under [AGPL-3.0](LICENSE).

Localisation ships five default locales, draft previews and explicit publication,
with a private app-managed local translation model. See [localisation](docs/localisation.md).
Administration separates identity/themes and scheduled announcements from platform
configuration, while [Site Analytics](docs/administration.md) has its own pages.
Historical story/billing analytics remain labelled placeholders.

Chapter comments, private in-site notifications and optional local English Kokoro.js speech are implemented as a bounded foundation; see [comments progress](docs/comments_progress.md) for limits and planned moderation work.
