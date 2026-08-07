"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// "Choose at least one student." under a submit button that is shut because
// nobody is ticked. One component for all three audience forms — PageEditor,
// NewPageForm, AddLinkForm — because they now share one rule
// (`hasAudienceSelection`) and three copies of its message would drift.
//
// It takes the resolved STRING, not a locale. That is safe and is not the
// boundary CLAUDE.md warns about: every caller is already a client component
// holding `strings`, so this is ordinary in-browser composition rather than a
// value crossing the RSC seam. What must never cross is the whole `Strings`
// object from a *server* component, because it holds functions.
export function AudienceRequiredNotice({
  show,
  label,
}: {
  show: boolean;
  label: string;
}) {
  // framer-motion does NOT read prefers-reduced-motion by itself — the
  // `motion-reduce:` utilities elsewhere in this codebase are CSS and reach
  // none of this. Asking for it and zeroing the duration is the equivalent.
  const reduceMotion = useReducedMotion();

  return (
    // AnimatePresence so it animates OUT as well as in: the message earns its
    // keep by leaving the moment she ticks somebody, which is the feedback
    // that the tick was what the form wanted.
    <AnimatePresence initial={false}>
      {show && (
        <motion.p
          // Not role="alert". This is the standing condition of a disabled
          // button, not a failure that just happened — an alert would
          // interrupt a screen reader on every tick and untick. The button's
          // own `disabled` is what carries the state, and aria-describedby on
          // the caller's side would need an id this component does not own.
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.24,
            ease: [0.4, 0.15, 0.2, 1],
          }}
          // overflow-hidden is required by the height animation and is safe
          // here, unlike in FilterDisclosure: nothing below this depends on a
          // margin collapsing through it.
          className="overflow-hidden text-center text-sm text-[var(--color-ink-muted)]"
        >
          {label}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
