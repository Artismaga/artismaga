# Third-party components

Artismaga's first-party code is AGPL-3.0-only. Its dependencies retain their own
licenses. The distribution invokes these separately managed components:

- **llama.cpp**: MIT, Copyright Georgi Gerganov and contributors. The complete
  notice is in `docs/licenses/llama.cpp-LICENSE.txt` and is copied into the app image.
  Pinned source: https://github.com/ggml-org/llama.cpp/tree/8642541b255bfb5dc39cd351a178be09013a55d6
- **Qwen3-4B-GGUF**: Apache-2.0, Qwen/Alibaba Cloud. The app downloads the
  official quantised weights after installation; they are not embedded in Git or
  the image. Model information and licensing:
  https://huggingface.co/Qwen/Qwen3-4B-GGUF and
  https://huggingface.co/Qwen/Qwen3-4B/blob/main/LICENSE
  Its model revision/file/hash are documented in `docs/localisation.md`.
- React, Mantine, Rocket, SurrealDB and other libraries/services retain their
  upstream notices. Consult dependency lockfiles and their distributions before
  redistributing a modified bundle. SurrealDB is provided by its official image.

- **Tiptap 3.32.1 / StarterKit**: MIT, Tiptap GmbH and contributors. See
  `docs/licenses/tiptap-LICENSE.txt`. Only the open-source editor is used.
- **jsdiff 9.0.0**: BSD-3-Clause, Kevin Decker and contributors. See
  `docs/licenses/jsdiff-LICENSE.txt`. Used for bounded revision text comparisons.

Node packages in the distribution retain their upstream license files, including
ProseMirror. The lockfile records exact versions of the bundled editor dependencies.

## Twemoji graphics

The six bundled reaction PNGs in `crates/web/assets/reactions` are unmodified
Twemoji v17.0.3 graphics by Twitter, Inc. and other contributors, distributed by
[jdecked/twemoji](https://github.com/jdecked/twemoji/tree/v17.0.3).
Graphics are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The full graphics license is in `docs/licenses/twemoji-LICENSE-GRAPHICS.txt`.
No Twemoji JavaScript runtime is included.

The reaction picker now includes all 4,009 PNGs from Twemoji v17.0.3, unmodified.
The reviewed tag archive SHA-256 is
`a0855654b633045ae2337537e77f1bb4361162f7fcd910e613eaab1d6d9c5fca`.
Search names derive from Unicode Emoji 17.0 `emoji-test.txt` (SHA-256
`1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda`),
© Unicode, Inc., used under the Unicode License v3 in
`docs/licenses/unicode-LICENSE.txt`. Source: https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt.

## Local reader speech

- **Kokoro.js 1.2.1**: Apache-2.0, hexgrad and contributors; see
  `docs/licenses/kokoro-LICENSE.txt` and https://github.com/hexgrad/kokoro/tree/main/kokoro.js.
- **Transformers.js 3.8.1**: Apache-2.0, Hugging Face and contributors; see
  `docs/licenses/transformers-LICENSE.txt`. ONNX Runtime Web retains its upstream MIT
  notices in the distributed npm package.
- **phonemizer 1.2.1**: Apache-2.0 JavaScript wrapper, Xenova and contributors; see
  `docs/licenses/phonemizer-LICENSE.txt`. It incorporates eSpeak NG (GPL-3.0-or-later),
  https://github.com/espeak-ng/espeak-ng. Preserve its source and licence obligations
  when redistributing modified binaries.
- **Kokoro-82M-v1.0-ONNX**: Apache-2.0 model assets, downloaded on demand rather than
  embedded in Git or the image. Immutable model revision:
  `1939ad2a8e416c0acfeecc08a694d14ef25f2231` at
  https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX.

KLIPY supplies optional third-party GIF search/media. Its API key stays server-side;
media loads directly from the documented KLIPY CDN hosts and is not cached by Artismaga.
