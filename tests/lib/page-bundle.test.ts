import { describe, expect, it } from "vitest";
import { assetBundle, bundleResolver } from "@/lib/page-bundle";
import { SKIP_REASONS } from "@/lib/asset-policy";

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

describe("assetBundle", () => {
  it("keys an entry by its normalised path", () => {
    const bundle = assetBundle([
      { path: "./css/../app.js?v=2", bytes: bytes("var a=1;") },
    ]);
    expect([...bundle.keys()]).toEqual(["app.js"]);
  });

  it("collapses two spellings of one file onto one key", () => {
    const bundle = assetBundle([
      { path: "./a.js", bytes: bytes("first") },
      { path: "a.js", bytes: bytes("second") },
    ]);
    expect(bundle.size).toBe(1);
  });

  // Kept under a key no ref could ever produce, it would be dead weight in the
  // upload budget and invisible in the report.
  it("drops an entry whose path addresses nothing inside the bundle", () => {
    expect(assetBundle([{ path: "../secret", bytes: bytes("x") }]).size).toBe(0);
  });
});

describe("bundleResolver", () => {
  it("answers with the bytes and a derived content type", () => {
    const resolve = bundleResolver(
      assetBundle([{ path: "app.js", bytes: bytes("var a=1;") }]),
    );

    const result = resolve("app.js", "script");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset.contentType).toBe("text/javascript");
    expect(new TextDecoder().decode(result.asset.bytes)).toBe("var a=1;");
  });

  // A bundle WAS uploaded and this file was not in it, which is a different
  // sentence from "only the page itself is published" — so it is a different
  // reason. lib/page-inline.ts is what chooses between the two.
  it("reports a key the bundle does not hold as missing", () => {
    const resolve = bundleResolver(assetBundle([]));

    expect(resolve("app.js", "script")).toEqual({
      ok: false,
      reason: SKIP_REASONS.missing,
    });
  });

  // Checked by the same rule a fetched asset is checked by, so a confused
  // artifact writing <script src="styles.css"> is reported rather than having
  // CSS inlined into a <script> element.
  it("refuses a file whose extension contradicts the ref", () => {
    const resolve = bundleResolver(
      assetBundle([{ path: "styles.css", bytes: bytes("a{}") }]),
    );

    expect(resolve("styles.css", "script")).toEqual({
      ok: false,
      reason: SKIP_REASONS.wrongType,
    });
  });

  it("accepts a font and an image on their extensions", () => {
    const resolve = bundleResolver(
      assetBundle([
        { path: "fonts/x.woff2", bytes: bytes("W") },
        { path: "logo.png", bytes: bytes("P") },
      ]),
    );

    expect(resolve("fonts/x.woff2", "font").ok).toBe(true);
    expect(resolve("logo.png", "image").ok).toBe(true);
  });

  // Pins the contract rather than a limitation: the resolver is handed
  // ExternalRef.localPath, which lib/page-refs.ts has already normalised.
  // Normalising again here would put the rule in a second place.
  it("expects an already-normalised key", () => {
    const resolve = bundleResolver(
      assetBundle([{ path: "app.js", bytes: bytes("x") }]),
    );

    expect(resolve("./app.js", "script").ok).toBe(false);
  });
});
