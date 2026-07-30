import { describe, it, expect } from "vitest";
import { parseAdminTab } from "@/lib/admin-tab";

describe("parseAdminTab", () => {
  it("returns each of the three tabs unchanged", () => {
    expect(parseAdminTab("daily")).toBe("daily");
    expect(parseAdminTab("groups")).toBe("groups");
    expect(parseAdminTab("pages")).toBe("pages");
  });

  it("defaults to the daily word when the param is absent", () => {
    expect(parseAdminTab(undefined)).toBe("daily");
  });

  it("defaults to the daily word for an empty string", () => {
    expect(parseAdminTab("")).toBe("daily");
  });

  it("defaults to the daily word for an unrecognised value", () => {
    expect(parseAdminTab("settings")).toBe("daily");
  });

  it("is case sensitive, so a capitalised value falls back", () => {
    expect(parseAdminTab("Pages")).toBe("daily");
  });
});
