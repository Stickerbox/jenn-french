# Dia Artifact Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Running `tools/publish-dia-artifact.sh` with no arguments opens a native macOS chooser listing the ten newest Dia artifacts by page title and date, with the newest preselected, instead of silently publishing whichever file was modified last.

**Architecture:** All changes live in the single file `tools/publish-dia-artifact.sh`. Three new `osascript -l JavaScript` (JXA) helpers are added: one that maps artifact paths to titles and linked-file counts, one that wraps `chooseFromList`, one that wraps `displayAlert`. Title extraction moves from after selection to before it, so the string in the dialog is the string that gets published and derives the slug. Every existing behaviour stays reachable by flag.

**Tech Stack:** bash 3.2, `osascript -l JavaScript` (JXA), `textutil`, `curl`. No new dependencies — see the constraints below for why that is non-negotiable.

**Spec:** `docs/superpowers/specs/2026-08-02-dia-artifact-picker-design.md`. Read it before starting.

---

## Status at handoff — 2026-08-03

Tasks 1-3 were completed on a different machine. **Run the preflight below before
assuming anything about what you inherited**, then start at Task 4.

### Preflight: establish where you are

Nothing in this plan is safe to act on until you know the answers. Run this whole
block and read every line of output:

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
echo "OS            : $(uname -s)"
echo "bash          : $(/bin/bash --version | head -1)"
echo "osascript     : $(command -v osascript || echo MISSING)"
echo "textutil      : $(command -v textutil || echo MISSING)"
echo "TMPDIR        : ${TMPDIR:-/tmp}"
echo "git repo      : $(git rev-parse --is-inside-work-tree 2>/dev/null || echo no)"
echo "Task 2 landed : $(grep -q 'DIA_ARTIFACTS-' tools/publish-dia-artifact.sh && echo yes || echo NO)"
echo "Task 3 landed : $(grep -q 'describe_artifacts()' tools/publish-dia-artifact.sh && echo yes || echo NO)"
echo "url() fix     : $(grep -q 'var css = /url' tools/publish-dia-artifact.sh && echo yes || echo NO)"
echo "Task 4 landed : $(grep -q 'candidate_rows()' tools/publish-dia-artifact.sh && echo yes || echo NO)"
echo "script lines  : $(wc -l < tools/publish-dia-artifact.sh)  (225 = untouched, 301 = through Task 3)"
echo "Dia folder    : $([ -d "$HOME/Library/Application Support/Dia/User Data/Default/AgentArtifacts" ] && echo present || echo absent)"
echo "fixtures      : $(find "${TMPDIR:-/tmp}/dia-fixtures" -name index.html 2>/dev/null | wc -l | tr -d ' ') of 8"
printf '%s' 'Cr&ecirc;pes' > "${TMPDIR:-/tmp}/tu.html"
echo "textutil works: $(textutil -convert txt -inputencoding UTF-8 -stdout "${TMPDIR:-/tmp}/tu.html" 2>/dev/null || true)  (expect: Crêpes)"
```

**If `OS` is not `Darwin`, stop.** This is not a portability nit. `osascript` is not
a test harness here, it is the implementation — the chooser, the alerts and the title
extraction are all JXA, and `chooseFromList` is a macOS dialog. `textutil`, `pbcopy`,
`stat -f` and `date -r` are equally macOS-only. On Linux you can transcribe the code
but cannot execute a single verification step in this plan, which means you would be
shipping unverified shell into a script that publishes to a live public site. Say so
and hand it back rather than producing work nobody has run.

**If `bash` is 5.x rather than 3.2**, you are not on the target environment either.
The script's shebang is `#!/bin/bash` and the teacher's machine ships 3.2.57, so
code that works for you may still fail for her. Keep to the 3.2 subset in the table
below regardless of what your own bash accepts, and note in your report that the
3.2 constraint went unexercised.

**If `git repo` is `no`, make a baseline before your first edit.** There is no
version control here and therefore no undo:

```bash
mkdir -p "${TMPDIR:-/tmp}/dia-baseline"
cp tools/publish-dia-artifact.sh "${TMPDIR:-/tmp}/dia-baseline/inherited.sh"
```

Every verification step that says "diff against the baseline" means that file.
Re-copy it after each task you finish, under a per-task name, so you can always see
what one task changed.

### What you inherited

| Task | How to confirm | Notes |
|---|---|---|
| 1 — fixtures | `fixtures` line above reads `8 of 8` | **Almost certainly `0` on your machine.** They live in `$TMPDIR`, which is machine-local and cleaned regularly. Re-run Task 1; it is idempotent and takes seconds. Their `touch -t` timestamps are absolute, so the expected weekdays elsewhere in this plan hold on any machine. |
| 2 — `$DIA_ARTIFACTS` override | `Task 2 landed : yes` | Uses `-` not `:-`, deliberately, so an empty value fails loudly instead of silently reading the real Dia folder. Do not "fix" it for consistency with `JENN_SITE` on the next line; the comment explains why. |
| 3 — `describe_artifacts` | `Task 3 landed : yes` **and** `url() fix : yes` | **The file is authoritative, not Task 3's code block below**, which is stale in two ways — see immediately below. If `url() fix` says `NO`, you have an older copy of the file than this plan describes. |

Task 3's code block below predates two accepted review findings:

1. `localRefs` also counts `url(…)` inside an inline `<style>`, not just `src=` and
   `href=`. This mattered: the teacher's pages are single-file with inline CSS, so a
   background image is referenced that way and no other, and counting attributes
   alone returned `0` — the value meaning *self-contained, nothing to warn about* —
   for a page that would publish broken. The quote-stripping class is written
   `["\x27]` because a literal `'` cannot appear in the JS at all; it would terminate
   the surrounding single-quoted shell string.
2. The header comment gained a paragraph saying `decode()` is deliberately partial,
   and there is a comment above the `throw` explaining why a missing path list
   throws while an unreadable artifact degrades to `(unreadable)` in place.

Left undone: the comment at line 114 still reads *"refcount counts distinct relative
src=/href= values"* and should now mention `url(…)` too. One line, and this codebase
expects its comments to be true.

### Verifications you may not be able to run, and what to do instead

- **Anything against the real Dia folder** (Task 2 Step 3, Task 6 Step 3) needs Dia
  installed with real artifacts. If `Dia folder` reads `absent`, skip those steps and
  **say you skipped them** — do not substitute the fixture run and call it done.
