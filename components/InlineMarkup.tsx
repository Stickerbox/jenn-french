import { Fragment } from "react";
import { parseInlineMarkup } from "@/lib/inline-markup";
import { cardCodeChip } from "@/components/card-styles";

export function InlineMarkup({ text }: { text: string }) {
  return (
    <>
      {parseInlineMarkup(text).map((token, index) => {
        switch (token.type) {
          case "bold":
            return (
              <strong key={index} className="font-semibold">
                {token.value}
              </strong>
            );
          case "italic":
            return <em key={index}>{token.value}</em>;
          case "code":
            return (
              <code key={index} className={cardCodeChip}>
                {token.value}
              </code>
            );
          default:
            return <Fragment key={index}>{token.value}</Fragment>;
        }
      })}
    </>
  );
}
