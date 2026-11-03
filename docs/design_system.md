# Material design system and Mantine conventions

This is the styling contract for Artismaga. All new pages and changes must follow
it. Mantine supplies accessible React components; our theme and semantic CSS roles
apply a consistent Material 3 visual language. Mantine is not itself a Material
implementation, so its defaults alone are not the product design specification.

## Direction

Build a calm, editorial home for fiction: warm light surfaces, deep green accents,
clear hierarchy, deliberate spacing, and restrained decoration. Default to light;
respect saved light/dark/sepia/system preferences. Avoid gradients, decorative chart
numbers, arbitrary accent colours, excessive borders/shadows, and oversized rounded
containers. Placeholder content must be visibly identified as a preview.

## Sources of truth and component ownership

- `web/src/theme/theme.ts` (including the Mantine semantic-variable resolver): Mantine palette, typography, spacing, radii, elevation,
  and component defaults. Extend this centrally rather than fixing each instance.
- `web/src/styles/tokens.css`: semantic surface/ink/outline roles, scheme overrides,
  common component adjustments, and accessibility treatments.
- `web/src/styles/layout.css`: shell, responsive layout, navigation, headings,
  settings grids, and common structural patterns.
- `web/src/styles/pages.css`: discovery, dashboard, account and setup compositions.
- `components/Document.tsx` / `Application.tsx` / `Shell.tsx`: single provider and
  application shell, SSR/hydration, navigation and account menu.

Use Mantine controls instead of restyling raw inputs and buttons. Reuse `ApiForm`
for async mutations and accessible feedback. New feature pages belong in a cohesive
page folder; domain/API rules belong in Rust, not React event handlers.

## Material roles and tokens

| Role | Default light | Purpose |
| --- | --- | --- |
| Primary | `#24675a` | Main actions, selected navigation, key accents |
| On primary | light surface | Filled-action text/icons |
| Primary container | Derived primary tone (`#dce7e5` by default) | Selected/featured quiet surfaces |
| Surface | `#f6f8f7` | Application canvas |
| Surface container | `#ffffff` | Cards, headers, dialogs and inputs |
| Surface low/high | `#eef3ef` / `#e7eee8` | Secondary areas and skeletons |
| On surface | `#1e2c25` | Primary text |
| On surface variant | `#627268` | Supporting text |
| Outline | `#dce5de` | Boundaries and dividers |
| Error | Mantine red, anchored by `#b3261e` | Destructive actions and errors |

Filled controls resolve their foreground per scheme; keep the shared contrast
resolver and AA regression check when changing palette shades.
Dark/sepia schemes override roles, not individual page colours. Check contrast on
actual surfaces: body text targets WCAG AA, controls/focus must stay distinguishable,
and colour must never be the only status indicator. High-contrast mode strengthens
text and outlines. Do not use screenshots of a light design as evidence for dark.

## Typography and spacing

Use the local system sans-serif stack; no tracking-prone remote fonts. Reading
previews may use local Georgia/serif or spacious system sans. UI headings use
650 weight with restrained tracking. Page titles are 32px desktop / 26–28px mobile;
section headings 20px; body 14–16px; supporting copy 12–14px. Uppercase is reserved
for small, short eyebrow labels. Prefer concise sentence-case labels and plain
explanations, with no backend jargon in ordinary user flows.

Use a 4px spacing grid. Standard gaps: 8, 12, 16, 24 and 32px. Desktop page padding
is 40px, tablet 24–32px, mobile 16px. Keep reading/body text within comfortable line
lengths. The fixed header is 72px and desktop navigation 244px. A page has one main
heading, a brief description, clear sections, and one obvious primary action.

Radii: 4px small details, 8px inputs, 12px controls, 20px cards, 28px large surfaces.
Buttons/navigation use full pills where appropriate. Prefer outlined or tonal cards
to floating cards. Elevation is minimal and meaningful, principally menus/dialogs.
Do not invent per-page spacing/radius systems.

## Layout and interaction patterns

- Use the shared responsive Mantine AppShell. Mobile navigation is controlled by
  a labelled Burger; disabled future destinations explicitly say “Soon”.
- Settings use consistent tabs and a primary form column with contextual secondary
  cards. Tabs must support keyboard navigation and horizontal overflow on mobile.
