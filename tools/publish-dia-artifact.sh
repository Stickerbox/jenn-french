#!/bin/bash
# Publish the most recent Dia artifact to francaisavecjenn.ca.
#
# Dia serves its artifacts from chrome-untrusted://, a Chromium-internal scheme
# no browser extension can be granted access to — which is why this reads the
# files from disk instead. Dia writes each artifact to a plain directory, so
# there is nothing to scrape and nothing to copy by hand.
#
# Usage:
#   publish-dia-artifact.sh                        # the newest artifact
#   publish-dia-artifact.sh --list                 # the ten newest, with dates
#   publish-dia-artifact.sh <name>                 # e.g. montreal_french
#   publish-dia-artifact.sh --token <value> [name] # supply the token inline
#
# Options go before the artifact name.
#
# The token is read from, in order: --token, then $PAGES_UPLOAD_TOKEN, then
# ~/.config/francaisavecjenn/token. Nothing is written to disk, so --token has to
# be repeated on every run.
#
# A token in an argument is visible to `ps` for same-user processes and lands in
# shell history. The token file avoids both; --token exists because it needs no
# setup at all.
#
# The site defaults to production and can be overridden with $JENN_SITE (e.g.
# http://localhost:3000 while testing).

set -euo pipefail

# Overridable so verification can run against a disposable fixture tree rather
# than the developer's live Dia folder, which changes between runs and has no
# non-UTF-8, missing-title or duplicate-timestamp artifacts to test against.
# Unset in normal use — the teacher never sets it.
#
# `-` not `:-`, unlike JENN_SITE below: an empty value means a caller meant to
# redirect this and got the path wrong, and falling back to the real folder
# would publish a real artifact. Empty instead fails the [ -d ] check below.
ARTIFACTS="${DIA_ARTIFACTS-$HOME/Library/Application Support/Dia/User Data/Default/AgentArtifacts}"
SITE="${JENN_SITE:-https://francaisavecjenn.ca}"
TOKEN_FILE="$HOME/.config/francaisavecjenn/token"

die() { echo "✗ $1" >&2; exit 1; }

# Options are consumed up front so they work in any order. The previous form
# tested "$1" positionally, which meant only a leading --local was recognised.
CLI_TOKEN=""
WANT_LIST=0
USE_LOCAL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --token)
      [ $# -ge 2 ] || die "--token needs a value."
      CLI_TOKEN="$2"
      shift 2
      ;;
    --token=*)
      CLI_TOKEN="${1#--token=}"
      [ -n "$CLI_TOKEN" ] || die "--token needs a value."
      shift
      ;;
    --local) USE_LOCAL=1; shift ;;
    --list)  WANT_LIST=1;  shift ;;
    --)      shift; break ;;
    -*)      die "Unknown option '$1'. Try --list, --local, or --token <value>." ;;
    *)       break ;;
  esac
done