- **Anything that opens a dialog** (Task 7 Step 3, Task 9 Steps 3-6, Task 13) blocks
  until a human clicks. Use the background probe documented under "Two environment
  facts" below to confirm a dialog *opens*, and report the rest as
  `DEFERRED_TO_HUMAN`. Do not guess what a window showed.
- **If `textutil works` printed nothing**, it is blocked in your environment — it
  exits 0 with empty output in that case. The `[ -n "$decoded" ]` guard in Task 4
  handles it, and the `CCCC` fixture will read `Cr&ecirc;pes &amp; Gaufres é A`
  rather than `Crêpes & Gaufres é A` in every expected output below. That is correct
  behaviour, not a fault.

### Corrections already made to this plan

Four defects, all found by executing rather than reading. Fixed below, but worth
knowing they were there — the same class of error is the likeliest thing still
lurking:

- **Every weekday in Task 6's expected output was wrong** except the first — `Fri 31
  Jul`, not `Thu`. Written from memory instead of from `date -r`. All eight are now
  computed from the fixture mtimes.
- **`decode_entities` needed a `[ -n "$decoded" ]` guard.** `textutil` exits **0**
  with empty stdout when it cannot reach its helper, so testing the exit status alone
  sets the title to the empty string and publishes it. This is a **pre-existing bug**
  at line 184 of the original script, sitting under a comment that claims the
  partially decoded title still publishes. It does not. An empty title then derives a
  permanent slug.
- **`paste -d'\t'` and `IFS='\t'` need opposite treatments.** `paste` interprets the
  escape itself; bash does not, so a bare `IFS='\t'` splits on the letter **t**. Use
  `IFS=$'\t'` and never a literal tab character, which editors silently convert.
- **`Edit` was denied on `*.sh`** on the originating machine, by an admin-tier managed
  policy (`Edit(./*.sh)`, sitting beside `Edit(**/.env*)` and `Edit(**/.ssh/**)`).
  That is why every verification command here uses `bash tools/publish-dia-artifact.sh`
  rather than `./tools/…` — which is also robust to the missing execute bit, so keep
  it. If the same policy applies to you, stop and report it rather than routing around
  it with `cp`; on the originating machine four separate agents bypassed that
  guardrail via Bash without asking what it was for.

## Read this first: three constraints that will break your code

**1. `/bin/bash` on macOS is 3.2.57.** Apple ships the last GPLv2 bash. The script's shebang points at it. These do **not** exist and will fail at runtime:

| Unavailable | Use instead |
|---|---|
| `mapfile` / `readarray` | `while IFS= read -r line; do arr+=("$line"); done < file` |
| `declare -A` (associative arrays) | parallel indexed arrays |
| `${var,,}` / `${var^^}` | `tr '[:upper:]' '[:lower:]'` |

Array `+=` and `for (( ))` are fine — both predate 3.2.

**2. Stock macOS only.** There is no `python3` (see the comment at lines 133-137 of the script), no `node`, and no `jq`. The script runs on the teacher's machine, which has Dia and macOS and no development environment. Do not reach for the repository's own Node toolchain. This is why JXA is used for everything structured.

**3. JXA goes inline in a single-quoted `-e` string,** matching the two calls already in the script. That means **the JavaScript must contain no single-quote characters.** All code in this plan already respects that. If you add JS, use `"` for strings.

## What has actually been verified

Code marked **[verified]** in this plan was executed against fixtures before the plan was written. Code marked **[unverified]** is ordinary bash written but not run — check it carefully.

- `describe_artifacts` JXA body — **[verified]**, exact output reproduced below in Task 3
- `textutil` entity decoding, and the mojibake without `-inputencoding UTF-8` — **[verified]**
- `date -r … '+%a %-d %b %H:%M'`, including `%-d` working in BSD `date` — **[verified]**
- `chooseFromList` / `displayAlert` exist on `Application.currentApplication()` — **[verified]** by `typeof`
- `local a=()` then `a[${#a[@]}]=…` under bash 3.2 — **[verified]**
- `[ false ] && assign` does **not** abort under `set -euo pipefail` — **[verified]**, which is what makes the duplicate-suffixing line in `build_labels` safe
- `String(picked)` on the single-element array `chooseFromList` returns yields the bare label — **[verified]**
- `paste -d'\t'` produces a real tab (paste interprets the escape itself) — **[verified]**
- `build_labels`' output, `die`'s TTY branch, the selection wiring, `choose_artifact` — **[unverified]**; the constructs they use are checked, their behaviour is not. Task 6 Step 2 is the first assertion of real output.

## Two environment facts that change how you run things

**Invoke with `bash tools/publish-dia-artifact.sh`, not `./tools/…`.** This working copy arrived without the execute bit set on the script, and setting it is not part of this plan. Every verification command below uses the `bash` form, which works either way. The `tools/README.md` content in Task 12 keeps the bare `tools/publish-dia-artifact.sh` form, because that is correct in the real repository and is what the teacher's Shortcut uses.

**Never run a command that opens a modal and waits.** `chooseFromList` and `displayAlert` block until a human clicks. An automated worker that runs one will hang until it is killed. To check that a dialog *opens* without erroring, probe it instead:

```bash
# Confirms the dialog launches and does not fail; does not confirm what it shows.
bash tools/publish-dia-artifact.sh --local --token x >"$TMPDIR/probe.out" 2>"$TMPDIR/probe.err" &
probe=$!
sleep 3
if kill -0 "$probe" 2>/dev/null; then
  kill "$probe" 2>/dev/null
  echo "OPENED — dialog was still waiting for input, which is correct"
else
  echo "EXITED EARLY — it failed; read the files below"
fi
cat "$TMPDIR/probe.err"
```

Any step whose expected result is "you see X in a window" or "press Cancel" must be reported as **DEFERRED_TO_HUMAN**, not guessed at and not skipped silently. Those steps are collected and run by a person at the end.

## A note on commits

The `git repo` line in the preflight tells you which of these applies.

**In a git repository:** use the commit step as written in each task. The
`Co-Authored-By` trailer is mandatory per the organisation policy in `CLAUDE.md`.
Branch first if you are on the default branch.

**Not in a git repository** (which was the case on the originating machine, a plain
download): there is no undo, so checkpoint after every task instead:

```bash
cp tools/publish-dia-artifact.sh "$TMPDIR/dia-baseline/after-task-N.sh"
```

Then `diff "$TMPDIR/dia-baseline/after-task-$((N-1)).sh" tools/publish-dia-artifact.sh`
shows exactly what one task changed. Check that the count of removed lines (`^<`) is
what you intended — on the originating machine, agents that could not use `Edit` were
staging whole replacement files and copying them over, and that diff was the only
thing standing between a typo and silently losing half the script.

## File structure

| File | Responsibility | Change |
|---|---|---|
| `tools/publish-dia-artifact.sh` | everything in this plan | modified throughout |
| `tools/README.md` | user-facing usage, Shortcut setup | usage section rewritten |
| `$TMPDIR/dia-fixtures/` | throwaway artifact tree for verification | created in Task 1, never committed |

No new files ship. There is deliberately no test file: `tools/` sits outside the `lib/` + vitest convention in `CLAUDE.md` and cannot easily be brought inside it, because a `lib/` module needs Node and this script's premise is that Node is absent. Verification is by fixture and by hand.

---

### Task 1: Build the fixture tree

Nothing later in this plan is verifiable without deterministic artifacts. Dia's real folder changes under you and has no non-UTF-8 or duplicate-title cases.

**Files:**
- Create: `$TMPDIR/dia-fixtures/` (throwaway, not part of the repo)

- [ ] **Step 1: Write the fixture script and run it**

```bash
FIX="$TMPDIR/dia-fixtures"; rm -rf "$FIX"; mkdir -p "$FIX"
mk() { mkdir -p "$FIX/$1/template_output/site"; cat > "$FIX/$1/template_output/site/index.html"; }

mk AAAA <<'EOF'
<!doctype html><html><head><title>Crêpes et Traditions</title>
<style>body{font-family:serif}</style></head><body><h1>Les crêpes</h1></body></html>
EOF

mk BBBB <<'EOF'
<!doctype html><html><head><title>Le Passé Composé</title>
<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="extra.css">
<script src="app.js"></script></head>
<body><a href="#top">top</a><a href="https://example.com/x">out</a>
<img src="photo.jpg"><img src="data:image/gif;base64,R0lGOD"><img src="photo.jpg">
<a href="mailto:a@b.c">mail</a><a href="//cdn.example.com/y.css">proto-rel</a></body></html>
EOF
: > "$FIX/BBBB/template_output/site/style.css"
: > "$FIX/BBBB/template_output/site/app.js"
touch "$FIX/BBBB/template_output/site/.DS_Store"

mk CCCC <<'EOF'
<!doctype html><html><head><title>Cr&ecirc;pes &amp;amp; Gaufres &#233; &#x41;</title></head><body>x</body></html>
EOF

mk DDDD <<'EOF'
<!doctype html><html><head></head><body>no title here</body></html>
EOF

mk FFFF <<'EOF'
<!doctype html><html><head><title>
   Les    Faux
   Amis
</title></head><body>x</body></html>
EOF

mk GGGG <<'EOF'
<!doctype html><html><head><title>Au Restaurant</title></head><body>x</body></html>
EOF
mk HHHH <<'EOF'
<!doctype html><html><head><title>Au Restaurant</title></head><body>x</body></html>
EOF

mkdir -p "$FIX/EEEE/template_output/site"
printf '<html><head><title>Cr\xea' >  "$FIX/EEEE/template_output/site/index.html"
printf 'pes</title></head><body>x</body></html>' >> "$FIX/EEEE/template_output/site/index.html"

touch -t 202608011010 "$FIX/AAAA/template_output/site/index.html"
touch -t 202607310639 "$FIX/BBBB/template_output/site/index.html"
touch -t 202607301001 "$FIX/CCCC/template_output/site/index.html"
touch -t 202607290843 "$FIX/DDDD/template_output/site/index.html"
touch -t 202607281110 "$FIX/EEEE/template_output/site/index.html"
touch -t 202607271045 "$FIX/FFFF/template_output/site/index.html"
touch -t 202607260930 "$FIX/GGGG/template_output/site/index.html"
touch -t 202607260930 "$FIX/HHHH/template_output/site/index.html"
```

What each fixture is for:

| Dir | Case |
|---|---|
| AAAA | ordinary self-contained page, accented title |
| BBBB | 4 distinct local refs, plus `#`, `https://`, `data:`, `mailto:`, `//` to reject, a duplicate `photo.jpg` to dedupe, and a `.DS_Store` that must **not** count |
| CCCC | `&ecirc;` (needs `textutil`), `&amp;amp;` (must decode once, not twice), `&#233;`, `&#x41;` |
| DDDD | no `<title>` — must fall back to the directory name |
| EEEE | not valid UTF-8 — must yield `(unreadable)` |
| FFFF | title spanning newlines with runs of spaces — must collapse |
| GGGG, HHHH | identical title **and** identical mtime — the collision case |

- [ ] **Step 2: Verify the tree**

Run: `find "$TMPDIR/dia-fixtures" -name index.html | wc -l`
Expected: `8`

---

### Task 2: Make the artifacts directory overridable

**Files:**
- Modify: `tools/publish-dia-artifact.sh:30`

- [ ] **Step 1: Change the assignment**

Replace line 30:

```bash
ARTIFACTS="$HOME/Library/Application Support/Dia/User Data/Default/AgentArtifacts"
```

with:

```bash
# Overridable so verification can run against a disposable fixture tree rather
# than the developer's live Dia folder, which changes between runs and has no
# non-UTF-8, missing-title or duplicate-timestamp artifacts to test against.
# Unset in normal use — the teacher never sets it.
#
# `-` not `:-`, unlike JENN_SITE below: an empty value means a caller meant to
# redirect this and got the path wrong, and falling back to the real folder
# would publish a real artifact. Empty instead fails the [ -d ] check below.
ARTIFACTS="${DIA_ARTIFACTS-$HOME/Library/Application Support/Dia/User Data/Default/AgentArtifacts}"
```

Two things here are deliberate and were both raised in review:

- **The comment names no plan file.** This plan deletes the fixture tree in Task 13 Step 5, so a comment pointing at either the tree or this document would, within the week, refer to something that no longer exists. The durable reason goes in the code; the mechanics stay here.
- **`-` rather than `:-`.** They differ only when the variable is set but empty, and that case must not fall back. This is the same principle the spec applies to selection — behaviour must not depend on invisible environment state when the output is a permanent public slug. A harness whose path variable resolved to empty would otherwise read the real Dia folder and could publish a real artifact. Empty now fails `[ -d "$ARTIFACTS" ]` and dies. The resulting message ("No Dia artifacts folder. Is Dia installed?") is imprecise for that case; accepted, because failing loudly beats silently using live data.

Add a third verification for it:

```bash
DIA_ARTIFACTS= bash tools/publish-dia-artifact.sh --list; echo "exit=$?"
```

Expected: `✗ No Dia artifacts folder. Is Dia installed?` and `exit=1`. If it lists the real folder instead, the `-` did not take effect.

- [ ] **Step 2: Verify the override reaches `list_artifacts`**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh --list`

Expected: eight rows, every one labelled `template_output`, newest first starting `Aug  1 10:10`. This is the bug this plan fixes — confirm you can see it before fixing it.

- [ ] **Step 3: Verify the real folder still works**

Run: `bash tools/publish-dia-artifact.sh --list`
Expected: rows from the real Dia folder, not the fixtures.

- [ ] **Step 4: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
refactor(tools): allow the Dia artifacts dir to be overridden

Nothing about artifact selection is testable while the path is a
constant. Unset in normal use.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add the `describe_artifacts` helper

**[verified]** — this JXA body was run against the Task 1 fixtures and produced the output shown in Step 3.

**Files:**
- Modify: `tools/publish-dia-artifact.sh` — add after `list_artifacts` (which ends at line 91)

- [ ] **Step 1: Add the helper**

```bash
# argv[0] is a file holding one artifact path per line. Emits one
# "title<TAB>refcount" line per input path, in input order.
#
# Title extraction lives here rather than after selection because the picker
# needs the title *before* the choice is made, and two extraction paths would
# drift — a list reading Cr&ecirc;pes beside a page published as Crêpes.
#
# refcount counts distinct relative src=/href= values: how many files the page
# needs that will not be published. Counting files in the directory instead
# would flag a self-contained page that happens to sit beside a .DS_Store.
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
  var seen = {}, n = 0, re = /(?:src|href)\s*=\s*"([^"]*)"/gi, m;
  while ((m = re.exec(html)) !== null) {
    var u = m[1].trim();
    if (!u) { continue; }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) { continue; }   // https:, data:, mailto:, tel:
    if (u.slice(0, 2) === "//" || u.charAt(0) === "#") { continue; }
    if (!seen[u]) { seen[u] = 1; n++; }
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
```

- [ ] **Step 2: Build a path list from the fixtures**

```bash
FIX="$TMPDIR/dia-fixtures"
find "$FIX" -type f -path "*/site/index.html" -print0 \
  | xargs -0 stat -f '%m %N' | sort -rn | cut -d' ' -f2- > "$TMPDIR/paths.txt"
wc -l < "$TMPDIR/paths.txt"
```

Expected: `8`

- [ ] **Step 3: Copy the same JS to a standalone file to test it**

The helper cannot be sourced out of the script — `sed`-ing between `describe_artifacts()` and the next `}` truncates inside the JavaScript, which has `}` at column 0. Test the JS directly instead. **This must stay byte-identical to the body you added in Step 1; if you change one, change both.**

```bash
cat > "$TMPDIR/describe.js" <<'JXA'
ObjC.import("Foundation");