- Profile, preferences and configuration save through real APIs. Validate on both
  client and server, show pending/error/success states, and preserve entered values
  on failure. Revision conflicts require reloading, never silent overwrites.
- Native selects are preferred for small fixed sets. Labels stay visible; placeholder
  text is not a label. Use 40–48px control targets and larger targets on request.
- Destructive actions use a clearly explained confirmation dialog, current-password
  verification and explicit typed confirmation. Do not mix them with normal save.
- Never make a decorative placeholder look like an enabled working control. Future
  preferences can be saved, but their activation boundary must be stated nearby.

## Skeleton and analytics rules

Discovery has a featured skeleton plus consistent shelves with 2:3 cover proportions,
short title/byline lines and tag placeholders. They are previews of future publishing,
not an indefinite claim that a live catalogue is loading. Avoid fictional story
statistics. Reduce/stop skeleton motion for both device and saved reduced-motion
preferences; static skeletons are preferred for these persistent previews.

Administrator analytics must explicitly say “Analytics preview” and “Not connected”
(or equivalent). Use skeleton values/charts/tables, never invented reader counts,
percentages, revenues, growth arrows or success rates. Disabled date/export controls
must not imply working data. Describe future audience, retention, discovery/search,
community, release-performance and Stripe conversion/churn sources separately.
Only operational facts actually available to the current request may be labelled real.

## Accessibility, privacy and SSR

Use semantic headings/landmarks, meaningful labels, visible keyboard focus, text
with status badges, skip navigation, accessible tabs and dialog focus management.
Announce form results in live regions. Test keyboard use and mobile overflow; do not
claim a full accessibility audit from component defaults alone. Reading appearance,
privacy, content, notification and accessibility choices must remain separate.
Gravatar is the only avatar provider; no upload controls are permitted.

Every page is rendered by React before serving and hydrated from the same validated
props. Embed JSON only as a React-escaped attribute, never raw executable HTML.
Public pages must not carry private profile/email/configuration data. Mantine-generated
style tags receive a fresh per-response nonce; inline style attributes support its
layout system. Script policy remains external same-origin only. Never add inline
scripts or broadly allow inline script execution to fix hydration.

## Mantine UI references

The following official examples informed composition and hierarchy; their patterns
are adapted to the Material tokens above, not copied as an independent theme:

