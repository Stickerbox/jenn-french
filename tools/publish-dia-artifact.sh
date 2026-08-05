#!/bin/bash
# Publish a Dia artifact to francaisavecjenn.ca.
#
# Dia serves its artifacts from chrome-untrusted://, a Chromium-internal scheme
# no browser extension can be granted access to — which is why this reads the
# files from disk instead. Dia writes each artifact to a plain directory, so
# there is nothing to scrape and nothing to copy by hand.
#
# Usage:
#   publish-dia-artifact.sh                        # choose from a dialog
#   publish-dia-artifact.sh --latest               # the newest, no dialog
#   publish-dia-artifact.sh <words in the title>   # e.g. crêpes
#   publish-dia-artifact.sh --list                 # the ten newest, with dates
#   publish-dia-artifact.sh --token <value> [name] # supply the token inline
#
# Options go before the title.
#
# Artifacts are identified by the <title> of their index.html, not by their
# directory name: Dia calls most directories template_output, so the name
# usually cannot tell two apart.
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
# http://localhost:3000 while testing). $DIA_ARTIFACTS overrides where artifacts
# are read from, which is only useful for testing.
#
# WHAT THE TEACHER SEES. In a terminal, everything below prints exactly as it
# always has. Run from a Shortcut, where there is no terminal, the script draws
# NOTHING — no stdout, no alert — and the only signal is that a browser opens on
# the new page's editor. See say() for why, including the accepted trade that a
# silent failure looks like a mis-clicked Shortcut.
#
# Artifacts titled "The <something> Brief" are never offered. Dia regenerates
# one of those on a schedule and it is not teaching material; the filter lives
# in candidate_rows so every selection path shares it.

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

# Shared by describe_artifacts and build_body, passed as the FIRST -e to both so
# they see the same functions: osascript concatenates multiple -e flags into one
# script and they share scope. Two copies of these rules would let the picker
# call a file present and the upload skip it.
#
# No single quotes anywhere below — it rides inside a single-quoted shell string.
# The class ["\x27] is how a quote of that kind is written when one cannot appear
# literally.
JXA_ASSETS='
ObjC.import("Foundation");

function readUtf8(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  // .js === undefined covers both an unreadable file and one that is not UTF-8.
  // s.isNil is a *method*; referencing it without calling it is always truthy.
  return s.js === undefined ? null : s.js;
}

// One filter for both collectors: a ref carrying a scheme, a protocol-relative
// one, or a bare fragment addresses nothing on this disk. Distinct refs in
// document order — the count labels the picker row and the list is what gets
// uploaded, and both come from this single pass.
function refSink() {
  var out = [], seen = {};
  return {
    add: function (u) {
      u = String(u).trim();
      if (!u) { return; }
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) { return; }
      if (u.slice(0, 2) === "//" || u.charAt(0) === "#") { return; }
      if (!seen[u]) { seen[u] = 1; out.push(u); }
    },
    list: function () { return out; }
  };
}

function collectHtmlRefs(html) {
  var sink = refSink(), m, b, u;
  var attr = /(?:src|href)\s*=\s*"([^"]*)"/gi;
  while ((m = attr.exec(html)) !== null) { sink.add(m[1]); }
  // url(...) is the case that matters, not an afterthought: these artifacts put
  // their CSS in an inline <style>, so a background image is referenced this way
  // and no other. Counting attributes alone returned 0 for such a page, and 0 is
  // the value meaning self-contained.
  var block = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((b = block.exec(html)) !== null) {
    var css = /url\(\s*(["\x27]?)([^)"\x27]*)\1\s*\)/gi;
    while ((u = css.exec(b[1])) !== null) { sink.add(u[2]); }
  }
  return sink.list();
}

// A stylesheet names files of its own, relative to IT. Without this a page whose
// styles.css reaches for a local .woff2 publishes with the wrong typeface and
// nothing to report — the same failure the Google Fonts case had before the
// server went two levels deep.
function collectCssRefs(css) {
  var sink = refSink(), u, i;
  var url = /url\(\s*(["\x27]?)([^)"\x27]*)\1\s*\)/gi;
  while ((u = url.exec(css)) !== null) { sink.add(u[2]); }
  var imp = /@import\s+(?:url\(\s*)?(["\x27]?)([^)"\x27;]*)\1\s*\)?/gi;
  while ((i = imp.exec(css)) !== null) { sink.add(i[2]); }
  return sink.list();
}

