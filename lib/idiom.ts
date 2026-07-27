// Claude is asked for `**expression** — meaning`, and the teacher can edit it
// afterwards, so this has to cope with the shape drifting. The expression is
// whatever leads the line; the meaning is whatever follows the first
// separator. Anything unparseable is treated as an expression with no meaning
// rather than dropped, since losing the teacher's text is worse than showing
// it in the wrong slot.
const LEADING_BOLD = /^\s*\*\*([^*]+)\*\*\s*/;
const SEPARATOR = /^\s*[—–-]\s*/;

export function splitIdiom(raw: string): {
  expression: string;
  meaning: string;
} {
  const text = raw.trim();
  if (text === "") return { expression: "", meaning: "" };

  const bold = text.match(LEADING_BOLD);
  if (bold) {
    const rest = text.slice(bold[0].length);
    return {
      expression: bold[1].trim(),
      meaning: rest.replace(SEPARATOR, "").trim(),
    };
  }

  // No bold marker — fall back to the first dash separator, which is how the
  // format reads even when the emphasis has been edited away.
  const dash = text.search(/\s[—–-]\s/);
  if (dash !== -1) {
    return {
      expression: text.slice(0, dash).trim(),
      meaning: text.slice(dash).replace(SEPARATOR, "").trim(),
    };
  }

  return { expression: text, meaning: "" };
}
