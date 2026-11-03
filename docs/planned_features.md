# Planned features

This is the complete product roadmap, not a claim that these features are implemented.
See [architecture.md](architecture.md) for the implemented foundation and future ownership.
The default theme follows Material Design. All future features must preserve accessibility,
localisation, privacy defaults, permission checks, and safe Rust practices.

## Authentication

- Site administrators can toggle between anyone can make an account, invitation required, or signup disabled.
- Each user gets assigned to a permission group that determines what they are allowed to do (create a story, publish a story, write a comment, leave a review, etc.).
- User profile pictures are handled through Gravatar, never uploaded or hosted directly by the platform.

## Discovery

- Featured/recommended stories: appearing at the top of discovery in a larger space with stories hand-picked by site administrators.
- Popular, trending, highly rated, and recently updated story lists.
- New releases and newly completed stories.
- Genre, subgenre, and tag filtering.
- Personalised recommendations for authenticated users based on reading history and subscriptions.
- Continue reading shelf at the very top of discovery below featured/recommended for authenticated users.
- Visibility controls for mature content.
- Controls to hide a story, author, genre, or tag from recommendations.

## Search & filtering

- Search by story title, author name, description, and tags.
- Include and exclude genres or tags.
- Filter by language, publication status, age rating, and content warnings.
- Filter by length: word count, chapter count, or estimated reading time.
- Filter by publication date or last update.
- Sort by relevance, popularity, rating, newest, or recently updated.
- Incremental loading for search pages.
- Exact phrase filtering when a phrase is captured within quotation marks.
- All search filters are URL query parameters for easy sharing of URLs.

## Story overviews

- Title, subtitle, cover, and author byline.
- Synopsis or blurb.
- Genres, tags, language, age rating, and content warnings.
- Status: Ongoing, Completed, Hiatus, Discontinued, or Draft. Drafts are visible only to the author, site administrators, or users the draft has been shared with.
- First publication date and latest update.
- Word count, chapter count, and estimated reading time.
- Ratings, reviews, views, and subscriber counts.
- Start reading and continue reading buttons.
- Follow/subscribe and add-to-reading-list actions.
- Table of contents with chapter titles and publication dates.
- Share links.
- Related stories and works by the author.
- Similar stories list.
- Expected release schedule.
- Per-reader read/unread indicators.
- Series order and links to prequels, sequels, and side-stories within a franchise.
- Chapters grouped into volumes or story arcs if the author has specified groupings.

## Author and public user profiles

- Display name or pen name, avatar, and biography.
- Published stories and series.
- Follow-author button.
- Website and social links.
- Public reading lists and reviews, subject to privacy settings.
- Report and block actions.

## Reader

- Responsive reading layout for mobile and desktop.
- Previous/next chapter navigation.
- Accessible table of contents.
- Remembered reading position.
- Font size, font family, line spacing, and content-width settings.
- Light, dark, and sepia themes.
- Chapter progress and overall story progress.
- Bookmarks.
- End-of-chapter comments and reactions.
- Content-warning notices before relevant chapters.
- Keyboard navigation and screen-reader support.
- Text-to-speech with speed controls.
- Reading-time estimates.
- Cross-device reading-position synchronisation.
- Offline reading.

## Personal library and reading management

- Followed stories and saved books.
- Reading states: plan to read, reading, completed, on hold, and dropped.
- Continue reading.
- Recently read history.
- Unread chapter counts.
- Custom reading lists or shelves.
- Sorting and filtering the library.
- Remove, unfollow, and mark-as-read actions.
- Public/private list controls.
- Export reading lists and reading history.
- Download management and offline storage controls.
- Notifications when a story resumes after a hiatus.

## Author dashboard and project management

- Overview of all stories and their statuses.
- Create, duplicate, archive, and delete projects.
- Quick access to drafts and recently edited chapters.
- Upcoming scheduled releases.
- Recent comments, reviews, and notifications.
- Basic audience and engagement statistics.
- Manage story metadata and cover artwork.
- Franchise management: create franchises and group multiple stories under them.
- Series and volume management.
- Project folders and labels.

## Writing and editing workflow

- Rich-text editor with consistent paragraph and heading styles.
- Bold, italic, lists, quotations, links, and scene breaks.
- Chapter creation, renaming, reordering, and deletion.
- Draft saving, autosave, and recovery after interruption.
- Word count.
- Undo/redo and find-and-replace.
- Reader preview.
- Paste cleanup from external writing software.
- Chapter-specific author notes.
- Managed worldbuilding: create, edit, remove, and search established events, locations, entities (nations, companies, guilds), characters, mechanics, etc.
- Revision history and restoration.
- Comparison between revisions.
- Spelling and grammar tools with language selection.
- MCP support for allowing LLM agents to edit and read the project.
- Formatting and accessibility checks.

