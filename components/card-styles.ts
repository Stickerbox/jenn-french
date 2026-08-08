import type { CardColor } from "@/lib/inline-markup";

export const cardPanel =
  "relative flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] p-8 shadow-[var(--card-shadow)]";

export const cardPanelBack =
  "relative flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper-back)] p-8 shadow-[var(--card-shadow)]";

export const accentBarClass = "absolute inset-y-0 left-0 w-1.5 rounded-l-[14px]";

export const accentBarStyle = {
  background: "linear-gradient(var(--card-bleu), var(--card-or))",
};

// The teacher's five colours, mapped onto the palette tokens the card already
// used. Nothing new was invented here: red is the section-heading red, gold the
// usage line's gold, black the body ink.
export const CARD_COLOR_VAR: Record<CardColor, string> = {
  red: "--card-rouge",
  blue: "--card-bleu",
  green: "--card-moss",
  gold: "--card-or",
  black: "--card-ink",
};

export const cardHeaderRow =
  "mb-4 flex items-baseline justify-between border-b border-dashed border-[var(--card-line)] pb-3";

export const cardDateLabel =
  "font-[family-name:var(--card-font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--card-bleu)]";

// Colour is deliberately absent from these three: the text inside them carries
// its own now, so a colour here would be either overridden or fighting it.
// Everything that is not the teacher's to change — the pill, the uppercasing,
// the sizes, the monospace — stays.
export const cardSubjectPill =
  "rounded-full bg-[var(--card-bleu-soft)] px-2.5 py-1 font-[family-name:var(--card-font-serif)] text-[11px] uppercase tracking-wide";

// The chip beside the date on a card being shown again for revision. Moss
// rather than the subject pill's blue, and it sits on the LEFT beside the date
// rather than on the right where the subject pill is: it qualifies the date —
// "this is that day's card, not today's" — and a chip in the subject's slot
// would read as a subject called "Révision".
//
// Here rather than local to CardFront because CardBack draws the same header
// row, and a second copy is a second thing to keep in step.
export const cardRevisionChip =
  "rounded-full border border-[var(--card-moss)] px-2 py-0.5 font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-wider text-[var(--card-moss)]";

// The small pill in a deck tile's top right saying which face is showing —
// "Recto" on the paper front, "Verso" on the lilac back.
//
// Colour is deliberately absent, the same split cardSubjectPill makes: the two
// faces sit on opposite surfaces, so each call site supplies its own border and
// text colour. A version of this with a colour baked in would be overridden on
// one of the two faces every time.
//
// Here rather than local to DeckCard because two faces draw it and a second
// copy is a second thing to keep in step — the reason cardRevisionChip above
// gives for itself.
export const deckFacePill =
  "shrink-0 rounded-full border px-2 py-0.5 font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-wider";

export const cardEyebrow =
  "font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[#a89a7f]";

export const cardSectionHeading =
  "mb-1.5 font-[family-name:var(--card-font-mono)] text-[13px] uppercase tracking-wider";

// The phonetic chip keeps its own moss, overriding whatever colour surrounds
// it. It is one visual token rather than a stretch of coloured prose, and every
// chip on a card should match the others — a new one picking up the black of
// the sentence it was cut from would sit beside older moss ones and look like
// a mistake.
export const cardCodeChip =
  "rounded bg-[#eef3ee] px-1.5 py-0.5 font-[family-name:var(--card-font-mono)] text-[13px] text-[var(--card-moss)]";

export const cardProse = "whitespace-pre-line text-[15px] leading-relaxed";

// Wave 5, Task J. The one focus ring every card-palette control shares, so a
// keyboard user gets the same visible signal on a tile's pencil as on the
// calendar trigger — before this only CardDateNav's own trigger drew one, and
// most of this file's buttons and links drew nothing at all beyond the
// browser default, which several of them had already suppressed with
// `outline-none` on a parent. `--card-paper` is the offset colour on every
// caller regardless of which card surface (paper, paper-back, section) it
// actually sits on — those three are all near-white cream tones close enough
// that the 2px gap between the control and the ring never reads as a colour
// mismatch, and one constant here is worth more than three that would have to
// agree with whatever background a caller happens to be on.
export const cardFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--card-bleu)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-paper)]";

// The shared treatment for "there is nothing here yet" and "nothing matches",
// on both the student shelf and the admin's Pages/Students lists. Before this
// the admin's own empty and no-match lines were --color-ink-muted in the
// admin's sans body font while the student shelf's were --card-moss italic
// serif — two forms for the same message, which is exactly the
// each-surface-invents-its-own problem this task exists to close. The
// student shelf's version already looked like this; the admin caught up to
// it rather than the other way around, following Task I's own rule that a
// page Jenn looks at should read the way her students' does.
export const emptyStateText =
  "text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]";

