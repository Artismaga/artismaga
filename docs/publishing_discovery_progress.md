# Publishing and discovery progress

Started 30 October 2026. This is an incremental implementation of the publishing,
discovery and story-overview roadmap, not completion of the full roadmap.

## Implemented in this change

- Work Overview has a Publishing tab with a Mantine Stepper. Each step exposes the
  existing saved synopsis, artwork, classification, audience, disclosures or chapter
  forms. Final review selects language, public status, related public works, release schedule and maturity and requires an
  explicit confirmation. Cover, hero, synopsis, genre, audience, disclosure review
  and at least one active chapter are required by the server.
- Publish creates an explicit public **metadata and chapter-catalogue snapshot**.
  Private chapter bodies, outlines, passage notes, revisions, shares and credentials
  are never copied into it. Draft edits do not alter the snapshot. Publishing again
  explicitly replaces it; unpublishing removes the public catalogue and public-media
  entitlement. The reader and chapter-body publication are the next phase.
- Featured stories are hand-picked by administrators using the public story page.
  Discovery includes featured, image-based genre navigation, continue reading,
  popular, fresh chapter catalogues and recently completed shelves. Empty states
  identify missing reader/history/popularity data; no engagement numbers are invented.
- Genre pages have horizontal subgenre controls with server-selected subgenre/page URL query state and browser
  Back/Forward support. Public cards link to public story pages. Author names are
  clickable without opening a profile. Reports are disabled and clearly marked.
- Card menus let signed-in readers save story/author recommendation exclusions to
  existing account preferences. Existing hidden genres/tags/authors/stories and
  mature visibility settings filter discovery before SSR. Guests default to a
  mature notice. Notice dismissal reveals artwork for that mounted card/page only.
- Public story pages share the Studio hero/cover layout, show an audience pill,
  byline, synopsis, classification, disclosure headings, language, public status,
  publication dates and chapter count. Tabs contain chapters, reviews, configured related works, other works
  by the author and genre-based similar stories. Chapter rows show number, group,
  title, synopsis, release date, faded artwork and explicitly unavailable metrics.
  Sorting supports release time, metadata-update time, number and both directions;
  chapter lists paginate in groups of ten. Rating controls support half stars with
  gold fill; ratings are currently empty because reviews/ratings do not exist yet.
- A same-origin previous-page Back action uses browser history, preserving the
  discovery URL and browser scroll restoration; direct visits fall back to Discovery.
- An additive `work_publication` migration preserves existing drafts. Publishing
  compares work and details revisions, rechecks ownership/admin access transactionally,
  and serializes media attachment with retirement. Account export includes snapshots;
  deletion removes owned publications and publications using the deleted user's art.

## Initial limits and deliberate remaining work

- The catalogue currently considers the latest 120 publication snapshots; shelves
  display bounded subsets. Genre views paginate the bounded result set. Global ranked queries, incremental discovery loading,
  editorial ordering and search/filter indexing remain to be implemented.
- Publication snapshots are limited to 750 KB. List queries project summaries and
  exclude chapter nodes and disclosures; only the selected story receives its full
  public chapter catalogue. No private manuscripts enter discovery DTOs.
- Fresh shelves use the most recent chapter-catalogue release, not reading events.
  Recently completed uses the transition into completed, rather than a draft edit.
  Release/update dates describe catalogue metadata until chapter-body release exists.
- Continue reading remains an empty, non-actionable shelf pending the reader.
  Popularity, real ratings/reviews/views/subscriber totals, word counts, reading
  estimates, read/unread markers, subscriptions and reading lists remain planned.
- Related public works and free-text expected release schedules are configured at
  publication review. Series/franchise relationship types and ordering remain planned.
  The related tab also lists other public works by the author. Similar stories are an explicit shared-genre match, not personal inference.
- Scheduled publication, private reviewer previews, early access, chapter-body live
  revisions, durable publication history and background publication jobs are next.
- New software keys have defaults in all five shipped catalogues. New non-English
  defaults currently use English fallback text and require translation review.
- Author/user profiles and report submission remain deliberately inactive.

## Planned steps

1. Extend the live snapshot coverage with scheduled-release, account-deletion and
   multi-author relationship cases as those workflows grow. The current tests cover
   authorization, concurrent/stale publication, public media lifetime, draft/note
   isolation, unpublishing and server-side mature filtering.
2. Add published chapter-body snapshots with independently revisioned release/update
   times, then connect the next-phase reader and private reading history.
3. Extend related works into series/franchise configuration; add reviewer previews
   and scheduling with durable retries and immutable publication history.
4. Add privacy-conscious reading measurements, real popularity rankings and ratings/
   reviews; connect continue reading and recommendation ranking to consented data.
