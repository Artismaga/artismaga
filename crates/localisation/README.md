# artismaga-localisation

Owns the software/extension dot-key registry, five shipped locales, validated
placeholder interpolation, revisioned draft/live overrides, automated translation
policy, encrypted provider credentials and content-versioned translation caching.

- `src/lib.rs`: definitions, namespace registration, fallback, draft/live bundle
  selection and optimistic concurrency. Callers must enforce editor permission.
- `data/keys.json`: English, Japanese, Simplified Chinese, Spanish and French
  defaults, ownership and per-key preview examples. Treat translations as plain
  text; do not add HTML or interpolate executable markup.
- `src/edit.surql`: atomic draft/save/publish/discard transitions.
- `src/runtime.rs`: checksum-pinned model download and private app-owned llama.cpp
  process, authentication, cancellation and bounded inference.
- `src/translation.rs`: write-only Google credentials, provider revision/TTL cache,
  bounded UTF-8 content splitting and provider adapters.

Depends on core/database/storage's secret vault. Does not authorize HTTP requests
or own work approval policy (web and studio respectively). Extension registration
is a trusted host API, not an unrestricted route or a plugin execution engine.
See `docs/localisation.md` for operation, provenance and review requirements.
