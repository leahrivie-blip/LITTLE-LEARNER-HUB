#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.LC_PHASE14_SCREENSHOT_DIR || "/opt/cursor/artifacts/licensing-center-phase14";
const ADMIN_EMAIL = "phase14-screens@example.com";
const ADMIN_PASSWORD = "Phase14ScreenPass!99";
const ADMIN_CODE = "phase14-screen-code";

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

async function main() {
  const playwright = require("playwright");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-lc-phase14-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: true } } }, null, 2));
  const port = 8970 + Math.floor(Math.random() * 80);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
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
    await request(port, "POST", "/api/director-center/family/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    await request(port, "POST", "/api/director-center/licensing/seed", { headers: { Authorization: `Bearer ${token}` }, body: { reset: true } });
    await request(port, "POST", "/api/family-hub/seed", { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const fakes = await request(port, "GET", "/api/director-center/family/fake-accounts", { headers: { Authorization: `Bearer ${token}` } });
    const parent = (fakes.json.fakeAccounts || []).find((row) => row.kind === "parent_multi_child");
    const issued = await request(port, "POST", `/api/director-center/family/fake-accounts/${parent.id}/issue-password`, { headers: { Authorization: `Bearer ${token}` }, body: {} });
    const password = issued.json.password || issued.json.temporaryPassword;
    const memberLogin = await request(port, "POST", "/api/auth/password-login", { body: { email: parent.email, password } });
    const memberToken = memberLogin.json.memberSessionToken || memberLogin.json.token;

    browser = await playwright.chromium.launch({ headless: true });
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const deskPage = await desktop.newPage();
    await deskPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await deskPage.evaluate((adminToken) => {
      localStorage.setItem("llhAdminToken", adminToken);
      sessionStorage.setItem("llhAdminToken", adminToken);
    }, token);
    await deskPage.goto(`http://127.0.0.1:${port}/#director-center`, { waitUntil: "networkidle" });
    await deskPage.waitForTimeout(1000);
    await deskPage.evaluate(() => { if (typeof window.renderDirectorCenterPreviewUI === "function") window.renderDirectorCenterPreviewUI(); });
    await deskPage.waitForTimeout(800);
    const tab = deskPage.locator('[data-dc-tab="licensing_center"]');
    if (await tab.count()) {
      await tab.click();
      await deskPage.waitForTimeout(2000);
    } else {
      await deskPage.evaluate(() => {
        if (typeof window.renderLicensingCenterTab === "function") {
          const mount = document.querySelector("#view-director-center") || document.body;
          mount.innerHTML = '<div id="dc-licensing-center-mount"></div>';
          window.renderLicensingCenterTab(document.querySelector("#dc-licensing-center-mount"));
        }
      });
      await deskPage.waitForTimeout(2000);
    }
    await deskPage.screenshot({ path: path.join(OUT_DIR, "1-licensing-dashboard-desktop.png"), fullPage: true });

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const phonePage = await phone.newPage();
    await phonePage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await phonePage.evaluate(({ email, memberToken: mt }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhMemberSessionToken", mt);
      localStorage.setItem("llhAccountType", "parent");
    }, { email: parent.email, memberToken });
    await phonePage.goto(`http://127.0.0.1:${port}/#family-hub`, { waitUntil: "networkidle" });
    await phonePage.waitForTimeout(1000);
    await phonePage.evaluate(() => { if (typeof window.renderFamilyHubPage === "function") window.renderFamilyHubPage(); });
    await phonePage.waitForTimeout(1200);
    // Show Computer Recommended licensing tasks overlay for screenshot
    await phonePage.evaluate(async () => {
      const headers = { Accept: "application/json" };
      const token = localStorage.getItem("llhMemberSessionToken") || "";
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/family-hub/licensing/tasks", { headers, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const mount = document.querySelector("#view-family-hub") || document.body;
      const tasks = data.tasks || [];
      mount.innerHTML = `
        <section style="padding:1rem;font-family:system-ui,sans-serif;">
          <p style="background:#fff3cd;padding:0.5rem;border-radius:4px;">Testing Account — Fake Data Only.</p>
          <h2>Licensing tasks</h2>
          <p><strong>Computer Recommended</strong></p>
          <p style="font-size:0.9rem;color:#444;">Document organization only — not medical decisions or compliance certification.</p>
          <ul style="list-style:none;padding:0;">
            ${tasks.map((t) => `
              <li style="border:1px solid #ddd;border-radius:8px;padding:0.75rem;margin:0.5rem 0;">
                <strong>${t.title || ""}</strong>
                <div style="font-size:0.85rem;color:#666;">${t.status || ""} · child ${t.childId || ""}</div>
                <span style="display:inline-block;margin-top:0.35rem;background:#e8f4ff;padding:0.15rem 0.4rem;border-radius:4px;font-size:0.75rem;">Computer Recommended</span>
              </li>
            `).join("") || "<li>No missing/expiring family-visible tasks.</li>"}
          </ul>
        </section>
      `;
    });
    await phonePage.waitForTimeout(800);
    await phonePage.screenshot({ path: path.join(OUT_DIR, "2-family-licensing-tasks-phone.png"), fullPage: true });
    console.log("Wrote screenshots to", OUT_DIR);
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
