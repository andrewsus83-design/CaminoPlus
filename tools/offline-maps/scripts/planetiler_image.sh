#!/usr/bin/env bash
# Prints the Planetiler container image reference the build uses, pinned by digest.
#   docker pull "$(scripts/planetiler_image.sh)"
#
# A tag can be moved after the fact, a digest cannot. The digest below is the multi-arch manifest
# list of ghcr.io/onthegomap/planetiler:0.10.2 (checked 2026-11-06). To upgrade: set the new
# version, read its digest with
#   curl -sI -H 'Accept: application/vnd.oci.image.index.v1+json' -H "Authorization: Bearer $TOKEN" \
#     https://ghcr.io/v2/onthegomap/planetiler/manifests/<version>      # docker-content-digest header
# add it to the case below, then re-measure the packs (README, "Measured sizes").
# Override everything with PLANETILER_IMAGE (for example a local build).
set -euo pipefail
VERSION="${PLANETILER_VERSION:-0.10.2}"
if [[ -n "${PLANETILER_IMAGE:-}" ]]; then
  echo "$PLANETILER_IMAGE"
  exit 0
fi
case "$VERSION" in
  0.10.2) DIGEST="sha256:cf32202dbc001a9ab4bc11534b642b13de3798179817da8558e567a3d13dd403" ;;
  *) DIGEST="" ;;
esac
if [[ -z "$DIGEST" ]]; then
  echo "planetiler_image.sh: no pinned digest for Planetiler $VERSION; add one before using it in CI" >&2
  echo "ghcr.io/onthegomap/planetiler:$VERSION"
else
  echo "ghcr.io/onthegomap/planetiler:$VERSION@$DIGEST"
fi
