#!/usr/bin/env node
/**
 * Focused regression for Teaching Kit UI + print polish.
 * Run: npm run test:teaching-kit-ui-print-polish
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const present = require("./teaching-kit-present.js");
const printApi = require("./teaching-kit-print.js");
const viewer = require("./teaching-kit-viewer.js");
const teachingKit = require("./teaching-kit.js");

const ROOT = path.join(__dirname, "..");
const PORT = 7400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-ui-polish-${process.pid}.json`);
const ARTIFACT = "/opt/cursor/artifacts/tk-ui-print-polish";
const ADMIN = {
  email: "tk-polish-admin@example.com",
  password: "tk-polish-pass",
  code: "tk-polish-code",
};
const PLAN_ID = "cur-lp-tk-ui-polish-fixture";

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

async function waitForHealth(child, timeoutMs = 25000) {
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

function fixturePlan() {
  const day = (focus, title) => ({
    theme: "Polish Theme",
    focus,
    materials: "Trays, baskets",
    circleTime: ["Welcome song"],
    invitationToPlay: "Open invitation",
    sensory: "Sensory tray",
    fineMotor: "Sorting",
    grossMotor: "Movement path",
    outdoorPlay: "Nature walk",
    smallGroup: "Language table",
    teacherPreparation: "Stage materials",
    safetyNotes: "Supervise closely",
    familyConnection: "Talk about the theme",
    observations: ["Uses theme words"],
    items: [{
      itemId: `${title}-1`,
      title,
      activityCategory: "Fine Motor",
      objective: "Explore carefully",
      description: "Invite children to explore.",
      materials: "Trays",
      setup: "Stage trays.",
      steps: "1. Invite. 2. Observe.",
      teacherTips: "Stay close.",
      observationOpportunities: "Names a prop",
      safetyNotes: "Mouthing-safe sizes",
    }],
  });
  return {
    id: PLAN_ID,
    title: "UI Polish Fixture Kit",
    status: "published",
    age: "Preschool",
    theme: "Polish Theme",
    plan: "Pro",
    weeklyOverview: "Focused Teaching Kit polish fixture.",
    objectives: "Children explore carefully.",
    weeklyMaterials: "Trays\nBaskets",
    vocabularyWords: "explore, gentle",
    books: [{ title: "Theme Book", author: "Library" }],
    songs: [{
      title: "Theme Song",
      rightsStatus: "copyrighted_title_only",
      lyrics: "",
      motions: "Clap gently",
    }, {
      title: "Public Song",
      rightsStatus: "public_domain",
      lyrics: "We sing together.",
      motions: "Sway",
    }],
    dailyPlans: {
      monday: day("Monday focus", "Monday Sort"),
      tuesday: day("Tuesday focus", "Tuesday Sort"),
      wednesday: day("Wednesday focus", "Wednesday Sort"),
      thursday: day("Thursday focus", "Thursday Sort"),
      friday: day("Friday focus", "Friday Sort"),
    },
    disposableQaFixture: true,
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT, { recursive: true });

  // Unit: presentation formatter
  ok(present.presentLabel("copyrighted_title_only") === "Copyrighted title only", "rights label humanized");
  ok(present.presentLabel("public_domain") === "Public domain", "public domain label");
  ok(present.presentLabel("week_binder") === "Entire Binder Kit", "preset label");
  ok(present.presentLabel("AGE_MODIFICATIONS") === "Age adaptations", "screaming snake label");
  ok(present.presentLabel("OBSERVATION_OPPORTUNITIES") === "Observation opportunities", "observation label");
  ok(present.isDeveloperFacingCopy("ACTIVITY_NAME"), "developer token detected");

  const fixture = require("./fixtures/teaching-kit/enriched-mini.json");
  const kit = teachingKit.mapLessonPlanToTeachingKit(
    fixture.lessonPlan,
    fixture.activities,
    fixture.resources,
    { day: "monday" },
  );
  ok(kit.ok === true, "mapper ok");
  const print = printApi.buildBinderPrintHtml(kit, { preset: "week_binder", paperSize: "letter" });
  ok(print.ok === true, "print html builds");
  ok(/Complete Teaching Kit|Teacher Binder|Entire Binder Kit/i.test(print.html), "print pack uses friendly preset label");
  ok(!/copyrighted_title_only|week_binder|AGE_MODIFICATIONS|OBSERVATION_OPPORTUNITIES/i.test(print.html), "print html has no raw enums");
  ok(/Objective|Materials|Observation|Teacher Toolkit|Weekly Plan|Week at a Glance|Overview/i.test(print.html), "print uses friendly section titles");

  const todayHtml = viewer.surfaceHtml(kit, { ...viewer.defaultState(kit), surface: "today", openEverything: true }, {});
  ok(/tk-today-launcher/.test(todayHtml), "today launcher present");
  ok(!/leave this open/i.test(todayHtml), "old sticky leave-this-open copy removed");
  ok(/tk-tray-inline/.test(todayHtml), "packet is inline tray");
  ok(!/position:\s*sticky/.test(todayHtml), "today html does not hardcode sticky");

  const startHtml = viewer.surfaceHtml(kit, { ...viewer.defaultState(kit), surface: "start" }, {});
  ok(/tk-start-actions/.test(startHtml), "start action hierarchy class");

  const buildHtml = viewer.surfaceHtml(kit, {
    ...viewer.defaultState(kit),
    surface: "build",
    printCenterEnabled: true,
  }, {});
  ok(/Entire Binder Kit|Ready to print/i.test(buildHtml), "build summary readable");
  ok(!/>\s*week_binder\s*</i.test(buildHtml), "build summary hides raw week_binder");

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

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200 && login.json?.token, "admin login");
    const token = login.json.token;
    let site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    let stamp = site.json.siteContent?.updatedAt;
    const flags = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      siteContent: {
        ...site.json.siteContent,
        featureFlags: {
          ...(site.json.siteContent.featureFlags || {}),
          teachingKitViewer: true,
          teachingKitPrintCenter: true,
        },
      },
    }, { Authorization: `Bearer ${token}` });
    ok(flags.status === 200, "enable TK flags");
    stamp = flags.json.siteContent?.updatedAt || stamp;
    const seeded = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      lessonPlan: fixturePlan(),
    }, { Authorization: `Bearer ${token}` });
    ok(seeded.status === 200, "seed polish fixture");

    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      for (const vp of [
        { name: "m320", width: 320, height: 720 },
        { name: "m390", width: 390, height: 844 },
        { name: "m430", width: 430, height: 932 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "desktop", width: 1440, height: 900 },
      ]) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`http://127.0.0.1:${PORT}/?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForFunction(() => (
          document.body.classList.contains("app-booted")
          && typeof window.LLHTeachingKitViewer !== "undefined"
          && typeof window.LLHTeachingKitPresent !== "undefined"
        ), null, { timeout: 60000 });

        await page.evaluate(async ({ token, planId }) => {
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
            document.body.appendChild(modal);
          } else {
            modal.classList.add("open", "lesson-workspace-mode");
          }
          const kitRes = await (await fetch(`/api/curriculum/lesson-plans/${planId}/teaching-kit?day=monday`, {
            headers: { Authorization: `Bearer ${token}` },
          })).json();
          const teachingKit = { ...kitRes.teachingKit, locked: false };
          await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
            body,
            teachingKit,
            featureFlags: { teachingKitViewer: true, teachingKitPrintCenter: true },
            chrome: {
              title: teachingKit.title,
              age: "Preschool",
              planLabel: "Pro",
              theme: "Polish Theme",
              backLabel: "Back",
              actionBarsHtml: `<div class="lesson-workspace-action-bars"><button type="button" class="primary-button">Use This Plan</button><button type="button" class="ghost-button">Download Teacher Weekly Planner</button><button type="button" class="ghost-button">Download Full Lesson Plan</button></div>`,
              feedbackHtml: `<section class="lesson-workspace-feedback"><h3>Rate this lesson plan</h3></section>`,
              copyrightHtml: `<footer class="lesson-workspace-copyright"><p>© Test</p></footer>`,
            },
          });
        }, { token, planId: PLAN_ID });

        await page.waitForSelector("[data-tk-workspace-scroll]", { timeout: 15000 });

        for (const surface of ["start", "setup", "today", "binder", "build"]) {
          await page.locator(`.tk-ops-tab[data-tk-goto="${surface}"]`).click();
          await page.waitForTimeout(200);
          const overflow = await page.evaluate(() => {
            const root = document.querySelector(".teaching-kit-workspace");
            return root ? root.scrollWidth <= root.clientWidth + 1 : false;
          });
          ok(overflow, `${vp.name}/${surface}: no horizontal overflow`);
        }

        await page.locator(`.tk-ops-tab[data-tk-goto="today"]`).click();
        await page.waitForSelector("[data-tk-panel='today']", { timeout: 5000 });
        const beforeOpen = await page.evaluate(() => {
          const day = document.querySelector(".tk-day-strip");
          const schedule = document.querySelector(".tk-timeline, .tk-section-title");
          const launcher = document.querySelector("[data-tk-today-launcher]");
          const sticky = getComputedStyle(launcher).position;
          return {
            dayTop: day?.getBoundingClientRect().top || 0,
            scheduleTop: schedule?.getBoundingClientRect().top || 0,
            sticky,
            launcherH: launcher?.getBoundingClientRect().height || 0,
          };
        });
        ok(beforeOpen.sticky === "static", `${vp.name}: launcher is not sticky/fixed`);
        ok(beforeOpen.launcherH > 0 && beforeOpen.launcherH < 220, `${vp.name}: launcher compact`);

        await page.locator("[data-tk-open-everything]").first().click();
        await page.waitForSelector("[data-tk-tray]", { timeout: 5000 });
        const afterOpen = await page.evaluate(() => {
          const day = document.querySelector(".tk-day-strip");
          const tray = document.querySelector("[data-tk-tray]");
          const schedule = [...document.querySelectorAll(".tk-section-title")].find((el) => /schedule/i.test(el.textContent || ""));
          const dayBox = day.getBoundingClientRect();
          const trayBox = tray.getBoundingClientRect();
          const schedBox = schedule?.getBoundingClientRect();
          const coversDay = !(trayBox.bottom <= dayBox.top + 1 || trayBox.top >= dayBox.bottom - 1);
          const coversSchedule = schedBox
            ? !(trayBox.bottom <= schedBox.top + 1 || trayBox.top >= schedBox.bottom - 1) && getComputedStyle(tray).position !== "static"
            : false;
          return {
            trayPosition: getComputedStyle(tray).position,
            coversDay,
            coversSchedule,
            hasClose: Boolean(document.querySelector("[data-tk-tray] [data-tk-open-everything]")),
            bodyText: document.querySelector("[data-tk-panel='today']")?.innerText || "",
          };
        });
        ok(afterOpen.trayPosition === "static", `${vp.name}: open packet stays in document flow`);
        ok(!afterOpen.coversDay, `${vp.name}: packet does not cover day strip`);
        ok(!afterOpen.coversSchedule, `${vp.name}: packet does not use overlay covering schedule`);
        ok(afterOpen.hasClose, `${vp.name}: packet has close control`);
        ok(!/copyrighted_title_only|week_binder|AGE_MODIFICATIONS/i.test(afterOpen.bodyText), `${vp.name}: no raw enums in Today`);

        await page.locator("[data-tk-tray] [data-tk-open-everything]").click();
        await page.waitForTimeout(150);
        ok(await page.locator("[data-tk-tray]").count() === 0, `${vp.name}: packet closes`);

        await page.locator(`.tk-ops-tab[data-tk-goto="build"]`).click();
        const buildText = await page.locator("[data-tk-panel='build']").innerText();
        ok(/Entire Binder Kit|Ready to print/i.test(buildText), `${vp.name}: build summary friendly`);
        ok(!/\bweek_binder\b/i.test(buildText), `${vp.name}: build hides week_binder`);

        if (vp.name === "m390" || vp.name === "desktop") {
          await page.locator(`.tk-ops-tab[data-tk-goto="today"]`).click();
          await page.locator("[data-tk-open-everything]").first().click();
          await page.screenshot({ path: path.join(ARTIFACT, `${vp.name}-today-packet.png`), fullPage: false });
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }

    console.log(`\nTeaching Kit UI/print polish: ${passed} assertions passed`);
  } catch (error) {
    console.error("\nPolish regression failed:", error.message);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