function readUtf8(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return s.js === undefined ? null : s.js;
}

function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
    .replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function localRefs(html) {
  var seen = {}, n = 0, re = /(?:src|href)\s*=\s*"([^"]*)"/gi, m;
  while ((m = re.exec(html)) !== null) {
    var u = m[1].trim();
    if (!u) { continue; }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) { continue; }
    if (u.slice(0, 2) === "//" || u.charAt(0) === "#") { continue; }
    if (!seen[u]) { seen[u] = 1; n++; }
  }
  return n;
}

function folderName(path) {
  var p = path.split("/");
  return p.length >= 3 ? p[p.length - 3] : path;
}

function run(argv) {
  var listing = readUtf8(argv[0]);
  if (listing === null) { throw new Error("cannot read the path list"); }
  return listing.split("\n").filter(function (p) { return p.length > 0; }).map(function (p) {
    var html = readUtf8(p);
    if (html === null) { return "(unreadable)\t0"; }
    var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var title = decode(m ? m[1] : "").replace(/\s+/g, " ").trim();
    if (!title) { title = folderName(p); }
    return title + "\t" + localRefs(html);
  }).join("\n");
}
JXA
osascript -l JavaScript "$TMPDIR/describe.js" "$TMPDIR/paths.txt"
```

Expected — exactly this, tabs between the columns:

```
Crêpes et Traditions	0
Le Passé Composé	4
Cr&ecirc;pes &amp; Gaufres é A	0
template_output	0
(unreadable)	0
Les Faux Amis	0
Au Restaurant	0
Au Restaurant	0
```

Check each one deliberately: `4` on row 2 proves the deduping and all five rejections; `&amp;amp;` became `&amp;` and **not** `&`; `&ecirc;` survived for `textutil`; `template_output` is the no-title fallback; `(unreadable)` is the non-UTF-8 file; `Les Faux Amis` collapsed three lines into one.

- [ ] **Step 4: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
feat(tools): add describe_artifacts, mapping artifact paths to titles

Dia writes almost every artifact to a directory called template_output,
so the directory name cannot identify one. The <title> can.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add the work directory, `trap` cleanup, and row assembly

**Files:**
- Modify: `tools/publish-dia-artifact.sh` — add after the `SITE`/`TOKEN_FILE` constants (line 32), and after `describe_artifacts`

- [ ] **Step 1: Add the work directory below the constants**

```bash
LIST_ROWS=10

