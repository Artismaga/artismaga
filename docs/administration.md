# Administration and site analytics

Administration now separates Overview, Configuration, Identity, People, Roles,
Localisation, Genres/Tags and Announcements. Storage is part of Configuration.
The old `/admin/storage` entry renders Configuration for compatibility.
Identity has `/admin/identity/site` and `/admin/identity/themes` navigation.

Site name and Discovery headline edit `site.name` and `discovery.headline` in the
source locale. Save drafts, preview them as an authorised localisation editor,
then explicitly confirm publication. Other identity metadata and six HTTPS social
links are saved independently. Social links appear as accessible sidebar icons;
the sidebar footer contains a copyright disclosure.

Built-in Light, Dark and Sepia themes expose a declarative colour option. The base
colour generates the whole UI's surface/text/border/accent palette. Each theme can
be hidden from ordinary users while administrators can preview it. At least Light
or Dark must stay enabled. Users with a disabled saved preference receive an enabled
fallback; they cannot select hidden options. Custom is an empty, collapsible category
reserved for future theme installation and declared configuration controls.

## Announcements

`manage_announcements` permits creating/editing/cancelling scheduled notices and
promotions. Every announcement retains its original initiator and creation time,
even when another editor updates it. Cancelled and expired entries remain in the
management history; cancellation is reversible. Mutations use revisions to reject
stale edits. Notices support informational, warning and critical severity. Promotions
require an uploaded image and safe CTA URL; title, description and CTA text are
optional. Artwork fills the complete banner without a fade, with copy at the top
left and CTA at the bottom left. With no copy, the banner itself is a link.

Start/end dates are optional and entered in the editor's local time zone, stored as
UTC timestamps. Audiences are everyone, guests, authenticated users, subscribers,
non-subscribers or selected role groups. Subscriber membership is not implemented
yet: subscriber-only announcements remain hidden and all visitors currently count
as non-subscribers. No paid status is invented. Audience checks apply to homepage
SSR data and announcement image access. Administrators/editors can preview images
before a banner is public. Optional dismissal is stored on the visitor's device per
announcement revision; editing a banner can make its revised version visible again.
The history is searchable and paginated; past, scheduled and cancelled entries
remain reachable without downloading an unbounded history into the browser.

## Analytics

`/analytics` is separate from administration and requires `view_analytics`. Its
performance, traffic and account tabs use live counters; story traffic, taxonomy,
monetisation, retention, discovery and community sections retain clearly labelled
placeholders for future backends. Administration Overview retains live service health.

The panel polls every three seconds while visible. CPU and resident memory describe
the app process and managed renderer/translator children; GPU utilisation is available on supported Linux device sensors,
otherwise it explicitly reports unavailable. No GPU is required. Traffic/latency,
errors, successful login/registration counters and uptime reset when the app restarts.
Health probes, assets and telemetry polling are excluded. Samples are aggregated,
bounded to fifteen minutes and contain no visitor identifiers. This is operational
telemetry, not persistent historical analytics or a billing source of truth.

Automatic translations of announcement text use the same provider/content scoped
cache as work content. Cache misses queue bounded background inference and initially
show the original, so model preparation/inference does not block page rendering.
Users can opt out in content preferences. Content-changing edits automatically miss
the previous cache; human-reviewed keyed translations keep their draft/live workflow.

## Navigation and promotional layouts

Administration, Analytics, Discovery and Studio omit decorative page headings;
functional section labels remain. Identity/Announcements and Site/Themes have icons.
Theme availability stays on each theme card; the cog reveals its colour controls
and preview action. Sepia uses warm parchment surfaces and brown text while
interactive brand accents retain the configured theme colour.

Roles appear in left navigation with a single editor to the right. Create role
opens an empty editor there. Permission categories collapse without discarding
checked inputs; protected Administrator shows a shield and disabled editor.

Promotions do not expose severity. Their image fills the banner without a fade;
copy sits at the top left and a provided CTA at the bottom left. With all copy
empty, the image is an accessible link to the required CTA URL. The independent
dismiss control remains available when configured. Notices still use severity.

## Comments sections

`/admin/comments` configures up to six chapter reactions, optional titles, drag/button ordering, bundled Twemoji or sanitized custom raster images, and an unsaved mock preview. Comments themselves remain next-phase work. See reader_progress.md.

Comments now uses compact single-line reaction controls and a searchable bundled Twemoji picker. Custom-image changes delete replaced artwork only on Save. Platform configuration includes a disabled-by-default automatic abandonment delay after the initial four-month inactivity warning.
