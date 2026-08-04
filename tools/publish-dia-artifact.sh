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
LIST_ROWS=10

# One work directory for the run. The previous code made a mktemp -d for the
# textutil fallback and removed it inline, which leaked it if anything between
# those two points failed under set -e.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

gui_alert() {
  # activate first, or an alert raised from a menu-bar Shortcut can open behind
  # whatever is frontmost and read as the click having done nothing.
  osascript -l JavaScript -e '
function run(argv) {
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.activate();
  app.displayAlert("Publish to francaisavecjenn.ca", { message: argv[0], as: "critical" });
}' "$1" >/dev/null 2>&1 || true
}

# Every message this script printed was invisible to the teacher: a Shortcuts
# "Run Shell Script" action discards stdout and stderr, so a failure surfaced as
# a generic Shortcuts banner with no reason in it. The wording does not change;
# the TTY test only decides whether it is also drawn.
#
# This is environment detection, which the spec rejects for *selection* — the
# page published must never depend on invisible state, because a slug is
# permanent. It is fine for presentation, which changes only visibility.
die() { echo "✗ $1" >&2; [ -t 2 ] || gui_alert "$1"; exit 1; }

# Non-fatal, and deliberately not alerted: the paths that reach warn are the
# terminal and scripted ones. The path with no terminal shows the picker, where
# the same information is a marker on the row.
warn() { echo "⚠ $1" >&2; }

# Options are consumed up front so they work in any order. The previous form
# tested "$1" positionally, which meant only a leading --local was recognised.
CLI_TOKEN=""
WANT_LIST=0
WANT_LATEST=0
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
    --latest) WANT_LATEST=1; shift ;;
    --)      shift; break ;;
    -*)      die "Unknown option '$1'. Try --list, --latest, --local, or --token <value>." ;;
    *)       break ;;
  esac
done

# An option written after the artifact name would land here as a second
# positional and be ignored silently, which looks exactly like the token not
# working. Fail with the reason instead.
if [ $# -gt 1 ]; then
  die "Unexpected argument '$2'. Options go before the artifact name."
fi

# A silent precedence rule between these two would be a coin flip over which
# page gets a permanent URL.
if [ "$WANT_LATEST" = "1" ] && [ -n "${1:-}" ]; then
  die "Pass --latest or a title, not both."
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

# argv[0] is a file holding one artifact path per line. Emits one
# "title<TAB>refcount" line per input path, in input order.
#
# Title extraction lives here rather than after selection because the picker
# needs the title *before* the choice is made, and two extraction paths would
# drift — a list reading Cr&ecirc;pes beside a page published as Crêpes.
#
# decode() below is deliberately partial: it knows the five core entities and
# every numeric reference, and nothing else. A surviving &name; is left intact
# for decode_entities to hand to textutil, which owns the full table.
#
# refcount counts distinct relative src=/href= values and url(…) references in
# an inline <style>: how many files the page needs that will not be published.
# Counting files in the directory instead would flag a self-contained page that
# happens to sit beside a .DS_Store.
#
# No single quotes anywhere in the JS below — it rides inside a single-quoted
# shell string.
describe_artifacts() {
  osascript -l JavaScript -e '
ObjC.import("Foundation");

function readUtf8(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  // .js === undefined covers both an unreadable file and one that is not UTF-8.
  // s.isNil is a *method*; referencing it without calling it is always truthy.
  return s.js === undefined ? null : s.js;
}

// &amp; decodes LAST. Doing it first would turn a deliberately double-escaped
// &amp;lt; into a bare <, losing the escaping the author asked for.
function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function localRefs(html) {
  var seen = {}, n = 0, m;
  function add(u) {
    u = u.trim();
    if (!u) { return; }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) { return; }   // https:, data:, mailto:, tel:
    if (u.slice(0, 2) === "//" || u.charAt(0) === "#") { return; }
    if (!seen[u]) { seen[u] = 1; n++; }
  }
  var attr = /(?:src|href)\s*=\s*"([^"]*)"/gi;
  while ((m = attr.exec(html)) !== null) { add(m[1]); }
  // url(…) is the case that matters, not an afterthought. These artifacts are
  // single-file HTML with inline CSS, so a background image is referenced this
  // way and no other — counting attributes alone returned 0 for such a page,
  // and 0 is the value meaning *self-contained, nothing to warn about*.
  // The quote class is written ["\x27] because a literal quote of that kind
  // cannot appear in this JS at all: it would end the shell string around it.
  var block = /<style[^>]*>([\s\S]*?)<\/style>/gi, b;
  while ((b = block.exec(html)) !== null) {
    var css = /url\(\s*(["\x27]?)([^)"\x27]*)\1\s*\)/gi, u;
    while ((u = css.exec(b[1])) !== null) { add(u[2]); }
  }
  return n;
}

