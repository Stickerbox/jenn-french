import { describe, expect, it } from "vitest";
import { isSelectableCardDate } from "@/lib/card-dates";

// Cards on Monday and Wednesday of the week of 27 July, and one the following
// Monday that is past the bound — a card Jenn has pre-posted.
const cardDates = new Set([
  "2026-07-27",
  "2026-07-29",
  "2026-08-03",
]);
const latest = "2026-07-31";

describe("isSelectableCardDate", () => {
  it("admits a day inside the bound that has a card", () => {
    expect(isSelectableCardDate("2026-07-27", { cardDates, latest })).toBe(true);
  });

  it("refuses a day inside the bound with no card", () => {
    expect(isSelectableCardDate("2026-07-28", { cardDates, latest })).toBe(
      false,
    );
  });

  it("refuses a day past the bound even when it has a card", () => {
    // The clause that is NOT redundant with the query: the calendar can page
    // into next month, and a pre-posted card reached that way must stay dead.
    expect(isSelectableCardDate("2026-08-03", { cardDates, latest })).toBe(
      false,
    );
  });

  it("admits the bound itself when it has a card", () => {
    expect(
      isSelectableCardDate("2026-07-29", { cardDates, latest: "2026-07-29" }),
    ).toBe(true);
  });

  it("refuses a day older than every card", () => {
    expect(isSelectableCardDate("2026-01-05", { cardDates, latest })).toBe(
      false,
    );
  });

  it("refuses everything when there are no cards at all", () => {
    expect(
      isSelectableCardDate("2026-07-27", { cardDates: new Set(), latest }),
    ).toBe(false);
  });
});
