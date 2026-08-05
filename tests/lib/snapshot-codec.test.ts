import { describe, expect, it } from "vitest";
import { packSnapshot, unpackSnapshot } from "@/lib/snapshot-codec";

describe("the snapshot codec", () => {
  it("round-trips a document unchanged", async () => {
    const html = "<!doctype html><html><body><p>Bonjour</p></body></html>";
    expect(await unpackSnapshot(await packSnapshot(html))).toBe(html);
  });

  it("round-trips accents and emoji, which is why it is utf8 both ways", async () => {
    const html = "<p>Élève — prêt ? ✅</p>";
    expect(await unpackSnapshot(await packSnapshot(html))).toBe(html);
  });

  it("actually shrinks a document", async () => {
    // The whole reason the column is Bytes and not String. Without this the
    // table becomes the largest thing in a file the nightly VACUUM INTO copies
    // whole.
    const html = "<div class='question'>Réponse</div>".repeat(2000);
    const packed = await packSnapshot(html);
    expect(packed.byteLength).toBeLessThan(html.length / 4);
  });

  it("round-trips an empty string", async () => {
    expect(await unpackSnapshot(await packSnapshot(""))).toBe("");
  });
});
