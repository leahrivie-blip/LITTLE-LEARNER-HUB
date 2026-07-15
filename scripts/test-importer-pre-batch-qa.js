#!/usr/bin/env node
/**
 * Pre-batch importer QA — run before uploading large lesson plan batches.
 *
 * Covers: V3 strict, V4 flexible, Infant/Toddler/Preschool, Free/Pro,
 * missing categories, missing daily fields, alternate headings,
 * Activity Center sync, idempotent re-save, existing-plan preservation,
 * admin override paths, and static wiring for print/search/calendar/download.
 *
 * Run: node scripts/test-importer-pre-batch-qa.js
 * Or:  npm run test:importer-pre-batch-qa
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 19680 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-importer-qa-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "importer-qa@test.local",
  password: "importer-qa-pass",
  code: "importer-qa-code",
};

require("./curriculum-lesson-import-parser.js");
const parser = require("./curriculum-lesson-import-v4.js");
const previewApi = require("./curriculum-import-preview.js");

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
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
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
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
}

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function stripImportMeta(data) {
  const plan = { ...data };
  delete plan._formatVersion;
  delete plan._activityCount;
  delete plan.dailyPlansCompat;
  delete plan.ageBucket;
  return plan;
}

function countItems(dailyPlans = {}) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday"].reduce(
    (sum, day) => sum + ((dailyPlans[day]?.items || []).length),
    0,
  );
}

function daysWithItems(dailyPlans = {}) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday"].filter(
    (day) => (dailyPlans[day]?.items || []).length > 0,
  );
}

function buildMiniWeek({ title, age, plan, theme, status = "draft", style = "v3", includeCategories = true, includeDailyFields = true }) {
  if (style === "v3") {
    const cat = (name) => (includeCategories ? `CATEGORY:\n${name}\n` : "");
    return `TITLE:
${title}

AGE_GROUP:
${age}

THEME:
${theme}

PLAN:
${plan}

STATUS:
${status}

WEEKLY_OVERVIEW:
A ${age} ${plan} week about ${theme}.

LEARNING_OBJECTIVES:
- Explore ${theme.toLowerCase()}
- Practice cooperation

WEEKLY_MATERIALS:
Bins, paper, crayons

VOCABULARY:
explore, share, create

FAMILY_CONNECTION:
Talk about ${theme.toLowerCase()} at home.

OBSERVATION_OPPORTUNITIES:
Watch for language and engagement.

ADAPTATIONS:
Offer larger grips as needed.

MONDAY:
ACTIVITY_NAME:
${theme} Sensory Bin
${cat("Sensory Play")}DESCRIPTION:
Children explore a ${theme.toLowerCase()} sensory bin.
MATERIALS:
Bin, scoops
SETUP:
Prepare the bin before arrival.
TEACHER_ROLE:
Narrate and ask questions.
DIRECTIONS:
1. Invite children.
2. Model scooping.
3. Reflect together.
LEARNING_GOALS:
Curiosity
Fine motor

ACTIVITY_NAME:
${theme} Movement Path
${cat("Gross Motor")}DESCRIPTION:
Children move like ${theme.toLowerCase()} characters.
MATERIALS:
Music player
TEACHER_ROLE:
Model movements.
DIRECTIONS:
1. Play music.
2. Call out movements.
LEARNING_GOALS:
Listening
Gross motor

TUESDAY:
ACTIVITY_NAME:
${theme} Art Studio
${cat("Art")}DESCRIPTION:
Children create ${theme.toLowerCase()} art.
MATERIALS:
Paper, crayons
TEACHER_ROLE:
Offer choices.
DIRECTIONS:
1. Introduce materials.
2. Create freely.
LEARNING_GOALS:
Creative expression

WEDNESDAY:
ACTIVITY_NAME:
${theme} Story Circle
${cat("Literacy")}DESCRIPTION:
Shared reading about ${theme.toLowerCase()}.
MATERIALS:
Books
TEACHER_ROLE:
Read and ask questions.
DIRECTIONS:
1. Gather for circle.
2. Read aloud.
LEARNING_GOALS:
Listening
Language

THURSDAY:
ACTIVITY_NAME:
${theme} Discovery Table
${cat("STEM/Discovery")}DESCRIPTION:
Children investigate ${theme.toLowerCase()} materials.
MATERIALS:
Trays, tools
TEACHER_ROLE:
Prompt observations.
DIRECTIONS:
1. Offer trays.
2. Explore together.
LEARNING_GOALS:
Inquiry

FRIDAY:
ACTIVITY_NAME:
${theme} Pretend Center
${cat("Dramatic Play")}DESCRIPTION:
Pretend play related to ${theme.toLowerCase()}.
MATERIALS:
Props
TEACHER_ROLE:
Join play briefly.
DIRECTIONS:
1. Set up props.
2. Invite role play.
LEARNING_GOALS:
Social play
`;
  }

  // V4 flexible / alternate headings
  const dayExtra = includeDailyFields
    ? `Daily Theme:
${theme} Morning
Daily Objectives:
Explore ${theme.toLowerCase()} ideas.
Daily Materials:
Bins, trays, books
Daily Vocabulary:
explore, notice, share
Circle Time:
Welcome song
Transitions:
Clean-up chant
Outdoor Play:
Nature walk if weather allows
Family Connection:
Ask about ${theme.toLowerCase()} at home.
Observations:
Watch for engagement.
Adaptations:
Offer visual supports.
Safety Notes:
Supervise water play.
`
    : "";

  return `Title:
${title}

Age Group:
${age}

Theme Overview:
A flexible ${age} week about ${theme}.

Learning Goals:
- Explore ${theme.toLowerCase()}
- Practice cooperation

Family Engagement:
Talk about ${theme.toLowerCase()} at home.

Observe For:
Language, engagement, and persistence.

Plan:
${plan}

Status:
${status}

Monday
${dayExtra}Activity: ${theme} Water Play
${includeCategories ? "Category:\nSensory Play\n" : ""}Description:
Children explore water and ${theme.toLowerCase()} toys.
Materials:
Water table, cups
Directions:
1. Invite children.
2. Scoop and pour.
Teacher Role:
Narrate actions.
Learning Goals:
Fine motor

Activity: ${theme} Freeze Dance
Description:
Children move and freeze to music.
Materials:
Music player
Directions:
1. Play music.
2. Freeze on cue.
Teacher Role:
Model movements.
Learning Goals:
Listening

Tuesday
Daily Theme:
${theme} Making
Activity Name:
${includeCategories ? "" : ""}${theme} Playdough
Description:
Children roll playdough shapes.
Materials:
Playdough
Directions:
1. Offer dough.
2. Pinch and roll.
Teacher Role:
Coach grips.
Learning Goals:
Fine motor

Wednesday
Activity: ${theme} Painting
Description:
Children paint ${theme.toLowerCase()} pictures.
Materials:
Paint, paper
Directions:
1. Protect tables.
2. Paint freely.
Teacher Role:
Offer colors.
Learning Goals:
Creative arts

Thursday
Activity: ${theme} Obstacle Course
Description:
Children crawl and hop through a course.
Materials:
Cones, mats
Directions:
1. Set path.
2. Move through.
Teacher Role:
Spot safely.
Learning Goals:
Gross motor

Friday
Activity: ${theme} Pretend Restaurant
Description:
Children take orders and serve.
Materials:
Menus, plates
Directions:
1. Set cafe.
2. Role play.
Teacher Role:
Join briefly.
Learning Goals:
Social play
`;
}

const FIXTURES = [
  {
    key: "v3-strict",
    label: "V3 strict lesson plan",
    mode: "v3",
    text: buildMiniWeek({
      title: "QA V3 Strict Garden Week",
      age: "Preschool 3–4 Years",
      plan: "Free",
      theme: "Garden",
      status: "draft",
      style: "v3",
    }),
    expectAge: /Preschool/i,
    expectPlan: "Free",
    expectMinActivities: 6,
    expectDays: 5,
  },
  {
    key: "v4-flexible",
    label: "V4 flexible lesson plan",
    mode: "v4",
    text: buildMiniWeek({
      title: "QA V4 Flexible Ocean Week",
      age: "Toddler",
      plan: "Pro",
      theme: "Ocean",
      status: "draft",
      style: "v4",
    }),
    expectAge: /Toddler/i,
    expectPlan: "Pro",
    expectMinActivities: 6,
    expectDays: 5,
    expectDailyFields: true,
  },
  {
    key: "infant",
    label: "Infant plan",
    mode: "v4",
    text: buildMiniWeek({
      title: "QA Infant Soft Sounds",
      age: "Infant 0–6 Months",
      plan: "Free",
      theme: "Sounds",
      style: "v4",
    }),
    expectAge: /Infant 0–6 Months/i,
    expectPlan: "Free",
    expectMinActivities: 6,
  },
  {
    key: "toddler",
    label: "Toddler plan",
    mode: "v4",
    text: buildMiniWeek({
      title: "QA Toddler Busy Hands",
      age: "Toddler 12–24 Months",
      plan: "Free",
      theme: "Hands",
      style: "v4",
    }),
    expectAge: /Toddler 12–24 Months/i,
    expectPlan: "Free",
    expectMinActivities: 6,
  },
  {
    key: "preschool",
    label: "Preschool plan",
    mode: "v4",
    text: buildMiniWeek({
      title: "QA Preschool Weather Watchers",
      age: "Preschool 4–5 Years",
      plan: "Pro",
      theme: "Weather",
      style: "v4",
    }),
    expectAge: /Preschool 4–5 Years/i,
    expectPlan: "Pro",
    expectMinActivities: 6,
  },
  {
    key: "free",
    label: "Free plan",
    mode: "v3",
    text: buildMiniWeek({
      title: "QA Free Access Colors",
      age: "Preschool",
      plan: "Free",
      theme: "Colors",
      style: "v3",
    }),
    expectAge: /Preschool/i,
    expectPlan: "Free",
    expectMinActivities: 6,
  },
  {
    key: "pro",
    label: "Pro plan (Premium synonym via V4)",
    mode: "v4",
    text: `Title:
QA Premium Members Week
Age Group:
Preschool
Theme Overview:
Premium members-only curriculum week.
Plan:
Premium
Status:
draft
Monday
Activity: Science Experiment Station
Description:
Children test sink or float with magnets nearby.
Materials:
Bins, magnets
Directions:
1. Offer materials.
2. Observe together.
Teacher Role:
Prompt hypotheses.
Learning Goals:
Inquiry
Tuesday
Activity: Nature Walk Collecting
Description:
Outdoor nature walk to gather leaves.
Materials:
Baskets
Directions:
1. Walk outdoors.
2. Collect safely.
Teacher Role:
Supervise closely.
Learning Goals:
Observation
`,
    expectAge: /Preschool/i,
    expectPlan: "Pro",
    expectMinActivities: 2,
    expectInferredCategories: true,
  },
  {
    key: "missing-categories",
    label: "Plan with missing categories",
    mode: "v4",
    text: buildMiniWeek({
      title: "QA Missing Categories Week",
      age: "Toddler",
      plan: "Free",
      theme: "Play",
      style: "v4",
      includeCategories: false,
    }),
    expectAge: /Toddler/i,
    expectPlan: "Free",
    expectMinActivities: 6,
    expectInferredCategories: true,
  },
  {
    key: "missing-daily",
    label: "Plan with missing daily fields",
    mode: "v4",
    text: buildMiniWeek({
      title: "QA Sparse Daily Fields Week",
      age: "Preschool",
      plan: "Free",
      theme: "Sparse",
      style: "v4",
      includeDailyFields: false,
    }),
    expectAge: /Preschool/i,
    expectPlan: "Free",
    expectMinActivities: 6,
    expectMissingDailyWarnings: true,
  },
  {
    key: "alternate-headings",
    label: "Alternate headings (Theme Overview / Learning Goals / Family Engagement / Observe For)",
    mode: "v4",
    text: `Title:
QA Alternate Headings Week

Age Group:
Toddler

Theme Overview:
Children explore friendship through play.

Learning Goals:
- Practice sharing
- Use kind words

Family Engagement:
Ask families about friendship routines at home.

Observe For:
Turn-taking and language during play.

Plan:
Free
Status:
draft

Monday
Daily Objectives:
Practice greeting friends.
Daily Materials:
Puppets
Activity: Friendship Puppet Show
Description:
Children use puppets to practice kind words.
Materials:
Puppets
Directions:
1. Model greetings.
2. Invite puppet talk.
Teacher Role:
Coach language.
Learning Goals:
Social language

Tuesday
Activity: Sharing Sensory Bin
Description:
Children share scoops at a sensory bin.
Materials:
Bin, scoops
Directions:
1. Offer two scoops.
2. Practice waiting.
Teacher Role:
Narrate sharing.
Learning Goals:
Turn-taking
`,
    expectAge: /Toddler/i,
    expectPlan: "Free",
    expectMinActivities: 2,
    expectAlternateMappings: true,
  },
];

async function savePlan(token, expectedUpdatedAt, lessonPlan) {
  const res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
  if (res.status === 409 && res.json?.siteContentUpdatedAt) {
    return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: res.json.siteContentUpdatedAt,
      lessonPlan,
    });
  }
  return res;
}

async function main() {
  const child = startServer();
  const report = {
    startedAt: new Date().toISOString(),
    fixtures: [],
    staticChecks: [],
    criticalBugs: [],
  };

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "admin login failed");
    const token = login.json.token;

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
    });
    assert(touch.status === 200, "site content touch failed");
    let expectedUpdatedAt = touch.json.siteContent.updatedAt;

    // Seed an existing plan that must remain unchanged.
    const existingId = `cur-lp-existing-${crypto.randomBytes(3).toString("hex")}`;
    const existingPlan = stripImportMeta({
      ...parser.parseCurriculumLessonPlanImport(buildMiniWeek({
        title: "EXISTING Preserved Plan Do Not Touch",
        age: "Preschool",
        plan: "Free",
        theme: "Preserve",
        style: "v3",
      }), { mode: "v3" }).data,
      id: existingId,
      status: "published",
    });
    const existingSave = await savePlan(token, expectedUpdatedAt, existingPlan);
    assert(existingSave.status === 200, `seed existing plan failed: ${existingSave.status} ${existingSave.text}`);
    expectedUpdatedAt = existingSave.json.siteContentUpdatedAt;
    const existingSnapshot = JSON.stringify({
      title: existingSave.json.lessonPlan.title,
      age: existingSave.json.lessonPlan.age,
      plan: existingSave.json.lessonPlan.plan,
      activityIds: [...(existingSave.json.lessonPlan.activityIds || [])].sort(),
    });
    pass("Seed existing plan", existingId);

    for (const fixture of FIXTURES) {
      const fixtureReport = { key: fixture.key, label: fixture.label, checks: [] };
      try {
        const parsed = parser.parseCurriculumLessonPlanImport(fixture.text, { mode: fixture.mode });
        assert(parsed.ok, `${fixture.key} parse errors: ${parsed.errors.join("; ")}`);
        assert(fixture.expectAge.test(parsed.data.age), `age expected ${fixture.expectAge}, got ${parsed.data.age}`);
        assert(parsed.data.plan === fixture.expectPlan, `plan expected ${fixture.expectPlan}, got ${parsed.data.plan}`);
        const activityCount = countItems(parsed.data.dailyPlans);
        assert(activityCount >= fixture.expectMinActivities, `activities ${activityCount} < ${fixture.expectMinActivities}`);
        const days = daysWithItems(parsed.data.dailyPlans);
        if (fixture.expectDays) {
          assert(days.length === fixture.expectDays, `days ${days.length} != ${fixture.expectDays}`);
        }

        if (fixture.expectDailyFields) {
          const mon = parsed.data.dailyPlans.monday;
          assert(mon.theme || mon.objectives || mon.materials || mon.vocabulary || (mon.circleTime || []).length,
            "expected Monday daily fields to populate");
        }

        if (fixture.expectAlternateMappings) {
          assert(/friendship/i.test(parsed.data.weeklyOverview), "Theme Overview → weeklyOverview");
          assert(/sharing|kind words/i.test(parsed.data.objectives), "Learning Goals → objectives");
          assert(/friendship routines/i.test(parsed.data.familyConnection), "Family Engagement → familyConnection");
          assert(/Turn-taking|language/i.test(parsed.data.observationOpportunities), "Observe For → observationOpportunities");
        }

        if (fixture.expectInferredCategories) {
          const cats = [];
          days.forEach((day) => {
            (parsed.data.dailyPlans[day].items || []).forEach((item) => cats.push(item.activityCategory));
          });
          assert(cats.every(Boolean), "every activity needs a category");
          if (fixture.key === "missing-categories" || fixture.key === "pro") {
            assert(cats.some((c) => /Sensory|Fine Motor|Gross Motor|Art|STEM|Dramatic|Music|Outdoor|Literacy/i.test(c)),
              `expected inferred categories, got ${cats.join(", ")}`);
          }
        }

        const preview = previewApi.buildCurriculumImportPreview(parsed, {
          formatVersion: Number(parsed.parseReport?.formatVersion) || (fixture.mode === "v4" ? 4 : 3),
        });
        assert(preview.canConfirm, `${fixture.key} preview not confirmable: ${(preview.errors || []).map((e) => e.message).join("; ")}`);
        if (fixture.mode === "v4") {
          assert(preview.quality && typeof preview.quality.qualityScore === "number", "quality score missing");
          assert(preview.summary.formatLabel.includes("V4"), `format label ${preview.summary.formatLabel}`);
        }
        if (fixture.expectMissingDailyWarnings) {
          assert(
            (preview.warnings || []).some((w) => /missing vocabulary|missing family connection/i.test(w.message)),
            "expected missing daily field warnings",
          );
          assert(preview.quality.missingFieldCount > 0, "quality missingFieldCount should be > 0");
        }

        const lessonPlanId = `cur-lp-qa-${fixture.key}-${crypto.randomBytes(2).toString("hex")}`;
        const lessonPlan = { ...stripImportMeta(parsed.data), id: lessonPlanId };
        const save = await savePlan(token, expectedUpdatedAt, lessonPlan);
        assert(save.status === 200, `save failed ${save.status} ${save.text}`);
        expectedUpdatedAt = save.json.siteContentUpdatedAt;

        const acts = (save.json.activities || []).filter((a) => a.lessonPlanId === lessonPlanId && a.status !== "archived");
        assert(acts.length === activityCount, `synced ${acts.length} != parsed ${activityCount}`);
        assert((save.json.lessonPlan.activityIds || []).length === activityCount, "activityIds mismatch");
        acts.forEach((a) => {
          assert(a.sourceKey.startsWith(`${lessonPlanId}:`), "sourceKey parent link");
          assert(a.activityCategory, `${a.title} missing category after sync`);
        });
        const firstIds = acts.map((a) => a.id).sort();

        // Idempotent re-save — no duplicates
        const again = await savePlan(token, expectedUpdatedAt, {
          ...save.json.lessonPlan,
          dailyPlans: lessonPlan.dailyPlans,
        });
        assert(again.status === 200, `re-save failed ${again.status}`);
        expectedUpdatedAt = again.json.siteContentUpdatedAt;
        const againActs = (again.json.activities || []).filter((a) => a.lessonPlanId === lessonPlanId && a.status !== "archived");
        assert(againActs.length === activityCount, `re-save count ${againActs.length}`);
        assert(JSON.stringify(firstIds) === JSON.stringify(againActs.map((a) => a.id).sort()), "duplicate activity IDs created");

        // Admin override path: age, plan, category
        const overrideDay = days[0];
        const overrideItem = {
          ...lessonPlan.dailyPlans[overrideDay].items[0],
          activityCategory: "Open-Ended Exploration",
        };
        const overriddenPlans = {
          ...lessonPlan.dailyPlans,
          [overrideDay]: {
            ...lessonPlan.dailyPlans[overrideDay],
            items: [overrideItem, ...lessonPlan.dailyPlans[overrideDay].items.slice(1)],
          },
        };
        const overrideSave = await savePlan(token, expectedUpdatedAt, {
          ...save.json.lessonPlan,
          age: "Preschool 3–4 Years",
          plan: fixture.expectPlan === "Free" ? "Pro" : "Free",
          dailyPlans: overriddenPlans,
        });
        assert(overrideSave.status === 200, `override save failed ${overrideSave.status}`);
        expectedUpdatedAt = overrideSave.json.siteContentUpdatedAt;
        assert(overrideSave.json.lessonPlan.age === "Preschool 3–4 Years", "age override not persisted");
        assert(overrideSave.json.lessonPlan.plan === (fixture.expectPlan === "Free" ? "Pro" : "Free"), "plan override not persisted");
        const overrideAct = (overrideSave.json.activities || []).find(
          (a) => a.lessonPlanId === lessonPlanId && a.itemId === overrideItem.itemId && a.status !== "archived",
        );
        assert(overrideAct?.activityCategory === "Open-Ended Exploration", "category override not synced");

        fixtureReport.checks.push({
          parseOk: true,
          age: parsed.data.age,
          plan: parsed.data.plan,
          activities: activityCount,
          days: days.length,
          qualityScore: preview.quality?.qualityScore ?? null,
          warningCount: preview.warnings?.length ?? 0,
          synced: acts.length,
          noDuplicates: true,
          overridesWork: true,
        });
        pass(fixture.label, `${parsed.data.age} / ${parsed.data.plan} / ${activityCount} activities / quality ${preview.quality?.qualityScore ?? "n/a"}%`);
      } catch (error) {
        fixtureReport.error = error.message;
        fail(fixture.label, error.message);
        report.criticalBugs.push({ fixture: fixture.key, error: error.message });
      }
      report.fixtures.push(fixtureReport);
    }

    // Existing plan unchanged
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(reload.status === 200, "reload failed");
    const stillThere = (reload.json.siteContent.curriculum.lessonPlans || []).find((p) => p.id === existingId);
    assert(stillThere, "existing plan missing");
    const afterSnapshot = JSON.stringify({
      title: stillThere.title,
      age: stillThere.age,
      plan: stillThere.plan,
      activityIds: [...(stillThere.activityIds || [])].sort(),
    });
    assert(afterSnapshot === existingSnapshot, "existing plan was modified during QA imports");
    pass("Existing plans remain unchanged");

    // V3 still works as a dedicated check (already in fixtures, reinforce)
    const v3SamplePath = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
    const v3Text = fs.readFileSync(v3SamplePath, "utf8");
    const v3Parsed = parser.parseCurriculumLessonPlanImport(v3Text, { mode: "v3" });
    assert(v3Parsed.ok, v3Parsed.errors.join("; "));
    assert(v3Parsed.data._formatVersion === 3, "v3 format version");
    assert(v3Parsed.data._activityCount === 15, "v3 full sample activity count");
    pass("V3 full sample still imports", "15 activities");

    // Static wiring: downloads, printing, search, filters, calendar
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const staticChecks = [
      ["downloadLessonPlanVariant", /function downloadLessonPlanVariant/],
      ["print/PDF builders", /buildLessonPlanWeeklyCalendarBoardPdfBlob|buildLessonPlanWeeklySchedulePdfBlob/],
      ["DOCX export", /buildFullLessonPlanDocxBlob|LlhLessonDocx/],
      ["search haystack", /function resourceSearchHaystack/],
      ["age/plan filters", /lessonLibraryPlanFilter|normalizeAgeGroup/],
      ["calendar assign snapshot", /function buildCurriculumLessonPlanSnapshot|function assignScheduleLessonPlan/],
      ["admin age override select", /<select name="age">/],
      ["admin plan override select", /<select name="plan">/],
      ["admin category override select", /data-curriculum-category/],
      ["V4 mode selector UI", /adminCurriculumImportMode|V4 Smart Import/],
    ];
    for (const [name, re] of staticChecks) {
      if (re.test(appJs)) {
        pass(`Wiring: ${name}`);
        report.staticChecks.push({ name, ok: true });
      } else {
        fail(`Wiring: ${name}`);
        report.staticChecks.push({ name, ok: false });
        report.criticalBugs.push({ fixture: "static", error: `Missing ${name}` });
      }
    }

    // Confirm curriculumAgeSelectOptions allows override of inferred ages
    assert(/function curriculumAgeSelectOptions/.test(appJs), "curriculumAgeSelectOptions missing");
    pass("Admin can override inferred age/plan/category before publishing", "editor selects present");

  } catch (error) {
    fail("Harness", error.message);
    report.criticalBugs.push({ fixture: "harness", error: error.message });
  } finally {
    await stopServer(child);
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.ok);
  report.finishedAt = new Date().toISOString();
  report.passed = results.filter((r) => r.ok).length;
  report.failed = failed.length;
  report.readyForBulkImport = failed.length === 0 && report.criticalBugs.length === 0;

  const reportPath = path.join(ROOT, "IMPORTER_PRE_BATCH_QA_REPORT.md");
  const md = [
    "# Importer Pre-Batch QA Report",
    "",
    `**Started:** ${report.startedAt}`,
    `**Finished:** ${report.finishedAt}`,
    `**Passed:** ${report.passed}`,
    `**Failed:** ${report.failed}`,
    `**Ready for bulk import:** ${report.readyForBulkImport ? "YES" : "NO"}`,
    "",
    "## Fixture results",
    "",
    ...report.fixtures.map((f) => {
      if (f.error) return `- ❌ **${f.label}** — ${f.error}`;
      const c = f.checks[0] || {};
      return `- ✅ **${f.label}** — age \`${c.age}\`, plan \`${c.plan}\`, activities ${c.activities}, days ${c.days}, quality ${c.qualityScore ?? "n/a"}%, synced ${c.synced}, no duplicates, overrides OK`;
    }),
    "",
    "## Confirmations",
    "",
    "- Correct age groups assigned (with V4 inference + V3 explicit)",
    "- Free/Pro status correct (including Premium → Pro)",
    "- Monday–Friday activity blocks created; V4 daily fields populated when present",
    "- Activities sync into Activity Center with stable IDs",
    "- Re-save does not create duplicates",
    "- Existing plans remain unchanged",
    "- V3 strict imports still work",
    "- Downloads/print/search/filters/calendar wiring present",
    "- Quality score + missing-field warnings reflect sparse daily content",
    "- Admin editor age/plan/category selects support override before publishing",
    "",
    report.criticalBugs.length
      ? `## Critical bugs\n\n${report.criticalBugs.map((b) => `- **${b.fixture}:** ${b.error}`).join("\n")}`
      : "## Critical bugs\n\nNone found.",
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, md);

  console.log(`\nSummary: ${report.passed} passed, ${report.failed} failed`);
  console.log(`Ready for bulk import: ${report.readyForBulkImport ? "YES" : "NO"}`);
  console.log(`Report: ${reportPath}`);
  if (!report.readyForBulkImport) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
