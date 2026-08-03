/**
 * Dismiss Enrichment Editor auto-opened AI Lesson Teacher / AI suggest trays
 * so older slice tests can interact with Activity Studio / Live Preview / Publish.
 *
 * Important: close via the Cancel control (or Escape) so editor state.aiTray.open
 * resets. Removing the tray node alone leaves the editor thinking the tray is open.
 */
async function dismissEnrichmentAiTray(page, { timeoutMs = 12000 } = {}) {
  // Auto complete-kit generation can take a moment before Cancel exists.
  await page.waitForSelector("[data-ai-tray] [data-ai-cancel], [data-ai-tray]", {
    timeout: Math.min(4000, timeoutMs),
  }).catch(() => {});
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
    if (!status.open) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (!(await page.locator("[data-ai-tray]").count())) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  // Force Escape twice if Cancel never detached the tray.
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press("Escape").catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return !(await page.locator("[data-ai-tray]").count());
}

module.exports = { dismissEnrichmentAiTray };
