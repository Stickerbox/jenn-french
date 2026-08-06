import { describe, expect, it } from "vitest";
import { swipeReply, SWIPE_TRIGGER_PX } from "@/lib/swipe-reply";

describe("swipeReply", () => {
  it("ignores a vertical drag, because the list scrolls first", () => {
    // The reader was scrolling. Stealing this costs them the thing they were
    // doing; ignoring a real reply drag costs them a second try.
    expect(swipeReply(10, 40)).toBeNull();
  });

  it("gives a tie to scrolling", () => {
    // A perfectly diagonal drag is ambiguous, and the ambiguous case belongs
    // to the surface's primary job.
    expect(swipeReply(30, 30)).toBeNull();
  });

  it("ignores a leftward drag", () => {
    // Left is where the browser's own back gesture lives. A bubble following
    // a finger into it fights the navigation the reader asked for.
    expect(swipeReply(-40, 2)).toBeNull();
  });

  it("ignores the travel a tap carries", () => {
    // Moving the bubble on a tap makes the whole list feel loose.
    expect(swipeReply(3, 1)).toBeNull();
  });

  it("follows the finger once the gesture has declared itself", () => {
    expect(swipeReply(24, 4)).toEqual({ offset: 24, armed: false });
  });

  it("arms at the trigger distance", () => {
    expect(swipeReply(SWIPE_TRIGGER_PX, 0)?.armed).toBe(true);
    expect(swipeReply(SWIPE_TRIGGER_PX - 1, 0)?.armed).toBe(false);
  });

  it("stops following past the cap, but stays armed", () => {
    // A bubble that can be dragged across the screen reads as something that
    // can be thrown away.
    const far = swipeReply(400, 0);
    expect(far?.offset).toBe(80);
    expect(far?.armed).toBe(true);
  });
});
