import { describe, it, expect } from "vitest";
import { previewText } from "@/lib/chat-preview";

const labels = { you: "You: ", empty: "No messages yet" };

describe("previewText", () => {
  it("shows the empty label when there is no message", () => {
    expect(previewText(null, labels)).toBe("No messages yet");
  });

  it("shows a student's message as written", () => {
    expect(
      previewText({ body: "Merci beaucoup!", fromTeacher: false }, labels),
    ).toBe("Merci beaucoup!");
  });

  it("prefixes Jenn's own message", () => {
    expect(previewText({ body: "À demain", fromTeacher: true }, labels)).toBe(
      "You: À demain",
    );
  });

  // The label carries its own separator so a locale can change it — French
  // wants "Vous : " with a space before the colon.
  it("takes the separator from the label, not from the function", () => {
    expect(
      previewText(
        { body: "À demain", fromTeacher: true },
        { you: "Vous : ", empty: "Aucun message" },
      ),
    ).toBe("Vous : À demain");
  });

  it("collapses newlines so one row cannot become three", () => {
    expect(
      previewText({ body: "Bonjour\n\nMarie", fromTeacher: false }, labels),
    ).toBe("Bonjour Marie");
  });

  it("collapses runs of spaces and tabs too", () => {
    expect(previewText({ body: "a  \t  b", fromTeacher: false }, labels)).toBe(
      "a b",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(previewText({ body: "  salut  ", fromTeacher: false }, labels)).toBe(
      "salut",
    );
  });

  // A body that is nothing but whitespace cannot reach the database — the POST
  // route trims before it stores — but a row that renders as a blank line under
  // a student who did write something is worse than the empty label.
  it("falls back to the empty label for a whitespace-only body", () => {
    expect(previewText({ body: "   ", fromTeacher: false }, labels)).toBe(
      "No messages yet",
    );
  });
});
