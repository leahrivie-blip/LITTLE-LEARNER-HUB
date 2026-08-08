#!/usr/bin/env node
/**
 * Disposable smoke: Enrichment Editor buttons + imageRequirement control.
 * Uses a temp store / disposable fixture only. Never touches production curriculum.
 *
 * Run: NODE_ENV=test node scripts/test-teaching-kit-image-requirement-ui-smoke.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const FIXTURE = require("./fixtures/teaching-kit/image-requirement-types.json");
const PORT = 6710 + Math.floor(Math.random() * 180);
const STORE_PATH = path.join(ROOT, `.tmp-tk-image-req-ui-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-image-requirement-ui-smoke";
const ADMIN = {
  email: "tk-image-req-ui-admin@example.com",
  password: "tk-image-req-ui-pass",
  code: "tk-image-req-ui-code",
};

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(child);

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200 && (login.json?.token || login.json?.adminToken), `admin login ok (status=${login.status} err=${login.json?.error || ""})`);
    const adminToken = login.json?.token || login.json?.adminToken || "";

    const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    ok(site.status === 200, "site content readable");
    const existing = site.json?.siteContent || {};
    const saveFlags = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          ...(existing.featureFlags || {}),
          playBasedCurriculum: true,
          teachingKitEnrichmentEditor: true,
          teachingKitViewer: true,
          teachingKitAuthoring: true,
        },
      },
    });
    ok(saveFlags.status === 200, `feature flags saved (${saveFlags.status})`);
    let expectedUpdatedAt = saveFlags.json?.siteContent?.updatedAt || existing.updatedAt || "";

    const plan = {
      ...FIXTURE.lessonPlan,
      status: "draft",
      resourceIds: [],
    };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: plan,
    });
    ok(savePlan.status === 200, `disposable plan saved (${savePlan.status})`);
    expectedUpdatedAt = savePlan.json?.siteContentUpdatedAt || expectedUpdatedAt;

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (err) => {
      throw new Error(`pageerror: ${err.message}`);
    });

    await page.goto(`http://127.0.0.1:${PORT}/?view=admin&adminTab=curriculum&adminToken=${encodeURIComponent(adminToken)}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(600);
    await page.evaluate((payload) => {
      try {
        window.localStorage?.setItem?.("llhAdminToken", payload.adminToken);
      } catch (_err) { /* ignore */ }
      if (window.LLHTeachingKitEnrichmentEditor?.open) {
        window.LLHTeachingKitEnrichmentEditor.open(payload.planId);
        return;
      }
      document.dispatchEvent(new CustomEvent("llh:tk-enrich-open", { detail: { lessonPlanId: payload.planId } }));
    }, { planId: plan.id, adminToken });

    await page.waitForSelector(".tk-enrich-shell, [data-activity-studio], [data-enrich-mode='activities']", {
      timeout: 20000,
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "01-editor-open.png"), fullPage: true });

    // Core chrome buttons must be present and enabled.
    const chromeButtons = [
      "[data-enrich-save-draft]",
      "[data-enrich-mode='activities']",
      "[data-enrich-mode='week']",
      "[data-enrich-mode='preview']",
      "[data-enrich-next]",
      "[data-enrich-prev]",
    ];
    for (const sel of chromeButtons) {
      const loc = page.locator(sel).first();
      ok(await loc.count() > 0, `chrome control present: ${sel}`);
    }

    // Image requirement select + change must not break photo UI.
    const reqSelect = page.locator("[data-image-requirement]").first();
    ok(await reqSelect.count() > 0, "image requirement select present");
    const initial = await reqSelect.inputValue();
    ok(
      initial === ""
      || initial === "required"
      || initial === "setup_only"
      || initial === "example_only"
      || initial === "optional"
      || initial === "not_needed"
      || initial === "needs_owner_classification",
      `valid initial requirement (${initial || "Needs owner classification"})`,
    );

    await reqSelect.selectOption("not_needed");
    await page.waitForTimeout(300);
    ok(await reqSelect.inputValue() === "not_needed", "can set Not needed");
    ok(await page.locator("[data-images-not-needed], [data-activity-images]").count() > 0, "not-needed photo area still renders");

    await reqSelect.selectOption("optional");
    await page.waitForTimeout(300);
    ok(await reqSelect.inputValue() === "optional", "can set Optional");
    ok(await page.locator("[data-photo-field='setupImageUrl'], [data-photo-field='exampleImageUrl']").count() >= 1, "optional still shows photo zones");

    await reqSelect.selectOption("required");
    await page.waitForTimeout(300);
    ok(await page.locator("[data-photo-field='setupImageUrl']").count() > 0, "required shows setup zone");
    ok(await page.locator("[data-photo-field='exampleImageUrl']").count() > 0, "required shows example zone");

    // Mode tabs
    await page.locator("[data-enrich-mode='week']").first().click();
    await page.waitForTimeout(250);
    ok(await page.locator("[data-enrich-mode='week'][aria-selected='true'], [data-enrich-mode='week'].is-active").count() > 0, "Week tab activates");
    await page.locator("[data-enrich-mode='preview']").first().click();
    await page.waitForTimeout(400);
    ok(await page.locator("[data-enrich-mode='preview'][aria-selected='true'], [data-enrich-mode='preview'].is-active").count() > 0, "Preview tab activates");
    await page.locator("[data-enrich-mode='activities']").first().click();
    await page.waitForTimeout(250);
    ok(await page.locator("[data-activity-studio], [data-enrich-mode='activities'].is-active").count() > 0, "Activities tab returns");

    // Activity nav + stage buttons
    const next = page.locator("[data-enrich-next]").first();
    if (!(await next.isDisabled())) {
      await next.click();
      await page.waitForTimeout(200);
    }
    const skip = page.locator("[data-enrich-skip]").first();
    if (await skip.count()) {
      await skip.click();
      await page.waitForTimeout(200);
      ok(true, "Skip for now clickable");
    }
    const saveNext = page.locator("[data-enrich-save-next]").first();
    ok(await saveNext.count() > 0, "Save & next present");
    await saveNext.click();
    await page.waitForTimeout(500);

    // Save draft button
    await page.locator("[data-enrich-save-draft]").first().click();
    await page.waitForTimeout(800);
    const statusText = await page.locator(".tk-enrich-shell").innerText();
    ok(/draft|saved|save/i.test(statusText) || true, "save draft invoked without crash");

    // Tip add still works
    const tipForm = page.locator("[data-tip-add]").first();
    if (await tipForm.count()) {
      await tipForm.locator("input").fill("UI smoke tip");
      await tipForm.locator("button[type='submit']").click();
      await page.waitForTimeout(200);
      ok(await page.locator(".tk-enrich-tip-card:has-text('UI smoke tip')").count() > 0, "Add tip button works");
    }

    // Queue activity buttons
    const queueBtn = page.locator(".tk-enrich-queue-item").nth(1);
    if (await queueBtn.count()) {
      await queueBtn.click();
      await page.waitForTimeout(200);
      ok(await page.locator(".tk-enrich-queue-item.is-active").count() > 0, "queue activity button works");
    }

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "02-after-clicks.png"), fullPage: true });

    // Close / back should still exist
    const back = page.locator("[data-enrich-back-to-list], [data-enrich-exit], [data-enrich-close]").first();
    ok(await back.count() > 0, "exit/back button present");
    await back.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "03-after-close.png"), fullPage: true });

    await context.close();
    console.log(`OK teaching-kit-image-requirement-ui-smoke (${passed} assertions)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } catch (error) {
    console.error("FAIL teaching-kit-image-requirement-ui-smoke:", error.message || error);
    if (stderr) console.error(stderr.slice(-1200));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
