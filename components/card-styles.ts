export const cardPanel =
  "relative flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] p-8 shadow-[var(--card-shadow)]";

export const cardPanelBack =
  "relative flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper-back)] p-8 shadow-[var(--card-shadow)]";

export const accentBarClass = "absolute inset-y-0 left-0 w-1.5 rounded-l-[14px]";

export const accentBarStyle = {
  background: "linear-gradient(var(--card-bleu), var(--card-or))",
};

export const cardHeaderRow =
  "mb-4 flex items-baseline justify-between border-b border-dashed border-[var(--card-line)] pb-3";

export const cardDateLabel =
  "font-[family-name:var(--card-font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--card-bleu)]";

export const cardSubjectPill =
  "rounded-full bg-[var(--card-bleu-soft)] px-2.5 py-1 font-[family-name:var(--card-font-serif)] text-[11px] uppercase tracking-wide text-[var(--card-bleu)]";

export const cardEyebrow =
  "font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[#a89a7f]";

export const cardSectionHeading =
  "mb-1.5 font-[family-name:var(--card-font-mono)] text-[13px] font-bold uppercase tracking-wider text-[var(--card-rouge)]";

export const cardCodeChip =
  "rounded bg-[#eef3ee] px-1.5 py-0.5 font-[family-name:var(--card-font-mono)] text-[13px] text-[var(--card-moss)]";

export const cardProse =
  "whitespace-pre-line text-[15px] leading-relaxed text-[var(--card-ink)]";

// The small caps label above a panel in the admin editor — "Front", "Back",
// "As the student sees it". Lives here rather than in CardEditor because the
// preview needs it too.
export const panelLabel =
  "mb-2 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";
