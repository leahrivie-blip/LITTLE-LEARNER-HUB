#!/usr/bin/env node
/**
 * Focused harness test: list-field assertions must work when Enrichment
 * <details> is closed (textContent / value), and must not rely on innerText.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const {
  readPasteImportListFieldsInBrowser,
  assertListFieldsFromSnapshot,
} = require("./lib/tk-paste-smoke-dom-lists");

async function main() {
  const html = `<!doctype html>
<html><body>
<details class="tk-enrich-accordion" data-core-section="enrichment">
  <summary>Enrichment</summary>
  <div class="tk-enrich-accordion-body">
    <section data-import-field="observationPrompts">
      <div class="tk-enrich-tip-list">
        <div class="tk-enrich-tip-card"><span>Turns toward rattle</span><button type="button">×</button></div>
        <div class="tk-enrich-tip-card"><span>Tracks movement</span><button type="button">×</button></div>
      </div>
    </section>
    <section data-import-field="vocabulary">
      <div class="tk-enrich-vocab-list">
        <span class="tk-enrich-vocab-chip">rattle<button type="button">×</button></span>
        <span class="tk-enrich-vocab-chip">roll<button type="button">×</button></span>
        <span class="tk-enrich-vocab-chip">sound<button type="button">×</button></span>
      </div>
    </section>
    <textarea data-enrich-text-field="indoorAlternatives">Use a clean, firm floor area. SMOKE TEST ONLY.</textarea>
    <textarea data-enrich-text-field="extensions">Existing challenge text</textarea>
  </div>
</details>
</body></html>`;

  const tmp = path.join(os.tmpdir(), `tk-paste-smoke-dom-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, "utf8");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`file://${tmp}`, { waitUntil: "domcontentloaded" });

    // Ensure accordion stays closed.
    const openBefore = await page.evaluate(() => {
      const d = document.querySelector('details[data-core-section="enrichment"]');
      d.open = false;
      return d.open;
    });
    assert.strictEqual(openBefore, false, "fixture enrichment details must be closed");

    // Legacy innerText approach (what previously false-failed).
    const innerTextJoined = await page.evaluate(() => {
      const obs = [...document.querySelectorAll("[data-import-field='observationPrompts'], .tk-enrich-tip-list")]
        .map((el) => el.innerText || "");
      const vocab = [...document.querySelectorAll("[data-import-field='vocabulary'], .tk-enrich-vocab-list")]
        .map((el) => el.innerText || "");
      return [...obs, ...vocab].join("\n");
    });

    const snapshot = await page.evaluate(readPasteImportListFieldsInBrowser);
    assert.strictEqual(snapshot.enrichmentOpen, false, "reader reports closed accordion");
    assert.deepStrictEqual(snapshot.observationPrompts, ["Turns toward rattle", "Tracks movement"]);
    assert.deepStrictEqual(snapshot.vocabulary, ["rattle", "roll", "sound"]);
    assert.match(snapshot.indoor, /SMOKE TEST ONLY/);
    assert.match(snapshot.challenge, /Existing challenge/);

    const checked = assertListFieldsFromSnapshot(snapshot, {
      observationPrompts: ["Turns toward rattle", "Tracks movement"],
      vocabulary: ["rattle", "roll"],
    });
    assert.strictEqual(checked.ok, true, checked.errors.join("; "));

    // Document why the old harness failed: closed details => empty innerText.
    assert.ok(
      !/Turns toward rattle/i.test(innerTextJoined) || snapshot.observationPrompts.length > 0,
      "textContent reader must succeed even if innerText is blank",
    );
    if (!/Turns toward rattle/i.test(innerTextJoined)) {
      console.log("OK — closed <details> innerText is blank (expected); textContent reader still passes");
    } else {
      console.log("OK — textContent reader passes (innerText also visible in this environment)");
    }

    console.log("OK — tk-paste-smoke-dom-lists (closed details assertions)");
  } finally {
    await browser.close();
    fs.unlinkSync(tmp);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
