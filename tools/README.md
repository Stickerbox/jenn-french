# Publishing tools

Two ways to get a page onto francaisavecjenn.ca without opening the admin area.
Both use `POST /api/pages` and need `PAGES_UPLOAD_TOKEN` set on the server.

| Tool | Use it for |
|---|---|
| `publish-dia-artifact.sh` | Pages Claude wrote inside Dia — **the main one** |
| `publish-extension/` | Any ordinary web page open in a tab |

## publish-dia-artifact.sh — the Dia path

Dia serves its artifacts from `chrome-untrusted://`, a Chromium-internal scheme
that **no browser extension can be granted access to**. There is no permission,
flag, or toggle that changes this. The extension approach is a dead end for Dia
artifacts, and that is why this script exists instead.

It works because Dia also writes every artifact to disk, as a plain directory:

```
~/Library/Application Support/Dia/User Data/Default/AgentArtifacts/
  <UUID>/<artifact-name>/site/index.html
```

Nothing is scraped and nothing is copied by hand — the script lists the artifacts
on disk, takes each page title from its `<title>` tag, publishes the one you
choose, copies the link to the clipboard, and opens the editor so you can pick
which groups see it.

### Setting it up once

```bash
mkdir -p ~/.config/francaisavecjenn
pbpaste > ~/.config/francaisavecjenn/token   # with the token on the clipboard
chmod 600 ~/.config/francaisavecjenn/token
```

### Using it

```bash
tools/publish-dia-artifact.sh            # choose from a dialog
tools/publish-dia-artifact.sh --latest   # publish the newest, no dialog
tools/publish-dia-artifact.sh --list     # the ten newest, with dates
tools/publish-dia-artifact.sh crêpes     # a specific one, by words in its title
```

With no arguments it opens a dialog listing the ten newest artifacts by title and
date, newest already selected — so Return publishes today's page and the other
nine are one arrow key away.

Artifacts are identified by the `<title>` of their `index.html`. Dia writes most
artifacts to a directory called `template_output`, so the directory name usually
cannot tell two apart — an earlier version of this script selected by that name,
which meant it could generally only re-pick the newest one.

### Files beside the page

An artifact that links to its own `.js`, `.css`, images or fonts publishes with
them folded in. The script reads each file the document names, plus anything its
stylesheets name one level deeper, and uploads them with the page; the server
inlines them into one self-contained document.

The picker says which is which. `+ 3 files` means three were found and will be
published. `⚠ 1 missing file` means one was named but is not on disk, or points
outside the artifact folder — those are refused, and the reply names each one.

A ref pointing outside the artifact is never read, symlinks included. These pages
are published at a public URL, so a ref of `../../.ssh/id_rsa` has to be refused
rather than trusted.

Against a local dev server:

```bash
JENN_SITE=http://localhost:3000 PAGES_UPLOAD_TOKEN=dev-token-not-a-secret \
  tools/publish-dia-artifact.sh
```

### Making it a one-click Shortcut

So Jenn never touches a terminal:

1. Open **Shortcuts** → **+** for a new shortcut.
2. Add the action **Run Shell Script**.
3. Set Shell to `/bin/bash` and paste the full path to the script, in quotes:
   `"/Users/<her>/…/jenn-french/tools/publish-dia-artifact.sh"`
4. Name it **Publish a page**, then in the sidebar tick **Pin in Menu Bar**.

She writes a page in Dia, clicks the menu-bar shortcut, picks the page from the
dialog, and the link is on her clipboard. A keyboard shortcut can be added in the
same panel.

The Shortcut needs no arguments and no changes when the script is updated: with
none passed, it opens the chooser. Because a Shortcut discards the script's
output, errors are shown in an alert window instead.

### What it warns about

- **Linked files.** Only `index.html` is published. If a page links out to a
  stylesheet, script or image sitting beside it, those go missing — the site's
  CSP blocks everything a page loads from elsewhere. The dialog marks such a
  page `⚠ N linked files` on its row, so you can pick a different one before
  publishing rather than finding out afterwards.
- **Files it could not include.** A page that loads a script, stylesheet, image
  or font from a known CDN has it folded into the page on publish, so it works
  behind the site's CSP without anything being loaded from elsewhere. Anything
  the site could not fold in is listed after the link, with the reason — an
  unknown source, a fetch that failed, or a page that would go over 2 MB.
- **Size.** The site rejects anything over 2 MB with a message saying so.

## publish-extension/ — the browser path

A Chromium extension that publishes the page in the current tab, by toolbar
click or right-click. See `publish-extension/README.md`.

**It cannot publish Dia artifacts** — that is the `chrome-untrusted://` limit
above. It works on ordinary `https://` pages, and on saved `.html` files if
"Allow access to file URLs" is turned on in its Details page. Keep it for
publishing something already on the web; use the script for anything Claude
wrote in Dia.


## Printing a page

Every page at `/p/<slug>` has a PDF pill that opens the browser's own print
dialog, where *Save as PDF* is a destination. The printout is the browser's
rendering of the document, so **a page that has to print well needs `@media
print` rules of its own** — page breaks that fall between exercises, a
background that does not swallow the ink, a layout that fits the width of a
sheet. Nothing is injected into the document to arrange that: a print
stylesheet we supplied would be a guess about the page's design.

When the layout has to be guaranteed rather than negotiated with a browser,
`html-to-pdf.swift` above renders a local HTML file to a paginated Letter PDF
via WKWebView, and that PDF can be uploaded to a shelf like any other.
