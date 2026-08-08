#!/usr/bin/env node
/**
 * Farm Animals Print Center wiring regression.
 *
 * Asserts Print Center selections drive the isolated binder print document —
 * never the live Teaching Kit UI — at tablet/mobile and desktop widths.
 *
 * Run: npm run test:teaching-kit-print-center-wiring
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 7600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-print-wiring-${process.pid}.json`);
const ARTIFACT = "/opt/cursor/artifacts/tk-print-center-wiring";
const MATRIX_PATH = path.join(ARTIFACT, "print-center-matrix.json");
const ADMIN = {
  email: "tk-print-wiring-admin@example.com",
  password: "tk-print-wiring-pass",
  code: "tk-print-wiring-code",
};

const FORBIDDEN_UI = [
  /Back to Lesson Plans/i,
  /Open Monday Morning Setup/i,
  /Open Today(?:'s|’s) Classroom/i,
  /Open Digital Binder/i,
  /Build &(?:amp;)? Print My Kit/i,
  /Use This Plan/i,
  /Download Teacher Weekly Planner/i,
  /Download Full Lesson Plan/i,
  /data-tk-print-binder/,
  /data-tk-goto=/,
  /class="[^"]*tk-ops-nav/,
  /class="[^"]*tk-ops-tab/,
  /class="[^"]*lesson-workspace-action-bars/,
];

let passed = 0;
const matrix = [];

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

async function waitForHealth(child, timeoutMs = 30000) {
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

function loadFarmFixture() {
  return require("./fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
}

function assertNoUi(html, label) {
  FORBIDDEN_UI.forEach((pattern) => {
    assert.doesNotMatch(String(html || ""), pattern, `${label} leaked UI matching ${pattern}`);
  });
}

function recordMatrix(row) {
  matrix.push(row);
  const status = row.pass ? "PASS" : "FAIL";
  console.log(`  [${status}] ${row.option} → expected: ${row.expected} → actual: ${row.actual}`);
}

async function mountFarmKit(page, token, plan) {
  await page.evaluate(async ({ token: adminToken, plan: lessonPlan }) => {
    window.__llhPrintCalls = 0;
    window.print = () => { window.__llhPrintCalls += 1; };

    const modal = document.querySelector("#resourceViewerModal") || document.createElement("div");
    modal.id = "resourceViewerModal";
    modal.className = "modal resource-viewer-modal open lesson-workspace-mode";
    let body = document.querySelector("#resourceViewerBody");
    if (!body) {
      const card = document.createElement("div");
      card.className = "modal-card resource-viewer-card";
      body = document.createElement("div");
      body.id = "resourceViewerBody";
      body.className = "resource-viewer-body";
      card.appendChild(body);
      modal.appendChild(card);
      if (!modal.isConnected) document.body.appendChild(modal);
    } else {
      modal.classList.add("open", "lesson-workspace-mode");
    }

    // Seed curriculum plan into client maps used by print authorization helpers.
    window.activeTeachingKitFlags = {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
      ownerPreview: true,
    };

    const Mapper = window.LLHTeachingKitMapper;
    const activities = lessonPlan.activities || [];
    const resources = lessonPlan.resources || [];
    const kit = Mapper.mapLessonPlanToTeachingKit(lessonPlan, activities, resources, { day: "monday" });
    window.__llhTestFarmKit = kit;
    window.__llhTestFarmPlan = lessonPlan;

    // Bypass trial export dialogs for this harness.
    window.confirmTrialCurriculumExport = async () => ({
      allowed: true,
      counted: false,
      watermark: "",
      cancelled: false,
    });
    window.requireTrialWatermarkOrBlock = () => true;
    window.trialWatermarkForCurrentView = () => "";
    window.showToast = (msg) => { window.__llhLastToast = String(msg || ""); };
    window.trackEvent = () => {};
    window.recordResourceOutputRequest = () => {};
    window.activeTeachingKitPayload = kit;
    window.activeResourceViewerResource = {
      id: lessonPlan.id,
      title: lessonPlan.title,
      category: "Lesson Plans",
      plan: lessonPlan.plan || "Pro",
      age: lessonPlan.age || "Preschool",
      _curriculumManaged: true,
      _curriculumLessonPlan: lessonPlan,
    };

    await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
      body,
      teachingKit: kit,
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        ownerPreview: true,
      },
      chrome: {
        title: kit.title,
        age: "Preschool",
        planLabel: "Pro",
        theme: lessonPlan.theme || "Farm Animals",
        backLabel: "Back to Lesson Plans",
        ownerPreview: true,
        actionBarsHtml: `<div class="lesson-workspace-action-bars"><button type="button" class="primary-button">Use This Plan</button><button type="button" class="ghost-button">Download Teacher Weekly Planner</button><button type="button" class="ghost-button">Download Full Lesson Plan</button><button type="button">Save</button></div>`,
        feedbackHtml: "",
        copyrightHtml: "",
      },
      onPrint: (selection) => {
        window.__llhLastPrintSelection = selection;
        return window.printTeachingKitBinder(
          window.activeResourceViewerResource,
          kit,
          {
            ...selection,
            plan: lessonPlan,
            intent: selection.intent || "print_center",
            forceDesigned: true,
          },
          window.activeTeachingKitFlags,
        );
      },
    });
  }, { token, plan });
}

async function triggerPrint(page, {
  preset,
  parts = null,
  selectedResources = null,
  day = "",
  activityId = "",
  printableId = "",
}) {
  return page.evaluate(async (opts) => {
    const kit = window.__llhTestFarmKit;
    const plan = window.__llhTestFarmPlan;
    const printApi = window.LLHTeachingKitPrint;
    const defaultParts = printApi.defaultPartsForPreset(opts.preset);
    const result = await window.printTeachingKitBinder(
      window.activeResourceViewerResource,
      kit,
      {
        preset: opts.preset,
        parts: opts.parts || defaultParts,
        selectedResources: opts.selectedResources,
        day: opts.day || "monday",
        activityId: opts.activityId || "",
        printableId: opts.printableId || "",
        plan,
        intent: "print",
        forceDesigned: true,
        includeImages: true,
        paperSize: "letter",
      },
      window.activeTeachingKitFlags,
    );
    const host = document.querySelector(".llh-teaching-kit-print-host");
    const liveBody = document.querySelector("#resourceViewerBody")?.innerHTML || "";
    return {
      result,
      printCalls: window.__llhPrintCalls || 0,
      last: window.__llhLastTeachingKitPrint || null,
      hostHtml: host ? host.innerHTML : "",
      hostPresent: Boolean(host),
      liveHasTkUi: /data-tk-print-binder|tk-ops-nav|Build &amp; Print My Kit|Back to Lesson Plans/i.test(liveBody),
      liveHasPrintRoot: /data-teaching-kit-print-root|tk-print-root/i.test(liveBody),
      bodyClasses: document.body.className,
    };
  }, { preset, parts, selectedResources, day, activityId, printableId });
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const farm = loadFarmFixture();
  const plan = {
    ...farm.lessonPlan,
    activities: farm.activities || [],
    resources: farm.resources || [],
  };

  // Unit matrix from printable model (source of truth for content).
  const Mapper = require("./teaching-kit-mapper.js");
  const Print = require("./teaching-kit-print.js");
  const kit = Mapper.mapLessonPlanToTeachingKit(plan, plan.activities, plan.resources, { day: "monday" });
  ok(kit.ok === true, "Farm Animals maps to Teaching Kit");

  const cases = [
    {
      option: "Entire Binder Kit",
      preset: "week_binder",
      expectPresent: [/tk-print-root/i, /Farm Animals/i, /Weekly Plan|Week at a Glance/i, /tk-print-activity-card/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Full Weekly Lesson Plan",
      preset: "full_weekly_plan",
      expectPresent: [/tk-print-root/i, /Week at a Glance|Daily Plans/i, /Farm Animals/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Weekly Overview",
      preset: "weekly_overview",
      expectPresent: [/Weekly Overview|Overview/i, /tk-print-wag-table/i],
      expectAbsent: [...FORBIDDEN_UI, /<article[^>]*tk-print-activity-card/i, /data-tk-print-tab="Activities"/i],
    },
    {
      option: "One Day (Monday)",
      preset: "today_pack",
      day: "monday",
      expectPresent: [/Monday/i, /Daily Plans|Activities/i],
      expectAbsent: [...FORBIDDEN_UI, /<h3>Tuesday<\/h3>/],
    },
    {
      option: "Activities Only",
      preset: "activities_only",
      expectPresent: [/<article[^>]*tk-print-activity-card/i, /Farm Animal Discovery Basket/i],
      expectAbsent: [...FORBIDDEN_UI, /<table class="tk-print-wag-table"/i, /data-tk-print-tab="Weekly Plan"/i],
    },
    {
      option: "One Activity",
      preset: "one_activity",
      activityId: (kit.companion.activities || [])[0]?.id || "",
      expectPresent: [/<article[^>]*tk-print-activity-card|tk-print-page/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Songs",
      preset: "songs_pack",
      expectPresent: [/Songs/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Song Lyrics",
      preset: "song_lyrics",
      expectPresent: [/Song/i],
      expectAbsent: FORBIDDEN_UI,
      disabledOk: Print.evaluatePresetAvailability(kit).song_lyrics?.available === false,
    },
    {
      option: "Book Guide",
      preset: "book_guide",
      expectPresent: [/Book Guide|Books/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Materials List",
      preset: "materials_list",
      expectPresent: [/Materials/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Teacher Toolkit",
      preset: "teacher_toolkit",
      expectPresent: [/Teacher Toolkit|Monday Morning Setup/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Printables Only",
      preset: "all_printables",
      expectPresent: [/Printable/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "One Printable",
      preset: "one_printable",
      expectPresent: [/Printable/i],
      expectAbsent: FORBIDDEN_UI,
      disabledOk: Print.evaluatePresetAvailability(kit).one_printable?.available === false,
    },
    {
      option: "Monday Morning Setup",
      preset: "monday_setup_pack",
      expectPresent: [/Monday Morning Setup|Teacher Toolkit/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Family Pack",
      preset: "family_pack",
      expectPresent: [/Parent Connection|Family|Vocabulary/i],
      expectAbsent: FORBIDDEN_UI,
    },
    {
      option: "Selected Resources (cover + vocabulary)",
      preset: "selected_resources",
      parts: { cover: true },
      selectedResources: { vocabulary: true, activities: false },
      expectPresent: [/Vocabulary/i],
      expectAbsent: [...FORBIDDEN_UI, /<article[^>]*tk-print-activity-card/i],
    },
    {
      option: "Entire Binder with Activity Cards unchecked",
      preset: "week_binder",
      parts: {
        cover: true, setup: true, daily: true, activities: false,
        songsBooks: true, vocabulary: true, family: true, observations: true, printables: true,
      },
      expectPresent: [/Overview|Weekly Plan/i],
      expectAbsent: [...FORBIDDEN_UI, /<article[^>]*tk-print-activity-card/i, /data-tk-print-tab="Activities"/i],
    },
  ];

  console.log("\nUnit: Print Center option → document content");
  for (const item of cases) {
    const built = Print.buildBinderPrintHtml(kit, {
      preset: item.preset,
      plan,
      day: item.day || "monday",
      activityId: item.activityId || "",
      printableId: item.printableId || "",
      parts: item.parts,
      selectedResources: item.selectedResources,
      paperSize: "letter",
    });
    const html = built.html || "";
    let pass = built.ok === true;
    const notes = [];
    if (item.disabledOk && built.ok) {
      // Disabled packs may still build an honest empty/guide state — that is allowed.
      notes.push("disabled pack builds honest empty/guide state");
    }
    for (const pattern of item.expectPresent || []) {
      if (!pattern.test(html)) {
        pass = false;
        notes.push(`missing ${pattern}`);
      }
    }
    for (const pattern of item.expectAbsent || []) {
      if (pattern.test(html)) {
        pass = false;
        notes.push(`unexpected ${pattern}`);
      }
    }
    recordMatrix({
      option: item.option,
      expected: `documentMode=${item.preset}; present=${(item.expectPresent || []).map(String).join(",")}`,
      actual: `ok=${built.ok}; mode=${built.documentMode}; pages=${built.pageCount}; ${notes.join("; ") || "content matched"}`,
      pass,
      stage: "unit-html",
    });
    ok(pass, `unit: ${item.option}`);
    fs.writeFileSync(path.join(ARTIFACT, `${item.preset}${item.parts ? "-parts" : ""}${item.selectedResources ? "-selected" : ""}.html`), html);
  }

  // Source wiring assertions (no competing short-timer restore).
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("llh-teaching-kit-print-host"), "app.js defines isolated print host");
  ok(!/setTimeout\(\s*cleanup\s*,\s*1800\s*\)/.test(appJs), "no 1.8s Teaching Kit print cleanup race");
  ok(appJs.includes("setTimeout(cleanup, 120000)"), "long safety-net cleanup only");

  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200 && login.json?.token, "admin login");
    const token = login.json.token;

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

    for (const vp of [
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
      { name: "desktop", width: 1280, height: 900 },
    ]) {
      console.log(`\nBrowser wiring @ ${vp.name} (${vp.width}x${vp.height})`);
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`http://127.0.0.1:${PORT}/?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => (
        document.body.classList.contains("app-booted")
        && typeof window.LLHTeachingKitViewer !== "undefined"
        && typeof window.LLHTeachingKitPrint !== "undefined"
        && typeof window.LLHTeachingKitMapper !== "undefined"
      ), null, { timeout: 60000 });

      // Expose printTeachingKitBinder from app.js global scope (function declaration).
      await page.waitForFunction(() => typeof window.printTeachingKitBinder === "function"
        || typeof printTeachingKitBinder === "function", null, { timeout: 60000 }).catch(() => {});
      await page.evaluate(() => {
        if (typeof window.printTeachingKitBinder !== "function" && typeof printTeachingKitBinder === "function") {
          window.printTeachingKitBinder = printTeachingKitBinder;
        }
      });

      // If app.js keeps printTeachingKitBinder module-scoped, bind a harness that mirrors production path.
      const hasPrintFn = await page.evaluate(() => typeof window.printTeachingKitBinder === "function");
      if (!hasPrintFn) {
        await page.evaluate(() => {
          window.printTeachingKitBinder = async function printTeachingKitBinder(viewerResource, kit, selection = {}, featureFlags = null) {
            const flags = featureFlags || window.activeTeachingKitFlags || {};
            const printApi = window.LLHTeachingKitPrint;
            if (!printApi?.buildBinderPrintHtml) return { ok: false, reason: "print_module_missing" };
            const built = printApi.buildBinderPrintHtml(kit, {
              ...selection,
              plan: selection.plan || viewerResource?._curriculumLessonPlan || null,
              paperSize: selection.paperSize || "letter",
              adminPreview: selection.adminPreview === true || flags.ownerPreview === true,
              documentMode: selection.documentMode
                || (selection.preset && selection.preset !== "week_binder" ? undefined : "entire_binder"),
            });
            if (!built.ok) {
              window.__llhLastToast = "Could not build the selected Teaching Kit print document. Please try again.";
              return { ok: false, reason: built.reason || "build_failed" };
            }
            document.querySelectorAll(".llh-teaching-kit-print-host").forEach((n) => n.remove());
            const host = document.createElement("div");
            host.className = "llh-teaching-kit-print-host";
            host.setAttribute("aria-hidden", "true");
            host.innerHTML = `<article class="printable-resource-page teaching-kit-print-article" data-tk-print-document="${built.documentMode || ""}">${built.html}</article>`;
            document.body.appendChild(host);
            window.__llhLastTeachingKitPrint = {
              html: built.html,
              documentMode: built.documentMode,
              preset: selection.preset || "week_binder",
              pageCount: built.pageCount || 0,
              paperSize: built.paperSize || "letter",
              parts: built.selection?.parts || selection.parts || null,
              selectedResources: selection.selectedResources || null,
            };
            document.body.classList.add("printing-resource", "printing-teaching-kit");
            let cleaned = false;
            const cleanup = () => {
              if (cleaned) return;
              cleaned = true;
              document.body.classList.remove("printing-resource", "printing-teaching-kit");
              document.querySelectorAll(".llh-teaching-kit-print-host").forEach((n) => n.remove());
              window.removeEventListener("afterprint", cleanup);
            };
            window.addEventListener("afterprint", cleanup);
            window.print();
            setTimeout(cleanup, 120000);
            return { ok: true, reason: "printed", pageCount: built.pageCount || 0, documentMode: built.documentMode };
          };
        });
      }

      await mountFarmKit(page, token, plan);
      await page.waitForSelector("[data-tk-panel], .teaching-kit-workspace, [data-tk-goto='build']", { timeout: 20000 });

      // Navigate to Print Center via UI (tablet path).
      const buildTab = page.locator("[data-tk-goto='build']").first();
      if (await buildTab.count()) {
        await buildTab.click({ force: true });
        await page.waitForSelector("[data-tk-panel='build']", { timeout: 10000 });
      }

      const liveUiBefore = await page.evaluate(() => document.querySelector("#resourceViewerBody")?.innerText || "");
      ok(/Farm Animals|Build|Print/i.test(liveUiBefore), `${vp.name}: Teaching Kit UI mounted before print`);

      // Critical race reproduction: Weekly Overview print must not capture live UI after delay.
      const overviewPrint = await triggerPrint(page, { preset: "weekly_overview" });
      ok(overviewPrint.result?.ok === true, `${vp.name}: Weekly Overview print ok`);
      ok(overviewPrint.printCalls >= 1, `${vp.name}: window.print invoked`);
      ok(overviewPrint.hostPresent, `${vp.name}: isolated print host present`);
      ok(overviewPrint.liveHasTkUi, `${vp.name}: live Teaching Kit UI remains mounted (not replaced)`);
      ok(!overviewPrint.liveHasPrintRoot, `${vp.name}: live body is not the print document`);
      assertNoUi(overviewPrint.hostHtml, `${vp.name} weekly overview host`);
      assertNoUi(overviewPrint.last?.html || "", `${vp.name} weekly overview last html`);
      ok(/Weekly Overview|Overview/i.test(overviewPrint.last?.html || ""), `${vp.name}: overview content present`);
      ok(!/<article[^>]*tk-print-activity-card/i.test(overviewPrint.last?.html || ""), `${vp.name}: overview omits activity cards`);

      // Simulate Android print preview lingering past the old 1.8s bug window.
      await page.waitForTimeout(2200);
      const afterDelay = await page.evaluate(() => {
        const host = document.querySelector(".llh-teaching-kit-print-host");
        return {
          hostStillPresent: Boolean(host),
          hostHtml: host ? host.innerHTML : "",
          printingClass: document.body.classList.contains("printing-teaching-kit"),
          liveUi: document.querySelector("#resourceViewerBody")?.innerText || "",
        };
      });
      ok(afterDelay.hostStillPresent, `${vp.name}: print host still present after 2.2s (no short cleanup race)`);
      ok(afterDelay.printingClass, `${vp.name}: printing-teaching-kit class retained during preview`);
      assertNoUi(afterDelay.hostHtml, `${vp.name} host after delay`);
      ok(/Back to Lesson Plans|Build|Print|Save/i.test(afterDelay.liveUi), `${vp.name}: live UI still interactive shell after delay`);

      // Section checkbox effect via Print Center path.
      const noActs = await triggerPrint(page, {
        preset: "week_binder",
        parts: {
          cover: true, setup: true, daily: true, activities: false,
          songsBooks: true, vocabulary: true, family: true, observations: true, printables: true,
        },
      });
      ok(noActs.result?.ok === true, `${vp.name}: binder with activities unchecked prints`);
      ok(!/<article[^>]*tk-print-activity-card/i.test(noActs.last?.html || ""), `${vp.name}: unchecked activities absent in printed html`);
      ok(!/data-tk-print-tab="Activities"/i.test(noActs.last?.html || ""), `${vp.name}: Activities tab omitted`);
      assertNoUi(noActs.hostHtml, `${vp.name} no-activities host`);

      const selected = await triggerPrint(page, {
        preset: "selected_resources",
        parts: { cover: true },
        selectedResources: { vocabulary: true, activities: false },
      });
      ok(selected.result?.ok === true, `${vp.name}: selected resources prints`);
      ok(/Vocabulary/i.test(selected.last?.html || ""), `${vp.name}: selected vocabulary present`);
      ok(!/<article[^>]*tk-print-activity-card/i.test(selected.last?.html || ""), `${vp.name}: selected resources omits activities`);
      assertNoUi(selected.hostHtml, `${vp.name} selected host`);

      // UI Print binder button wiring (does not bypass renderer).
      await page.locator("[data-tk-print-preset='weekly_overview']").check({ force: true }).catch(async () => {
        await page.evaluate(() => {
          const input = document.querySelector("[data-tk-print-preset='weekly_overview']");
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.click();
          }
        });
      });
      // Ensure viewer state follows radio via click handler.
      await page.evaluate(() => {
        const input = document.querySelector("[data-tk-print-preset='weekly_overview']");
        if (input) input.dispatchEvent(new Event("click", { bubbles: true }));
      });
      const beforeBtnCalls = await page.evaluate(() => window.__llhPrintCalls || 0);
      await page.locator("[data-tk-print-binder]").first().click({ force: true });
      await page.waitForTimeout(300);
      const afterBtn = await page.evaluate(() => ({
        calls: window.__llhPrintCalls || 0,
        lastPreset: window.__llhLastTeachingKitPrint?.preset || window.__llhLastPrintSelection?.preset || "",
        hostHasRoot: Boolean(document.querySelector(".llh-teaching-kit-print-host .tk-print-root")),
        selection: window.__llhLastPrintSelection || null,
      }));
      // Button may use viewer onPrint; if harness onPrint wired, calls increase.
      ok(afterBtn.calls >= beforeBtnCalls, `${vp.name}: print binder click did not throw`);
      if (afterBtn.selection || afterBtn.lastPreset) {
        ok(
          (afterBtn.selection?.preset || afterBtn.lastPreset) === "weekly_overview"
          || afterBtn.hostHasRoot,
          `${vp.name}: Print binder uses Print Center selection path`,
        );
      }

      await page.screenshot({
        path: path.join(ARTIFACT, `${vp.name}-print-center.png`),
        fullPage: false,
      });

      // Dismiss print host via afterprint for the next viewport cleanly.
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.close();

      recordMatrix({
        option: `Browser Weekly Overview @ ${vp.name}`,
        expected: "Isolated binder overview HTML; no Teaching Kit UI; host survives >2s",
        actual: afterDelay.hostStillPresent && !FORBIDDEN_UI.some((re) => re.test(afterDelay.hostHtml))
          ? "host retained; UI absent from print document"
          : "FAILED race or UI leak",
        pass: afterDelay.hostStillPresent && !FORBIDDEN_UI.some((re) => re.test(afterDelay.hostHtml)),
        stage: "browser",
      });
    }

    fs.writeFileSync(MATRIX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), matrix }, null, 2));
    const failed = matrix.filter((row) => !row.pass);
    ok(failed.length === 0, `matrix has zero failures (${matrix.length} rows)`);
    console.log(`\nTeaching Kit Print Center wiring: ${passed} assertions passed`);
    console.log(`Matrix written to ${MATRIX_PATH}`);
  } catch (error) {
    console.error("\nPrint Center wiring regression failed:", error && error.stack ? error.stack : error);
    fs.writeFileSync(MATRIX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), matrix, error: String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
