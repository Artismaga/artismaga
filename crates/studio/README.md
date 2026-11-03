# artismaga-studio

Private work metadata, catalogue search/filter/sort, access ordering and collaboration.
Book drafts, chapter writing, chapter hierarchy and explicit public catalogue publication
are implemented. Chapter-body publication and the reader are now implemented; other work types remain planned.

## Important logic

`src/lib.rs`: `Studio::list` binds accessible work IDs and maps only a fixed sort
vocabulary to SQL; `get` checks ownership/administrator/share access and optionally
records last access; `create/update` validate bounded metadata/artwork ownership;
`collaboration.rs` resolves exact emails or public account selections and commits up to 50 collaborator grants atomically; public-name search never returns emails.
`Actor` is created by web from the authenticated account and current role, never
from browser-supplied permissions. Editing requires writing capability in addition
to ownership/editor access. Work revisions serialize edits and sharing revocation.

`crates/db/src/queries/studio_{create,update,share}.surql` owns fixed transactions;
`crates/db/src/studio.surql` owns additive schema/indexes. Account deletion/export
extends the existing accounts/web use cases; private blob removal belongs to storage.

## Boundaries

Depends on core/config/db/administration (shared taxonomy) and typed JSON; no Rocket, renderer or storage client.
HTTP authorization/deep-link routing is in web. React compositions are grouped under
web/src/pages/studio. Do not put a future chapter editor or publishing rules here
without documenting their ownership and migration strategy.

Maintain this file and docs/architecture.md with responsibility/logic changes.
Follow AGENTS.md and CONTRIBUTORS.md, including actual human understanding and
review of all LLM-assisted contributions.

`src/details.rs` owns chapter information, hierarchy validation, work classification,
content disclosures, revisions and seven-day archive/recovery. Fixed transactions
`details_update.surql`, `shares_update.surql`, `chapters_purge.surql` and
`chapter_cover_delete.surql` serialize revocation, edits and cover retirement.
`purge_chapters` processes at most 100 expired documents and 100 cover-retirement
jobs per run. Initial limits: 2,000 nodes and 1 MB serialized configuration per work.
Chapter writing lives in `writing.rs`; see docs/chapter_editor.md and docs/chapters_and_taxonomy.md.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`translations.rs` owns work source-language selection, per-language batch grants,
selected-scope translation DTOs and source fingerprints. `translation_grants.surql`
serializes grant changes on the parent work; `translation_save.surql` requires a
saved matching draft before language-specific approval. Generic collaborator removal
also revokes language grants; translation-only shares preserve source-edit boundaries.

`details.rs::TargetAudience` validates optional integer ages (0–120, ordered bounds).
The `audience` command uses existing editor authorization and atomic revisions.
Missing audience data in older works defaults to unspecified; it does not change
content disclosures or introduce maturity classification/access restrictions.

`writing.rs` owns a closed rich-text vocabulary, safe link checks, bounded notes,
per-chapter language, revision cursors and checkpoint/restoration operations.
`writing_save.surql` rechecks work sharing and active chapter state inside the
transaction; chapter draft revisions prevent concurrent overwrites, and a shared
work write serializes saves against archive/revocation. Author intent, metadata
and chapter hierarchy remain in details.rs; browser grammar/paste/editor behavior
belongs to web. See docs/chapter_editor.md for retention and recovery limits.

`writing::Manuscript.chapter_note` holds the one chapter outline separately from
passage anchors. Restore transactions preserve an uncheckpointed predecessor
before writing the restored checkpoint.

`writing_history` returns paginated checkpoint metadata and resolves Gravatar URLs
with one bounded account projection. Email addresses and internal attribution IDs
stay server-side; removed accounts use the anonymous avatar fallback.

`publishing.rs` now owns public metadata/chapter-catalogue snapshots, required
setup validation, maturity derivation and chapter metadata release/update dates.
`publish.surql` and `unpublish.surql` recheck owner/admin and revision boundaries
and serialize media attachment. `publications` projects bounded public summaries;
`publication` returns a single public snapshot. Manuscript publication and reader access are implemented in reader.rs; scheduling remains planned. See docs/publishing_discovery_progress.md.

`schedule.rs` validates optional expected-release recurrence (daily/weekly/monthly,
calendar fields, author IANA zone). `timezones.txt` is generated from Node 24 ICU
zone names plus resolved canonical spellings and UTC; it contains names only, not
calendar rules. Browser Intl handles occurrence calculation and local presentation.
No new dependency or scheduled-publication worker is introduced. Legacy free-text
snapshot values remain stored until republishing and deserialize to no recurrence.
`public_status` projects snapshot state into work DTOs; raw work rows remain drafts
and the Drafts catalogue filter checks snapshot absence. Audience bounds can each
be omitted independently, with ordering checked when both are present.

`reader.rs` owns released document DTOs, own-account reading state and bounded reaction configuration. `chapter_publish.surql` compares work/details/draft revisions; `reader_save.surql` owns state conflicts. Public bodies exclude notes and checkpoints. Full story publication exposes staged bodies; individual publishing stages a first chapter or adds/updates a public chapter. See docs/reader_progress.md.

`engagement.rs` owns daily deduplicated measurements, scoped analytics/feedback aggregates and Discovery scores; `lifecycle.rs` owns revisioned status/hiatus and calendar abandonment. Staged chapter releases can precede public stories; story publication requires one active release. See reader_progress.md for metric/privacy definitions.

`community.rs` and `community_write.surql` own released-chapter comments, likes, mutes and private inbox transactions. See docs/comments_progress.md for limits and permission boundaries.
