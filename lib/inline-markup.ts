// The five colours the teacher can pick from. `black` is a real, storable
// choice rather than the absence of one: a run with no colour means "nobody has
// decided yet", which is what lets applyFieldStyle recognise untouched text.
export const CARD_COLORS = ["red", "blue", "green", "gold", "black"] as const;

export type CardColor = (typeof CARD_COLORS)[number];

// A run is a stretch of text over which every mark is constant. The document is
// a flat list of them rather than a tree, so bold spanning a colour boundary —
// `<green>**a<red>b</red>**</green>` — needs no special handling: bold is a
// flag, colour is a stack, and the run simply records both.
export type MarkupRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  color: CardColor | null;
};

type Emphasis = "bold" | "italic" | "code";

type Atom =
  | { kind: "text"; raw: string }
  | { kind: "emphasis"; mark: Emphasis; raw: string }
  | { kind: "color"; color: CardColor; open: boolean; raw: string };

// Alternation order matters: ** must be tried before *, or "**x**" would lex as
// two italic markers around "x". `*` is still read as italic alongside `_`
// because every card written before the formatting toolbar existed uses it.
const MARKER = new RegExp(
  `\\*\\*|</?(?:${CARD_COLORS.join("|")})>|[_*\`]`,
  "g",
);

const EMPHASIS_OF: Record<string, Emphasis> = {
  "**": "bold",
  _: "italic",
  "*": "italic",
  "`": "code",
};

function lex(text: string): Atom[] {
  const atoms: Atom[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARKER)) {
    if (match.index > cursor) {
      atoms.push({ kind: "text", raw: text.slice(cursor, match.index) });
    }

    const raw = match[0];
    const emphasis = EMPHASIS_OF[raw];
    if (emphasis) {
      atoms.push({ kind: "emphasis", mark: emphasis, raw });
    } else {
      const open = !raw.startsWith("</");
      const color = raw.slice(open ? 1 : 2, -1) as CardColor;
      atoms.push({ kind: "color", color, open, raw });
    }

    cursor = match.index + raw.length;
  }

  if (cursor < text.length) {
    atoms.push({ kind: "text", raw: text.slice(cursor) });
  }

  return atoms;
}

// A marker only counts as a marker once its partner is found. This is what
// keeps "2 * 3 = 6" and "**oops" literal, and it is the reason parsing is two
// passes rather than one: the first occurrence cannot be judged until the whole
// string has been read.
function pairMarkers(atoms: Atom[]): boolean[] {
  const paired = atoms.map(() => false);
  const pendingEmphasis: Partial<Record<Emphasis, number>> = {};
  const pendingColor: Partial<Record<CardColor, number[]>> = {};

  atoms.forEach((atom, index) => {
    if (atom.kind === "emphasis") {
      const opener = pendingEmphasis[atom.mark];
      if (opener === undefined) {
        pendingEmphasis[atom.mark] = index;
      } else {
        paired[opener] = true;
        paired[index] = true;
        pendingEmphasis[atom.mark] = undefined;
      }
      return;
    }

    if (atom.kind !== "color") return;

    const stack = (pendingColor[atom.color] ??= []);
    if (atom.open) {
      stack.push(index);
    } else if (stack.length > 0) {
      paired[stack.pop() as number] = true;
      paired[index] = true;
    }
  });

  return paired;
}

export function parseInlineMarkup(text: string): MarkupRun[] {
  const atoms = lex(text);
  const paired = pairMarkers(atoms);

  const runs: MarkupRun[] = [];
  const colorStack: CardColor[] = [];
  let bold = false;
  let italic = false;
  let code = false;
  let buffer = "";

  function flush() {
    if (buffer === "") return;
    const color = colorStack[colorStack.length - 1] ?? null;
    const last = runs[runs.length - 1];
    // Merge rather than push so that an unpaired marker in the middle of a run
    // does not split it in two — callers compare runs for equality.
    if (
      last &&
      last.bold === bold &&
      last.italic === italic &&
      last.code === code &&
      last.color === color
    ) {
      last.text += buffer;
    } else {
      runs.push({ text: buffer, bold, italic, code, color });
    }
    buffer = "";
  }

  atoms.forEach((atom, index) => {
    if (atom.kind === "text" || !paired[index]) {
      buffer += atom.raw;
      return;
    }

    flush();

    if (atom.kind === "emphasis") {
      if (atom.mark === "bold") bold = !bold;
      else if (atom.mark === "italic") italic = !italic;
      else code = !code;
      return;
    }

    if (atom.open) {
      colorStack.push(atom.color);
    } else {
      // Innermost wins, so a close removes the nearest matching open rather
      // than the top of the stack — `<green>a<red>b</green>c</red>` still ends
      // with both colours retired.
      const at = colorStack.lastIndexOf(atom.color);
      if (at !== -1) colorStack.splice(at, 1);
    }
  });

  flush();
  return runs;
}

// Nesting order, outermost first. Fixed rather than derived so that serialising
// is deterministic: the same runs always produce the same string, which is what
// lets the editor compare the DOM against its value and skip a redraw.
const NESTING = ["color", "bold", "italic", "code"] as const;

function wrap(level: (typeof NESTING)[number], value: unknown, inner: string) {
  switch (level) {
    case "color":
      return `<${value as CardColor}>${inner}</${value as CardColor}>`;
    case "bold":
      return `**${inner}**`;
    case "italic":
      return `_${inner}_`;
    case "code":
      return `\`${inner}\``;
  }
}

function emit(runs: MarkupRun[], depth: number): string {
  if (depth === NESTING.length) return runs.map((run) => run.text).join("");

  const level = NESTING[depth];
  let out = "";
  let index = 0;

  while (index < runs.length) {
    const value = runs[index][level];
    let end = index + 1;
    while (end < runs.length && runs[end][level] === value) end++;

    const inner = emit(runs.slice(index, end), depth + 1);
    out += value ? wrap(level, value, inner) : inner;
    index = end;
  }

  return out;
}

export function serialiseRuns(runs: MarkupRun[]): string {
  return emit(
    runs.filter((run) => run.text !== ""),
    0,
  );
}

export function runsToPlainText(runs: MarkupRun[]): string {
  return runs.map((run) => run.text).join("");
}

export function toPlainText(markup: string): string {
  return runsToPlainText(parseInlineMarkup(markup));
}
