#!/usr/bin/env node
/**
 * Capture owner Draft Review screenshots for Amazing Apples + All About Me seeds.
 * Disposable store only. Does not publish. Does not touch Farm Animals permanently.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 7200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-draft-shots-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "draft-review-shots-pass",
  code: "draft-review-shots-code",
};

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    assert.equal(login.status, 200, `owner login (${login.status})`);
    const token = login.json.token;
    assert.ok(token, "owner token");
    const auth = { Authorization: `Bearer ${token}` };
    const site = await requestJson("GET", "/api/admin/site-content", null, auth);
    const seed = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit-seed",
      expectedUpdatedAt: site.json?.siteContent?.updatedAt || "",
      batchName: "Owner screenshot seed — Apples + All About Me",
      source: "capture-draft-review-owner-shots",
    }, auth);
    assert.equal(seed.status, 200, `seed submit (${seed.status} ${seed.json?.error || ""})`);
    assert.equal(seed.json?.autoPublished, false, "no auto-publish");
    const list = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "list" }, auth);
    assert.ok((list.json?.items || []).length >= 2, `queue has seed items (${(list.json?.items || []).length})`);
    console.log("Queue items:", (list.json.items || []).map((item) => `${item.title}:${item.statusLabel}`).join(" | "));

    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    async function unlock(page) {
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => typeof setAdminSession === "function" && typeof setView === "function",
        null,
        { timeout: 30000 },
      );
      await page.evaluate(({ owner, ownerToken }) => {
        setAdminSession({
          email: owner.email,
          name: "Owner",
          token: ownerToken,
          mode: "server",
          trustedDevice: true,
        });
        localStorage.setItem("llhAdminPreviewMode", "Admin");
      }, { owner: OWNER, ownerToken: token });
      await page.evaluate(async () => {
        setView("admin");
        if (typeof setAdminGroup === "function") setAdminGroup("content");
        if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
        setAdminSectionTab("curriculum-draft-review");
        if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
        if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
      });
      await page.waitForFunction(
        () => !document.querySelector(".tk-draft-loading")
          && (
            document.querySelector("[data-draft-review-open-kit]")
            || /No drafts waiting|Draft Review Queue is restricted|sign in/i.test(
              document.querySelector("#adminDraftReviewQueueApp")?.textContent || "",
            )
          ),
        null,
        { timeout: 30000 },
      );
      if (!(await page.locator("[data-draft-review-open-kit]").count())) {
        await page.click("[data-draft-review-refresh]").catch(() => {});
        await page.waitForTimeout(1000);
      }
      assert.ok(
        await page.locator("[data-draft-review-open-kit]").count(),
        `Open Review controls missing: ${(await page.locator("#adminDraftReviewQueueApp").innerText().catch(() => "")).slice(0, 240)}`,
      );
    }

    const page = await desktop.newPage();
    await unlock(page);
    await page.screenshot({ path: path.join(OUT, "draft-review-queue-desktop.png"), fullPage: true });

    // Open Amazing Apples review
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".tk-draft-review-card, tr")];
      const apples = cards.find((el) => /Amazing Apples/i.test(el.textContent || ""));
      const btn = apples?.querySelector("[data-draft-review-open-kit]") || document.querySelector("[data-draft-review-open-kit]");
      btn?.click();
    });
    await page.waitForFunction(() => Boolean(window.LLHLessonReviewEditor?.isOpen?.()), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "draft-review-open-review-desktop.png"), fullPage: false });

    // Section-based editor — Activities
    await page.evaluate(() => {
      const btn = document.querySelector('[data-lre-section="activities"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    await page.locator(".llh-lre-activity-card").first().click().catch(() => {});
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, "draft-review-section-editor-desktop.png"), fullPage: false });

    // Images
    await page.evaluate(() => document.querySelector('[data-lre-section="images"]')?.click());
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, "draft-review-image-preview-desktop.png"), fullPage: false });

    // Close editor back to queue detail / printables via Draft Review UI
    await page.evaluate(() => {
      if (window.LLHLessonReviewEditor?.isOpen?.()) {
        window.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
      }
    });
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
      setAdminSectionTab("curriculum-draft-review");
      if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
    });
    await page.waitForSelector("[data-draft-review-open-kit]", { timeout: 15000 });
    // Open first detail then printable + compare panels
    await page.click("[data-draft-review-open-kit]");
    await page.waitForTimeout(800);
    // If editor opened again, close and open detail actions from queue table path
    await page.evaluate(() => {
      if (window.LLHLessonReviewEditor?.isOpen?.()) {
        window.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
      }
    });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      setAdminSectionTab("curriculum-draft-review");
      if (window.LLHDraftReviewQueue?.mount) await window.LLHDraftReviewQueue.mount();
      const id = document.querySelector("[data-draft-review-open-kit]")?.getAttribute("data-draft-review-open-kit");
      if (id && window.LLHDraftReviewQueue?.openDetail) await window.LLHDraftReviewQueue.openDetail(id);
    });
    await page.waitForSelector("[data-draft-review-printables]", { timeout: 15000 });
    await page.click("[data-draft-review-printables]");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "draft-review-printable-preview-desktop.png"), fullPage: false });

    await page.click("[data-draft-review-compare]");
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, "draft-review-compare-desktop.png"), fullPage: false });

    // Mobile queue + open review
    const mobilePage = await mobile.newPage();
    await unlock(mobilePage);
    await mobilePage.screenshot({ path: path.join(OUT, "draft-review-queue-mobile.png"), fullPage: true });
    await mobilePage.locator("[data-draft-review-open-kit]").first().click();
    await mobilePage.waitForFunction(() => Boolean(window.LLHLessonReviewEditor?.isOpen?.()), null, { timeout: 15000 });
    await mobilePage.waitForTimeout(400);
    await mobilePage.screenshot({ path: path.join(OUT, "draft-review-open-review-mobile.png"), fullPage: false });
    if (await mobilePage.locator("[data-lre-section-select]").count()) {
      await mobilePage.selectOption("[data-lre-section-select]", "activities");
      await mobilePage.waitForTimeout(300);
    }
    await mobilePage.screenshot({ path: path.join(OUT, "draft-review-section-editor-mobile.png"), fullPage: false });

    await browser.close();
    console.log("Captured Draft Review owner screenshots to", OUT);
    console.log("Files:", fs.readdirSync(OUT).filter((name) => name.startsWith("draft-review-")).join(", "));
  } catch (error) {
    console.error("FAIL", error.message || error);
    if (stderr) console.error(stderr.slice(-3000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch (_error) { /* ignore */ }
  }
}

main();
