#!/bin/bash
# Publish the most recent Dia artifact to francaisavecjenn.ca.
#
# Dia serves its artifacts from chrome-untrusted://, a Chromium-internal scheme
# no browser extension can be granted access to — which is why this reads the
# files from disk instead. Dia writes each artifact to a plain directory, so
# there is nothing to scrape and nothing to copy by hand.
#
# Usage:
#   publish-dia-artifact.sh              # the newest artifact
#   publish-dia-artifact.sh --list       # the ten newest, with dates
#   publish-dia-artifact.sh <name>       # a named artifact, e.g. montreal_french
#
# The token is read from, in order: $PAGES_UPLOAD_TOKEN, then
# ~/.config/francaisavecjenn/token. The site defaults to production and can be
# overridden with $JENN_SITE (e.g. http://localhost:3000 while testing).

set -euo pipefail

ARTIFACTS="$HOME/Library/Application Support/Dia/User Data/Default/AgentArtifacts"
SITE="${JENN_SITE:-https://francaisavecjenn.ca}"
TOKEN_FILE="$HOME/.config/francaisavecjenn/token"

die() { echo "✗ $1" >&2; exit 1; }

# --local aims at the dev server and takes the token from the repo's own
# .env.local, so testing never involves pasting the production token anywhere.
if [ "${1:-}" = "--local" ]; then
  SITE="http://localhost:3000"
  ENV_LOCAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"
  if [ -f "$ENV_LOCAL" ]; then
    PAGES_UPLOAD_TOKEN=$(grep '^PAGES_UPLOAD_TOKEN=' "$ENV_LOCAL" | cut -d= -f2- | tr -d '"'"'"' \t\r')
    export PAGES_UPLOAD_TOKEN
  fi
  curl -sS -o /dev/null "$SITE/" 2>/dev/null || die "Nothing answering on $SITE. Run 'npm run dev' first."
  shift
fi

[ -d "$ARTIFACTS" ] || die "No Dia artifacts folder. Is Dia installed?"

# Every artifact is <uuid>/<name>/site/index.html. Sorting the index files by
# modification time is what makes "the one I just made" the default, without
# needing to know the uuid Dia assigned it.
list_artifacts() {
  find "$ARTIFACTS" -type f -path "*/site/index.html" -print0 2>/dev/null |
    xargs -0 stat -f '%m %N' 2>/dev/null |
    sort -rn
}

if [ "${1:-}" = "--list" ]; then
  echo "Recent Dia artifacts:"
  list_artifacts | head -10 | while read -r mtime path; do
    name=$(basename "$(dirname "$(dirname "$path")")")
    printf '  %s  %s\n' "$(date -r "$mtime" '+%b %e %H:%M')" "$name"
  done
  exit 0
fi

if [ -n "${1:-}" ]; then
  INDEX=$(list_artifacts | awk -v want="/$1/site/index.html" 'index($0, want) { $1=""; sub(/^ /,""); print; exit }')
  [ -n "$INDEX" ] || die "No artifact named '$1'. Try --list."
else
  INDEX=$(list_artifacts | head -1 | cut -d' ' -f2-)
  [ -n "$INDEX" ] || die "No artifacts found yet."
fi

NAME=$(basename "$(dirname "$(dirname "$INDEX")")")

# An artifact that ships extra files is not self-contained, and the site's CSP
# blocks everything a page loads from elsewhere — so those files would silently
# go missing rather than fail loudly. Better to say so before publishing.
EXTRAS=$(find "$(dirname "$INDEX")" -type f ! -name index.html | wc -l | tr -d ' ')
if [ "$EXTRAS" != "0" ]; then
  echo "⚠ '$NAME' has $EXTRAS file(s) beside index.html. Only index.html is published,"
  echo "  and anything it loads from those files will be missing. Continuing anyway."
fi

if [ -n "${PAGES_UPLOAD_TOKEN:-}" ]; then
  TOKEN="$PAGES_UPLOAD_TOKEN"
elif [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
else
  die "No token. Put it in $TOKEN_FILE (see tools/publish-extension/README.md)."
fi

TITLE=$(python3 -c '
import re, sys, html
source = open(sys.argv[1], encoding="utf-8").read()
match = re.search(r"<title[^>]*>(.*?)</title>", source, re.S | re.I)
print(html.unescape(match.group(1)).strip() if match else sys.argv[2])
' "$INDEX" "$NAME")

BODY=$(python3 -c '
import json, sys
print(json.dumps({
    "title": sys.argv[1],
    "html": open(sys.argv[2], encoding="utf-8").read(),
}))
' "$TITLE" "$INDEX")

echo "Publishing \"${TITLE}\" ($(wc -c < "$INDEX" | tr -d ' ') bytes) to ${SITE} ..."

RESPONSE=$(curl -sS -w '\n%{http_code}' -X POST "$SITE/api/pages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY")

STATUS=$(echo "$RESPONSE" | tail -1)
PAYLOAD=$(echo "$RESPONSE" | sed '$d')

if [ "$STATUS" != "201" ]; then
  die "The site said $STATUS: $PAYLOAD"
fi

URL=$(echo "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')
SLUG="${URL##*/p/}"

echo "✓ $URL"
printf '%s' "$URL" | pbcopy 2>/dev/null && echo "  (link copied to the clipboard)"

# Published with no groups, so the link works but no class sees it listed yet.
open "$SITE/admin/pages/$SLUG" 2>/dev/null || true
