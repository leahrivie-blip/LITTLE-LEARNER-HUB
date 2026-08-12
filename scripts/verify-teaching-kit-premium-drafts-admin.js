#!/usr/bin/env node
/**
 * Admin visual/read-back verification for the four repaired premium TK drafts.
 * Uses an isolated copy of the repaired store. Never publishes.
 *
 * Open path mirrors owner Lesson Plans → Teaching Kit editor
 * (openOwnerTeachingKitEditor + ensureEnrichmentEditorOpen).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const {
  ensureEnrichmentEditorOpen,
  hideCookieConsentChrome,
} = require("./test-helpers/tk-enrich-playwright.js");

const ROOT = path.join(__dirname, "..");
const SOURCE_STORE = process.env.STORE_PATH || path.join(ROOT, "server/data/launch-store.json");
const PORT = 4300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-premium-verify-${process.pid}.json`);
const ARTIFACT_DIR = path.join("/opt/cursor/artifacts", "tk-premium-draft-verify");
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-premium-verify-pass",
  code: "tk-premium-verify-code",
};
const TARGET_IDS = [
  "cur-lp-infant-colors-all-around-us",
  "cur-lp-infant-black-white-discovery",
  "cur-lp-preschool-community-helpers",
  "cur-lp-preschool-weather-watchers",
];

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
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("health timeout");
}

async function closeEnrichmentEditor(page) {
  await page.evaluate(() => {
    try {
      if (typeof window.LLHTeachingKitEnrichmentEditor?.close === "function") {
        window.LLHTeachingKitEnrichmentEditor.close({ force: true });
      }
    } catch { /* ignore */ }
    document.body.classList.remove("tk-enrich-open", "tk-editor-focused");
  });
  await page.waitForTimeout(200);
}

async function auditCurrentActivity(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".tk-enrich-shell");
    if (!shell) return { ok: false, error: "enrichment shell not found" };
    const read = (key) => {
      const el = shell.querySelector(`[data-core-field="${key}"]`);
      return el ? String(el.value || "").trim() : "";
    };
    const values = {
      title: read("title")
        || ((shell.querySelector("h3[data-enrich-title], [data-activity-title]") || {}).textContent || "").trim(),
      objective: read("objective"),
      description: read("description"),
      materials: read("materials"),
      preparation: read("preparation"),
      setup: read("setup"),
      steps: read("steps"),
      teacherLanguage: read("teacherLanguage"),
      observationOpportunities: read("observationOpportunities"),
      safetyNotes: read("safetyNotes"),
      cleanupTips: read("cleanupTips"),
      durationMinutes: read("durationMinutes"),
      ageModifications: read("ageModifications"),
      activityCategory: read("activityCategory"),
    };
    const helpTexts = [...shell.querySelectorAll("[data-core-help]")].map((el) => el.textContent || "");
    const farmHelpVisible = helpTexts.some((t) => /farm animal/i.test(t));
    const blankCritical = [
      "preparation",
      "cleanupTips",
      "durationMinutes",
      "objective",
      "steps",
      "setup",
      "materials",
      "teacherLanguage",
      "observationOpportunities",
      "safetyNotes",
    ].filter((k) => !String(values[k] || "").trim());
    return {
      ok: blankCritical.length === 0 && !farmHelpVisible,
      values,
      farmHelpVisible,
      blankCritical,
      activityCountText: (shell.querySelector(".tk-enrich-activity-count") || {}).textContent || "",
      imageRequirement: (shell.querySelector("[data-image-requirement]") || {}).value || "",
      editorOpen: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
    };
  });
}