# One work directory for the run. The previous code made a mktemp -d for the
# textutil fallback and removed it inline, which leaked it if anything between
# those two points failed under set -e.
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
```

- [ ] **Step 2: Add `decode_entities` after `describe_artifacts`**

```bash
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
  # publishes that — the old code at line 184 did exactly this, under a comment
  # claiming "the partially decoded title still publishes". It does not. An
  # empty title then derives the slug, which is permanent.
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
```

**Environment note that will otherwise look like a bug.** `textutil` needs to talk to a helper process, and some sandboxed environments block that — it then exits 0 with empty output, which the `[ -n ]` test above turns into a clean fallback. Check which world you are in before trusting any expected output containing a decoded entity:

```bash
printf '%s' 'Cr&ecirc;pes' > "$TMPDIR/tu.html"
textutil -convert txt -inputencoding UTF-8 -stdout "$TMPDIR/tu.html"; echo "[exit=$?]"
```

`Crêpes` means textutil works. Empty output with exit 0, or a "Couldn't communicate with a helper application" message, means it is blocked — and the `CCCC` fixture will then show as `Cr&ecirc;pes &amp; Gaufres é A` rather than `Crêpes & Gaufres é A` everywhere below. That is the fallback working correctly, not a fault in your code.

- [ ] **Step 3: Add `candidate_rows`, below `decode_entities`**

```bash
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
```

Note on the two tab delimiters, which are **not** interchangeable and were both checked:

- `paste -d'\t'` is correct. `paste` interprets `\t` in its delimiter list itself, so no shell quoting is needed.
- `IFS=$'\t'` is correct for bash. A bare `IFS='\t'` would set IFS to the two characters backslash and `t`, silently splitting on the letter t. `$'…'` is ANSI-C quoting and works in bash 3.2.

Avoid writing a literal tab character in either place — editors and copy-paste turn them into spaces without saying so.

**Known limitation, state it rather than paper over it:** `candidate_rows` runs inside a process substitution in Task 8, so a `die` inside it exits only that subshell. The caller then falls through to its own `[ -n "$INDEX" ] || die` and reports "No artifacts found yet" rather than the real cause. The dialog path in Task 9 is not affected — it writes rows to a file and checks `-s` before reading. Do not spend an hour on a confusing message here without remembering this.

- [ ] **Step 4: Verify rows assemble, and that `textutil` fires exactly once**

Run:

```bash
DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh --list
```

This still prints the old directory-name rows — `--list` has not been changed yet. You are only confirming nothing broke. Expected: eight rows, no errors, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
feat(tools): assemble artifact rows with decoded titles

textutil moves ahead of label building so the title in the picker is
the title that gets published and derives the slug.

Also replaces the inline mktemp -d cleanup, which leaked on failure,
with one work dir and a trap.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add `build_labels` with duplicate disambiguation

**[unverified]** — bash 3.2 constructs only. No `mapfile`, no `declare -A`.

**Files:**
- Modify: `tools/publish-dia-artifact.sh` — add after `candidate_rows`

- [ ] **Step 1: Add the function**

```bash
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
```

`IFS=$'\t'` — ANSI-C quoting, not a bare `'\t'`, which would split on the letter t. `%-d` gives `Fri 1 Aug` rather than the double-spaced `Fri  1 Aug` that `%e` produces; the `-` padding modifier is normally a glibc extension but was confirmed working in BSD `date`.

- [ ] **Step 2: Check it parses under bash 3.2**

`build_labels` has no standalone entry point — it reads the tab-delimited rows `candidate_rows` produces, and `--list` is what first feeds it, in Task 6. So the behavioural gate for Tasks 3, 4 and 5 together is **Task 6 Step 2**, which asserts exact output. Do not skip it.

What this step can prove now is that the syntax is 3.2-legal, which is the actual risk in this block:

```bash
/bin/bash -n tools/publish-dia-artifact.sh && echo "parses under $(/bin/bash --version | head -1)"
```

Expected: `parses under GNU bash, version 3.2.57…`. If it reports a syntax error, you have used a construct 3.2 lacks — check the table at the top of this plan.

Behaviour to confirm at Task 6 Step 2, so you know what you are looking for:

- eight labels, newest first
- `Le Passé Composé — Fri 31 Jul 06:39  ⚠ 4 linked files`
- `Crêpes & Gaufres é A` — fully decoded, `&ecirc;` resolved by `textutil` (or left as `Cr&ecirc;pes &amp; Gaufres é A` if textutil is blocked; both are correct behaviour)
- `Les Faux Amis` on one line
- the last two read `Au Restaurant — Sun 26 Jul 09:30` and `Au Restaurant — Sun 26 Jul 09:30 (2)`

- [ ] **Step 3: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
feat(tools): build picker labels from title, date and linked-file count

Duplicate labels get a (2)/(3) suffix so mapping the chosen string
back to a row is total.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite `--list` to use the labels

This is the first user-visible fix and it needs no GUI, so it is the cheapest place to prove the pipeline end to end.

**Files:**
- Modify: `tools/publish-dia-artifact.sh:93-100`

- [ ] **Step 1: Replace the `--list` block**

Replace:

```bash
if [ "$WANT_LIST" = "1" ]; then
  echo "Recent Dia artifacts:"
  list_artifacts | head -10 | while read -r mtime path; do
    name=$(basename "$(dirname "$(dirname "$path")")")
    printf '  %s  %s\n' "$(date -r "$mtime" '+%b %e %H:%M')" "$name"
  done
  exit 0
