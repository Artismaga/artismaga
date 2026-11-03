# artismaga-setup

One-time installation ownership and recoverable configuration/account setup.

## Important logic

`src/lib.rs`: private setup-code creation/constant-time verification, existing-site detection, validated config staging, process/file locks, first-owner installation orchestration.

## Boundaries

Depends on auth/config/core/db and Tokio. No Rocket, HTML, or renderer. Database owner/policy/claim atomicity lives in db queries/install.surql; passwords are hashed by auth. Both state volumes are required for recovery.

Maintain this file and [the architecture map](../../docs/architecture.md) when
responsibilities, dependencies, or important logic move. Follow [AGENTS.md](../../AGENTS.md)
and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and
review of every LLM-assisted contribution.
