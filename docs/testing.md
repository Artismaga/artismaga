# Testing

## Source checks

Install Node 24+ and Rust 1.93+, then build the TypeScript artifacts before Cargo
(the web crate embeds the browser bundle):

```sh
npm --prefix web ci
npm --prefix web run format:check
npm --prefix web run build
npm --prefix web test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

TypeScript tests cover SSR forms, escaping, runtime contract rejection, the setup
wizard document, AA text contrast for primary/destructive actions in both schemes, client response validation, and real stdin/stdout worker requests.
Rust unit tests cover config/Origin validation, private atomic settings persistence,
random setup codes, passwords/tokens, HTTP guards/rate limits, and managed renderer
startup, crash recovery, shutdown, and reaping. No standalone renderer is required.

## Private database integration

```sh
sh scripts/test-integration.sh
```

The script creates a uniquely named disposable Compose database/network, builds the
integration image, runs all Rust tests including opt-in integration tests inside
that network, and removes its own containers/volumes. The database is never published
to the host. Production volumes are not used. Node and the built renderer are
included in the integration image; no second rendering service is started.

`crates/web/tests/foundation.rs` covers account policies, invitation races and
rollback, unique emails, bound query values, email token expiry/single use, password
reset/session revocation, permissions, real React SSR, login cookies, and logout.

`crates/web/tests/installation.rs` covers the installer-only HTTP surface, Origin
and claim-code failures, invalid configuration, concurrent/repeated claims, private
settings persistence, first-owner login, normal-site setup closure, permanent DB
claim markers, and interrupted-install retry. Each test uses its own database.

`crates/web/tests/settings.rs` covers persisted profile/preferences, private defaults, revision conflicts, safe links, owner-only SSR/export, password and email changes, scoped session revocation, administrator authorization, safe default groups and last-administrator deletion protection, including concurrent administrator deletions.

For targeted runs from an existing integration image/network, set `TEST_DATABASE_URL`
to the internal endpoint and select the relevant Cargo test. Do not add host database
port mappings to run tests.

## Packaged/manual verification

In a disposable installation, run `docker compose up --build -d`, retrieve its setup
code, open `/setup`, verify the four wizard steps and keyboard/focus behavior, and
finish setup with synthetic credentials. Check the handover to sign-in and normal
home page, then restart the app and confirm setup stays closed. Inspect Compose to
confirm there are two services, no database published ports, and no renderer listener.

A real SMTP provider, full accessibility audit, multi-instance load testing, and
backup restoration drills require separate validation. The installer validates SMTP
settings but does not send a test email. Automated email-token confirmation uses
synthetic database fixtures; do not claim live delivery based on those tests.

For UI changes inspect desktop and narrow layouts, the mobile drawer, settings tabs,
forms and the administrator dashboard. Check for browser hydration/CSP failures.
Verify skeletons remain explicitly labelled and no fabricated metrics appear.
Apply the review checklist in design_system.md. Browser checks complement rather
than establish a full keyboard, screen-reader or accessibility audit.

## Studio, roles and storage

`crates/web/tests/studio.rs` exercises real SurrealDB + a temporary local storage
root. It covers custom roles and revocation on existing sessions, protected roles,
write-only encrypted cloud settings without cloud requests, local image conversion,
private media, explicit sharing/revocation, metadata revision conflicts, catalogue
sorting/filtering, optional/default covers, custom default registration roles, work
export and queued physical artwork deletion. Local fixtures are generated test pixels.
No live AWS or Cloudflare credentials or endpoints are used in tests.

Frontend tests check server-selected path tabs, utility navigation placement,
Book creation HTML, SSR data scoping, nonce styles, and contrast for configurable
seed colours. Browser checks should verify theme/accessibility before Save, then
persist and reload; test Back/Forward and deep tab refresh, upload busy states,
cover/hero hover and keyboard controls, catalogue search/sort, mobile overflow and
console/CSP/hydration errors. Components alone do not establish a full accessibility audit.

Creative regression coverage: `crates/web/tests/creative.rs` exercises atomic batch
sharing rollback, exact-email matching/name privacy, stale edits/revocation, chapter
hierarchy and movement, seven-day archive/restore/expiry, purge and vocabulary policy
against real SurrealDB. `web/tests/creative.test.ts` checks tree reading order and
whole-site semantic text contrast across seeds/schemes; rendering tests cover chapter
SSR and page titles. Browser checks should exercise drag and keyboard moves, archive
recovery, narrow layouts, taxonomy controls and live dark/light palette updates.

Localisation: `node scripts/check-localisation.mjs` validates all five defaults,
dot-key references and placeholder contracts. After catalogue edits run it with
`--write-sources`, then format/build the web. `web/tests/localisation.test.tsx`
checks five-locale SSR and editor DTO isolation; `crates/web/tests/localisation.rs`
checks real database draft publication conflicts, permission-specific work approval,
source changes, translation-only access revocation, provider cache invalidation and
language-cookie SSR. To explicitly run the local model smoke test, set
`ARTISMAGA_LLAMA_SERVER` and `TEST_LOCAL_MODEL_DIR`, then run
`cargo test -p artismaga-localisation --features local-model-tests local_model_translates_supported_languages -- --include-ignored --nocapture`.
Never exercise remote providers with fixtures or credentials without separate user
instructions. Normal integration tests do not invoke Google or download model files.

Announcement regression coverage also exercises a delegated manager without general
administration rights, denied reader uploads/mutations, retained creator/history,
role audience filtering and private announcement-image reads for guests/readers.
Cache tests preserve punctuation exactly, reject expired/changed-source hits and
invalidate old provider output. Browser verification covered real in-image local
generation, placeholder previews, whole-UI theme changes, live measurements, a saved
warning banner and 390px mobile layouts without page/input overflow. Cloud translation,
cloud storage delivery and full accessibility certification were not exercised.

## Chapter editor

`web/tests/writing.test.tsx` checks safe rich-text SSR, link rejection, Unicode
word counting, text search across marks, device recovery expiry and actionable
local writing checks. `studio::writing` unit tests reject active/unsupported nodes,
invalid nesting, deep/oversized documents and unsafe URLs.
`crates/web/tests/writing.rs` exercises real database autosave/checkpoints, concurrent
saves, revision restoration, work access/revocation, private SSR, Origin guards and
archive/restore/purge of manuscript history. Use scripts/test-integration.sh.

Browser review should exercise rich formatting, literal find/replace, paste cleanup,
undo/redo, selected-passage notes, language/spelling controls, autosave/reload, device
recovery, two-tab conflicts, checkpoint comparison/restoration and narrow layouts.
Native spelling availability depends on the browser’s installed dictionaries. Basic
local rules do not establish linguistic correctness or a full accessibility audit.

Revision regression tests also cover text highlights across inline marks, block
boundaries and CJK text while preserving safe formatted SSR. The private database
test checks avatar attribution and omission of editor IDs/email fields. Browser
review should select two table rows, check read-only green/red manuscript surfaces,
return to the table, and verify localized volume/arc labels and icon-only actions.

## Publishing and discovery

Publishing regression coverage lives in `tests/publishing.rs` in the web crate
and `web/tests/discovery.test.tsx`. Use the standard source checks and disposable
private-network integration runner. Verify draft isolation, concurrent/stale
publication rollback, author-only publication, same-Origin guards, public media
entitlement and recommendation/mature filtering. Browser review should verify
Stepper navigation, narrow layouts, menu focus, subgenre Back/Forward, returning
to discovery scroll position, and chapter sorting/pagination.

Discovery refinement coverage: `web/tests/schedule.test.ts` checks open audience
labels, calendar recurrence, short months, DST gaps/overlaps and quarter-hour time
zones. Discovery SSR tests check compact shelf copy and feature-carousel controls.
The live publishing regression also checks structured schedule persistence, projected
Studio status and Drafts filtering without changing raw draft-row visibility, and
all twelve bundled image endpoints. Browser review should verify auto-advance and
hover/focus pausing, mature-cover dismissal, local countdowns and narrow layouts.

Publishing regression checks include recreating a public snapshot after unpublishing.
For the work overview UI, save genres/tags and audience repeatedly and verify one
panel of each remains. Review disclosures, save unrelated metadata or chapters,
and verify review stays complete; changing saved disclosures must clear review.
An unpublished work with completed steps and final confirmation must enable Publish
and disable Unpublish.

Public story SSR tests cover chapter artwork blurring under mature notices and
visible artwork under the `show` preference. In a synthetic browser fixture,
verify dismissing the story notice reveals chapter images on all catalogue pages.
Trigger a failed feature action and a successful work save: each should produce
one Mantine toast outside the page content, with no duplicate inline feedback.
Errors remain dismissible; ordinary save confirmations expire. Verify the toast
close control has a translated notification-specific accessible name.

## Reader

`web/tests/reader.test.tsx` checks complete escaped reader SSR, disclosure placement,
chapter links, public-only downloadable props and bounded device preferences/state.
Studio unit tests reject invalid reaction policies/feedback. The live publishing
regression additionally exercises public body isolation, reading-state races,
account isolation, revisioned reaction order, chapter publishing authority, anonymous
reader SSR with a session, foreign Origins and unpublished chapter state writes.

In a synthetic browser fixture, verify 390px/desktop layouts; keyboard drawer focus,
font/width/theme controls; local voice availability and cancellation; reaction/rating
state; download, disconnected reload and clearing; guest/device position; signed-in
reload on a second device and explicit conflict recovery. Screen-reader behavior
and actual browser speech output need dedicated manual review.

## Engagement and status

Frontend engagement tests cover compact counters, whole calendar months, hidden
unreleased chapters, no empty featured shelf and hiatus/inactivity notices. The
live publishing regression now checks pre-publication staging, current feedback
deltas, concurrent daily view/completion deduplication, analytics access, status
revisions, account deletion subtracting feedback, custom image replacement/unused
upload retirement, and automatic abandonment before/after its calendar deadline.
Renderer/foundation tests require Popular content and the absence of an empty
Featured heading. Never restore the old placeholder assertions to hide a failure.

Synthetic browser checks should verify the compact six-reaction row at 390px,
header hover/focus/up-scroll visibility, sync popover, title toggle, keyboard drag
alternatives, searchable emoji grid, owned custom uploads, and real-device speech.

## Comments and inbox

`web/tests/community.test.tsx` covers escaped inline formatting, Twemoji, thread
ordering/cycles, DTO rejection and local-speech device/language eligibility. The
publishing integration regression covers comment permission checks, revision races,
owner/admin distinctions, unique likes, private inbox ownership, read marks, mute
suppression and thread-preserving deletion. The standard disposable runner never
contacts KLIPY. A separate synthetic provider smoke request requires an explicitly
provided testing key. Browser review should exercise composer IME/Enter behavior,
reply indentation, spoiler disclosure, action focus/tooltips, notification actions,
minute polling across tabs and narrow layouts. Actual speech on supported hardware,
full keyboard/screen-reader review and background-delivery guarantees are separate.

Comment editor regression tests additionally check nested-mark/escaped-literal
round trips, newlines, emoji conversion and complete Unicode category coverage.
Synthetic browser review checks Ctrl+B/Ctrl+I, formatted submission, automatic GIF
requests, natural-height GIF tiles and all 4,009 emoji options. Live KLIPY delivery
requires separate provider verification; synthetic browser fixtures do not prove it.

Reader hero regressions cover the assigned image/synopsis in SSR, mature disclosure
ordering, unchanged image-free chapters and explicit offline image retention with
six reactions. Synthetic desktop/390px checks confirm zero gap below the header
and full-width artwork without horizontal overflow.
