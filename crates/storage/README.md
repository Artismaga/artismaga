# artismaga-storage

Private local/S3/R2 artwork storage, provider configuration, image sanitization and
retryable physical deletion. It never returns saved credentials to API/SSR callers.

## Important logic

- `src/lib.rs`: `Storage::settings/save` exposes public metadata and revisioned
  configuration; `backend` builds private LocalFileSystem/AmazonS3 clients;
  `upload/asset/bytes` owns generated object keys and sanitized artwork persistence;
  `cleanup` retries database-queued blob deletion.
- `src/images.rs`: bounded image decoding, resize/JPEG conversion and prominent
  palette extraction. Original metadata and SVG are never served.
- `src/vault.rs`: atomic owner-private key creation and XChaCha20-Poly1305 credentials,
  bound to a provider ID. No credential Debug implementations or public DTOs.
- `crates/db/src/studio.surql` and `queries/save_storage.surql`: additive schema
  and atomic provider/state revision transaction.

## Boundaries

Depends on db/config/core, object_store, image and RustCrypto. Web authenticates,
authorizes each upload/media request and limits incoming bodies before allocation.
Studio owns work access and references; storage does not decide manuscript ACLs.
Use the fixed app-data root, never caller-supplied filesystem paths. Preserve old
provider configurations for existing assets. See the storage operations guide.

Maintain this README and docs/architecture.md whenever responsibilities or logic
move. Follow AGENTS.md/CONTRIBUTORS.md: humans must understand, review and validate
all LLM-assisted contributions, especially encryption, media limits and access checks.

Upload purposes also include chapter_cover, genre_image and genre_hero. Studio owns
chapter-cover retirement after archive expiry; referenced genre artwork is public
site data and survives account deletion. Web enforces each purpose's permissions.

Localisation integration: see `docs/localisation.md` and the architecture logic map for locale defaults, editor permissions, translation grants, provider lifecycle and cache ownership.

The `announcement` purpose uses the bounded hero-image pipeline. Web owns editor
upload authorisation and schedule/audience-aware reads; storage never decides an
announcement's audience. Announcement assets survive account deletion to preserve
retained sitewide announcement history.

The `reaction` artwork purpose uses existing bounded raster sanitization/private providers. Web restricts upload to administrators and exposes images only when reaction configuration references them. Reaction assets are site data preserved on uploader deletion.

`seal_secret`/`open_secret` expose context-bound vault encryption for the server-only KLIPY setting without exposing storage paths or encryption keys.
