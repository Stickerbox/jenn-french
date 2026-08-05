/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { snapshotDocument } from "@/lib/snapshot-dom";

function load(body: string): Element {
  document.documentElement.innerHTML = `<head></head><body>${body}</body>`;
  return document.documentElement;
}

// Re-parses a snapshot so assertions are about what a browser would render from
// it, not about the string. That is the actual contract: a stored version has
// to come back as the state it was saved in.
function reparse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("snapshotDocument", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
  });

  it("writes a typed value into the markup", () => {
    const root = load(`<input id="a" type="text">`);
    (document.getElementById("a") as HTMLInputElement).value = "bonjour";

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.getAttribute("value")).toBe("bonjour");
  });

  it("writes a ticked box into the markup, and an unticked one out of it", () => {
    const root = load(`<input id="a" type="checkbox"><input id="b" type="checkbox" checked>`);
    (document.getElementById("a") as HTMLInputElement).checked = true;
    (document.getElementById("b") as HTMLInputElement).checked = false;

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.hasAttribute("checked")).toBe(true);
    // Unticking has to REMOVE the attribute, or a box the student cleared comes
    // back ticked.
    expect(out.getElementById("b")?.hasAttribute("checked")).toBe(false);
  });

  it("writes a chosen radio and clears its siblings", () => {
    const root = load(
      `<input id="a" type="radio" name="q" checked><input id="b" type="radio" name="q">`,
    );
    (document.getElementById("b") as HTMLInputElement).checked = true;

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.hasAttribute("checked")).toBe(false);
    expect(out.getElementById("b")?.hasAttribute("checked")).toBe(true);
  });

  it("writes a textarea's value as its text content", () => {
    // A textarea has no value attribute. Its content IS its default value, so
    // that is where the typed text has to go.
    const root = load(`<textarea id="a"></textarea>`);
    (document.getElementById("a") as HTMLTextAreaElement).value = "ma réponse";

    const out = reparse(snapshotDocument(root));
    expect((out.getElementById("a") as HTMLTextAreaElement).value).toBe("ma réponse");
  });

  it("writes the chosen option of a select", () => {
    const root = load(
      `<select id="a"><option value="1">un</option><option value="2">deux</option></select>`,
    );
    (document.getElementById("a") as HTMLSelectElement).value = "2";

    const out = reparse(snapshotDocument(root));
    expect((out.getElementById("a") as HTMLSelectElement).value).toBe("2");
  });

  it("writes every chosen option of a multiple select", () => {
    const root = load(
      `<select id="a" multiple><option value="1">un</option><option value="2">deux</option><option value="3">trois</option></select>`,
    );
    const select = document.getElementById("a") as HTMLSelectElement;
    select.options[0].selected = true;
    select.options[2].selected = true;

    const out = reparse(snapshotDocument(root));
    const options = (out.getElementById("a") as HTMLSelectElement).options;
    expect(options[0].hasAttribute("selected")).toBe(true);
    expect(options[1].hasAttribute("selected")).toBe(false);
    expect(options[2].hasAttribute("selected")).toBe(true);
  });

  it("clears `selected` from an option the student unpicked", () => {
    // The multiple-select test above never starts an option selected, so it
    // never exercises removeAttribute("selected") — only the branch beside
    // it. This is the option-list twin of the checkbox uncheck test: an
    // option the student turned OFF must not come back on.
    const root = load(
      `<select id="a" multiple><option id="o1" value="1" selected>un</option><option id="o2" value="2">deux</option></select>`,
    );
    (document.getElementById("o1") as HTMLOptionElement).selected = false;

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("o1")?.hasAttribute("selected")).toBe(false);
  });

  it("never writes a typed password, or any file value, into the markup", () => {
    // Not just "the code happens to skip these" — a stored version is served
    // from a guessable public slug, so a typed password reaching value= would
    // be a privacy leak, not just a display bug. A file input's value cannot
    // be restored from markup at all.
    const root = load(`<input id="a" type="password"><input id="b" type="file">`);
    (document.getElementById("a") as HTMLInputElement).value = "secret123";

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.hasAttribute("value")).toBe(false);
    expect(out.getElementById("b")?.hasAttribute("value")).toBe(false);
  });

  it("keeps whatever the page's own JavaScript put in the DOM", () => {
    // This is the whole reason a version is a snapshot and not an answer set.
    // Drag-and-drop results, generated question lists and div-based pickers are
    // all DOM by the time Save is pressed.
    const root = load(`<div id="drop" class="filled"><span>chat</span></div>`);

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("drop")?.className).toBe("filled");
    expect(out.getElementById("drop")?.textContent).toBe("chat");
  });

  it("keeps contenteditable content, which costs it nothing", () => {
    const root = load(`<div id="a" contenteditable="true"><b>gras</b></div>`);

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.innerHTML).toBe("<b>gras</b>");
  });

  it("replaces a canvas with a picture of itself, and a later element still pairs correctly", () => {
    // happy-dom has no real rasteriser, so toDataURL is stubbed on the
    // element rather than exercised for real — the point is to pin the DOM
    // walk's replacement, not the browser's rendering.
    //
    // The canvas branch is the only one that mutates the CLONE mid-loop
    // (replaceChild), which is exactly the hazard the lockstep comment above
    // the loop defends against: if the replacement shifted later indices,
    // the input after the canvas would either be skipped or would receive
    // the canvas's own write instead of its.
    const root = load(`<canvas id="a" width="10" height="7"></canvas><input id="b" type="text">`);
    const canvas = document.getElementById("a") as HTMLCanvasElement;
    canvas.toDataURL = () => "data:image/png;base64,AAAA";
    (document.getElementById("b") as HTMLInputElement).value = "bonjour";

    const out = reparse(snapshotDocument(root));
    // The canvas is gone — replaced by an <img>, which carries no id.
    expect(out.getElementById("a")).toBeNull();
    const img = out.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(img?.getAttribute("width")).toBe("10");
    expect(img?.getAttribute("height")).toBe("7");
    // The next element's own write must land on the next element, not be
    // lost or misapplied because the canvas ahead of it was swapped out.
    expect(out.getElementById("b")?.getAttribute("value")).toBe("bonjour");
    // The live canvas the student is looking at is never touched.
    expect(document.getElementById("a")?.tagName).toBe("CANVAS");
  });

  it("leaves a tainted canvas in place and still saves the rest of the document", () => {
    // toDataURL throws on a tainted canvas. That element is left as an empty
    // canvas rather than losing the whole snapshot to one thrown error.
    const root = load(`<canvas id="a" width="5" height="5"></canvas><p>gardé</p>`);
    const canvas = document.getElementById("a") as HTMLCanvasElement;
    canvas.toDataURL = () => {
      throw new Error("tainted");
    };

    const out = reparse(snapshotDocument(root));
    expect(out.getElementById("a")?.tagName).toBe("CANVAS");
    expect(out.querySelector("img")).toBeNull();
    expect(out.querySelector("p")?.textContent).toBe("gardé");
  });

  it("strips every script, including the bootstrap that called it", () => {
    // A stored version contains no code of ours — the same discipline that
    // keeps the print listener out of the admin's <a download>. And it is what
    // makes a version DETERMINISTIC: a snapshot that re-runs its own init code
    // silently wipes everything on a document that rebuilds the DOM on load.
    const root = load(`<p>gardé</p><script>window.x = 1</script>`);

    const out = reparse(snapshotDocument(root));
    expect(out.querySelectorAll("script")).toHaveLength(0);
    expect(out.querySelector("p")?.textContent).toBe("gardé");
  });

  it("leaves the live document untouched", () => {
    // It also renders what the student is looking at. Writing attributes onto
    // the live tree would be visible mid-save.
    const root = load(`<input id="a" type="text">`);
    (document.getElementById("a") as HTMLInputElement).value = "bonjour";

    snapshotDocument(root);
    expect(document.getElementById("a")?.hasAttribute("value")).toBe(false);
  });

  it("emits a doctype, so the result parses in standards mode", () => {
    expect(snapshotDocument(load("<p>x</p>")).startsWith("<!doctype html>")).toBe(true);
  });

  it("survives a document with no form controls at all", () => {
    const out = reparse(snapshotDocument(load("<p>Bonjour</p>")));
    expect(out.querySelector("p")?.textContent).toBe("Bonjour");
  });

  it("round-trips through toString(), which is how it reaches the browser", () => {
    // lib/printable-bootstrap.ts inlines this function's SOURCE. If the
    // compiler ever emits something that closes over module scope, this fails
    // here rather than silently in a student's browser.
    const root = load(`<input id="a" type="text">`);
    (document.getElementById("a") as HTMLInputElement).value = "bonjour";

    const inlined = new Function(
      "root",
      `return (${snapshotDocument.toString()})(root);`,
    ) as (root: Element) => string;

    expect(inlined(root)).toBe(snapshotDocument(root));
  });
});
