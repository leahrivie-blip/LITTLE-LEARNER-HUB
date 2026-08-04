#!/usr/bin/env node
/**
 * Calendar loading must never hang forever — covers missing API, timeout, success, retry.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 19710 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-cal-load-${crypto.randomBytes(4).toString("hex")}.json`);

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitBoot(child) {
  for (let i = 0; i < 160; i += 1) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      if ((await request("GET", "/api/health")).status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("boot timeout");
}

async function openAuthed(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/i, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("llhUser", "cal-load@test.local");
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({
      "cal-load@test.local": {
        email: "cal-load@test.local",
        plan: "Pro",
        subscriptionStatus: "active",
        role: "owner",
      },
    }));
    localStorage.setItem("llhMetaCookieDismissed", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof ensureScheduleLoaded === "function" && typeof setView === "function", null, { timeout: 60000 });
  return { context, page };
}

async function main() {
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(app, /withTimeout\(/);
  assert.match(app, /Never leave Calendar stuck/);
  console.log("PASS static calendar loading markers");

  fs.writeFileSync(STORE, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    await waitBoot(child);
    const { context, page } = await openAuthed(browser);

    // 1) Missing schedule API → ready, no sticky Loading
    await page.evaluate(async () => {
      window.__realLLHSchedule = window.LLHSchedule;
      window.LLHSchedule = null;
      scheduleDocCache = null;
      scheduleSyncState = "idle";
      await ensureScheduleLoaded({ force: true });
    });
    const missing = await page.evaluate(() => ({
      state: scheduleSyncState,
      html: calendarScheduleStatusHtml(),
    }));
    assert.equal(missing.state, "ready");
    assert.equal(missing.html, "");
    console.log("PASS missing schedule API clears loading");

    // Restore stub API
    await page.evaluate(() => {
      const empty = { classrooms: [], items: [], updatedAt: new Date().toISOString(), schemaVersion: 1 };
      window.LLHSchedule = {
        emptyDoc: () => ({ classrooms: [], items: [], updatedAt: "", schemaVersion: 1 }),
        readCache: () => ({ classrooms: [], items: [], updatedAt: "", schemaVersion: 1 }),
        writeCache: () => {},
        mergeScheduleDocs: (a, b) => ({
          classrooms: (b && b.classrooms) || (a && a.classrooms) || [],
          items: (b && b.items) || (a && a.items) || [],
          updatedAt: (b && b.updatedAt) || (a && a.updatedAt) || "",
          schemaVersion: 1,
        }),
        migrateFromLegacy: async () => ({ ok: true }),
        fetchSchedule: async () => ({ ...empty, items: [], classrooms: [], _synced: true }),
      };
      const email = (typeof scheduleApiEmail === "function" ? scheduleApiEmail() : "") || "cal-load@test.local";
      localStorage.setItem(`llhScheduleMigrated:${email}`, "1");
      scheduleSyncPromise = null;
    });

    // 2) Successful fetch
    const okInfo = await page.evaluate(async () => {
      scheduleDocCache = null;
      scheduleSyncState = "idle";
      scheduleSyncPromise = null;
      scheduleSyncError = "";
      try {
        await ensureScheduleLoaded({ force: true });
      } catch (error) {
        return { state: scheduleSyncState, error: String(error && error.message || error), email: scheduleApiEmail() };
      }
      return { state: scheduleSyncState, error: scheduleSyncError, email: scheduleApiEmail() };
    });
    assert.equal(okInfo.state, "ready", JSON.stringify(okInfo));
    console.log("PASS successful schedule fetch");

    // 3) Hanging fetch times out → error (not stuck loading)
    await page.evaluate(async () => {
      window.LLHSchedule.fetchSchedule = () => new Promise(() => {}); // never resolves
      scheduleDocCache = null;
      scheduleSyncState = "idle";
      scheduleSyncPromise = null;
      await ensureScheduleLoaded({ force: true });
    });
    const timed = await page.evaluate(() => ({
      state: scheduleSyncState,
      error: scheduleSyncError,
      html: calendarScheduleStatusHtml(),
    }));
    assert.equal(timed.state, "error");
    assert.match(String(timed.error || ""), /Retry|longer|timed/i);
    assert.match(timed.html, /Retry|sync paused/i);
    assert.doesNotMatch(timed.html, /Loading your calendar/i);
    console.log("PASS hung fetch becomes Retry error");

    // 4) Retry recovers
    await page.evaluate(async () => {
      window.LLHSchedule.fetchSchedule = async () => ({
        classrooms: [], items: [], updatedAt: new Date().toISOString(), schemaVersion: 1, _synced: true,
      });
      await ensureScheduleLoaded({ force: true, retry: true });
    });
    assert.equal(await page.evaluate(() => scheduleSyncState), "ready");
    console.log("PASS retry after timeout succeeds");

    // 5) UI paint: loading uses spinner markup
    await page.evaluate(() => { scheduleSyncState = "loading"; });
    const loadingHtml = await page.evaluate(() => calendarScheduleStatusHtml());
    assert.match(loadingHtml, /llh-loading-spinner/);
    assert.match(loadingHtml, /Loading your calendar/);

    await context.close();
  } finally {
    await browser.close();
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }
  console.log("All calendar loading guard checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
