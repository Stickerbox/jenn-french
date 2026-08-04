const MENU_ID = "publish-page";
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SITE = "https://francaisavecjenn.ca";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Publish this page to Français Avec Jenn",
    contexts: ["page", "selection", "image", "link"],
  });
});

// Two ways in, one path: the toolbar button is the discoverable one, the
// right-click item is the one that is already under the cursor.
chrome.action.onClicked.addListener((tab) => run(tab));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  run(tab);
});

async function run(tab) {
  console.log(`[publish] invoked on: ${tab?.url || "(no url)"}`);

  if (!tab?.id) {
    notify("Nothing to publish", "Open the page you want to publish first.");
    return;
  }

  try {
    await publish(tab);
  } catch (err) {
    notify("Could not publish", err instanceof Error ? err.message : String(err));
  }
}

async function publish(tab) {
  const { token, site } = await chrome.storage.local.get(["token", "site"]);
  const siteUrl = (site || DEFAULT_SITE).replace(/\/+$/, "");

  if (!token) {
    chrome.runtime.openOptionsPage();
    notify("Token needed", "Paste your publishing token, then try again.");
    return;
  }

  // activeTab grants access to this one tab, and only because the teacher just
  // invoked the extension on it. Asking for <all_urls> instead would work but
  // would make the browser warn that this reads every site she visits, which
  // is both untrue and alarming.
  let result;
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: capturePage,
    });
  } catch (err) {
    throw new Error(unreadableReason(tab, err));
  }

  if (!result) throw new Error("Could not read this page.");

  // Bytes, not characters — the site measures the cap the same way, and an
  // accented French page is longer on the wire than its length suggests.
  const size = new TextEncoder().encode(result.html).length;
  if (size > MAX_PAGE_BYTES) {
    throw new Error(`That page is ${(size / 1048576).toFixed(1)} MB — the limit is 2 MB.`);
  }

  const response = await fetch(`${siteUrl}/api/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: result.title, html: result.html }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `The site said ${response.status}.`);
  }

  // The site folds a page's external scripts, stylesheets, images and fonts into
  // the document when it publishes, and lists whatever it could not. The count
  // goes in the notification because a notification has no room for URLs; the
  // list goes to the console, which is where the service worker inspector is.
  //
  // Array.isArray rather than a truthiness test: the extension is loaded
  // unpacked and is not redeployed with the site, so it will outlive at least
  // one version that does not send the field.
  const skipped = Array.isArray(data.skipped) ? data.skipped : [];
  if (skipped.length > 0) {
    console.log(
      `[publish] could not be included:\n${skipped
        .map((item) => `  ${item.url} — ${item.reason}`)
        .join("\n")}`,
    );
  }

  // Published with no groups, so the link works immediately but no class sees
  // it yet. Opening the editor is how she picks the groups and fixes the title
  // without having to find the page in the admin list.
  const slug = data.url.split("/p/").pop();
  chrome.tabs.create({ url: `${siteUrl}/admin/pages/${slug}` });
  notify(
    "Published",
    skipped.length > 0
      ? `${data.url} — ${skipped.length} file(s) could not be included`
      : data.url,
    true,
  );
}

// The browser's own message here is developer-speak and names no remedy, so
// each scheme that cannot be read gets the sentence that actually helps. The
// URL goes to the console either way — without it, "can't read this page" is
// indistinguishable between a saved file, a preview pane, and a browser page.
function unreadableReason(tab, err) {
  const url = tab.url || "";
  console.log(`[publish] could not read tab: ${url || "(no url)"} — ${err}`);

  if (url.startsWith("file:")) {
    return "To publish a saved file, turn on “Allow access to file URLs” in this extension's Details page.";
  }
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return "This is a preview, not a page with an address. Save it as an .html file and open that instead.";
  }
  if (url && !/^https?:/.test(url)) {
    return `A ${url.split(":")[0]}: page can't be read by an extension. Open the HTML in a normal tab first.`;
  }
  return "Could not read this page. Reload it, then publish again.";
}

// Runs in the page, not here. Returns the source a browser would need to
// render this page again: outerHTML drops the doctype, and without it the
// republished copy renders in quirks mode and looks subtly wrong.
function capturePage() {
  const doctype = document.doctype ? `<!doctype ${document.doctype.name}>\n` : "";
  return {
    title: document.title || "Untitled page",
    html: doctype + document.documentElement.outerHTML,
  };
}

// Three channels on purpose. Dia's chrome is custom and may not surface a
// system notification at all, and a failure nobody sees is the worst outcome
// here — the teacher would assume the page published. The badge always shows,
// and the console line is what makes the service worker inspector useful.
function notify(title, message, ok = false) {
  console.log(`[publish] ${title}: ${message}`);

  chrome.action.setBadgeText({ text: ok ? "✓" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#1a7a3c" : "#a8462f" });
  chrome.action.setTitle({ title: `${title} — ${message}` });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 8000);

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title,
    message,
  });
}
