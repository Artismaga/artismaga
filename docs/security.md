# Security model and foundation limitations

## Implemented controls

- First-party Rust has workspace-enforced `unsafe_code = "forbid"`. This does not
  claim that transitive dependencies contain no unsafe code.
- Passwords use RustCrypto Argon2id v19 defaults: 19 MiB, two iterations, one lane,
  random salts. Four blocking hash workers bound memory/CPU use. Missing accounts
  undergo dummy verification. Passwords require at least 15 characters.
- Random 256-bit session, invitation, and account tokens are hashed with SHA-256
  at rest, expire, and support revocation/atomic single use as applicable.
- Server-side sessions, fresh permission lookup, unique account constraints,
  transactional invitation redemption and password reset.
- HttpOnly, SameSite=Strict, path-scoped cookies; Secure when HTTPS is configured.
  Exact Origin validation on mutations blocks cross-site requests and login CSRF.
- Bound SurrealQL values, database tables with `PERMISSIONS NONE` for direct record
  users, and no database interface in browser or rendering code. The bundled
  unauthenticated database relies on its private network, as explained below.
- Body/rate limits, private pipe-based managed renderer, response security headers, CSP
  without inline scripts; Mantine style blocks use per-response nonces and style attributes are allowed for component sizing, no-store account responses, no-referrer policy.
- React escaping throughout TypeScript JSX; no caller-provided raw HTML insertion. Never insert story rich text without a reviewed sanitization policy.
- SMTP uses certificate-validated TLS. Reset credentials are URL fragments so they
  do not reach server access logs or referrers. Browser code clears the fragment.
- Gravatar only; no avatar upload endpoint or locally hosted profile images.

## Operations and limits

This is an initial framework, not a completed production platform or security
audit. Review dependencies and deployment settings before exposing real accounts.
Only the app website port is published, on loopback by default. SurrealDB has no
host port mapping and lives on a dedicated Docker network marked internal, shared
only with the app in Compose. It uses `--unauthenticated` within that boundary, so
no SURREAL_USER/SURREAL_PASS are needed. Network isolation is the database's trust
boundary: never publish it, attach untrusted containers, or treat table permissions
as a substitute for network isolation. Separately managed databases can use optional
username/password configuration; separate schema/runtime privileges there as needed.
Both shipped services run non-root with image-prepared volume ownership.

The renderer is a trusted child process, communicates only through private pipes,
has no listener or service, and receives scoped props with runtime schema checks.
Its environment is cleared except PATH. Requests/responses and queue/wait time are
bounded; crashed/timed-out children are killed and restarted on the next render.
This is process management, not a security sandbox. Future untrusted JavaScript
extensions must run in a separately designed capability-restricted environment.

First-time setup requires HTTPS (or localhost HTTP), a random 256-bit private code,
and a matching Host/Origin plus peer throttling. The code is displayed only by an explicit operator command.
Setup pages never include it or other credentials. Administrator creation, selected
registration policy, and the permanent installation marker commit together. A
private configuration file is atomically staged beforehand, allowing interrupted
setup to recover. File locking and the DB transaction close concurrent/repeated
claims. A configured site never mounts setup routes. Missing app config with existing
accounts fails startup rather than granting someone replacement ownership.

The installer is single-instance oriented. Back up both state volumes, protect
host/Docker access, and terminate public traffic through a TLS proxy preserving
Host/Origin. Enable HSTS there. SMTP settings are syntactically checked; actual
provider delivery still needs separate operator verification. Administrator passwords
are hashed, not stored in configuration; SMTP secrets are persisted owner-private.

Rate limiting is per-process/direct-peer, not distributed or per-account. It is a
foundation control; use edge limits for proxy deployments and add shared anti-abuse
controls before scaling. Four password workers bound computation but do not replace
connection/request limits at the proxy. Email dispatch runs in a bounded, four-task best-effort background pool so account
lookup/SMTP timing does not reveal account existence to HTTP callers. Mail outages
or a process restart require user retry. There is no durable email queue.

