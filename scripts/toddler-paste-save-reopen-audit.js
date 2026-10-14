#!/usr/bin/env node
/** Local toddler paste: save draft + reload field check (disposable store). */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PASTE = path.join(__dirname, "fixtures", "toddler-halloween-paste.txt");
const OUT = "/opt/cursor/artifacts/toddler-paste-save-reopen-audit";

const ADMIN = {
  email: process.env.LLH_SMOKE_ADMIN_EMAIL || "",
  password: process.env.LLH_SMOKE_ADMIN_PASSWORD || "",
  code: process.env.LLH_SMOKE_ADMIN_ACCESS_CODE || "",
};

function requestJson(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers, timeout: 60000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth(url) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

async function main() {
  const port = 20860 + Math.floor(Math.random() * 20);
  const base = `http://127.0.0.1:${port}`;
  const store = path.join(ROOT, "server/data/.toddler-save-reopen-audit-store.json");
  fs.writeFileSync(store, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: base,
      LLH_STORE_PATH: store,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: "ignore",
  });
  await waitHealth(base);
  const paste = fs.readFileSync(PASTE, "utf8");
  const parser = require("./lesson-paste-organizer-parser.js");
  const apply = require("./lesson-paste-organizer-apply.js");
  const parsed = parser.parseDeterministicPaste(paste);
  const built = apply.buildDraftLessonPlan(parsed, {
    ownerDecisions: {},
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  if (!built.ok || !parsed.canSaveDraft) {
    throw new Error(`cannot save: ok=${built.ok} canSaveDraft=${parsed.canSaveDraft}`);
  }

  const login = await requestJson(port, "POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  const token = login.json.token;
  const stampRes = await requestJson(port, "GET", "/api/admin/site-content", null, token);
  const save = await requestJson(port, "POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt: stampRes.json.siteContent?.updatedAt || "",
    lessonPlan: built.lessonPlan,
  }, token);
  if (save.status !== 200) throw new Error(`save failed ${save.status}`);
  const savedId = save.json.lessonPlan.id;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(base + "/", { waitUntil: "load" });
  await page.evaluate(() => setView("admin"));
  await page.fill('input[name="adminEmail"]', ADMIN.email);
  await page.fill('input[name="adminPassword"]', ADMIN.password);
  await page.fill('input[name="adminCode"]', ADMIN.code);
  await page.click("#adminUnlockForm button[type='submit']");
  await page.evaluate((id) => {
    window.__toddlerAuditPlanId = id;
    setAdminSectionTab("curriculum-lesson-plans");
  }, savedId);
  await page.waitForTimeout(1500);
  await page.evaluate((id) => {
    const plans = window.adminCurriculumLessonPlans || [];
    const row = plans.find((p) => p.id === id);
    if (row && typeof openCurriculumLessonPlanEditor === "function") openCurriculumLessonPlanEditor(id);
  }, savedId);
  await page.waitForTimeout(2000);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, "01-reopened-editor.png"), fullPage: true });

  const reload = await requestJson(port, "GET", "/api/admin/site-content", null, token);
  const plan = (reload.json.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === savedId);
  const mon = plan?.dailyPlans?.monday?.items?.[0];
  const monPatch = plan?.enrichmentDraft?.activities?.[mon?.itemId] || {};
  const checks = {
    title: plan?.title === "Pumpkins, Colors, and Fall Fun",
    mondayTitle: mon?.title === "Pumpkin Touch and Notice",
    mondaySafety: String(mon?.safetyNotes || monPatch.safetyNotes || "").toLowerCase().includes("whole pumpkins"),
    mondayObjective: String(mon?.objective || monPatch.objective || "").includes("explore an intact pumpkin"),
    books: (plan?.enrichmentDraft?.week?.books || []).length >= 5,
    pasteHistory: Boolean(plan?.enrichmentDraft?.pasteOrganizerImport?.originalPaste?.includes("Pumpkins, Colors, and Fall Fun")),
  };
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify({ savedId, checks, canSaveDraft: parsed.canSaveDraft }, null, 2));
  console.log(JSON.stringify(checks, null, 2));
  await browser.close();
  child.kill("SIGTERM");
  if (!Object.values(checks).every(Boolean)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
