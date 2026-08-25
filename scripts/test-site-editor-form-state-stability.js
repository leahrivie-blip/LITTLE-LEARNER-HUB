#!/usr/bin/env node
/**
 * Regression: Admin Site Editor forms must keep in-progress input across background re-renders.
 *
 * Run: npm run test:site-editor-form-state-stability
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(21800, 400);
const STORE_PATH = path.join(os.tmpdir(), `llh-site-editor-form-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "site-editor-admin@example.com",
  password: "site-editor-admin-pass",
  code: "site-editor-admin-code",
};

const SITE_EDITOR_SECTIONS = [
  { tab: "hero", form: "#adminHeroForm", field: 'input[name="heroHeadline"]', draft: "Site Editor Hero Draft" },
  { tab: "trust", form: "#adminTrustForm", field: 'input[name="trustSectionHeading"]', draft: "Trust Heading Draft" },
  { tab: "journey", form: "#adminJourneyForm", field: 'input[name="journeySectionHeading"]', draft: "Journey Heading Draft" },
  { tab: "reviews-cta", form: "#adminReviewsCtaForm", field: 'input[name="reviewsSectionHeading"]', draft: "Reviews Section Draft" },
  { tab: "founding", form: "#adminFoundingForm", field: 'input[name="heading"]', draft: "Founding Heading Draft" },
  { tab: "pricing", form: "#adminPricingForm", field: 'input[name="sectionTitle"]', draft: "Pricing Title Draft" },
  { tab: "free-plan", form: "#adminFreePlanAccessForm", field: 'input[name="earlySupporterTitle"]', draft: "Early Supporter Draft" },
  { tab: "faqs", form: "#adminFaqForm", field: 'input[name="question"]', draft: "FAQ question draft?" },
  { tab: "announcement", form: "#adminAnnouncementForm", field: 'textarea[name="text"]', draft: "Announcement draft text" },
  { tab: "promo-codes", form: "#adminPromoCodeForm", field: 'input[name="code"]', draft: "PROMODRAFT" },
  { tab: "in-app-announcements", form: "#adminInAppAnnouncementForm", field: '#adminInAppAnnouncementForm input[name="title"]', draft: "In-app title draft" },
  { tab: "upgrade-msg", form: "#adminUpgradeMsgForm", field: 'input[name="upgradePopupHeadline"]', draft: "Upgrade popup draft" },
];

let passCount = 0;
let failCount = 0;

function pass(name) {
  passCount += 1;
  console.log(`PASS  ${name}`);
}

function fail(name, detail) {
  failCount += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(store = { users: {}, siteContent: { homepage: {} }, adminSessions: {} }) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function waitForApp(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => typeof renderAdminSiteEditorSection === "function" && document.body.classList.contains("app-booted"),
    null,
    { timeout: 30000 },
  );
}

async function unlockAdmin(page) {
  const login = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  if (login.status !== 200 || !login.json?.token) {
    throw new Error(`Admin login failed: ${login.status} ${login.text || ""}`);
  }
  await page.evaluate(({ adminEmail, token }) => {
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminSession", JSON.stringify({
      email: adminEmail,
      token,
      unlockedAt: new Date().toISOString(),
    }));
  }, { adminEmail: ADMIN.email, token: login.json.token });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await page.evaluate(async () => {
    if (typeof loadAdminSiteContent === "function") {
      try { await loadAdminSiteContent(); } catch { /* ignore */ }
    }
  });
}

async function openSiteEditorTab(page, tab) {
  await page.evaluate((tabId) => {
    setView("admin");
    if (typeof setAdminSectionTab === "function") setAdminSectionTab(tabId);
    if (typeof renderAdminSiteEditorSection === "function") renderAdminSiteEditorSection(tabId);
    if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
  }, tab);
}

async function triggerBackgroundAdminRerender(page) {
  await page.evaluate(() => {
    if (typeof syncFoundingStatus === "function") syncFoundingStatus({ render: true }).catch(() => {});
    if (typeof renderAdminDashboard === "function") renderAdminDashboard();
  });
}

async function testHeroTypingThroughPoll(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  const draft = "Typed Hero Headline Draft";
  await page.fill('input[name="heroHeadline"]', "");
  await page.click('input[name="heroHeadline"]');
  for (const ch of draft) {
    await page.keyboard.type(ch, { delay: 10 });
    if (ch === "o") await triggerBackgroundAdminRerender(page);
  }
  const value = await page.inputValue('input[name="heroHeadline"]');
  if (value !== draft) fail("hero typing through poll", `got "${value}"`);
  else pass("hero typing survives mid-typing background rerender");
}

