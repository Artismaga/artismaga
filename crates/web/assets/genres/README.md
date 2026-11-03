# Default genre artwork

Twelve bundled navigation backgrounds generated for Artismaga using the
built-in image-generation tool on 30 October 2026. The final prompt for each asset
is recorded in `prompts.json`. They are anime-style genre illustrations, without
artist imitation, external reference art, text or watermarks. Original generated
PNGs remain in Codex's generated-image directory; these WebP delivery files retain
the original dimensions and composition with standard image compression.

The HTTP route uses a closed filename list and embeds these files in the app.
Uploaded site taxonomy images take precedence. `web/src/shared/genre-artwork.ts`
contains their public URLs and sampled image accents. They do not create storage
provider records or overwrite saved administrator taxonomy choices.
