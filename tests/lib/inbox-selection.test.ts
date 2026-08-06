import { describe, it, expect } from "vitest";
import {
  resolveInboxSelection,
  parseStoredSelection,
} from "@/lib/inbox-selection";

const ordered = ["a", "b", "c"];

describe("resolveInboxSelection", () => {
  it("selects the pinned conversation when it is still in the list", () => {
    expect(
      resolveInboxSelection({ pinned: "b", stored: null, ordered, wide: true }),
    ).toEqual({ selectedId: "b", view: "conversation" });
  });

  it("pinned wins over a stored selection, on both sizes", () => {
    const stored = { groupId: "c", view: "list" as const };
    expect(
      resolveInboxSelection({ pinned: "b", stored, ordered, wide: true }),
    ).toEqual({ selectedId: "b", view: "conversation" });
    expect(
      resolveInboxSelection({ pinned: "b", stored, ordered, wide: false }),
    ).toEqual({ selectedId: "b", view: "conversation" });
  });

  it("falls through when the pinned student is no longer in the list", () => {
    // Deleted since the page rendered — must not select a group that no
    // longer exists, and must not crash trying.
    expect(
      resolveInboxSelection({
        pinned: "gone",
        stored: null,
        ordered,
        wide: true,
      }),
    ).toEqual({ selectedId: "a", view: "conversation" });
  });

  it("restores a stored conversation still in the list, with its stored view", () => {
    expect(
      resolveInboxSelection({
        pinned: null,
        stored: { groupId: "c", view: "conversation" },
        ordered,
        wide: false,
      }),
    ).toEqual({ selectedId: "c", view: "conversation" });

    expect(
      resolveInboxSelection({
        pinned: null,
        stored: { groupId: "c", view: "list" },
        ordered,
        wide: false,
      }),
    ).toEqual({ selectedId: "c", view: "list" });
  });

  it("ignores a stored id that no longer exists and falls back to defaults", () => {
    expect(
      resolveInboxSelection({
        pinned: null,
        stored: { groupId: "gone", view: "conversation" },
        ordered,
        wide: true,
      }),
    ).toEqual({ selectedId: "a", view: "conversation" });

    expect(
      resolveInboxSelection({
        pinned: null,
        stored: { groupId: "gone", view: "conversation" },
        ordered,
        wide: false,
      }),
    ).toEqual({ selectedId: null, view: "list" });
  });

  it("defaults desktop to the first conversation, in list order", () => {
    expect(
      resolveInboxSelection({ pinned: null, stored: null, ordered, wide: true }),
    ).toEqual({ selectedId: "a", view: "conversation" });
  });

  it("defaults mobile to the list with nothing selected", () => {
    expect(
      resolveInboxSelection({ pinned: null, stored: null, ordered, wide: false }),
    ).toEqual({ selectedId: null, view: "list" });
  });

  it("never selects a conversation out of an empty list", () => {
    expect(
      resolveInboxSelection({ pinned: null, stored: null, ordered: [], wide: true }),
    ).toEqual({ selectedId: null, view: "conversation" });
    expect(
      resolveInboxSelection({ pinned: null, stored: null, ordered: [], wide: false }),
    ).toEqual({ selectedId: null, view: "list" });
    expect(
      resolveInboxSelection({
        pinned: "a",
        stored: { groupId: "a", view: "conversation" },
        ordered: [],
        wide: true,
      }),
    ).toEqual({ selectedId: null, view: "conversation" });
  });

  it("treats a stored null groupId (list left open with nothing selected) as nothing stored", () => {
    expect(
      resolveInboxSelection({
        pinned: null,
        stored: { groupId: null, view: "list" },
        ordered,
        wide: true,
      }),
    ).toEqual({ selectedId: "a", view: "conversation" });
  });
});

describe("parseStoredSelection", () => {
  it("returns null for a missing value", () => {
    expect(parseStoredSelection(null)).toBeNull();
  });

  it("parses a well-formed value", () => {
    expect(
      parseStoredSelection('{"groupId":"abc","view":"conversation"}'),
    ).toEqual({ groupId: "abc", view: "conversation" });
  });

  it("parses a stored list view with no selection", () => {
    expect(parseStoredSelection('{"groupId":null,"view":"list"}')).toEqual({
      groupId: null,
      view: "list",
    });
  });

  it("degrades invalid JSON to null rather than throwing", () => {
    expect(parseStoredSelection("not json")).toBeNull();
  });

  it("degrades a non-object value to null", () => {
    expect(parseStoredSelection('"abc"')).toBeNull();
    expect(parseStoredSelection("42")).toBeNull();
    expect(parseStoredSelection("null")).toBeNull();
  });

  it("degrades an unrecognised view to null", () => {
    expect(
      parseStoredSelection('{"groupId":"abc","view":"sideways"}'),
    ).toBeNull();
  });

  it("degrades a non-string, non-null groupId to null", () => {
    expect(parseStoredSelection('{"groupId":5,"view":"list"}')).toBeNull();
  });
});
