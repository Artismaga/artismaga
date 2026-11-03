# artismaga-auth

Account lifecycle, password/session credentials, invitations, group authorization, and email tokens.

## Important logic

`src/lib.rs`: `Auth::register/login/current/allowed/permissions` handles account access; `install`
commits the first owner, policy, and claim; `credential_matches` verifies setup
credentials. `verify_current_password/change_password/request_email_change` own sensitive account changes; `sessions/revoke_session` expose safe metadata and scoped revocation. The module also owns verification/reset tokens, SMTP dispatch, and cleanup.

## Boundaries

Depends on core/config/db, Argon2id, OS randomness, SHA-256 and lettre. No Rocket or HTML. Email adapter extraction belongs with future provider abstractions.

Maintain this file and [the workspace architecture map](../../docs/architecture.md)
when responsibilities, dependencies, or important logic locations change. Follow
[AGENTS.md](../../AGENTS.md) and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including
human understanding and review of all LLM-assisted contributions.

Current role permissions are resolved from persistence for every request; removal
affects existing sessions without requiring logout. Studio uses verified writing
capability plus its separate owner/share ACL. Custom roles cannot grant administer.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

`Auth::localised_mail` in `src/lib.rs` selects the account's preferred locale (or
site source) and interpolates published verification/reset/email-change templates.
It never sends an administrator's unpublished localisation draft to an account.

Administrators derive Manage Comments; delegated roles can grant it separately. Current persisted roles and verified-account rules remain authoritative.
