# Chapter comments and notifications

Updated 3 November 2026.

## Implemented foundation

- Public released chapters have discussions. Signed-in, verified accounts with the
  Comment permission can post/reply, edit their own comments and toggle a unique
  heart like. New, Hot (likes, default) and Oldest sort siblings; browser localStorage
  remembers the choice. A discussion is currently bounded to its first 500 comments;
  further submissions fail explicitly. Larger discussions/pagination are future work.
- Replies retain their parent relationship and stop visual indentation after three
  levels. Deleting a comment clears its text/GIF while preserving replies. Owners,
  administrators and delegated Manage Comments accounts can delete with confirmation;
  only owners can edit. Revision checks reject stale edits/deletes.
- The composer has bottom formatting/send controls, Enter to send and Shift+Enter
  for newlines (IME composition does not send). The formatting editor displays
  bold, italics and spoilers directly, with selection-aware buttons and Ctrl/Command+B
  and Ctrl/Command+I shortcuts. A closed escaped Markdown representation preserves
  existing stored comments; typed/pasted emoji render as bundled Twemoji. React escapes text; arbitrary
  HTML, embedded scripts and user-supplied media URLs are not accepted.
- Both emoji pickers display all 4,009 bundled emoji in labelled Unicode categories,
  with optional name/code filtering and no result cap. The comment shield tooltip
  says “Administrator”; deletion authority remains based on server permissions.
- The GIF picker searches automatically 200 ms after typing stops, cancels stale
  requests and shows KLIPY trending GIFs for an empty query. Images fill natural-height
  masonry columns; hover adds a slight white tint without a button-pill background.
- KLIPY search is configured through Administration → Comments. Keys are write-only,
  encrypted with the existing storage vault and never included in public/SSR data.
  Search terms go to KLIPY through the server; GIF images load directly from the three documented KLIPY CDN hosts through
  validated reference redirects; no partner media cache is created. Automated tests do not contact KLIPY.
  The development key can be opted into with ARTISMAGA_DEV_CONFIG=config/dev.toml;
  ordinary installations never read that file. Saving an empty key disables search.
- Top-level comments notify the story author; replies notify their parent author
  and the story author without duplicates or self-notifications. Creation and inbox
  inserts commit together. Muting suppresses future notifications from that account
  and hides its comments in the current viewer's discussion. Block and Report remain
  visibly disabled, labelled as future features.
- The header bell opens an inbox with title, description, story thumbnail, unread
  indicator, mark-read and dismiss actions. Opening a target marks it read first.
  Settings is a disabled placeholder. Inbox records are private to their owner;
  unpublished targets are filtered. Dismissal deletes the entry.
- Active-page minute ticks wake the service worker, which deduplicates polls and
  relays invalidations to open windows. Private inbox contents are never cached or
  broadcast. Browsers may throttle background timers or terminate workers; this is
  best-effort active-page polling, not guaranteed background push.
- Account export format 8 includes comments, likes, mutes and inbox entries. Deletion
  removes personal community data and clears authored text while preserving threads.

## Still planned

Notification preferences/email/push; reports/blocking and moderation case tooling;
large-discussion pagination, abuse controls beyond existing mutation throttling,
full Markdown/editor parity, written reviews, and a complete accessibility audit.

## Verification

Regression coverage includes closed command validation, formatting escaping,
Twemoji, thread sorting/cycle handling, local speech eligibility, and real-database
comment/inbox authorization, stale writes, likes, mute suppression and tombstones.
The current run passed 59 frontend tests, frontend formatting/type/build checks,
localisation validation, workspace formatting/Clippy/tests and the full disposable
private-SurrealDB suite. Synthetic browser review covered comment submission,
reply composition, the header panel, hero placement and 390px layouts. Actual
Kokoro audio remains unverified; the explicitly authorised KLIPY smoke search
returned HTTP 403, so live GIF delivery remains unverified.
Non-English labels currently use reviewable English defaults and need translation.
