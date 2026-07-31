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
export const pageTileFrame =
  "relative flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] shadow-[var(--card-shadow)] transition-opacity hover:opacity-85";
