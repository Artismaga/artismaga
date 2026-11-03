#!/bin/sh
# Disposable private-network tests; no database port is published to the host.
set -eu
cd "$(dirname "$0")/.."
project="artismaga-tests-$$"
cleanup() { docker compose -p "$project" down --volumes; }
trap cleanup EXIT
trap 'exit 130' INT TERM
docker compose -p "$project" up -d --build --wait database
docker build --target integration -t artismaga-integration-tests .
docker run --rm --mount type=volume,source=artismaga-test-build-cache,target=/build/target/debug --network "${project}_database" \
  -e TEST_DATABASE_URL=http://database:8000 artismaga-integration-tests
