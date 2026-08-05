import { describe, expect, it } from "vitest";
import {
  WORKSHEET_FIELD,
  readWorksheetField,
  worksheetFieldValue,
} from "@/lib/worksheet-field";

describe("worksheetFieldValue", () => {
  it("writes the exact string a checked box round-trips as", () => {
    expect(worksheetFieldValue(true)).toBe("on");
  });

  it("writes the empty string for unchecked, not an absent field", () => {
    // PageEditor always appends the field, so the reader must treat "" the
    // same as a field that was never sent at all.
    expect(worksheetFieldValue(false)).toBe("");
  });
});

describe("readWorksheetField", () => {
  it("reads what the writer produces for checked", () => {
    const formData = new FormData();
    formData.append(WORKSHEET_FIELD, worksheetFieldValue(true));
    expect(readWorksheetField(formData)).toBe(true);
  });

  it("reads what the writer produces for unchecked", () => {
    const formData = new FormData();
    formData.append(WORKSHEET_FIELD, worksheetFieldValue(false));
    expect(readWorksheetField(formData)).toBe(false);
  });

  it("reads false when the field is missing entirely", () => {
    expect(readWorksheetField(new FormData())).toBe(false);
  });

  it("reads false for any value that isn't the exact 'on' contract", () => {
    const formData = new FormData();
    formData.append(WORKSHEET_FIELD, "true");
    expect(readWorksheetField(formData)).toBe(false);
  });
});
