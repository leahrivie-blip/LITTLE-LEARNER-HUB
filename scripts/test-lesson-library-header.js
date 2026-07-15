#!/usr/bin/env node
/**
 * Lesson Plan Library header cleanup (Batch 1).
 * Run: node scripts/test-lesson-library-header.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19520 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-header-${crypto.randomBytes(4).toString("hex")}.json`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
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

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.error("FAIL: playwright is required");
    process.exitCode = 1;
    return;
  }

  const child = startServer();
  try {
    await waitForBoot(child);
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    // Seed a logged-in free user so lessons view is allowed.
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "lesson-header@example.com");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "lesson-header@example.com": {
          email: "lesson-header@example.com",
          plan: "Free",
          subscriptionStatus: "Free Plan",
        },
      }));
      localStorage.setItem("llhPlan", "Free");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });

    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.waitForSelector("#lessonPlanSearch", { timeout: 10000 });

    const state = await page.evaluate(() => {
      const topbarSearch = document.querySelector(".topbar .search-wrap");
      const accountActions = document.querySelector(".topbar .account-actions");
      const isHidden = (el) => {
        if (!el) return true;
        const style = window.getComputedStyle(el);
        return style.display === "none" || style.visibility === "hidden";
      };
      const lessonsTop = document.querySelector("#view-lessons")?.getBoundingClientRect()?.top || 0;
      const searchTop = document.querySelector("#lessonPlanSearch")?.getBoundingClientRect()?.top || 0;
      const gridTop = document.querySelector("#view-lessons .resource-grid")?.getBoundingClientRect()?.top || 0;
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return {
        lessonsViewClass: document.body.classList.contains("lessons-view"),
        topbarSearchHidden: isHidden(topbarSearch),
        accountActionsHidden: isHidden(accountActions),
        hasCompactHeader: Boolean(document.querySelector(".lesson-library-header .lesson-library-title")),
        hasBack: Boolean(document.querySelector(".lesson-library-back")),
        hasAgeFilters: Boolean(document.querySelector(".lesson-library-age-filters")),
        noticeVisibleByDefault: Boolean(document.querySelector("#lessonLibraryInfoPanel")),
        searchNearTop: searchTop - lessonsTop < 220,
        resultsNearTop: gridTop - lessonsTop < 360,
        overflow,
        globalSearchPlaceholder: document.querySelector("#searchInput")?.placeholder || "",
      };
    });

    assert(state.lessonsViewClass, "body.lessons-view should be set");
    assert(state.topbarSearchHidden, "global What do you need today? search should be hidden on lessons");
    assert(state.accountActionsHidden, "Account / Pro Active buttons should be hidden on lessons");
    assert(state.hasCompactHeader, "compact Lesson Plan Library header missing");
    assert(state.hasBack, "Back control missing");
    assert(state.hasAgeFilters, "age filters missing");
    assert(!state.noticeVisibleByDefault, "large Play-Based notice should be behind info toggle by default");
    assert(state.searchNearTop, "lesson search should appear near the top");
    assert(state.resultsNearTop, "lesson results should appear near the top");
    assert(!state.overflow, "no horizontal overflow on mobile lessons view");

    // Info toggle reveals access copy without a permanent large card.
    await page.click("[data-lesson-library-info-toggle]");
    await page.waitForSelector("#lessonLibraryInfoPanel", { timeout: 3000 });

    // Leaving lessons restores topbar chrome (logged-in home remaps to Calendar).
    await page.evaluate(() => setView("calendar"));
    await page.waitForSelector("#view-calendar.active-view", { timeout: 5000 });
    const homeState = await page.evaluate(() => {
      const accountActions = document.querySelector(".topbar .account-actions");
      const style = accountActions ? window.getComputedStyle(accountActions) : null;
      return {
        lessonsViewClass: document.body.classList.contains("lessons-view"),
        accountVisible: style ? style.display !== "none" : false,
      };
    });
    assert(!homeState.lessonsViewClass, "lessons-view should clear off lessons");
    assert(homeState.accountVisible, "account actions should return off lessons");

    await browser.close();
    console.log("Lesson library header cleanup checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