Open registration should be enabled only when verification mail is working. New
users can sign in unverified, but content capabilities require verified email.
Local exploration without SMTP cannot verify new readers; the explicitly installed
administrator is verified. Do not add development endpoints that expose reset tokens.

Gravatar receives visitors' IP addresses and hashed email identifiers when images
load; hashing does not make email identifiers anonymous. Disclose this to users in
the eventual privacy policy. Public UUIDs and group names are intentionally public
account fields; email addresses are restricted to the authenticated owner’s settings DTO, never public pages or the administrator directory. Private reader progress/history now exists; see reader_progress.md.

Own-account export/deletion, password-confirmed password/email changes, session
metadata and individual/all-session revocation are implemented. Email changes require
confirmation through the new inbox; no SMTP means no email change. Session metadata
is informational and does not establish trusted devices. Legacy sessions may lack it.
Deletion covers currently implemented account/profile/preference/session/token records;
Studio extends deletion/export now; future domains must do the same before launch. Last-administrator
protection uses a shared membership revision write within each deletion/role
transaction to prevent concurrent count-based write skew. Passkeys/2FA, moderator sanctions, durable audit logs,
and breach-response tooling remain planned. Private Book metadata, sanitized artwork uploads and explicit sharing are now implemented; chapter information/hierarchy and seven-day recovery are implemented; chapter body writing is implemented; explicit public catalogue snapshots are implemented; chapter-body publication is now implemented; payments, plugins and MCP editing remain planned. Future JavaScript
extensions need a separate sandbox and capability model, never unrestricted Node.

## Reporting

Use the repository host's private vulnerability-report facility if available, or
contact the repository maintainers privately. Do not include credentials or private
user data in public issues. No security contact address has been invented here.

## Design references