// .../<uuid>/<name>/site/index.html -> <name>
function folderName(path) {
  var p = path.split("/");
  return p.length >= 3 ? p[p.length - 3] : path;
}

function run(argv) {
  var listing = readUtf8(argv[0]);
  // This throws where an unreadable *artifact* degrades to (unreadable) in
  // place: a missing path list means the caller is broken, and every row would
  // be wrong. One bad artifact must not cost the other nine their place.
  if (listing === null) { throw new Error("cannot read the path list"); }
  return listing.split("\n").filter(function (p) { return p.length > 0; }).map(function (p) {
    var html = readUtf8(p);
    if (html === null) { return "(unreadable)\t0"; }
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    // Collapse whitespace: a title spanning newlines is normal, and a tab
    // inside one would corrupt this output format.
    var title = decode(m ? m[1] : "").replace(/\s+/g, " ").trim();
    if (!title) { title = folderName(p); }
    return title + "\t" + localRefs(html);
  }).join("\n");
}' "$1"
}

# decode() in describe_artifacts knows the five core entities and every numeric
# reference, which is all a UTF-8 artifact normally contains. A surviving &name;
# means something like &eacute;, and textutil is the only stock tool with the
# full table.
#
# This runs before the labels are built, not after selection: otherwise the
# dialog shows Cr&ecirc;pes and the published page says Crêpes.
#
# -inputencoding UTF-8 is not optional. The string is already UTF-8, and without
# the flag textutil reads those bytes as Latin-1 and turns Crêpes into CrÃªpes.
#
# Known and accepted: textutil parses its input as HTML, so a title containing
# literal tag-like text would have it stripped. That needs a title holding both
# an exotic entity and something shaped like a tag, and the damage is cosmetic.
decode_entities() {
  local decoded
  printf '%s' "$1" | grep -q '&[a-zA-Z][a-zA-Z0-9]*;' || { printf '%s' "$1"; return 0; }
  printf '%s' "$1" > "$WORK/title.html"
  # The [ -n ] test is load-bearing and fixes a pre-existing bug. When textutil
  # cannot reach its helper process it exits **0** and writes nothing to stdout,
  # so testing the exit status alone sets the title to the empty string and
  # publishes that — the old code did exactly this, under a comment claiming
  # "the partially decoded title still publishes". It does not. An empty title
  # then derives the slug, which is permanent.
  #
  # `if decoded=$(...)` rather than `decoded=$(...) && ...` because under set -e
  # the && form makes it ambiguous whether a failure aborts. A failure here is
  # genuinely not fatal — the partially decoded title still publishes, which is
  # now true rather than merely intended.
  if decoded=$(textutil -convert txt -inputencoding UTF-8 -stdout "$WORK/title.html" 2>/dev/null) &&
     [ -n "$decoded" ]; then
    printf '%s' "$decoded"
  else
    printf '%s' "$1"
  fi
}

# stdin:  "mtime path" lines, as list_artifacts emits them
# stdout: "mtime<TAB>path<TAB>title<TAB>refcount", titles fully decoded
#
# Tab-delimited because the paths contain spaces ("Application Support").
candidate_rows() {
  local src="$WORK/src.txt" paths="$WORK/paths.txt" desc="$WORK/desc.txt"
  cat > "$src"
  [ -s "$src" ] || return 0
  cut -d' ' -f2- < "$src" > "$paths"
  describe_artifacts "$paths" > "$desc" \
    || die "Could not read the Dia artifacts. Is the folder readable?"
  # osascript appends a newline to its result, so both counts are the row count.
  [ "$(wc -l < "$paths")" = "$(wc -l < "$desc")" ] \
    || die "describe_artifacts returned the wrong number of rows."
  paste -d'\t' <(cut -d' ' -f1 < "$src") "$paths" "$desc" \
    | while IFS=$'\t' read -r mtime path title refs; do
        printf '%s\t%s\t%s\t%s\n' "$mtime" "$path" "$(decode_entities "$title")" "$refs"
      done
}

