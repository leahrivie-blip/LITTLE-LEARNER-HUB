#!/usr/bin/env node
/**
 * Regression: Teaching Kit viewer must not collapse the content area into a
 * tiny strip. One intentional vertical scrollport under sticky header/tabs.
 *
 * Run: npm run test:teaching-kit-viewer-layout
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 7300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-viewer-layout-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-viewer-layout";
const ADMIN = {
  email: "tk-layout-admin@example.com",
  password: "tk-layout-pass",
  code: "tk-layout-code",
};
const SHORT_ID = "cur-lp-tk-layout-short";
const LONG_ID = "cur-lp-tk-layout-long";

const VIEWPORTS = [
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

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

function dayItems(prefix, count) {
  return Array.from({ length: count }, (_, i) => ({
    itemId: `${prefix}-${i + 1}`,
    title: `${prefix} activity ${i + 1}`,
    activityCategory: i % 2 === 0 ? "Sensory Play" : "Fine Motor",
    objective: "Practice theme language and gentle hands.",
    description: "Open-ended invitation with loose parts and teacher prompts for observation.",
    materials: "Baskets, trays, theme props",
    setup: "Stage trays before arrival.",
    steps: "1. Invite. 2. Narrate. 3. Observe. 4. Clean up together.",
    teacherTips: "Stay close; offer one prompt at a time.",
    observationOpportunities: "Names a prop; stays engaged 2+ minutes.",
  }));
}

function makePlan({ id, title, long }) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  days.forEach((day) => {
    dailyPlans[day] = {
      theme: title,
      focus: `${day} focus for ${title}`,
      objectives: "Explore theme materials; use new vocabulary",
      learningDomains: ["Language & Literacy", "Physical Development"],
      materials: "Trays, baskets, theme props",
      vocabulary: "theme, explore, gentle, notice",
      circleTime: ["Song + book talk"],
      invitationToPlay: `Invitation for ${day}`,
      sensory: "Sensory tray exploration",
      fineMotor: "Sorting and pinching practice",
      grossMotor: "Movement path",
      art: long ? "Process art collage" : "",
      smallGroup: "Small group language table",
      outdoorPlay: "Outdoor noticing walk",
      teacherPreparation: "Stage materials; preview book",
      safetyNotes: "Supervise closely; mouthing-safe sizes",
      familyConnection: "Talk about the theme at home",
      observations: ["Uses theme words", "Invites a peer"],
      items: dayItems(`${id}-${day}`, long ? 5 : 2),
    };
  });
  return {
    id,
    title,
    status: "published",
    age: "Preschool",
    ageGroup: "Preschool",
    theme: title,
    plan: "Pro",
    weeklyOverview: long
      ? `${title} weekly overview. `.repeat(40)
      : `${title} weekly overview for layout regression.`,
    objectives: "Children will explore theme materials and practice vocabulary.",
    weeklyMaterials: "Baskets\nTrays\nTheme props\nBooks",
    familyConnection: "Ask families what they notice about the theme.",
    vocabularyWords: "explore, gentle, notice, share",
    books: [{ title: "Theme Book", author: "Local Library" }],
    songs: [{ title: "Theme Song", rightsStatus: "original", lyrics: "We explore together today." }],
    dailyPlans,
    disposableQaFixture: true,
  };
}

function flattenActivities(plan) {
  const out = [];
  for (const day of Object.keys(plan.dailyPlans || {})) {
    for (const item of plan.dailyPlans[day].items || []) {
      out.push({
        id: `cur-act-${item.itemId}`,
        lessonPlanId: plan.id,
        itemId: item.itemId,
        dayOfWeek: day,
        title: item.title,
        status: "published",
        activityCategory: item.activityCategory,
        objective: item.objective,
        description: item.description,
        materials: item.materials,
        setup: item.setup,
        steps: item.steps,
        teacherTips: item.teacherTips,
        observationOpportunities: item.observationOpportunities,
      });
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
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
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200 && login.json?.token, "admin login");
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    let site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`, null, auth);
    ok(site.status === 200, "load site content");
    let stamp = site.json.siteContent?.updatedAt;
    const flagSave = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      siteContent: {
        ...site.json.siteContent,
        featureFlags: {
          ...(site.json.siteContent.featureFlags || {}),
          playBasedCurriculum: true,
          teachingKitViewer: true,
          teachingKitPrintCenter: true,
          teachingKitAttachments: false,
        },
      },
    }, auth);
    ok(flagSave.status === 200, `enable TK viewer flags (${flagSave.status} ${flagSave.json?.error || ""})`);
    stamp = flagSave.json.siteContent?.updatedAt || stamp;

    const shortPlan = makePlan({ id: SHORT_ID, title: "Layout Short Kit", long: false });
    const longPlan = makePlan({ id: LONG_ID, title: "Layout Long Kit", long: true });
    for (const plan of [shortPlan, longPlan]) {
      const seeded = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        lessonPlan: plan,
      }, auth);
      ok(seeded.status === 200, `seed ${plan.id} (${seeded.status} ${seeded.json?.error || ""})`);
      stamp = seeded.json.siteContentUpdatedAt || seeded.json.siteContent?.updatedAt || stamp;
    }
    // Keep flattenActivities referenced for clarity / future activity sync checks.
    ok(flattenActivities(longPlan).length >= 20, "long kit has many activities for scroll coverage");

    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      for (const planId of [SHORT_ID, LONG_ID]) {
        for (const vp of VIEWPORTS) {
          const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
          await page.goto(`http://127.0.0.1:${PORT}/?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.waitForFunction(() => (
            document.body.classList.contains("app-booted")
            && typeof window.LLHTeachingKitViewer !== "undefined"
            && typeof window.fetchTeachingKitForPlan === "function"
          ), null, { timeout: 60000 });
          await page.evaluate(async ({ email, token, planId }) => {
            localStorage.setItem("llhUser", email);
            localStorage.setItem("llhAdminUnlocked", "true");
            localStorage.setItem("llhAdminSession", JSON.stringify({
              token,
              email,
              unlockedAt: new Date().toISOString(),
            }));
            if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();

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

            const kitHttp = await fetch(`/api/curriculum/lesson-plans/${encodeURIComponent(planId)}/teaching-kit?day=monday`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            });
            const kitRes = await kitHttp.json();
            if (!kitHttp.ok || !kitRes?.teachingKit) {
              throw new Error(`kit fetch failed for ${planId}: ${kitHttp.status} ${kitRes?.error || ""}`);
            }
            // Layout test only — force unlocked payload so chrome/content mount.
            const teachingKit = { ...kitRes.teachingKit, locked: false };
            const enhanced = await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
              body,
              teachingKit,
              featureFlags: {
                teachingKitViewer: true,
                teachingKitPrintCenter: true,
                ...(kitRes.featureFlags || {}),
              },
              chrome: {
                title: teachingKit.title || planId,
                age: "Preschool",
                planLabel: "Pro",
                theme: "Layout",
                backLabel: "Back",
                actionBarsHtml: `<div class="lesson-workspace-action-bars" data-lesson-action-bars>
                  <div class="lesson-workspace-primary-actions">
                    <button type="button" class="primary-button lesson-workspace-use-plan-btn">Use This Plan</button>
                    <button type="button" class="ghost-button lesson-workspace-secondary-btn">Download Teacher Weekly Planner</button>
                    <button type="button" class="ghost-button lesson-workspace-secondary-btn">Download Full Lesson Plan</button>
                    <button type="button" class="ghost-button">More</button>
                  </div>
                </div>`,
                feedbackHtml: `<section class="lesson-workspace-feedback"><h3>Rate this lesson plan</h3><p>Was this lesson plan helpful?</p></section>`,
                copyrightHtml: `<footer class="llh-copyright-block lesson-workspace-copyright"><p>© Test</p></footer>`,
              },
            });
            if (!enhanced?.enhanced) {
              throw new Error(`viewer enhance failed: ${enhanced?.reason || "unknown"}`);
            }
          }, { email: ADMIN.email, token, planId });
          await page.waitForSelector(".teaching-kit-workspace [data-tk-workspace-scroll]", { timeout: 15000 });
          await page.waitForTimeout(300);

          const surfaces = ["start", "setup", "today", "binder", "build"];
          for (const surface of surfaces) {
            await page.locator(`[data-tk-goto="${surface}"]`).first().click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(250);
            const metrics = await page.evaluate(() => {
              const scroll = document.querySelector("[data-tk-workspace-scroll]");
              const panels = document.querySelector(".teaching-kit-workspace .tk-panels");
              const host = document.querySelector(".teaching-kit-workspace .tk-panel-host");
              const surfaceEl = document.querySelector(".teaching-kit-workspace .tk-surface");
              const top = document.querySelector(".teaching-kit-workspace .lesson-workspace-topchrome");
              const feedback = document.querySelector(".teaching-kit-workspace .lesson-workspace-feedback");
              const ws = document.querySelector(".teaching-kit-workspace");
              const rect = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return {
                  h: r.height,
                  scrollH: el.scrollHeight,
                  clientH: el.clientHeight,
                  overflowY: cs.overflowY,
                };
              };
              const nestedScrollers = [...(ws?.querySelectorAll("*") || [])].filter((el) => {
                if (el.matches("[data-tk-workspace-scroll]")) return false;
                const oy = getComputedStyle(el).overflowY;
                if (oy !== "auto" && oy !== "scroll") return false;
                return el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0 && el.clientHeight < 240;
              }).map((el) => el.className?.toString?.().slice(0, 80) || el.tagName);
              return {
                vh: window.innerHeight,
                scroll: rect(scroll),
                panels: rect(panels),
                host: rect(host),
                surface: rect(surfaceEl),
                top: rect(top),
                feedback: rect(feedback),
                nestedTinyScrollers: nestedScrollers,
              };
            });

            const label = `${planId.includes("long") ? "long" : "short"}/${vp.name}/${surface}`;
            ok(metrics.scroll && metrics.scroll.h > 0, `${label}: scrollport mounted`);
            // Content scrollport must use a large share of the viewport (not a ~170px strip).
            const minScroll = Math.max(280, Math.floor(metrics.vh * 0.45));
            ok(
              metrics.scroll.h >= minScroll,
              `${label}: scrollport height ${Math.round(metrics.scroll.h)} >= ${minScroll}`,
            );
            ok(
              metrics.panels && metrics.panels.overflowY === "visible",
              `${label}: panels overflow visible (no nested panel scroller)`,
            );
            ok(
              metrics.host && metrics.host.overflowY === "visible",
              `${label}: panel host overflow visible`,
            );
            ok(
              metrics.nestedTinyScrollers.length === 0,
              `${label}: no tiny nested scroll containers (${metrics.nestedTinyScrollers.join("|") || "none"})`,
            );
            if (surface === "start") {
              ok(metrics.surface && metrics.surface.h >= 120, `${label}: start surface readable`);
            }
            if (metrics.feedback) {
              ok(metrics.feedback.h >= 40, `${label}: feedback area not compressed away`);
            }

            if (surface === "binder" && vp.name === "desktop-1366") {
              const shot = path.join(ARTIFACT_DIR, `${planId}-${vp.name}-${surface}.png`);
              await page.screenshot({ path: shot, fullPage: false });
            }
          }

          // Long plan must actually scroll inside the single scrollport.
          if (planId === LONG_ID && vp.name === "desktop-1366") {
            await page.locator(`[data-tk-goto="start"]`).first().click();
            await page.waitForTimeout(200);
            const scrollProbe = await page.evaluate(async () => {
              const scroll = document.querySelector("[data-tk-workspace-scroll]");
              if (!scroll) return { ok: false };
              const before = scroll.scrollTop;
              scroll.scrollTop = 400;
              await new Promise((r) => setTimeout(r, 50));
              return {
                ok: true,
                before,
                after: scroll.scrollTop,
                canScroll: scroll.scrollHeight > scroll.clientHeight + 40,
              };
            });
            ok(scrollProbe.canScroll, "long/desktop-1366: content taller than scrollport");
            ok(scrollProbe.after > 0, "long/desktop-1366: scrollport scrolls vertically");
          }

          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    console.log(`\nTeaching Kit viewer layout regression: ${passed} assertions passed`);
  } catch (error) {
    console.error("\nLayout regression failed:", error.message);
    if (stderr) console.error(stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main();
