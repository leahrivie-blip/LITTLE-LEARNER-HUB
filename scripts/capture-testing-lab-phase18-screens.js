#!/usr/bin/env node
"use strict";

/**
 * Phase 18 screenshots (max 2):
 * 1) Computer — Testing Lab dashboard (kept if already valid; regenerated only when missing)
 * 2) Phone — intentional mobile summary (always replaced; NOT the full Lab / device iframe)
 * Never capture passwords/tokens.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { assertFeatureScreen, assertNotHomepageFallback } = require("./capture-screen-assert.js");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.TL_PHASE18_SCREENSHOT_DIR || "/opt/cursor/artifacts/testing-lab-phase18";
const DESKTOP_SHOT = "1-testing-lab-dashboard-desktop.png";
const PHONE_SHOT = "2-testing-lab-mobile-summary-phone.png";
const LEGACY_PHONE_SHOT = "2-device-preview-phone.png";
const ADMIN_EMAIL = "phase18-screens@example.com";
const ADMIN_PASSWORD = "Phase18ScreenPass!99";
const ADMIN_CODE = "phase18-screen-code";

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => { let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; } resolve({ status: res.statusCode, json }); });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port) {
  for (let i = 0; i < 90; i += 1) {
    try { const res = await request(port, "GET", "/api/health"); if (res.status === 200) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("health timeout");
}

async function openTestingLab(page, token) {
  await page.goto(`http://127.0.0.1:${page._tlPort}/`, { waitUntil: "networkidle" });
  await page.evaluate((adminToken) => {
    localStorage.setItem("llhAdminToken", adminToken);
    sessionStorage.setItem("llhAdminToken", adminToken);
  }, token);
  await page.goto(`http://127.0.0.1:${page._tlPort}/#testing-lab`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.renderTestingLabPage === "function", null, { timeout: 20000 });
  await page.evaluate(async () => {
    document.querySelectorAll(".view").forEach((el) => {
      el.classList.remove("active-view");
      el.hidden = true;
    });
    const section = document.querySelector("#view-testing-lab") || document.body;
    section.classList.add("active-view");
    section.hidden = false;
    section.style.display = "block";
    await window.renderTestingLabPage(section);
  });
}

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Replace only the phone shot; remove legacy incorrect phone capture if present.
  for (const name of [PHONE_SHOT, LEGACY_PHONE_SHOT]) {
    const stale = path.join(OUT_DIR, name);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
  const desktopPath = path.join(OUT_DIR, DESKTOP_SHOT);
  const keepDesktop = fs.existsSync(desktopPath);

  const storePath = path.join(os.tmpdir(), `llh-tl-phase18-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true, testingLab: true } },
  }, null, 2));
  const port = 8990 + Math.floor(Math.random() * 80);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ALLOW_TESTING_LAB_ADMIN_PREVIEW: "true",
      ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "", STRIPE_SECRET_KEY: "", DISABLE_OUTBOUND_EMAIL: "true", DISABLE_STRIPE_CHECKOUT: "true", DISABLE_AI_CALLS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  try {
    await waitForHealth(port);
    const login = await request(port, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE } });
    const token = login.json.token;
    await request(port, "POST", "/api/testing-lab/seed", { headers: { Authorization: `Bearer ${token}` }, body: { scenario: "small_center", reset: true } });
    await request(port, "POST", "/api/testing-lab/role-preview/start", {
      headers: { Authorization: `Bearer ${token}` },
      body: { targetKind: "director" },
    });

    browser = await playwright.chromium.launch({ headless: true });

    if (!keepDesktop) {
      const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const deskPage = await desktop.newPage();
      deskPage._tlPort = port;
      await openTestingLab(deskPage, token);
      await deskPage.waitForSelector('[data-feature-marker="phase18-testing-lab"]', { timeout: 15000 });
      await assertFeatureScreen(deskPage, { marker: "phase18-testing-lab", label: "Phase 18 desktop Testing Lab" });
      await assertNotHomepageFallback(deskPage, "Phase 18 desktop Testing Lab");
      const hasPasswordLeak = await deskPage.locator("[data-tl-onetime]").count();
      if (hasPasswordLeak > 0) throw new Error("Screenshot blocked: one-time password still on screen");
      await deskPage.screenshot({ path: desktopPath, fullPage: true });
      await desktop.close();
      console.log("Wrote desktop screenshot (was missing)");
    } else {
      console.log("Keeping existing desktop screenshot:", desktopPath);
    }

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    phonePage._tlPort = port;
    await openTestingLab(phonePage, token);
    await phonePage.waitForSelector('[data-feature-marker="phase18-testing-lab-mobile"]', { timeout: 15000 });
    await assertFeatureScreen(phonePage, { marker: "phase18-testing-lab-mobile", label: "Phase 18 phone mobile summary" });
    await assertNotHomepageFallback(phonePage, "Phase 18 phone mobile summary");

    const phoneChecks = await phonePage.evaluate(() => {
      const panel = document.querySelector("#view-testing-lab .tl-panel") || document.querySelector(".tl-panel");
      const mobile = document.querySelector("[data-tl-mobile-summary]");
      const desktopLab = document.querySelector("[data-tl-desktop-lab]");
      const banner = panel?.querySelector(".tl-banner");
      const recommended = panel?.querySelector("[data-tl-computer-recommended]");
      const style = (el) => (el ? getComputedStyle(el).display : "missing");
      const isVisible = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const text = panel ? (panel.innerText || "") : "";
      return {
        mobileDisplay: style(mobile),
        desktopDisplay: style(desktopLab),
        bannerText: banner ? banner.textContent.trim() : "",
        recommendedText: recommended ? recommended.textContent.trim() : "",
        hasPasswordInput: [...(panel?.querySelectorAll('input[type="password"]') || [])].some((el) => isVisible(el)),
        hasOnetime: [...(panel?.querySelectorAll("[data-tl-onetime]") || [])].some((el) => isVisible(el)),
        hasExit: Boolean(panel?.querySelector("[data-tl-exit-preview]")) && isVisible(panel.querySelector("[data-tl-exit-preview]")),
        hasReturn: Boolean(panel?.querySelector("[data-tl-return-app]")) && isVisible(panel.querySelector("[data-tl-return-app]")),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        textIncludesComputer: /computer recommended/i.test(text),
        textIncludesFakeOnly: /Fake Data Only/i.test(text),
      };
    });
    if (phoneChecks.mobileDisplay === "none" || phoneChecks.desktopDisplay !== "none") {
      throw new Error(`Phone layout incorrect: ${JSON.stringify(phoneChecks)}`);
    }
    if (phoneChecks.hasPasswordInput || phoneChecks.hasOnetime) {
      throw new Error("Screenshot blocked: credentials/password UI on phone Lab summary");
    }
    if (phoneChecks.pageOverflow) throw new Error("Phone horizontal overflow detected");
    if (!phoneChecks.hasExit || !phoneChecks.hasReturn) {
      throw new Error("Phone missing Exit Role Preview or Return to normal app");
    }
    if (!phoneChecks.textIncludesComputer || !phoneChecks.textIncludesFakeOnly) {
      throw new Error("Phone missing required copy");
    }

    await phonePage.screenshot({ path: path.join(OUT_DIR, PHONE_SHOT), fullPage: true });
    await phone.close();

    console.log("Wrote phone mobile-summary screenshot to", OUT_DIR);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