// A query or a fragment addresses the same file, so neither belongs in the name
// looked for on disk. This is the ONLY rewriting done here: the key uploaded is
// the ref verbatim, and folding . and .. belongs to the OS below and to
// lib/asset-path.ts on the server.
function stripRefSuffix(ref) { return ref.split("#")[0].split("?")[0]; }

function resolvePath(p) {
  var u = $.NSURL.fileURLWithPath(p).URLByResolvingSymlinksInPath;
  return u.js === undefined ? null : u.path.js;
}

// The absolute path a ref names, but only while it stays inside the artifact.
//
// Both sides go through the SAME resolver, which is what stops /tmp and
// /private/tmp splitting them — comparing a resolved path against an unresolved
// root is the classic bug in this check. Resolving also covers symlinks, which a
// string test for .. does not: a link inside site/ pointing at ~/.ssh has no ..
// in it at all, and this script publishes what it reads to a public URL.
function insideRoot(root, ref) {
  var r = resolvePath(root);
  var full = resolvePath(root + "/" + stripRefSuffix(ref));
  if (r === null || full === null || full === r) { return null; }
  return full.indexOf(r + "/") === 0 ? full : null;
}

function isRegularFile(path) {
  var isDir = Ref();
  if (!$.NSFileManager.defaultManager.fileExistsAtPathIsDirectory(path, isDir)) {
    return false;
  }
  return !isDir[0];
}

// Containment and existence are separate questions and both must pass: a ref can
// resolve inside the artifact and simply not be there.
function usableAsset(root, ref) {
  var full = insideRoot(root, ref);
  return full !== null && isRegularFile(full) ? full : null;
}

function refDir(ref) {
  var p = stripRefSuffix(ref);
  var cut = p.lastIndexOf("/");
  return cut === -1 ? "" : p.slice(0, cut);
}

// Concatenation only, matching joinRef in lib/asset-path.ts. The server folds it.
function joinRef(dir, ref) { return dir === "" ? ref : dir + "/" + ref; }

// A resource guard, NOT a protocol constant: it stops a pathological artifact
// making this read hundreds of files. MAX_ASSET_COUNT on the server is the limit
// that actually decides a publish, and duplicating that here would let the two
// drift into silently dropping files.
var MAX_COLLECTED = 200;

// Every ref the artifact needs: the document own, plus one level through each
// stylesheet. Keys are left unfolded on purpose.
function collectAllRefs(root, html) {
  var refs = collectHtmlRefs(html);
  var all = refs.slice(), seen = {};
  all.forEach(function (r) { seen[r] = 1; });

  refs.forEach(function (r) {
    if (all.length >= MAX_COLLECTED) { return; }
    if (!/\.css$/i.test(stripRefSuffix(r))) { return; }
    var full = usableAsset(root, r);
    if (full === null) { return; }
    var css = readUtf8(full);
    if (css === null) { return; }
    collectCssRefs(css).forEach(function (n) {
      var key = joinRef(refDir(r), n);
      if (!seen[key] && all.length < MAX_COLLECTED) {
        seen[key] = 1;
        all.push(key);
      }
    });
  });

  return all;
}

// .../<uuid>/<name>/site/index.html -> the site directory
function siteRoot(indexPath) {
  return indexPath.slice(0, indexPath.lastIndexOf("/"));
}

// .../<uuid>/<name>/site/index.html -> <name>
function folderName(path) {
  var p = path.split("/");
  return p.length >= 3 ? p[p.length - 3] : path;
}

// decode() is deliberately partial: it knows the five core entities and every
// numeric reference, and nothing else. A surviving &name; is left intact for
// decode_entities to hand to textutil, which owns the full table.
//
// &amp; decodes LAST. Doing it first would turn a deliberately double-escaped
// &amp;lt; into a bare <, losing the escaping the author asked for.
function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function titleOf(html, path) {
  var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  // Collapse whitespace: a title spanning newlines is normal, and a tab inside
  // one would corrupt the tab-delimited output format.
  var title = decode(m ? m[1] : "").replace(/\s+/g, " ").trim();
  return title || folderName(path);
}
'

