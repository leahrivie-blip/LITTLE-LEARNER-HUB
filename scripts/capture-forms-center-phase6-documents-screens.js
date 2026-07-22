#!/usr/bin/env node
"use strict";

/**
 * Desktop / tablet / mobile screenshots of the Phase 6 design-addition
 * document workflow: editable provider form → recipient form → signed →
 * completed (locked/approved) document. Fake preview data only.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FC_PHASE6_DOCS_SCREENSHOT_DIR || "/opt/cursor/artifacts/forms-center-phase6-documents";
const ADMIN_EMAIL = "phase6-docs-screens@example.com";
const ADMIN_PASSWORD = "Phase6DocsScreenPass!99";
const ADMIN_CODE = "phase6-docs-screen-code";
const TOKEN_HEADER = "x-llh-form-recipient-token";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...headers } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => { let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; } resolve({ status: res.statusCode, json, raw }); });
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
  let playwright;
  try { playwright = require("playwright"); } catch (error) { console.error("playwright required:", error.message); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-fc-phase6-docs-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: false } } }, null, 2));

  const port = 8500 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "", STRIPE_SECRET_KEY: "", DISABLE_OUTBOUND_EMAIL: "true", DISABLE_STRIPE_CHECKOUT: "true", DISABLE_AI_CALLS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForHealth(port);
    const login = await request(port, "POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE } });
    if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`);
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    // Warm fixtures + gather what we need.
    const dashboard = await request(port, "GET", "/api/forms-center/responses", { headers: auth });
    if (dashboard.status !== 200) throw new Error(`dashboard warm-up failed: ${dashboard.status}`);
    const approvedRow = dashboard.json.responses.find((row) => row.status === "approved");
    const notStartedRow = dashboard.json.responses.find((row) => row.status === "not_started" && row.formTitle !== "Medication Administration Log");
    const publishedForms = await request(port, "GET", "/api/forms-center/forms?status=published", { headers: auth });
    const emergencyForm = publishedForms.json.forms.find((f) => f.title === "Emergency Contact Form");

    browser = await playwright.chromium.launch({ headless: true });

    for (const viewport of VIEWPORTS) {
      // 1. Editable provider form (Phase 4 Builder) — "editable provider form" stage.
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(({ email, adminToken }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Pro", subscriptionStatus: "Pro Active", stripeSubscriptionStatus: "active", monthlyPrice: "$19.99/month" } }));
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAdminSession", JSON.stringify({ token: adminToken, email, name: "Phase 6 Docs Screens", mode: "server" }));
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminPreviewMode", "Admin");
        localStorage.setItem("llhAdminRememberEmail", email);
      }, { email: ADMIN_EMAIL, adminToken: token });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setView === "function" && typeof hasAdminFullAccess === "function" && hasAdminFullAccess(), null, { timeout: 45000 });
      await page.evaluate(async () => {
        if (typeof loadExpansionFeatureFlagsFromBackend === "function") await loadExpansionFeatureFlagsFromBackend();
        setView("forms-center");
      });
      await page.waitForSelector("#view-forms-center .fc-shell", { timeout: 30000 });
      await page.evaluate(() => document.querySelector('[data-fc-tab="forms"]')?.click());
      await page.waitForSelector("#view-forms-center .fc-form-card", { timeout: 20000 });
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector("[data-fc-open]")?.click());
      await page.waitForSelector("#view-forms-center .fc-builder", { timeout: 20000 });
      await page.waitForTimeout(700);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `1-editable-provider-form-${viewport.name}.png`), fullPage: true });

      // 2. Completed/approved document — admin embedded view — "completed document" stage.
      await page.evaluate(() => document.querySelector('[data-fc-tab="responses"]')?.click());
      await page.waitForSelector("#fc-responses-mount .frd-dashboard", { timeout: 20000 });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll(".frd-status-card")).find((el) => el.textContent.includes("Approved"));
        card?.click();
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => document.querySelector(".frd-response-row [data-frd-open]")?.click());
      await page.waitForSelector(".frd-detail-modal", { timeout: 15000 });
      await page.waitForTimeout(500);
      await page.evaluate(() => document.querySelector("[data-frd-toggle-document]")?.click());
      await page.waitForSelector(".fdv-document", { timeout: 15000 });
      await page.waitForTimeout(700);
      await page.locator(".frd-detail-modal").screenshot({ path: path.join(OUT_DIR, `4-completed-document-admin-${viewport.name}.png`) });
      await page.close();

      // 3. Recipient form (filling) and 4. signed/review — standalone page, own viewport.
      const recipientPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const freshAssign = await request(port, "POST", "/api/forms-center/assignments", { headers: auth, body: { formId: emergencyForm.id, recipientType: "program", recipientIds: [], requiredSignatureRoles: ["parent_guardian"] } });
      const freshAssignment = freshAssign.json.created[0].assignment;
      const freshLink = await request(port, "POST", `/api/forms-center/assignments/${freshAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
      await recipientPage.goto(`http://127.0.0.1:${port}${freshLink.json.recipientPath}`, { waitUntil: "domcontentloaded" });
      await recipientPage.waitForSelector(".fr-card", { timeout: 20000 });
      await recipientPage.waitForTimeout(700);
      await recipientPage.screenshot({ path: path.join(OUT_DIR, `2-recipient-form-${viewport.name}.png`), fullPage: true });

      // Fill through to review + sign for the "signed" stage.
      for (let guard = 0; guard < 6; guard += 1) {
        const inputs = await recipientPage.locator('.fr-field input[type="text"], .fr-field input[type="email"], .fr-field input[type="date"]').all();
        for (const input of inputs) {
          const type = await input.getAttribute("type");
          if (type === "date") await input.fill("2020-01-01");
          else if (type === "email") await input.fill("guardian@example.invalid");
          else await input.fill("Fixture Value");
        }
        const reviewBtn = recipientPage.locator("[data-fr-review]");
        if (await reviewBtn.count()) { await reviewBtn.click(); break; }
        const nextBtn = recipientPage.locator("[data-fr-next]");
        if (await nextBtn.count()) { await nextBtn.click(); await recipientPage.waitForTimeout(400); } else break;
      }
      await recipientPage.waitForTimeout(600);
      const signBlock = recipientPage.locator("[data-fr-signature-block]").first();
      if (await signBlock.count()) {
        await signBlock.locator("[data-fr-signature-name]").fill("Screenshot Signer");
        await signBlock.locator("[data-fr-signature-consent]").click({ force: true });
        await recipientPage.waitForTimeout(300);
        await recipientPage.screenshot({ path: path.join(OUT_DIR, `3-signed-review-${viewport.name}.png`), fullPage: true });
      }
      await recipientPage.close();
    }

    console.log(`Screenshots written to ${OUT_DIR}`);
    void notStartedRow;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
