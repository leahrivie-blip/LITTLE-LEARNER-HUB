#!/usr/bin/env node
"use strict";

/**
 * Capture desktop + mobile screenshots of the Phase 6 assignment/response/
 * signature preview. Uses fake preview data only. No emails / SMS / Stripe /
 * AI / real responses outside this testing preview.
 */

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = process.env.FC_PHASE6_SCREENSHOT_DIR || "/opt/cursor/artifacts/forms-center-phase6";
const ADMIN_EMAIL = "phase6-screens@example.com";
const ADMIN_PASSWORD = "Phase6ScreenPass!99";
const ADMIN_CODE = "phase6-screen-code";
const TOKEN_HEADER = "x-llh-form-recipient-token";

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

async function fillAndSign(port, token, assignmentId) {
  const headers = { [TOKEN_HEADER]: token };
  const resolve = await request(port, "GET", `/api/form-recipient/${assignmentId}`, { headers });
  const fields = (resolve.json.version?.fields || []).filter((f) => !["content_heading", "content_paragraph", "content_divider"].includes(f.type));
  const answers = {};
  fields.forEach((field) => {
    if (field.type === "date") answers[field.id] = "2020-01-01";
    else if (field.type === "email") answers[field.id] = "guardian@example.invalid";
    else if (["single_select", "yes_no"].includes(field.type)) answers[field.id] = field.options?.[0]?.label || "Yes";
    else answers[field.id] = "Fixture Value";
  });
  await request(port, "POST", `/api/form-recipient/${assignmentId}/save-draft`, { headers, body: { answers } });
  await request(port, "POST", `/api/form-recipient/${assignmentId}/signature`, { headers, body: { typedName: "Screenshot Signer", consentGiven: true, signerRole: "parent_guardian" } });
  return request(port, "POST", `/api/form-recipient/${assignmentId}/submit`, { headers, body: {} });
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); } catch (error) { console.error("playwright required:", error.message); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const storePath = path.join(os.tmpdir(), `llh-fc-phase6-screens-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ siteContent: { featureFlags: { directorCenter: true, formsCenter: true, familyHub: false } } }, null, 2));

  const port = 7900 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), HOST: "127.0.0.1", DATABASE_PROVIDER: "local-json", LLH_STORE_PATH: storePath, SITE_URL: "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", RESEND_API_KEY: "", SENDGRID_API_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true", DISABLE_STRIPE_CHECKOUT: "true", DISABLE_AI_CALLS: "true",
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

    // Warm fixtures.
    const dashboard = await request(port, "GET", "/api/forms-center/responses", { headers: auth });
    if (dashboard.status !== 200) throw new Error(`dashboard warm-up failed: ${dashboard.status}`);

    browser = await playwright.chromium.launch({ headless: true });
    const viewports = [
      { name: "desktop", width: 1440, height: 1100 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(({ email, adminToken }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhAccounts", JSON.stringify({ [email]: { email, plan: "Pro", subscriptionStatus: "Pro Active", stripeSubscriptionStatus: "active", monthlyPrice: "$19.99/month" } }));
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAdminSession", JSON.stringify({ token: adminToken, email, name: "Phase 6 Screens", mode: "server" }));
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

      // Responses dashboard.
      await page.evaluate(() => document.querySelector('[data-fc-tab="responses"]')?.click());
      await page.waitForSelector("#fc-responses-mount .frd-dashboard", { timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `responses-dashboard-${viewport.name}.png`), fullPage: true });

      // Overdue filtered view.
      await page.evaluate(() => {
        const select = document.querySelector('select[data-frd-filter="view"]');
        if (select) { select.value = "overdue"; select.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      await page.waitForTimeout(1000);
      await page.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, `responses-overdue-${viewport.name}.png`), fullPage: true });
      await page.evaluate(() => {
        const select = document.querySelector('select[data-frd-filter="view"]');
        if (select) { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); }
      });
      await page.waitForTimeout(800);

      // Response detail + review (open a submitted one).
      const submittedRow = page.locator('.frd-response-row:has(.frd-pill-info)').first();
      const rowToOpen = (await submittedRow.count()) ? submittedRow : page.locator(".frd-response-row").first();
      await rowToOpen.locator("[data-frd-open]").click();
      await page.waitForSelector(".frd-detail-modal", { timeout: 15000 });
      await page.waitForTimeout(700);
      await page.locator(".frd-detail-modal").screenshot({ path: path.join(OUT_DIR, `response-detail-${viewport.name}.png`) });

      // Returned for correction (open a returned-for-correction one specifically).
      await page.evaluate(() => document.querySelector("[data-frd-close-detail]")?.click());
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll(".frd-status-card")).find((el) => el.textContent.includes("Returned"));
        card?.click();
      });
      await page.waitForTimeout(1000);
      const returnedRow = page.locator(".frd-response-row").first();
      if (await returnedRow.count()) {
        await returnedRow.locator("[data-frd-open]").click();
        await page.waitForSelector(".frd-detail-modal", { timeout: 15000 });
        await page.waitForTimeout(700);
        await page.locator(".frd-detail-modal").screenshot({ path: path.join(OUT_DIR, `response-returned-for-correction-${viewport.name}.png`) });
        await page.evaluate(() => document.querySelector("[data-frd-close-detail]")?.click());
      }
      await page.waitForTimeout(400);
      // Clear the status-card filter before continuing.
      await page.evaluate(() => {
        const active = document.querySelector(".frd-status-card.is-active");
        active?.click();
      });
      await page.waitForTimeout(600);

      // Medication Administration Log detail.
      await page.evaluate(() => {
        const row = Array.from(document.querySelectorAll(".frd-response-row")).find((el) => el.textContent.includes("Medication Administration Log"));
        row?.querySelector("[data-frd-open]")?.click();
      });
      await page.waitForSelector(".frd-detail-modal", { timeout: 15000 });
      await page.waitForTimeout(700);
      await page.locator(".frd-detail-modal").screenshot({ path: path.join(OUT_DIR, `medication-log-${viewport.name}.png`) });
      await page.evaluate(() => document.querySelector("[data-frd-close-detail]")?.click());
      await page.waitForTimeout(400);

      // Send / Assign (single + prepared for bulk).
      await page.evaluate(() => document.querySelector('[data-fc-tab="forms"]')?.click());
      await page.waitForSelector("#view-forms-center .fc-form-card", { timeout: 20000 });
      await page.waitForTimeout(700);
      await page.evaluate(() => document.querySelector("[data-fc-assign]")?.click());
      await page.waitForSelector(".frd-assign-modal", { timeout: 15000 });
      await page.waitForTimeout(500);
      await page.locator(".frd-assign-modal").screenshot({ path: path.join(OUT_DIR, `assign-form-${viewport.name}.png`) });

      // Bulk: switch to classroom recipient type to show multi-select picker.
      await page.selectOption('[data-frd-assign-field="recipientType"]', "classroom");
      await page.waitForTimeout(500);
      const classroomBoxes = await page.locator(".frd-recipient-picker input[type=\"checkbox\"]").all();
      for (const box of classroomBoxes) await box.click({ force: true });
      await page.waitForTimeout(300);
      await page.locator(".frd-assign-modal").screenshot({ path: path.join(OUT_DIR, `assign-bulk-${viewport.name}.png`) });
      await page.evaluate(() => document.querySelector("[data-frd-cancel-assign]")?.click());
      await page.waitForTimeout(300);

      await page.close();
    }

    // Recipient-facing screenshots (separate pages, own token flow).
    const notStarted = await request(port, "GET", "/api/forms-center/responses?status=not_started", { headers: auth });
    const inProgress = await request(port, "GET", "/api/forms-center/responses?status=in_progress", { headers: auth });
    const targetNotStarted = notStarted.json.responses.find((row) => row.formTitle !== "Medication Administration Log") || notStarted.json.responses[0];
    const targetLongForm = inProgress.json.responses.find((row) => row.formTitle === "Field Trip Permission Form") || inProgress.json.responses[0];

    for (const viewport of [{ name: "desktop", width: 900, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });

      // Recipient form beginning.
      const link1 = await request(port, "POST", `/api/forms-center/assignments/${targetNotStarted.assignmentId}/testing-link/issue`, { headers: auth, body: {} });
      await page.goto(`http://127.0.0.1:${port}${link1.json.recipientPath}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".fr-card", { timeout: 20000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT_DIR, `recipient-form-begin-${viewport.name}.png`), fullPage: true });

      // Validation error (click Next / Review without filling fields).
      await page.evaluate(() => document.querySelector("[data-fr-next], [data-fr-review]")?.click());
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, `recipient-validation-error-${viewport.name}.png`), fullPage: true });
      await page.close();

      // Long form with section navigation.
      const page2 = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const link2 = await request(port, "POST", `/api/forms-center/assignments/${targetLongForm.assignmentId}/testing-link/issue`, { headers: auth, body: {} });
      await page2.goto(`http://127.0.0.1:${port}${link2.json.recipientPath}`, { waitUntil: "domcontentloaded" });
      await page2.waitForSelector(".fr-card", { timeout: 20000 });
      await page2.waitForTimeout(700);
      await page2.screenshot({ path: path.join(OUT_DIR, `recipient-section-nav-${viewport.name}.png`), fullPage: true });
      await page2.close();

      // Review + signature + confirmation (drive to completion).
      const page3 = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const emergencyForms = await request(port, "GET", "/api/forms-center/forms?status=published", { headers: auth });
      const emergencyForm = emergencyForms.json.forms.find((f) => f.title === "Emergency Contact Form");
      const freshAssign = await request(port, "POST", "/api/forms-center/assignments", { headers: auth, body: { formId: emergencyForm.id, recipientType: "program", recipientIds: [] } });
      const freshAssignment = freshAssign.json.created[0].assignment;
      const link3 = await request(port, "POST", `/api/forms-center/assignments/${freshAssignment.id}/testing-link/issue`, { headers: auth, body: {} });
      await page3.goto(`http://127.0.0.1:${port}${link3.json.recipientPath}`, { waitUntil: "domcontentloaded" });
      await page3.waitForSelector(".fr-card", { timeout: 20000 });
      await page3.waitForTimeout(600);
      for (let guard = 0; guard < 6; guard += 1) {
        const inputs = await page3.locator('.fr-field input[type="text"], .fr-field input[type="email"], .fr-field input[type="date"]').all();
        for (const input of inputs) {
          const type = await input.getAttribute("type");
          if (type === "date") await input.fill("2020-01-01");
          else if (type === "email") await input.fill("guardian@example.invalid");
          else await input.fill("Fixture Value");
        }
        const reviewBtn = page3.locator("[data-fr-review]");
        if (await reviewBtn.count()) { await reviewBtn.click(); break; }
        const nextBtn = page3.locator("[data-fr-next]");
        if (await nextBtn.count()) { await nextBtn.click(); await page3.waitForTimeout(400); } else break;
      }
      await page3.waitForTimeout(700);
      await page3.screenshot({ path: path.join(OUT_DIR, `recipient-review-${viewport.name}.png`), fullPage: true });

      const signBlock = page3.locator("[data-fr-signature-block]").first();
      if (await signBlock.count()) {
        await signBlock.locator("[data-fr-signature-name]").fill("Screenshot Guardian");
        await signBlock.locator("[data-fr-signature-consent]").click({ force: true });
        await page3.waitForTimeout(300);
        await page3.screenshot({ path: path.join(OUT_DIR, `recipient-signature-${viewport.name}.png`), fullPage: true });
        await signBlock.locator("[data-fr-sign]").click();
        await page3.waitForTimeout(700);
      }
      const submitBtn = page3.locator("[data-fr-submit]");
      if (await submitBtn.isEnabled().catch(() => false)) {
        await submitBtn.click();
        await page3.waitForTimeout(800);
        await page3.screenshot({ path: path.join(OUT_DIR, `recipient-confirmation-${viewport.name}.png`), fullPage: true });
      }
      await page3.close();
    }

    // Empty state: filter to a status with no matches.
    const emptyPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await emptyPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await emptyPage.evaluate(({ email, adminToken }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAdminSession", JSON.stringify({ token: adminToken, email, name: "Phase 6 Screens", mode: "server" }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminRememberEmail", email);
    }, { email: ADMIN_EMAIL, adminToken: token });
    await emptyPage.reload({ waitUntil: "domcontentloaded" });
    await emptyPage.waitForFunction(() => typeof setView === "function" && typeof hasAdminFullAccess === "function" && hasAdminFullAccess(), null, { timeout: 45000 });
    await emptyPage.evaluate(async () => { if (typeof loadExpansionFeatureFlagsFromBackend === "function") await loadExpansionFeatureFlagsFromBackend(); setView("forms-center"); });
    await emptyPage.waitForSelector("#view-forms-center .fc-shell", { timeout: 30000 });
    await emptyPage.evaluate(() => document.querySelector('[data-fc-tab="responses"]')?.click());
    await emptyPage.waitForSelector("#fc-responses-mount .frd-dashboard", { timeout: 20000 });
    await emptyPage.waitForTimeout(800);
    await emptyPage.evaluate(() => {
      const input = document.querySelector('[data-frd-filter="q"]');
      if (input) { input.value = "no-matching-form-title-zzz"; input.dispatchEvent(new Event("input", { bubbles: true })); }
      document.querySelector("[data-frd-search]")?.click();
    });
    await emptyPage.waitForTimeout(900);
    await emptyPage.locator("#view-forms-center").screenshot({ path: path.join(OUT_DIR, "responses-empty-state-desktop.png"), fullPage: true });
    await emptyPage.close();

    console.log(`Screenshots written to ${OUT_DIR}`);
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