# There WAS a gui_alert() here, raising a macOS alert when no terminal was
# attached, on the discovery that a Shortcuts "Run Shell Script" action discards
# stdout. That turned out to be only half the story: the same mechanism also
# surfaced the success chatter as a banner announcing a byte count about a step
# that had already finished. The decision is now that Shortcuts gets NOTHING —
# see say() — and an alert nobody asked for is part of that nothing.
#
# stderr is kept unconditionally: it costs nothing where it is discarded, and it
# is what a `2>` redirect or a CI log would capture.
# The alert is gone under Shortcuts too, by the same trade above: nothing is
# drawn at all. It still exits non-zero, and a terminal run still prints.
die() { echo "✗ $1" >&2; exit 1; }

# The success path's voice, and it is silent unless someone is watching.
#
# Under Shortcuts nothing is drawn AT ALL: no stdout, because the action
# discards it, and no alert, because the success chatter was written for a
# terminal. A banner reading 'Publishing "Top 10 Quebecois Words" (13003 bytes)
# to http://localhost:3000 ...' tells her a number she cannot use about a step
# that already finished.
#
# The WORDING of every message is unchanged; only whether it is emitted. In a
# terminal the output is byte-identical to what it has always been.
#
# This is the same environment detection die() already justifies: rejected for
# *selection*, because a slug is permanent and must never depend on invisible
# state, and fine for *presentation*, which changes only visibility.
#
# The knowing trade: a silent failure is indistinguishable from a mis-clicked
# Shortcut. It is accepted because the failure is VISIBLE BY ABSENCE — the flow
# ends with a browser opening, so a publish that failed is a click that did
# nothing — and because the same command in a terminal still reports in full.
say() { [ -t 1 ] && echo "$@"; return 0; }

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
# "title<TAB>total<TAB>missing" line per input path, in input order.
#
# Title extraction lives here rather than after selection because the picker needs
# the title *before* the choice is made, and two extraction paths would drift — a
# list reading Cr&ecirc;pes beside a page published as Crêpes.
#
# total counts every file the page needs, including the ones a stylesheet names.
# missing counts those that are not on disk or that point outside the artifact.
# Only the second is a warning now: the rest are published.
describe_artifacts() {
  osascript -l JavaScript -e "$JXA_ASSETS" -e '
function run(argv) {
  var listing = readUtf8(argv[0]);
  // This throws where an unreadable *artifact* degrades to (unreadable) in
  // place: a missing path list means the caller is broken, and every row would
  // be wrong. One bad artifact must not cost the other nine their place.
  if (listing === null) { throw new Error("cannot read the path list"); }
  return listing.split("\n").filter(function (p) { return p.length > 0; }).map(function (p) {
    var html = readUtf8(p);
    if (html === null) { return "(unreadable)\t0\t0"; }
    var root = siteRoot(p);
    var refs = collectAllRefs(root, html);
    var missing = refs.filter(function (r) { return usableAsset(root, r) === null; });
    return titleOf(html, p) + "\t" + refs.length + "\t" + missing.length;
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
# stdout: "mtime<TAB>path<TAB>title<TAB>total<TAB>missing", titles fully decoded
#
# Tab-delimited because the paths contain spaces ("Application Support").
#
# EVERY CALLER FILTERS BEFORE IT TRIMS: `candidate_rows | head -N`, never
# `head -N | candidate_rows`. The Brief filter below drops rows, so trimming
# first spends the ten picker slots on artifacts that are then thrown away — Dia
# writes a Brief most days, so the list arrived short or empty. It also made
# --latest report "nothing to publish" whenever the newest artifact happened to
# be a Brief. Describing the whole list is what the title search already does,
# so the cost is one already-accepted osascript pass.
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
    | while IFS=$'\t' read -r mtime path title total missing; do
        title="$(decode_entities "$title")"
        # Dia writes a recurring artifact titled "The <something> Brief". It is
        # never published and it crowds a ten-row picker, so it is dropped here
        # — inside candidate_rows, which every selection path reads through: the
        # picker, --list, --latest and the title search. One filter is what
        # makes those four agree BY CONSTRUCTION rather than by four copies
        # staying in step, the same reasoning JXA_ASSETS records for sharing one
        # ref filter between the picker and the upload.
        #
        # Applied AFTER decode_entities, so "The Morning &amp; Evening Brief" is
        # tested in the form a human would read.
        #
        # Anchored at both ends, so "The Brief History of Quebec" and "Brief
        # Notes" survive. On the TITLE and not the folder name, which is usually
        # template_output.
        #
        # The deliberate consequence: publish-dia-artifact.sh "The Morning
        # Brief" now reports "No page whose title contains ...". That is correct
        # for a rule saying these are never published, and it is discoverable —
        # the message names the search that found nothing.
        if printf '%s' "$title" | grep -qiE '^The .+ Brief$'; then
          continue
        fi
        printf '%s\t%s\t%s\t%s\t%s\n' \
          "$mtime" "$path" "$title" "$total" "$missing"
      done
}

# All candidate rows, newest first, written to a file and echoed back as its
# path. Every caller reads through this.
#
# A FILE AND NOT A PIPE, and that is the whole point. `candidate_rows | head -N`
# has head close the pipe as soon as it has its rows, which kills the writing
# subshell with SIGPIPE — and `set -euo pipefail` at the top of this script turns
# that into exit 141 and aborts the run. `head -N <file>` closes nothing and
# cannot signal anyone.
#
# Filtering therefore happens before any trimming, which is also what the Brief
# filter needs: trimming first would spend the ten picker slots on rows that are
# then dropped, and Dia writes a Brief most days.
all_rows() {
  local out="$WORK/rows-all.txt"
  if [ ! -f "$out" ]; then
    list_artifacts | candidate_rows > "$out"
  fi
  printf '%s' "$out"
}

# stdin:  "mtime<TAB>path<TAB>title<TAB>total<TAB>missing"
# stdout: one display label per line, same order
#
# chooseFromList returns the chosen *string*, not an index, so two identical
# labels are indistinguishable. Titles repeat across days and the timestamp
# usually separates them, but regenerating a page twice inside a minute does
# not. Suffixing later duplicates makes the label-to-row map total by
# construction rather than by luck.
build_labels() {
  local mtime path title total missing label i j n dup
  local labels=()
  while IFS=$'\t' read -r mtime path title total missing; do
    # %-d rather than %e, so a single-digit day gives "Fri 1 Aug" and not the
    # double-spaced "Fri  1 Aug". The - padding modifier is usually a glibc
    # extension; it was verified working in macOS's BSD date.
    label="$title — $(date -r "$mtime" '+%a %-d %b %H:%M')"
    # The ⚠ is reserved for what is still actionable. Linked files used to earn
    # one because they were about to go missing; they are published now, so a
    # marker on every row would be one nobody reads — the same lesson the old
    # find-based count taught. A ref that cannot be resolved still earns it.
    if [ "${missing:-0}" -gt 1 ]; then
      label="$label  ⚠ $missing missing files"
    elif [ "${missing:-0}" = "1" ]; then
      label="$label  ⚠ 1 missing file"
    elif [ "${total:-0}" -gt 1 ]; then
      label="$label  + $total files"
    elif [ "${total:-0}" = "1" ]; then
      label="$label  + 1 file"
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
  head -"$LIST_ROWS" "$(all_rows)" | build_labels |
    while IFS= read -r label; do printf '  %s\n' "$label"; done
  exit 0
fi

# argv[0] a file of labels, one per line; argv[1] the prompt.
# Prints the chosen label, or nothing if cancelled.
choose_from_list() {
  osascript -l JavaScript -e '
ObjC.import("Foundation");
function run(argv) {
  var raw = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  if (raw.js === undefined) { throw new Error("cannot read the label list"); }
  var labels = raw.js.split("\n").filter(function (s) { return s.length > 0; });
  if (labels.length === 0) { return ""; }
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  // Without activate() the dialog can open behind the frontmost window, which
  // from a menu-bar Shortcut looks like the click did nothing.
  app.activate();
  var picked = app.chooseFromList(labels, {
    withPrompt: argv[1],
    defaultItems: [labels[0]],
    okButtonName: "Publish",
    cancelButtonName: "Cancel",
  });
  // Cancel gives false, which is not an error.
  return picked === false ? "" : String(picked);
}' "$1" "$2"
}

# Sets INDEX, TITLE, TOTAL, MISSING from the teacher's choice. Exits 0 on cancel.
choose_artifact() {
  local rows="$WORK/rows.txt" labels="$WORK/labels.txt" picked i n
  local paths=() titles=() totals=() missings=() labellist=()
  head -"$LIST_ROWS" "$(all_rows)" > "$rows"
  [ -s "$rows" ] || die "No artifacts found yet."

  while IFS=$'\t' read -r mtime path title total missing; do
    paths[${#paths[@]}]="$path"
    titles[${#titles[@]}]="$title"
    totals[${#totals[@]}]="$total"
    missings[${#missings[@]}]="$missing"
  done < "$rows"

  build_labels < "$rows" > "$labels"
  while IFS= read -r line; do
    labellist[${#labellist[@]}]="$line"
  done < "$labels"

  picked=$(choose_from_list "$labels" "Which page do you want to publish?") \
    || die "Could not open the chooser. Over SSH or with no window server, use --latest."

  # A deliberate cancel is not a failure, and it is not news either: she
  # dismissed the dialog and knows nothing was published. Through say(), so a
  # Shortcut draws nothing at all — a banner reporting that the thing she just
  # cancelled did not happen is the noise this whole change is about.
  if [ -z "$picked" ]; then
    say "Cancelled. Nothing was published."
    exit 0
  fi

  # The labels are unique by construction (build_labels), so this finds exactly
  # one match and the die below is unreachable in principle.
  n=${#labellist[@]}
  for ((i = 0; i < n; i++)); do
    if [ "${labellist[$i]}" = "$picked" ]; then
      INDEX="${paths[$i]}"; TITLE="${titles[$i]}"
      TOTAL="${totals[$i]}"; MISSING="${missings[$i]}"
      return 0
    fi
  done
  die "Could not match the chosen page. This is a bug; use --latest to publish."
}

# INDEX and TITLE are both set by every branch below. TITLE comes from the same
# extraction that built the list, so the string on screen is the string that
# derives the slug.
INDEX=""
TITLE=""
TOTAL=0
MISSING=0

if [ -n "${1:-}" ]; then
  # Every artifact, not just the LIST_ROWS the dialog shows: a caller naming an
  # exact title should not fail because the page is three weeks old.
  WANT=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  HITS=0
  while IFS=$'\t' read -r mtime path title total missing; do
    HAY=$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]')
    case "$HAY" in
      *"$WANT"*)
        HITS=$((HITS + 1))
        # Rows arrive newest first, so the first hit is the newest.
        [ -z "$INDEX" ] && {
          INDEX="$path"; TITLE="$title"; TOTAL="$total"; MISSING="$missing"
        }
        ;;
    esac
    # `< <(…)` rather than a pipe: a while on the right of a pipe runs in a
    # subshell in bash 3.2, so INDEX would be empty afterwards.
  done < <(cat "$(all_rows)")
  [ -n "$INDEX" ] || die "No page whose title contains '$1'. Try --list."
  [ "$HITS" -gt 1 ] && echo "$HITS pages match '$1'; taking the newest."
elif [ "$WANT_LATEST" = "1" ]; then
  while IFS=$'\t' read -r mtime path title total missing; do
    INDEX="$path"; TITLE="$title"; TOTAL="$total"; MISSING="$missing"
  done < <(head -1 "$(all_rows)")
  [ -n "$INDEX" ] || die "No artifacts found yet."
else
  choose_artifact          # sets INDEX, TITLE, TOTAL, MISSING
fi

# describe_artifacts reports an unreadable or non-UTF-8 artifact as this rather
# than throwing, so the rest of the list stays selectable. Refuse it here.
if [ "$TITLE" = "(unreadable)" ]; then
  die "Could not read that artifact as UTF-8 text."
fi

# The sibling files are published now, so only the ones that could not be found
# are worth saying anything about. A ref pointing outside the artifact folder is
# counted here too: it is refused deliberately and never read.
#
# The dialog already showed this on the chosen row, so only the flag-driven paths
# need telling.
if [ "${MISSING:-0}" != "0" ]; then
  warn "This page links to $MISSING file(s) that are not on disk, so they will be missing. Continuing anyway."
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
# mangled title bakes in a mangled bookmark. It is extracted exactly once, in
# describe_artifacts, so the string the picker showed is the string sent here.

# Only the file *paths* cross the process boundary, so megabytes of arbitrary
# HTML never meet shell word-splitting or quoting. The assets are read in here
# for that reason and one more: their bytes may not be text at all.
#
# The title matters more than it looks: the server derives the page slug from it
# when the payload sends no slug, and a slug never moves again once created. A
# mangled title bakes in a mangled bookmark. It is extracted exactly once, in
# describe_artifacts, so the string the picker showed is the string sent here.
BODY=$(osascript -l JavaScript -e "$JXA_ASSETS" -e '
function run(argv) {
  var index = argv[1];
  var html = readUtf8(index);
  if (html === null) { throw new Error("cannot read the artifact"); }

  var root = siteRoot(index);
  var assets = [];
  collectAllRefs(root, html).forEach(function (ref) {
    var full = usableAsset(root, ref);
    // Dropped silently, because these are exactly the refs describe_artifacts
    // already counted as missing and the picker already marked with a warning.
    // The server names each one in its own report afterwards.
    if (full === null) { return; }
    var data = $.NSData.dataWithContentsOfFile(full);
    if (data.isNil()) { return; }
    assets.push({
      // The ref VERBATIM: unfolded, still percent-encoded, query and all.
      // lib/asset-path.ts normalises both this key and the document ref it has
      // to meet, so the two agree by construction rather than by two
      // implementations of one rule staying in step.
      path: ref,
      base64: data.base64EncodedStringWithOptions(0).js
    });
  });

  return JSON.stringify({ title: argv[0], html: html, assets: assets });
}' "$TITLE" "$INDEX")

EXTRA=""
if [ "${TOTAL:-0}" != "0" ]; then
  EXTRA=", plus $((TOTAL - MISSING)) file(s)"
fi
say "Publishing \"${TITLE}\" ($(wc -c < "$INDEX" | tr -d ' ') bytes$EXTRA) to ${SITE} ..."

# The body arrives on stdin, not in an argument. ARG_MAX is 1 MB while the
# endpoint accepts MAX_UPLOAD_BYTES, so `-d "$BODY"` died with "argument list too
# long" before sending anything for pages in between — a raw shell error rather
# than this script's own reporting. Piping leaves the size ceiling where it
# belongs, on the server: this script carries no limit of its own, so a payload
# that is too large comes back as the endpoint's own 413 message, which the die
# below prints verbatim.
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

say "✓ $URL"

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
  say "⚠ The page published, but some files could not be included:"
  # A read loop rather than one printf, so each line is indented. `<<<` is fine
  # on the bash 3.2 macOS ships; mapfile is not.
  while IFS= read -r line; do
    say "    $line"
  done <<< "$SKIPPED"
fi

# pbcopy runs in BOTH cases — the copy is a side effect worth having, and only
# the sentence announcing it was noise.
printf '%s' "$URL" | pbcopy 2>/dev/null && say "  (link copied to the clipboard)"

# Published with no groups, so the link works but no class sees it listed yet —
# which is why this lands on the editor rather than the page: the next step is
# always to pick an audience.
#
# The overlay on the Pages tab, not /admin/pages/$SLUG, so the list is visible
# behind it. That route still exists and still works; this just opens the one
# with somewhere to go back to.
#
# It is also the whole feedback channel under Shortcuts: a browser opening is
# success, and nothing happening is failure.
open "$SITE/admin?tab=pages&edit=$SLUG" 2>/dev/null || true
