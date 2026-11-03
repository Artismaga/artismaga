# Reader, publication and engagement progress

Updated 3 November 2026. Chapter comments are documented in comments_progress.md; written reviews remain planned.

## Publication and disclosures

- Owners/administrators with writing and publishing capability explicitly publish a
  saved chapter from its editor. A first chapter can be staged while its story is
  private. Staging does not create a public story or reader entitlement.
- Story publication requires at least one active, explicitly published chapter.
  It exposes only those chapters; saving a manuscript does not publish it.
  Publishing a later chapter adds it to the public catalogue. Private notes,
  outlines, collaborators and checkpoint history never enter released body DTOs.
- Work/details/draft revisions and owner authority are checked transactionally.
  Unpublishing the story revokes public reader access while retaining staged bodies
  for an explicit future story publication. Downloaded public copies cannot be recalled.
- Gore notices describe graphic violence and/or injuries. Sexual Content notices
  describe detailed sexual depictions, without the generic unsettling-content copy.
  Assault retains its detailed warning. Public chapter rows show named disclosure
  pills; reader notices appear before manuscript contents. Work disclosures remain
  separate from chapter disclosures.

## Reader and reactions

- Complete escaped prose is rendered before hydration at `/read/<work>/<chapter>`.
  The responsive reader retains device typography/theme settings, Kokoro.js local English speech on eligible WebGPU devices with
  browser-native fallback and speed/pause/resume/stop controls, approximate reading estimates and account progress
  sync with explicit conflict recovery. Anonymous reader SSR contains no account data.
- The header has story Back, story name and chapter/total, a sync-state icon and a
  settings cog. Scrolling down fades the header; hovering/focusing it or scrolling
  up reveals it. Sync detail/conflict recovery opens from the sync icon.
- Bottom navigation is previous icon, chapter/total and next icon, with unavailable
  directions disabled. There is no duplicate top navigation or latest-chapter copy.
  Download/clear controls are in reader settings, before reading is complete.
- Centred image-only reactions have optional plain titles below them and live counts
  with compact k/m suffixes. The six defaults fit one mobile row. The centred rating
  uses larger stars and “Rate this chapter”; clicking a selected rating clears it
  to zero. A separate zero-rating button is absent.
- Comments administration has an icon, a Reactions heading with title visibility,
  one-line configuration rows, six-dot drag handles with Alt+Up/Down alternatives,
  a searchable grid of all 4,009 bundled Twemoji v17.0.3 images, Custom Image upload,
  editable title and trash. Add reaction has a dashed outline and is hidden at six.
  Unsaved changes are previewed. Custom artwork replaced/removed during editing is
  retired on Save, so cancelling a draft cannot break currently published reactions.
  Storage deletion is durable and retryable. Provider credentials remain private.
- Explicit offline downloads cache anonymous public chapters and an asset allowlist,
  never Studio or account APIs. Up to 50 chapters are allowed subject to browser quota.
  Download caches, local position and settings are separate browser data.

## Measurements, Studio and Discovery

- Chapter-page views and 95%-progress completions are reported from visible browser
  pages. One account or guest browser contributes at most one view and completion
  per chapter per UTC day. Concurrent retries use a single transaction and stable
  deduplication key. These are browser reports, not verified people or proof of reading.
- Signed-in reactions/ratings remain unique current account/chapter choices. Atomic
  aggregate deltas prevent autosaves or changing a vote from creating extra ratings.
  Reactions and ratings require current server-side comment/review capabilities.
- Aggregate daily chapter activity and current feedback feed Studio Analytics:
  totals, per-chapter views/completions/average rating/rating count and the latest
  90 active daily rows. Work access is checked before any analytics DTO is returned.
- Popular ranks the existing bounded public catalogue by lifetime views + twice
  completions + current rating sums. Empty ranking states do not invent measurements.
  Continue reading uses only the signed-in viewer's recent state, with chapter
  progress along the bottom of its cover and a link to resume that chapter. Mature
  and recommendation exclusions still filter the shelves. An empty Featured shelf
  is omitted completely.
- The catalogue remains bounded to 120 publications. Resume selection considers
  240 recent chapter states and displays at most 12 works. Global ranking/search
  indexing and engagement fraud detection remain separate future work.

## Story status