# An option written after the artifact name would land here as a second
# positional and be ignored silently, which looks exactly like the token not
# working. Fail with the reason instead.
if [ $# -gt 1 ]; then
  die "Unexpected argument '$2'. Options go before the artifact name."
fi

# --local aims at the dev server and takes the token from the repo's own
# .env.local, so testing never involves pasting the production token anywhere.
# An explicit --token still wins — it is checked first when the token resolves.
if [ "$USE_LOCAL" = "1" ]; then
  SITE="http://localhost:3000"
  ENV_LOCAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"
  if [ -f "$ENV_LOCAL" ]; then
    PAGES_UPLOAD_TOKEN=$(grep '^PAGES_UPLOAD_TOKEN=' "$ENV_LOCAL" | cut -d= -f2- | tr -d '"'"'"' \t\r')
    export PAGES_UPLOAD_TOKEN
  fi
  curl -sS -o /dev/null "$SITE/" 2>/dev/null || die "Nothing answering on $SITE. Run 'npm run dev' first."
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

if [ "$WANT_LIST" = "1" ]; then
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

# --token first: an explicit value beats anything ambient, including the
# .env.local read that --local performs.
if [ -n "$CLI_TOKEN" ]; then
  TOKEN="$CLI_TOKEN"
elif [ -n "${PAGES_UPLOAD_TOKEN:-}" ]; then
  TOKEN="$PAGES_UPLOAD_TOKEN"
elif [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
else
  die "No token. Pass --token <value>, set \$PAGES_UPLOAD_TOKEN, or put it in $TOKEN_FILE."
fi

# Everything below reads and encodes with osascript rather than python3. macOS
# ships no usable python3 — /usr/bin/python3 is an xcode-select stub that only
# offers to install the command line tools — and this runs on a machine that has
# none. osascript -l JavaScript is core OS, present since 10.10, and brings a
# real JSON encoder rather than one hand-rolled in awk.
#
# The title matters more than it looks: the server derives the page slug from it
# when the payload sends no slug, and a slug never moves again once created. A
# mangled title bakes in a mangled bookmark.
TITLE=$(osascript -l JavaScript -e '
ObjC.import("Foundation");
// &amp; decodes LAST. Doing it first would turn a deliberately double-escaped
// &amp;lt; into a bare <, losing the escaping the author asked for.
function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function run(argv) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  // A nil return covers both an unreadable file and one that is not UTF-8.
  // Checking .js === undefined is the working test; s.isNil is a *method*, so
  // referencing it without calling it is always truthy.
  if (s.js === undefined) { return "__PUBLISH_UNREADABLE__"; }
  var m = s.js.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decode(m ? m[1] : argv[1]).trim();
}' "$INDEX" "$NAME")

if [ "$TITLE" = "__PUBLISH_UNREADABLE__" ]; then
  die "Could not read '$INDEX' as UTF-8 text."
fi

# decode() above knows the five core entities and every numeric reference, which
# is all a UTF-8 artifact ever contains. A surviving &name; means something like
# &eacute;, and textutil is the only stock tool that knows the full table.
#
# -inputencoding UTF-8 is not optional. The string is already UTF-8 by this
# point, and without the flag textutil reads those bytes as Latin-1 and turns
# Crêpes into CrÃªpes.
#
# Known and accepted: textutil parses its input as HTML, so a title containing
# literal tag-like text would have it stripped. That needs a title holding both
# an exotic entity and something shaped like a tag, and the damage is cosmetic.
if printf '%s' "$TITLE" | grep -q '&[a-zA-Z][a-zA-Z0-9]*;'; then
  ENTDIR=$(mktemp -d)
  printf '%s' "$TITLE" > "$ENTDIR/title.html"
  # Written as `if DECODED=$(...)` rather than `DECODED=$(...) && ...` because
  # under `set -e` the && form makes it ambiguous whether a failure aborts.
  # A failure here is not fatal — the partially decoded title still publishes.
  if DECODED=$(textutil -convert txt -inputencoding UTF-8 -stdout "$ENTDIR/title.html" 2>/dev/null); then
    TITLE="$DECODED"
  fi
  rm -rf "$ENTDIR"
fi

# Only the file *path* crosses the process boundary, so 2 MB of arbitrary HTML
# never meets shell word-splitting or quoting.
BODY=$(osascript -l JavaScript -e '
ObjC.import("Foundation");
function run(argv) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(argv[1], $.NSUTF8StringEncoding, null);
  return JSON.stringify({ title: argv[0], html: s.js });
}' "$TITLE" "$INDEX")

echo "Publishing \"${TITLE}\" ($(wc -c < "$INDEX" | tr -d ' ') bytes) to ${SITE} ..."

# The body arrives on stdin, not in an argument. ARG_MAX is 1 MB while the
# endpoint accepts 2 MB, so `-d "$BODY"` died with "argument list too long"
# before sending anything for pages in between — a raw shell error rather than
# this script's own reporting. Piping leaves the size ceiling where it belongs,
# in MAX_PAGE_BYTES on the server.
RESPONSE=$(printf '%s' "$BODY" | curl -sS -w '\n%{http_code}' -X POST "$SITE/api/pages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @-)

STATUS=$(echo "$RESPONSE" | tail -1)
PAYLOAD=$(echo "$RESPONSE" | sed '$d')

if [ "$STATUS" != "201" ]; then
  die "The site said $STATUS: $PAYLOAD"
fi

URL=$(osascript -l JavaScript -e 'function run(argv) { return JSON.parse(argv[0]).url; }' "$PAYLOAD")
SLUG="${URL##*/p/}"

echo "✓ $URL"

# The site inlines a page's external assets when it publishes it and reports
# whatever it could not fetch. That report exists only in the reply, so it has
# to be printed here or it is lost. `|| []` because $JENN_SITE may name a
# deployment that predates the field.
SKIPPED=$(osascript -l JavaScript -e '
function run(argv) {
  var list = JSON.parse(argv[0]).skipped || [];
  return list.map(function (item) { return item.url + " — " + item.reason; }).join("\n");
}' "$PAYLOAD")

if [ -n "$SKIPPED" ]; then
  echo "⚠ The page published, but some files could not be included:"
  # A read loop rather than one printf, so each line is indented. `<<<` is fine
  # on the bash 3.2 macOS ships; mapfile is not.
  while IFS= read -r line; do
    echo "    $line"
  done <<< "$SKIPPED"
fi

printf '%s' "$URL" | pbcopy 2>/dev/null && echo "  (link copied to the clipboard)"

# Published with no groups, so the link works but no class sees it listed yet.
open "$SITE/admin/pages/$SLUG" 2>/dev/null || true