5. Expand bounded catalogue queries into paginated genre/search/curation views.
6. Review translations and desktop/mobile/browser Back behavior; perform dedicated
   keyboard, screen-reader and accessibility review before claiming those checks.

## Validation

- Passed: localisation catalogue validation (1,353 keys), frontend formatting, strict
  TypeScript/build, and all 34 frontend tests.
- Passed: Rust formatting, workspace Clippy with warnings denied, and workspace unit
  tests. Opt-in database cases were also run separately, rather than claimed from
  their ignored status in the ordinary unit run.
- Passed: all live database cases with `cargo test --workspace --locked --
  --include-ignored` in the integration image, current sources/artifacts mounted
  read-only, on a disposable private SurrealDB network with no database host port.
  The standard integration script initially exposed a stale shared build-cache
  problem and then a summary-query parse error. The final live run used fresh
  container build artifacts and the corrected query; no check was skipped. The final
  run passed all nine live database integration cases. Temporary preview/test
  resources were cleaned up after validation.
- Browser checks used synthetic stories: desktop and 390px mobile layouts, Publishing
  step navigation/review blocking, chapter sort direction and pagination, title-link
  navigation, and Back restoring the selected subgenre. A narrow-header clipping
  issue and multiline title-link hit area were corrected. Matching server/browser
  builds produced no new hydration errors. This is not a full accessibility audit.

No SMTP delivery, cloud storage delivery or production deployment is claimed.
Substantial LLM assistance was used. Human review remains required before submission;
no human review or approval is claimed here.

## Presentation and expected-release refinements — 30 October 2026

- Story heroes now sit directly below the site header. The redundant Synopsis
  heading is removed; chapter rows are compact. Hero menus reuse the shelf story
  actions and add administrator-only featuring. Author controls underline on hover.
- Audience intent accepts either open bound. Public pills show `18+`, `<12`, or
  `13–18`; fully unspecified legacy values display All ages. This remains author
  intent, not an access-control or official-classification decision.
- Shelf cards now show only cover, title and subtitle. Status/audience pills sit
  at the cover's bottom left; the mature badge sits top left. Mature covers remain
  visibly blurred until dismissed rather than being replaced by an opaque panel.
- Featuring is a full-content-width carousel with the hero behind the cover and
  title/subtitle/byline, fading from 80% height. Navigation appears for multiple
  stories. Seven-second automatic advance pauses independently for hover/focus and
  is disabled for reduced motion. Featured cards intentionally omit context menus.
- Compact genre buttons use uploaded imagery and a contrast-preserving light tint
  sampled from its palette. Custom genres without imagery use deterministic colours
  based on name length. All twelve default top-level genres have bundled anime art,
  with uploaded images taking precedence. Assets and exact generation prompts are
  in `crates/web/assets/genres/`; they were generated with the built-in image tool
  and encoded as WebP for delivery. No taxonomy records or provider credentials are
  overwritten, and a closed HTTP filename list serves the bundled artwork.
- Expected release schedules are optional structured daily/weekly/monthly rules:
  hour 0–23, weekday 0–6 for weekly, day 1–31 for monthly, and the author's configured
  IANA time zone. Short months clamp to their last day; missing DST hours are skipped,
  repeated hours choose the next real occurrence. The story panel displays the next
  occurrence in the viewer's browser time zone with a live countdown. This is an
  expectation only: it does not automatically publish chapters.
- `studio/src/schedule.rs` validates recurrence fields and the bundled zone-name
  registry generated from Node 24's ICU (`Intl.supportedValuesOf('timeZone')`, plus
  canonical spellings and UTC). `shared/schedule.ts` calculates calendar recurrence
  using Intl. An unsupported browser zone does not fabricate a next-release time.
  Updating the registry requires regenerating it from the supported Node runtime.
- Existing free-text schedules remain in stored snapshots until an explicit
  republish, but are not interpreted as recurrence rules. Authors need to select
  their expected schedule once using the new picker.
- Studio now projects status from the public snapshot for work and catalogue DTOs;
  the Drafts filter excludes published snapshots. Private work rows retain draft
  status so older status-based queries cannot expose unpublished metadata edits.

Validation for these refinements includes 40 frontend tests, recurrence tests for
DST/quarter-hour offsets/short months, Rust schedule and audience validation, and
live publication status/schedule/artwork regression checks. Desktop browser checks
used synthetic stories and verified the 72px header/hero boundary, roughly 111px
chapter rows, menu controls, recurrence picker fields and the live local countdown.
No full accessibility audit, cloud delivery or production deployment is claimed.

Refinement validation completed: all 40 frontend tests, strict build/format checks,
Rust workspace tests and Clippy passed. The standard disposable integration script
passed all live cases, including schedule persistence, published-status projection
and all twelve image routes. Browser checks confirmed hover pause (the slide stayed
at 1/2 beyond seven seconds), resume outside the feature (advanced to 2/2), and
390px layout without horizontal overflow. Genre buttons measured about 41px tall.

