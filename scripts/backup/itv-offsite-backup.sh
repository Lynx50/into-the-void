#!/usr/bin/env bash
# pg_dump streams directly into age; plaintext is never written to disk.
set -Eeuo pipefail
umask 077

fail() { printf 'BACKUP FAILED: %s\n' "$1" >&2; exit 1; }
for bin in pg_dump age rclone sha256sum base64 mktemp stat; do
  command -v "$bin" >/dev/null 2>&1 || fail "Missing required tool: $bin"
done

for name in ITV_NEON_READONLY_URL ITV_AGE_RECIPIENT ITV_RCLONE_CONFIG_B64; do
  [ -n "$(printenv "$name" || true)" ] || fail "Missing required secret/variable: $name"
done

[[ "$ITV_AGE_RECIPIENT" =~ ^age1[0-9a-z]+$ ]] || fail 'AGE recipient must be a public age1... key'
[ -z "$(printenv ITV_AGE_IDENTITY 2>/dev/null || true)" ] || fail 'Never provide the private age identity to the backup runner'

workdir="$(mktemp -d)"
cleanup() { rm -rf -- "$workdir"; }
trap cleanup EXIT
printf '%s' "$ITV_RCLONE_CONFIG_B64" | base64 --decode > "$workdir/rclone.conf" || fail 'Cannot decode Drive credential'
chmod 600 "$workdir/rclone.conf"
# Enforce least privilege: app-created Google Drive files only, never broad Drive scope.
grep -Eq '^\[itvdrive\][[:space:]]*$' "$workdir/rclone.conf" || fail 'rclone remote [itvdrive] not found'
grep -Eq '^[[:space:]]*scope[[:space:]]*=[[:space:]]*drive\.file[[:space:]]*$' "$workdir/rclone.conf" || fail 'Use Google Drive drive.file scope only'

export PGCONNECT_TIMEOUT=20
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
run_id="$(printenv GITHUB_RUN_ID || echo local)"
attempt="$(printenv GITHUB_RUN_ATTEMPT || echo 1)"
[[ "$run_id" =~ ^[0-9A-Za-z_-]+$ ]] || fail 'Invalid run identifier'
[[ "$attempt" =~ ^[0-9A-Za-z_-]+$ ]] || fail 'Invalid run attempt'
filename="into-the-void-$stamp-$run_id-$attempt.dump.age"
archive="$workdir/$filename"

# Never echo the connection URL or pipe plaintext to GitHub Actions artifacts/logs.
if ! (set -o pipefail; pg_dump --no-password --format=custom --no-owner --no-acl --dbname="$ITV_NEON_READONLY_URL" 2>"$workdir/pg-error" | age -r "$ITV_AGE_RECIPIENT" -o "$archive" 2>"$workdir/age-error"); then
  fail 'Database export/encryption failed. Check the read-only credential and permissions privately.'
fi
[ -s "$archive" ] || fail 'Encrypted archive is empty'
expected="$(sha256sum "$archive" | cut -d' ' -f1)"

remote="itvdrive:IntoTheVoid-Encrypted-Backups/$filename"
if ! rclone --config "$workdir/rclone.conf" --quiet copyto "$archive" "$remote" --immutable 2>"$workdir/upload-error"; then
  fail 'Encrypted Google Drive upload failed'
fi
if ! rclone --config "$workdir/rclone.conf" --quiet copyto "$remote" "$workdir/readback.age" 2>"$workdir/download-error"; then
  fail 'Encrypted Google Drive readback failed'
fi
actual="$(sha256sum "$workdir/readback.age" | cut -d' ' -f1)"
[ "$expected" = "$actual" ] || fail 'Offsite archive SHA-256 does not match original'
printf 'SUCCESS: encrypted Google Drive backup verified by downloaded SHA-256. File: %s; bytes: %s\n' "$filename" "$(stat -c %s "$archive")"
