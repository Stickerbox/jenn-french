/* eslint-disable no-var, @typescript-eslint/no-explicit-any --
 * This function's SOURCE is inlined into a browser <script> with
 * Function.prototype.toString() (see lib/printable-bootstrap.ts and the
 * "round-trips through toString()" test in tests/lib/snapshot-dom.test.ts).
 * `let`/`const` and modern syntax can compile to helper calls that close over
 * module scope, which would break silently once inlined — so this stays ES5
 * `var`, and the element bindings stay `any` because the function runs in a
 * browser that has never heard of TypeScript. Do not "fix" this file's style.
 */

// SELF-CONTAINED BY REQUIREMENT, NOT BY STYLE.
//
// lib/printable-bootstrap.ts inlines this function's source into a <script>
// with Function.prototype.toString(), the technique Playwright uses for
// page.evaluate. So it may not import anything, may not close over module
// scope, and may not use syntax the compiler turns into a helper call. It is
// written in the same ES5 idiom as the two bootstraps beside it so that the
// emitted source is predictable — and tests/lib/snapshot-dom.test.ts runs the
// toString() output, so a compiler change that broke this fails in CI rather
// than in a student's browser.
//
// It returns a document that is INERT but still TYPEABLE. Every <script> is
// removed, including the bootstrap that called this, and so is every other
// element a bootstrap injected (see the data-bootstrap-injected marker below)
// — a stored version carries no code of ours, the same discipline that keeps
// the print listener out of the admin's <a download>. Text fields, checkboxes
// and :checked CSS keep working because they are browser behaviour rather than
// JavaScript, which is what lets Jenn open a student's version and type her
// corrections into it.
//
// Keeping the scripts was considered and refused: it restores perfectly on a
// document whose JavaScript only wires event handlers, and SILENTLY WIPES
// EVERYTHING on one that rebuilds the DOM on load. Deterministic and degraded
// beats sometimes-perfect.
export function snapshotDocument(root: Element): string {
  var live = root.querySelectorAll("*");
  var clone = root.cloneNode(true) as Element;
  // A static NodeList, so replacing a canvas below cannot shift these indices.
  var copy = clone.querySelectorAll("*");
  // Lockstep, and it holds because the copy is a deep clone taken a moment ago
  // and nothing has mutated either since — the same argument settle() makes.
  var n = Math.min(live.length, copy.length);

  for (var i = 0; i < n; i++) {
    // `any` because this function is compiled for two worlds: the type checker
    // here and a browser that has never heard of TypeScript.
    var from = live[i] as any;
    var to = copy[i] as any;
    var tag = from.tagName;

    if (tag === "INPUT") {
      var type = String(from.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        // Removing matters as much as setting: a box the student CLEARED would
        // otherwise come back ticked from the markup's own attribute.
        if (from.checked) to.setAttribute("checked", "");
        else to.removeAttribute("checked");
      } else if (type !== "file" && type !== "password") {
        // A file input's value cannot be restored and a password has no place
        // in a stored worksheet. Everything else reflects into the attribute,
        // which is the default value a fresh parse reads.
        to.setAttribute("value", from.value == null ? "" : String(from.value));
      }
    } else if (tag === "TEXTAREA") {
      // A textarea has no value attribute; its content is its default value.
      to.textContent = from.value == null ? "" : String(from.value);
    } else if (tag === "OPTION") {
      // Options rather than selects, so `multiple` needs no separate branch.
      if (from.selected) to.setAttribute("selected", "");
      else to.removeAttribute("selected");
    } else if (tag === "CANVAS") {
      // Pixels do not serialise. A canvas becomes a picture of itself, which is
      // what makes a drawing widget worth saving at all.
      var data = "";
      try {
        data = from.toDataURL("image/png");
      } catch (e) {
        // A tainted canvas throws. That element is left as an empty canvas and
        // the rest of the snapshot is saved: one blank box beats losing the
        // page.
        data = "";
      }
      if (data && to.parentNode) {
        var img = (to.ownerDocument as Document).createElement("img");
        img.setAttribute("src", data);
        img.setAttribute("width", String(from.width));
        img.setAttribute("height", String(from.height));
        var cls = to.getAttribute("class");
        if (cls) img.setAttribute("class", cls);
        var style = to.getAttribute("style");
        if (style) img.setAttribute("style", style);
        to.parentNode.replaceChild(img, to);
      }
    }
  }

  // "data-bootstrap-injected" is BOOTSTRAP_MARKER_ATTR from
  // lib/printable-bootstrap.ts, copied as a literal rather than imported —
  // this file cannot import anything, see the banner above. It marks every
  // element a bootstrap injects that is NOT a <script>, such as the print
  // stylesheet: HTML parsing relocates a trailing <style> into <body> before
  // this walk ever runs, so without a marker it would be indistinguishable
  // from the document's own styles and would survive into the stored
  // snapshot — one extra copy per open/save cycle, monotonically.
  var marked = clone.querySelectorAll("[data-bootstrap-injected]");
  for (var j = 0; j < marked.length; j++) {
    var injected = marked[j];
    if (injected.parentNode) injected.parentNode.removeChild(injected);
  }

  // Every <script> regardless of marking — a separate, stronger rule than the
  // one above, and it must stay stronger: a stored version carries no code of
  // ours, the same discipline that keeps the print listener out of the
  // admin's <a download>.
  var scripts = clone.querySelectorAll("script");
  for (var k = 0; k < scripts.length; k++) {
    var script = scripts[k];
    if (script.parentNode) script.parentNode.removeChild(script);
  }

  return "<!doctype html>" + clone.outerHTML;
}
