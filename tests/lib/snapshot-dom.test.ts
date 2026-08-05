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
