import { describe, it, expect } from "vitest";
import { toPreviewContent } from "@/lib/card-preview";
import type { CardInput } from "@/app/actions";

function values(overrides: Partial<CardInput> = {}): CardInput {
  return {
    date: "2026-07-28",
    subject: "Imparfait",
    usage: "Habits of the past",
    englishPrompt: "I used to pack a lunch every day",
    hint: "Think about a **repeated** habit",
    frenchAnswer: "Je faisais un lunch chaque jour",
    sections: [{ title: "Grammar", body: "faire → **faisait**" }],
    ...overrides,
  };
}

describe("toPreviewContent", () => {
  it("parses the date as UTC midnight", () => {
    expect(toPreviewContent(values()).date.toISOString()).toBe(
      "2026-07-28T00:00:00.000Z",
    );
  });

  it("passes the two required strings through untouched", () => {
    const content = toPreviewContent(
      values({ englishPrompt: "  spaced  ", frenchAnswer: "" }),
    );
    expect(content.englishPrompt).toBe("  spaced  ");
    expect(content.frenchAnswer).toBe("");
  });

  it("keeps the optional fields when they hold text", () => {
    const content = toPreviewContent(values());
    expect(content.subject).toBe("Imparfait");
    expect(content.usage).toBe("Habits of the past");
    expect(content.hint).toBe("Think about a **repeated** habit");
  });

  it("turns an empty optional field into null", () => {
    const content = toPreviewContent(
      values({ subject: "", usage: "", hint: "" }),
    );
    expect(content.subject).toBeNull();
    expect(content.usage).toBeNull();
    expect(content.hint).toBeNull();
  });

  // Deliberately not a trim. app/actions.ts stores `input.subject || null`, so
  // "   " is truthy, saves, and renders a pill full of spaces on the student
  // card. The preview has to reproduce that or it is lying.
  it("keeps a whitespace-only optional field, matching the save path", () => {
    expect(toPreviewContent(values({ subject: "   " })).subject).toBe("   ");
  });

  it("trims sections and drops the ones blank in both fields", () => {
    const content = toPreviewContent(
      values({
        sections: [
          { title: "  Grammar  ", body: "  être → **j'étais**  " },
          { title: "", body: "" },
          { title: "   ", body: "  " },
        ],
      }),
    );
    expect(content.sections).toEqual([
      { title: "Grammar", body: "être → **j'étais**" },
    ]);
  });

  it("keeps a section that has a title and no body", () => {
    const content = toPreviewContent(
      values({ sections: [{ title: "Québec Pronunciation", body: "" }] }),
    );
    expect(content.sections).toEqual([
      { title: "Québec Pronunciation", body: "" },
    ]);
  });

  it("preserves section order", () => {
    const content = toPreviewContent(
      values({
        sections: [
          { title: "One", body: "1" },
          { title: "Two", body: "2" },
          { title: "Three", body: "3" },
        ],
      }),
    );
    expect(content.sections.map((s) => s.title)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it("drops the browser-only section id", () => {
    const content = toPreviewContent(
      values({ sections: [{ title: "Grammar", body: "text", id: "s-0" }] }),
    );
    expect(content.sections).toEqual([{ title: "Grammar", body: "text" }]);
  });
});
