"use client";

import { useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
// There is no "Filtrer par :" caption beside the icon any more. It appeared
// only while the panel was open, so it named controls that were already on
// screen and labelled themselves — and being conditional it made the icon jump
// sideways on every press, which read as the button moving away from the
// pointer. The button's own aria-label carries the meaning for a screen reader
// and always did.
export function FilterDisclosure({
  toggleLabel,
  activeLabel,
  active,
  children,
}: {
  toggleLabel: string;
  activeLabel: string;
  active: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // framer-motion does NOT read prefers-reduced-motion by itself — the
  // `motion-reduce:` utilities elsewhere in this codebase are CSS and reach
  // none of this. Asking for it and zeroing the duration is the equivalent.
  const reduceMotion = useReducedMotion();

  return (
    // The 20px gap below this wrapper, in both states, is `mb-5` collapsing
    // with `KindFilter`/`SortFilter`'s own `mb-5` through the plain `mt-3`
    // panel div between them — nothing here has padding, a border, or a new
    // formatting context to stop that collapse. Give this div, the panel div,
    // or either filter a border or a flex/grid display and the gap silently
    // doubles to 40px.
    <div className="mb-5">
      <div className="flex items-center justify-center gap-2">
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
        {/* The chips fade and settle down into place rather than being there
            already on the frame after the press. Mounted only while open, so
            the entrance replays each time it is reopened; the div above keeps
            the id and the `hidden`, so the aria-controls contract is untouched
            and the closed state is byte-for-byte what it was.

            OPACITY AND TRANSFORM ONLY. NOT height. The 20px gap under this
            whole component is the wrapper's `mb-5` collapsing with
            KindFilter/SortFilter's own `mb-5` straight through these two plain
            divs — see the wrapper's comment. Animating height needs
            `overflow-hidden`, which establishes a block formatting context and
            stops that collapse dead, silently doubling the gap to 40px.
            Neither opacity nor transform creates one. */}
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.24,
              ease: [0.4, 0.15, 0.2, 1],
            }}
          >
            {children}
          </motion.div>
        )}
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
