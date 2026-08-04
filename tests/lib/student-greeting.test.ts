import { describe, it, expect } from "vitest";
import { greeting, teacherPageLabel } from "@/lib/student-greeting";

describe("greeting", () => {
  it("uses the first name only", () => {
    expect(greeting("Marie Dupont")).toBe("Bonjour Marie");
  });

  it("handles a single-word name", () => {
    expect(greeting("Marie")).toBe("Bonjour Marie");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(greeting("  Luc   Tremblay ")).toBe("Bonjour Luc");
  });

  it("has nothing to say about an empty name", () => {
    expect(greeting("")).toBeNull();
    expect(greeting("   ")).toBeNull();
  });
});

describe("teacherPageLabel", () => {
  // The FULL name, unlike greeting(), which takes the first word. Jenn's problem
  // is telling two students apart, and two students can share a first name.
  it("uses the whole name", () => {
    expect(teacherPageLabel("Marie Dupont")).toBe("Marie Dupont's page");
  });

  it("works on a one-word name", () => {
    expect(teacherPageLabel("Luc")).toBe("Luc's page");
  });

  // One rule, no special case. Chicago's position, and it is asserted here so
  // nobody adds the apostrophe-only form later and thinks they fixed something.
  it("adds 's to a name ending in s", () => {
    expect(teacherPageLabel("Jonas")).toBe("Jonas's page");
  });

  it("collapses surrounding and inner whitespace", () => {
    expect(teacherPageLabel("  Luc   Tremblay ")).toBe("Luc Tremblay's page");
  });

  it("has nothing to say about an empty name", () => {
    expect(teacherPageLabel("")).toBeNull();
    expect(teacherPageLabel("   ")).toBeNull();
  });

  it("leaves greeting alone", () => {
    expect(greeting("Marie Dupont")).toBe("Bonjour Marie");
  });
});
