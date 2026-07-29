import { Fragment, type ReactNode } from "react";
import { parseInlineMarkup } from "@/lib/inline-markup";
import { applyFieldStyle, type FieldStyle } from "@/lib/field-styles";
import { CARD_COLOR_VAR, cardCodeChip } from "@/components/card-styles";

// `style` is the field's default. Passing it lets a card written before the
// formatting toolbar existed render the way it always did, without rewriting a
// single database row — see applyFieldStyle.
export function InlineMarkup({
  text,
  style,
}: {
  text: string;
  style?: FieldStyle;
}) {
  const markup = style ? applyFieldStyle(text, style) : text;

  return (
    <>
      {parseInlineMarkup(markup).map((run, index) => {
        // Nested elements rather than one span of classes, so bold and italic
        // stay <strong> and <em> to a screen reader now that they can combine.
        let node: ReactNode = run.text;
        if (run.code) node = <code className={cardCodeChip}>{node}</code>;
        if (run.italic) node = <em>{node}</em>;
        if (run.bold) node = <strong className="font-semibold">{node}</strong>;
        if (run.color) {
          node = (
            <span style={{ color: `var(${CARD_COLOR_VAR[run.color]})` }}>
              {node}
            </span>
          );
        }
        return <Fragment key={index}>{node}</Fragment>;
      })}
    </>
  );
}
