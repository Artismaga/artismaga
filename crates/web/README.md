# artismaga-web

Configured-site and installation HTTP surfaces, request security, and generated asset serving.

## Important logic

`src/lib.rs`: normal account/admin/page routes and security headers; `src/installation.rs`: setup-only server, guards, completion/handover; `src/security.rs`: bounded peer limiter; `src/pages.rs`: scoped SSR DTOs and nonce CSP; `src/account.rs`: own settings, session, export and deletion routes; `src/administration.rs`: authorized configuration/roles/storage/directory routes; `src/studio.rs`: work routing, upload slots/body timeout, palette/default artwork DTOs and private media; `tests/settings.rs`: live settings/privacy/conflict coverage; `tests/studio.rs`: role revocation, local storage, private sharing/artwork, optional defaults and export/deletion.

## Boundaries

Depends on accounts/administration/auth/config/core/db/render/setup/storage/studio. Delegates installation/account rules; no cryptography in handlers. Configured builds never mount setup APIs.

Maintain this file and [the architecture map](../../docs/architecture.md) when
responsibilities, dependencies, or important logic move. Follow [AGENTS.md](../../AGENTS.md)
and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and
review of every LLM-assisted contribution.

`src/vocabulary.rs` owns bounded authenticated suggestions, public-work/author
visibility and taxonomy transport. `src/studio.rs` also serves revisioned chapter
commands and public-name collaborator lookup. `tests/creative.rs` covers hierarchy,
archive expiry/recovery, sharing rollback/revocation, taxonomy policy and SSR.
Owner export includes work configuration; deletion clears chapter-cover references.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`analytics.rs` owns permission-protected, bounded operational metrics and the
separate analytics routes. `administration.rs` exposes announcement and identity
APIs; `pages.rs` filters announcement audiences and localisation drafts before SSR.
`studio.rs` checks announcement-media visibility as well as work-media permissions.

Chapter writing routes in `src/studio.rs` authorize private SSR, draft reads/saves,
revision history and restoration using Studio. DTOs never expose arbitrary database
records/errors. `src/account.rs` includes owned chapter drafts and checkpoints in
account export format 4. Browser editing is under web/src/editor and
web/src/pages/studio/ChapterEditor.tsx; see docs/chapter_editor.md.

`discovery.rs` serves public genre/story pages and guarded publish/unpublish,
admin featuring and own-account recommendation exclusions. `pages.rs` reads only
public snapshots and filters discovery summaries by private content preferences.
`studio.rs` permits media reads only while referenced by a current public snapshot
or another existing authorized/public owner. The reader remains planned.

`discovery::genre_art` serves twelve embedded anime-style default genre backgrounds
from a closed filename list under `/assets/genres/`. Exact prompts and provenance
are recorded beside the assets. Discovery DTOs include public genre image palettes
for readable compact buttons; private storage/provider records remain excluded.

`reader.rs` owns public reader pages, authenticated state/feedback, chapter publication, administrator reaction configuration and bundled emoji/worker routes. Reader SSR is always anonymous; state APIs remain private and no-store. See docs/reader_progress.md.

Reader measurement/status routes live in reader.rs; generated reaction_assets.rs serves the fixed Twemoji inventory. Scoped work analytics/status and viewer-only Discovery progress are assembled at server boundaries; export format 7 adds reports/releases/lifecycle.

`community.rs` serves discussions, private inbox mutations and the bounded server-only KLIPY search adapter. Reader assets include a dedicated local-speech worker; page scripts keep their CSP.

The KLIPY adapter selects trending for empty comment-picker queries, search for
non-empty queries, and returns only validated opaque GIF references.