fi
```

with:

```bash
if [ "$WANT_LIST" = "1" ]; then
  echo "Recent Dia artifacts:"
  # The same labels the dialog shows, so the two cannot drift.
  list_artifacts | head -"$LIST_ROWS" | candidate_rows | build_labels |
    while IFS= read -r label; do printf '  %s\n' "$label"; done
  exit 0
fi
```

- [ ] **Step 2: Verify against the fixtures**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh --list`

Expected:

```
Recent Dia artifacts:
  Crêpes et Traditions — Sat 1 Aug 10:10
  Le Passé Composé — Fri 31 Jul 06:39  ⚠ 4 linked files
  Crêpes & Gaufres é A — Thu 30 Jul 10:01
  template_output — Wed 29 Jul 08:43
  (unreadable) — Tue 28 Jul 11:10
  Les Faux Amis — Mon 27 Jul 10:45
  Au Restaurant — Sun 26 Jul 09:30
  Au Restaurant — Sun 26 Jul 09:30 (2)
```

These weekday names were computed from the fixture mtimes with `date -r`, not written from memory — an earlier draft of this plan had every one except the first off by a day, which would have read as a failing verification. If yours disagree, check `date -r <mtime> '+%a %-d %b %H:%M'` against the actual file before assuming your code is wrong.

If `textutil` is blocked in your environment (see the check in Task 4 Step 2), row 3 reads `Cr&ecirc;pes &amp; Gaufres é A — Thu 30 Jul 10:01` instead. Everything else is identical.

- [ ] **Step 3: Verify against the real folder**

Run: `bash tools/publish-dia-artifact.sh --list`

Expected: ten rows of **distinct** titles. If you see ten rows reading `template_output`, `candidate_rows` is not being reached.

- [ ] **Step 4: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
fix(tools): label --list rows by page title, not directory name

