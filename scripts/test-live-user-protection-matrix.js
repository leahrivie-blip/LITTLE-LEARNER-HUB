#!/usr/bin/env node
/**
 * Full live-user protection matrix — desktop, tablet, phone.
 * Run: npm run test:live-user-protection-matrix
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const {
  DEVICES,
  PERSONAS,
  makePlans,
  makeActivities,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  clickSettingsSignOut,
  evaluateShell,
  assertSingleView,
} = require("./test-helpers/llh-browser-nav");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const REPORT_PATH = "/opt/cursor/artifacts/live-user-protection-report.json";

const matrix = [];

function record(role, device, flow, result, error = "") {
  matrix.push({ role, device, flow, result, error });
  const line = `${role}/${device}/${flow}: ${result}${error ? ` — ${error}` : ""}`;
  if (result === "pass") console.log(`PASS  ${line}`);
  else {
    console.error(`FAIL  ${line}`);
    process.exitCode = 1;
  }
}

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1", port, path: urlPath, method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-matrix-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 19920 + Math.floor(Math.random() * 40);
  const users = {};
  Object.entries(PERSONAS).forEach(([key, acct]) => {
    if (!acct) return;
    users[acct.email] = { ...acct };
  });
  fs.writeFileSync(storePath, JSON.stringify({
    users,
    siteContent: {
      curriculumLibrary: {
        lessonPlans: makePlans(24),
        activities: makeActivities(120),
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      playBasedCurriculum: true,
    },
    adminSessions: {},
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { child, port, tmpDir };
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("boot timeout");
}

async function runSignedOutFlows(page, baseUrl, device) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitBootReady(page);
  try {
    const shell = await evaluateShell(page);
    assert.ok(shell.activeId === "view-home" || shell.activeId === "view-calendar", "guest landing");
    record("signed-out", device, "homepage", "pass");
  } catch (e) { record("signed-out", device, "homepage", "fail", e.message); }

  try {
    await page.locator("[data-action='open-login']").first().click();
    await page.waitForSelector("#authModal.open, .auth-modal.open", { timeout: 10000 });
    record("signed-out", device, "sign-in-ui", "pass");
    await page.locator("#authModal .modal-close, [data-close-auth]").first().click({ timeout: 3000 }).catch(() => {});
  } catch (e) { record("signed-out", device, "sign-in-ui", "fail", e.message); }

  try {
    await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#adminUnlockForm", { timeout: 15000 });
    const lock = await page.evaluate(() => ({
      lock: !document.querySelector("#adminLockPanel")?.hidden,
      notHome: document.querySelector("#view-home")?.classList.contains("active-view") !== true,
    }));
    assert.ok(lock.lock && lock.notHome);
    record("signed-out", device, "admin-lock-only", "pass");
  } catch (e) { record("signed-out", device, "admin-lock-only", "fail", e.message); }
}

async function runSignedInFlows(page, baseUrl, device, role, persona) {
  await seedSession(page, persona, { lastView: "calendar", cacheActivities: 120 });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  try {
    await waitBootReady(page);
  } catch (error) {
    record(role, device, "verified-boot", "fail", error.message);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `matrix-fail-${role}-${device}-boot.png`), fullPage: true }).catch(() => {});
    return;
  }

  const flows = [
    {
      name: "verified-boot",
      run: async () => {
        const shell = await evaluateShell(page);
        assert.ok(shell.bootReady);
        assertSingleView(shell, "boot");
      },
    },
    {
      name: "today-calendar",
      run: async () => {
        const id = await page.evaluate(() => document.querySelector(".active-view")?.id);
        assert.equal(id, "view-calendar");
      },
    },
    {
      name: "calendar-nav",
      run: async () => {
        await clickSidebarNav(page, "calendar");
        assertSingleView(await evaluateShell(page), "calendar");
      },
    },
    {
      name: "lesson-plans",
      run: async () => {
        await clickSidebarNav(page, "lessons");
        await page.waitForSelector('#view-lessons [data-view-resource], #view-lessons .resource-card, #view-lessons .lesson-plan-card', { timeout: 20000 });
      },
    },
    {
      name: "open-close-lesson",
      run: async () => {
        await clickSidebarNav(page, "lessons");
        const card = page.locator('#view-lessons [data-view-resource], #view-lessons .resource-card, #view-lessons .lesson-plan-card').first();
        await card.waitFor({ state: "visible", timeout: 20000 });
        await card.click();
        const opened = await Promise.race([
          page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 }).then(() => "viewer"),
          page.waitForSelector("#featurePreviewModal.open", { timeout: 15000 }).then(() => "upgrade"),
        ]).catch(() => "none");
        if (opened === "viewer") {
          await page.locator("#closeResourceViewer").click();
          await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 8000 });
        } else if (opened === "upgrade") {
          await page.keyboard.press("Escape");
        } else {
          throw new Error("lesson card did not open viewer or upgrade prompt");
        }
      },
    },
    {
      name: "activities",
      run: async () => {
        await clickSidebarNav(page, "activities");
        await page.waitForSelector('#view-activities [data-view-resource], #view-activities .resource-card, #view-activities .activity-card', { timeout: 20000 });
      },
    },
    {
      name: "open-close-activity",
      run: async () => {
        await clickSidebarNav(page, "activities");
        const card = page.locator('#view-activities [data-view-resource], #view-activities .resource-card, #view-activities .activity-card').first();
        await card.waitFor({ state: "visible", timeout: 20000 });
        await card.click();
        const opened = await Promise.race([
          page.waitForSelector("#resourceViewerModal.open", { timeout: 15000 }).then(() => "viewer"),
          page.waitForSelector("#featurePreviewModal.open", { timeout: 15000 }).then(() => "upgrade"),
        ]).catch(() => "none");
        if (opened === "viewer") {
          await page.locator("#closeResourceViewer").click();
          await page.waitForFunction(() => !document.querySelector("#resourceViewerModal.open"), null, { timeout: 8000 });
        } else if (opened === "upgrade") {
          await page.keyboard.press("Escape");
        } else {
          throw new Error("activity card did not open viewer or upgrade prompt");
        }
      },
    },
    {
      name: "daily-logs",
      run: async () => {
        await clickSidebarNav(page, "child-tools-daily-logs", "children");
      },
    },
    {
      name: "child-profiles",
      run: async () => {
        await clickSidebarNav(page, "children");
      },
    },
    {
      name: "messages",
      run: async () => {
        await clickSidebarNav(page, "messages");
      },
    },
    {
      name: "settings",
      run: async () => {
        await clickSidebarNav(page, "settings");
      },
    },
    {
      name: "browser-back-forward",
      run: async () => {
        await clickSidebarNav(page, "calendar");
        await clickSidebarNav(page, "lessons");
        await page.goBack();
        await page.waitForSelector("#view-calendar.active-view", { timeout: 10000 });
        await page.goForward();
        await page.waitForSelector("#view-lessons.active-view", { timeout: 10000 });
      },
    },
    {
      name: "no-admin-css-leak",
      run: async () => {
        await clickSidebarNav(page, "calendar");
        const leak = await page.evaluate(() => {
          const el = document.querySelector("#view-calendar");
          return el?.className.includes("admin-workspace") || false;
        });
        assert.equal(leak, false);
      },
    },
    {
      name: "logout",
      run: async () => {
        await clickSidebarNav(page, "settings");
        await clickSettingsSignOut(page);
      },
    },
  ];

  for (const flow of flows) {
    try {
      await flow.run();
      record(role, device, flow.name, "pass");
    } catch (error) {
      record(role, device, flow.name, "fail", error.message);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `matrix-fail-${role}-${device}-${flow.name}.png`), fullPage: true }).catch(() => {});
    }
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, `matrix-${role}-${device}.png`), fullPage: true }).catch(() => {});
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { child, port, tmpDir } = startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForBoot(port, child);
    for (const device of Object.values(DEVICES)) {
      const page = await browser.newPage({ viewport: { width: device.width, height: device.height } });
      await runSignedOutFlows(page, baseUrl, device.label);
      await page.close();

      for (const [role, persona] of Object.entries(PERSONAS)) {
        if (role === "signed-out") continue;
        const p = await browser.newPage({ viewport: { width: device.width, height: device.height } });
        await runSignedInFlows(p, baseUrl, device.label, role, persona);
        await p.close();
      }
    }
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: matrix.length,
    passed: matrix.filter((r) => r.result === "pass").length,
    failed: matrix.filter((r) => r.result === "fail").length,
    results: matrix,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(`\nMatrix: ${summary.passed}/${summary.total} passed. Report: ${REPORT_PATH}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
