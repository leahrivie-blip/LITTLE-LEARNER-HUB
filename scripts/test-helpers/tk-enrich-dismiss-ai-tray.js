/**
 * Dismiss Enrichment Editor auto-opened AI Lesson Teacher / AI suggest trays
 * so older slice tests can interact with Activity Studio / Live Preview / Publish.
 *
 * Important: close via the Cancel control (or Escape) so editor state.aiTray.open
 * resets. Removing the tray node alone leaves the editor thinking the tray is open.
 */
async function dismissEnrichmentAiTray(page, { timeoutMs = 10000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await page.evaluate(() => {
      const tray = document.querySelector("[data-ai-tray]");
      if (!tray) return { open: false };
      const cancel = tray.querySelector("[data-ai-cancel]");
      if (cancel) {
        cancel.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      return { open: Boolean(document.querySelector("[data-ai-tray]")) };
    }).catch(() => ({ open: true }));
    if (!status.open) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  // Force state reset if Cancel never detached the tray.
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 150));
  return !(await page.locator("[data-ai-tray]").count());
}

module.exports = { dismissEnrichmentAiTray };
