# Publish to Français Avec Jenn — browser extension

Right-click a page, publish it to francaisavecjenn.ca, get a link for students.

Written for Dia, which is Chromium-based, so it also loads in Chrome, Edge, Arc
and Brave unchanged.

## What it does

1. Right-click anywhere on the page you want to publish.
2. Choose **Publish this page to Français Avec Jenn**.
3. It reads the page, sends it to the site, and opens the editor so you can pick
   which groups see it and fix the title.

The page is live the moment it publishes — the editor step is only for choosing
groups. Anyone with the link can open it; only the groups you tick see it listed
at `/g/<group>/pages`.

## Installing it

1. Open **Extensions → Manage extensions** in Dia.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `publish-extension` folder.
4. Click **Details → Extension options** on the new extension.
5. Paste the publishing token, leave the site address as it is, click **Save**.

The token is the `PAGES_UPLOAD_TOKEN` from the server's `.env.local`. It is
stored only on that computer, and it is the only thing standing in front of the
publish endpoint — treat it like a password. If it ever leaks, change it on the
server and re-paste the new one here.

## It cannot publish Dia artifacts

Dia serves artifacts from `chrome-untrusted://`, a Chromium-internal scheme no
extension can be granted access to — there is no permission, flag, or toggle
that changes it. Use `../publish-dia-artifact.sh` for anything Claude wrote in
Dia; it reads the same artifact from disk instead.

This extension is for publishing a page that is already on the web.

## What it publishes

The page **currently open in the tab**, as the browser has it after any scripts
have run. So the HTML has to be open in a tab of its own — an `https://` page,
or a saved `.html` file with "Allow access to file URLs" turned on in the
extension's Details page. Right-clicking inside a chat window publishes the chat
window.

Two limits worth knowing:

- **2 MB.** Bigger than that and it refuses before sending, telling you the size.
- **Self-contained files only.** The site's security policy blocks anything the
  page loads from elsewhere — fonts, images, stylesheets, scripts from a CDN.
  A page that carries everything inside itself is unaffected; one that pulls a
  font from Google will lose it. See the "Isolation" section of
  `docs/superpowers/specs/2026-07-30-uploaded-pages-design.md` for why.

## When something goes wrong

The notification carries the reason. The common ones:

| Message | What happened |
|---|---|
| "Token needed" | Nothing saved in options yet — the options page opens for you |
| "The site said 401" | The token is wrong, or was rotated on the server |
| "The site said 404" | `PAGES_UPLOAD_TOKEN` is not set on the server, so publishing is switched off |
| "That page is N MB" | Over the 2 MB cap; nothing was sent |

To watch it work, open **Manage extensions → Details → Inspect views: service
worker** and publish something — errors land in that console.

## Testing against a local site

Set the site address in options to `http://localhost:3000` and run `npm run dev`.
Both addresses are already in the manifest's `host_permissions`, so no change is
needed to switch between them.
