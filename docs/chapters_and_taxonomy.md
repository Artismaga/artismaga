# Chapters and shared fiction vocabulary

## Chapter configuration

Open a work's Chapters tab at `/studio/<uid>/chapters`. The toolbar above the list
creates chapters, searches titles/synopses/chapter numbers, jumps to a page, or
finds the page containing an absolute chapter number. There are 25 matching chapters
per page. Numbers follow reading order through the tree and exclude archived rows.
Ancestors remain visible on filtered pages; empty groups appear on the first page.
Search and pagination are currently local to this configuration view.

Volumes are top-level groups; arcs belong to a volume. Chapters may belong to an
arc, directly to a volume, or remain ungrouped. Group headings collapse/expand using
native disclosure controls. Configure renames/moves groups and edits chapter title,
optional brief synopsis (1,000 characters) and optional cover. Empty groups can be
removed; groups containing archived chapters must first be emptied or await expiry.

Drag a chapter's six-dot handle onto another chapter to insert before it, or onto
a group heading to append inside it. Alt+Up/Down on the handle moves within its
current group. Configure → Location supports keyboard and touch movement across
groups/pages and back to the root. Edit is deliberately disabled: the writer and
chapter body persistence are a separate next step.

Delete opens a confirmation and moves the chapter to the archive. The server fixes
the deadline at exactly seven days after deletion; Restore works strictly before
that time and keeps its original location/order. After expiry the chapter is omitted
from reads and cannot be restored, even if cleanup is delayed. Hourly cleanup
permanently removes expired chapter information and retires covers unused by any
other chapter. Retirement claims survive interruptions, and physical provider
removal retries through the storage queue. Shared covers remain until unreferenced.
Backups have their own retention; this is application deletion, not backup erasure.

Work details use independent optimistic revisions and also write the parent work
row, serializing edits against collaborator revocation. Invalid parent types,
missing groups, stale edits and inaccessible covers are rejected server-side.
The initial document design supports 2,000 nodes and 1 MB serialized configuration
per work. It fits bounded server rendering (2 MiB request / 8 MiB response). Split
chapter bodies and larger catalogues into separately paginated records before
raising these limits. The hourly batch processes 100 expired works and 100 cover
retirement jobs; overdue chapters remain inaccessible while later batches catch up.

## Genres, subgenres and tags

Administrators use `/admin/taxonomy`. Each genre or subgenre has a stable key,
display name, hex colour, shipped icon name, optional small image and hero image.
Only one subgenre level is allowed. Artwork uses the same bounded sanitizer as
work art and becomes public only after a saved taxonomy entry references it.
No arbitrary SVG/HTML/icon markup or external image URL is accepted.

Starter genre import is enabled by default. First use supplies twelve broad genres
and their subgenres. Saving with import enabled adds missing starter entries while
preserving administrator edits. Disable import before removing/replacing starter
entries. Turning it off does not erase entries already imported. Genre edits in the
modal are drafts until Save vocabulary; the form clearly identifies this step.
Existing work classifications are not silently rewritten when vocabulary changes.

A work can select up to two distinct top-level genres, with one optional matching
subgenre each, and separately up to 40 tags. Arbitrary tags may be allowed, or the
administrator may require the predefined list. Tags are 1–64 characters without
control characters, commas or pipes. Duplicate tags are rejected case-insensitively.
The optional premade library contains **1,390 distinct tags**, curated in the source
file `crates/administration/data/tags.txt`. It covers fiction forms, genres, magic,
technology, people, relationships, cultures, settings, themes, tone and difficult
subjects. These are original platform vocabulary, not scraped from another site;
maintain distinct, meaningful terms rather than padding it with combinations.
Additional administrator tags remain separate from that library.

The library is suggested and, under restricted policy, permitted when enabled.
Disabling it does not remove existing work tags. Existing metadata remains readable;
subsequent classification saves must satisfy the current vocabulary policy.

## Content disclosures

`/studio/<uid>/disclosures` saves work-wide Gore, Suicide/Self-Harm, Assault and
Adult Content notices. Each checked notice requires a 1–2,000-character explanation;
unchecking clears its explanation on save. Authors should use these when the
majority of their work contains the theme or a major plot point involves it.
Chapter-specific Gore, Assault and Sexual Content notices are now available; see the reader section below. Explanations are saved
for the eventual public story overview; public story and reader pages now display explicit publication snapshots. Genre discovery images and chapter-cover fades likewise have their metadata
ready without claiming that discovery/public-story rendering is implemented.

## Suggestions and collaboration

Recommendation exclusions use Mantine TagsInput and known-site suggestions:
genres include subgenres; tags include administrator/premade vocabulary plus tags
on public works; authors are owners of public works; stories are public works only.
Public statuses are an explicit allowlist: ongoing, completed, hiatus, discontinued.
Draft names/tags are never exposed. Only explicitly published works appear in author/public-story suggestions. Stable IDs are stored for
genres/authors/stories; names are displayed and duplicate names have a short suffix.
Existing exclusions can be removed even if their target is no longer public.
The choices persist; recommendation enforcement remains future discovery work.

Collaborator TagsInput accepts exact emails or searches display names (the current
account naming field). Select multiple suggestions or emails, then apply View/Edit
access to all of them. Matching names are disambiguated; there is no need to enter
an account ID. A failed recipient invalidates the entire batch. Emails are canonicalized
only for exact submission, never returned by name search. Lookup requires ownership
or administrator sharing access, and all changes require the same authorization.
Editors also need verified email and a current role granting writing capability.

## Intended audience

The Target audience section in the work Overview tab stores the author’s intended minimum and optional
maximum reader age. Both empty means unspecified; a minimum without maximum means
that age and above. Ages must be ordered whole numbers from 0 to 120. Clear resets
the form and Save commits it. This is independent of the story-wide disclosures.
No maturity questionnaire or automatic regional classification is implemented.
The work hero begins directly beneath the header and contains an icon-only,
accessible return-to-Studio button at its top left.

Chapter manuscript editing, notes and revision history are described in [chapter_editor.md](chapter_editor.md).

## Chapter-specific notices and reader

Chapter Configure now includes Gore, Assault and Sexual Content checkboxes. Explicit publication releases these as named catalogue badges and detailed notices before manuscript contents. They are independent of work-wide disclosures. See reader_progress.md for current reader/publication behavior.
