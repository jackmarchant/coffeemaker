#!/usr/bin/env bash
# Rewrites ?v=<hash> on long-cached static assets in HTML files.
# Idempotent: only touches HTML when the content hash actually changed.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

ASSETS=(styles.css app.js)
HTML_FILES=(index.html edit.html)

hash_of() {
  if command -v sha1sum >/dev/null 2>&1; then
    sha1sum "$1" | cut -c1-10
  else
    shasum -a 1 "$1" | cut -c1-10
  fi
}

regex_escape() {
  printf '%s' "$1" | sed 's|[][\\.*^$(){}+?|/]|\\&|g'
}

changed=()

for asset in "${ASSETS[@]}"; do
  if [ ! -f "$asset" ]; then
    echo "bust-cache: missing $asset" >&2
    exit 1
  fi
  new_hash=$(hash_of "$asset")
  esc=$(regex_escape "$asset")
  for html in "${HTML_FILES[@]}"; do
    [ -f "$html" ] || continue
    tmp=$(mktemp)
    # Anchor on ="..." so we only rewrite real attribute values.
    sed -E "s|=\"${esc}(\\?v=[A-Za-z0-9]+)?\"|=\"${asset}?v=${new_hash}\"|g" "$html" > "$tmp"
    if ! cmp -s "$tmp" "$html"; then
      mv "$tmp" "$html"
      changed+=("$html")
    else
      rm "$tmp"
    fi
  done
done

if [ ${#changed[@]} -gt 0 ]; then
  printf '%s\n' "${changed[@]}" | sort -u | while read -r f; do
    echo "bust-cache: updated $f"
    git add "$f" 2>/dev/null || true
  done
fi
