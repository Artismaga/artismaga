# App-managed, CPU-compatible translation runtime; no extra container or public port.
FROM debian:bookworm-slim AS translation-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl cmake build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /llama
RUN curl --fail --location https://github.com/ggml-org/llama.cpp/archive/8642541b255bfb5dc39cd351a178be09013a55d6.tar.gz -o source.tar.gz && echo '1688a167a8edd9499cdd0c19b8bd044f0fa184b466981977bbf2222d884953a4  source.tar.gz' | sha256sum --check && tar --extract --gzip --file source.tar.gz --strip-components=1 && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DBUILD_SHARED_LIBS=OFF && cmake --build build --target llama-server -j2

FROM node:24-bookworm-slim AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/tsconfig.json web/.prettierrc.json ./
COPY web/src ./src
COPY web/tests ./tests
COPY web/scripts ./scripts
COPY crates/web/assets/reader-sw.js /crates/web/assets/reader-sw.js
COPY crates/localisation/data /crates/localisation/data
RUN npm run format:check && npm run build && npm test

FROM web-build AS web-runtime
RUN npm prune --omit=dev

FROM rust:1.93-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY config/example.toml ./config/example.toml
COPY --from=web-build /web/dist ./web/dist
COPY --from=web-runtime /web/node_modules ./web/node_modules
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
RUN cargo build --release --locked -p artismaga

FROM builder AS integration
ENV ARTISMAGA_RENDERER_SCRIPT=/build/web/dist/server/worker.js
CMD ["cargo", "test", "--workspace", "--locked", "--", "--include-ignored"]

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 app && mkdir -p /app/data && chown app:app /app/data
WORKDIR /app
COPY --from=translation-runtime /llama/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=translation-runtime /llama/LICENSE /usr/share/doc/artismaga/llama.cpp-LICENSE
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/doc/artismaga/
COPY docs/licenses/tiptap-LICENSE.txt docs/licenses/jsdiff-LICENSE.txt docs/licenses/kokoro-LICENSE.txt docs/licenses/phonemizer-LICENSE.txt docs/licenses/transformers-LICENSE.txt /usr/share/doc/artismaga/
COPY --from=builder /build/target/release/artismaga /usr/local/bin/artismaga
COPY --from=web-build /web/dist ./web/dist
COPY --from=web-runtime /web/node_modules ./web/node_modules
USER app
ENV ARTISMAGA_DATA_DIR=/app/data ARTISMAGA_RENDERER_SCRIPT=/app/web/dist/server/worker.js ROCKET_ADDRESS=0.0.0.0 ROCKET_PORT=8000
EXPOSE 8000
CMD ["artismaga"]
