#!/usr/bin/env node
"use strict";

/**
 * LRE owner Edit hydration — paste-import week fields visible after reopen.
 * Run: npm run test:lre-import-hydration
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const parser = require("./lesson-paste-organizer-parser.js");
const applyApi = require("./lesson-paste-organizer-apply.js");

const INFANT_PASTE = fs.readFileSync(
  path.join(__dirname, "fixtures", "my-first-halloween-infant-paste.txt"),
  "utf8",
).trim();
const TODDLER_PASTE = fs.readFileSync(
  path.join(__dirname, "fixtures", "toddler-halloween-paste.txt"),
  "utf8",
).trim();

function requestJson(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
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

async function savePasteDraft(port, token, stamp, pasteText) {
  const parsed = parser.parseDeterministicPaste(pasteText);
  const built = applyApi.buildDraftLessonPlan(parsed, {
    ownerDecisions: {},
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  assert.equal(built.ok, true, built.errors?.join("; ") || "build failed");
  const save = await requestJson(port, "POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt: stamp,
    lessonPlan: built.lessonPlan,
  }, token);
  assert.equal(save.status, 200, save.text);
  return {
    id: save.json.lessonPlan.id,
    stamp: save.json.siteContentUpdatedAt,
  };
}

async function main() {
  const port = 20620 + Math.floor(Math.random() * 40);
  const base = `http://127.0.0.1:${port}`;
  const storePath = path.join(os.tmpdir(), `llh-lre-hydration-${crypto.randomBytes(4).toString("hex")}.json`);
  const admin = {
    email: "leahivie@icloud.com", // pragma: allowlist secret
    password: "lre-hydration-pass",
    code: "lre-hydration-code",
  };
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: base,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD: admin.password,
      ADMIN_ACCESS_CODE: admin.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const { chromium } = require("playwright");
  let browser;

  try {
    let booted = false;
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode !== null) throw new Error("Server exited early");
      try {
        const health = await requestJson(port, "GET", "/api/health");
        if (health.status === 200 && health.json?.ok) { booted = true; break; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!booted) throw new Error("Server did not boot");

    const login = await requestJson(port, "POST", "/api/admin/login", {
      email: admin.email,
      password: admin.password,
      code: admin.code,
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.token;
    const sc = await requestJson(port, "GET", "/api/admin/site-content", null, token);
    let stamp = sc.json.siteContent?.updatedAt || "";

    const infant = await savePasteDraft(port, token, stamp, INFANT_PASTE);
    stamp = infant.stamp;
    const toddler = await savePasteDraft(port, token, stamp, TODDLER_PASTE);
    stamp = toddler.stamp;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof setAdminSession === "function" && typeof LLHLessonReviewEditor?.open === "function",
      null,
      { timeout: 30000 },
    );
    await page.evaluate(({ adminUser, adminToken }) => {
      setAdminSession({
        email: adminUser.email,
        name: "Owner",
        token: adminToken,
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { adminUser: admin, adminToken: token });
    await page.evaluate(async () => {
      setView("admin");
      await loadAdminSiteContent();
      setAdminSectionTab("curriculum-lesson-plans");
    });

    async function openLre(planId, sectionId) {
      const opened = await page.evaluate(({ id, section }) => {
        return LLHLessonReviewEditor.open(id, { sectionId: section }) === true;
      }, { id: planId, section: sectionId });
      assert.equal(opened, true, `LRE open ${planId} ${sectionId}`);
      await page.waitForSelector("[data-lesson-review-editor]", { timeout: 15000 });
    }

    await openLre(infant.id, "books");
    const infantBook = await page.locator('input[data-lre-path^="books."][data-lre-path$=".title"]').first().inputValue();
    assert.match(infantBook, /Peek-a-Who/i, "infant book title visible in LRE");

    await openLre(infant.id, "songs");
    const infantSong = await page.locator('input[data-lre-path^="songs."][data-lre-path$=".title"]').first().inputValue();
    assert.match(infantSong, /Slowly/i, "infant song title visible in LRE");

    await openLre(infant.id, "basics");
    const infantCover = await page.locator('textarea[data-lre-path="enrichmentDraft.week.coverImageInstructions"]').inputValue();
    assert.match(infantCover, /Realistic photo/i, "infant cover instructions visible");
    await page.locator('textarea[data-lre-path="enrichmentDraft.week.coverImageInstructions"]').fill("Owner LRE cover brief edit.");
    await page.locator(".llh-lre-header-desktop [data-lre-save-draft]").click();
    await page.waitForFunction(
      () => /saved/i.test(document.querySelector("[data-lre-save-indicator]")?.textContent || ""),
      null,
      { timeout: 15000 },
    ).catch(() => {});

    await page.evaluate(() => LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true }));
    await openLre(infant.id, "basics");
    const infantCoverAfter = await page.locator('textarea[data-lre-path="enrichmentDraft.week.coverImageInstructions"]').inputValue();
    assert.equal(infantCoverAfter, "Owner LRE cover brief edit.", "cover instructions persist after LRE save/reopen");

    await openLre(infant.id, "printables");
    const printableBody = page.locator('textarea[data-lre-path^="enrichmentDraft.week.printableIdeas."][data-lre-path$=".body"]').first();
    await printableBody.waitFor({ state: "visible", timeout: 10000 });
    const beforePrintable = await printableBody.inputValue();
    assert.ok(beforePrintable.length > 3, "infant printable idea body visible");
    await printableBody.fill(`${beforePrintable}\nEdited in LRE.`);
    await page.locator(".llh-lre-header-desktop [data-lre-save-draft]").click();
    await page.waitForTimeout(800);
    await page.evaluate(() => LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true }));
    await openLre(infant.id, "printables");
    const afterPrintable = await page.locator('textarea[data-lre-path^="enrichmentDraft.week.printableIdeas."][data-lre-path$=".body"]').first().inputValue();
    assert.match(afterPrintable, /Edited in LRE/, "printable idea edit persists");

    await openLre(toddler.id, "activities");
    await page.locator(".llh-lre-activity-card").filter({ hasText: "Pumpkin Touch" }).first().click();
    await page.waitForSelector("[data-lre-activity-editor]", { timeout: 10000 });
    const teacherRole = await page.locator('textarea[data-lre-path$=".teacherRole"]').inputValue();
    assert.match(teacherRole, /arm/i, "toddler teacher role visible in LRE");

    const monObjective = await page.locator('[data-lre-core-field="objective"] textarea').inputValue();
    assert.match(monObjective, /intact pumpkin/i, "toddler objective unchanged");

    console.log("  ✓ LRE import hydration (infant + toddler paste fixtures)");
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
