"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  Eraser,
  FilePlus2,
  MousePointer2,
  Pencil,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { PALETTE, type Colour } from "@/lib/whiteboard-ops";
import type { Tool } from "@/lib/whiteboard-tools";

// Re-exported so BoardEditor's existing import keeps working. The union itself
// moved to lib/ because pointerDownIntent is the thing that branches on it.
export type { Tool };

const TOOLS: { tool: Tool; label: string; Icon: LucideIcon }[] = [
  { tool: "select", label: "Sélectionner", Icon: MousePointer2 },
  { tool: "pen", label: "Crayon", Icon: Pencil },
  { tool: "text", label: "Texte", Icon: Type },
  { tool: "arrow", label: "Flèche", Icon: ArrowUpRight },
  { tool: "eraser", label: "Gomme", Icon: Eraser },
];

// A thin vertical rule between groups — tools, colour, size, actions — so the
// toolbar reads as sections rather than one undifferentiated row of buttons.
function Divider() {
  return (
    <span aria-hidden="true" className="mx-1 h-7 w-px shrink-0 self-center bg-[var(--card-line)]" />
  );
}

// Icon-only controls need both: aria-label for a screen reader, title for a
// hover tooltip. Without them this toolbar is usable only by whoever wrote it.
//
// The selected state is a soft filled rounded-square behind the icon, not a
// border swap — a border appearing and disappearing reflows neighbouring
// buttons by its own width, which a background fill does not.
//
// h-11 w-11 (44px) is the hit box CLAUDE.md's conventions require; the icon
// inside stays 18px, so the box is bigger than the glyph rather than the
// glyph growing to fill it.
function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-40 ${
        active
          ? "bg-[var(--card-bleu-soft)] text-[var(--card-bleu)]"
          : "text-[var(--card-moss)] hover:bg-[var(--card-section)]"
      }`}
    >
      {children}
    </button>
  );
}

// A− / A+ share IconButton's box and hover behaviour but carry text rather
// than a glyph, so they get their own thin wrapper instead of forcing
// IconButton's `children: ReactNode` to double as a font-size switch.
function SizeButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] transition-colors motion-reduce:transition-none hover:bg-[var(--card-section)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function BoardToolbar({
  tool,
  colour,
  hasSelection,
  // The selected text element's current size, or null when nothing selected
  // is text. Gates the whole size group: there is nothing for A−/A+ to act
  // on otherwise, and showing them disabled all the time would waste the
  // toolbar's width on a control that is inert far more often than not.
  textSize,
  saving,
  onTool,
  onColour,
  onUndo,
  onClearPage,
  onStepTextSize,
  onAddPage,
  onSave,
  onDiscard,
}: {
  tool: Tool;
  colour: Colour;
  hasSelection: boolean;
  textSize: number | null;
  saving: boolean;
  onTool: (tool: Tool) => void;
  onColour: (colour: Colour) => void;
  onUndo: () => void;
  onClearPage: () => void;
  onStepTextSize: (direction: 1 | -1) => void;
  onAddPage: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--card-line)] bg-[var(--card-paper)] p-1.5 shadow-[var(--card-shadow)]">
      <div className="flex items-center gap-1">
        {TOOLS.map(({ tool: option, label, Icon }) => (
          <IconButton
            key={option}
            label={label}
            active={tool === option}
            onClick={() => onTool(option)}
          >
            <Icon size={18} aria-hidden="true" />
          </IconButton>
        ))}
      </div>

      <Divider />

      <div className="flex items-center gap-0.5">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onColour(swatch)}
            // The label changes with the selection because the button's effect
            // does: with something selected it recolours that element, without
            // it arms the next one.
            aria-label={
              hasSelection ? "Recolorer la sélection" : "Choisir cette couleur"
            }
            title={hasSelection ? "Recolorer la sélection" : "Couleur"}
            aria-pressed={!hasSelection && colour === swatch}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none hover:bg-[var(--card-section)]"
          >
            <span
              style={{ background: swatch }}
              className={`h-7 w-7 rounded-full transition-transform motion-reduce:transition-none ${
                !hasSelection && colour === swatch
                  ? "ring-2 ring-[var(--card-ink)] ring-offset-2"
                  : ""
              } ${hasSelection ? "hover:scale-110" : ""}`}
            />
          </button>
        ))}
      </div>

      {textSize !== null && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5">
            <SizeButton label="Réduire le texte" onClick={() => onStepTextSize(-1)}>
              A−
            </SizeButton>
            <SizeButton label="Agrandir le texte" onClick={() => onStepTextSize(1)}>
              A+
            </SizeButton>
          </div>
        </>
      )}

      <Divider />

      <div className="flex flex-wrap items-center gap-1">
        <IconButton label="Annuler la dernière action" onClick={onUndo}>
          <Undo2 size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label="Effacer la page" onClick={onClearPage}>
          <Trash2 size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label="Nouvelle page" onClick={onAddPage}>
          <FilePlus2 size={18} aria-hidden="true" />
        </IconButton>

        {/* Save and discard keep their French text rather than becoming
            icon-only glyphs — the two actions that end the lesson deserve a
            word she can read at a glance, not a symbol to learn. */}
        <span className="ml-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            // Not disabled while saving — it never was: this is a way OUT of
            // a save that has not returned, not an action a save should be
            // able to block.
            className="flex h-11 items-center rounded-full border border-[var(--card-line)] px-4 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] transition-colors motion-reduce:transition-none hover:bg-[var(--card-section)]"
          >
            <X size={16} aria-hidden="true" className="mr-1.5" />
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex h-11 items-center rounded-full bg-[var(--card-bleu)] px-5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity motion-reduce:transition-none hover:opacity-90 disabled:opacity-50"
          >
            <Check size={16} aria-hidden="true" className="mr-1.5" />
            {saving ? "Enregistrement…" : "Terminé"}
          </button>
        </span>
      </div>
    </div>
  );
}
