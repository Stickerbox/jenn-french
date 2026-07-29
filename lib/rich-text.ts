import {
  parseInlineMarkup,
  runsToPlainText,
  serialiseRuns,
  type CardColor,
  type MarkupRun,
} from "@/lib/inline-markup";

// Everything here addresses text by offsets into the *plain* text — what the
// teacher sees and what a browser selection reports. The markers themselves
// have no positions she could point at, so no function in this module takes an
// offset into the stored string.

// Cuts runs so that every offset in `offsets` falls on a boundary between two
// runs. Offsets outside the text, or already on a boundary, do nothing.
export function splitRuns(runs: MarkupRun[], offsets: number[]): MarkupRun[] {
  const out: MarkupRun[] = [];
  let start = 0;

  for (const run of runs) {
    const end = start + run.text.length;
    const cuts = offsets
      .filter((offset) => offset > start && offset < end)
      .sort((a, b) => a - b);

    let cursor = 0;
    for (const cut of cuts) {
      out.push({ ...run, text: run.text.slice(cursor, cut - start) });
      cursor = cut - start;
    }
    out.push({ ...run, text: run.text.slice(cursor) });

    start = end;
  }

  return out.filter((run) => run.text !== "");
}

export function sliceRuns(
  runs: MarkupRun[],
  start: number,
  end: number,
): MarkupRun[] {
  const split = splitRuns(runs, [start, end]);
  const out: MarkupRun[] = [];
  let at = 0;

  for (const run of split) {
    const runEnd = at + run.text.length;
    if (at >= start && runEnd <= end) out.push(run);
    at = runEnd;
  }

  return out;
}

function mapRange(
  markup: string,
  start: number,
  end: number,
  transform: (run: MarkupRun) => MarkupRun,
): string {
  if (end <= start) return markup;

  const runs = splitRuns(parseInlineMarkup(markup), [start, end]);
  let at = 0;

  const next = runs.map((run) => {
    const runStart = at;
    at += run.text.length;
    return runStart >= start && at <= end ? transform(run) : run;
  });

  return serialiseRuns(next);
}

export type Emphasis = "bold" | "italic" | "code";

export type RangeMarks = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  // null when the range spans two colours, so the toolbar shows none of the
  // circles as active rather than picking one of them arbitrarily.
  color: CardColor | null;
};

export function marksInRange(
  markup: string,
  start: number,
  end: number,
): RangeMarks {
  const runs = sliceRuns(parseInlineMarkup(markup), start, end);
  if (runs.length === 0)
    return { bold: false, italic: false, code: false, color: null };

  const color = runs[0].color;
  return {
    // Partly-bold counts as not bold, which is what makes the button's first
    // press bold the whole selection instead of clearing the bold part.
    bold: runs.every((run) => run.bold),
    italic: runs.every((run) => run.italic),
    code: runs.every((run) => run.code),
    color: runs.every((run) => run.color === color) ? color : null,
  };
}

export function toggleEmphasis(
  markup: string,
  start: number,
  end: number,
  mark: Emphasis,
): string {
  const on = !marksInRange(markup, start, end)[mark];
  return mapRange(markup, start, end, (run) => ({ ...run, [mark]: on }));
}

export function setColor(
  markup: string,
  start: number,
  end: number,
  color: CardColor,
): string {
  return mapRange(markup, start, end, (run) => ({ ...run, color }));
}

// Typing, pasting and deleting all come through here rather than being read
// back off the DOM, so the marks a new character inherits are decided by this
// rule and not by whichever span the browser happened to grow.
export function replaceRange(
  markup: string,
  start: number,
  end: number,
  text: string,
): string {
  const runs = splitRuns(parseInlineMarkup(markup), [start, end]);
  const plainLength = runsToPlainText(runs).length;

  const before = sliceRuns(runs, 0, start);
  const after = sliceRuns(runs, end, plainLength);

  if (text === "") return serialiseRuns([...before, ...after]);

  // Inherit from the run to the left of the insertion point — the convention
  // every text editor uses — and from the right only at the very start.
  const template = before[before.length - 1] ?? after[0];
  const inserted: MarkupRun = template
    ? { ...template, text }
    : { text, bold: false, italic: false, code: false, color: null };

  return serialiseRuns([...before, inserted, ...after]);
}
