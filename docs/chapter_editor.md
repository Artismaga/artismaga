# Chapter editor

Open Edit beside an active chapter in Studio. Authorised editors can write; shared
viewers may open the same private page read-only. Click the title to edit it in place (Enter or blur saves, Escape cancels). Cover and
synopsis are configured in the chapter list. Explicit chapter publishing is now implemented; see the release section below.

## Writing and tools

The editor uses [Tiptap’s React integration](https://tiptap.dev/docs/editor/getting-started/install/react)
and StarterKit with Mantine controls. It serves escaped, formatted prose before
hydration, then activates the editing engine with `immediatelyRender: false`.
Paragraphs, three consistent heading styles, bold, italic, numbered/bullet lists,
quotations, safe HTTP/HTTPS/local links and scene breaks are supported. Undo/redo
uses the editor’s text history. Pasted Word/Docs HTML is reduced to supported
semantic elements; fonts, colours, embedded media and active markup are removed.

The editor omits site navigation and centres the manuscript on a quiet background.
A floating bottom panel contains formatting, undo/redo, word count, Search, Replace
and Writing checks. Search opens an inline field, highlights matches and advances
on Enter; Ctrl/Cmd+F opens this search. Replace opens the separate find/replace modal.
The selection toolbar above selected text provides inline formatting and passage
notes; selection highlights remain visible when focus moves away.

Find/replace is literal, optionally case-sensitive, crosses inline formatting within
a paragraph, and processes at most 500 matches per action. Word counts use Unicode
word segmentation for the selected writing language, including Japanese/Chinese.
Select English, Japanese, Chinese, Spanish or French in Writing checks. Native
browser spelling depends on installed dictionaries. Basic local grammar rules flag
repeated words/spaces and punctuation, with English article suggestions for human
review; formatting/accessibility checks flag skipped/empty headings, long paragraphs
and vague links. These tools do not replace linguistic or accessibility review.
No application request sends manuscript text to an external proofreading provider.

## Notes

One chapter-wide note holds outlines and planning in the dedicated right panel
(or a bottom-toolbar dialog on smaller screens). Existing chapter-wide notes are
combined without discarding text when loaded. Select text and use the selection
toolbar to create a passage note in a modal. Passage notes float to the left near
their anchored text; on narrow screens numbered markers open the same modal.
Positions follow subsequent editor transactions. Deleted passages leave a marked
detached note with its original excerpt. Review anchors after substantial edits.
Notes/language are saved with each draft and checkpoint.
All notes are private to the work’s authorised collaborators, including read-only
shares. Future publication must exclude them. Limits: 100 passage notes, 4,000 characters
per passage note and 500 characters per anchor excerpt. The chapter-wide note shares
the overall manuscript size budget.

## Saving, conflicts and recovery

Changes save after two seconds without typing. One request runs at a time; edits
made during an outstanding request remain dirty and are saved next. Transient
failures retry with backoff to 30 seconds. Save draft (or Ctrl/Cmd+S) creates a manual
checkpoint. Autosave creates the first checkpoint and another when five minutes
have elapsed on a subsequent edit. Ordinary intervening autosaves update the current
draft without creating a checkpoint. Checkpoints are retained until the owning work
or chapter is permanently removed; the history picker paginates them.

Every save compares the current draft revision. A conflict or revoked access stops
autosave and keeps local changes. Compare the latest server version before explicitly
keeping your draft for a new save or using the latest saved draft. This is not live
collaborative text merging. Sharing and chapter archive are rechecked in the save
transaction, so an already-open editor cannot bypass revocation.

A device recovery copy is written after each edit, scoped to account/work/chapter.
On interruption it is offered for comparison and explicit recovery, including when
the server revision has moved on. Copies expire after seven days and are removed
after a matching successful save or explicit discard. They are plain-text browser
storage, unavailable if browser storage is blocked/full, and are not backups; see
security.md for shared-device privacy. Browser navigation warns while edits are dirty.

Revision history opens a paginated checkpoint table with version number, date and
editor name/Gravatar. Select one row, then a different row to open a full-screen,
read-only pair of manuscript surfaces. Versions are ordered chronologically
regardless of selection order: additions are green/underlined on the newer side,
removals red/struck through on the older side. Paragraphs, headings, lists and inline
formatting remain intact. Notes and writing language are shown with each version.
Use Save draft first to include current work as a checkpoint. Textual comparison
does not tint formatting-only changes; the formatted views show those changes.
Large comparisons fall back to untinted formatted views. Restoring first saves pending
changes and then creates a new checkpoint with the selected document, notes and
language; existing checkpoints are unchanged. The latest autosaved state is also
retained as a checkpoint before restoration, even if it was not checkpointed yet. Archived chapters cannot be edited;
restoring within the seven-day archive window restores access to the manuscript.
After expiry, the chapter purge removes its current draft and history together.

## Storage boundaries

The server accepts only the closed JSON document vocabulary, no arbitrary HTML,
inline styles, uploads or executable URLs. Limits are 750 KB serialized manuscript,
10,000 nodes and 16 levels of nesting. The body lives in `chapter_draft`, immutable
checkpoints in `chapter_revision`; chapter metadata/tree remain in `work_details`.
Owned manuscript/history data is included in account export and deleted with owned
works on account deletion. See architecture.md, api.md and the crate READMEs.

## Releasing saved chapters

After publishing the story/catalogue, an owner or administrator with publishing permission can use Publish saved chapter. Save dirty changes first. Publication snapshots document and language, excluding notes/history; draft edits stay private until the next explicit release. See reader_progress.md.

Publish saved chapter now stages a chapter even before the story is public. Publish at least one chapter before publishing the story; draft saves never release text automatically. Unpublishing a story retains staged bodies privately.
