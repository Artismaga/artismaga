# Own-account configuration coverage

The settings page is an initial foundation for the full roadmap, not a claim that
all reader, community or billing features exist.

| Area | Working now | Reserved for future features |
| --- | --- | --- |
| Profile | Display/pen names, biography, safe website/social links, Gravatar | Public profile pages and published works |
| Account | Password change, new-inbox email confirmation, verification/recovery, session revocation, JSON export, password-confirmed deletion | Passkeys, two-factor authentication, connected-device trust and billing/payouts |
| Reading | Saved defaults, live typography preview; immediate light/dark/sepia/system preview; Save persists it | Chapter reader, TTS playback, bookmarks, offline storage and sync |
| Content | Saved language/timezone, mature-content/warning defaults and recommendation exclusions | Translation, discovery filtering and recommendation enforcement |
| Notifications | Saved channels, cadence and per-event preferences | Durable delivery, notification centre, push and feeds |
| Privacy | Private-by-default library/history, saved profile/activity/list/review visibility | Domain-specific visibility enforcement when those domains exist |
| Accessibility | Reduced motion, higher contrast and larger controls preview immediately; Save persists them | Reader keyboard/announcement features and a full accessibility audit |
| Administration | Branding, announcement/support link, locale defaults, signup policy, safe default non-administrator role, custom role/permission management, UI base colour, default cover, private local/S3/R2 configuration, directory/group assignment and invitations | Taxonomy, moderation, search and job management |
| Analytics | Explicit skeleton cards/charts and a roadmap of planned reporting | Event collection, aggregation, filters, exports, commerce and retention metrics |

Profile/preferences/configuration updates use optimistic revisions to avoid silent
overwrites from other tabs. Refresh after a conflict before reapplying changes.
The administrator dashboard never invents audience or revenue values. Its live
status cards describe only currently connected infrastructure and configuration.
The interface currently uses English; language choices are persisted for future
localisation and do not mislabel the document’s actual language. Session labels
use coarse browser/platform names only; raw user-agent strings and IP addresses
are not saved. Tabs preserve unsaved form state and use subdirectory URLs. Appearance previews are immediate; saving keeps them for future visits.
SMTP configuration remains part of installation/owner-private configuration; the
dashboard reports whether it is configured without returning credentials.

Deletion/export cover current accounts and Studio metadata; private artwork deletion is queued and retried. See studio_and_storage.md. Any future domain
must extend both use cases before collecting its user data. Anonymous discovery
currently has no stories; its featured section and shelves deliberately remain
static skeleton placeholders. Styling rules and reference layouts are documented
in [the design system](design_system.md).

Recommendation exclusions now use searchable Mantine TagsInput with known genres/
subgenres, tags, public authors and public stories. Identifiers are saved for entity
selections, names are displayed, and non-public works never appear. Publication and
recommendation enforcement are still planned, so empty public-story/author results
are expected until publishing exists. See chapters_and_taxonomy.md.

Content preferences include an opt-out from automatically translated user content.
Approved human translations remain eligible regardless of that opt-out. Disabled
site themes are filtered from ordinary users' reading preferences and receive an
enabled fallback if a previous choice is no longer offered.
