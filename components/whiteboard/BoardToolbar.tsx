"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Eraser,
  MousePointer2,
  Pencil,
  Trash2,
  Type,
  Undo2,
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

// Icon-only controls need both: aria-label for a screen reader, title for a
// hover tooltip. Without them this toolbar is usable only by whoever wrote it.
function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-line)] transition-colors ${
        active
          ? "bg-[var(--card-bleu)] text-white"
          : "bg-[var(--card-paper)] text-[var(--card-moss)]"
      }`}
    >
      {children}
    </button>
  );
}

export function BoardToolbar({
  tool,
  colour,
  hasSelection,
  onTool,
  onColour,
  onUndo,
  onClearPage,
}: {
  tool: Tool;
  colour: Colour;
  hasSelection: boolean;
  onTool: (tool: Tool) => void;
  onColour: (colour: Colour) => void;
  onUndo: () => void;
  onClearPage: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
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

      <span className="mx-1 flex gap-1">
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
            style={{ background: swatch }}
            className={`h-9 w-9 rounded-full transition-transform ${
              !hasSelection && colour === swatch
                ? "ring-2 ring-[var(--card-ink)] ring-offset-2"
                : ""
            } ${hasSelection ? "hover:scale-110" : ""}`}
          />
        ))}
      </span>

      <IconButton label="Annuler la dernière action" onClick={onUndo}>
        <Undo2 size={18} aria-hidden="true" />
      </IconButton>

      <IconButton label="Effacer la page" onClick={onClearPage}>
        <Trash2 size={18} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
