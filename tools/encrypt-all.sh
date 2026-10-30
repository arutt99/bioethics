#!/usr/bin/env bash
# Encrypt every original in a private folder into docs/activities/, one after another.
#
# Usage:
#   tools/encrypt-all.sh ~/ETHOS-private/originals
#
# For each .html file it asks whether to encrypt it (press Enter for yes), then asks for
# that case's own code twice, through tools/encrypt-activity.sh. The page title comes from
# the case's entry in docs/data/activities.json, so add the entry first.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 1 || ! -d "$1" ]]; then
  echo "Usage: $0 /path/to/private/originals" >&2
  exit 1
fi

shopt -s nullglob
originals=("$1"/*.html)
if (( ${#originals[@]} == 0 )); then
  echo "No .html files in $1." >&2
  exit 1
fi

# Look up a case's title in activities.json by its published path.
title_for() {
  node -e '
    const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const entry = (data.activities || []).find((a) => a && a.path === "activities/" + process.argv[2]);
    if (entry) process.stdout.write(entry.title);
  ' "$repo_root/docs/data/activities.json" "$1"
}

encrypted=()
for original in "${originals[@]}"; do
  name="$(basename "$original")"
  title="$(title_for "$name")"
  echo
  if [[ -z "$title" ]]; then
    echo "Skipping $name: it has no entry in docs/data/activities.json. Add one, then run this again."
    continue
  fi
  read -rp "Encrypt $name (\"$title\")? [Y/n] " answer </dev/tty
  if [[ "$answer" =~ ^[Nn] ]]; then
    echo "Skipped $name."
    continue
  fi
  if ETHOS_BATCH=1 "$repo_root/tools/encrypt-activity.sh" "$original" "$title" </dev/tty; then
    encrypted+=("$name")
  else
    echo "Did not encrypt $name. Carrying on with the rest."
  fi
done

echo
if (( ${#encrypted[@]} == 0 )); then
  echo "Nothing was encrypted."
  exit 0
fi
echo "Encrypted ${#encrypted[@]}: ${encrypted[*]}"
echo "Next: run 'npm run check', preview with 'npm run serve', then commit and push."
