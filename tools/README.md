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

Nothing is scraped and nothing is copied by hand — the script reads the newest
`index.html`, takes the page title from its `<title>` tag, publishes it, copies
the link to the clipboard, and opens the editor so you can pick which groups see
it.

### Setting it up once

```bash
mkdir -p ~/.config/francaisavecjenn
pbpaste > ~/.config/francaisavecjenn/token   # with the token on the clipboard
chmod 600 ~/.config/francaisavecjenn/token
```

### Using it

```bash
tools/publish-dia-artifact.sh            # publish the newest artifact
tools/publish-dia-artifact.sh --list     # the ten newest, with dates
tools/publish-dia-artifact.sh montreal_french   # a specific one by name
```

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
4. Name it **Publish latest page**, then in the sidebar tick **Pin in Menu Bar**.

She writes a page in Dia, clicks the menu-bar shortcut, and the link is on her
clipboard. A keyboard shortcut can be added in the same panel.

### What it warns about

- **Extra files.** If an artifact ships images or stylesheets beside
  `index.html`, only `index.html` is published and the rest go missing. The
  script says so before publishing rather than letting it fail silently in front
  of students.
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