async function jumpToActivityIndex(page, activityIndex) {
  const jumped = await page.evaluate((idx) => {
    const editor = window.LLHTeachingKitEnrichmentEditor;
    if (editor && typeof editor.getState === "function") {
      const btn = document.querySelector(`[data-activity-index="${idx}"]`)
        || document.querySelector(`[data-enrich-jump="${idx}"]`);
      if (btn) {
        btn.click();
        return "button";
      }
      const select = document.querySelector("[data-enrich-activity-select]");
      if (select && select.options && select.options[idx]) {
        select.selectedIndex = idx;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return "select";
      }
    }
    const prev = document.querySelector("[data-enrich-prev]");
    const next = document.querySelector("[data-enrich-next]");
    if (prev) {
      for (let i = 0; i < 25; i += 1) prev.click();
    }
    if (next) {
      for (let i = 0; i < idx; i += 1) next.click();
    }
    return next || prev ? "nav" : "none";
  }, activityIndex);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelectorAll("details.tk-enrich-accordion, details[data-core-section]").forEach((d) => {
      d.open = true;
    });
  });
  return jumped;
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  if (!fs.existsSync(SOURCE_STORE)) {
    throw new Error(`Source store missing: ${SOURCE_STORE}`);
  }
  fs.copyFileSync(SOURCE_STORE, STORE_PATH);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      NODE_ENV: "test",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  child.stdout.on("data", (d) => { serverLog += d.toString(); });
  child.stderr.on("data", (d) => { serverLog += d.toString(); });

  const report = {
    ok: false,
    port: PORT,
    checks: [],
    screenshots: [],
    publishCalled: false,
    draftOnly: true,
  };

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    if (login.status !== 200) throw new Error(`login failed ${login.status}`);
    const token = login.json.token || login.json.adminToken;

    // Enable enrichment editor flag on the isolated test store only.
    const siteBoot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const current = siteBoot.json?.siteContent || {};
    await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...current,
        featureFlags: {
          ...(current.featureFlags || {}),
          teachingKitEnrichmentEditor: true,
        },
      },
    });

    // API read-back via Admin site-content (includes draft lesson plans).
    const adminSite = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const allPlans = adminSite.json?.siteContent?.curriculum?.lessonPlans || [];
    for (const id of TARGET_IDS) {
      const plan = allPlans.find((p) => p.id === id);
      if (!plan) throw new Error(`missing plan ${id} in admin site-content (${allPlans.length} plans)`);
      if (plan.status !== "draft") throw new Error(`${id} status ${plan.status}`);
      if (!plan.enrichmentDraft) throw new Error(`${id} missing enrichmentDraft`);
      if (plan.enrichmentPublished) throw new Error(`${id} unexpectedly has enrichmentPublished`);
      const item = plan.dailyPlans?.monday?.items?.[0];
      if (!item?.preparation) throw new Error(`${id} monday-1 still missing preparation in Admin API`);
      if (item.durationMinutes == null || item.durationMinutes === "") {
        throw new Error(`${id} monday-1 missing durationMinutes in Admin API`);
      }
      const publicLibrary = await requestJson("GET", "/api/site-content");
      const publicPlans = publicLibrary.json?.siteContent?.curriculum?.lessonPlans
        || publicLibrary.json?.curriculum?.lessonPlans
        || [];
      if (publicPlans.some((p) => p.id === id)) {
        throw new Error(`${id} leaked into public site-content`);
      }
      report.checks.push({
        id,
        apiStatus: plan.status,
        monday1Title: item.title,
        monday1Prep: String(item.preparation).slice(0, 80),
        monday1Duration: item.durationMinutes,
        printableIds: plan.enrichmentDraft?.week?.printableIds || [],
        publicLeak: false,
      });
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
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
      localStorage.setItem("llhAdminActiveSection", "curriculum-lesson-plans");
      localStorage.setItem("llhAdminToken", ownerToken);
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => {
      if (typeof setView === "function") setView("admin");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
      if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
    });
    await hideCookieConsentChrome(page);
    await page.waitForTimeout(500);

    for (const id of TARGET_IDS) {
      await closeEnrichmentEditor(page);

      const opened = await page.evaluate(async (planId) => {
        const plan = typeof curriculumLessonPlanById === "function"
          ? curriculumLessonPlanById(planId)
          : null;
        if (!plan) {
          return { ok: false, error: "plan missing after loadAdminSiteContent" };
        }
        const host = document.querySelector("#adminTeachingKitEnrichmentHost");
        if (!host) return { ok: false, error: "adminTeachingKitEnrichmentHost missing" };
        if (typeof window.openOwnerTeachingKitEditor !== "function") {
          return { ok: false, error: "openOwnerTeachingKitEditor missing" };
        }
        const result = await window.openOwnerTeachingKitEditor(planId, {
          source: "upgrade",
          ownerWorkspace: true,
          initialMode: "activities",
        });
        return {
          ok: result === true || window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
          result,
          title: plan.title,
          status: plan.status,
          hasDraft: Boolean(plan.enrichmentDraft),
          isOpen: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
        };
      }, id);
      report.checks.push({ browserOpen: opened });
      if (!opened.ok) throw new Error(`${id}: ${opened.error || "editor open failed"} ${JSON.stringify(opened)}`);

      await page.waitForFunction(
        () => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
        null,
        { timeout: 20000 },
      );
      await ensureEnrichmentEditorOpen(page, { timeoutMs: 15000 });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        document.querySelectorAll("details.tk-enrich-accordion, details[data-core-section]").forEach((d) => {
          d.open = true;
        });
      });

      const spotChecks = [];
      for (const idx of [0, 7, 14]) {
        const jumpMode = await jumpToActivityIndex(page, idx);
        const fieldAudit = await auditCurrentActivity(page);
        const shot = path.join(ARTIFACT_DIR, `${id}-idx-${idx}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        report.screenshots.push(shot);
        spotChecks.push({ idx, jumpMode, fieldAudit, shot });
        if (!fieldAudit.ok) {
          report.checks.push({ id, idx, fieldAudit });
          throw new Error(
            `${id} activity idx ${idx} incomplete: ${JSON.stringify(fieldAudit.blankCritical)} farmHelp=${fieldAudit.farmHelpVisible}`,
          );
        }
      }
      report.checks.push({ id, spotChecks });
      await closeEnrichmentEditor(page);
    }

    await browser.close();
    const failed = report.checks.filter((c) => c.fieldAudit && c.fieldAudit.ok === false);
    report.ok = failed.length === 0;
    report.failedFieldAudits = failed;
  } catch (error) {
    report.ok = false;
    report.error = String(error && error.stack ? error.stack : error);
    report.serverLogTail = serverLog.slice(-4000);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }

  const out = path.join(ARTIFACT_DIR, "admin-verify-report.json");
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(ROOT, "curriculum-drafts/teaching-kits-premium/admin-verify-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
