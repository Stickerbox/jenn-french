"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";

// The shelf's chip rows, closed by default. Three stacked control rows above
// the tiles was most of a phone's first screen, sitting above the files the
// student opened the tab to reach.
//
// THE DOT IS THE PART THAT MATTERS. A filtered list is a short list, and with
// the controls hidden there is nothing on screen to say why, which reads as a
// fault rather than as a filter. `active` is lib/shelf-filters.ts's answer and
// this component does not compute it: the rule has a test, and a component
// does not.
//
// The open state is local and resets on every load. The filters it holds are
// `useState` in FilesTab and already behave that way, so the disclosure
// follows the controls inside it rather than inventing persistence they do not
// have.
export function FilterDisclosure({
  toggleLabel,
  label,
  activeLabel,
  active,
  children,
}: {
  toggleLabel: string;
  label: string;
  activeLabel: string;
  active: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    // The 20px gap below this wrapper, in both states, is `mb-5` collapsing
    // with `KindFilter`/`SortFilter`'s own `mb-5` through the plain `mt-3`
    // panel div between them — nothing here has padding, a border, or a new
    // formatting context to stop that collapse. Give this div, the panel div,
    // or either filter a border or a flex/grid display and the gap silently
    // doubles to 40px.
    <div className="mb-5">
      <div className="flex items-center justify-center gap-2">
        {open && (
          <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          // ONE label in both states. aria-expanded already carries open or
          // closed, and a label that changed with it would say the same thing
          // twice — announced as "Hide filters, expanded".
          aria-label={toggleLabel}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--card-moss)] transition-colors duration-150 hover:text-[var(--card-ink)] motion-reduce:transition-none",
            open && "border-[var(--card-bleu)] text-[var(--card-bleu)]",
            cardFocusRing,
          )}
        >
          <FilterIcon />
          {!open && active && (
            // The dot is aria-hidden, so the active-filter state reaches a
            // screen reader through the sr-only span beside it instead — the
            // same pattern ConversationList uses for its unread dot. A sighted
            // user reads "something is filtered" at a glance with the panel
            // still closed; without this span a screen reader user would have
            // to open the panel and inspect both chip groups to learn the same
            // thing, a step sighted users never pay.
            <>
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--card-bleu)]"
              />
              <span className="sr-only">{activeLabel}</span>
            </>
          )}
        </button>
      </div>

      {/* `hidden` rather than unmounting, so aria-controls always names an
          element that exists. An id pointing at nothing is worse than a hidden
          panel: it is a promise the button cannot keep. */}
      <div id={panelId} hidden={!open} className="mt-3">
        {children}
      </div>
    </div>
  );
}

// Local to the file that draws it, the same way ShellBar keeps its own back
// arrow and PrintButton its own save glyph, rather than an icon module for a
// handful of one-off shapes.
function FilterIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
