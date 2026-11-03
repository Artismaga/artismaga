# artismaga-config

Typed operator settings, installation defaults, and private atomic persistence.

## Important logic

`src/lib.rs`: `Config::bootstrap/load/validate/save`, data/config paths, optional database auth, SMTP settings, `setup_origin_matches`.

## Boundaries

TOML/URL validation and filesystem persistence only. Never log settings or implement account policy here.

Maintain this file and [the architecture map](../../docs/architecture.md) when
responsibilities, dependencies, or important logic move. Follow [AGENTS.md](../../AGENTS.md)
and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and
review of every LLM-assisted contribution.
