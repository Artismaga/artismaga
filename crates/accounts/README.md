# artismaga-accounts

Own-account profile/preferences, private defaults and deletion.

## Important logic

`src/lib.rs`: `Accounts::own/save_profile/save_preferences/delete`, bounded profile/preferences validation and revisioned DTOs. Password confirmation delegates to auth; transactional SQL lives in db.

## Boundaries

Depends on auth/core/db and URL parsing; no HTTP or rendering. Future library/community domains consume these preferences and must enforce their own visibility.

Maintain this file and [the architecture map](../../docs/architecture.md) whenever responsibilities or important logic move. Follow [AGENTS.md](../../AGENTS.md) and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and review of LLM-assisted contributions.

Account deletion now delegates to the expanded database transaction that removes
Studio works/shares/access and private media metadata, queuing blob cleanup for
storage. Site branding artwork is retained as site data. Web exports the corresponding
work/artwork/sharing/access metadata without credentials or image binaries.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`Content::automatic_translations` defaults to true for existing preference records.
The web adapter applies the opt-out only to automated user-content output, preserving
approved human translations. Account deletion also removes owned translation caches
and grants; the export adapter includes manual translations and language access.

Account deletion removes own reader state and owned released chapter bodies through the shared database transaction. Site reaction artwork survives uploader deletion. Web account export format 6 includes own reading state.

Deletion subtracts the account’s current rating/reaction choices, removes pseudonymous reading reports and clears owned metrics/lifecycle. Anonymous aggregate visit totals otherwise remain. Web export format 7 contains own reports and owned staged releases/status.
