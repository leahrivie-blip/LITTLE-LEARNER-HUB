#!/usr/bin/env node
"use strict";

/**
 * Shared Director Center / Family Hub mount helpers for Phase 12–14 captures.
 */

async function ensureExpansionScripts(page, viewName) {
  await page.waitForFunction(() => typeof window.LLHPlatformPerf?.ensureViewScripts === "function", null, { timeout: 20000 });
  await page.evaluate(async (view) => {
    await window.LLHPlatformPerf.ensureViewScripts(view);
  }, viewName);
}

async function mountDirectorFeature(page, { tab, renderName, mountId, marker }) {
  await ensureExpansionScripts(page, "director-center");
  await page.waitForFunction((name) => typeof window[name] === "function", renderName, { timeout: 20000 });
  const result = await page.evaluate(async ({ tabName, renderName: fnName, mountId: id }) => {
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.remove("active-view");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    });
    const section = document.querySelector("#view-director-center") || document.body;
    section.classList.add("active-view");
    section.hidden = false;
    section.setAttribute("aria-hidden", "false");
    section.style.display = "block";
    section.innerHTML = `<div id="${id}" class="dc-family-updates-mount"></div>`;
    const mount = document.querySelector(`#${id}`);
    const fn = window[fnName];
    if (typeof fn !== "function") return { ok: false, reason: `missing ${fnName}` };
    await fn(mount);
    const markerEl = document.querySelector("[data-feature-marker]");
    return {
      ok: Boolean(markerEl),
      visible: Boolean(markerEl && markerEl.getClientRects().length > 0),
      tabName,
      display: getComputedStyle(section).display,
      html: (mount?.innerHTML || "").slice(0, 180),
    };
  }, { tabName: tab, renderName, mountId });
  if (!result?.ok || !result?.visible) {
    throw new Error(`Failed to mount Director feature ${tab}/${marker}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function openFamilyHubTab(page, tab) {
  await ensureExpansionScripts(page, "family-hub");
  await page.waitForFunction(() => typeof window.renderFamilyHubPage === "function", null, { timeout: 20000 });
  await page.evaluate(async (nextTab) => {
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.remove("active-view");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    });
    const section = document.querySelector("#view-family-hub");
    if (section) {
      section.classList.add("active-view");
      section.hidden = false;
      section.setAttribute("aria-hidden", "false");
      section.style.display = "block";
    }
    if (typeof window.familyHubUiState === "object") {
      window.familyHubUiState.tab = nextTab;
    }
    await window.renderFamilyHubPage();
  }, tab);
}

module.exports = {
  ensureExpansionScripts,
  mountDirectorFeature,
  openFamilyHubTab,
};
