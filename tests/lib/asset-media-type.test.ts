import { describe, expect, it } from "vitest";
import { mediaTypeForPath } from "@/lib/asset-media-type";

describe("mediaTypeForPath", () => {
  it("types the two text kinds a page carries", () => {
    expect(mediaTypeForPath("app.js")).toBe("text/javascript");
    expect(mediaTypeForPath("app.mjs")).toBe("text/javascript");
    expect(mediaTypeForPath("styles.css")).toBe("text/css");
  });

  it("types an image", () => {
    expect(mediaTypeForPath("logo.png")).toBe("image/png");
    expect(mediaTypeForPath("photo.jpg")).toBe("image/jpeg");
    expect(mediaTypeForPath("photo.jpeg")).toBe("image/jpeg");
    expect(mediaTypeForPath("icon.svg")).toBe("image/svg+xml");
  });

  it("types a font", () => {
    expect(mediaTypeForPath("x.woff2")).toBe("font/woff2");
    expect(mediaTypeForPath("x.ttf")).toBe("font/ttf");
  });

  it("ignores the case of the extension", () => {
    expect(mediaTypeForPath("LOGO.PNG")).toBe("image/png");
  });

  // Reported rather than guessed. contentTypeMatches refuses octet-stream for an
  // image, so <img src="logo"> becomes a report line — and sniffing bytes would
  // be a format parser, which validatePagePdf and validatePageHtml have both
  // already declined to be.
  it("falls back to octet-stream rather than guessing", () => {
    expect(mediaTypeForPath("logo")).toBe("application/octet-stream");
    expect(mediaTypeForPath("thing.xyz")).toBe("application/octet-stream");
  });

  // The dot belongs to a directory, not to the filename.
  it("does not read an extension out of a directory name", () => {
    expect(mediaTypeForPath("v1.2/app")).toBe("application/octet-stream");
    expect(mediaTypeForPath("v1.2/app.js")).toBe("text/javascript");
  });

  it("does not treat a dotfile as an extension", () => {
    expect(mediaTypeForPath(".gitignore")).toBe("application/octet-stream");
  });
});
