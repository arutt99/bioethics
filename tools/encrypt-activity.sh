#!/usr/bin/env bash
# Encrypt one original activity into docs/activities/ using the pinned StatiCrypt version.
#
# Usage:
#   tools/encrypt-activity.sh /path/to/private/originals/activity-id.html "Activity title"
#
# The script prompts for the access code twice, so it never appears in this script or in
# your shell history. The original file must live OUTSIDE this repository.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 /path/to/original.html [\"Activity title\"]" >&2
  exit 1
fi

original="$1"
title="${2:-Activity access code}"

if [[ ! -f "$original" ]]; then
  echo "Original file not found: $original" >&2
  exit 1
fi

original_abs="$(cd "$(dirname "$original")" && pwd)/$(basename "$original")"
case "$original_abs" in
  "$repo_root"/*)
    echo "Refusing: the original is inside the public repository ($repo_root)." >&2
    echo "Move it to your private authoring folder and run this again." >&2
    exit 1
    ;;
esac

name="$(basename "$original_abs")"
if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*\.html$ ]]; then
  echo "Rename the original to lowercase letters, numbers, and hyphens ending in .html (got: $name)." >&2
  exit 1
fi

if [[ ! -x "$repo_root/node_modules/.bin/staticrypt" ]]; then
  echo "StatiCrypt is not installed. Run 'npm ci' in $repo_root first." >&2
  exit 1
fi

if [[ -n "${STATICRYPT_PASSWORD:-}" ]]; then
  echo "Unset STATICRYPT_PASSWORD and let this script prompt for the code instead." >&2
  exit 1
fi

# Anyone can download the encrypted page and try codes offline, so short codes can be guessed.
min_length=16
echo "Choose a code of at least $min_length characters. Four or more unrelated words works well."
read -rsp "Access code: " code
echo
read -rsp "Type it again: " code_again
echo
if [[ "$code" != "$code_again" ]]; then
  echo "The two entries did not match. Nothing was encrypted." >&2
  exit 1
fi
if (( ${#code} < min_length )); then
  echo "That code is ${#code} characters. Use at least $min_length. Nothing was encrypted." >&2
  exit 1
fi
unset code_again

# The code is passed only to StatiCrypt's environment: never on the command line, in history, or on disk.
STATICRYPT_PASSWORD="$code" "$repo_root/node_modules/.bin/staticrypt" "$original_abs" \
  --directory "$repo_root/docs/activities" \
  --config false \
  --remember false \
  --template "$repo_root/tools/password_template.html" \
  --template-title "$title" \
  --template-instructions "Enter the access code your instructor gave you for this case." \
  --template-placeholder "Access code" \
  --template-button "Open case file" \
  --template-error "That code did not work. Check it and try again."

echo
echo "Encrypted: docs/activities/$name"
echo "Next: add or update its entry in docs/data/activities.json, then run 'npm run check'."
