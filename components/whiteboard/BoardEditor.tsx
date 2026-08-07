"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE,
  boardHasContent,
  dropTrailingEmptyPages,
  foldOps,
  type Colour,
  type DrawOp,
  type Op,
} from "@/lib/whiteboard-ops";
import { navigationTarget, shouldGuardNavigation } from "@/lib/leave-guard";
import { LeaveBoardDialog } from "@/components/whiteboard/LeaveBoardDialog";
import {
  caretIndexInText,
  hitTest,
  opBounds,
  TOLERANCE,
  type TextMeasureStyle,
} from "@/lib/whiteboard-hit";
import {
  ERASE_STEP,
  idsAlongErasePath,
  undoLength,
} from "@/lib/whiteboard-erase";
import { toLogical, type Box } from "@/lib/whiteboard-geometry";
import { reviseOp, stepTextSize, type Revision } from "@/lib/whiteboard-revise";
import { pointerDownIntent } from "@/lib/whiteboard-tools";
import { BoardToolbar, type Tool } from "@/components/whiteboard/BoardToolbar";
import { TextLayer, type TextDraft } from "@/components/whiteboard/TextLayer";
import { TextStylePopover } from "@/components/whiteboard/TextStylePopover";
import {
  BOARD_PAPER,
  BoardCanvas,
  drawOps,
  textFont,
} from "@/components/whiteboard/BoardCanvas";

const THUMBNAIL_WIDTH = 320;

// hitTest and opBounds are pure and take a measurer; this is the real one.
// One detached canvas for the module rather than one per editor mount, because
// creating one per hit test would allocate on every mouse move — and because a
// measuring cache is not component state, so holding it in a ref would mean
// reading a ref during render to draw the selection outline.
let scratch: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number, style?: TextMeasureStyle): number {
  if (!scratch) {
    scratch = document.createElement("canvas").getContext("2d");
  }
  if (!scratch) return text.length * size * 0.5; // rough, but never NaN
  // textFont, not a hand-rolled string here: a bold element's hit box has to
  // widen by the SAME amount drawOps actually draws it wider by, and the only
  // way to guarantee that is one function building the font string for both.
  scratch.font = textFont(size, style);
  const context = scratch;
  return Math.max(
    ...text.split("\n").map((line) => context.measureText(line).width),
  );
}

let counter = 0;
// crypto.randomUUID is fine here, but a short monotonic id keeps the payload
// small and these only need to be unique within one board.
const nextId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

