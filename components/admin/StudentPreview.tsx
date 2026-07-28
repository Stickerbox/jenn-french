import type { CardInput } from "@/app/actions";
import { CardBack } from "@/components/CardBack";
import { CardFront } from "@/components/CardFront";
import { panelLabel } from "@/components/card-styles";
import { toPreviewContent } from "@/lib/card-preview";

// No state, no effect, no debounce: `values` is already updated on every
// keystroke by the editor, and this is a pure function of it. Sticky on
// desktop so it stays in view while she scrolls the form beside it.
export function StudentPreview({ values }: { values: CardInput }) {
  const card = toPreviewContent(values);

  return (
    <aside className="lg:sticky lg:top-8">
      <div className={panelLabel}>As the student sees it</div>
      <div className="flex flex-col gap-6">
        {/* The flip container gives the faces their height on the student
            page. Here they need it themselves, or a short card previews at
            the wrong proportions. */}
        <CardFront card={card} className="min-h-[460px]" />
        <CardBack card={card} className="min-h-[460px]" />
      </div>
    </aside>
  );
}
