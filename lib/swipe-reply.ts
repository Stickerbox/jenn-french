// Pull a message to the right to reply to it, the gesture every messenger
// uses. The rule lives here rather than in the handler so it can be tested
// without a touchscreen: a component holds the coordinates, this decides what
// they mean.

// How far the message has to travel before releasing it stages a quote. Far
// enough that a thumb sliding while scrolling never reaches it, close enough
// that the whole gesture happens under one thumb without regripping.
export const SWIPE_TRIGGER_PX = 56;

// The message stops following the finger here. A bubble that could be dragged
// across the screen reads as something that can be thrown away.
const MAX_PULL_PX = 80;

// Below this the gesture has not declared itself. A tap carries a pixel or two
// of travel, and moving the bubble on a tap makes the whole list feel loose.
const SLOP_PX = 8;

export type SwipeReply = {
  // What to translate the row by, in pixels.
  offset: number;
  // Releasing now stages the quote. The caller draws this — an indicator that
  // only appears at the moment of release is an indicator nobody sees.
  armed: boolean;
};

// Null means "this is not a reply gesture" — leave the row where it is and let
// the list scroll.
//
// VERTICAL WINS TIES AND EVERY AMBIGUOUS CASE. A chat is a scrolling surface
// first: stealing a drag that was meant to scroll costs the reader the thing
// they were doing, while ignoring one that was meant to reply costs them a
// second attempt. The `>=` is deliberate — a perfectly diagonal drag scrolls.
//
// Rightward only. Left is where the browser's own back gesture lives on both
// platforms, and a bubble that follows a finger into it fights the navigation
// the reader asked for.
export function swipeReply(dx: number, dy: number): SwipeReply | null {
  if (Math.abs(dy) >= Math.abs(dx)) return null;
  if (dx < SLOP_PX) return null;

  return {
    offset: Math.min(dx, MAX_PULL_PX),
    armed: dx >= SWIPE_TRIGGER_PX,
  };
}