// The shared treatment for a form's `role="alert"` failure line — every one
// of them already agreed on `text-sm text-[var(--card-rouge)]`, which is what
// made the handful that had drifted (a stray `mt-4`, one missing
// `text-center`) visible as drift rather than as different designs. One
// constant is what keeps the next one from drifting too.
export const formErrorText = "text-center text-sm text-[var(--card-rouge)]";

// The small caps label above a panel in the admin editor — "Front", "Back",
// "As the student sees it". Lives here rather than in CardEditor because the
// preview needs it too.
export const panelLabel =
  "mb-2 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";

// Both page lists — the student's shelf and the admin's Pages tab — share this
// grid so the two stay the same shape. Two columns on a phone rather than one:
// the shelf is opened on phones, and a single column of thumbnails is a longer
// scroll than the row list it replaced, which would make the redesign cost
// something to the people it is for.
export const pageGrid = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

// `overflow-hidden` is not decoration: it is what clips the oversized preview
// frame inside HtmlPreview to the tile.
//
// `has-[a:focus-visible]:ring-2` is what gives the tile a visible focus state
// at all: the title link is stretched over the whole tile with
// `after:absolute after:inset-0` (see PageTile), so the browser's own outline
// draws around the small title text underneath that overlay rather than
// around the card a sighted mouse user would call "the tile" — a keyboard
// user tabbing through the grid would see nothing move. `has()` reaches
// outside the anchor's own box to ring the tile that contains it instead,
// without PageTile needing to know which of its children is the focusable one.
export const pageTileFrame =
  "relative flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] shadow-[var(--card-shadow)] transition-opacity duration-150 hover:opacity-85 motion-reduce:transition-none has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[var(--card-bleu)] has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-[var(--card-paper)]";

// The heading above a run of tiles. A rule runs from the words to the end of
// the row so the sections read as bands across the grid rather than as words
// floating above the first tile.
//
// No top margin here, deliberately. Each heading is the first child of its own
// <section>, so a `first:mt-0` would match every one of them and silently
// remove the gap it was meant to keep. The space between sections belongs to
// their common parent — both lists wrap the run in `pageSectionList`.
export const pageSectionHeading =
  "mb-3 flex items-center gap-3 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--card-bleu)] after:h-px after:flex-1 after:bg-[var(--card-line)]";

// The gap between sections, on the parent rather than on each heading, so it
// cannot depend on where a heading sits inside its own wrapper.
export const pageSectionList = "space-y-8";

// The round icon button in a tile's action slot — the pencil and download on a
// page, the invite/reset/delete on a student. Here rather than local to one list
// because two lists render it and a second copy is a second thing to keep in
// step.
//
// 36px, not the 44px WCAG minimum: this same class renders three icons in a
// row (pencil, pin, delete) inside a page tile's footer, and a tile is as
// narrow as ~140px on a two-column phone grid — three real 44px boxes plus
// two gaps would not fit under the tile that holds them. 36px is the largest
// square that still leaves the row room to breathe at that width; on
// GroupList's roomier row tiles the same class has space to spare, but it
// stays one constant rather than two so the pencil, the pin and the delete
// icon are recognisably the same control on both screens. Compare
// CardDateNav's day dots and StudentAuthPanel's text links, which sit alone
// rather than three-across and do reach the full 44px hit box.
export const tileActionClass =
  "flex h-9 w-9 items-center justify-center rounded-full text-[var(--card-bleu)] transition-colors duration-150 hover:bg-[var(--card-bleu-soft)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--card-bleu)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-paper)]";

// The audience picker's pill — a visually-hidden checkbox wrapped in a label —
// duplicated identically in AddLinkForm, NewPageForm and PageEditor before
// this existed. One constant is one place to recolour instead of three, which
// is exactly what Wave 4 (Task I) needed: the unchecked chip now reads as the
// card palette's paper and line rather than the admin's flatter field colours,
// while a checked chip keeps the lilac accent — the rule Task I applies
// everywhere in the admin is that a control marking a live SELECTION stays
// accent-coloured, and only its surrounding chrome moves to card tokens.
export const audiencePill =
  "cursor-pointer rounded-full border px-4 py-2 text-sm font-normal transition-colors duration-150 motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)]/40";

export const audiencePillChecked =
  "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--card-ink)]";

export const audiencePillUnchecked =
  "border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--color-ink-muted)]";

// Layered onto Input/Textarea's shared `fieldClassName` (components/ui/field.ts)
// via cn, which twMerge dedupes against — the conflicting border/bg/text
// utilities collapse to whichever is listed last, so this wins without editing
// field.ts itself. That file stays untouched deliberately: it also renders
// /login's passkey form, which Wave 4's own scope note leaves alone, and
// editing it would recolour that page as a side effect of this one.
export const cardFieldSkin =
  "border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--card-ink)] placeholder:text-[var(--color-ink-muted)]/60";
