import { describe, expect, it } from "vitest";
import {
  ASSET_HOSTS,
  assetKindForUrl,
  contentTypeMatches,
  isAllowedAssetUrl,
} from "@/lib/asset-policy";

describe("isAllowedAssetUrl", () => {
  it("accepts an allowlisted host over https", () => {
    expect(
      isAllowedAssetUrl(
        "https://artifactcdn.diabrowser.engineering/ajax/libs/animejs/anime.min.js",
      ),
    ).toBe(true);
  });

  it("accepts every host in the list", () => {
    for (const host of ASSET_HOSTS) {
      expect(isAllowedAssetUrl(`https://${host}/x.js`)).toBe(true);
    }
  });

  it("rejects http, so a fetch is never downgraded", () => {
    expect(isAllowedAssetUrl("http://cdnjs.cloudflare.com/x.js")).toBe(false);
  });

  it("rejects a host that is not listed", () => {
    expect(isAllowedAssetUrl("https://evil.example/x.js")).toBe(false);
  });

  // A suffix match would admit every subdomain anyone can register.
  it("rejects a subdomain of an allowed host", () => {
    expect(isAllowedAssetUrl("https://evil.cdn.jsdelivr.net/x.js")).toBe(false);
  });

  // The whole point of reading URL.host rather than the raw string: the host
  // here is evil.example, and the allowlisted name is only the username.
  it("rejects credentials used to make a host look allowlisted", () => {
    expect(isAllowedAssetUrl("https://cdnjs.cloudflare.com@evil.example/x.js")).toBe(
      false,
    );
  });

  it("rejects an explicit port", () => {
    expect(isAllowedAssetUrl("https://cdnjs.cloudflare.com:8443/x.js")).toBe(false);
  });

  it("rejects the EC2 metadata service and bare IP literals", () => {
    expect(isAllowedAssetUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedAssetUrl("https://169.254.169.254/")).toBe(false);
    expect(isAllowedAssetUrl("https://[::1]/x.js")).toBe(false);
  });

  it("matches the host case-insensitively, as a URL does", () => {
    expect(isAllowedAssetUrl("https://CDNJS.Cloudflare.COM/x.js")).toBe(true);
  });

  it("returns false rather than throwing on anything unparseable", () => {
    for (const junk of ["", "   ", "not a url", "//cdnjs.cloudflare.com/x.js"]) {
      expect(isAllowedAssetUrl(junk)).toBe(false);
    }
  });
});

describe("contentTypeMatches", () => {
  it("accepts the javascript types a CDN actually sends", () => {
    for (const type of [
      "application/javascript; charset=utf-8",
      "text/javascript",
      "application/ecmascript",
    ]) {
      expect(contentTypeMatches("script", type, "https://x.test/a.js")).toBe(true);
    }
  });

  // Without this an nginx or Cloudflare 404 page lands inside a <script> and
  // the page fails with a syntax error at a line Jenn never wrote.
  it("rejects an HTML error page served in place of a script", () => {
    expect(contentTypeMatches("script", "text/html", "https://x.test/a.js")).toBe(
      false,
    );
  });

  it("requires text/css for a stylesheet", () => {
    expect(contentTypeMatches("style", "text/css", "https://x.test/a.css")).toBe(true);
    expect(contentTypeMatches("style", "text/plain", "https://x.test/a.css")).toBe(
      false,
    );
  });

  it("requires an image type for an image", () => {
    expect(contentTypeMatches("image", "image/png", "https://x.test/a.png")).toBe(true);
    expect(contentTypeMatches("image", "text/html", "https://x.test/a.png")).toBe(
      false,
    );
  });

  it("accepts a font sent as octet-stream only when the path names a font", () => {
    expect(
      contentTypeMatches("font", "application/octet-stream", "https://x.test/a.woff2"),
    ).toBe(true);
    expect(
      contentTypeMatches("font", "application/octet-stream", "https://x.test/a.js"),
    ).toBe(false);
  });

  it("accepts font/woff2, which is what gstatic sends", () => {
    expect(contentTypeMatches("font", "font/woff2", "https://x.test/a.woff2")).toBe(
      true,
    );
  });
});

describe("assetKindForUrl", () => {
  it("calls a font a font, by extension and past a query string", () => {
    expect(assetKindForUrl("https://x.test/a.woff2")).toBe("font");
    expect(assetKindForUrl("https://x.test/a.ttf?v=2")).toBe("font");
    expect(assetKindForUrl("https://x.test/a.otf#f")).toBe("font");
  });

  it("calls everything else an image", () => {
    expect(assetKindForUrl("https://x.test/a.png")).toBe("image");
    expect(assetKindForUrl("https://x.test/woff2-icons.svg")).toBe("image");
  });
});
