// Deciding whether a click is about to destroy something.
//
// BoardEditor holds a live whiteboard's op log in component state, and /finish
// treats that log as authoritative — so ANY navigation away from /g/[slug]
// loses the board, including a soft one. The tab strip is next/link, so
// "Les fichiers" mid-lesson is exactly that: the page re-renders with a new
// tab, BoardTab unmounts, and the log goes with it without a warning.
//
// The editor watches clicks at the document's capture phase and asks this
// function whether the one it just saw is going to replace or unload the page.
// The false cases below are all the same fact: the current document is not going
// anywhere, so there is nothing to lose and a dialog would be a lie.

export type NavigationClick = {
  // The resolved ABSOLUTE href of the nearest ancestor <a>, or null when the
  // click was not on a link. Absolute because the comparison below needs to
  // hold against window.location.href; getAttribute("href") would hand this a
  // relative string and every comparison would be false.
  href: string | null;
  // Anything that names another frame or a new tab leaves this document loaded.
  target: string | null;
  download: boolean;
  // A modifier key or a non-primary button. The browser opens these somewhere
  // else and this page survives.
  modified: boolean;
  currentUrl: string;
};

export function shouldGuardNavigation(click: NavigationClick): boolean {
  if (!click.href) return false;
  if (click.download) return false;
  if (click.modified) return false;

  // "" and "_self" both mean this frame. Every other value — "_blank",
  // "_parent", a window name — leaves the current document in place.
  const target = click.target ?? "";
  if (target !== "" && target !== "_self") return false;

  // A fragment-only difference is a same-document jump: nothing re-renders, the
  // editor is still mounted afterwards, and so is the board. An href identical
  // to the current URL falls out here too, which is right — prompting on the
  // tab she is already looking at would be noise.
  return stripFragment(click.href) !== stripFragment(click.currentUrl);
}

function stripFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

export type NavigationTarget =
  | { kind: "internal"; path: string }
  | { kind: "external"; href: string };

// Where to send her after she has answered the dialog. A same-origin href goes
// through the router, because a full page load for a tab switch would work and
// would feel wrong; anything else — another origin, mailto:, tel: — is handed to
// the browser whole.
export function navigationTarget(
  href: string,
  origin: string,
): NavigationTarget {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    // Only reachable with a base we cannot parse — a valid base resolves almost
    // any href, "::::" included. Kept so this function has no way to throw at a
    // call site that could not do anything about it, and a full load is the safe
    // reading of an href we do not understand: the browser knows what to do with
    // it and the router does not.
    return { kind: "external", href };
  }

  // `href` and not `url.href` in both external branches, so nothing is silently
  // normalised on its way to the browser.
  if (url.origin !== origin) return { kind: "external", href };
  return { kind: "internal", path: `${url.pathname}${url.search}${url.hash}` };
}
