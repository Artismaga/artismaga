# Studio and private artwork storage

## Studio workflow and routes

`/studio` lists the signed-in user's accessible works. Search matches titles and
subtitles. Filters are All works, My works, Drafts and Shared with me; sorting is
Recently accessed, Last edit, Name or Newest first. Search/filter/sort/offset are
URL query parameters. Pages contain at most 24 works. Reading an accessible work
updates a private per-user last-access timestamp.

`/studio/new` creates a private Book draft. Work Type is visibly disabled until
other media types exist. Title is required; subtitle, synopsis, cover and hero are
optional. Images upload before the draft is saved. Creation and editing require a
verified account whose current role grants `create_story`. Existing works remain
readable after that permission is removed, but cannot be edited.

`/studio/<work-id>` opens Overview. Tabs use `/overview`, `/chapters`, `/related`,
`/analytics`, `/disclosures` and `/settings`. The title, subtitle, cover and hero have keyboard
accessible edit controls as well as hover affordances. Metadata changes use
optimistic revisions. Chapter information, hierarchy and archive recovery are implemented. Chapter writing, notes and revision checkpoints are implemented; public catalogue snapshots, related-work selection and expected release schedules are implemented; chapter-body publication and historical analytics remain planned. See chapter_editor.md. See chapters_and_taxonomy.md.

Owners and site administrators can select accounts by display name or exact email, assigning up to 50 collaborators the same access atomically. Viewers can read draft metadata/artwork; editors additionally need a
verified account and a writing role. Sharing is checked on every request; removing
access also invalidates stale metadata revisions. Administrators can inspect any
known draft, while their Studio catalogue lists their own/shared works by default.

## Covers and generated heroes

A missing cover resolves to the administrator's default cover, or the theme's
built-in vector cover. The built-in image adopts the configured base colour.
Changing the site default therefore updates works that still use it. Custom cover
and hero images are optional independently.

When no hero is uploaded, the server extracts up to three distinct prominent colour
bins from the sanitized cover. The website builds a large blurred palette wash,
adds a separate grain texture and fades the hero from top to bottom into the page.
Solid-colour covers may have fewer distinct colours. A custom hero uses the same
fade without forcing the palette blur.

## Providers and credentials

Administrators select Local Disk, Cloudflare R2 or AWS S3 under `/admin/storage`.
Local files always use `<ARTISMAGA_DATA_DIR>/media`; browser callers cannot choose
arbitrary filesystem paths. The media directory is owner-private on Unix and the
Compose app-data volume persists it.

Cloud locations require an existing private bucket and bucket-scoped access/secret
keys. R2 uses the validated Cloudflare account ID to derive its HTTPS S3 endpoint
and signs with region `auto`. AWS uses its region and the standard S3 endpoint.
No custom arbitrary network endpoint is accepted through the website. The
`object_store` S3 client signs server-side requests and verifies TLS.

Both credential fields are write-only. Leaving a field blank preserves that
location's current value; new locations require both keys. GET/SSR responses contain
only location metadata and a `credentials_set` flag. After saving, input fields
are cleared. No saved access key, secret, encrypted credential or signed URL is
sent to the browser or renderer. Saving configuration does not test connectivity.

Credentials use XChaCha20-Poly1305 authenticated encryption with a fresh nonce,
bound to the provider ID. The encryption key is created atomically as an
owner-private `<ARTISMAGA_DATA_DIR>/storage.key`. Back up this key and database
securely together. Losing the key prevents access to saved cloud credentials;
restore it or supply replacement credentials for each location. Encryption at rest
does not protect against a compromised application host.

Each asset keeps its provider ID. Switching locations affects new uploads and does
not move existing files. Returning to the same location reuses its saved provider;
changing keys there updates access to its existing assets. Retained location
metadata is available in the settings response; automated migration and deletion of
retained provider configurations are not implemented.

AWS/R2 adapters are implemented using their S3 APIs. Local disk, encryption,
configuration privacy and artwork authorization are tested locally. No live AWS or
Cloudflare service is required by the test suite or contacted when saving settings.
Cloud credentials, IAM/bucket policy and deployment connectivity need operator
verification; local tests do not establish vendor-service compatibility end to end.

## Upload and access boundaries

Only JPEG, PNG and WebP images are accepted, up to 8 MiB input, 8,000 pixels on
either edge and 32 megapixels. Decode allocation is capped; two upload slots and
two image workers bound concurrent work. Upload bodies have a 20-second timeout;
provider operations have 30-second timeouts. Images are resized and re-encoded to
JPEG, stripping original metadata and disallowing SVG/active content.

Object names are generated IDs. All media is served through `/media/<asset-id>`:
cloud buckets have no public URLs in the UI. Artwork requires ownership or access
to a referencing work. Configured default covers and referenced genre/subgenre artwork are public. Chapter covers inherit private work access.
No avatar uploads are introduced; profile pictures still use Gravatar.

Account export includes owned work metadata, artwork metadata, sharing grants and
private last-access records. It does not bundle image binaries or credentials.
Account deletion atomically removes owned works/grants/history/private artwork
metadata, clears references from other works and queues physical blob deletion.
A best-effort cleanup starts after deletion and retries hourly; failed jobs remain
in the database. Site branding and genre artwork remain site-owned data. Unused pre-creation
uploads are private but currently require operational cleanup; a general storage
quota/orphan lifecycle and asset history are future work.

## References

- [Object store S3 adapter](https://docs.rs/object_store/0.13.2/object_store/aws/struct.AmazonS3Builder.html)
- [Cloudflare R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)
- [Image decoding limits](https://docs.rs/image/0.25.10/image/struct.ImageReader.html)
- [RustCrypto authenticated encryption](https://docs.rs/chacha20poly1305/0.10.1/chacha20poly1305/)