## Publishing workflow

- Guided story setup.
- Required metadata and cover validation.
- Genre, tags, language, age rating, and content-warning selection.
- Draft, preview, publish, and unpublish actions.
- Publish immediately or schedule for later.
- Chapter ordering and numbering.
- Publication confirmation and public-page link.
- Update an already published chapter.
- Change story status to completed, hiatus, or discontinued.
- Separate live content from unpublished revisions.
- Preview links for reviewers or beta readers.
- Early-access chapters that become free on a schedule.

## Monetisation

- One-off book purchases.
- Paid chapters or volumes.
- Platform subscriptions.
- Shopping basket and checkout.
- Discount codes, bundles, gifts, and promotional pricing.
- Purchase receipts and billing history.
- Subscription renewal, cancellation, and payment-method management.
- All monetisation handled via Stripe for the initial version.

## Comments, reviews, and community

- Story reviews and ratings.
- Chapter comments and author replies.
- Threaded conversations.
- Likes, votes, or other reactions.
- Edit/delete controls for a user's own contributions.
- Report, block, and mute controls.
- Spoiler formatting.
- Comment notifications.
- Pinned author comments.
- Comment sorting and filtering.
- Review helpfulness votes.
- Ratings broken down by writing, characters, plot, or other dimensions.
- Minimum reading requirements before reviewing.
- Review labels showing how far the reviewer has read.

## Notifications and subscriptions

- New chapter and new story alerts.
- Author updates.
- Replies, mentions, reviews, and reactions.
- In-site notification centre.
- Email notifications.
- Per-story and per-author notification controls.
- Read/unread notification management.
- Browser push notifications.
- Separate alerts for new chapters versus edits.
- RSS or Atom feeds.

## Analytics and reporting

- Story and chapter views.
- Unique readers, distinguished from repeat views.
- Followers, bookmarks, ratings, and comments over time.
- Date-range filtering.
- Story-by-story comparisons.
- Chapter-to-chapter reader retention.
- Completion and abandonment patterns.
- Reading time and engagement.
- Discovery sources and referral links.
- Search impressions and click-through rates.
- Follow or purchase conversion.
- Release-schedule performance.
- Aggregate device, language, and regional breakdowns.
- Bot/internal-traffic filtering.
- CSV export.
- Subscription conversion and churn.

## Marketing and promotion tools

- Shareable story and author URLs.
- Social sharing previews.
- Author announcements.
- Links to other works by the same author.
- Promotional images and embed widgets.

## Account, preferences, and privacy

- Registration, login, email verification, and password recovery.
- Profile and pen-name management.
- Email and notification preferences.
- Reading appearance defaults.
- Language, time zone, and content preferences.
- Blocked and muted accounts.
- Public/private activity settings.
- Account deletion.
- Passkeys and two-factor authentication.
- Active-session and connected-device management.
- Export personal data.
- Private reading history and private library defaults.
- Accessibility preferences.
- Billing and payout settings.

## Moderation and support

- Report stories, chapters, comments, reviews, and accounts.
- Moderation queue with reasons and evidence.
- Content and community guidelines.
- Warnings, removals, suspensions, and bans.
- Spam prevention and rate limiting.
- Action history and audit logs.
- Duplicate and coordinated-abuse detection.
- Rating manipulation and review-bombing controls.
- Tag correction, merging, and synonym management.
- User-facing explanations of moderation actions.
- Case assignment and internal moderator notes.

## Site administration

- User, story, chapter, and role management.
- Genre, tag, language, and content-warning configuration.
- Homepage collections and featured placements.
- Site branding and navigation.
- Announcement management.
- Email templates.
- Storage limits and upload restrictions.
- Basic operational statistics.
- Search-index management.
- Background-job monitoring.
- Scheduled publication monitoring and retry controls.
- Backup and restoration.
- Import/export and migration tools.
- Redirect management.
- Site health, error logs, and performance monitoring.
- Localisation and translation management.
- Configurable moderation and ranking policies.
- Subscription plans and payment settings.

## General

- Themes and extension/plugin support via sandboxed JavaScript.
- Accessibility and localisation support.
- Configurable email, storage, and payment providers.
- Default theme following Material Design standards.
