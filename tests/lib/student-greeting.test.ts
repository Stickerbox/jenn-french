import { describe, it, expect } from "vitest";
import { greeting, teacherPageLabel } from "@/lib/student-greeting";

describe("greeting", () => {
  it("uses the first name only, in French", () => {
    expect(greeting("Marie Dupont", "fr")).toBe("Bonjour Marie");
  });

  it("uses the first name only, in English", () => {
    expect(greeting("Marie Dupont", "en")).toBe("Hello Marie");
  });

  it("handles a single-word name", () => {
    expect(greeting("Marie", "fr")).toBe("Bonjour Marie");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(greeting("  Luc   Tremblay ", "fr")).toBe("Bonjour Luc");
  });

  it("has nothing to say about an empty name, in either locale", () => {
    expect(greeting("", "fr")).toBeNull();
    expect(greeting("   ", "en")).toBeNull();
  });
});

describe("teacherPageLabel", () => {
  // The FULL name, unlike greeting(), which takes the first word. Jenn's problem
  // is telling two students apart, and two students can share a first name.
  it("uses the whole name, in English", () => {
    expect(teacherPageLabel("Marie Dupont", "en")).toBe("Marie Dupont's page");
  });

  it("uses the whole name, in French", () => {
    expect(teacherPageLabel("Marie Dupont", "fr")).toBe(
      "La page de Marie Dupont",
    );
  });

  it("works on a one-word name", () => {
    expect(teacherPageLabel("Luc", "en")).toBe("Luc's page");
  });

  // One rule, no special case. Chicago's position, and it is asserted here so
  // nobody adds the apostrophe-only form later and thinks they fixed something.
  // French has no such case: "de Jonas" needs no exception either.
  it("adds 's to an English name ending in s", () => {
    expect(teacherPageLabel("Jonas", "en")).toBe("Jonas's page");
  });

  it("needs no apostrophe rule in French for a name ending in s", () => {
    expect(teacherPageLabel("Jonas", "fr")).toBe("La page de Jonas");
  });

  it("collapses surrounding and inner whitespace", () => {
    expect(teacherPageLabel("  Luc   Tremblay ", "en")).toBe(
      "Luc Tremblay's page",
    );
  });

  it("has nothing to say about an empty name, in either locale", () => {
    expect(teacherPageLabel("", "en")).toBeNull();
    expect(teacherPageLabel("   ", "fr")).toBeNull();
  });

  it("leaves greeting alone", () => {
    expect(greeting("Marie Dupont", "fr")).toBe("Bonjour Marie");
  });
});