Dia names 77 of 78 artifact directories template_output, so the old
listing printed ten identical rows.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add `gui_alert`, and the TTY branch on `die`

Do this before the dialog, so the dialog's own failure modes are visible when you test it.

**Files:**
- Modify: `tools/publish-dia-artifact.sh:34`

- [ ] **Step 1: Replace `die` and add the two helpers above it**

Replace:

```bash
die() { echo "✗ $1" >&2; exit 1; }
```

with:

```bash
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
```

- [ ] **Step 2: Verify the terminal path is unchanged**

Run: `DIA_ARTIFACTS="$TMPDIR/nonexistent" bash tools/publish-dia-artifact.sh --list; echo "exit=$?"`

Expected: `✗ No Dia artifacts folder. Is Dia installed?` on stderr, `exit=1`, **no dialog**.

- [ ] **Step 3: Verify the GUI path**

Run: `DIA_ARTIFACTS="$TMPDIR/nonexistent" bash tools/publish-dia-artifact.sh --list 2>&1 | cat; echo "exit=${PIPESTATUS[0]}"`

Expected: an alert window titled *Publish to francaisavecjenn.ca* reading `No Dia artifacts folder. Is Dia installed?`. Dismiss it. Piping stderr is what makes `[ -t 2 ]` false, standing in for the Shortcut.

- [ ] **Step 4: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
feat(tools): show errors in an alert when there is no terminal

Run from a menu-bar Shortcut, every message this script produced went
nowhere. Same wording; the TTY test only decides whether it is drawn.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Add `--latest` and title-substring matching

**Files:**
- Modify: `tools/publish-dia-artifact.sh:38-67` (option parsing) and `102-110` (selection)

- [ ] **Step 1: Add the flag variable and case beside the existing options**

Add `WANT_LATEST=0` next to `WANT_LIST=0`, and this case before the `-*)` catch-all:

```bash
    --latest) WANT_LATEST=1; shift ;;
```

Extend the unknown-option message to name it:

```bash
    -*)      die "Unknown option '$1'. Try --list, --latest, --local, or --token <value>." ;;
```

- [ ] **Step 2: Reject both selectors at once**

Immediately after the existing "Unexpected argument" guard at lines 65-67, add:

```bash
# A silent precedence rule between these two would be a coin flip over which
# page gets a permanent URL.
if [ "$WANT_LATEST" = "1" ] && [ -n "${1:-}" ]; then
  die "Pass --latest or a title, not both."
fi
```

- [ ] **Step 3: Replace the selection block**

Replace lines 102-110:

```bash
if [ -n "${1:-}" ]; then
  INDEX=$(list_artifacts | awk -v want="/$1/site/index.html" 'index($0, want) { $1=""; sub(/^ /,""); print; exit }')
  [ -n "$INDEX" ] || die "No artifact named '$1'. Try --list."
else
  INDEX=$(list_artifacts | head -1 | cut -d' ' -f2-)
  [ -n "$INDEX" ] || die "No artifacts found yet."
fi

NAME=$(basename "$(dirname "$(dirname "$INDEX")")")
```

with:

```bash
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
  done < <(list_artifacts | candidate_rows)
  [ -n "$INDEX" ] || die "No page whose title contains '$1'. Try --list."
  [ "$HITS" -gt 1 ] && echo "$HITS pages match '$1'; taking the newest."
elif [ "$WANT_LATEST" = "1" ]; then
  while IFS=$'\t' read -r mtime path title refs; do
    INDEX="$path"; TITLE="$title"; REFS="$refs"
  done < <(list_artifacts | head -1 | candidate_rows)
  [ -n "$INDEX" ] || die "No artifacts found yet."
else
  choose_artifact          # added in Task 9; sets INDEX, TITLE, REFS
fi

# Keep NAME alive for now. Two blocks further down still read it — the extras
# warning and the old title extraction — and this script runs under `set -u`, so
# removing it here would abort with "NAME: unbound variable" before Task 11
# deletes its last use.
NAME=$(basename "$(dirname "$(dirname "$INDEX")")")
```

`< <(…)` rather than a pipe is deliberate: a `while` on the right of a pipe runs in a subshell in bash 3.2, so `INDEX` would be empty afterwards.

- [ ] **Step 4: Add a temporary stub so the script still parses**

Add above the selection block, to be replaced in Task 9:

```bash
choose_artifact() { die "The picker is not wired up yet. Use --latest."; }
```

- [ ] **Step 5: Verify `--latest` matches today's behaviour**

Run:

```bash
bash tools/publish-dia-artifact.sh --list | sed -n 2p
DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh --latest --token x --local 2>&1 | head -3
```

Expected: the `--latest` run reports it is publishing `Crêpes et Traditions` — the same artifact the first row names — or fails at the dev-server check, which is fine. It must not fail at selection.

- [ ] **Step 6: Verify title matching**

```bash
FIXA="DIA_ARTIFACTS=$TMPDIR/dia-fixtures"
env $FIXA bash tools/publish-dia-artifact.sh "faux" --token x --local 2>&1 | head -2
env $FIXA bash tools/publish-dia-artifact.sh "FAUX" --token x --local 2>&1 | head -2
env $FIXA bash tools/publish-dia-artifact.sh "restaurant" --token x --local 2>&1 | head -2
env $FIXA bash tools/publish-dia-artifact.sh "nothingmatches" 2>&1; echo "exit=$?"
env $FIXA bash tools/publish-dia-artifact.sh --latest "faux" 2>&1; echo "exit=$?"
```

Expected, in order: `faux` and `FAUX` both select *Les Faux Amis* (case-insensitive); `restaurant` prints `2 pages match 'restaurant'; taking the newest.`; `nothingmatches` gives `✗ No page whose title contains 'nothingmatches'. Try --list.` and `exit=1`; the last gives `✗ Pass --latest or a title, not both.` and `exit=1`.

Note that options must precede the title, which the existing guard at lines 65-67 already enforces.

- [ ] **Step 7: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
feat(tools): add --latest, and match the argument against page titles

The positional argument matched a directory name, and Dia names almost
every directory template_output — so it could only ever re-select the
newest artifact, the one thing it existed to override.

--latest preserves today's default behaviour under a name.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Add the chooser

**Files:**
- Modify: `tools/publish-dia-artifact.sh` — replace the `choose_artifact` stub from Task 8 Step 4

- [ ] **Step 1: Add `choose_from_list`**

```bash
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
```

