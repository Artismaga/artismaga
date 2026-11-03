# artismaga-render

Application-owned React child process lifecycle and private pipe protocol.

## Important logic

`src/lib.rs`: `PageRenderer::new/page/page_data/with_site/shutdown`, spawn/ready handshake, bounded frame reads, timeout/crash reset and child reaping.

## Boundaries

Depends on core/config and Tokio; no HTTP client or renderer listener. Scoped DTOs cross IPC; authenticated own-account and administrator data are assembled and authorized by web. Never send credentials. Child code is trusted, not a sandbox for plugins.

Maintain this file and [the architecture map](../../docs/architecture.md) when
responsibilities, dependencies, or important logic move. Follow [AGENTS.md](../../AGENTS.md)
and [CONTRIBUTORS.md](../../CONTRIBUTORS.md), including human understanding and
review of every LLM-assisted contribution.

Requests are bounded to 2 MiB to accommodate bounded chapter configurations and taxonomy DTOs; responses
remain capped at 8 MiB. Rust and worker limits must change together. All pages
render before serving, including initial deep-linked tabs.
