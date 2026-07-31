import { describe, expect, it } from "vitest";
import {
  MAX_THUMBNAIL_CHARS,
  THUMBNAIL_PREFIX,
  isThumbnail,
} from "@/lib/whiteboard-thumbnail";

const valid = `${THUMBNAIL_PREFIX}/9j/4AAQSkZJRgABAQAAAQABAAD=`;

describe("isThumbnail", () => {
  it("accepts a base64 JPEG data URL", () => {
    expect(isThumbnail(valid)).toBe(true);
  });

  it("rejects anything that is not a string", () => {
    expect(isThumbnail(null)).toBe(false);
    expect(isThumbnail(undefined)).toBe(false);
    expect(isThumbnail(42)).toBe(false);
    expect(isThumbnail({})).toBe(false);
  });

  // The teacher is the only caller, but the value renders in an <img src> on
  // the STUDENT's page — so a malformed one harms someone who never sent it.
  it("rejects a data URL that is not a JPEG", () => {
    expect(isThumbnail("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isThumbnail("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isThumbnail("data:image/png;base64,iVBORw0K")).toBe(false);
  });

  it("rejects a remote URL", () => {
    expect(isThumbnail("https://example.com/a.jpg")).toBe(false);
  });

  it("rejects an empty payload", () => {
    expect(isThumbnail(THUMBNAIL_PREFIX)).toBe(false);
  });

  it("rejects a payload that is not base64", () => {
    expect(isThumbnail(`${THUMBNAIL_PREFIX}not base64!`)).toBe(false);
  });

  it("rejects a payload over the size cap", () => {
    const huge = `${THUMBNAIL_PREFIX}${"A".repeat(MAX_THUMBNAIL_CHARS)}`;
    expect(isThumbnail(huge)).toBe(false);
  });
});