- [ ] **Step 2: Replace the stub with the real `choose_artifact`**

```bash
# Sets INDEX, TITLE, REFS from the teacher's choice. Exits 0 on cancel.
choose_artifact() {
  local rows="$WORK/rows.txt" labels="$WORK/labels.txt" picked i n
  local paths=() titles=() refslist=() labellist=()
  list_artifacts | head -"$LIST_ROWS" | candidate_rows > "$rows"
  [ -s "$rows" ] || die "No artifacts found yet."

  while IFS=$'\t' read -r mtime path title refs; do
    paths[${#paths[@]}]="$path"
    titles[${#titles[@]}]="$title"
    refslist[${#refslist[@]}]="$refs"
  done < "$rows"

  build_labels < "$rows" > "$labels"
  while IFS= read -r line; do
    labellist[${#labellist[@]}]="$line"
  done < "$labels"

  picked=$(choose_from_list "$labels" "Which page do you want to publish?") \
    || die "Could not open the chooser. Over SSH or with no window server, use --latest."

  # A deliberate cancel is not a failure. Routing it through die would pop an
  # alert saying something went wrong when nothing did.
  if [ -z "$picked" ]; then
    echo "Cancelled. Nothing was published."
    exit 0
  fi

  n=${#labellist[@]}
  for ((i = 0; i < n; i++)); do
    if [ "${labellist[$i]}" = "$picked" ]; then
      INDEX="${paths[$i]}"; TITLE="${titles[$i]}"; REFS="${refslist[$i]}"
      return 0
    fi
  done
  die "Could not match the chosen page. This is a bug; use --latest to publish."
}
```

The labels are unique by construction (Task 5), so the loop finds exactly one match. The final `die` is unreachable in principle and says so.

- [ ] **Step 3: Verify the dialog against the fixtures**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh --local --token x`

Expected: a chooser appears **frontmost**, prompt *Which page do you want to publish?*, buttons *Cancel* and *Publish*, eight rows matching Task 6's `--list` output, with `Crêpes et Traditions — Sat 1 Aug 10:10` preselected.

- [ ] **Step 4: Verify cancel**

Press Cancel.
Expected: `Cancelled. Nothing was published.`, exit 0, no alert.

- [ ] **Step 5: Verify a choice reaches the publish path**

Run the same command, select `Les Faux Amis`, click Publish.
Expected: `Publishing "Les Faux Amis" (… bytes) to http://localhost:3000 …`, then a failure at the dev server or the token — which is correct here, since neither is real. The title in that line must be the one you clicked.

- [ ] **Step 6: Verify the real folder**

Run: `bash tools/publish-dia-artifact.sh --local --token x`
Expected: ten real titles, newest preselected. Cancel out.

- [ ] **Step 7: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
feat(tools): choose which artifact to publish from a native dialog

Bare invocation now lists the ten newest artifacts by title and date
with the newest preselected, so Return still publishes today's page.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Use the row's refcount for the extras warning

**Files:**
- Modify: `tools/publish-dia-artifact.sh:115-119`

- [ ] **Step 1: Replace the extras block**

Replace:

```bash
EXTRAS=$(find "$(dirname "$INDEX")" -type f ! -name index.html | wc -l | tr -d ' ')
if [ "$EXTRAS" != "0" ]; then
  echo "⚠ '$NAME' has $EXTRAS file(s) beside index.html. Only index.html is published,"
  echo "  and anything it loads from those files will be missing. Continuing anyway."
fi
```

with:

```bash
# The count comes from the row, where it was computed from the references
# index.html actually makes. The old find counted every file in the directory,
# so a stray .DS_Store flagged a page that was perfectly self-contained — and a
# marker that appears on every row is one nobody reads.
#
# The dialog already showed this on the chosen row, so only the flag-driven
# paths need telling.
if [ "${REFS:-0}" != "0" ]; then
  warn "This page links to $REFS file(s) that will not be published, so they will be missing. Continuing anyway."
fi
```

- [ ] **Step 2: Verify on a fixture with references**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh "passé" --local --token x 2>&1 | head -3`

Expected: `⚠ This page links to 4 file(s) that will not be published…`. The count is 4, not 5 — BBBB's `.DS_Store` must not be counted.

- [ ] **Step 3: Verify silence on a self-contained fixture**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh "traditions" --local --token x 2>&1 | head -3`

Expected: no `⚠` line at all.

- [ ] **Step 4: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
fix(tools): count referenced files, not every file in the directory

The old check counted a stray .DS_Store as a missing asset, so it fired
on self-contained pages. The count now comes from the references
index.html makes, and is shown on the row in the picker.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Delete the old title extraction

The title now arrives from the row. Removing the second extraction is what makes the dialog's string and the published string the same string.

**Files:**
- Modify: `tools/publish-dia-artifact.sh:142-188` (the `TITLE=$(osascript …)` block, the `__PUBLISH_UNREADABLE__` check, and the `textutil` block)

- [ ] **Step 1: Delete four blocks**

Delete the whole `TITLE=$(osascript -l JavaScript -e '…' "$INDEX" "$NAME")` assignment, the `if [ "$TITLE" = "__PUBLISH_UNREADABLE__" ]` check that follows it, and the `if printf '%s' "$TITLE" | grep -q '&[a-zA-Z]…'` block with its `ENTDIR` temp directory. All three are superseded: `describe_artifacts` extracts, `decode_entities` handles entities, and `WORK` plus the `trap` handle the temp directory.

Then delete the fourth: the `NAME=$(basename …)` line added in Task 8. That deletion was deferred to here because `set -u` would have aborted on the two blocks above, which read it. Confirm nothing else does:

```bash
grep -n 'NAME' tools/publish-dia-artifact.sh
```

Expected: no matches. If `$NAME` still appears anywhere, leave the assignment in place and work out why.

- [ ] **Step 2: Guard the unreadable case where selection happens**

`(unreadable)` can now be chosen from the dialog. Add immediately after the selection block ends:

```bash
# describe_artifacts reports an unreadable or non-UTF-8 artifact as this rather
# than throwing, so the rest of the list stays selectable. Refuse it here.
if [ "$TITLE" = "(unreadable)" ]; then
  die "Could not read that artifact as UTF-8 text."
fi
```

- [ ] **Step 3: Verify the title still reaches the request body**

The `BODY=$(osascript …)` call at what was line 192 already reads `"$TITLE"` from the environment and needs no change. Confirm:

