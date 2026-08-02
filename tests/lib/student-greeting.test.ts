import { describe, it, expect } from "vitest";
import { greeting } from "@/lib/student-greeting";

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
