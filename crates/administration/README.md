# artismaga-administration

Site branding/colour/default-cover and registration configuration, role management, shared taxonomy, and a paginated public account directory.

## Important logic

`src/roles.rs`: revisioned role CRUD and immutable Administrator safeguards. `src/lib.rs`: `Administration::configuration/save/users`, optimistic revisions, branding/link validation and safe default registration groups.

## Boundaries

Depends on config/core/db. HTTP permission checks live in web; no analytics ingestion exists here. Future operational configuration belongs in this boundary when implemented.

Maintain this file and [the architecture map](../../docs/architecture.md) whenever responsibilities or important logic move. Follow [AGENTS.md](../../AGENTS.md) and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and review of LLM-assisted contributions.

`src/taxonomy.rs` owns revisioned genre/subgenre metadata, two-level validation,
predefined versus arbitrary tag policy and idempotent starter imports. The original
curated `data/tags.txt` contains 1,390 unique fiction tags; `seed_genres` defines
starter genres/subgenres. Image references are sanitized storage assets; HTTP
administrator authorization stays in web. Defaults never replace saved edits.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`identity.rs` validates per-theme options/availability and public social links.
`announcements.rs` owns revisioned notice/promotion history, URL/schedule/audience
validation and immutable creator attribution. It does not infer billing membership:
callers must supply a trusted subscription state when that subsystem exists.

Promotion validation permits empty title, summary and CTA text for image-only
links, while retaining mandatory uploaded artwork and a safe destination URL.
Notice titles remain mandatory; audience, schedule and initiator invariants apply.

SiteConfiguration.auto_abandon_after_months is nullable and disabled by default; configured values are 1–120 additional calendar months after the four-month warning. The app worker executes the Studio-owned transition rule.