- Overview → Overview, below Synopsis, lets the owner/admin save Ongoing, Hiatus,
  Abandoned or Completed. An optional UTC hiatus-end date is an estimate only;
  overdue hiatuses say “The author's hiatus is taking longer than expected”.
- Ongoing stories without a new chapter for four calendar months show a months/years
  inactivity notice. Updating an existing body does not count as a new release.
- Platform configuration has a disabled-by-default automatic abandonment policy:
  1–120 additional months after the four-month warning threshold. The hourly worker
  rechecks Ongoing status and unchanged latest release before transitioning; Hiatus
  and Completed stories never transition automatically. Processing is bounded to
  the 100 oldest ongoing stories per pass.

## Privacy, migrations and maintenance

- Additive `engagement.surql` creates daily measurements, bounded-lifetime deduplication
  rows, feedback aggregates and revisioned lifecycle records. Existing ratings and
  reactions are backfilled once without republishing drafts.
- Guest measurement cookies are random, HttpOnly, SameSite=Strict and expire after
  32 days. Only digests are stored; no IP address or user agent is persisted. Account
  digests are also pseudonymous, not anonymous. Deduplication rows older than 32 days
  are removed by the app worker; aggregate counts remain.
- Account export format 7 includes own staged releases, lifecycle and reading reports.
  Deletion removes own reading state/reports and owned story measurements; retained
  public reaction/rating totals subtract that account's choices transactionally.
- Twemoji graphics and Unicode search names are bundled with attribution/licenses.
  `scripts/update-twemoji.py` regenerates the fixed asset inventory/index from reviewed
  archives; it does not fetch files or introduce runtime third-party requests.
- New labels have registered defaults in all five locales. New non-English defaults
  use English fallback and require translation review.

## Verification

- Frontend formatting/build and 61 TypeScript/SSR/worker tests pass.
- Workspace formatting, warnings-denied Clippy and Rust tests pass.
- The live private SurrealDB integration suite passed staged-publication privacy,
  duplicate/concurrent measurements, rating/reaction replacement, analytics access,
  status changes, public catalogue filtering, calendar abandonment boundaries,
  account-deletion feedback, custom-art retirement, export and staged-body cleanup.
- Synthetic browser review exercised 390px reader reactions, compact counts, fading
  header, disabled navigation, and desktop Comments rows/searchable Twemoji picker.
  Dedicated screen-reader testing, actual speech output and a full disconnected
  browser reload remain unverified. No accessibility certification is claimed.

## Local speech and hero reading links

- Kokoro.js 1.2.1 runs in a dedicated worker with an immutable Kokoro-82M model
  revision. This runtime supports English; other chapter languages use native TTS.
  Eligibility requires WebGPU, four logical processors, no data-saving request and
  at least 4 GB RAM when that information is available. Initialization/generation
  failures or timeouts fall back at the current chunk. Stop terminates pending work;
  pause/resume controls playback. Matching local browser voices are preferred, then
  matching vendor voices. Actual speech/device performance needs manual review.
- Model assets download from Hugging Face only on play. Chapter text stays in the
  device worker. The main page keeps its external-script execution policy.
- Story heroes have Start Reading or Continue Reading with a smaller muted chapter
  number, using current account progress and optional device state. Featured heroes
  use square edges and meet Discovery's outer top/side boundaries.
- Existing native hover titles on controls have been replaced with Mantine Tooltip;
  modal/alert headings remain component titles.

## Chapter artwork hero

- Assigned chapter artwork renders as a full-width hero directly below the reader
  header, with the title, brief synopsis (when present) and reading-time estimate.
  It shares the overview hero's fading image treatment and has no outer padding
  or rounded corners. Artwork is displayed without mature-content blurring or hiding;
  chapter disclosures still appear before the manuscript.
- Chapters without artwork keep their existing heading layout. Explicit offline
  downloads now retain the chapter image alongside up to six reaction images.

- Hero verification covers escaped synopsis SSR, one chapter heading, disclosure
  ordering and unblurred artwork on a chapter with mature disclosures. Browser
  checks at desktop and 390px confirmed the hero starts exactly at the header's
  bottom edge, fills the viewport width and causes no horizontal overflow.
  Offline tests retain the image with all six reactions and reject oversized lists.
