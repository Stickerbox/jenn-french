import { parseLinkUrl } from "@/lib/link-url";

// A message is MAX_MESSAGE_LENGTH (4000) characters, which is room for dozens
// of URLs, and anyone holding a student's token could otherwise turn one POST
// into forty page rows. A ceiling on abuse rather than a guess about real use —
// the same kind of bound as MAX_REPLAY and MAX_PDF_BYTES.
//
// Links past this are dropped silently. There is no channel to report them on,
// and the message itself still carries every one of them.
export const MAX_LINKS_PER_MESSAGE = 5;

// A scheme is REQUIRED, and that is the load-bearing decision in this module.
// parseLinkUrl prefixes https:// onto a scheme-less string, which is right for a
// field labelled "Adresse du lien" and wrong for prose: "mot.Ensuite" and
// "3.Regarde" both look like hostnames to a URL parser. The cost, accepted: a
// bare www.tv5.ca typed into a message gets no shelf row.
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

// A URL at the end of a sentence is the common case, and ".../verbes." is a 404.
const TRAILING = /[.,;:!?'"»…\]}]+$/;

// A trailing ) is stripped only when the URL has no ( to match it, so
// /wiki/Accent_(linguistique) survives while "(voir https://tv5.ca)" does not
// keep the paren that closed the aside.
//
// Accepted imperfection, in the register of titleFromUrl's note about short
// all-letter ids: a URL that genuinely ends in a full stop is mangled, and
// nothing available here can tell the two apart.
function trimTrailing(candidate: string): string {
  let value = candidate.replace(TRAILING, "");

  while (value.endsWith(")") && !value.includes("(")) {
    value = value.slice(0, -1).replace(TRAILING, "");
  }

  return value;
}

// Every http(s) URL in a chat message, normalised, de-duplicated and capped.
//
// Validation is parseLinkUrl's, reused rather than re-expressed: it is already
// the one guard between somebody's typing and an href, and a second URL
// validator standing beside it is a second place for javascript: to get through.
export function extractLinks(
  body: string,
  max: number = MAX_LINKS_PER_MESSAGE,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(URL_PATTERN)) {
    if (found.length >= max) break;

    const parsed = parseLinkUrl(trimTrailing(match[0]));
    if (!parsed.ok) continue;

    // De-duplicated on parseLinkUrl's OUTPUT rather than the raw match, so the
    // same link written two ways in one message is filed once.
    if (seen.has(parsed.url)) continue;

    seen.add(parsed.url);
    found.push(parsed.url);
  }

  return found;
}
