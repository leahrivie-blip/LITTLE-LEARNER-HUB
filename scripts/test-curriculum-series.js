#!/usr/bin/env node
/**
 * Monthly curriculum series model + API tests.
 * Run: node scripts/test-curriculum-series.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const seriesApi = require("./curriculum-series.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data", `launch-store-series-test-${process.pid}.json`);
const ADMIN = {
  email: "series-test@example.com",
  password: "series-test-pass",
  code: "series-test-code",
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        console.log(`PASS  ${name}`);
        passed += 1;
      }).catch((error) => {
        console.error(`FAIL  ${name}`);
        console.error(error);
        failed += 1;
      });
    }
    console.log(`PASS  ${name}`);
    passed += 1;
    return Promise.resolve();
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    failed += 1;
    return Promise.resolve();
  }
}

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

function waitForHealth(child, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

async function main() {
  await test("normalize keeps week links without duplicating plans", () => {
    const series = seriesApi.normalizedCurriculumSeries({
      id: "s1",
      title: "October Preschool",
      age: "Preschool",
      month: "October",
      weekCount: 4,
      weeks: [
        { weekNumber: 1, lessonPlanId: "lp1" },
        { weekNumber: 3, lessonPlanId: "lp3" },
      ],
    });
    assert.equal(series.weeks.length, 4);
    assert.equal(series.weeks[0].lessonPlanId, "lp1");
    assert.equal(series.weeks[1].lessonPlanId, "");
    assert.equal(series.weeks[2].lessonPlanId, "lp3");
  });

  await test("series cover resolver maps October to composite monthly illustration", () => {
    const covers = require("./lesson-plan-covers.js");
    const resolved = covers.resolveCurriculumSeriesCover({
      title: "October Preschool Curriculum",
      age: "Preschool",
      month: "October",
      weekThemes: ["Fall Leaves", "Apples", "Pumpkins", "Friendly Halloween"],
    });
    assert.ok(resolved.url.includes("october-preschool-curriculum.jpg"), resolved.url);
    assert.ok(!resolved.url.includes("seasons-year"), "must not use generic seasons cover for October");
    assert.ok(!resolved.url.startsWith("data:"), "should not use gradient data URI");
    assert.equal(resolved.source, "mapped");
  });

  await test("weekly theme covers stay week-specific (not the monthly composite)", () => {
    const covers = require("./lesson-plan-covers.js");
    const cases = [
      { title: "Fall Leaves", theme: "Fall Leaves", expect: "fall-leaves-week.jpg" },
      { title: "Apples", theme: "Apples", expect: "apples-week.jpg" },
      { title: "Pumpkins", theme: "Pumpkins", expect: "pumpkins-week.jpg" },
      { title: "Friendly Halloween", theme: "Friendly Halloween", expect: "friendly-halloween-week.jpg" },
    ];
    cases.forEach((item) => {
      const resolved = covers.resolveLessonPlanCover({
        title: item.title,
        theme: item.theme,
        age: "Preschool",
      });
      assert.ok(resolved.url.includes(item.expect), `${item.title} → ${resolved.url}`);
      assert.ok(!resolved.url.includes("october-preschool-curriculum"), `${item.title} must not use monthly composite`);
    });
  });

  await test("composite cover chosen from linked weekly themes alone", () => {
    const covers = require("./lesson-plan-covers.js");
    const resolved = covers.resolveCurriculumSeriesCover({
      title: "Autumn Adventures",
      age: "Preschool",
      linkedPlans: [
        { title: "Fall Leaves", theme: "Fall Leaves" },
        { title: "Apples", theme: "Apples" },
        { title: "Pumpkins", theme: "Pumpkins" },
        { title: "Friendly Halloween", theme: "Halloween" },
      ],
    });
    assert.ok(resolved.url.includes("october-preschool-curriculum.jpg"), resolved.url);
  });

  await test("stale generic October seasons cover upgrades to composite", () => {
    const covers = require("./lesson-plan-covers.js");
    const resolved = covers.resolveCurriculumSeriesCover({
      title: "October Preschool Curriculum",
      month: "October",
      coverImageUrl: "/images/lesson-covers/seasons-year.jpg",
      coverImageSource: "mapped",
      weekThemes: ["Fall Leaves", "Apples", "Pumpkins", "Friendly Halloween"],
    });
    assert.ok(resolved.url.includes("october-preschool-curriculum.jpg"), resolved.url);
  });

  await test("publish validation reports missing week and age mismatch", () => {
    const series = {
      id: "s2",
      title: "October Preschool",
      age: "Preschool",
      weekCount: 4,
      coverImageSource: "fallback",
      plan: "Free",
      status: "published",
      weeks: [
        { weekNumber: 1, lessonPlanId: "lp1" },
        { weekNumber: 2, lessonPlanId: "lp2" },
        { weekNumber: 3, lessonPlanId: "" },
        { weekNumber: 4, lessonPlanId: "lp4" },
      ],
    };
    const plans = [
      { id: "lp1", title: "Fall Leaves", age: "Preschool", status: "published", plan: "Free" },
      { id: "lp2", title: "Apples", age: "Toddler", status: "published", plan: "Free" },
      { id: "lp4", title: "Halloween", age: "Preschool", status: "draft", plan: "Free" },
    ];
    const errors = seriesApi.validateCurriculumSeriesForPublish(series, plans);
    assert.ok(errors.some((e) => /Week 3 is missing/i.test(e)), errors.join("; "));
    assert.ok(errors.some((e) => /Week 2.*Toddler.*Preschool/i.test(e)), errors.join("; "));
    assert.ok(errors.some((e) => /Week 4.*not published/i.test(e)), errors.join("; "));
  });

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
    const unlock = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(unlock.status, 200, JSON.stringify(unlock.json));
    const token = unlock.json.token;
    assert.ok(token, "admin token");

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    let expectedUpdatedAt = bootstrap.json?.siteContent?.updatedAt || "";

    const now = new Date().toISOString();
    const planIds = [];
    for (let i = 1; i <= 4; i += 1) {
      const id = `lp-series-${i}`;
      planIds.push(id);
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt,
        lessonPlan: {
          id,
          title: `Week ${i} Theme`,
          age: "Preschool",
          theme: `Theme ${i}`,
          plan: "Free",
          status: "published",
          weeklyOverview: "Overview",
          objectives: "Objectives",
          dailyPlans: Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"].map((day, dayIndex) => [day, {
            theme: `${day} theme`,
            items: [{
              itemId: `item-${i}-${day}`,
              title: `Activity ${i} ${day}`,
              activityCategory: "Open-Ended Exploration",
              description: "Desc",
              materials: "Mats",
              steps: "1. Do",
              teacherRole: "Guide",
              learningGoals: ["Goal"],
            }],
          }])),
          createdAt: now,
          updatedAt: now,
          publishedAt: now,
        },
      });
      assert.equal(save.status, 200, `plan ${i}: ${JSON.stringify(save.json?.error || save.json)}`);
      expectedUpdatedAt = save.json.siteContentUpdatedAt || expectedUpdatedAt;
    }

    const draft = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        title: "October Preschool Curriculum",
        age: "Preschool",
        month: "October",
        weekCount: 4,
        plan: "Free",
        status: "draft",
        coverImageSource: "fallback",
        weeks: planIds.map((id, index) => ({ weekNumber: index + 1, lessonPlanId: id, displayOrder: index + 1 })),
      },
    });
    assert.equal(draft.status, 200, JSON.stringify(draft.json));
    assert.equal(draft.json.series.status, "draft");
    expectedUpdatedAt = draft.json.siteContentUpdatedAt || "";

    const reopen = draft.json.series;
    assert.equal(reopen.weeks.filter((w) => w.lessonPlanId).length, 4);

    const fiveWeek = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        ...reopen,
        weekCount: 5,
        weeks: [
          ...reopen.weeks,
          { weekNumber: 5, lessonPlanId: "", displayOrder: 5 },
        ],
      },
    });
    assert.equal(fiveWeek.status, 200, JSON.stringify(fiveWeek.json));
    assert.equal(fiveWeek.json.series.weekCount, 5);
    assert.equal(fiveWeek.json.series.weeks.length, 5);
    expectedUpdatedAt = fiveWeek.json.siteContentUpdatedAt;

    // Replace week 2
    const replaced = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        ...fiveWeek.json.series,
        weekCount: 4,
        weeks: [
          { weekNumber: 1, lessonPlanId: planIds[0] },
          { weekNumber: 2, lessonPlanId: planIds[3] },
          { weekNumber: 3, lessonPlanId: planIds[2] },
          { weekNumber: 4, lessonPlanId: planIds[1] },
        ],
      },
    });
    assert.equal(replaced.status, 200, JSON.stringify(replaced.json));
    assert.equal(replaced.json.series.weeks[1].lessonPlanId, planIds[3]);
    expectedUpdatedAt = replaced.json.siteContentUpdatedAt;

    // Remove week 4 without deleting plan
    const removed = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        ...replaced.json.series,
        weeks: replaced.json.series.weeks.map((w) => (
          w.weekNumber === 4 ? { ...w, lessonPlanId: "" } : w
        )),
      },
    });
    assert.equal(removed.status, 200, JSON.stringify(removed.json));
    assert.equal(removed.json.series.weeks[3].lessonPlanId, "");
    expectedUpdatedAt = removed.json.siteContentUpdatedAt;

    // Plan still exists
    const curriculumAfter = removed.json.curriculum;
    assert.ok(curriculumAfter.lessonPlans.some((p) => p.id === planIds[1]));

    const dup = await requestJson("POST", "/api/admin/curriculum/series/duplicate", {
      adminToken: token,
      expectedUpdatedAt,
      id: removed.json.series.id,
    });
    assert.equal(dup.status, 200, JSON.stringify(dup.json));
    assert.equal(dup.json.series.status, "draft");
    assert.match(dup.json.series.title, /Copy/);
    expectedUpdatedAt = dup.json.siteContentUpdatedAt;

    // Publish blocked while week 4 empty
    const blocked = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        ...removed.json.series,
        status: "published",
      },
    });
    assert.equal(blocked.status, 400);
    assert.ok((blocked.json.validationErrors || []).some((e) => /Week 4 is missing/i.test(e)));

    // Fill week 4 and publish
    const published = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: {
        ...removed.json.series,
        status: "published",
        weeks: planIds.map((id, index) => ({ weekNumber: index + 1, lessonPlanId: id, displayOrder: index + 1 })),
        weekCount: 4,
      },
    });
    assert.equal(published.status, 200, JSON.stringify(published.json));
    assert.equal(published.json.series.status, "published");
    expectedUpdatedAt = published.json.siteContentUpdatedAt;

    // Unpublish
    const unpublished = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt,
      series: { ...published.json.series, status: "draft" },
    });
    assert.equal(unpublished.status, 200, JSON.stringify(unpublished.json));
    assert.equal(unpublished.json.series.status, "draft");

    // Synonym save
    const syn = await requestJson("POST", "/api/admin/curriculum/import-synonyms", {
      adminToken: token,
      expectedUpdatedAt: unpublished.json.siteContentUpdatedAt,
      synonym: { from: "Number Fun", to: "Math", field: "learningDomain" },
    });
    assert.equal(syn.status, 200, JSON.stringify(syn.json));
    assert.equal(syn.json.synonym.to, "Math");

    console.log("PASS  series API create/reorder/replace/remove/duplicate/publish/synonym");
    passed += 1;
  } catch (error) {
    console.error("FAIL  series API flow");
    console.error(error);
    failed += 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main();
