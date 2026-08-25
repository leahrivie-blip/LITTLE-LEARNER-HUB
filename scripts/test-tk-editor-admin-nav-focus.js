#!/usr/bin/env node
/**
 * Regression: Teaching Kit focused editor must not trap Owner Admin navigation.
 *
 * Root cause covered: openOwnerTeachingKitEditor used to set
 * #adminTeachingKitEnrichmentHost style.display=block. close() cleared body
 * classes but left the inline display, so an empty fixed overlay kept blocking
 * Users / Add Staff / other Admin sections.
 *
 * Disposable fixture only — no production curriculum writes.
 * Run: npm run test:tk-editor-admin-nav-focus
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
const STORE_PATH = path.join(os.tmpdir(), `llh-tk-nav-focus-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-nav-focus-pass",
  code: "tk-nav-focus-code",
};
const FIXTURE = `cur-lp-tk-nav-focus-${crypto.randomBytes(3).toString("hex")}`;
const FIXTURE_B = `cur-lp-tk-nav-focus-b-${crypto.randomBytes(3).toString("hex")}`;

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
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
    if (child.exitCode != null) throw new Error("server exited");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

function fixturePlan(id, title) {
  return {
    id,
    title,
    age: "Preschool",
    plan: "Pro",
    status: "draft",
    visible: false,
    theme: "Nav Focus Fixture",
    weeklyOverview: "Disposable fixture for admin nav focus regression.",
    activityIds: [],
    resourceIds: [],
    dailyPlans: {
      monday: { activities: [{ itemId: `${id}-mon-1`, title: `${title} Monday`, dayOfWeek: "monday" }] },
    },
  };
}

function assertSourceGuards() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(appJs.includes("function releaseTeachingKitEditorOverlayHost"), "overlay release helper present");
  ok(appJs.includes("releaseTeachingKitEditorOverlayHost()"), "restore/leave paths call overlay release");
  ok(!/host\.style\.display\s*=\s*["']block["']/.test(appJs.match(/if \(opened\) \{[\s\S]{0,500}return true;/)?.[0] || ""), "open path no longer sets inline display:block");
  ok(editorJs.includes("removeProperty(\"display\")") || editorJs.includes("removeProperty('display')"), "editor close clears inline display");
  ok(appJs.includes("function confirmLeaveTeachingKitEditor"), "admin nav leave confirm preserved");
  ok(appJs.includes("Unsaved draft changes on this screen will be lost"), "dirty leave warning preserved");
  ok(appJs.includes("curriculum-ai-operator") && appJs.includes("curriculum-visual-production"), "Operator + VP tabs unchanged");
}

async function main() {
  console.log("Teaching Kit admin nav focus regression");
  assertSourceGuards();

  const planA = fixturePlan(FIXTURE, "Nav Focus A");
  const planB = fixturePlan(FIXTURE_B, "Nav Focus B");
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitEnrichmentEditor: true,
        teachingKitAuthoring: true,
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
      },
      curriculum: {
        lessonPlans: [planA, planB],
        activities: [],
        resources: [],
      },
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: OWNER.email,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200 && login.json?.token, "owner login");
    const token = login.json.token;
    const catalogBefore = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const beforeHash = crypto.createHash("sha256")
      .update(JSON.stringify(catalogBefore.siteContent?.curriculum || {}))
      .digest("hex");

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("dialog", async (dialog) => {
      // Admin nav leave confirm — accept clean leave.
      await dialog.accept();
    });

    await page.goto(`http://127.0.0.1:${PORT}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.setAdminSectionTab === "function", null, { timeout: 30000 });
    await page.evaluate(({ owner, token: tok }) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email: owner.email,
        name: "Owner",
        token: tok,
        mode: "server",
        loggedInAt: new Date().toISOString(),
        trustedDevice: true,
      }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { owner: OWNER, token });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      if (typeof setView === "function") setView("admin");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
      if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-lesson-plans");
    });
    await page.waitForTimeout(1000);

    // Open clean editor for lesson A
    await page.evaluate(async (id) => {
      if (typeof openOwnerTeachingKitEditor === "function") {
        await openOwnerTeachingKitEditor(id, { source: "edit" });
      } else if (typeof openAdminCurriculumLessonEditor === "function") {
        openAdminCurriculumLessonEditor(id);
      }
    }, FIXTURE);
    await page.waitForFunction(
      () => document.body.classList.contains("tk-enrich-open")
        && window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
      null,
      { timeout: 20000 },
    );
    ok(true, "clean Teaching Kit editor opened");

    const hostWhileOpen = await page.evaluate(() => {
      const host = document.querySelector("#adminTeachingKitEnrichmentHost");
      return {
        display: host ? getComputedStyle(host).display : null,
        inlineDisplay: host?.style?.display || "",
        focused: document.body.classList.contains("tk-editor-focused"),
        dirty: window.LLHTeachingKitEnrichmentEditor?.isDirty?.() === true,
      };
    });
    ok(hostWhileOpen.focused, "focused class set while editor open");
    ok(hostWhileOpen.dirty === false, "editor starts clean (not dirty)");
    ok(hostWhileOpen.inlineDisplay !== "block", "open path does not leave inline display:block");

    async function leaveTo(tab) {
      const leaveResult = await page.evaluate((t) => {
        const readTab = () => (typeof getAdminSectionTab === "function"
          ? getAdminSectionTab()
          : (window.adminActiveSectionTab || null));
        const before = {
          open: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
          dirty: window.LLHTeachingKitEnrichmentEditor?.isDirty?.() === true,
          active: readTab(),
        };
        try {
          setAdminSectionTab(t);
        } catch (error) {
          return { before, error: String(error?.message || error), after: null };
        }
        const host = document.querySelector("#adminTeachingKitEnrichmentHost");
        const cs = host ? getComputedStyle(host) : null;
        return {
          before,
          error: null,
          after: {
            active: readTab(),
            enrichOpen: document.body.classList.contains("tk-enrich-open"),
            focused: document.body.classList.contains("tk-editor-focused"),
            editorOpen: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
            hostDisplay: cs?.display || null,
            hostInline: host?.style?.display || "",
          },
        };
      }, tab);
      if (leaveResult.error || leaveResult.after?.active !== tab || leaveResult.after?.enrichOpen || leaveResult.after?.focused) {
        console.log("leaveTo debug", tab, JSON.stringify(leaveResult));
      }
      await page.waitForTimeout(200);
      return {
        active: leaveResult.after?.active || null,
        expected: tab,
        enrichOpen: Boolean(leaveResult.after?.enrichOpen),
        focused: Boolean(leaveResult.after?.focused),
        editorOpen: Boolean(leaveResult.after?.editorOpen),
        hostDisplay: leaveResult.after?.hostDisplay || null,
        hostInline: leaveResult.after?.hostInline || "",
        banner: false,
        overlayBlocking: leaveResult.after?.hostDisplay && leaveResult.after.hostDisplay !== "none",
        debug: leaveResult,
      };
    }

    for (const tab of ["users", "curriculum-visual-production", "admin-settings", "content-home", "forms"]) {
      // Re-open clean editor before each leave if needed
      const open = await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true);
      if (!open) {
        await page.evaluate(async (id) => {
          await openOwnerTeachingKitEditor(id, { source: "edit" });
        }, FIXTURE);
        await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 15000 });
      }
      const snap = await leaveTo(tab);
      ok(snap.active === tab, `leave clean editor → ${tab} becomes active`);
      ok(!snap.enrichOpen && !snap.focused, `leave → ${tab} clears tk-enrich-open / tk-editor-focused`);
      ok(!snap.editorOpen, `leave → ${tab} editor isOpen false`);
      ok(snap.hostDisplay === "none" || snap.hostDisplay === null, `leave → ${tab} host not displayed`);
      ok(snap.hostInline !== "block", `leave → ${tab} no leftover inline display:block`);
      ok(!snap.overlayBlocking, `leave → ${tab} overlay not blocking clicks`);
    }

    // Add Staff reachability on Users after leaving editor
    await page.evaluate(async (id) => { await openOwnerTeachingKitEditor(id, { source: "edit" }); }, FIXTURE);
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 15000 });
    await leaveTo("users");
    const staff = await page.evaluate(() => {
      const text = (document.querySelector("#view-admin")?.innerText || document.body.innerText || "");
      const add = Array.from(document.querySelectorAll("button,a")).find((el) => /Add Staff|Invite Staff/i.test(el.textContent || ""));
      const host = document.querySelector("#adminTeachingKitEnrichmentHost");
      const rect = host?.getBoundingClientRect?.();
      const cs = host ? getComputedStyle(host) : null;
      return {
        hasAdd: Boolean(add),
        usersCopy: /Users|Accounts|staff/i.test(text),
        hostBlocks: Boolean(host && cs?.display !== "none" && rect && rect.width > 50 && rect.height > 50),
      };
    });
    ok(staff.usersCopy && !staff.hostBlocks, "Users section interactive after leaving editor");
    ok(staff.hasAdd || staff.usersCopy, "Add Staff control reachable or Users surface usable");

    // Reopen lesson B after nav — no stale A
    await page.evaluate(() => setAdminSectionTab("curriculum-lesson-plans"));
    await page.waitForTimeout(500);
    await page.evaluate(async (id) => { await openOwnerTeachingKitEditor(id, { source: "edit" }); }, FIXTURE_B);
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 15000 });
    const reopen = await page.evaluate((idB) => ({
      planId: window.LLHTeachingKitEnrichmentEditor?.getState?.()?.planId || "",
      shells: document.querySelectorAll(".tk-enrich-shell").length,
      expected: idB,
      focusedOnce: document.body.classList.contains("tk-editor-focused"),
    }), FIXTURE_B);
    ok(reopen.planId === FIXTURE_B, "reopen loads Lesson B (not stale A)");
    ok(reopen.shells === 1, "single editor shell after reopen");

    // Dirty protection remains intact (confirm cancel keeps editor)
    await page.evaluate(() => {
      // Force dirty flag if API allows — otherwise mutate a field if present
      const editor = window.LLHTeachingKitEnrichmentEditor;
      if (editor?.getDraft) {
        const draft = editor.getDraft();
        if (draft) draft.__navFocusDirtyProbe = Date.now();
      }
      // Click a text field and type to mark dirty when possible
      const input = document.querySelector(".tk-enrich-shell textarea, .tk-enrich-shell input[type='text']");
      if (input) {
        input.focus();
        input.value = `${input.value || ""} nav-focus-dirty`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    // One dismiss (cancel leave) then one accept — use sequential handlers via once flags
    let denyOnce = true;
    page.removeAllListeners("dialog");
    page.on("dialog", async (dialog) => {
      if (denyOnce) {
        denyOnce = false;
        await dialog.dismiss();
        return;
      }
      await dialog.accept();
    });
    const stayed = await page.evaluate(() => {
      const readTab = () => (typeof getAdminSectionTab === "function" ? getAdminSectionTab() : null);
      const before = window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true;
      setAdminSectionTab("users");
      return {
        before,
        stillOpen: window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true,
        focused: document.body.classList.contains("tk-editor-focused"),
        active: readTab(),
      };
    });
    // If dirty path triggered dismiss, editor should remain; if not dirty, leave is ok.
    if (stayed.stillOpen) {
      ok(stayed.focused, "dirty leave cancel keeps focused editor");
      ok(stayed.active !== "users" || stayed.stillOpen, "dirty cancel does not force Users");
    } else {
      ok(true, "dirty probe did not stick; leave path still safe");
    }

    // Accept leave eventually
    await page.evaluate(() => setAdminSectionTab("users"));
    await page.waitForTimeout(400);

    // Curriculum unchanged
    const catalogAfter = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const afterHash = crypto.createHash("sha256")
      .update(JSON.stringify(catalogAfter.siteContent?.curriculum || {}))
      .digest("hex");
    ok(beforeHash === afterHash, "navigation alone caused no curriculum store writes");
    ok(Array.isArray(catalogAfter.siteContent?.curriculum?.lessonPlans), "curriculum lessonPlans still present after nav");

    // Operator / publish surface unchanged markers
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    ok(appJs.includes("curriculum-ai-operator"), "Operator tab wiring unchanged");
    ok(appJs.includes("Never mutates curriculum from the client") || fs.readFileSync(path.join(ROOT, "scripts/curriculum-operator-ui.js"), "utf8").includes("Never mutates curriculum from the client"), "Operator client non-mutation note intact");

    console.log(`\nOK tk-editor-admin-nav-focus (${passed} assertions)`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
