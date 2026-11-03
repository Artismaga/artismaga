# HTTP API

JSON request and response bodies; errors are `{ "error": "message" }` with an
appropriate HTTP status. Configured-site mutation requests require exactly one `Origin`
header equal to configured `public_url`, including CLI clients. Cookies are
same-origin; there is no permissive CORS. JSON bodies are limited to 1 MiB (setup: 16 KiB).
Do not put passwords or credentials in query parameters.

## Public pages and health

- `GET /`: React-rendered public discovery catalogue.
- `GET /account/{login,register,profile,settings,verify,reset,email,admin}`: server-rendered pages.
- `GET /assets/client.js`, `GET /assets/theme.css`: compiled-in Mantine hydration assets.
- `GET /health/live`: process liveness, no dependency checks.
- `GET /health/ready`: checks database settings and an actual SSR render; 503 on failure.

`GET /admin` and `/account/admin` require administrator permission; own settings display sign-in without a session. Authorization is also enforced on every API.
Pages return 503 rather than an empty client-only shell when SSR is unavailable.

## First-time setup

Unconfigured installations mount a separate installer surface. `GET /` redirects
to `GET /setup`, which returns the React-rendered wizard. Account/admin APIs are
absent until installation completes. `POST /api/setup` requires a single browser
Origin matching the request Host, HTTPS (or localhost HTTP), direct-peer throttling,
and a valid setup code.
The configured site's exact-Origin rule applies to all normal mutations afterwards.

Setup JSON fields:

- `setup_code`: private code obtained with `docker compose exec app artismaga setup-code`.
- `site_name`, `public_url`: branding and exact external origin (no path/trailing slash).
- `signup_mode`: `open`, `invitation`, or `disabled`.
- `admin_email`, `admin_name`, `admin_password`: the first administrator; 15–128-character password.
- `mail`: null for local exploration, or `{ host, username, password, from }` SMTP settings.

Unknown fields are rejected. Public HTTPS configuration requires SMTP. The password
confirmation field is client-side only and is not sent to the API. Success returns
`message`, closes setup, and hands the listener to the configured site; the client
waits for `/health/ready` to report `ready`. During installation readiness reports
`setup_required`. Configured servers return 404 for both setup routes. A missing
or invalid code/Origin returns 403; a known repeated claim returns 409. Validation
failures return 400 with no credentials or raw persistence diagnostics. Concurrent
claims commit at most one owner. See setup.md for crash recovery and volume ownership.

## Accounts

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /api/auth/register` | `email`, `display_name`, `password`, optional `invitation` | Creates an unverified Reader or Author according to site configuration; no implicit login |
| `POST /api/auth/login` | `email`, `password` | `user` public DTO and HttpOnly session cookie |
| `POST /api/auth/logout` | none | Revokes current session, clears cookie |
| `GET /api/auth/me` | none | Current public user; 401 without a valid session |
| `POST /api/auth/sessions/revoke` | none | Requires login; revokes every session for the current user |
| `POST /api/auth/email/verify/request` | `email` | Generic eligible-account response; requires SMTP |
| `POST /api/auth/email/reset/request` | `email` | Generic eligible-account response; requires SMTP |
| `POST /api/auth/email/verify/confirm` | `token` | Consumes valid token and verifies email |
| `POST /api/auth/email/reset/confirm` | `token`, `password` | Consumes valid token, changes password, revokes all sessions |

Passwords must contain 15–128 Unicode characters and at most 512 UTF-8 bytes.
Email addresses are trimmed and lowercased; ASCII only for this foundation. Display
names contain 1–80 characters, with no control characters. Gravatar uses SHA-256
of the canonical email and requests a general-audience identicon fallback.

The public user DTO includes `uid`, `display_name`, `group_key`, `email_verified`,
and `avatar_url`; it never includes email, password hash, or session credentials.
Login failures use generic messages. Registration failure intentionally combines
duplicate email, validation, policy, and invitation failures.

## Administration

Requires a current user whose persisted permission group includes `administer`.
All POST routes also require Origin protection. Invitation codes are returned once;
operators distribute them themselves. The platform does not send invitations.

| Method and path | Body | Result |
| --- | --- | --- |
| `GET /api/admin/settings` | none | Current `signup_mode` |
| `POST /api/admin/settings` | `signup_mode`: `open`, `invitation`, or `disabled` | Persists registration policy |
| `POST /api/admin/invitations` | none | Single-use `invitation` and `expires_in_days: 7` |
| `GET /api/admin/groups` | none | Available group keys, names, permissions |
| `POST /api/admin/users/<uid>/group` | `group_key` | Assigns an existing group to an existing account |

Self-reassignment is rejected to prevent accidental administrator lockout. Removing the last administrator is rejected transactionally. Role editing is available through the role routes below. Audit history, suspensions, passkeys and 2FA remain roadmap work.

Example for a local administrative client (use a protected cookie jar and avoid
writing credentials into shell history):

```sh
curl --cookie cookies.txt --header 'Origin: http://localhost:8000' \
  --header 'Content-Type: application/json' \
  --data '{"signup_mode":"invitation"}' \
  http://localhost:8000/api/admin/settings