# stdin:  "mtime<TAB>path<TAB>title<TAB>refcount"
# stdout: one display label per line, same order
#
# chooseFromList returns the chosen *string*, not an index, so two identical
# labels are indistinguishable. Titles repeat across days and the timestamp
# usually separates them, but regenerating a page twice inside a minute does
# not. Suffixing later duplicates makes the label-to-row map total by
# construction rather than by luck.
build_labels() {
  local mtime path title refs label i j n dup
  local labels=()
  while IFS=$'\t' read -r mtime path title refs; do
    # %-d rather than %e, so a single-digit day gives "Fri 1 Aug" and not the
    # double-spaced "Fri  1 Aug". The - padding modifier is usually a glibc
    # extension; it was verified working in macOS's BSD date.
    label="$title — $(date -r "$mtime" '+%a %-d %b %H:%M')"
    if [ "${refs:-0}" -gt 1 ]; then
      label="$label  ⚠ $refs linked files"
    elif [ "${refs:-0}" = "1" ]; then
      label="$label  ⚠ 1 linked file"
    fi
    labels[${#labels[@]}]="$label"
  done
  n=${#labels[@]}
  for ((i = 0; i < n; i++)); do
    dup=1
    for ((j = 0; j < i; j++)); do
      [ "${labels[$j]}" = "${labels[$i]}" ] && dup=$((dup + 1))
    done
    [ "$dup" -gt 1 ] && labels[$i]="${labels[$i]} ($dup)"
    printf '%s\n' "${labels[$i]}"
  done
}

if [ "$WANT_LIST" = "1" ]; then
  echo "Recent Dia artifacts:"
  # The same labels the dialog shows, so the two cannot drift.
  list_artifacts | head -"$LIST_ROWS" | candidate_rows | build_labels |
    while IFS= read -r label; do printf '  %s\n' "$label"; done
  exit 0
fi

choose_artifact() { die "The picker is not wired up yet. Use --latest."; }

# INDEX and TITLE are both set by every branch below. TITLE comes from the same
# extraction that built the list, so the string on screen is the string that
# derives the slug.
INDEX=""
TITLE=""
REFS=0

if [ -n "${1:-}" ]; then
  # Every artifact, not just the LIST_ROWS the dialog shows: a caller naming an
  # exact title should not fail because the page is three weeks old.
  WANT=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  HITS=0
  while IFS=$'\t' read -r mtime path title refs; do
    HAY=$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]')
    case "$HAY" in
      *"$WANT"*)
        HITS=$((HITS + 1))
        # Rows arrive newest first, so the first hit is the newest.
        [ -z "$INDEX" ] && { INDEX="$path"; TITLE="$title"; REFS="$refs"; }
        ;;
    esac
    # `< <(…)` rather than a pipe: a while on the right of a pipe runs in a
    # subshell in bash 3.2, so INDEX would be empty afterwards.
  done < <(list_artifacts | candidate_rows)
  [ -n "$INDEX" ] || die "No page whose title contains '$1'. Try --list."
  [ "$HITS" -gt 1 ] && echo "$HITS pages match '$1'; taking the newest."
elif [ "$WANT_LATEST" = "1" ]; then
  while IFS=$'\t' read -r mtime path title refs; do
    INDEX="$path"; TITLE="$title"; REFS="$refs"
  done < <(list_artifacts | head -1 | candidate_rows)
  [ -n "$INDEX" ] || die "No artifacts found yet."
else
  choose_artifact          # sets INDEX, TITLE, REFS
fi

# Keep NAME alive for now. Two blocks further down still read it — the extras
# warning and the old title extraction — and this script runs under `set -u`, so
# removing it here would abort with "NAME: unbound variable" before Task 11
# deletes its last use.
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
