# artismaga-core

Infrastructure-independent account contracts and permission vocabulary.

## Important logic

`src/lib.rs`: `SignupMode`, `Permission`, `PermissionGroup`, `PublicUser`, `normalize_email`, `gravatar`.

## Boundaries

serde and SHA-256 only; no Rocket, persistence, or SMTP. Future story logic belongs in its own domain crate.

Maintain this file and [the workspace architecture map](../../docs/architecture.md)
when responsibilities, dependencies, or important logic locations change. Follow
[AGENTS.md](../../AGENTS.md) and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including
human understanding and review of all LLM-assisted contributions.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

The permission vocabulary includes `configure_localisation`, `manage_announcements`
and `view_analytics`. Auth derives these capabilities for the protected administrator
role; every corresponding adapter checks permission server-side.

The permission vocabulary includes `manage_comments` for delegated comment deletion.
