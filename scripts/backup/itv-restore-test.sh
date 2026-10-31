#!/usr/bin/env bash
# Run on an operator-controlled computer. NEVER store the private age key in GitHub.
set -Eeuo pipefail
umask 077

fail() { printf 'RESTORE TEST FAILED: %s\n' "$1" >&2; exit 1; }
[ "$#" -eq 2 ] || fail 'Usage: bash itv-restore-test.sh archive.dump.age /offline/path/to/age-identity.txt'
archive="$1"
identity="$2"
[ -f "$archive" ] || fail 'Backup file missing'
[ -f "$identity" ] || fail 'Private age identity file missing'
command -v age >/dev/null || fail 'Install age'
command -v pg_restore >/dev/null || fail 'Install PostgreSQL pg_restore (v17+)'
# Confirms that the exact encrypted offsite archive can decrypt and its pg_dump
# custom format TOC is readable; suppress table names and contents.
if ! (set -o pipefail; age --decrypt --identity "$identity" "$archive" | pg_restore --list >/dev/null); then
  fail 'Cannot decrypt and parse custom-format archive'
fi
printf 'PASS: encrypted archive decrypts and pg_restore reads the archive catalog.\n'

# Full rehearsal is optional and ALWAYS local, on an empty throwaway database.
# Precreate local DB named itv_restore_test_<anything> then set ITV_TEST_LOCAL_DB.
if [ -n "$(printenv ITV_TEST_LOCAL_DB 2>/dev/null || true)" ]; then
  [[ "$ITV_TEST_LOCAL_DB" =~ ^itv_restore_test_[a-zA-Z0-9_]+$ ]] || fail 'Name must begin itv_restore_test_'
  case "$(printenv PGHOST 2>/dev/null || true)" in
    localhost|127.0.0.1|::1) ;;
    *) fail 'Full restore test requires PGHOST=localhost or loopback address' ;;
  esac
  if ! (set -o pipefail; age --decrypt --identity "$identity" "$archive" | pg_restore --no-owner --no-acl --exit-on-error --dbname="$ITV_TEST_LOCAL_DB" >/dev/null); then
    fail 'Restore into local test database failed'
  fi
  printf 'PASS: archive restored into pre-existing isolated local test database.\n'
fi