async function testHeroFocusThroughPoll(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  const draft = "Focus Retention Draft";
  await page.fill('input[name="heroHeadline"]', draft);
  await page.focus('input[name="heroHeadline"]');
  await page.evaluate((len) => {
    const input = document.querySelector('#adminHeroForm input[name="heroHeadline"]');
    if (input) input.setSelectionRange(len, len);
  }, draft.length);
  await triggerBackgroundAdminRerender(page);
  const after = await page.evaluate(() => ({
    value: document.querySelector('#adminHeroForm input[name="heroHeadline"]')?.value || "",
    focused: document.activeElement?.matches('#adminHeroForm input[name="heroHeadline"]'),
    selectionStart: document.querySelector('#adminHeroForm input[name="heroHeadline"]')?.selectionStart,
  }));
  if (after.value !== draft) fail("hero focus poll value", after.value);
  else if (!after.focused) fail("hero focus poll", "focus lost");
  else pass("hero focus retained after background rerender");
}

async function testMultipleFieldTypes(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  await page.fill('textarea[name="heroSubheadline"]', "Textarea draft body");
  await openSiteEditorTab(page, "announcement");
  await page.waitForSelector("#adminAnnouncementForm");
  const flashWasChecked = await page.isChecked('input[name="flashReferralBannerEnabled"]');
  await page.setChecked('input[name="flashReferralBannerEnabled"]', !flashWasChecked);
  await page.selectOption('select[name="location"]', "homepage");
  await triggerBackgroundAdminRerender(page);
  const state = await page.evaluate(() => ({
    textarea: document.querySelector('#adminAnnouncementForm textarea[name="text"]')?.value || "",
    flash: document.querySelector('#adminAnnouncementForm input[name="flashReferralBannerEnabled"]')?.checked,
    location: document.querySelector('#adminAnnouncementForm select[name="location"]')?.value || "",
  }));
  const heroTextarea = await page.evaluate(() => document.querySelector('#adminHeroForm textarea[name="heroSubheadline"]')?.value || "");
  if (heroTextarea !== "Textarea draft body") fail("textarea protection", heroTextarea);
  else if (state.flash !== !flashWasChecked) fail("checkbox protection", String(state.flash));
  else if (state.location !== "homepage") fail("select protection", state.location);
  else pass("textarea/checkbox/select survive background rerender on announcement tab");
}

async function testFailedSavePreservesEdits(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  await page.fill('input[name="heroHeadline"]', "Failed Save Headline");
  await page.evaluate(() => {
    window.__restoreSaveAdminSiteContent = window.saveAdminSiteContent;
    window.saveAdminSiteContent = async () => { throw new Error("Simulated save failure"); };
  });
  await page.click('#adminHeroForm button[type="submit"]');
  await page.waitForTimeout(800);
  const value = await page.inputValue('input[name="heroHeadline"]');
  await page.evaluate(() => {
    if (typeof window.__restoreSaveAdminSiteContent === "function") {
      window.saveAdminSiteContent = window.__restoreSaveAdminSiteContent;
    }
  });
  if (value !== "Failed Save Headline") fail("failed save preserves edits", value);
  else pass("failed save preserves unsaved hero headline");
}

async function waitForHeroSaveValue(page, expectedHeadline) {
  await page.waitForFunction((headline) => {
    const current = effectiveSiteContent()?.homepage?.heroHeadline || "";
    return current === headline;
  }, expectedHeadline, { timeout: 30000 });
}

async function testSuccessfulSaveBaseline(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  const saved = `Saved Hero ${Date.now()}`;
  await page.fill('input[name="heroHeadline"]', saved);
  await page.fill('textarea[name="heroSubheadline"]', "Saved subheadline");
  await page.click('#adminHeroForm button[type="submit"]');
  await waitForHeroSaveValue(page, saved);
  await triggerBackgroundAdminRerender(page);
  const after = await page.inputValue('input[name="heroHeadline"]');
  if (after !== saved) fail("successful save baseline", `expected "${saved}" got "${after}"`);
  else pass("successful save remains baseline after background rerender");
}

