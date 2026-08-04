# Choosing which Dia artifact to publish — design

Date: 2026-08-02

## Problem

`tools/publish-dia-artifact.sh` publishes the artifact whose `index.html` was
modified most recently. There is no way to publish a different one.

The script offers two escape hatches and neither works. `--list` prints the ten
newest artifacts labelled by their directory name, and
`publish-dia-artifact.sh <name>` selects one by that name. On the only real
artifacts folder available to check, the names are:

```
77  template_output
 1  android_dev_sync_prep
```

Dia writes essentially every artifact to a directory called `template_output`.
So `--list` prints ten identical rows, and passing `template_output` re-selects
the newest one — the exact thing the argument exists to override. The
`montreal_french` example at `tools/README.md:43` describes a directory name
Dia has never produced.

The `<title>` of each `index.html`, by contrast, is distinct and human:

```
The Friday Brief - July 31
The Thursday Brief - July 30
The Wednesday Brief - July 29
```

The script already extracts it — lines 142-165 — but only *after* selection, to
name the published page. The identifier a picker needs is already being computed
one step too late.

The person this tool is for does not use a terminal. `tools/README.md:53-64`
sets her up with a menu-bar Shortcut that runs the script with no arguments, so
any selection mechanism that requires typing a flag is unavailable to her by
construction.

## Goal

Running the script with no arguments opens a native chooser listing the ten
newest artifacts by title and date, with the newest preselected. Return
publishes today's page; the other nine are one arrow key away.

Every existing behaviour remains reachable by flag, and nothing about the
publish path itself changes.

## Constraint that shapes everything

The script must run on a machine with **stock macOS and nothing else**. Lines
133-137 record why there is no `python3`; the same reasoning rules out `node`
and `jq`. It is tempting to reach for the repository's own Node toolchain, but
the script runs on Jenn's machine, which has Dia and macOS and no development
environment.

`osascript -l JavaScript` is therefore not a stylistic choice but the only
scripting runtime guaranteed to be present, and it is already how the script
parses the title and encodes JSON. The chooser, the alerts and the title
extraction all go through it. `chooseFromList`, `displayAlert` and
`displayNotification` were confirmed present.

The same constraint applies to the shell. The shebang is `#!/bin/bash`, and
`/bin/bash` on macOS is **3.2.57** — Apple still ships the last GPLv2 release.
So `mapfile`, `readarray`, associative arrays (`declare -A`) and case-folding
expansions (`${var,,}`) are all unavailable. Arrays are filled with
`while IFS= read -r` loops and case folding goes through `tr`. Array `+=` and
`for (( ))` are fine; both predate 3.2.

## Scope

New, all inside `tools/publish-dia-artifact.sh`:

- `describe_artifacts` — a JXA helper mapping artifact paths to titles and
  linked-file counts
- `choose_from_list` — a JXA helper wrapping `chooseFromList`
- `gui_alert` — a JXA helper wrapping `displayAlert`
- `--latest` flag

Changed:

- The positional argument matches a page title rather than a directory name
- `--list` labels rows by title instead of directory name
- `die` also draws an alert when stderr is not a terminal
- The extras check counts referenced files, and reports in the picker rather
  than on stdout
- Temp directories are cleaned up by one `trap`
- `tools/README.md`, and the script's own header comment

Unchanged, deliberately:

- Everything from the token resolution at line 121 down: the `textutil` entity
  fallback, the JSON encode, the `curl` POST, the clipboard copy, and opening
  the admin editor. This change decides *which* file is published; it does not
  touch *how*.
- `list_artifacts` (lines 87-91). Sorting `*/site/index.html` by mtime is still
  the right candidate set and the right order.
- The menu-bar Shortcut instructions. The same Shortcut, unmodified, now asks —
  which is the point.
- `CLAUDE.md`, which does not describe `tools/`.

## The dialog

```
╭────────────────────────────────────────────────────────────────╮
│  Which page do you want to publish?                            │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Crêpes et Traditions — Thu 31 Jul 10:10                    │ │  ← preselected
│ │ Le Passé Composé — Wed 30 Jul 06:39                        │ │
│ │ Les Faux Amis — Tue 29 Jul 10:01      ⚠ 6 linked files     │ │
│ │ Les Nombres de 1 à 100 — Mon 28 Jul 08:43                  │ │
│ │ … ten rows, newest first                                   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                    [ Cancel ]   [ Publish ]    │
╰────────────────────────────────────────────────────────────────╯
```

