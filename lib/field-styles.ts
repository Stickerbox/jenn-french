import type { CardInput } from "@/app/actions";
import {
  parseInlineMarkup,
  serialiseRuns,
  type CardColor,
} from "@/lib/inline-markup";
import { splitIdiom } from "@/lib/idiom";
import { isIdiomSection } from "@/lib/sections";

export type FieldStyle = { color: CardColor; bold?: boolean; italic?: boolean };

// How each field looked when its styling lived in CSS. It now lives in the
// text instead — that is the whole point of the toolbar, since a colour baked
// into a class is one the teacher cannot change — and these are what a field
// gets seeded with so the card still looks the way it always did.
export const FIELD_STYLES = {
  subject: { color: "blue" },
  usage: { color: "gold", italic: true },
  englishPrompt: { color: "black" },
  hint: { color: "green", italic: true },
  frenchAnswer: { color: "blue" },
  sectionTitle: { color: "red", bold: true },
  sectionBody: { color: "black" },
  idiomExpression: { color: "red", italic: true },
  idiomMeaning: { color: "black" },
} as const satisfies Record<string, FieldStyle>;

// A colour is the marker of intent. Every field the teacher has touched since
// the toolbar shipped carries one, so text without a colour anywhere is either
// a card written before it or a field she has only just started typing into —
// both of which should look like the old default.
//
// This runs on read as well as on load, so the six cards already in the
// database render correctly without being rewritten. Once she saves one, the
// styling is stored explicitly and this stops applying to it.
export function applyFieldStyle(text: string, style: FieldStyle): string {
  const runs = parseInlineMarkup(text);
  if (runs.length === 0) return text;
  if (runs.some((run) => run.color !== null)) return text;

  return serialiseRuns(
    runs.map((run) => ({
      ...run,
      color: style.color,
      // Emphasis already in the text is kept: Claude bolds the trigger word of
      // a hint, and that bold has to survive the hint becoming italic.
      bold: run.bold || style.bold === true,
      italic: run.italic || style.italic === true,
    })),
  );
}

// The idiom is the one field with two defaults in it — a red italic
// expression and a plain meaning — so it is seeded either side of the
// separator rather than as a whole.
export function applySectionStyles(section: {
  title: string;
  body: string;
}): { title: string; body: string } {
  const title = applyFieldStyle(section.title, FIELD_STYLES.sectionTitle);

  if (parseInlineMarkup(section.body).some((run) => run.color !== null)) {
    return { title, body: section.body };
  }

  if (!isIdiomSection(section.title)) {
    return {
      title,
      body: applyFieldStyle(section.body, FIELD_STYLES.sectionBody),
    };
  }

  const { expression, meaning } = splitIdiom(section.body);
  if (expression === "") return { title, body: section.body };

  const styled = applyFieldStyle(expression, FIELD_STYLES.idiomExpression);
  if (meaning === "") return { title, body: styled };

  // The line break goes inside the meaning's colour rather than being left
  // bare between the two — an uncoloured run in the middle would report the
  // line as having no common colour the moment she selected all of it.
  return {
    title,
    body: styled + applyFieldStyle(`\n${meaning}`, FIELD_STYLES.idiomMeaning),
  };
}

// Applied when a card is loaded into the editor, so that the first save writes
// the styling out explicitly and nothing afterwards has to infer it.
export function applyCardStyles(values: CardInput): CardInput {
  return {
    ...values,
    subject: applyFieldStyle(values.subject, FIELD_STYLES.subject),
    usage: applyFieldStyle(values.usage, FIELD_STYLES.usage),
    englishPrompt: applyFieldStyle(
      values.englishPrompt,
      FIELD_STYLES.englishPrompt,
    ),
    hint: applyFieldStyle(values.hint, FIELD_STYLES.hint),
    frenchAnswer: applyFieldStyle(values.frenchAnswer, FIELD_STYLES.frenchAnswer),
    sections: values.sections.map((section) => ({
      ...section,
      ...applySectionStyles(section),
    })),
  };
}
