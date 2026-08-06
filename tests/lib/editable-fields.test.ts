/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { hasEditableFields } from "@/lib/editable-fields";
import { EDITABLE_MESSAGE, withEditableBootstrap } from "@/lib/printable-bootstrap";

function load(body: string): Element {
  document.documentElement.innerHTML = `<head></head><body>${body}</body>`;
  return document.documentElement;
}

describe("hasEditableFields", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
  });

  it("is false for a document with nothing to fill in", () => {
    // The case this whole probe exists for: a Dia worksheet answered by
    // clicking, saved, and served back with every <script> stripped. Its
    // answers are frozen pixels, so the Save pill must not stand over it.
    expect(
      hasEditableFields(
        load(`<div class="answer" onclick="pick()">le chien</div><p>Bravo!</p>`),
      ),
    ).toBe(false);
  });

  it("is true for a text field", () => {
    expect(hasEditableFields(load(`<input type="text">`))).toBe(true);
  });

  it("is true for an input with no type at all", () => {
    // Missing type means text in HTML, and a hand-written worksheet omits it
    // more often than not.
    expect(hasEditableFields(load(`<input>`))).toBe(true);
  });

  it("is true for a checkbox, a radio, a textarea and a select", () => {
    expect(hasEditableFields(load(`<input type="checkbox">`))).toBe(true);
    expect(hasEditableFields(load(`<input type="radio">`))).toBe(true);
    expect(hasEditableFields(load(`<textarea></textarea>`))).toBe(true);
    expect(hasEditableFields(load(`<select><option>a</option></select>`))).toBe(
      true,
    );
  });

  it("is true for a contenteditable element, and false when it says false", () => {
    expect(hasEditableFields(load(`<div contenteditable="true">x</div>`))).toBe(
      true,
    );
    // The bare attribute means true, which is why the selector matches on the
    // attribute and the value is what turns it off.
    expect(hasEditableFields(load(`<div contenteditable>x</div>`))).toBe(true);
    expect(hasEditableFields(load(`<div contenteditable="false">x</div>`))).toBe(
      false,
    );
  });

  it("ignores buttons, hidden fields and file inputs", () => {
    // None of these is an answer a student can give, and a file input's value
    // cannot be restored by the snapshot that would store it — snapshotDocument
    // skips exactly that type for the same reason.
    expect(
      hasEditableFields(
        load(
          `<input type="hidden" value="1"><input type="submit"><input type="button"><input type="reset"><input type="image"><input type="file">`,
        ),
      ),
    ).toBe(false);
  });

  it("ignores a disabled control and a readonly text field", () => {
    expect(hasEditableFields(load(`<input type="text" disabled>`))).toBe(false);
    expect(hasEditableFields(load(`<input type="text" readonly>`))).toBe(false);
    expect(hasEditableFields(load(`<textarea readonly></textarea>`))).toBe(false);
    expect(hasEditableFields(load(`<select disabled></select>`))).toBe(false);
  });

  it("still counts a readonly checkbox, because readonly does not stop a tick", () => {
    // readOnly has no effect on a checkbox or a radio in any browser. Treating
    // it as if it did would hide the pill on a worksheet a student can still
    // answer.
    expect(hasEditableFields(load(`<input type="checkbox" readonly>`))).toBe(
      true,
    );
  });

  it("ignores a field hidden by markup", () => {
    // The three a document can carry without a stylesheet. A field hidden by a
    // stylesheet still counts — the module's own comment states that limit and
    // why layout is not consulted.
    expect(hasEditableFields(load(`<input type="text" hidden>`))).toBe(false);
    expect(
      hasEditableFields(load(`<input type="text" style="display: none">`)),
    ).toBe(false);
    expect(
      hasEditableFields(load(`<input type="text" style="visibility:hidden">`)),
    ).toBe(false);
  });

  it("finds one editable field among many that are not", () => {
    expect(
      hasEditableFields(
        load(
          `<input type="hidden"><input type="text" disabled><div>x</div><input type="text">`,
        ),
      ),
    ).toBe(true);
  });

  it("round-trips through toString(), which is how it reaches a browser", () => {
    // The bootstrap inlines this function's SOURCE, so what ships is the
    // compiled output rather than this module. A compiler change that emitted a
    // helper call would break silently in a student's browser; this fails in CI
    // instead — the same guard tests/lib/snapshot-dom.test.ts keeps.
    const rebuilt = new Function(`return (${hasEditableFields.toString()})`)() as (
      root: Element,
    ) => boolean;

    expect(rebuilt(load(`<input type="text">`))).toBe(true);
    expect(rebuilt(load(`<div>le chien</div>`))).toBe(false);
  });

  it("injects its own listener and neither of the other messages", () => {
    const out = withEditableBootstrap("<p>hi</p>");
    expect(out.startsWith("<p>hi</p>")).toBe(true);
    expect(out).toContain(JSON.stringify(EDITABLE_MESSAGE));
    expect(out).toContain("hasEditableFields");
    expect(out).not.toContain("window.print()");
    expect(out).not.toContain("foreignObject");
  });
});
