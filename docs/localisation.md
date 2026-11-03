# Localisation and translation

All software UI strings are registered as dot-separated keys in
`crates/localisation/data/keys.json`. Defaults cover English (`en`), Japanese
(`ja`), Simplified Chinese (`zh`), Spanish (`es`) and French (`fr`). Each definition
includes ownership, context and example values for every `{placeholder}`. Preserve
placeholder names in every language. Values are interpolated once and rendered as
escaped text by React. Software option values and user-supplied names are never
translated as identifiers.

The Administration → Localisation editor manages enabled languages, source locale,
key search, draft editing and explicit publication. Saving a draft never publishes
it. Only accounts with `configure_localisation` (including administrators) receive
draft preview bundles or editor data. They can turn in-place preview off to compare
the published site. Publishing requires the saved draft's revision and text;
concurrent changes require reloading. Placeholder inputs provide realistic preview
values without substituting into the stored template. Normal users see live
translations and shipped defaults. The installer also supports all five languages.

Fallback is selected enabled language, site source language, then English. The site
name inherits its configured source-locale name until an explicit override supplies
a different name for the selected language. Future
trusted extension hosts can call `Localisation::register` with keys under their
`plugin.<id>.` or `theme.<id>.` namespace, English fallback defaults, optional other
locale defaults and placeholder examples. Registration does not grant code access
or create an execution sandbox. Never allow an extension to overwrite software or
another extension's namespace. New UI strings must register translations and
preview examples in the same change.

## Automated translation

The default provider is local **Qwen3-4B Q4_K_M**, a permissively licensed 4-billion
parameter model, served by an app-owned llama.cpp child. The official model card
covers over 100 languages and non-thinking inference. This is a practical initial
CPU option, not a guarantee of literary translation quality. Editors must review
translations before publishing. Its quantised model download is about 2.5 GB;
allow several additional GB of RAM for weights and inference. First startup downloads
and verifies it in the persistent app data volume, then warms the private runtime.
The website remains available during preparation; originals remain available when
translation cannot run. The Localisation page shows runtime status.

Model repository revision:
`bc640142c66e1fdd12af0bd68f40445458f3869b`, file `Qwen3-4B-Q4_K_M.gguf`,
SHA-256 `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`.
llama.cpp source revision:
`8642541b255bfb5dc39cd351a178be09013a55d6`.
The distribution builds the runtime into the app image; no renderer or translation
service is exposed in Compose. In native development set `ARTISMAGA_LLAMA_SERVER`
to a compatible llama-server binary. `ARTISMAGA_LOCAL_TRANSLATION=off` prevents
download/inference on constrained installations. Administrators can disable the
provider or select Google Translate with a write-only API key. Keys use the same
local authenticated encryption vault as storage credentials; back up its encryption
key with app data. Google was implemented against its official v2 API and has not
been tested or called with user data.

Translations are cached in SurrealDB for 30 days by default (configurable 1–365).
Cache identity includes scope, exact source text, source/target language and provider
configuration revision. Changed content or provider configuration cannot reuse an
old cached translation. Expired entries are removed by hourly maintenance. Text is
bounded and split on UTF-8/paragraph/sentence boundaries for inference. Cloud
translation sends the selected text to that provider; only authorised readers can
request private work content. A user's content preference can disable automated
translations; approved human translations remain available. Automatic key filling
produces reviewable text, never an implicit publication.

## Work translations

Studio → work → Translations manages overview title/subtitle/synopsis and each
chapter's currently implemented title/synopsis. Chapter prose translation will
attach to this scope once the writer stores prose; no nonexistent body is claimed.
Owners can assign multiple accounts drafting or approval access for each language
using name search or exact email. Translation-only access grants view access, not
permission to edit source chapters or metadata. Removing the last language grant
revokes automatically created access while retaining independently shared access.

Draft and approved values are separate. Approval needs the language's approval
permission and the exact saved draft/source fingerprint. Edits to source invalidate
approval for display until a translation of that version is reviewed. Drafts are
masked from users without relevant language permissions. Work owners and site
administrators can manage all translations. Account deletion removes associated
language grants and owned work translations.

## Sources and validation

- [Official Qwen GGUF distribution](https://huggingface.co/Qwen/Qwen3-4B-GGUF)
- [Model card](https://huggingface.co/Qwen/Qwen3-4B-GGUF/raw/main/README.md)
- [llama.cpp server interface](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [Google Translation v2 reference](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate)

Built-in translations were generated locally and need fluent human review before
production release. The actual pinned local model translated a synthetic English
sentence into all four other shipped languages in a CPU smoke test (roughly 2–4
seconds per short sentence after warmup on this development machine). This is a
functional smoke test, not a quality benchmark. Non-local providers are deliberately
not exercised. `local-model-tests` is an opt-in feature for the ignored model test;
normal database tests do not download model weights.

The cache stores JSON-encoded output and an ownership scope for deletion; its key
still fingerprints the full content scope. The database adapter decodes bound JSON
values explicitly with `encoding::json::decode`, preserving punctuation that the
RPC interface can otherwise treat as a record reference. Parameter names are
validated, data remains bound, and all statement errors are still checked.
