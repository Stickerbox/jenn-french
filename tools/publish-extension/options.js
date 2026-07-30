const DEFAULT_SITE = "https://francaisavecjenn.ca";

const tokenField = document.getElementById("token");
const siteField = document.getElementById("site");
const status = document.getElementById("status");

chrome.storage.local.get(["token", "site"]).then(({ token, site }) => {
  tokenField.value = token || "";
  siteField.value = site || DEFAULT_SITE;
});

document.getElementById("save").addEventListener("click", async () => {
  const token = tokenField.value.trim();
  const site = (siteField.value.trim() || DEFAULT_SITE).replace(/\/+$/, "");

  if (!token) {
    status.textContent = "Paste the token first.";
    status.style.color = "#a8462f";
    return;
  }

  await chrome.storage.local.set({ token, site });
  status.textContent = "Saved. Right-click a page to publish it.";
  status.style.color = "#4a6b52";
});
