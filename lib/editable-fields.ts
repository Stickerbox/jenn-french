/* eslint-disable no-var, @typescript-eslint/no-explicit-any --
 * This function's SOURCE is inlined into a browser <script> with
 * Function.prototype.toString(), exactly as lib/snapshot-dom.ts is. See that
 * file's header: the same ES5 rule applies here for the same reason, and
 * tests/lib/editable-fields.test.ts runs the toString() output so a compiler
 * change that broke it fails in CI rather than in a student's browser.
 */

// SELF-CONTAINED BY REQUIREMENT, NOT BY STYLE. No imports, no closure over
// module scope, no syntax a compiler turns into a helper call.
//
// Answers one question about a served worksheet: can a person still change
// anything in it WITHOUT the document's own JavaScript?
//
// That question exists because snapshotDocument strips every <script> from
// what it stores. A saved version therefore keeps what the BROWSER drives —
// typing, checkboxes, radios, selects, contenteditable — and loses everything
// the page's own code drove. A Dia worksheet answered by clicking animated
// elements comes back as frozen pixels, and until this existed the Save pill
// stood over it offering to re-save a document nobody could edit.
//
// So the shell asks the document, rather than guessing from the row: two
// worksheets on the same shelf can differ, and only the document knows. The
// frame has an opaque origin, so it has to answer for itself — the same
// reason the capture bootstrap rasterises itself instead of being read.
//
// VISIBILITY IS JUDGED FROM THE MARKUP, NOT FROM LAYOUT. `getClientRects` was
// the obvious test and is deliberately not used: it needs a layout engine, so
// it cannot be tested here at all (the test environment is happy-dom, which
// has none), and an untestable rule in the middle of a student's homework is
// worse than a coarser one that is pinned. The accepted cost is stated: a
// field hidden by a stylesheet rather than by markup still counts as
// editable, so the pill can appear on a document whose fields nobody can
// reach. That failure is a control that saves the same bytes again; the
// reverse failure hides the only way to save.
export function hasEditableFields(root: Element): boolean {
  var nodes = root.querySelectorAll(
    "input, textarea, select, [contenteditable]",
  );

  for (var i = 0; i < nodes.length; i++) {
    // `any` because this is compiled for two worlds: the type checker here and
    // a browser that has never heard of TypeScript.
    var el = nodes[i] as any;

    // Hidden in the markup. `hidden` and inline display/visibility are the
    // three a document can carry without a stylesheet, which is what this can
    // honestly check — see the note above.
    if (el.hasAttribute("hidden")) continue;
    var inline = String((el.getAttribute("style") || "")).replace(/\s+/g, "");
    if (inline.indexOf("display:none") !== -1) continue;
    if (inline.indexOf("visibility:hidden") !== -1) continue;

    // A disabled control is not editable by anyone. Read through the property
    // rather than the attribute so a value set by script before the snapshot
    // is honoured — the snapshot reflects those into markup anyway.
    if (el.disabled) continue;

    var tag = el.tagName;

    if (tag === "INPUT") {
      // Missing type means text, which is the HTML default and the common case
      // in a hand-written worksheet.
      var type = String(el.type || "text").toLowerCase();
      // A button is not an answer, a hidden field is not on screen, and a file
      // input's value cannot be restored by the snapshot that would store it —
      // snapshotDocument skips exactly that type for the same reason.
      if (
        type === "hidden" ||
        type === "button" ||
        type === "submit" ||
        type === "reset" ||
        type === "image" ||
        type === "file"
      ) {
        continue;
      }
      // readOnly stops typing but does NOT stop a box being ticked, which is
      // why it is not consulted for those two.
      if (el.readOnly && type !== "checkbox" && type !== "radio") continue;
    } else if (tag === "TEXTAREA") {
      if (el.readOnly) continue;
    } else if (tag !== "SELECT") {
      // Whatever the [contenteditable] half of the selector matched.
      // `contenteditable="false"` is the one value that turns it off, and it
      // is the reason this is a selector on the attribute rather than a test
      // of its presence.
      var flag = String(el.getAttribute("contenteditable") || "").toLowerCase();
      if (flag === "false") continue;
    }

    return true;
  }

  return false;
}
