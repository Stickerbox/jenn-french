// The only two formatters in this project that do NOT pass timeZone: "UTC".
// That rule earned its place because a card belongs to a teaching day Jenn
// picks and a week runs Monday to Friday wherever anyone is standing. A chat
// message belongs to no such day — it belongs to the moment someone typed it,
// and printing "8:02 p.m." under tomorrow's date is not consistency.
// See docs/superpowers/specs/2026-08-04-chat-inbox-design.md.
//
// `timeZone` defaults to undefined, which Intl reads as "the runtime's zone" —
// in a browser, the reader's. Nothing in this app passes it. It is a parameter
// so the tests can pin a zone without mutating process.env.TZ, which would leak
// into every other test in the run.

export function localDayKey(date: Date, timeZone?: string): string {
  // en-CA emits YYYY-MM-DD directly, which is the same key shape the UTC
  // version produced with toISOString().slice(0, 10), so nothing downstream
  // changes shape. Building it from getFullYear()/getMonth()/getDate() would
  // work for the ambient case and could not express an explicit zone at all —
  // which is exactly what makes this one testable.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatTime(
  date: Date,
  locale: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
