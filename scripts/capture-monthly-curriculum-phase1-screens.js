#!/usr/bin/env node
/**
 * Capture Phase 1 Monthly Curriculum screenshots (admin builder + user Netflix row).
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = 4710 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(ROOT, "server/data", `launch-store-series-shots-${process.pid}.json`);
const OUT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN = {
  email: "series-shots@example.com",
  password: "series-shots-pass",
  code: "series-shots-code",
};

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (child.exitCode !== null) throw new Error("server exited");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    if (login.status !== 200) throw new Error(`login ${login.status}`);
    const token = login.json.token;
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    let expectedUpdatedAt = bootstrap.json?.siteContent?.updatedAt || "";
    const now = new Date().toISOString();
    const planIds = [];
    for (let i = 1; i <= 4; i += 1) {
      const id = `shot-lp-${i}`;
      planIds.push(id);
      const titles = ["Fall Leaves", "Apples", "Pumpkins", "Friendly Halloween"];
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: {
          id,
          title: titles[i - 1],
          age: "Preschool",
          theme: titles[i - 1],
          plan: "Free",
          status: "published",
          weeklyOverview: `Week about ${titles[i - 1].toLowerCase()}.`,
          objectives: "Explore seasonal concepts through play.",
          dailyPlans: Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"].map((day) => [day, {
            theme: `${titles[i - 1]} ${day}`,
            items: [{
              itemId: `${id}-${day}`,
              title: `${titles[i - 1]} play`,
              activityCategory: "Open-Ended Exploration",
              description: "Children explore materials.",
              materials: "Seasonal props",
              steps: "1. Invite children.\n2. Explore together.",
              teacherRole: "Narrate and support.",
              learningGoals: ["Seasonal vocabulary"],
            }],
          }])),
          createdAt: now,
          updatedAt: now,
          publishedAt: now,
        },
      });
      if (save.status !== 200) throw new Error(`plan save ${save.status} ${JSON.stringify(save.json)}`);
      expectedUpdatedAt = save.json.siteContentUpdatedAt;
    }

    const seriesSave = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        title: "October Preschool Curriculum",
        description: "Four playful weeks of fall themes.",
        age: "Preschool",
        month: "October",
        weekCount: 4,
        plan: "Free",
        status: "published",
        featured: true,
        coverImageSource: "fallback",
        overallGoals: "Build seasonal vocabulary and fine motor skills.",
        overallMaterials: "Leaves, apples, pumpkins, art supplies",
        weeks: planIds.map((id, index) => ({ weekNumber: index + 1, lessonPlanId: id, displayOrder: index + 1 })),
      },
    });
    if (seriesSave.status !== 200) throw new Error(`series ${seriesSave.status} ${JSON.stringify(seriesSave.json)}`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const base = `http://127.0.0.1:${PORT}`;

    // Admin builder
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ email, token: adminToken }) => {
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email,
        token: adminToken,
        name: "Series Shots",
        mode: "server",
        loggedInAt: new Date().toISOString(),
        trustedDevice: true,
      }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
    }, { ...ADMIN, token });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function" && typeof setAdminSectionTab === "function");
    const seriesId = seriesSave.json.series.id;
    await page.evaluate(async (payload) => {
      setView("admin");
      if (typeof loadAdminSiteContent === "function") {
        await loadAdminSiteContent().catch(() => {});
      }
      if (typeof applyCurriculumState === "function") {
        applyCurriculumState(payload.curriculum, { siteContentUpdatedAt: payload.siteContentUpdatedAt });
      }
      setAdminSectionTab("curriculum-series");
      globalThis.LLHMonthlyCurriculumPhase1?.renderAdminCurriculumSeriesManager?.();
    }, {
      curriculum: seriesSave.json.curriculum,
      siteContentUpdatedAt: seriesSave.json.siteContentUpdatedAt,
    });
    await page.waitForSelector("#adminCurriculumSeriesApp", { timeout: 10000 });
    await page.waitForTimeout(400);
    const editBtn = page.locator(`[data-series-edit="${seriesId}"]`);
    if (await editBtn.count()) {
      await editBtn.click();
    } else {
      await page.evaluate((seeded) => {
        // Directly open editor with seeded series draft
        const api = globalThis.LLHMonthlyCurriculumPhase1;
        document.querySelector("#adminCreateCurriculumSeriesButton")?.click();
        // Populate form fields after create
        setTimeout(() => {
          const form = document.querySelector("#adminCurriculumSeriesForm");
          if (!form) return;
          if (form.title) form.title.value = seeded.title || "";
          if (form.age) form.age.value = seeded.age || "Preschool";
          if (form.month) form.month.value = seeded.month || "";
          (seeded.weeks || []).forEach((week) => {
            const select = form.querySelector(`[name="weekPlan_${week.weekNumber}"]`);
            if (select && week.lessonPlanId) select.value = week.lessonPlanId;
          });
        }, 50);
      }, seriesSave.json.series);
    }
    await page.waitForSelector("#adminCurriculumSeriesForm", { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.locator("#adminCurriculumSeriesApp").screenshot({
      path: path.join(OUT_DIR, "monthly-curriculum-admin-builder.png"),
    });
    await page.screenshot({
      path: path.join(OUT_DIR, "monthly-curriculum-admin-builder-full.png"),
      fullPage: true,
    });

    // User Netflix view — inject published series into public library cache if needed
    const user = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await user.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await user.waitForFunction(() => typeof setView === "function");
    await user.evaluate(async (payload) => {
      if (typeof refreshPublicCurriculumLibrary === "function") {
        await refreshPublicCurriculumLibrary().catch(() => {});
      }
      if (typeof applyCurriculumState === "function") {
        applyCurriculumState(payload.curriculum, { siteContentUpdatedAt: payload.siteContentUpdatedAt });
      }
      setView("lessons");
    }, {
      curriculum: seriesSave.json.curriculum,
      siteContentUpdatedAt: seriesSave.json.siteContentUpdatedAt,
    });
    await user.waitForTimeout(1200);
    await user.screenshot({
      path: path.join(OUT_DIR, "monthly-curriculum-user-netflix.png"),
      fullPage: true,
    });

    await user.locator('[data-lesson-library-type="monthly"]').click();
    await user.waitForTimeout(700);
    await user.screenshot({
      path: path.join(OUT_DIR, "monthly-curriculum-user-monthly-filter.png"),
      fullPage: true,
    });
    await user.locator("[data-open-monthly-series]").first().click();
    await user.waitForTimeout(700);
    await user.screenshot({
      path: path.join(OUT_DIR, "monthly-curriculum-user-detail.png"),
      fullPage: true,
    });

    // Mobile
    await user.setViewportSize({ width: 390, height: 844 });
    await user.evaluate(() => {
      globalThis.LLHMonthlyCurriculumPhase1?.setOpenMonthlySeriesId?.("");
      globalThis.LLHMonthlyCurriculumPhase1?.setLessonLibraryTypeFilter?.("all");
      setView("lessons");
    });
    await user.waitForTimeout(800);
    await user.screenshot({
      path: path.join(OUT_DIR, "monthly-curriculum-user-mobile.png"),
      fullPage: true,
    });

    await browser.close();
    console.log("Screenshots written to", OUT_DIR);
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