Run: `grep -n 'BODY=\|"$TITLE"\|TITLE=' tools/publish-dia-artifact.sh`

Expected: `TITLE` is assigned only in the selection block, and read by the `BODY` call and the `Publishing "…"` echo. No `osascript` call extracts a title any more except `describe_artifacts`.

- [ ] **Step 4: Verify the unreadable artifact is refused**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh "unreadable" --local --token x 2>&1; echo "exit=$?"`

Expected: `✗ Could not read that artifact as UTF-8 text.`, `exit=1`.

- [ ] **Step 5: Verify the entity title survives the round trip**

Run: `DIA_ARTIFACTS="$TMPDIR/dia-fixtures" bash tools/publish-dia-artifact.sh "gaufres" --local --token x 2>&1 | head -2`

Expected: `Publishing "Crêpes & Gaufres é A" …` — decoded, and identical to the `--list` row.

- [ ] **Step 6: Commit**

```bash
git add tools/publish-dia-artifact.sh
git commit -m "$(cat <<'EOF'
refactor(tools): extract each artifact title exactly once

The title shown in the picker is now the title sent in the request and
the title the slug derives from. Two extraction paths could disagree,
and a list reading Cr&ecirc;pes beside a page published as Crêpes is
what makes someone stop trusting the picker.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Rewrite the docs

**Files:**
- Modify: `tools/publish-dia-artifact.sh:1-26` (header comment)
- Modify: `tools/README.md:11-83`

- [ ] **Step 1: Replace the script header**

```bash
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
# directory name: Dia calls almost every directory template_output, so the name
# cannot tell two apart.
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
```

- [ ] **Step 2: Rewrite the `tools/README.md` usage section**

Replace the "### Using it" block (lines 38-51) with:

````markdown
### Using it

```bash
tools/publish-dia-artifact.sh            # choose from a dialog
tools/publish-dia-artifact.sh --latest   # publish the newest, no dialog
tools/publish-dia-artifact.sh --list     # the ten newest, with dates
tools/publish-dia-artifact.sh crêpes     # a specific one, by words in its title
```

Artifacts are identified by the `<title>` of their `index.html`. Dia writes
almost every artifact to a directory called `template_output`, so the directory
name cannot tell two apart — an earlier version of this script selected by that
name, which meant it could only ever re-pick the newest one.

Against a local dev server:

```bash
JENN_SITE=http://localhost:3000 PAGES_UPLOAD_TOKEN=dev-token-not-a-secret \
  tools/publish-dia-artifact.sh
```
````

- [ ] **Step 3: Fix the "What it warns about" section**

Replace the **Extra files** bullet (lines 68-71) with:

```markdown
- **Linked files.** Only `index.html` is published. If a page links out to a
  stylesheet, script or image sitting beside it, those go missing — the site's
  CSP blocks everything a page loads from elsewhere. The dialog marks such a
  page `⚠ N linked files` on its row, so you can pick a different one before
  publishing rather than finding out afterwards.
```

- [ ] **Step 4: Add a line to the Shortcut section**

After the numbered steps (line 64), add:

```markdown
The Shortcut needs no arguments and no changes when the script is updated: with
none passed, it opens the chooser. Because a Shortcut discards the script's
output, errors are shown in an alert window instead.
```

- [ ] **Step 5: Verify no stale claims remain**

Run: `grep -n 'montreal_french\|newest index.html\|reads the newest' tools/README.md`

Expected: no matches. `montreal_french` was a directory name Dia never produced.

- [ ] **Step 6: Commit**

```bash
git add tools/publish-dia-artifact.sh tools/README.md
git commit -m "$(cat <<'EOF'
docs(tools): document the picker, and drop the fictional example

tools/README.md documented selecting an artifact by the directory name
montreal_french, which Dia has never produced.

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Publish for real against the dev server**

```bash
npm run dev          # in another terminal
tools/publish-dia-artifact.sh --local
```

Choose a page with an accented title. Expected: the admin editor opens at `/admin/pages/<slug>`, the link is on the clipboard, and the slug derives from the title the dialog showed.

- [ ] **Step 2: Confirm the published title matches the dialog exactly**

Open the page in the admin. Its title must be character-for-character what the dialog row showed, accents and `&` included.

- [ ] **Step 3: Run the full checklist**

```bash
bash tools/publish-dia-artifact.sh --list                   # ten distinct titles
bash tools/publish-dia-artifact.sh --latest --local         # no dialog
bash tools/publish-dia-artifact.sh --local                  # dialog, then Cancel → exit 0, silent
bash tools/publish-dia-artifact.sh --latest x               # ✗ Pass --latest or a title, not both.
bash tools/publish-dia-artifact.sh nothingmatches           # ✗ No page whose title contains…
bash tools/publish-dia-artifact.sh --token bad --local 2>&1 | cat   # alert appears
```

- [ ] **Step 4: Confirm the repo's own checks are untouched**

This plan changes no TypeScript, but run the CI order anyway to prove it:

```bash
npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build
```

Expected: all pass, exactly as before.

- [ ] **Step 5: Remove the fixtures**

```bash
rm -rf "$TMPDIR/dia-fixtures" "$TMPDIR/paths.txt"
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(tools): verify the artifact picker end to end

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| The dialog: ten rows, preselect, Cancel exits 0, `activate()` | 9 |
| Marker on the row rather than a warning after | 10 |
| Reference counting, rejecting `#`/`data:`/`//`/schemes | 3 |
| `url(…)` in inline CSS counted alongside `src=`/`href=` | 3 (added in review — see below) |
| A reference counts whether or not the file exists | 3 |
| `warn` on the non-dialog paths | 7, 10 |
| Command surface, `--latest`, both-given error | 8 |
| Title matching searches every artifact | 8 |
| `--list` shows the same labels | 6 |
| `describe_artifacts` contract and fallbacks | 3 |
| `textutil` before label building | 4 |
| Title extracted once | 11 |
| `choose_from_list` options | 9 |
| Label uniqueness | 5 |
| `die` TTY branch, `gui_alert` | 7 |
| One `mktemp -d` and a `trap` | 4 |
| No window server → point at `--latest` | 9 |
| `(unreadable)` refused at publish time | 11 |
| Docs, and the `montreal_french` fiction | 12 |
| bash 3.2 constraint | stated at the top; enforced in 5, 8, 9 |

Not implemented, deliberately, per the spec's *Not doing* section: asset inlining, a thumbnail picker, artifact pruning.
