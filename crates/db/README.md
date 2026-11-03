# artismaga-db

SurrealDB connection protocol, schema, account persistence shapes, and bound query execution.

## Important logic

`src/lib.rs`: `Store`, `query`, `rows`, `migrate`, account lookups; `src/schema.surql`: schema/indexes/seed invariants; `src/installation.surql`: additive claim-marker schema; `src/account_settings.surql`: additive profile/preferences/site configuration and session metadata schema; `src/studio.surql`: additive work/share/access, media/provider/deletion queue and role revision schema; `src/queries.rs` and `src/queries/`: fixed account/admin transactions, including atomic first-owner installation, revision-checked settings, password/email changes, last-administrator protection and deletion.

## Boundaries

Depends on core/config and reqwest. All request values are bound separately from SQL; authentication policy belongs in auth.

Maintain this file and [the workspace architecture map](../../docs/architecture.md)
when responsibilities, dependencies, or important logic locations change. Follow
[AGENTS.md](../../AGENTS.md) and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including
human understanding and review of all LLM-assisted contributions.

Studio, storage and role transactions live in `queries/studio_*.surql`,
`save_storage.surql`, `save_role.surql` and `delete_role.surql`. Deletion also queues
private blobs and clears cross-work references. Seed/migrate never overwrite role
permissions or existing provider/branding settings.

`creative.surql` adds revisioned work details, taxonomy and chapter-cover retirement jobs. Studio owns the associated fixed SQL in its module directory.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`localisation.surql` stores registry overrides, translation policy/cache and work
language grants/approvals. `announcements.surql` stores revisioned announcement
history; creator and creation time are preserved by administration transactions.
Both are applied from `Store::migrate` after the Studio/creative schema.

`Store::query` binds one encoded JSON document, decodes its values with the
SurrealDB 3.1+ JSON codec and validates parameter identifiers before binding them.
This preserves arbitrary localisation/user strings such as `Label:chapter.1`.
Adapter-generated statement results are removed before returning domain results;
errors from every statement remain checked. Never interpolate request values.

`src/writing.surql` adds private chapter_draft and immutable chapter_revision tables,
with unique work/chapter/revision identities. Studio owns their fixed save/purge
transactions. Account deletion removes owned manuscripts and clears editor names
on retained collaborative revisions. No table grants database-client permissions.

`publishing.surql` adds the private-access `work_publication` table and unique work
index for explicitly public catalogue snapshots. Publishing transactions live in
Studio; account deletion removes owned snapshots and those using removed artwork.

`reader.surql` adds public chapter snapshots, private per-account reader state and site reaction configuration. Transactions are maintained by Studio. Account deletion removes reading history and owned body snapshots while preserving site reaction artwork.

`engagement.surql` adds daily aggregates, 32-day pseudonymous deduplication rows, current feedback and lifecycle records, plus a one-time prior-feedback backfill. Account deletion subtracts current choices and clears own reports/owned aggregates.

Additive `community.surql` defines private comments, likes, mutes, inbox entries and GIF-provider records. Account deletion clears community data while retaining empty reply tombstones.