- [Navbars](https://ui.mantine.dev/category/navbars/): grouped destinations, active
  state, secondary controls, and a quiet navigation footer.
- [User info and controls](https://ui.mantine.dev/category/users/): avatar/byline
  hierarchy and a compact account control.
- [Statistics](https://ui.mantine.dev/category/stats/): consistent metric-card and
  dashboard grid hierarchy. Our figures remain skeletons until data exists.
- [Authentication](https://ui.mantine.dev/category/authentication/): clear form
  grouping, supporting copy and focused primary actions.
- [Mantine AppShell](https://mantine.dev/core/app-shell/) and
  [MantineProvider](https://mantine.dev/theming/mantine-provider/): shared responsive
  composition, theme defaults and nonce-aware generated styles.

## Review checklist

Before finishing a visual change, verify desktop and narrow layouts, light/dark
contrast, consistent tokens, input/focus/error states, meaningful empty/loading
states, SSR/hydration without console errors, and truthful feature availability.
Run TypeScript formatting/type/build/tests, Rust checks and relevant live integration
checks. Update these rules deliberately when the design system itself changes.

## Immediate appearance and Studio

Appearance controls preview immediately through the shared context and root data
attributes; Save persists them. Keep form state mounted when changing path tabs.
Use `/account/settings/<section>`, `/admin/<section>` and `/studio/<id>/<section>`
with popstate handling and server-selected tabs. Account/admin utility destinations
belong in the user menu, not duplicated in the main sidebar. Call the writing area
Studio throughout the product.

The site’s configured primary colour seeds one central tonal palette; do not
scatter literal accent colours in feature CSS. Light seeds derive darker action/link
tones to retain contrast. Generated work heroes use cover palette colours as content,
with blur/grain and a top-to-bottom fade; custom images use the same fade. Hover
editing must also have labelled keyboard-focusable controls and visible mobile actions.
The disabled Work Type selector must honestly show Book and describe future formats.

## Whole-site colour and creative controls

The base seed colours the entire UI: light/dark surfaces, elevated containers,
inputs, menus, borders, disabled controls and neutral text derive restrained seed
hues in `semanticRoles`/`makeTheme`. Semantic ink/muted roles retain AA text contrast;
error colours retain their recognizable meaning. Sepia adds a warm tint, and high
contrast overrides neutral outlines/text. Do not add fixed green/blue surfaces in
feature CSS. Test several dark, light and saturated seeds in both schemes.

Every page title follows `Page • Site name`; section tabs prepend their section
and preserve that title through Back/Forward and edits. Use the shared page-title
helper rather than splitting user-entered titles on punctuation.

Use [Mantine TagsInput](https://mantine.dev/core/tags-input/) for multi-value tokens,
controlled values/search and filtered suggestions. Known-only fields reject custom
entries; free tags/exact collaborator emails are explicit exceptions. Keep stable
IDs out of user input requirements and never autocomplete email addresses. Chapter
hierarchy uses nested, collapsible native disclosures; six-dot drag handles have
Alt+Up/Down movement, and Configure → Location remains a keyboard/touch alternative.
The chapter toolbar belongs above its tree. Destructive actions explain their
seven-day recovery period and expose Restore. The Edit action opens the private chapter editor.

All software labels and messages use the localisation context and registered dot
keys. Never concatenate translated fragments around counts or dates: register a
whole sentence with named placeholders and realistic preview values. Keep stable
form values independent of translated labels. Do not feed user-created titles,
names, manuscript text or tag identifiers into UI-label lookup. Use the selected
locale for document language and formatting; test expansion and mobile layouts.

Theme configuration is declarative: built-in Light/Dark/Sepia expose a typed colour
option and user-availability switch in Identity → Themes. Apply a changed seed to
all semantic surfaces/text/borders as well as actions. Administrators can preview
hidden themes; public theme choices filter them out. Future custom themes should
supply typed configuration descriptors and namespaced localisation keys, rather
than asking users to edit source. Keep Built-in and Custom lists collapsible.
Announcement severities use semantic information/warning/error icons and colours;
promotional artwork fills the banner without a fade, with readable copy panels.

Use the localisation date helper with the configured time zone; never inherit the
server or browser's operating-system zone during SSR. Keep implementation values
such as `UTC`, enum identifiers and confirmation tokens untranslated. For a sentence
that names a required token, interpolate the token through a registered placeholder.

## Page clarity and dense administration

Avoid decorative page titles/subtitles when navigation and controls already explain
the page. Discovery, Studio, Administration and Analytics begin with useful content.
Use icons consistently on related navigation tabs. Put per-theme advanced controls
and preview behind an accessible cog with expanded state. Use a left-hand list
with one adjacent editor for roles; group permissions in collapsible categories.
Protected editors are visibly dimmed and disabled, with a shield in navigation.
Promotional artwork covers the entire banner without image gradients. Text uses a
readable surface panel at top left; the CTA sits bottom left. Textless artwork
links need a software-provided accessible name and visible keyboard focus.

## Writing surfaces

Work Overview is a full-width synopsis above a two-column genre/tag and audience
row; stack that row on narrow screens. The chapter editor uses a quiet paper surface
with consistent paragraph/headings 2–4 and no site header/navigation. Keep the
manuscript centred between equal outer columns. Tools and word count float at bottom
centre; inline formatting floats above selections. Search is inline in the bottom
panel, Replace and Writing checks use modals. One outline occupies the right panel;
passage notes align to the left of their anchors. On narrow screens use numbered
passage markers and a chapter-note dialog. Use semantic quotations, lists, links and scene breaks.
Save status and word count remain visible, with clear pending, saving, saved and
conflict states. Never present basic writing checks as a complete linguistic or
accessibility review. Revision comparisons use both insertion/deletion semantics
and readable formatted before/after views, including private notes and language.

Chapter rows use labelled icon actions for configure, edit and archive/delete.
Use complete localized group-action phrases rather than joining verbs to raw kind
tokens. Revision history starts with number/date/editor rows, then opens two
read-only manuscript surfaces; preserve text formatting and use both tint and
underline/strikethrough to distinguish additions and removals.
