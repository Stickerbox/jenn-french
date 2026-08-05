// The FormData contract between PageEditor's pdf submit path and
// updatePdfPage's read of it. A plain HTML checkbox has no boolean wire
// format of its own — "on" when checked, absent (or, here, the empty string,
// since PageEditor always appends the field) otherwise — so that mapping is
// spelled out once, in one direction each way, rather than as a string
// literal on both ends of app/page-actions.ts and PageEditor.tsx that could
// drift out of step with nothing to catch it: app/page-actions.ts is
// "use server", so every export becomes a callable endpoint and this rule
// cannot live there and still be unit-tested (see revalidatePages's own note
// about that constraint). Both callers import this instead of writing the
// string themselves, so the writer and the reader agree by construction.
export const WORKSHEET_FIELD = "worksheet";
const WORKSHEET_ON_VALUE = "on";

export function worksheetFieldValue(checked: boolean): string {
  return checked ? WORKSHEET_ON_VALUE : "";
}

export function readWorksheetField(formData: FormData): boolean {
  return formData.get(WORKSHEET_FIELD) === WORKSHEET_ON_VALUE;
}