export function BoardEditor({
  slug,
  onSaved,
  onCancel,
}: {
  slug: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [ops, setOps] = useState<Op[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState<Colour>(PALETTE[0]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState(false);

  const router = useRouter();

  // The href she clicked, held while the dialog asks what to do about it. Null
  // means no dialog.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  // Set once she has answered, so neither listener below fires again for a
  // decision she has already made. A ref rather than state: the listeners read
  // it during an event, not during a render.
  const leaving = useRef(false);

  // Opened once, on mount. A failure here is not fatal: she can still draw and
  // save, the student simply will not watch it happen — which is exactly what
  // Part 1 was.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/whiteboard/${slug}/open`, { method: "POST" }).then(
      (response) => {
        if (!cancelled && !response.ok) setLiveError(true);
      },
      () => {
        if (!cancelled) setLiveError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Mirrors of the drawing state, so the flush timer always reads current
  // values without being torn down and rebuilt on every stroke.
  const opsRef = useRef<Op[]>([]);
  const pageRef = useRef(0);
  const pendingRef = useRef<DrawOp | null>(null);
  const flushed = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // At most one request every 150ms. Committed ops go in `ops` and append on
  // the viewer; the stroke under her cursor goes in `pending` and REPLACES the
  // viewer's copy, which is what makes a long line grow rather than duplicate.
  // Worst case is roughly seven requests a second — fine for one teacher and one
  // student, and the ops route does no database round trip per call.
  function flushSoon() {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;

      // undo() shortens the log rather than appending a remove, so the high
      // water mark can end up past the end of it. Left unclamped, the slice
      // below would come back empty for the next stroke too and the student
      // would silently miss one. The undone op itself stays on their screen
      // until the board is saved — the live view is best effort, and what
      // /finish stores is the client's log either way.
      flushed.current = Math.min(flushed.current, opsRef.current.length);

      const committed = opsRef.current.slice(flushed.current);
      const inProgress = pendingRef.current;
      if (committed.length === 0 && !inProgress) return;

      const sent = committed.length;
      flushed.current += sent;

      void fetch(`/api/whiteboard/${slug}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ops: committed,
          pending: inProgress,
          currentPage: pageRef.current,
        }),
      }).catch(() => {
        // Rewind so the next flush retries them. Her local log is untouched, so
        // the saved board is correct whether or not this ever succeeds.
        flushed.current -= sent;
      });
    }, 150);
  }

  useEffect(() => {
    opsRef.current = ops;
    pageRef.current = page;
    flushSoon();
    // flushSoon only reads refs, so it is stable and needs no dependency entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, page]);

  const surface = useRef<HTMLDivElement | null>(null);
  const drawing = useRef<number[] | null>(null);
  const [preview, setPreview] = useState<number[] | null>(null);

  // The eraser's own drag state. `erasing` is the last point sampled — set on
  // pointer-down, advanced on every pointer-move, cleared on pointer-up — so
  // each move only has to walk the segment since the last one. `erased` is
  // every id this gesture has removed so far, so a path that loops back over
  // itself does not send a second remove naming an id that is already gone.
  // Neither is component state: they change on every pointer-move and a
  // render does not need to know their value directly, only the ops it caused.
  const erasing = useRef<[number, number] | null>(null);
  const erased = useRef<Set<string>>(new Set());
  // Where the current erase drag started in the log, and where it ended, so
  // one press of Undo answers one sweep rather than one dab of it. Read only
  // in handlers, never during render — `react-hooks/refs` forbids the latter.
  const eraseGesture = useRef<{ start: number; end: number } | null>(null);
  // Purely visual — where to draw the "what this will take" circle. Null
  // hides it, including whenever the pointer is not over the surface at all.
  const [eraserAt, setEraserAt] = useState<[number, number] | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<TextDraft | null>(null);
  // The surface's rect, captured when a draft opens rather than read during
  // render: TextLayer positions itself from it, and the element's geometry is
  // only knowable in an event handler. A resize mid-typing leaves it stale
  // until the draft commits, which is a transient state and not worth a
  // listener.
  const [draftBox, setDraftBox] = useState<Box | null>(null);
  const dragFrom = useRef<[number, number] | null>(null);
  const [dragBy, setDragBy] = useState<[number, number] | null>(null);

  const scene = foldOps(ops);
  const visible = scene[page] ?? [];

  // The same question save() asks. Shared rather than re-expressed, so the
  // dialog can never appear for a board whose save would refuse it as empty.
  const dirty = boardHasContent(ops);

  function boxOf(): Box {
    const rect = surface.current?.getBoundingClientRect();
    return rect ?? { left: 0, top: 0, width: 0, height: 0 };
  }

  // Takes the two fields it needs rather than a React.PointerEvent, because
  // onDoubleClick hands back a MouseEvent and the two do not unify.
  function pointer(event: { clientX: number; clientY: number }): [number, number] {
    return toLogical(boxOf(), event.clientX, event.clientY);
  }

  function append(op: Op) {
    setOps((current) => [...current, op]);
  }

  function revise(id: string, change: Revision) {
    const target = visible.find((op) => op.id === id);
    if (!target) return;
    const newId = nextId();
    const [remove, next] = reviseOp(target, change, newId);
    setOps((current) => [...current, remove, next]);
    // A revised element is a NEW element as far as the log is concerned, so the
    // selection has to follow or the next edit would target a removed op.
    setSelected(newId);
  }

  function handlePointerDown(event: React.PointerEvent) {
    const intent = pointerDownIntent({
      tool,
      hasDraft: draft !== null,
      saving,
    });

    if (intent.action === "ignore") return;

    // Order matters. preventDefault suppresses the compatibility mouse events,
    // and it has to happen before anything that can trigger a re-render.
    if (intent.preventsDefault) event.preventDefault();
    if (intent.capturesPointer) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const [x, y] = pointer(event);

    switch (intent.action) {
      case "select": {
        const id = hitTest(visible, x, y, measure);
        setSelected(id);
        if (id) dragFrom.current = [x, y];
        return;
      }
      case "open-text": {
        setDraftBox(boxOf());
        setDraft({
          x,
          y,
          value: "",
          colour,
          size: 44,
          bold: false,
          italic: false,
          underline: false,
          editing: null,
          // Nothing to be "near" in an empty box — see TextDraft's comment.
          caret: null,
        });
        return;
      }
      case "erase": {
        // A fresh gesture: nothing erased yet, and the first sample is this
        // point against itself — erasePath's zero-length case — so a click
        // with no drag still erases exactly what it lands on.
        erased.current = new Set();
        erasing.current = [x, y];
        // Opened here and closed on every append below, so Undo can treat the
        // whole sweep as the one action the reader performed.
        eraseGesture.current = { start: ops.length, end: ops.length };
        const found = idsAlongErasePath(visible, [x, y], [x, y], ERASE_STEP, measure, erased.current);
        if (found.length > 0) {
          for (const id of found) erased.current.add(id);
          append({ id: nextId(), page, kind: "remove", targets: found });
          if (eraseGesture.current) eraseGesture.current.end = ops.length + 1;
        }
        return;
      }
      case "start-stroke": {
        drawing.current = [x, y];
        setPreview([x, y]);
        return;
      }
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (tool === "select") {
      if (!dragFrom.current) return;
      const [x, y] = pointer(event);
      setDragBy([x - dragFrom.current[0], y - dragFrom.current[1]]);
      return;
    }

    if (tool === "eraser") {
      const [x, y] = pointer(event);
      setEraserAt([x, y]);
      if (!erasing.current) return; // hovering, not dragging

      // Walk from where the last move (or the pointer-down) left off, not
      // from wherever this event landed — a fast drag delivers events tens of
      // logical units apart, and testing only the endpoints would let an
      // element sitting between two of them survive untouched.
      const found = idsAlongErasePath(
        visible,
        erasing.current,
        [x, y],
        ERASE_STEP,
        measure,
        erased.current,
      );
      erasing.current = [x, y];
      if (found.length === 0) return;

      for (const id of found) erased.current.add(id);
      // The sweep grows by one op, and Undo tracks its far end so a single
      // press answers the whole gesture — see undoLength.
      if (eraseGesture.current) eraseGesture.current.end = ops.length + 1;
      // Appended now, not batched to pointer-up: the live viewer should see
      // the board being cleaned as the gesture happens, the same as a stroke
      // growing under her cursor. flushSoon (above, triggered by the ops/page
      // effect) already coalesces everything appended within a 150ms window
      // into one request, so this costs no more traffic than emitting at the
      // end would.
      append({ id: nextId(), page, kind: "remove", targets: found });
      return;
    }

    if (!drawing.current) return;
    const [x, y] = pointer(event);

    if (tool === "arrow") {
      // An arrow is two points, so the preview replaces rather than extends.
      setPreview([drawing.current[0], drawing.current[1], x, y]);
      pendingRef.current = {
        id: "pending",
        page,
        kind: "arrow",
        x1: drawing.current[0],
        y1: drawing.current[1],
        x2: x,
        y2: y,
        colour,
      };
      flushSoon();
      return;
    }

    drawing.current.push(x, y);
    setPreview([...drawing.current]);
    pendingRef.current = {
      id: "pending",
      page,
      kind: "stroke",
      points: [...drawing.current],
      colour,
      width: 5,
    };
    flushSoon();
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (tool === "select") {
      const offset = dragBy;
      dragFrom.current = null;
      setDragBy(null);
      // A click without movement is a selection, not a zero-length move — and
      // a move of nothing would still cost two ops in the log.
      if (selected && offset && (Math.abs(offset[0]) > 2 || Math.abs(offset[1]) > 2)) {
        revise(selected, { dx: offset[0], dy: offset[1] });
      }
      return;
    }

    if (tool === "eraser") {
      // The gesture is over; the next pointer-down starts a new one with its
      // own fresh `erased` set. Leaving these set would make the NEXT drag's
      // first segment think it started from wherever this one ended.
      erasing.current = null;
      return;
    }

    if (!drawing.current) return;
    const [x, y] = pointer(event);
    const started = drawing.current;
    drawing.current = null;
    setPreview(null);

    // The append below puts the finished stroke in the log; the server clears
    // `pending` for us the moment a committed op arrives, so there is nothing
    // to retract and no id to reconcile.
    pendingRef.current = null;

    if (tool === "arrow") {
      append({
        id: nextId(),
        page,
        kind: "arrow",
        x1: started[0],
        y1: started[1],
        x2: x,
        y2: y,
        colour,
      });
      return;
    }

    append({
      id: nextId(),
      page,
      kind: "stroke",
      points: [...started, x, y],
      colour,
      width: 5,
    });
  }

  // Double-click a text element to retype it. MouseEvent, not PointerEvent —
  // that is what onDoubleClick provides. Select only: in pen mode a double
  // click has already drawn two dots, and opening an editor over them is not
  // what she asked for.
  function handleDoubleClick(event: React.MouseEvent) {
    if (tool !== "select") return;
    const [x, y] = pointer(event);
    const id = hitTest(visible, x, y, measure);
    const target = visible.find((op) => op.id === id);
    if (!target || target.kind !== "text") return;
    setSelected(id);
    setDraftBox(boxOf());
    // Where inside the text the double-click actually landed, so reopening an
    // element is a real edit — caret near the word she clicked — rather than
    // always jumping to the end. See caretIndexInText's comment.
    const caret = caretIndexInText(
      target.text,
      target.size,
      { bold: target.bold, italic: target.italic },
      x - target.x,
      y - target.y,
      measure,
    );
    setDraft({
      x: target.x,
      y: target.y,
      value: target.text,
      colour: target.colour,
      size: target.size,
      bold: Boolean(target.bold),
      italic: Boolean(target.italic),
      underline: Boolean(target.underline),
      editing: target.id,
      caret,
    });
  }

  // The popover's buttons and the textarea's own Cmd/Ctrl+B/I/U both call
  // this. It only ever touches the open draft's state — never focus — which
  // is what lets both paths leave the textarea's caret and selection alone.
  function toggleDraftStyle(style: "bold" | "italic" | "underline") {
    setDraft((current) => (current ? { ...current, [style]: !current[style] } : current));
  }

  function commitDraft() {
    if (!draft) return;
    const value = draft.value.trim();
    const editing = draft.editing;
    const { bold, italic, underline } = draft;
    setDraft(null);

    if (value.length === 0) {
      // An empty draft over an existing element deletes it — the same thing
      // selecting it and pressing Delete would do, and what she means by
      // clearing the box.
      if (editing) append({ id: nextId(), page, kind: "remove", targets: [editing] });
      return;
    }

    if (editing) {
      revise(editing, { text: value, bold, italic, underline });
      return;
    }

    const id = nextId();
    append({
      id,
      page,
      kind: "text",
      x: draft.x,
      y: draft.y,
      text: value,
      colour: draft.colour,
      size: draft.size,
      bold,
      italic,
      underline,
    });
    setSelected(id);
  }

  function handleColour(next: Colour) {
    // With something selected the swatch recolours it; with nothing selected it
    // arms the next thing drawn. Two behaviours, one control, because that is
    // what every drawing tool does and what she will expect.
    if (selected) {
      revise(selected, { colour: next });
      return;
    }
    setColour(next);
  }

  function undo() {
    setOps((current) => {
      const next = current.slice(0, undoLength(current.length, eraseGesture.current));
      // Spent. Pressing Undo twice must not take the same sweep back a second
      // time and eat whatever came before it.
      eraseGesture.current = null;
      return next;
    });
  }

  function clearPage() {
    const targets = visible.map((op) => op.id);
    if (targets.length === 0) return;
    append({ id: nextId(), page, kind: "remove", targets });
  }

  function addPage() {
    setPageCount((count) => count + 1);
    setPage(pageCount);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Not while typing: Backspace in the textarea must delete a character.
      if (draft) return;
      if (!selected) return;
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      event.preventDefault();
      setOps((current) => [
        ...current,
        { id: nextId(), page, kind: "remove", targets: [selected] },
      ]);
      setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, draft, page]);

  // A capture-phase listener on the document, rather than a guard that the tab
  // strip and the back-to-admin link opt into.
  //
  // Those two are not the only anchors on this page and they will not be the
  // last. A guard you have to remember to wire is one a future link will not
  // have, and the failure is a lost lesson with no error — the same shape of
  // risk chatRole's comment describes about a rule duplicated across two files.
  // Catching an anchor that did not need guarding costs one dialog; missing one
  // costs a board.
  //
  // Capture phase specifically, so this runs before next/link's own handler and
  // can preventDefault the navigation it was about to perform.
  useEffect(() => {
    if (!dirty) return;

    function onClick(event: MouseEvent) {
      if (leaving.current) return;

      const node = event.target;
      if (!(node instanceof Element)) return;
      const anchor = node.closest("a");
      // An SVG <a> is also matched by that selector and is not what we mean.
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (
        !shouldGuardNavigation({
          // The resolved absolute form. getAttribute("href") would give a
          // relative string and every comparison in the rule would be false.
          href: anchor.href || null,
          target: anchor.target || null,
          download: anchor.hasAttribute("download"),
          modified:
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0,
          currentUrl: window.location.href,
        })
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      // Any stale save error belongs to the last attempt, not to this question.
      setError(null);
      setLeavingTo(anchor.href);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  // The browser's own prompt for closing or reloading the tab. Its wording is
  // the browser's and cannot be replaced, which is exactly why the in-app
  // dialog above exists rather than relying on this alone.
  //
  // Installed only while there is something to lose: a prompt on an empty board
  // teaches her to dismiss prompts.
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
      // Deprecated, and still what some browsers require before they will show
      // the prompt at all.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Frees the server's live-board slot when the page really does go away.
  //
  // NOT gated on `dirty`, and the difference from the two effects above is the
  // whole point of this one. They ask about CONTENT, which an empty board has
  // none of. This frees a SLOT, which an empty board occupies just as fully:
  // liveBoards.open() returns false when one is already open for the group and
  // /api/whiteboard/[slug]/open turns that into a 409, so a board abandoned
  // without a discard makes her NEXT board for this student open with the live
  // view already broken — "Diffusion en direct indisponible" — for the life of
  // the process.
  //
  // pagehide rather than beforeunload: beforeunload fires BEFORE she has
  // answered the prompt, and discarding a board she then chose to keep is the
  // exact failure this guard exists to prevent.
  //
  // A discard after a successful /finish is harmless — liveBoards.discard is
  // documented tolerant of a group with no board, and the student's client
  // treats "saved" and "closed" the same way.
  useEffect(() => {
    function onPageHide(event: PageTransitionEvent) {
      // Going into the back/forward cache, not away. The page may come back to
      // a board that is still hers.
      if (event.persisted) return;

      const url = `/api/whiteboard/${slug}/discard`;
      // sendBeacon is specified to outlive the document; fetch is not. The
      // route reads nothing from the request body, so a bodyless POST is a
      // valid call to it.
      if (navigator.sendBeacon) navigator.sendBeacon(url);
      else void fetch(url, { method: "POST", keepalive: true });
    }

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [slug]);

  function discard() {
    void fetch(`/api/whiteboard/${slug}/discard`, { method: "POST" });
  }

  // Returns whether the board is now stored, rather than calling onSaved itself.
  // The leave dialog needs to save and then NAVIGATE, and onSaved returns her to
  // the archive on this page — which is not where she was going.
  //
  // `saving` is deliberately not reset on success: either onSaved or a
  // navigation unmounts this component, and clearing it first would flash the
  // button back to "Terminé" on the way out.
  async function persist(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      if (!boardHasContent(ops)) {
        setError("Le tableau est vide.");
        setSaving(false);
        return false;
      }

      const kept = dropTrailingEmptyPages(foldOps(ops));
      const response = await fetch(`/api/whiteboard/${slug}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, thumbnail: renderThumbnail(kept[0]) }),
      });
      if (!response.ok) throw new Error("save failed");
      return true;
    } catch {
      // The log is still in state, so she can press Terminé again rather than
      // losing the board.
      setError("Échec de l'enregistrement. Réessayez.");
      setSaving(false);
      return false;
    }
  }

  async function save() {
    if (await persist()) onSaved();
  }

  // Both listeners are off from here. Without this an external location.assign
  // would immediately hit beforeunload and ask her the same question twice.
  function navigate(href: string) {
    leaving.current = true;
    const target = navigationTarget(href, window.location.origin);
    if (target.kind === "internal") router.push(target.path);
    else window.location.assign(target.href);
  }

  async function saveAndLeave(href: string) {
    if (await persist()) navigate(href);
  }

  const selectedOp = selected ? visible.find((op) => op.id === selected) : undefined;
  const selectedBounds = selectedOp ? opBounds(selectedOp, measure) : null;
  // Narrowed once here rather than at each of the toolbar's two call sites
  // (the size prop and the step handler), so both agree by construction about
  // what "a text element is selected" means.
  const selectedTextOp = selectedOp?.kind === "text" ? selectedOp : null;

  return (
    // The floating card: --card-paper against the page's own ground, with
    // --card-shadow lifting it off — "Google Docs" here means the board reads
    // as a surface sitting ON the page, not flush with it. Both are existing
    // flashcard tokens; nothing new was added to app/globals.css for this.
    <div className="mx-auto w-full max-w-[1100px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper)] p-3 shadow-[var(--card-shadow)] sm:p-5">
      <BoardToolbar
        tool={tool}
        colour={colour}
        hasSelection={selected !== null}
        textSize={selectedTextOp?.size ?? null}
        saving={saving}
        onTool={(next) => {
          setTool(next);
          // Leaving select mode drops the selection, so its outline and size
          // controls do not linger over a tool that cannot act on them.
          if (next !== "select") setSelected(null);
        }}
        onColour={handleColour}
        onUndo={undo}
        onClearPage={clearPage}
        onStepTextSize={(direction) => {
          if (!selectedTextOp) return;
          revise(selectedTextOp.id, { size: stepTextSize(selectedTextOp.size, direction) });
        }}
        onAddPage={addPage}
        onSave={save}
        onDiscard={() => {
          discard();
          onCancel();
        }}
      />

      <div
        ref={surface}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        // Purely cosmetic: hides the "what this will take" circle once the
        // pointer is no longer over the surface, so it does not appear to
        // linger over a stale spot. Erasing itself does not depend on this —
        // pointer capture keeps handlePointerMove firing regardless.
        onPointerLeave={() => setEraserAt(null)}
        onDoubleClick={handleDoubleClick}
        // Without this a drag on a touch screen scrolls the page instead of
        // drawing, and the stroke is lost.
        style={{ touchAction: "none", aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
        className={`relative w-full overflow-hidden rounded-xl border border-[var(--card-line)] bg-[var(--card-paper-back)] ${
          tool === "select"
            ? "cursor-default"
            : // The eraser draws its own circle below in place of a system
              // cursor — this is the one tool with no other trace of what it
              // is about to do, and a crosshair would say nothing about reach.
              tool === "eraser"
              ? "cursor-none"
              : "cursor-crosshair"
        }`}
      >
        <BoardCanvas
          ops={
            dragBy && selectedOp
              ? visible.filter((op) => op.id !== selectedOp.id)
              : visible
          }
          className="absolute inset-0 h-full w-full"
        />
        {dragBy && selectedOp && (
          <BoardCanvas
            background={null}
            className="absolute inset-0 h-full w-full"
            ops={[reviseOp(selectedOp, { dx: dragBy[0], dy: dragBy[1] }, "drag")[1]]}
          />
        )}
        {preview && (
          <BoardCanvas
            className="absolute inset-0 h-full w-full"
            // Transparent, or this overlay would hide the committed ops below.
            background={null}
            ops={[
              tool === "arrow" && preview.length === 4
                ? {
                    id: "preview",
                    page,
                    kind: "arrow",
                    x1: preview[0],
                    y1: preview[1],
                    x2: preview[2],
                    y2: preview[3],
                    colour,
                  }
                : {
                    id: "preview",
                    page,
                    kind: "stroke",
                    points: preview,
                    colour,
                    width: 5,
                  },
            ]}
          />
        )}
        {tool === "eraser" && eraserAt && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${(eraserAt[0] / BOARD_WIDTH) * 100}%`,
              top: `${(eraserAt[1] / BOARD_HEIGHT) * 100}%`,
              // Percentages of BOARD_WIDTH and BOARD_HEIGHT separately, the
              // same trick selectedBounds below uses — the surface's own
              // aspect-ratio CSS keeps those two scale factors equal, which
              // is what keeps this a circle rather than an ellipse.
              width: `${((TOLERANCE * 2) / BOARD_WIDTH) * 100}%`,
              height: `${((TOLERANCE * 2) / BOARD_HEIGHT) * 100}%`,
              transform: "translate(-50%, -50%)",
              borderRadius: "9999px",
              border: "2px solid var(--card-ink)",
              background: "rgb(31 42 46 / 0.08)",
              pointerEvents: "none",
            }}
          />
        )}
        {selectedBounds && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${(selectedBounds.x / BOARD_WIDTH) * 100}%`,
              top: `${(selectedBounds.y / BOARD_HEIGHT) * 100}%`,
              width: `${(selectedBounds.width / BOARD_WIDTH) * 100}%`,
              height: `${(selectedBounds.height / BOARD_HEIGHT) * 100}%`,
              // Percentages rather than pixels so the outline tracks the element
              // through a window resize without a listener.
              outline: "2px dashed var(--card-bleu)",
              outlineOffset: 4,
              pointerEvents: "none",
            }}
          />
        )}
        {draft && draftBox && (
          <>
            <TextLayer
              draft={draft}
              box={draftBox}
              onChange={(value) => setDraft({ ...draft, value })}
              onCommit={commitDraft}
              onCancel={() => setDraft(null)}
              onToggleStyle={toggleDraftStyle}
            />
            {/* Renders only while a draft is open — there is nothing for it
                to apply to otherwise. */}
            <TextStylePopover draft={draft} box={draftBox} onToggle={toggleDraftStyle} />
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-full border border-[var(--card-line)] px-3 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            Page {page + 1} / {pageCount}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1} className="rounded-full border border-[var(--card-line)] px-3 py-1 disabled:opacity-40">
            ›
          </button>
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-[var(--card-rouge)]">{error}</span>}
          {liveError && (
            <span className="text-sm text-[var(--card-moss)]">
              Diffusion en direct indisponible — le tableau sera visible après
              l&apos;enregistrement.
            </span>
          )}
        </div>
      </div>

      {leavingTo && (
        <LeaveBoardDialog
          saving={saving}
          error={error}
          onSave={() => void saveAndLeave(leavingTo)}
          onDiscard={() => {
            discard();
            navigate(leavingTo);
          }}
          onCancel={() => setLeavingTo(null)}
        />
      )}
    </div>
  );
}

// Page 1 at a small size. Rendered here because there is no server-side canvas
// and adding one would mean a native dependency; the route validates what
// arrives.
function renderThumbnail(ops: ReturnType<typeof foldOps>[number]): string {
  const scale = THUMBNAIL_WIDTH / BOARD_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = Math.round(BOARD_HEIGHT * scale);

  const context = canvas.getContext("2d");
  if (!context) return "";

  context.fillStyle = BOARD_PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  drawOps(context, ops);

  // JPEG rather than PNG, and 0.7 rather than lossless: this is a 320px preview
  // stored in SQLite for every board, and the route caps it at 64k characters.
  return canvas.toDataURL("image/jpeg", 0.7);
}