Ten rows, matching what `--list` has always shown — about two teaching weeks.
Anything older is already published and living on the site.

The newest row is preselected and `Publish` is the default button, so the common
case costs one keystroke. Preselecting also makes the dialog a confirmation
step: she reads the title before anything is created, and a slug never moves
once created.

Cancel exits **0 with no alert**. A deliberate cancel is not a failure, and
routing it through `die` would pop a dialog telling her something went wrong
when nothing did.

`app.activate()` is called before the chooser. Without it, a dialog raised from
a menu-bar Shortcut can open behind whatever is frontmost, which reads as the
click having done nothing.

### Why a marker on the row rather than a warning after

The script already warns when an artifact ships files beside `index.html`
(lines 115-119), because only `index.html` is published and the site's CSP
blocks everything a page loads from elsewhere. That warning goes to stdout,
where a Shortcut cannot show it.

Moving it into the row rather than into an alert is deliberate. A warning after
selection tells her a page is broken; a marker during selection lets her pick a
different one. It also makes "self-contained" a property she can *compare*
between rows, which is the thing a list is for and a modal cannot do.

The count changes from "files in the directory" to distinct relative references
`index.html` actually makes — double-quoted `src=` and `href=` attributes, plus
`url(…)` in an inline `<style>` block — rejecting `://`, `//`, `#`, `data:`,
`mailto:` and `tel:`. Today's `find` at line 115 counts every file present, so a
stray `.DS_Store` flags an artifact that is perfectly self-contained. A marker
that appears on every row is the click-through problem in a different costume:
the day it means something, nobody sees it.

`url(…)` is not an afterthought, it is the case that matters. Jenn's artifacts
are single-file HTML with **inline CSS**, so a background image is referenced
that way and no other. Counting attributes alone returned 0 for such a page —
and 0 is the value that means *self-contained, nothing to warn about*. The
marker would have been silent on exactly the page it exists to flag, which is
worse than not having it. Found in review, with a fixture where 6 real
references counted as 2.

Single-quoted attributes, unquoted attributes and `srcset` remain uncounted:
known and accepted. Dia emits machine-generated HTML and double-quotes what it
writes, and this is an advisory marker on a picker row, not a gate on
publishing.

A reference counts whether or not the file it names exists. What the marker
answers is "will this page arrive whole", and a reference that is already broken
on disk will be just as broken on the site.

The non-dialog paths keep a warning, since they never see a row. `--latest` and
title matching print a non-fatal `warn` line to stderr, as today. It stays plain
text rather than an alert: those paths are the terminal and scripted ones by
definition, and the path with no terminal is the one that shows the marker.

Jenn's artifacts are pure HTML with inline CSS, so this marker will never fire
for her. It is kept as insurance against a future Dia template change, at the
cost of about ten lines, and because deleting the check outright would be a
regression in a script whose output is a permanent public URL.

## The command surface

```
publish-dia-artifact.sh                  dialog, newest preselected   ← the Shortcut
publish-dia-artifact.sh --latest         newest, no dialog
publish-dia-artifact.sh "crêpes"         title substring, case-insensitive
publish-dia-artifact.sh --list           the ten newest, with titles, then exit
publish-dia-artifact.sh --token V …      unchanged
publish-dia-artifact.sh --local …        unchanged
```

`--latest` is today's default behaviour under a name. Nothing that scripts this
loses a behaviour; it gains a flag. It exists because the dialog is otherwise
unconditional, and `osascript` has no window server to draw into over SSH.

The positional argument changing meaning is a breaking change on paper and a bug
fix in practice: with 77 of 78 directories named `template_output`, no
invocation that works today stops working.

Title matching searches **every** artifact, not just the ten the dialog shows.
The ten-row cap is a property of the list Jenn reads, not of what the tool can
reach; a scripted caller naming an exact title should not fail because the page
is three weeks old. Describing all of them is one `osascript` call over the
whole set — a few tenths of a second at the sizes involved.

`--list` prints the same ten labels the dialog would show, marker included, so
the two cannot drift.

