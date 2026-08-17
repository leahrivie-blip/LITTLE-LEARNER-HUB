#!/usr/bin/env node
/**
 * Black & White Discovery Linked Resources Preview / Download must not close
 * the Teaching Kit editor. Two printables each open their own resource once.
 *
 * Disposable local-json fixture only. Does not publish or mutate production.
 * Run: npm run test:tk-linked-preview-keep-editor
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 7700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-tk-preview-keep-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-preview-keep-pass",
  code: "tk-preview-keep-code",
};
const PLAN_ID = "cur-lp-black-white-discovery-preview-fixture";
const RES_A = "cur-res-bwd-gaze-cards";
const RES_B = "cur-res-bwd-caregiver-guide";
const RES_MISSING = "cur-res-bwd-missing-bytes";

const MINIMAL_PDF = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
const PDF_DATA_URL = `data:application/pdf;base64,${MINIMAL_PDF.toString("base64")}`;

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

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

async function waitForHealth(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function writeStore() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true },
      curriculum: {
        lessonPlans: [{
          id: PLAN_ID,
          title: "Black & White Discovery",
          age: "Infant",
          theme: "High Contrast",
          plan: "Pro",
          status: "draft",
          weeklyOverview: "Disposable Black & White Discovery fixture.",
          resourceIds: [RES_A, RES_B, RES_MISSING],
          dailyPlans: {
            monday: { theme: "Gaze", items: [{ id: "cur-act-bwd-1", title: "Black and white cards" }] },
            tuesday: { theme: "Faces", items: [] },
            wednesday: { theme: "Patterns", items: [] },
            thursday: { theme: "Books", items: [] },
            friday: { theme: "Family", items: [] },
          },
          enrichmentDraft: {
            updatedAt: new Date().toISOString(),
            lastEditedBy: OWNER.email,
            week: { weeklyOverview: "Keep this unsaved-looking draft text." },
            activities: {},
          },
          disposableQaFixture: true,
        }],
        activities: [],
        resources: [
          {
            id: RES_A,
            title: "Bright Color Gaze Cards",
            resourceCategory: "Printables",
            resourceType: "Printable",
            status: "draft",
            lessonPlanIds: [PLAN_ID],
            fileName: "gaze-cards.pdf",
            mimeType: "application/pdf",
            fileData: PDF_DATA_URL,
            hasFile: true,
            disposableQaFixture: true,
          },
          {
            id: RES_B,
            title: "Caregiver Color Talk Mini Guide",
            resourceCategory: "Printables",
            resourceType: "Printable",
            status: "draft",
            lessonPlanIds: [PLAN_ID],
            fileName: "caregiver-guide.pdf",
            mimeType: "application/pdf",
            fileData: PDF_DATA_URL,
            hasFile: true,
            disposableQaFixture: true,
          },
          {
            id: RES_MISSING,
            title: "Missing Bytes Printable",
            resourceCategory: "Printables",
            resourceType: "Printable",
            status: "draft",
            lessonPlanIds: [PLAN_ID],
            fileName: "missing.pdf",
            mimeType: "application/pdf",
            mediaAssetId: "missing-asset-does-not-exist",
            hasFile: true,
            disposableQaFixture: true,
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }, null, 2));
}

async function main() {
  writeStore();
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(login.status === 200 && login.json?.token, "owner admin authentication works");
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const draftFile = await requestJson("GET", `/api/admin/curriculum/resources/file?id=${encodeURIComponent(RES_A)}`, null, auth);
    ok(draftFile.status === 200 && String(draftFile.json?.resource?.id) === RES_A, "admin file API returns the clicked draft resource");
    const anon = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(RES_A)}`);
    ok([401, 403, 404].includes(anon.status), `anonymous draft file is blocked (${anon.status})`);

    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setAdminSession === "function" && typeof setView === "function", null, { timeout: 30000 });
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
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => {
      setView("admin");
      await loadAdminSiteContent();
      setAdminSectionTab("curriculum-lesson-plans");
      applyAdminSectionVisibility();
    });
    await page.waitForSelector(`[data-curriculum-lesson-edit="${PLAN_ID}"], [data-curriculum-lesson-enrich="${PLAN_ID}"]`, { timeout: 20000 });

    await page.locator(`[data-curriculum-lesson-edit="${PLAN_ID}"]`).first().click({ timeout: 8000 }).catch(async () => {
      await page.evaluate((id) => {
        document.querySelector(`[data-curriculum-lesson-edit="${id}"]`)
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }, PLAN_ID);
    });
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 15000 });
    await page.locator('[data-enrich-mode="week"]').first().click({ timeout: 8000 });
    await page.waitForSelector(`[data-curriculum-resource-open="${RES_A}"]`, { timeout: 10000 });

    const before = await page.evaluate(() => {
      const host = document.querySelector("#adminTeachingKitEnrichmentHost");
      return {
        open: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
        planId: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "",
        mode: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.mode || "",
        scroll: host ? host.scrollTop : -1,
        draft: document.querySelector("[data-week-overview]")?.value || "",
        listVisible: Boolean(document.querySelector("#adminCurriculumLessonPlanList")),
      };
    });
    ok(before.open && before.planId === PLAN_ID, "Black & White Discovery editor is open on Week");
    ok(before.mode === "week", "Week tab is selected before Preview");

    await page.evaluate(() => {
      window.__previewOpens = [];
      window.open = (url, target) => {
        window.__previewOpens.push({ url: String(url || ""), target: String(target || "") });
        return { closed: false };
      };
    });

    await page.locator(`[data-curriculum-resource-open="${RES_A}"]`).first().click({ timeout: 8000 });
    await page.waitForTimeout(400);
    const afterA = await page.evaluate(() => ({
      open: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
      planId: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "",
      mode: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.mode || "",
      listVisible: Boolean(document.querySelector("#adminCurriculumLessonPlanList")),
      opens: window.__previewOpens || [],
      error: document.querySelector("[data-tk-linked-resource-preview-error]")?.textContent || "",
    }));
    ok(afterA.open === true && afterA.planId === PLAN_ID, "editor stays open after first Preview / Download");
    ok(afterA.mode === "week", "Week tab is retained after first Preview / Download");
    ok(!afterA.listVisible, "lesson-plan list is not restored after Preview / Download");
    ok(afterA.opens.length === 1, "first Preview / Download opens exactly one preview");

    await page.locator(`[data-curriculum-resource-open="${RES_B}"]`).first().click({ timeout: 8000 });
    await page.waitForTimeout(400);
    const afterB = await page.evaluate(() => ({
      open: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
      mode: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.mode || "",
      opens: window.__previewOpens || [],
    }));
    ok(afterB.open === true && afterB.mode === "week", "editor stays on Week after second printable Preview");
    ok(afterB.opens.length === 2, "two printables produce two preview opens");

    await page.locator(`[data-curriculum-resource-open="${RES_MISSING}"]`).first().click({ timeout: 8000 });
    await page.waitForTimeout(600);
    const afterMissing = await page.evaluate(() => ({
      open: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
      mode: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.mode || "",
      error: document.querySelector("[data-tk-linked-resource-preview-error]")?.textContent || "",
      opens: (window.__previewOpens || []).length,
    }));
    ok(afterMissing.open === true && afterMissing.mode === "week", "missing PDF bytes keep the editor open on Week");
    ok(/missing|not available|could not|not stored/i.test(afterMissing.error), "missing PDF shows an inline error");
    ok(afterMissing.opens === 2, "missing PDF does not open a third preview");

    const types = await page.evaluate(() => [...document.querySelectorAll("[data-curriculum-resource-open]")].map((el) => el.getAttribute("type")));
    ok(types.every((t) => t === "button"), "every Preview / Download control is type=button");

    console.log(`\n${passed} checks passed.`);
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