```

Mutation throttling is currently 30 requests per direct peer IP per 15 minutes per
application process, with a bounded 10,000-peer map. Behind a reverse proxy this
means a shared quota: configure edge rate limiting and plan shared throttling
before multi-instance or high-traffic deployment. Untrusted forwarding headers
are deliberately ignored. A limit failure returns 429.

## Own-account configuration

All routes require a valid session; POST also requires Origin protection. No route
accepts another user’s UID. Settings schemas are in `web/src/shared/settings.ts`
and `crates/accounts/src/lib.rs`. Updates return a new `revision`; stale writes
return 409. Validation failures return 400 without persistence diagnostics.

| Method and path | Body / result |
| --- | --- |
| `GET /api/account/` | Own user, email, profile/preferences and separate revisions |
| `POST /api/account/profile` | `{ revision, display_name, profile: { pen_name, biography, website, links: [{ label, url }] } }` |
| `POST /api/account/preferences` | `{ revision, preferences: { reading, content, notifications, privacy, accessibility } }` |
| `POST /api/account/password` | `current_password`, `new_password`; revokes all sessions |
| `POST /api/account/email` | `current_password`, `email`; sends new-inbox confirmation or 503 without SMTP |
| `POST /api/auth/email/change_email/confirm` | `token`; confirms pending address and revokes sessions |
| `GET /api/account/sessions` | Session identifier, optional creation/device metadata, expiry, current flag; never token digests |
| `POST /api/account/sessions/<sid>/revoke` | Revokes only a session owned by caller |
| `GET /api/account/export` | JSON attachment with own account/settings/session metadata |
| `POST /api/account/delete` | `current_password`, `confirmation: "DELETE"`; deletes current implemented account data |

`GET /api/admin/configuration` returns `{settings: {revision, configuration}}`. POST accepts
`{revision, configuration}`: branding fields, support URL, default language/timezone, signup
mode and default non-administrator group, `primary_colour` (six-digit hex) and `default_cover` (administrator artwork ID or null). Updates are transactional.
`GET /api/admin/users?offset=0&search=...` returns up to 20 public account DTOs;
no email addresses, password hashes or private settings. Analytics currently have
no ingestion/reporting API; dashboard charts are labelled skeletons.

## Path tabs and roles

`GET /admin/{overview,configuration,people,roles,storage}` requires administration.
`GET /account/settings/{profile,account,reading,content,notifications,privacy,accessibility}`
uses the signed-in owner’s settings (or sign-in). Unknown sections return 404.
The legacy base URLs still open Overview/Profile. Tabs no longer use fragments;
email confirmation links continue to use fragments for token privacy.

`GET /api/admin/roles` returns `roles` with key/name/permissions/revision.
`POST /api/admin/roles` accepts `{key,name,permissions,revision,create}`. Role keys
are immutable lowercase identifiers. Supported permissions are create_story,
publish_story, comment and review. `administer` is reserved to the immutable built-in
Administrator role. `POST /api/admin/roles/<key>/delete` takes `{revision}` and only
removes unused custom roles. Built-in or assigned/default roles cannot be removed.
Changes apply to existing sessions on their next request.

## Storage and artwork

`GET /api/admin/storage` returns `{settings:{revision,location,credentials_set,retained_locations}}`.
`POST` accepts `{revision,location:{kind,bucket,region,account_id},access_key_id,secret_access_key}`.
Kinds are local, r2 and s3. Null/empty credentials preserve the matching location’s
saved value; a new cloud location requires both. No GET ever returns credentials.
Saving uses optimistic revision checks; no cloud request is made just to save.

`POST /api/artwork?purpose=cover|hero|default_cover|chapter_cover|genre_image|genre_hero` accepts raw image bytes, not JSON
or multipart. Requires writing permission, or administer for default_cover and genre artwork. Input
is limited to 8 MiB/20 seconds; only PNG/JPEG/WebP are decoded, resized and re-encoded.
Success returns `{asset:{uid,url,palette}}`. `GET /media/<uid>` is private except
for the configured site default cover and referenced genre artwork. See studio_and_storage.md for limits and encryption.

## Studio

`GET /studio?search=&filter=all&sort=accessed&offset=0` serves a private catalogue.
Filters: all, owned, drafts, shared. Sorts: accessed, edited, name, created.
`GET /studio/new` requires writing permission. `/studio/<uid>` opens a private work;
`/<section>` supports overview, chapters, disclosures, related, analytics and settings.

`POST /api/studio/works` takes `{title,subtitle,synopsis,work_type:"book",cover,hero}`;
cover/hero are optional sanitized artwork IDs or null. Success supplies the new URL.
`POST /api/studio/works/<uid>` takes `{revision,value:{...same metadata...}}`.
Stale or revoked edits fail; owner/editor access plus writing capability is required.
`POST /api/studio/works/<uid>/shares` takes `{recipients:[selected_uid_or_exact_email,...],can_edit,remove}` (1–50 recipients) and requires ownership/administration. The legacy single `uid` field is also accepted. All recipients validate before the batch commits. Removing a collaborator invalidates stale work revisions.
All mutations require the existing exact Origin and peer limits.

Account export format version 2 adds owned work/artwork metadata, chapter/classification/disclosure configuration, incoming share
grants and last-access records; image binaries and storage credentials are excluded.
Account deletion removes Studio metadata and queues physical private-artwork removal.

## Creative configuration and suggestions

- `GET /api/studio/works/<uid>/people?search=`: sharing owners/administrators only;
  name substrings of 2–100 characters, up to 20 `{uid,display_name}` results. No email
  search or email fields. Exact emails resolve only during batch grant submission.
- `GET /api/studio/works/<uid>/details`: authorized `{details:{revision,value}}`;
  value contains nodes, genres, tags and disclosures, omitting expired chapters.
- `POST /api/studio/works/<uid>/details`: `{revision,command}`; requires editing
  access and writing capability. Returns details, the parent work revision and message.
  Commands are tagged by action:
  `save_node` (uid nullable, kind volume/arc/chapter, parent nullable, title,
  synopsis, cover nullable), `move` (uid, parent, before nullable), `archive` (uid),
  `restore` (uid), `remove_group` (uid), or `metadata` (genres, tags, disclosures).
  New node IDs and deletion deadlines are server-generated. Genre selections are
  `{genre,subgenre}`; disclosures contain nullable gore/self_harm/assault/adult strings.
  Invalid, revoked or conflicting commands return 409. No permanent-purge route exists.
- `GET /api/vocabulary`: signed-in users; configured taxonomy plus effective premade
  tags. `POST /api/admin/taxonomy`: administrator; `{revision,value}` optimistic save.
  Value contains premade_genres, allow_arbitrary_tags, premade_tags, genres and tags.
  Genre fields: key, name, parent, colour, icon, image, hero. Vocabulary is capped at
  300 genre records, 5,000 additional tags and 128 KiB serialized policy.
- `GET /api/suggestions?kind=genres|tags|authors|stories&search=`: signed-in,
  bounded `{options:[{value,label}]}`. Optional selected is a comma-separated list
  of up to 40 IDs for current public labels. Search is at most 100 characters, results
  at most 30 plus selected labels. Optional scope=allowed restricts tag suggestions to the current authoring policy; the default known scope also includes historical public-work tags. Public stories/authors require two search characters.
  Draft titles/tags and emails are excluded. See chapters_and_taxonomy.md for policies.

Localisation: `POST /api/localisation/select`, `/keys`, `/settings`, `/preview`,
`/translation`, `/translate-key`; `GET /api/localisation/runtime`. Only language
selection is public; editor operations require `configure_localisation` and mutations
require origin protection. Key updates carry revision, publish/discard flags.
Studio translations: `GET|POST /api/studio/works/:uid/translations`,
`POST .../translations/access`, `.../translations/source`, `.../translate-content`.
Drafting/approval checks are per work and language; generation respects content
preferences and returns approved current translations ahead of automatic output.

Site analytics: `GET /analytics[/performance|traffic|accounts|stories|genres|tags|monetisation|retention|discovery|community]`
and `GET /api/analytics/live` require `view_analytics`. The latter returns live,
process-lifetime aggregate metrics and service status, never visitor identifiers.
Identity: `GET /admin/identity/site`, `/admin/identity/themes` and
`GET /api/admin/identity-keys` require administration permission; source key edits
use the localisation API. Versioned configuration includes theme availability,
per-theme colour options and public HTTPS social links.
Announcements: `GET|POST /api/admin/announcements` require
`manage_announcements`; saves include UID (null for new), revision, value and a
cancelled flag. There is no destructive history-delete endpoint. Image upload uses
`POST /api/artwork?purpose=announcement` with the same permission; reads enforce
current audience/schedule or editor access. Public homepage SSR contains only
currently eligible announcements.

Announcement history accepts `GET /api/admin/announcements?offset=0&search=...` and
returns up to 50 records, `has_more`, and `next_offset`. All archived/cancelled and
scheduled records remain searchable; no history is removed by pagination.

### Work target audience

`POST /api/studio/works/<uid>/details` accepts `command: {"action":"audience",
"target_audience":{"minimum_age":13,"maximum_age":17}}` with the current details
`revision`. Ages are integer 0–120; maximum requires minimum and cannot be lower.
Both null clears the range; minimum alone means that age and above. Current work
editing authorization, Origin checks, and transactional revision checks apply.
Responses/SSR include `details.value.target_audience`; older documents default to
null bounds. Configure the range in `GET /studio/<uid>/overview`; the previous
`GET /studio/<uid>/audience` path remains an alias showing Overview.

Promotion announcement text fields may be empty. Uploaded image and safe CTA URL
remain required; empty title/description/CTA text produces a single image link.

### Chapter manuscripts

- `GET /studio/<work>/chapters/<chapter>`: private server-rendered writing page.
- `GET /api/studio/works/<work>/chapters/<chapter>/draft`: `{editor:{chapter,draft,can_edit}}`.
- `POST .../draft`: `{revision,value:{document,chapter_note,notes,language},checkpoint}`; returns
  `{draft:{revision,value,updated_at,author_name}}`. Stale/revoked writes return 409;
  invalid documents return 400. `checkpoint=true` records a manual history entry.
- `GET .../history?before=<revision>`: `{history:{revisions,has_more,next_before}}`,
  up to 20 metadata rows, newest first, including `avatar_url` (Gravatar or null).
  Author names are checkpoint snapshots; avatar URLs resolve the current account.
  Internal account IDs and emails are never serialized. Omit before for the latest page.
- `GET .../history/<revision>`: selected full snapshot as `{draft:...}`.
- `POST .../restore`: `{revision,source_revision}`; copies the selected snapshot into
  a new current revision/checkpoint and preserves existing history.

All reads require work access and an active chapter; mutations also require current
writing/editor capability and same-origin mutation guards. The JSON node/mark and
note limits are described in chapter_editor.md. Chapter IDs are always scoped by
work. Account export format 5 includes owned drafts, revision checkpoints and public catalogue snapshots.

Chapter draft/restore mutations have a separate per-account limit of 120 requests
per minute; they do not consume the lower direct-peer sign-in/mutation budget.
The 750 KB manuscript limit still applies inside the 1 MiB JSON envelope.

## Publishing catalogue and discovery

Public SSR: `GET /`, `GET /discover/genres/<genre>` (server-selected `subgenre` and `page` queries),
and `GET /stories/<work>`. Only explicit publication snapshots appear. Mature-hidden
stories return 404 on direct public-page access; private Studio access is unchanged.

Authenticated, exact-Origin guarded endpoints under `/api/studio`:

- `POST /works/<work>/publish`: `{revision, details_revision, language, status,
  mature, disclosures_reviewed, related?, release_schedule?}`. Requires current publish permission plus writing
  access and owner/admin authority. Validates required saved setup and snapshots
  only public metadata/active chapter catalogue; returns public-page redirect.
- `POST /works/<work>/unpublish`: `{revision}`; same authority, removes snapshot.
- `POST /stories/<work>/feature`: `{featured}`; administrator only.
- `POST /stories/<work>/hide`: `{author}`; updates the authenticated reader's story
  or author exclusions using the existing bounded preference revision transaction.

Public artwork requires a current snapshot reference; storage remains private.
Publication conflict/validation errors are generic and never return database errors.
Account export format 5 includes owned publication snapshots. No reader, review or
report submission API is added. See publishing_discovery_progress.md for limits.

Expected release schedule refinement: `release_schedule` in the publish request is
now `null` or `{frequency, hour, weekday, month_day, timezone}`. Frequency is daily,
weekly or monthly; hour is 0–23. Daily requires null weekday/month_day; weekly
requires weekday 0 (Sunday)–6 and null month_day; monthly requires day 1–31 and null
weekday. Time zone must be a name in the app's bundled IANA registry. Legacy stored
free text is not interpreted as a recurrence. The next expected release/countdown
is informational and does not trigger publishing. Public `/assets/genres/<name>.webp`
serves a fixed list of twelve embedded genre backgrounds; arbitrary names return 404.

## Reader and chapter publication

- `GET /read/<work>/<chapter>`: anonymous SSR of a released public chapter body,
  disclosures and reading-order navigation. Missing/unpublished chapters return 404.
- `GET /api/reader/<work>/<chapter>/state`: own `{account,state,can_react,can_rate}`;
  guests receive null account/state. No user-selected account ID is accepted.
- `POST /api/reader/<work>/<chapter>/state`: `{account,state:{revision,position,reactions,rating,
  updated_at}}`. The account hint must match the authenticated session. Position is 0–1, rating null or integer 0–5, reaction IDs must be
  configured and distinct. Server sets update time/revision. Session, Origin and
  per-account autosave throttling apply; changed reactions/ratings require current
  comment/review capabilities. Stale state returns 409.
- `POST /api/reader/<work>/<chapter>/publish`: `{revision}` of the saved manuscript.
  Requires publishing/writing permission and owner/admin authority; a first chapter may be staged before the story is public. Work/details/draft checks happen transactionally.
- `POST /api/admin/comments`: revisioned `{revision,show_titles,reactions}` with up
  to six `{id,title,image}` entries. Admin/Origin guards apply; images must be fixed
  bundled Twemoji paths or authorized sanitized reaction uploads. Stale saves fail.
- `POST /api/artwork?purpose=reaction`: existing bounded private upload path with
  administrator authorization. Images become public only when saved configuration
  references them. Credentials/provider records never enter response DTOs.
- `GET /reader-sw.js`, `GET /assets/reactions/<fixed-name>.png`: same-origin offline
  worker and bundled reaction assets. Explicit downloads store public chapters only.

The story publish command exposes explicitly staged manuscript bodies with catalogue
publication. Unpublishing revokes public reader access and retains releases privately. Account
export format 6 adds own reading state. Downloaded copies cannot be recalled.

## Measured reading and lifecycle

- `POST /api/reader/<work>/<chapter>/measure`: `{position}` in 0–1. Exact Origin,
  direct-peer presence and a bounded reading budget are required. A random HttpOnly
  guest cookie or current account creates a server-digested viewer key. Views and
  95% completions are deduplicated per chapter/viewer/UTC day; no caller viewer ID
  is accepted. Missing public chapters fail without incrementing measurements.
- `GET /api/reader/<work>/<chapter>/stats`: public `{stats}` with views, completions,
  current rating count/sum and per-reaction counts, scoped to a public chapter.
- `POST /api/studio/works/<work>/status`: `{revision,status,hiatus_until}`. Status is
  ongoing/hiatus/abandoned/completed; a bounded Unix timestamp or null is allowed only
  for hiatus. Requires writing capability and owner/admin authority; stale saves fail.
- Comments configuration keeps `{revision,show_titles,reactions}` and optionally
  accepts `retired_images` (up to 100 owned reaction-media paths). Save retires replaced
  configured images and those unused draft uploads, preserving images still referenced
  by any configured reaction. Physical removal uses the existing retry queue.
- Site configuration adds nullable `auto_abandon_after_months`: null disables it;
  1–120 counts calendar months after the initial four-month inactivity warning.
- Work SSR adds scoped analytics, lifecycle and staged chapter IDs. Discovery SSR
  adds public scores/chapter aggregates and only the current account's resume map.

Chapter publication may precede story publication, in which case its body remains
private. Story publication now requires at least one explicitly released active
chapter and no longer automatically publishes saved drafts. Unpublishing revokes
public visibility while retaining private staged releases. Export format 7 adds
own reports, lifecycle and staged bodies. See reader_progress.md for metric definitions.

## Chapter comments and inbox

- `GET /api/comments/<work>/<chapter>`: bounded released-chapter discussion plus the
  current account's comment/delete capabilities, likes and muted account IDs.
- `POST /api/comments/<work>/<chapter>`: `{account, command:{action,uid,parent,body,gif,revision}}`.
  Actions: create, edit, delete, like, mute. Requires exact Origin and a current
  matching account; role/ownership/publication are rechecked transactionally.
- `GET /api/notifications`: own latest 100 notifications; no-store, authenticated.
- `POST /api/notifications`: `{uid,dismiss}`; false marks read, true deletes own entry.
- `POST /api/admin/comments/klipy`: administrator-only `{api_key}` (write-only;
  empty disables). Existing storage.key is required to restore encrypted settings.
- `POST /api/comments/gifs/search`: comment-authorized `{query}` (100 characters),
  up to 12 opaque GIF IDs. An empty/whitespace query selects trending; other queries
  select KLIPY search. `GET /api/comments/gifs/<uid>` redirects to validated provider-selected CDN media.

All mutations retain Origin guards and existing per-account throttling. Comment
bodies allow 4,000 characters/16 KB, no arbitrary HTML and no caller GIF URLs.
Account export is format 8 with community records. See comments_progress.md.
