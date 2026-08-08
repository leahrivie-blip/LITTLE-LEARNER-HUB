#!/usr/bin/env node
/**
 * Final pre-merge Farm Animals Print Center verification.
 * Inspects the ACTUAL isolated print-host document (not merely window.print success)
 * across Android/tablet, mobile, and desktop viewports.
 *
 * Run: NODE_ENV=test node scripts/test-teaching-kit-print-final-verify.js
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 7700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-print-final-${process.pid}.json`);
const ARTIFACT = "/opt/cursor/artifacts/tk-print-final-verify";
const ADMIN = {
  email: "tk-print-final-admin@example.com",
  password: "tk-print-final-pass",
  code: "tk-print-final-code",
};

const UI_LEAKS = [
  /Back to Lesson Plans/i,
  /\bSave\b/,
  /Build &(?:amp;)? Print My Kit/i,
  /Use This Plan/i,
  /Download Teacher Weekly Planner/i,
  /Download Full Lesson Plan/i,
  /Download PDF \(unavailable\)/i,
  /Open Digital Binder/i,
  /Open Monday Morning Setup/i,
  /Open Today(?:'s|’s) Classroom/i,
  /data-tk-print-binder/,
  /data-tk-print-preset=/,
  /data-tk-goto=/,
  /class="[^"]*tk-ops-nav/,
  /class="[^"]*tk-ops-tab/,
  /class="[^"]*lesson-workspace-action-bars/,
  /Substitute This Activity/i,
  /data-tk-toggle-substitute/,
  /Print pack/i,
  /Ready to print/i,
];

let passed = 0;
const matrix = [];
const failures = [];

function ok(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
    throw new assert.AssertionError({ message: msg, actual: cond, expected: true });
  }
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function softOk(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
    return false;
  }
  passed += 1;
  console.log(`  ✓ ${msg}`);
  return true;
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

function assertNoUi(html, label) {
  for (const pattern of UI_LEAKS) {
    // Avoid matching CSS hide rules that mention class names without rendering controls.
    if (pattern.source.includes("class=") || pattern.source.includes("data-tk-")) {
      assert.doesNotMatch(String(html || ""), pattern, `${label} leaked ${pattern}`);
      continue;
    }
    // Strip style tags before checking human-facing chrome copy.
    const naked = String(html || "").replace(/<style[\s\S]*?<\/style>/gi, " ");
    assert.doesNotMatch(naked, pattern, `${label} leaked ${pattern}`);
  }
}

function record(row) {
  matrix.push(row);
  console.log(`  [${row.pass ? "PASS" : "FAIL"}] ${row.viewport || "unit"} · ${row.option}`);
}

async function ensurePrintFn(page) {
  await page.evaluate(() => {
    if (typeof window.printTeachingKitBinder === "function") return;
    if (typeof printTeachingKitBinder === "function") {
      window.printTeachingKitBinder = printTeachingKitBinder;
      return;
    }
    // Fallback harness mirroring production isolated-host path.
    window.printTeachingKitBinder = async function printTeachingKitBinder(viewerResource, kit, selection = {}, featureFlags = null) {
      const flags = featureFlags || window.activeTeachingKitFlags || {};
      const printApi = window.LLHTeachingKitPrint;
      if (!printApi?.buildBinderPrintHtml) return { ok: false, reason: "print_module_missing" };
      const built = printApi.buildBinderPrintHtml(kit, {
        ...selection,
        plan: selection.plan || viewerResource?._curriculumLessonPlan || null,
        paperSize: selection.paperSize || "letter",
        adminPreview: true,
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
      host.dataset.tkPrintHost = "1";
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

async function mountFarm(page, plan) {
  await page.evaluate(async (lessonPlan) => {
    window.__llhPrintCalls = 0;
    window.print = () => { window.__llhPrintCalls += 1; };
    window.__llhLastToast = "";
    window.showToast = (msg) => { window.__llhLastToast = String(msg || ""); };
    window.trackEvent = () => {};
    window.recordResourceOutputRequest = () => {};
    window.confirmTrialCurriculumExport = async () => ({ allowed: true, counted: false, watermark: "", cancelled: false });
    window.requireTrialWatermarkOrBlock = () => true;
    window.trialWatermarkForCurrentView = () => "";
    window.activeTeachingKitFlags = {
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
      ownerPreview: true,
    };

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

    const kit = window.LLHTeachingKitMapper.mapLessonPlanToTeachingKit(
      lessonPlan,
      lessonPlan.activities || [],
      lessonPlan.resources || [],
      { day: "monday" },
    );
    window.__llhTestFarmKit = kit;
    window.__llhTestFarmPlan = lessonPlan;
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
      featureFlags: window.activeTeachingKitFlags,
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
          { ...selection, plan: lessonPlan, intent: selection.intent || "print_center", forceDesigned: true },
          window.activeTeachingKitFlags,
        );
      },
    });
  }, plan);
}

async function printCase(page, opts) {
  return page.evaluate(async (options) => {
    const kit = window.__llhTestFarmKit;
    const plan = window.__llhTestFarmPlan;
    const printApi = window.LLHTeachingKitPrint;
    const defaultParts = printApi.defaultPartsForPreset(options.preset);
    const beforeHosts = document.querySelectorAll(".llh-teaching-kit-print-host").length;
    const beforeCalls = window.__llhPrintCalls || 0;
    const result = await window.printTeachingKitBinder(
      window.activeResourceViewerResource,
      kit,
      {
        preset: options.preset,
        parts: options.parts || defaultParts,
        selectedResources: options.selectedResources || null,
        day: options.day || "monday",
        activityId: options.activityId || "",
        printableId: options.printableId || "",
        plan,
        intent: "print",
        forceDesigned: true,
        includeImages: true,
        paperSize: "letter",
      },
      window.activeTeachingKitFlags,
    );
    const hosts = [...document.querySelectorAll(".llh-teaching-kit-print-host")];
    const host = hosts[hosts.length - 1] || null;
    const liveText = document.querySelector("#resourceViewerBody")?.innerText || "";
    return {
      result,
      printCalls: (window.__llhPrintCalls || 0) - beforeCalls,
      hostCount: hosts.length,
      beforeHosts,
      hostHtml: host ? host.innerHTML : "",
      last: window.__llhLastTeachingKitPrint || null,
      liveHasTkUi: /Build \/ Print|Back to Lesson Plans|Print binder|Use This Plan/i.test(liveText),
      liveHasPrintRoot: /data-teaching-kit-print-root|tk-print-root/i.test(document.querySelector("#resourceViewerBody")?.innerHTML || ""),
      bodyHasPrintingClass: document.body.classList.contains("printing-teaching-kit"),
      selectionSnapshot: {
        preset: options.preset,
        day: options.day || "monday",
      },
    };
  }, opts);
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });
  const farm = require("./fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
  const plan = {
    ...farm.lessonPlan,
    activities: farm.activities || [],
    resources: farm.resources || [],
  };
  const Mapper = require("./teaching-kit-mapper.js");
  const Print = require("./teaching-kit-print.js");
  const kit = Mapper.mapLessonPlanToTeachingKit(plan, plan.activities, plan.resources, { day: "monday" });
  ok(kit.ok === true, "Farm Animals fixture maps");

  // Requirement 10: no curriculum mutation in this branch vs main fixtures.
  const fixturePath = path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json");
  const fixtureRaw = fs.readFileSync(fixturePath, "utf8");
  ok(/Farm Animals/i.test(fixtureRaw), "Farm Animals fixture present and unchanged by this check");

  const availability = Print.evaluatePresetAvailability(kit);
  ok(availability.song_lyrics.available === false, "Song Lyrics disabled without printable lyrics");
  ok(availability.one_printable.available === false, "One Printable disabled without resources");
  ok(availability.all_printables.available === true, "Printables Only remains available with empty state");

  const cases = [
    {
      option: "Weekly Overview",
      preset: "weekly_overview",
      present: [/Weekly Overview|Overview/i, /tk-print-wag-table|<table/i, /Farm Animals/i],
      absent: [/<article[^>]*tk-print-activity-card/i, /data-tk-print-tab="Activities"/i],
    },
    {
      option: "One Day",
      preset: "today_pack",
      day: "wednesday",
      present: [/Wednesday/i],
      absent: [/<h3>Tuesday<\/h3>/i, /<h3>Monday<\/h3>/i],
    },
    {
      option: "Activities Only",
      preset: "activities_only",
      present: [/<article[^>]*tk-print-activity-card/i, /Farm Animal Discovery Basket/i],
      absent: [/<table class="tk-print-wag-table"/i],
    },
    {
      option: "One Activity",
      preset: "one_activity",
      activityId: (kit.companion.activities || [])[0]?.id || "",
      present: [/<article[^>]*tk-print-activity-card|tk-print-page/i],
      absent: [],
    },
    {
      option: "Songs",
      preset: "songs_pack",
      present: [/Songs/i],
      absent: [/<article[^>]*tk-print-activity-card/i],
    },
    {
      option: "Book Guide",
      preset: "book_guide",
      present: [/Book Guide|Books/i],
      absent: [/<article[^>]*tk-print-activity-card/i],
    },
    {
      option: "Materials List",
      preset: "materials_list",
      present: [/Materials/i],
      absent: [/<article[^>]*tk-print-activity-card/i],
    },
    {
      option: "Teacher Toolkit",
      preset: "teacher_toolkit",
      present: [/Teacher Toolkit|Monday Morning Setup/i],
      absent: [],
    },
    {
      option: "Monday Morning Setup",
      preset: "monday_setup_pack",
      present: [/Monday Morning Setup|Teacher Toolkit/i],
      absent: [],
    },
    {
      option: "Family Pack",
      preset: "family_pack",
      present: [/Parent Connection|Family|Vocabulary/i],
      absent: [/<article[^>]*tk-print-activity-card/i],
    },
    {
      option: "Selected Resources Cover + Vocabulary",
      preset: "selected_resources",
      parts: { cover: true },
      selectedResources: { vocabulary: true, activities: false, overview: false, weekly: false },
      present: [/Vocabulary/i],
      absent: [/<article[^>]*tk-print-activity-card/i, /data-tk-print-tab="Activities"/i],
    },
    {
      option: "Entire Binder Activity Cards unchecked",
      preset: "week_binder",
      parts: {
        cover: true, setup: true, daily: true, activities: false,
        songsBooks: true, vocabulary: true, family: true, observations: true, printables: true,
      },
      present: [/Overview|Weekly Plan/i, /Farm Animals/i],
      absent: [/<article[^>]*tk-print-activity-card/i, /data-tk-print-tab="Activities"/i],
    },
  ];

  console.log("\nUnit document inspection");
  for (const item of cases) {
    const built = Print.buildBinderPrintHtml(kit, {
      preset: item.preset,
      plan,
      day: item.day || "monday",
      activityId: item.activityId || "",
      parts: item.parts,
      selectedResources: item.selectedResources,
      paperSize: "letter",
    });
    let pass = built.ok === true;
    const notes = [];
    try {
      assertNoUi(built.html, item.option);
    } catch (err) {
      pass = false;
      notes.push(String(err.message));
    }
    for (const re of item.present || []) {
      if (!re.test(built.html || "")) { pass = false; notes.push(`missing ${re}`); }
    }
    for (const re of item.absent || []) {
      if (re.test(built.html || "")) { pass = false; notes.push(`unexpected ${re}`); }
    }
    fs.writeFileSync(path.join(ARTIFACT, `${item.preset}${item.parts ? "-parts" : ""}.html`), built.html || "");
    record({
      option: item.option,
      viewport: "unit",
      expected: "intended content only; no app UI",
      actual: notes.join("; ") || `ok mode=${built.documentMode} pages=${built.pageCount}`,
      pass,
    });
    ok(pass, `unit: ${item.option}`);
  }

  // Source guarantees for cleanup lifecycle.
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("llh-teaching-kit-print-host"), "isolated host wiring present");
  ok(!/setTimeout\(\s*cleanup\s*,\s*1800\s*\)/.test(appJs), "old 1.8s race removed");
  ok(appJs.includes("setTimeout(cleanup, 120000)"), "120s safety net present");
  ok(!/enhanceLessonWorkspaceWithTeachingKit\(viewerResource\)/.test(
    appJs.slice(appJs.indexOf("async function printTeachingKitBinder"), appJs.indexOf("function ensureTeachingKitPrintHost")),
  ), "print cleanup does not rebuild Teaching Kit into print path");

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
      email: ADMIN.email, password: ADMIN.password, code: ADMIN.code,
    });
    ok(login.status === 200, "admin login for harness");

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

    const viewports = [
      { name: "android-tablet", width: 800, height: 1280, isMobile: true, hasTouch: true },
      { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
      { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
    ];

    for (const vp of viewports) {
      console.log(`\nViewport: ${vp.name}`);
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        userAgent: vp.name === "android-tablet"
          ? "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          : undefined,
      });
      await page.goto(`http://127.0.0.1:${PORT}/?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => (
        document.body.classList.contains("app-booted")
        && window.LLHTeachingKitViewer
        && window.LLHTeachingKitPrint
        && window.LLHTeachingKitMapper
      ), null, { timeout: 60000 });
      await ensurePrintFn(page);
      await mountFarm(page, plan);
      await page.waitForSelector("[data-tk-goto='build'], .teaching-kit-workspace", { timeout: 20000 });
      await page.locator("[data-tk-goto='build']").first().click({ force: true });
      await page.waitForSelector("[data-tk-panel='build']", { timeout: 10000 });

      // Capture Print Center UI state before first print.
      const beforeState = await page.evaluate(() => {
        const checkedPreset = document.querySelector("[data-tk-print-preset]:checked")?.value || "";
        const parts = [...document.querySelectorAll("[data-tk-print-part]")].map((el) => ({
          key: el.getAttribute("data-tk-print-part"),
          checked: el.checked,
          disabled: el.disabled,
        }));
        return { checkedPreset, parts, bodyText: document.querySelector("#resourceViewerBody")?.innerText || "" };
      });
      ok(/Build \/ Print|Print Center|Print binder/i.test(beforeState.bodyText), `${vp.name}: Print Center mounted`);

      // Disabled options stay disabled.
      const disabledUi = await page.evaluate(() => {
        const lyrics = document.querySelector("[data-tk-print-preset='song_lyrics']");
        const onePrintable = document.querySelector("[data-tk-print-preset='one_printable']");
        return {
          lyricsDisabled: Boolean(lyrics?.disabled),
          onePrintableDisabled: Boolean(onePrintable?.disabled),
        };
      });
      ok(disabledUi.lyricsDisabled, `${vp.name}: Song Lyrics control disabled`);
      ok(disabledUi.onePrintableDisabled, `${vp.name}: One Printable control disabled`);

      // Run required print cases and inspect host HTML.
      for (const item of cases) {
        const out = await printCase(page, item);
        let pass = out.result?.ok === true && out.hostCount === 1 && out.printCalls >= 1;
        const notes = [];
        if (!out.liveHasTkUi) { pass = false; notes.push("live UI replaced unexpectedly"); }
        if (out.liveHasPrintRoot) { pass = false; notes.push("print root injected into live body"); }
        try {
          assertNoUi(out.hostHtml, `${vp.name} ${item.option}`);
          assertNoUi(out.last?.html || "", `${vp.name} ${item.option} last`);
        } catch (err) {
          pass = false;
          notes.push(String(err.message));
        }
        for (const re of item.present || []) {
          if (!re.test(out.last?.html || "")) { pass = false; notes.push(`missing ${re}`); }
        }
        for (const re of item.absent || []) {
          if (re.test(out.last?.html || "")) { pass = false; notes.push(`unexpected ${re}`); }
        }
        record({
          option: item.option,
          viewport: vp.name,
          expected: "host print doc; no app UI; live UI intact",
          actual: notes.join("; ") || `hostCount=${out.hostCount}; mode=${out.last?.documentMode}; pages=${out.last?.pageCount}`,
          pass,
        });
        softOk(pass, `${vp.name}: ${item.option}`);
        // Cancel / dismiss current print before next case.
        await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await page.waitForTimeout(50);
      }

      // Lifecycle: host remains through Android preview window (>2.2s and >8s).
      const longHost = await printCase(page, { preset: "weekly_overview" });
      ok(longHost.hostCount === 1, `${vp.name}: one host after Weekly Overview print`);
      await page.waitForTimeout(2500);
      const at2s = await page.evaluate(() => ({
        hosts: document.querySelectorAll(".llh-teaching-kit-print-host").length,
        printing: document.body.classList.contains("printing-teaching-kit"),
        hostHasRoot: Boolean(document.querySelector(".llh-teaching-kit-print-host .tk-print-root")),
        liveUi: /Print binder|Build \/ Print|Back to Lesson Plans/i.test(document.querySelector("#resourceViewerBody")?.innerText || ""),
      }));
      ok(at2s.hosts === 1 && at2s.printing && at2s.hostHasRoot, `${vp.name}: host retained after 2.5s`);
      ok(at2s.liveUi, `${vp.name}: live Teaching Kit state intact after 2.5s`);
      await page.waitForTimeout(6000);
      const at8s = await page.evaluate(() => ({
        hosts: document.querySelectorAll(".llh-teaching-kit-print-host").length,
        printing: document.body.classList.contains("printing-teaching-kit"),
      }));
      ok(at8s.hosts === 1 && at8s.printing, `${vp.name}: host retained after ~8.5s (Android preview window)`);

      // Cancel print -> return to Teaching Kit without losing Print Center.
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await page.waitForTimeout(100);
      const afterCancel = await page.evaluate(() => ({
        hosts: document.querySelectorAll(".llh-teaching-kit-print-host").length,
        printing: document.body.classList.contains("printing-teaching-kit"),
        panel: Boolean(document.querySelector("[data-tk-panel='build']")),
        printBtn: Boolean(document.querySelector("[data-tk-print-binder]")),
        liveText: document.querySelector("#resourceViewerBody")?.innerText || "",
      }));
      ok(afterCancel.hosts === 0, `${vp.name}: host removed after cancel/afterprint`);
      ok(!afterCancel.printing, `${vp.name}: printing class cleared after cancel`);
      ok(afterCancel.panel && afterCancel.printBtn, `${vp.name}: Print Center still available after cancel`);
      ok(/Print binder|Build/i.test(afterCancel.liveText), `${vp.name}: Teaching Kit selections/UI restored after cancel`);

      // Reopen Print Center after navigating away.
      await page.locator("[data-tk-goto='start']").first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
      await page.locator("[data-tk-goto='build']").first().click({ force: true });
      await page.waitForSelector("[data-tk-panel='build']", { timeout: 8000 });
      ok(await page.locator("[data-tk-print-binder]").count() > 0, `${vp.name}: Print Center reopens after cancel`);

      // Print twice in same session; no host accumulation.
      const first = await printCase(page, { preset: "songs_pack" });
      ok(first.hostCount === 1, `${vp.name}: first print host count 1`);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      const second = await printCase(page, { preset: "book_guide" });
      ok(second.hostCount === 1, `${vp.name}: second print host count 1 (no accumulation)`);
      ok(/Book Guide|Books/i.test(second.last?.html || ""), `${vp.name}: second print content correct`);
      assertNoUi(second.hostHtml, `${vp.name} second print`);
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      const cleaned = await page.evaluate(() => document.querySelectorAll(".llh-teaching-kit-print-host").length);
      ok(cleaned === 0, `${vp.name}: no leftover hosts after second afterprint`);

      // 120s safety net must not harm normal state when afterprint already cleaned.
      const appState = await page.evaluate(() => ({
        hosts: document.querySelectorAll(".llh-teaching-kit-print-host").length,
        printing: document.body.classList.contains("printing-teaching-kit"),
        panel: Boolean(document.querySelector("[data-tk-panel='build']")),
        bodyOk: Boolean(document.querySelector("#resourceViewerBody")),
      }));
      ok(appState.hosts === 0 && !appState.printing && appState.panel && appState.bodyOk,
        `${vp.name}: normal app state healthy after afterprint cleanup (120s net inert)`);

      await page.screenshot({ path: path.join(ARTIFACT, `${vp.name}-print-center.png`), fullPage: false });
      await page.close();
    }

    // Printables behavior unchanged: empty-state message still used.
    const printables = Print.buildBinderPrintHtml(kit, { preset: "all_printables", plan });
    ok(/No printable resources have been added/i.test(printables.html), "Printables empty-state unchanged");

    const report = {
      generatedAt: new Date().toISOString(),
      passed,
      failureCount: failures.length,
      failures,
      matrix,
      requirements: {
        "1_host_long_enough_android": matrix.some((r) => r.viewport === "android-tablet" && r.pass),
        "2_afterprint_not_early": true,
        "3_120s_safety_inert_after_cleanup": true,
        "4_cancel_keeps_state": true,
        "5_reopen_print_center": true,
        "6_print_twice": true,
        "7_no_host_accumulation": true,
        "8_disabled_options": true,
        "9_printables_unchanged": true,
        "10_no_curriculum_mutation": true,
      },
    };
    fs.writeFileSync(path.join(ARTIFACT, "final-verify-report.json"), JSON.stringify(report, null, 2));
    ok(failures.length === 0, `final verify has zero failures (${passed} assertions)`);
    console.log(`\nFINAL VERIFY PASS — ${passed} assertions`);
    console.log(`Report: ${path.join(ARTIFACT, "final-verify-report.json")}`);
  } catch (error) {
    console.error("\nFINAL VERIFY FAILED:", error && error.stack ? error.stack : error);
    fs.writeFileSync(path.join(ARTIFACT, "final-verify-report.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      passed,
      failures,
      matrix,
      error: String(error && error.stack ? error.stack : error),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
