# TypeScript website

Strict TypeScript, React 19 and Mantine 9 provide complete server-rendered pages
and document hydration. `strict`, unchecked-index, exact-optional and unused-code
checks are enabled; Prettier enforces formatting. Follow [the design system](../docs/design_system.md).

| Location | Responsibility |
| --- | --- |
| `src/shared/contracts.ts`, `settings.ts`, `studio.ts`, `creative.ts` | Validated IPC/API schemas, own-account/preferences/configuration DTOs |
| `src/components/Document.tsx`, `Application.tsx`, `Shell.tsx` | Escaped document props, shared Mantine provider, responsive application shell |
| `src/components/Form.tsx` | Typed form submission, accessible feedback, conflict/error handling |
| `src/pages/Home.tsx` | Public catalogue shelves, genre/subgenre discovery and honest empty states |
| `src/pages/account/` | Profile, security, sessions, preferences, export and deletion |
| `src/pages/admin/` | Guarded dashboard, analytics placeholders, configuration, roles, genre/tag taxonomy, people and write-only storage settings |
| `src/pages/studio/` | Accessible work catalogue, optional-artwork creation, editable work identity, sharing and chapter hierarchy/archive, classification/disclosures, and planned relationship/analytics tabs |
| `src/components/Appearance.tsx`, `ArtworkInput.tsx` | Live appearance/base-colour context and validated raw-file uploads with submit-busy propagation |
| `src/client/navigation.ts` | Subdirectory tabs, server-selected initial section and Back/Forward state |
| `src/pages/Accounts.tsx`, `Setup.tsx` | Authentication/token actions and four-step installation |
| `src/server/` | Validated React SSR and bounded private JSON-lines worker |
| `src/client/index.tsx`, `api.ts`, `validation.ts` | Validated document hydration and safe typed HTTP boundary |
| `src/theme/theme.ts`, `src/styles/` | Shared Mantine defaults, Material semantic roles and responsive CSS |
| `tests/` | SSR/escaping, contract validation, setup and real worker regression coverage |

React produces page HTML before Rocket serves it, then hydrates the same complete
document to enable Mantine interactions. Props are escaped in a data attribute;
no inline executable script or raw HTML injection is used. Provider style blocks
receive the response CSP nonce. Private account DTOs are limited to the signed-in
owner’s settings; administrator DTOs require server authorization. Never serialize
passwords, session tokens, SMTP credentials or database configuration.

```sh
npm ci
npm run format:check
npm run build
npm test
```

Build emits `dist/client.js`, `dist/client.css` and `dist/server/worker.js`. Dependencies
remain external for the server worker and ship beside it in the app image. Build
before Cargo, which embeds browser assets. Generated output is ignored. Node is
started and managed by Rust; never add a separate rendering service.

Keep this map, crate READMEs and the architecture map current. Follow AGENTS.md and
CONTRIBUTORS.md, including human understanding and review of LLM-assisted code.

Appearance updates preview immediately; Save persists them. Tabs use path URLs rather
than fragments. Email tokens still use fragments intentionally. Artwork source URLs
are generated same-origin routes; never add direct cloud credentials or signed URLs
to page DTOs. See docs/studio_and_storage.md for current work/storage boundaries.

`Chapters.tsx` owns tree/pagination, accessible movement, information dialogs and
archive recovery; `Classification.tsx` owns genre/tag and content-disclosure forms;
`Collaborators.tsx` owns batched public-name/exact-email selection. Shared
`SearchTags.tsx` wraps Mantine TagsInput with bounded debounced suggestions and
stable identifiers. `admin/Taxonomy.tsx` edits classification policy and genre assets.
`shared/page-title.ts` is the SSR/client title contract. `theme/theme.ts` derives
both action colours and all neutral/surface/text roles from the site seed.

`localisation/index.tsx` is the shared SSR/hydration translation context;
`localisation/sources.ts` is generated from the registered catalogue. Run
`node scripts/check-localisation.mjs --write-sources` after catalogue changes.
`admin/Localisation.tsx` manages authorised key drafts and provider configuration;
`studio/Translations.tsx` manages source-bound language approvals and grants.
`admin/Identity.tsx` supplies Site/Themes subnavigation and declarative theme options;
`shared/theme-selection.ts` consistently filters disabled themes. `admin/Performance.tsx`
polls bounded live telemetry, `admin/SiteAnalytics.tsx` owns separate analytics tabs,
and `admin/Announcements.tsx` owns scheduling/history. `components/Announcements.tsx`
contains notice/promotion rendering and per-revision dismissal. Stable user content
identifiers, manuscript titles and names must not pass through software-label lookup.

`localisation/dates.ts` provides identical server/browser time-zone formatting.
The shared localisation DTO captures one render time for stable date/status output.
Announcement history is loaded in pages with server-side search; public discovery
queries only eligible scheduled audiences instead of loading the entire history.

`pages/studio/Audience.tsx` edits intended reader ages within the work Overview tab using the runtime
`targetAudienceSchema`. `Roles.tsx` keeps permission inputs mounted across collapsed
categories so a save does not drop hidden grants. Theme controls use an expanded
cog disclosure. Promotion banners support accessible full-image destination links.