- [Rocket request guards and cookies](https://rocket.rs/guide/v0.5/requests/)
- [SurrealDB RPC query variables](https://surrealdb.com/docs/reference/rest-api/rpc-protocol)
- [React server rendering](https://react.dev/reference/react-dom/server/renderToString)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Work, roles and storage

Studio derives its actor from the session and current role. All draft, share,
metadata and media reads enforce ownership/administrator/explicit collaborator
access server-side; cover IDs cannot claim another user’s unshared upload. Work
revisions serialize shared edits and revocation. The built-in Administrator role
is immutable, and custom roles cannot grant administer; default signup roles are
checked transactionally against non-administrator persisted roles.

Artwork input formats, decoded allocation/dimensions, upload concurrency/body time
and provider operations are bounded. Originals are re-encoded to strip metadata;
SVG is not accepted from users. Local paths and object IDs are generated server-side.
R2 endpoints derive from validated account IDs, AWS uses standard endpoints, and
buckets remain private. No credential or signed URL reaches SSR or the browser.
Provider secrets are authenticated-encrypted under an atomic owner-private key in
the app volume. Backups must preserve storage.key as well as database/media data.
Provider changes retain old locations; key rotation updates the matching location.
Account deletion queues physical removal with retries, so application access ends
before a temporarily unavailable cloud provider finishes deletion. Branding defaults
remain site data. See studio_and_storage.md for the exact boundaries and limitations.

Collaborator emails resolve only on grant submission; name search never returns
email addresses. Batches validate every recipient before their single transaction.
Suggestions expose configured vocabulary and public work/author metadata, never
private draft titles/tags. Chapter restore checks the deadline on every command;
expired rows/covers are purged by the hourly worker with durable physical-deletion
retries. Revisions serialize edits, recovery, purge and sharing revocation. Genre
assets become public only when referenced by saved site taxonomy. See the creative
configuration guide for quotas and the remaining orphan-upload limitation.

Localisation drafts and editor metadata require `configure_localisation`, checked
on every request and SSR assembly. Work language grants do not grant source-edit
rights; approval is bound to source fingerprints and saved draft revisions. Template
placeholders are validated against a trusted registry and rendered as plain escaped
text. The model file and runtime source are pinned and verified. Inference listens
only on loopback with an ephemeral bearer secret and no web UI; only app-mediated
requests can reach private content. Provider secrets are encrypted and write-only.
Changing providers invalidates cached output. Model output never authorises actions,
executes tools, or publishes translations by itself.

Announcement audience/schedule checks happen before public SSR data leaves the
server, and also govern image reads. Management requires `manage_announcements`;
creator attribution cannot be changed by updates. CTA/social URLs reject executable
schemes and credential-bearing URLs. Analytics requires `view_analytics`, retains
bounded aggregates only, and never invents unavailable measurements. Hidden themes
remain previewable by administrators; normal users receive enabled theme choices.

Audience ranges describe author intent only; they do not grant access, replace
content disclosures or establish regulatory classifications. Audience updates use
the same server permission and revision checks as other work configuration.
Textless promotional links use the same safe-URL validation as CTA buttons;
removing their visible copy does not bypass artwork ownership or audience checks.

## Private chapter manuscripts

Manuscripts use a closed, server-validated JSON vocabulary, bounded depth/node
counts, 750 KB maximum serialized size, safe URLs and no arbitrary HTML or style
attributes. React escapes all SSR prose; Tiptap activates after hydration. Paste
cleanup strips scripts, embedded media, external styling and unsupported markup;
server validation remains authoritative. Checkpoint/body APIs require the current
work access. Writes also require writing capability and editor access, check an
active non-archived chapter, and compare draft revisions transactionally. Notes
share the work’s private access and must never appear in future public readers.

Device recovery stores a plain-text JSON manuscript in browser localStorage under
an account/work/chapter key for at most seven days. Successful saves and explicit
discard remove matching copies. It protects against interruption, not another
person controlling the same browser profile or an installed extension. Avoid shared
browser profiles for private writing; browser data controls can erase local copies.
Revision conflicts stop autosave until the author compares and explicitly chooses
a version. No cloud proofreading service is called. Browser spelling features
follow the browser’s own dictionary and enhanced-checking privacy settings.

Authenticated chapter saves/restores use a separate 120 requests/minute/account
quota with a bounded 10,000-account map. Same-Origin and direct-peer requirements
remain mandatory; the existing low unauthenticated sign-in budget is unchanged.
JSON transport is capped at 1 MiB and manuscripts are validated to 750 KB.

Checkpoint tables resolve only Gravatar avatar URLs server-side, never account
emails or internal attribution IDs. Comparison text uses the closed rich-text
renderer with React-escaped insertion/deletion elements, never generated HTML.
The read-only comparison has no editable DOM, autosave or text mutation commands.

Client hydration supplies the response nonce to `get-nonce`, used by Mantine’s
scroll-lock style singleton. This keeps modal scroll isolation working under the
existing CSP; no script/style policy is relaxed. The nonce is set only in the
browser bootstrap, never shared between server-rendering requests.

## Public catalogue snapshots

Publication requires publish capability and owner/admin authority with writing
access. Both work/details revisions and owner/admin authority are checked in the
publication transaction. Only explicit public metadata and active chapter metadata
are copied; manuscript bodies, outlines, notes and collaborators never enter public
DTOs. Draft edits remain separate. Current snapshot references authorize public
artwork reads; unpublishing revokes that entitlement but cannot recall downloaded
images. Media attachment serializes with retirement. Account deletion removes
owned snapshots and snapshots using deleted artwork. Hidden recommendations filter
SSR results without exposing the account's private preference arrays. These are
recommendation preferences, not a promise that public images cannot be fetched.

## Public reader, state and offline copies

Explicit publication now copies validated chapter document/language into separate
public chapter records; private outlines, notes and checkpoints remain private.
Saved drafts do not update a released body. Work/details/draft revisions and
owner/admin authority serialize individual publication against revocation/archive.
Reader SSR is anonymous even when a session cookie exists. A separate no-store API
returns only the current account's reading position/reactions/rating; mutations
require exact Origin, a current session, bounded values, optimistic revisions and
per-account throttling. State writes bind an expected account hint to the current session,
preventing a stale reader tab from syncing into a different signed-in account.
Feedback changes also check comment/review capabilities.

Device reading state is plain-text localStorage scoped to account/chapter (guests
have a separate scope); the last reader account hint is session-local for offline
restoration. Browser data is not a private backup. Explicit chapter downloads use
per-chapter Cache Storage and an allowlisted worker, with no private API/Studio
caching. Downloads are public copies and persist until cleared/evicted; unpublishing
cannot revoke them. Shared browser profiles can expose downloaded content/history.
Read aloud selects local device voices and does not call application cloud services.

Reaction configuration accepts at most six stable IDs and bounded plain titles.
Custom images use administrator-only bounded/re-encoded raster uploads, private
storage providers and configuration-based public ACLs. External image URLs, SVG
uploads and arbitrary markup are rejected. Reaction art is site-owned after upload.

## Reading engagement measurements

Measurements require same-Origin POST and bounded account/direct-peer throttling.
They never trust a supplied account/viewer ID. Guest cookies are random, HttpOnly,
SameSite=Strict, secure on HTTPS and expire after 32 days; digests alone are stored.
Account digests remain pseudonymous and can be linked to known account IDs; they are
not an anonymity guarantee. No raw IP address or user agent enters measurement rows.
The app removes deduplication history after 32 days while retaining aggregate counts.
These browser reports are not verified human views or verified reading completion.

A transaction couples each daily deduplication claim to its aggregate. Current
ratings/reactions update by delta inside the account progress transaction, with
current permissions and expected account binding retained. Account deletion
subtracts its feedback and removes its reports; private history is never sent to
other viewers or collaborators through analytics. Studio sees aggregate counts only.
Status and auto-abandonment writes compare revisions/status/latest release and
serialize on the parent work. Staged chapter releases are inaccessible publicly
until the story is published, and story publication requires an active release.
Custom reaction replacement retires images on Save, with a durable storage queue;
unsaved UI changes cannot revoke artwork used by the live configuration.

## Community foundation

Comment commands bind the displayed account to the current session and recheck the
persisted verified account/role inside their transaction. Only owners edit; owners,
administrators and Manage Comments delegates delete. Creation and author/reply
notifications commit atomically. Inbox reads, read marks and dismissal always derive
the owner from the session. Deleted/unpublished targets are not served in the inbox.
Bodies are bounded plain text with closed React formatting, not inserted HTML.
Mutes suppress notifications; Report/Block are disabled pending moderation work.
The current per-chapter cap is 500 comments; larger-discussion and stronger abuse
controls remain future work.

KLIPY keys are encrypted under storage.key and write-only in administration. The
server sends bounded search terms to KLIPY and allows direct image delivery only from provider-selected URLs at
static.klipy.com, static1.klipy.com and static2.klipy.com. The visitor’s browser
contacts KLIPY’s CDN for images; the application does not cache media. No account IDs or comment
text are sent to the GIF search provider. Provider tests use synthetic fixtures.

Kokoro.js downloads public model assets from Hugging Face when local speech is
requested on eligible English/WebGPU devices. Inference receives chapter text only
inside a dedicated browser worker; the text is not uploaded. That worker alone
allows WASM compilation and Hugging Face asset connections. Native fallback prefers
a local voice, then an available matching browser voice, which may use the browser
vendor's speech service. Model and browser cache data can be removed through browser
site-data controls. Timed-out/failed generation falls back; real-device speech still
requires dedicated verification. Service-worker notifications are best effort while
pages are active, and never cache or relay private inbox payloads between sessions.
