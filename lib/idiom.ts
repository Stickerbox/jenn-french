import {
  parseInlineMarkup,
  runsToPlainText,
  serialiseRuns,
} from "@/lib/inline-markup";
import { sliceRuns } from "@/lib/rich-text";

// The idiom is written on two lines: the expression in use, then the gloss
// under it. That is what the teacher types on every card she has written, and
// the line break is the separator this keys on.
//
// The one-line shapes below are the older ones — `**expression** — meaning`,
// and the same with the emphasis edited away — and they are still read,
// because the cards written in them are still on the site. Anything
// unparseable is treated as an expression with no meaning rather than dropped,
// since losing the teacher's text is worse than showing it in the wrong slot.
const LEADING_BOLD = /^\s*\*\*([^*]+)\*\*\s*/;
const WHOLLY_BOLD = /^\*\*([^*]+)\*\*$/;
const SEPARATOR = /\s[—–-]\s/;

// A line wrapped end to end in ** is using it as a delimiter marking the
// expression, not as emphasis — that was the only way to mark it before the
// formatting toolbar existed. Consume it, but only while the line carries no
// colour, because a colour means the teacher has since styled it herself and
// every marker in it is hers.
function undelimit(markup: string): string {
  if (parseInlineMarkup(markup).some((run) => run.color !== null)) return markup;
  const bold = markup.match(WHOLLY_BOLD);
  return bold ? bold[1].trim() : markup;
}

// Both halves come back as markup, not plain text: the idiom box renders each
// through InlineMarkup, so a colour applied to half the line has to survive
// the split.
export function splitIdiom(raw: string): {
  expression: string;
  meaning: string;
} {
  const text = raw.trim();
  if (text === "") return { expression: "", meaning: "" };

  const runs = parseInlineMarkup(text);
  const plain = runsToPlainText(runs);

  // A line break wins over every other rule, because it is the separator she
  // actually types. Cutting the runs rather than the stored string keeps a
  // colour tag from being sliced in half.
  const br = plain.indexOf("\n");
  if (br !== -1) {
    return {
      expression: undelimit(serialiseRuns(sliceRuns(runs, 0, br)).trim()),
      meaning: serialiseRuns(sliceRuns(runs, br + 1, plain.length)).trim(),
    };
  }

  if (!runs.some((run) => run.color)) {
    const bold = text.match(LEADING_BOLD);
    if (bold) {
      const rest = text.slice(bold[0].length);
      return {
        expression: bold[1].trim(),
        meaning: rest.replace(new RegExp(`^\\s*[—–-]\\s*`), "").trim(),
      };
    }
  }

  // Search the plain text, then cut the runs — searching the stored string
  // would let a separator inside `<green>a — b</green>` slice a tag in half
  // and turn the surviving fragment into literal text.
  const dash = plain.search(SEPARATOR);
  if (dash === -1) return { expression: text, meaning: "" };

  const separator = plain.slice(dash).match(/^\s[—–-]\s*/);
  const meaningStart = dash + (separator?.[0].length ?? 0);

  return {
    expression: serialiseRuns(sliceRuns(runs, 0, dash)),
    meaning: serialiseRuns(sliceRuns(runs, meaningStart, plain.length)),
  };
}