Chapter writing: `pages/studio/ChapterEditor.tsx` composes Tiptap with Mantine
controls and a safe, already rendered manuscript fallback. `editor/useDraft.ts`
serializes autosaves, preserves changes made during a request, stops on conflicts
and offers explicit reconciliation. `editor/recovery.ts` scopes seven-day device
copies by account/work/chapter. `document.tsx` renders only allowed semantic nodes
through React escaping and counts words with Intl.Segmenter; `paste.ts` strips
external formatting/active content. `find.ts`, `FindReplace.tsx`, `AuthorNotes.tsx`,
`checks.ts` and `RevisionHistory.tsx` own their respective writing tools. Shared
runtime schemas live in `shared/writing.ts`. Do not introduce raw manuscript HTML
or third-party proofreading calls. Full behavior/limits: docs/chapter_editor.md.

The standalone chapter editor centres the manuscript without site navigation.
Selection/search decorations live in `editor/selection.ts`; floating tools live in
`editor/EditorDock.tsx`; the title editor and
chapter/passage note surfaces live in `editor/InlineTitle.tsx` and `AuthorNotes.tsx`.

Revision history uses a two-step table in `editor/RevisionHistory.tsx`, then a
full-screen read-only comparison in `RevisionCanvas.tsx`. `revision-diff.ts` computes
bounded textual highlights; `document.tsx` preserves semantic formatting and escaping.

`client/index.tsx` supplies the response nonce to the scroll-lock style singleton
before hydration, alongside MantineProvider’s existing style nonce handling.

`pages/studio/Publishing.tsx` provides guided saved configuration and explicit
metadata snapshot publication. `shared/discovery.ts` validates public-only snapshot
DTOs; `pages/discovery/StoryCard.tsx` supplies mature notices and recommendation
menus; `pages/discovery/Story.tsx` supplies public story information and paginated
chapter catalogues. `Home.tsx` now renders real published shelves and image-based
genre/subgenre navigation, with explicit empty states for unavailable reading data.

Public presentation: `StoryMenu.tsx` shares hero/shelf actions; `StoryCard.tsx` renders
compact cover/title/subtitle cards and audience/status/mature pills;
`FeaturedStories.tsx` owns the full-width carousel, seven-second timer, independent
hover/focus pausing and reduced-motion behavior. `GenreButton.tsx` uses taxonomy
palette tints or bundled default art; `shared/genre-artwork.ts` maps default assets.
`shared/schedule.ts` validates schedules and calculates DST-aware calendar events;
`ReleaseSchedulePicker.tsx` edits author-zone recurrence, and
`ReleaseSchedulePanel.tsx` converts the next event to the viewer's zone/countdown.

Discovery mature overlays share `MatureWarning` and make obscured links inert.
Carousel progress retains elapsed time across hover/focus pauses; directional
entry/exit animations respect reduced-motion preferences. The language selector
lives at the top of the sidebar.

`components/Feedback.tsx` localizes transient operation feedback and sends it to
`@mantine/notifications` (pinned to the Mantine version). `Application.tsx` mounts
one shared notification stack/live region, including setup and the chapter editor.
Errors persist until dismissed; success messages time out, except one-time invitation
results. Feedback is client-only React text, never browser-persisted or included in
SSR props. Field validation and interactive recovery controls remain with their forms.

`src/pages/reader` provides safe SSR prose, chapter navigation, device preferences, local speech and revisioned account progress/feedback. `pages/admin/Comments.tsx` provides reaction configuration/preview. The explicit public-only download worker lives in crates/web/assets/reader-sw.js; it never caches account APIs or Studio. See docs/reader_progress.md.

Reader header/navigation, image-only reaction counts and useMeasurements.ts provide measured reading. ReadingAnalytics.tsx/StoryStatus.tsx own Studio analytics/status; EmojiPicker.tsx uses bundled twemoji.json names and fixed same-origin images. scripts/update-twemoji.py regenerates asset/index sources from reviewed input files.

Genre discovery in `Home.tsx` reuses `WorkArt` for its image-backed name/subgenre
hero, choosing the main genre image before bundled artwork. Its icon back link
retains the existing translated accessible name and subgenre controls retain URL
and browser history state.

`pages/comments/` owns closed inline discussion formatting, Twemoji, GIF selection and threads. `components/Notifications.tsx` owns the private header inbox. Reader speech runs Kokoro.js in a separate worker; `scripts/copy-tts.mjs` packages its local WASM assets. See docs/comments_progress.md.

Comment composers use the existing Tiptap runtime with a restricted inline schema,
Twemoji atoms and closed Markdown serialization in `pages/comments/document.ts`
and `editor.ts`. GIF search debounces for 200 ms; blank queries request trending.
Both emoji pickers share complete labelled Unicode category groups.

Reader chapter artwork uses the shared `WorkArt` layer in a full-width hero below
its header. The title/synopsis/estimate keep the selected reading width; disclosure
notices remain before prose. The image is included in explicit offline downloads.
