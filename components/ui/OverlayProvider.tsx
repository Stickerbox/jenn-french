"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// How many full-screen-or-modal overlays (AddSheet, ChatPanel) are open right
// now, so the two fixed corner buttons (components/ui/Fab.tsx) can hide
// themselves below `md` rather than paint on top of one. This is UI plumbing —
// a shared counter two components agree on — not a domain rule, so unlike
// everything else with a rule in it, it has no `lib/` module and no unit test;
// noted here so the project convention doesn't read as broken by omission.
type OverlayContextValue = {
  count: number;
  // Registers one open overlay and returns the function that retires it.
  // Returning the unregister function, rather than exposing register/unregister
  // separately, is what lets a single `useEffect(() => register(), [])` do the
  // whole job with no extra state to keep in sync.
  register: () => () => void;
};

// Default value for a Fab that renders outside any OverlayProvider: count 0,
// and a register whose own return value is a no-op, so nothing errors and a
// Fab behaves exactly as it did before this existed.
const OverlayContext = createContext<OverlayContextValue>({
  count: 0,
  register: () => () => {},
});

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  // useCallback keeps this identity stable across the re-render its own
  // setCount call causes, so useOverlayLock's effect (deps: [register]) fires
  // once per mount rather than once per open overlay anywhere on the page.
  const register = useCallback(() => {
    setCount((current) => current + 1);
    return () => setCount((current) => current - 1);
  }, []);

  return (
    <OverlayContext.Provider value={{ count, register }}>
      {children}
    </OverlayContext.Provider>
  );
}

// Called by an overlay for the life of its mount — AddSheet today, ChatPanel
// once Task D1 wires it in.
export function useOverlayLock() {
  const { register } = useContext(OverlayContext);
  useEffect(() => register(), [register]);
}

// Called by Fab to decide whether to hide.
export function useOverlayCount() {
  return useContext(OverlayContext).count;
}