async function simulateServerSiteContentUpdate(page, patch) {
  await page.evaluate((patch) => {
    const base = siteContentState || {};
    siteContentState = {
      ...base,
      ...patch,
      homepage: patch.homepage ? { ...(base.homepage || {}), ...patch.homepage } : base.homepage,
      announcement: patch.announcement ? { ...(base.announcement || {}), ...patch.announcement } : base.announcement,
    };
  }, patch);
}

async function testCleanFormRefreshFromServerUpdate(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  const serverHeadline = `Server Refresh ${Date.now()}`;
  await simulateServerSiteContentUpdate(page, { homepage: { heroHeadline: serverHeadline } });
  await triggerBackgroundAdminRerender(page);
  const after = await page.inputValue('input[name="heroHeadline"]');
  if (after !== serverHeadline) fail("clean form refresh from server update", `expected "${serverHeadline}" got "${after}"`);
  else pass("clean hero form refreshes to updated server headline");
}

async function testDirtyFormPreservedDuringServerUpdate(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  const localDraft = "Local Unsaved Hero Draft";
  await page.fill('input[name="heroHeadline"]', localDraft);
  await simulateServerSiteContentUpdate(page, { homepage: { heroHeadline: "External Server Headline" } });
  await triggerBackgroundAdminRerender(page);
  const after = await page.inputValue('input[name="heroHeadline"]');
  if (after !== localDraft) fail("dirty form preserved during server update", `got "${after}"`);
  else pass("unsaved hero edit preserved when server content updates under poll");
}

async function testSavedFormRefreshesAfterServerUpdate(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  const saved = `Saved Baseline ${Date.now()}`;
  await page.fill('input[name="heroHeadline"]', saved);
  await page.fill('textarea[name="heroSubheadline"]', "Saved subheadline for refresh test");
  await page.click('#adminHeroForm button[type="submit"]');
  await waitForHeroSaveValue(page, saved);
  const isCleanAfterSave = await page.evaluate(() => {
    const form = document.querySelector("#adminHeroForm");
    if (!form || typeof siteEditorFormHasUnsavedEdits !== "function") return false;
    return !siteEditorFormHasUnsavedEdits(form);
  });
  if (!isCleanAfterSave) fail("saved form baseline sync", "baseline not aligned after save");
  else pass("successful save resets site-editor baseline (not permanently dirty)");

  const postSaveServer = `Post-Save Server ${Date.now()}`;
  await simulateServerSiteContentUpdate(page, { homepage: { heroHeadline: postSaveServer } });
  await triggerBackgroundAdminRerender(page);
  const after = await page.inputValue('input[name="heroHeadline"]');
  if (after !== postSaveServer) fail("saved clean form accepts server refresh", `expected "${postSaveServer}" got "${after}"`);
  else pass("saved clean form refreshes to newer server headline");
}

async function testAnnouncementFieldTypesCleanAndDirty(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "announcement");
  await page.waitForSelector("#adminAnnouncementForm");
  const serverText = `Server announcement ${Date.now()}`;
  await simulateServerSiteContentUpdate(page, { announcement: { text: serverText, visible: true, location: "homepage" } });
  await triggerBackgroundAdminRerender(page);
  const clean = await page.evaluate(() => ({
    text: document.querySelector('#adminAnnouncementForm textarea[name="text"]')?.value || "",
    location: document.querySelector('#adminAnnouncementForm select[name="location"]')?.value || "",
  }));
  if (clean.text !== serverText) fail("announcement textarea clean refresh", clean.text);
  else if (clean.location !== "homepage") fail("announcement select clean refresh", clean.location);
  else pass("announcement textarea/select refresh on clean form");

  await page.fill('textarea[name="text"]', "Local announcement draft");
  await page.selectOption('select[name="location"]', "all");
  const flashWasChecked = await page.isChecked('input[name="flashReferralBannerEnabled"]');
  await page.setChecked('input[name="flashReferralBannerEnabled"]', !flashWasChecked);
  await simulateServerSiteContentUpdate(page, { announcement: { text: "Should not overwrite", location: "top" } });
  await triggerBackgroundAdminRerender(page);
  const dirty = await page.evaluate(() => ({
    text: document.querySelector('#adminAnnouncementForm textarea[name="text"]')?.value || "",
    location: document.querySelector('#adminAnnouncementForm select[name="location"]')?.value || "",
    flash: document.querySelector('#adminAnnouncementForm input[name="flashReferralBannerEnabled"]')?.checked,
  }));
  if (dirty.text !== "Local announcement draft") fail("announcement textarea dirty preserve", dirty.text);
  else if (dirty.location !== "all") fail("announcement select dirty preserve", dirty.location);
  else if (dirty.flash !== !flashWasChecked) fail("announcement checkbox dirty preserve", String(dirty.flash));
  else pass("announcement textarea/select/checkbox preserve unsaved edits");
}

