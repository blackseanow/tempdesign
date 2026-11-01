#!/usr/bin/env bash
# Uses SSH keys/agent or interactive SSH authentication; never stores credentials.
# Config is installed once separately; subsequent releases need no Nginx reload.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${PREVIEW_SSH_TARGET:-root@182.61.30.47}"
# Optional ControlPath lets a prepared SSH connection be reused by SSH and SCP.
SSH_ARGS=()
if [[ -n "${PREVIEW_SSH_CONTROL_PATH:-}" ]]; then
    SSH_ARGS=(-o "ControlPath=$PREVIEW_SSH_CONTROL_PATH")
fi
"$ROOT/scripts/build-site.sh"
REV="$(git -C "$ROOT" rev-parse --short HEAD)"
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$REV"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/site.tgz"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE" -C "$ROOT/site" .
ssh "${SSH_ARGS[@]}" "$TARGET" 'install -d -m 755 /var/www/tempdesign-preview/releases'
scp "${SSH_ARGS[@]}" "$ARCHIVE" "$TARGET:/var/www/tempdesign-preview/releases/$RELEASE.tgz"
ssh "${SSH_ARGS[@]}" "$TARGET" bash -s -- "$RELEASE" <<'REMOTE'
set -euo pipefail
release="$1"
base=/var/www/tempdesign-preview
install -d -m 755 "$base/releases/$release"
tar -xzf "$base/releases/$release.tgz" -C "$base/releases/$release"
find "$base/releases/$release" -type d -exec chmod 755 {} +
find "$base/releases/$release" -type f -exec chmod 644 {} +
test -f "$base/releases/$release/home-pano/index.html"
test -f "$base/releases/$release/anatomy/dabing/dabing.html"
# Atomic release activation; previous releases remain available for rollback.
ln -s "releases/$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
rm "$base/releases/$release.tgz"
printf 'Activated %s\n' "$release"
REMOTE
printf 'Preview: https://xianyu.182.61.30.47.sslip.io/home-pano/\n'
