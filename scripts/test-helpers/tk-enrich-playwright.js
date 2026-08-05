/**
 * Shared Playwright helpers for Teaching Kit Enrichment Editor suites.
 * Prefer product-visible shells and viewport-safe clicks — do not relax product asserts.
 */

/** Hide cookie/consent chrome without matching body.has-meta-cookie-notice (class*='cookie'). */
async function hideCookieConsentChrome(page) {
  await page.evaluate(() => {
    const selectors = [
      "#cookieBanner",
      ".llh-cookie",
      ".llh-meta-cookie-notice",
      "[id*='cookieBanner']",
      "[id*='CookieBanner']",
      "[class*='cookie-banner']",
      "[class*='cookie-notice']",
      "[class*='cookie-consent']",
      "[id*='consent']",
      "[class*='consent-banner']",
      "[class*='consent-notice']",
    ];
    document.querySelectorAll(selectors.join(", ")).forEach((el) => {
      if (el === document.body || el === document.documentElement) return;
      el.style.display = "none";
    });
  });
}

async function ensureEnrichmentEditorOpen(page, { timeoutMs = 10000 } = {}) {
  // Product CSS: #adminTeachingKitEnrichmentHost is display:none until body.tk-enrich-open.
  // Some suites open the editor via page.evaluate; a stray Escape/cancel can clear the class
  // while the shell node remains. Re-apply the open class only when shell content exists.
  await page.waitForFunction(
    () => Boolean(document.querySelector(".tk-enrich-shell")),
    null,
    { timeout: timeoutMs },
  );
  await page.evaluate(() => {
    // Harness must not leave body display:none (broad cookie selectors used to match
    // has-meta-cookie-notice on <body> and hide the whole document).
    if (document.body.style.display === "none") document.body.style.display = "";
    // Product gate: host is display:none until body.tk-enrich-open.
    // Re-assert open state for evaluate()-driven harness opens (do not invent content).
    if (!document.querySelector(".tk-enrich-shell")) return;
    document.body.classList.add("tk-enrich-open");
    const host = document.querySelector("#adminTeachingKitEnrichmentHost");
    if (host) {
      host.style.display = "block";
      host.removeAttribute("hidden");
    }
  });
  // Wait a frame for layout after unhiding the fixed host.
  await page.waitForTimeout(50);
  const shell = page.locator(".tk-enrich-shell").first();
  await shell.waitFor({ state: "visible", timeout: timeoutMs });
  return shell;
}

async function clickEnrichmentMode(page, mode) {
  const tab = page.locator(`.tk-enrich-modes [data-enrich-mode="${mode}"], [data-enrich-mode="${mode}"]`).first();
  await tab.waitFor({ state: "attached", timeout: 10000 });
  await tab.scrollIntoViewIfNeeded();
  // Prefer a real click when the tab is in view; force only after scroll.
  try {
    await tab.click({ timeout: 5000 });
  } catch {
    await tab.click({ force: true, timeout: 5000 });
  }
}

async function clickPublishCancel(page) {
  // Prefer the labeled Cancel action (not the full-screen backdrop).
  const cancel = page.locator(".tk-enrich-publish-actions [data-publish-cancel], button.ghost-button[data-publish-cancel]").first();
  await cancel.waitFor({ state: "attached", timeout: 10000 });
  await cancel.scrollIntoViewIfNeeded();
  try {
    await cancel.click({ timeout: 8000 });
  } catch {
    await cancel.click({ force: true, timeout: 8000 });
  }
}

async function clickPreviewViewport(page, viewport) {
  const btn = page.locator(`[data-preview-viewport="${viewport}"]`).first();
  await btn.waitFor({ state: "attached", timeout: 10000 });
  // Sticky chrome / off-screen toggles after resize: scroll the product control into view,
  // then dispatch a bubbling click on that exact button (same path as a user pointer event).
  const clicked = await page.evaluate((vp) => {
    const el = document.querySelector(`[data-preview-viewport="${vp}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, viewport);
  if (!clicked) {
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ force: true, timeout: 5000 });
  }
  await page.waitForFunction(
    (vp) => Boolean(document.querySelector(`.tk-enrich-preview-frame.is-${vp}`)),
    viewport,
    { timeout: 8000 },
  );
}

module.exports = {
  hideCookieConsentChrome,
  ensureEnrichmentEditorOpen,
  clickEnrichmentMode,
  clickPreviewViewport,
  clickPublishCancel,
};