`--latest` together with a title is an error — "Pass --latest or a title, not
both" — rather than a silent precedence rule. Options continue to be consumed
before positionals, as lines 42-60 already arrange, and the existing "options go
before the artifact name" guard at 65-67 still applies.

## Structure

```
list_artifacts()          bash  → "mtime<TAB>path", newest first        (unchanged)
  └─ head -10             bash  → the candidate set
      └─ describe_artifacts()  JXA  → "title<TAB>refcount" per path
          └─ build labels      bash → "Title — Thu 31 Jul 10:10  ⚠ N linked files"
                                      date -r "$mtime" '+%a %-d %b %H:%M'
              └─ choose_from_list()  JXA → the chosen label
                  └─ label → index → path + title, already in hand
                      └─ the existing publish path from line 178 down
```

`%-d` rather than `%e`, so a single-digit day gives `Fri 1 Aug` and not the
double-spaced `Fri  1 Aug` that today's `--list` format produces. The `-`
padding modifier is usually a glibc extension; it was verified working in
macOS's BSD `date`.

Reading the files and asking the question are separate helpers rather than one
call that does both. All three selection paths — dialog, `--latest`, title match
— need the reading half; only the dialog needs the asking half. Fusing them
would mean a single helper growing conditionals to suppress its own dialog.

The extra process launch this costs was measured at roughly 0.05s. Batching all
ten titles into one call rather than looping is the decision that matters there:

```
one osascript, ten titles    0.137s
ten separate osascript calls 0.585s
```

### The title is extracted once

The extraction at lines 142-165 is **deleted**, not duplicated. `decode()` moves
into `describe_artifacts` verbatim, `&amp;`-decodes-last comment included, and
the title that appears in the dialog is the same string that reaches the POST
body and derives the slug.

The alternative — leave the publish path alone and let the picker extract titles
separately — is a smaller diff and was rejected. Two extraction paths can
disagree, and a list showing `Cr&ecirc;pes` beside a page published as `Crêpes`
is exactly the kind of drift that makes someone stop trusting the picker.

The `textutil` fallback for exotic entities (lines 178-188) moves **before**
label building rather than staying after selection. `decode()` deliberately
knows only the five core entities and numeric references, so a title written
`Cr&ecirc;pes` survives it intact — that is what `textutil` is for. Leaving
`textutil` where it is would put the raw `Cr&ecirc;pes` in the dialog and the
decoded `Crêpes` on the published page, reintroducing the exact drift that
extracting once was meant to remove.

It runs per candidate title, guarded by the existing `&[a-zA-Z][a-zA-Z0-9]*;`
test, which was confirmed to skip ordinary titles — so the usual number of calls
is zero. A call costs about 0.25s, so a pathological ten-row list of
entity-laden titles would add a couple of seconds. Accepted rather than batched:
batching means inventing a delimiter that survives an HTML-to-text conversion,
for a case that does not occur.

### `describe_artifacts`

`argv[0]` is a temp file holding one artifact path per line. It emits
`title<TAB>refcount`, one line per input, in input order. Bash asserts the line
counts match and dies if they do not.

- Unreadable or non-UTF-8 file → `(unreadable)`, refcount 0. The existing
  `s.js === undefined` test is the working one; `s.isNil` is a method and
  referencing it without calling is always truthy (line 158).
- Missing `<title>` → the directory name, matching today's fallback at line 160.
- Title whitespace is collapsed to single spaces and trimmed. A title is a
  single-line thing, and a tab inside one would corrupt the output format.

Only file paths cross the process boundary, preserving the property recorded at
lines 190-191: no artifact content ever meets shell word-splitting or quoting.

### `choose_from_list`

`argv[0]` is a temp file of labels, `argv[1]` the prompt.

```
chooseFromList(labels, {
  withPrompt:       argv[1],
  defaultItems:     [labels[0]],
  okButtonName:     "Publish",
  cancelButtonName: "Cancel",
})
```

Cancel returns `false`; the helper prints nothing and exits 0.

### Label uniqueness

`chooseFromList` returns the chosen **string**, not an index, so two identical
labels are indistinguishable. Titles legitimately repeat across days and the
timestamp usually separates them, but regenerating a page twice inside one
minute defeats that.