### Discovery presentation follow-up

- Removed the featured and genre headings while retaining accessible region names and shelf headings.
- Featured and shelf mature notices now overlay blurred content with an explicit dismiss button; covered story links are inert until revealed. Shelf context menus remain available.
- Featured slides enter and leave in the navigation direction. Equal progress pills show elapsed autoplay time, retaining progress while hover/focus pauses the timer. Reduced-motion preferences disable autoplay and slide animation.
- Enlarged, top-aligned featured typography and bright genre artwork with contrasting text shadows. Carousel controls retain their vertical position when pressed.
- Removed the header preview badge and moved the existing language control above sidebar navigation.
- No new software labels were introduced; existing translated notice/navigation labels are reused.
- Validation: 41 frontend tests, five-locale catalogue validation, frontend formatting/typecheck/build, Cargo formatting/Clippy/workspace tests, and the live container integration suite passed. Browser checks used synthetic public fixtures at desktop and 390px widths; carousel navigation, prior-pill fill, warning dismissal, inert covered links, sidebar control placement and wrapping dismiss labels were verified. No browser console errors were observed.

### Overview save and republishing fixes

- Genres/tags and target-audience forms now have distinct revision-based React keys, preventing duplicate panels after either form saves.
- Disclosure acknowledgement resets when the saved disclosure content changes, rather than on every metadata/chapter revision. Final publication confirmation still resets after any saved draft change.
- Unpublish is disabled when there is no public snapshot. Publishing remains available after completing the required steps and confirming publication.
- Added live-database regression coverage for publish → unpublish → publish using fresh work/details revisions. Synthetic browser checks cover repeated overview saves, an enabled Publish/disabled Unpublish pair for an unpublished work, preserving disclosure review after unrelated saves, and invalidating it after disclosure edits.
- Validation passed: frontend build/typecheck, formatting, 41 frontend tests, five-locale catalogue validation, Cargo formatting/Clippy/workspace tests, and the live container integration suite including the new republishing regression.

### Mature chapter artwork and shared feedback

- Story overview chapter-cover images now follow the hero/cover notice state: blurred before notice dismissal and revealed together afterwards, including pagination/sort changes.
- Added a single Mantine Notifications host at the application root and shared localized feedback handling for forms, menus, uploads, work/publishing saves, account/admin operations, setup, searches and editor failures/manual saves. Feedback appears at the top right, above dialogs, rather than in page-specific alert blocks. Errors stay until dismissed; ordinary confirmations expire after six seconds. One-time invitation results remain dismissible without a timeout.
- Field validation, content notices, page instructions, live state indicators and manuscript recovery/compare controls remain contextual UI. Transient action errors and confirmations use toasts. Toast content remains escaped React text and no feedback is persisted to browser storage or public SSR props.
- The notification dismissal label is registered with defaults in all five locales; the Mantine Notifications dependency and lockfile are updated together.
- Validation passed: 42 frontend tests, frontend typecheck/build/formatting, 1,369 keys across five locales, Cargo formatting/Clippy/workspace tests, and the live container integration suite. Synthetic browser checks confirmed chapter filters switch from blur to none on notice dismissal, feature errors use an alert toast, save confirmations use a status toast outside page content, and no browser console errors were recorded.

## Reader phase update — 2 November 2026

The reader phase now extends the earlier metadata-only snapshot behavior with explicit saved chapter-body publication, chapter disclosures, private reading-state sync, offline downloads and reactions/ratings. Earlier descriptions above record the initial phase; current reader coverage and remaining limitations are tracked in [reader_progress.md](reader_progress.md). Aggregate popularity/review metrics and comments remain planned.

Reader engagement now supplies measured Popular scores and a private Continue reading shelf; see reader_progress.md. Empty Featured shelves are omitted. Public chapter lists omit unreleased bodies, and first story publication requires an explicitly published chapter.

### Genre discovery hero — 2 November 2026

- Replaced the text back button with an accessible left-arrow link beside the genre name.
- Grouped the name and horizontal subgenre navigation inside a full-width hero below the site header. It uses the genre's main image, with predefined artwork as fallback, and fades from 80% to transparent at the bottom. Genres without artwork retain the shared generated background.
- Reused the existing translated back-link label and preserved subgenre URL/history handling and catalogue pagination.
- Desktop and 390px synthetic browser checks confirmed the hero layout, horizontal subgenre scrolling, navigation URL updates and the 80% fade without page overflow or browser errors.
- Validation passed: 51 frontend tests, frontend build/typecheck/formatting, localization catalogue validation, Cargo formatting/Clippy/workspace tests, and a clean live integration rerun after the first runner returned an interrupted cleanup status.