async function testTabSwitchingPreservesUnsaved(page) {
  await unlockAdmin(page);
  await openSiteEditorTab(page, "trust");
  await page.waitForSelector("#adminTrustForm");
  const trustDraft = "Trust Heading Draft Across Tabs";
  await page.fill('input[name="trustSectionHeading"]', trustDraft);
  await openSiteEditorTab(page, "hero");
  await page.waitForSelector("#adminHeroForm");
  await page.fill('input[name="heroHeadline"]', "Hero while trust dirty");
  await openSiteEditorTab(page, "trust");
  await page.waitForSelector("#adminTrustForm");
  const trustValue = await page.inputValue('input[name="trustSectionHeading"]');
  if (trustValue !== trustDraft) fail("tab switch preserves unsaved trust edit", trustValue);
  else pass("returning to trust tab keeps unsaved edit in place");
}

async function testAllSiteEditorTabs(page) {
  for (const section of SITE_EDITOR_SECTIONS) {
    await openSiteEditorTab(page, section.tab);
    try {
      await page.waitForSelector(section.form, { timeout: 15000 });
    } catch (error) {
      fail(`site editor tab ${section.tab}`, `form not found: ${section.form}`);
      continue;
    }
    const fieldVisible = await page.locator(section.field).isVisible().catch(() => false);
    if (!fieldVisible) {
      await page.locator(`${section.form} details`).first().locator("summary").click().catch(() => {});
    }
    await page.fill(section.field, section.draft);
    await triggerBackgroundAdminRerender(page);
    const value = await page.evaluate((selector) => document.querySelector(selector)?.value || "", section.field);
    if (value !== section.draft) fail(`site editor tab ${section.tab}`, `got "${value}"`);
    else pass(`site editor tab ${section.tab} preserves draft through poll`);
  }
}

async function testExistingProtectedPaths(page) {
  await page.evaluate(() => { if (typeof closeAuthModal === "function") closeAuthModal(); openAuthModal("login"); });
  await page.waitForSelector("#authModal.open");
  await page.fill("#emailInput", "protected-path@example.com");
  await page.evaluate(() => {
    if (typeof refreshFoundingDisplays === "function") refreshFoundingDisplays();
    if (typeof openAuthModal === "function") openAuthModal("login");
  });
  const loginEmail = await page.inputValue("#emailInput");
  if (loginEmail !== "protected-path@example.com") fail("login regression", loginEmail);
  else pass("login form still protected (no regression)");

  await page.evaluate(() => { if (typeof closeAuthModal === "function") closeAuthModal(); openAuthModal("signup"); });
  await page.waitForSelector("#authModal.open");
  await page.fill("#fullNameInput", "Signup Still Safe");
  await page.evaluate(() => {
    if (typeof renderSignupWizardStep === "function") renderSignupWizardStep();
    if (typeof refreshFoundingDisplays === "function") refreshFoundingDisplays();
  });
  const signupName = await page.inputValue("#fullNameInput");
  if (signupName !== "Signup Still Safe") fail("signup regression", signupName);
  else pass("signup form still protected (no regression)");
}

async function main() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await waitForApp(page);
      await testHeroTypingThroughPoll(page);
      await testHeroFocusThroughPoll(page);
      await testMultipleFieldTypes(page);
      await testFailedSavePreservesEdits(page);
      await testSuccessfulSaveBaseline(page);
      await testCleanFormRefreshFromServerUpdate(page);
      await testDirtyFormPreservedDuringServerUpdate(page);
      await testSavedFormRefreshesAfterServerUpdate(page);
      await testAnnouncementFieldTypesCleanAndDirty(page);
      await testTabSwitchingPreservesUnsaved(page);
      await testAllSiteEditorTabs(page);
      await testExistingProtectedPaths(page);
    } finally {
      await page.close();
      await browser.close();
    }
    console.log(`\nSite editor form-state summary: ${passCount} passed, ${failCount} failed`);
    if (failCount) process.exitCode = 1;
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