After building the labels, any duplicate gets ` (2)`, ` (3)` appended to the
later ones. The label-to-path lookup is then total by construction rather than
by luck.

## Error surfacing

```bash
die() { echo "✗ $1" >&2; [ -t 2 ] || gui_alert "$1"; exit 1; }
```

Every message the script produces today is invisible to Jenn. `die` writes to
stderr, the extras warning and the `✓ $URL` line write to stdout, and a
Shortcuts "Run Shell Script" action discards both unless a Show Result action is
wired up — a failure surfaces as a generic Shortcuts error banner with no reason
in it. "No token", "The site said 413" and "this artifact links to six files"
all vanish at precisely the moment there is no terminal to look at. Adding a
picker without fixing this ships a new dialog that can be followed by silence.

The wording does not change; the TTY test only decides whether the message is
also drawn. This is the environment auto-detection rejected for *selection* and
accepted for *presentation*: the property that made it a bad idea for choosing a
page — behaviour depending on invisible state, when the output is a permanent
slug — is the property it does not have when choosing a renderer.

Success stays as it is. The admin editor opening in her browser and the link
landing on her clipboard is already unambiguous feedback, and a notification
would only duplicate it.

## Temp files

Two new temp files join the one the `textutil` fallback already creates. That
one is made with `mktemp -d` at line 179 and removed inline at 187, which leaks
the directory if anything between them fails under `set -e`. One `mktemp -d` per
run with a `trap … EXIT` covers all three and closes the existing leak.

## Edge cases

| Case | Behaviour |
|---|---|
| No artifacts folder | existing `die` wording, now also an alert |
| Zero artifacts | existing `die` wording, now also an alert |
| Fewer than ten artifacts | the list shows what exists |
| Cancel | exit 0, nothing published, no alert |
| No window server (SSH) | `chooseFromList` fails → `die` pointing at `--latest` |
| Title match, no hit | `No page whose title contains 'x'. Try --list.` |
| Title match, several hits | the newest wins, said out loud on stdout |
| Non-UTF-8 artifact | row reads `(unreadable)`; choosing it dies as today |
| Title holds `&eacute;` | decoded in the helper; `textutil` fallback unchanged |
| Duplicate labels | disambiguated with ` (2)`, ` (3)` |

Title matching is case-insensitive and accent-**sensitive**. Folding accents is a
rabbit hole for a path Jenn does not use.

## Verification

There are no automated tests. `tools/` sits outside the convention in
`CLAUDE.md` that logic lives in `lib/` as a pure function with a test in
`tests/lib/`, and it cannot easily be brought inside it: a `lib/` module needs
Node, and this script's entire premise is that Node is not available where it
runs. Recorded here as a deliberate exception rather than an oversight.

Manual checklist, against the real artifacts folder and `npm run dev`:

1. `--list` shows ten distinct titles, not ten `template_output`
2. Bare run — the dialog is frontmost, the newest row is preselected, Return
   publishes it
3. Cancel — exit 0, nothing published, no alert
4. `--latest` selects the same artifact the current script selects
5. A title substring hits; a miss produces the error; `--latest "x"` produces
   the both-given error
6. A bad token with stderr piped (`2>&1 | cat`) raises an alert
7. End-to-end publish via `--local`, and the resulting slug derives from the
   title the dialog showed
8. An artifact with linked assets shows the marker; one without shows none

## Not doing

**Inlining assets.** On the folder inspected, every artifact links out to
stylesheets and scripts that are never published, so what reaches the site is
unstyled. Rewriting `index.html` to fold CSS, JS and images in as inline blocks
and `data:` URIs would fix that properly, but it needs checking against the
CSP on `/p/[slug]/raw` — which admits no `https:` in any directive — and it is
its own project rather than part of a picker. Jenn's own artifacts are already
self-contained, so it is not blocking her.

**A thumbnail picker.** Rendering each artifact as a live preview, the way
`PageTile` and `HtmlPreview` do on the site, would let her recognise a page by
sight. It needs a new surface to build and host, and titles turn out to be
distinct enough to identify a page by. Rejected as disproportionate.

**Pruning old artifacts.** Dia never removes them and the folder grows forever.
Deleting another application's files from a publishing script is not this
tool's business.
