#!/usr/bin/env node
/**
 * Phase 5 — Daily Operations mobile smoke (Playwright).
 * Large-tap targets, Group Log path, no crash at phone viewport.
 * Run: npm run test:daily-operations-mobile-phase5
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/daily-operations-mobile-phase5";
const OWNER = "dlc.mobile.owner@example.com";

function request(port, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      LLH_LOCAL_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server not healthy");
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const port = 46000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-dlc-mobile-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ users: {} }, null, 2));
  const child = spawnServer({ port, storePath });
  const kill = () => { try { child.kill("SIGTERM"); } catch (_e) { /* ignore */ } };
  process.on("exit", kill);

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(port, child);
    await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        data: {
          Profiles: [
            { id: "m1", name: "Ava", classroomId: "classroom-main", ageGroup: "Toddler" },
            { id: "m2", name: "Ben", classroomId: "classroom-main", ageGroup: "Preschool" },
          ],
        },
      },
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(({ email }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "Pro Subscription Active",
          createdAt: new Date().toISOString(),
        },
      }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Owner");
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email: "admin@test.local",
        name: "Admin",
        token: "test-admin-token",
      }));
    }, { email: OWNER });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => (
      typeof window.isWorkModeNavEnabled === "function"
      || typeof isWorkModeNavEnabled === "function"
    ), null, { timeout: 20000 });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Owner");
      if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
      // Seed local child cache so Daily Logs has children even before cloud hydrate
      if (typeof saveChildStore === "function") {
        saveChildStore("Profiles", [
          { id: "m1", name: "Ava", classroomId: "classroom-main", ageGroup: "Toddler" },
          { id: "m2", name: "Ben", classroomId: "classroom-main", ageGroup: "Preschool" },
        ]);
      }
      childManagementMode = "daily-logs";
      dailyLogsSection = "home";
      setView("child-tools-daily-logs", { skipAccessRedirect: true });
      if (typeof renderChildManagement === "function") renderChildManagement();
    });
    await page.waitForSelector(".dlc-dashboard", { timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "daily-logs-home-mobile.png"), fullPage: true });

    const groupBtn = page.locator('[data-daily-logs-section="group"]');
    await groupBtn.waitFor({ state: "visible", timeout: 10000 });
    const box = await groupBtn.boundingBox();
    assert.ok(box && box.height >= 40, `Group Log tap height ${box?.height}`);
    await groupBtn.click();
    await page.waitForSelector('[data-dlc-group-action="meals"]', { timeout: 10000 });

    const mealAction = page.locator('[data-dlc-group-action="meals"]');
    const mealBox = await mealAction.boundingBox();
    assert.ok(mealBox && mealBox.height >= 70, `Group meal action height ${mealBox?.height}`);
    await mealAction.click();
    await page.waitForSelector("#groupUpdateForm", { timeout: 10000 });

    const check = page.locator(".dlc-child-check").first();
    const checkBox = await check.boundingBox();
    assert.ok(checkBox && checkBox.height >= 44, `Child checkbox row height ${checkBox?.height}`);

    await page.fill('#groupUpdateForm input[name="content"]', "Chicken");
    await page.click('#groupUpdateForm button[type="submit"]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "after-group-lunch-mobile.png"), fullPage: true });

    const mealCount = await page.evaluate(() => {
      if (typeof childRecords !== "function") return 0;
      return (childRecords().meals || []).filter((m) => String(m.lunch || "") === "Chicken").length;
    });
    assert.ok(mealCount >= 2, `Expected group lunch on both children, got ${mealCount}`);

    // Individual exception: edit one meal without rewriting the other
    await page.evaluate(() => {
      const meals = typeof childStore === "function" ? childStore("Meals") : [];
      const second = meals.find((m) => m.childId === "m2" && m.lunch === "Chicken");
      if (!second) throw new Error("missing second child meal");
      saveChildStore("Meals", meals.map((m) => (
        m.id === second.id
          ? { ...m, lunch: "Cheese sandwich", summary: "Lunch: Cheese sandwich" }
          : m
      )));
    });
    const afterException = await page.evaluate(() => {
      const meals = childRecords().meals || [];
      return {
        a: meals.find((m) => m.childId === "m1")?.lunch,
        b: meals.find((m) => m.childId === "m2")?.lunch,
      };
    });
    assert.equal(afterException.a, "Chicken");
    assert.equal(afterException.b, "Cheese sandwich");

    console.log("PASS  mobile daily logs + group lunch + individual exception");
    console.log("ALL DAILY OPERATIONS MOBILE PHASE5 CHECKS PASSED");
  } finally {
    await browser.close();
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
