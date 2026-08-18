#!/usr/bin/env node
/**
 * Owner workspace: true publish blockers, optional todos/notes, public preview isolation.
 * Run: npm run test:owner-workspace-editor
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const owner = require("./teaching-kit-owner-workspace.js");
const safeValues = require("./curriculum-safe-values.js");
const { buildBlankLessonPlan, buildCanonicalLessonPlan } = require("./curriculum-lesson-structure-paste.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20710 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-workspace-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "owner-workspace-pass",
  code: "owner-workspace-code",
};

function requestJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers, timeout: 45000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function corePlan(overrides = {}) {
  return {
    id: "cur-lp-owner-ws-core",
    title: "Things That Go: Art in Motion",
    age: "Preschool 3–5 Years",
    status: "draft",
    plan: "Pro",
    dailyPlans: {
      monday: { items: [{ itemId: "a1", title: "Wheel Painting" }] },
      tuesday: { items: [{ itemId: "a2", title: "Ramp Rolling" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    books: [{ title: "The Wheels on the Bus" }],
    familyConnection: "",
    printableIdeas: [{ title: "Make a GO/STOP card pack later" }],
    resourceIds: [],
    ...overrides,
  };
}

function coreActs() {
  return [
    { id: "cur-act-1", lessonPlanId: "cur-lp-owner-ws-core", title: "Wheel Painting", dayOfWeek: "monday", status: "draft" },
    { id: "cur-act-2", lessonPlanId: "cur-lp-owner-ws-core", title: "Ramp Rolling", dayOfWeek: "tuesday", status: "draft" },
  ];
}

function assertUnitContract() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  const plan = corePlan();
  const acts = coreActs();
  const workspace = owner.addOwnerTodo({}, "Make printable pack");
  const withNote = owner.setOwnerNotes(workspace, "Make a GO/STOP card pack later");
  const state = owner.ownerPublishState(plan, acts, withNote, []);
  assert.equal(state.canPublish, true, "optional todos/printables must not block publish");
  assert.equal(state.blockers.length, 0);
  assert.equal(state.openTodoCount, 1);
  assert.equal(owner.publicPreviewExcludesOwnerContent({ ownerWorkspace: withNote }), false);
  assert.equal(owner.publicPreviewExcludesOwnerContent({ title: plan.title, activities: acts }), true);
  console.log("PASS  1,3,4,7 optional fields/todos do not block a valid core lesson");

  const noTitle = owner.collectTruePublishBlockers(corePlan({ title: "" }), acts);
  assert.ok(noTitle.some((item) => item.code === "missing_title"));
  console.log("PASS  5 missing title blocks publish");

  const noAge = owner.collectTruePublishBlockers(corePlan({ age: "" }), acts);
  assert.ok(noAge.some((item) => item.code === "missing_age"));
  assert.ok(noAge.some((item) => item.message === "Choose an age band"));
  const badAge = owner.collectTruePublishBlockers(corePlan({ age: "not-an-age-band" }), acts);
  assert.ok(badAge.some((item) => item.code === "missing_age"));
  assert.ok(badAge.some((item) => item.message === "Choose a valid age band"));
  assert.equal(owner.collectTruePublishBlockers(corePlan({ age: "Toddler" }), acts).some((item) => item.code === "missing_age"), false);
  assert.equal(owner.collectTruePublishBlockers(corePlan({ age: "Infant" }), acts).some((item) => item.code === "missing_age"), false);
  assert.equal(owner.collectTruePublishBlockers(corePlan({ age: "Preschool" }), acts).some((item) => item.code === "missing_age"), false);
  console.log("PASS  6 missing/invalid age blocks publish; valid Infant/Toddler/Preschool stay valid");

  const emptyAgeOptions = safeValues.curriculumAgeSelectOptions("");
  assert.equal(emptyAgeOptions[0].value, "");
  assert.equal(emptyAgeOptions[0].selected, true);
  assert.equal(emptyAgeOptions.some((opt) => opt.value === "Preschool" && opt.selected), false);
  assert.equal(safeValues.curriculumAgeSelectOptions("Toddler").some((opt) => opt.value === "Toddler" && opt.selected), true);
  assert.equal(safeValues.curriculumAgeSelectOptions("Infant").some((opt) => opt.value === "Infant" && opt.selected), true);
  assert.equal(safeValues.curriculumAgeSelectOptions("Preschool").some((opt) => opt.value === "Preschool" && opt.selected), true);
  const invalidAgeOptions = safeValues.curriculumAgeSelectOptions("not-an-age-band");
  assert.equal(invalidAgeOptions.some((opt) => opt.value === "not-an-age-band" && opt.selected), true);
  assert.equal(invalidAgeOptions.some((opt) => opt.value === "Preschool" && opt.selected), false);
  assert.equal(buildBlankLessonPlan({ title: "New Lesson Plan" }).age, "");
  assert.equal(buildCanonicalLessonPlan({
    ok: true,
    lesson: { title: "Paste Without Age", age: "", theme: "" },
    dailyPlans: { monday: { items: [{ title: "One" }] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
    resourceIds: [],
  }).age, "");
  console.log("PASS  empty age select/import/create do not inject Preschool");

  const noActs = owner.collectTruePublishBlockers(corePlan({
    dailyPlans: { monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
  }), []);
  assert.ok(noActs.some((item) => item.code === "no_activities"));

  let todos = owner.addOwnerTodo({}, "Add better cover");
  assert.equal(todos.todos.length, 1);
  todos = owner.toggleOwnerTodo(todos, todos.todos[0].id, true);
  assert.equal(todos.todos[0].done, true);
  todos = owner.toggleOwnerTodo(todos, todos.todos[0].id, false);
  assert.equal(todos.todos[0].done, false);
  const todoId = todos.todos[0].id;
  todos = owner.deleteOwnerTodo(todos, todoId);
  assert.equal(todos.todos.length, 0);
  console.log("PASS  9,10 owner todos can be checked/unchecked/deleted");

  const previewPlan = owner.sanitizePublicPreviewPlan({
    ...plan,
    ownerWorkspace: withNote,
    teachingKit: { printableIdeas: [{ title: "Make a GO/STOP card pack later" }] },
  });
  assert.equal(previewPlan.ownerWorkspace, undefined);
  assert.equal(previewPlan.teachingKit.printableIdeas, undefined);
  const realResources = [{ id: "cur-res-1", title: "Vehicle Pack", status: "published", resourceCategory: "printables" }];
  const linked = owner.linkedPublishedPrintables(corePlan({ resourceIds: ["cur-res-1"] }), realResources);
  assert.equal(linked.length, 1);
  const ideasOnly = owner.linkedPublishedPrintables(corePlan({ resourceIds: [] }), realResources);
  assert.equal(ideasOnly.length, 0);
  console.log("PASS  12,13 real linked printables vs printable ideas");

  assert.match(editorJs, /Public lesson preview/);
  assert.match(editorJs, /data-owner-workspace-panel/);
  assert.match(editorJs, /Still on my list/);
  assert.match(editorJs, /activityOptionalCues/);
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-owner-workspace.js"), "utf8"), /Optional: Add image/);
  assert.match(indexHtml, /teaching-kit-owner-workspace\.js/);
  assert.doesNotMatch(
    editorJs.slice(editorJs.indexOf("data-kit-media-remove"), editorJs.indexOf("data-kit-media-remove") + 1800),
    /window\.confirm\(`Remove/,
  );
  assert.match(appJs, /This permanently deletes this lesson plan and its lesson-owned activity records/);
  assert.match(appJs, /if \(!confirmed\) return \{ cancelled: true, ok: false \}/);
  assert.match(appJs, /function publishAdminCurriculumLessonToLibrary/);
  assert.match(editorJs, /Apply enrichment/);
  assert.match(editorJs, /Publish lesson/);
  assert.match(editorJs, /Cannot publish yet/);
  assert.match(editorJs, /Quality notes/);
  const ownerChrome = editorJs.slice(
    editorJs.indexOf("data-owner-workspace-status"),
    editorJs.indexOf("data-owner-workspace-status") + 1800,
  );
  assert.doesNotMatch(ownerChrome, /Library Blocked|Needs Changes/);
  assert.equal(owner.ownerFacingQualityLabel(), "Quality notes");
  const normalizer = serverJs.slice(
    serverJs.indexOf("function normalizedCurriculumLessonPlan"),
    serverJs.indexOf("function normalizedCurriculumLessonPlan") + 700,
  );
  assert.doesNotMatch(normalizer, /\|\|\s*"Preschool"/);
  assert.match(serverJs, /true_publish_blockers/);
  assert.match(serverJs, /ownerWorkspace/);
  console.log("PASS  11,14,15 preview label, no repeated field confirms, one lesson-delete confirm");

  assert.match(serverJs, /function publicCurriculumLessonPlanPreviewDto/);
  assert.doesNotMatch(
    serverJs.slice(serverJs.indexOf("function publicCurriculumLessonPlanPreviewDto"), serverJs.indexOf("function publicCurriculumLessonPlanPreviewDto") + 1800),
    /ownerWorkspace/,
  );
  assert.match(serverJs, /plan: "Pro"/);
  console.log("PASS  16,17 published public DTO omits owner notes and keeps Free/Pro");
}

async function runPersistTests() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true, teachingKitQualityReview: true },
      curriculum: { lessonPlans: [], activities: [], resources: [], series: [] },
      updatedAt: "",
    },
    adminSessions: {},
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    for (let i = 0; i < 80; i += 1) {
      if (child.exitCode != null) throw new Error("server exited");
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 120));
    }
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, login.text);
    const token = login.json.token;
    const site = await requestJson("GET", "/api/admin/site-content", null, token);
    let stamp = site.json.siteContent?.updatedAt || "";

    const created = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: "cur-lp-owner-ws-persist",
        title: "Owner Workspace Persist",
        age: "Preschool",
        status: "draft",
        plan: "Pro",
        weeklyOverview: "Children explore vehicles.",
        dailyPlans: {
          monday: { items: [{ itemId: "p1", title: "Paint Tracks" }] },
          tuesday: { items: [{ itemId: "p2", title: "Box Bus" }] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        ownerWorkspace: owner.addOwnerTodo({ notes: "Make GO/STOP later" }, "Create printables later"),
      },
    }, token);
    assert.equal(created.status, 200, created.text);
    stamp = created.json.siteContentUpdatedAt;
    const saved = created.json.lessonPlan;
    assert.ok(saved.ownerWorkspace);
    assert.match(saved.ownerWorkspace.notes, /GO\/STOP/);
    assert.equal(saved.ownerWorkspace.todos[0].done, false);

    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: saved.id,
        enrichmentDraft: { activities: {}, week: {}, updatedAt: new Date().toISOString() },
        ownerWorkspace: owner.toggleOwnerTodo(saved.ownerWorkspace, saved.ownerWorkspace.todos[0].id, true),
      },
    }, token);
    assert.equal(draftSave.status, 200, draftSave.text);
    stamp = draftSave.json.siteContentUpdatedAt;
    assert.equal(draftSave.json.lessonPlan.ownerWorkspace.todos[0].done, true);

    const reload = await requestJson("GET", "/api/admin/site-content", null, token);
    const reloaded = (reload.json.siteContent.curriculum.lessonPlans || []).find((item) => item.id === saved.id);
    assert.ok(reloaded.ownerWorkspace);
    assert.equal(reloaded.ownerWorkspace.todos[0].done, true);
    assert.match(reloaded.ownerWorkspace.notes, /GO\/STOP/);
    console.log("PASS  8 owner todos persist after refresh");

    const blocked = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: "cur-lp-owner-ws-notitle",
        title: "",
        age: "Preschool",
        status: "draft",
        plan: "Pro",
        dailyPlans: {
          monday: { items: [{ itemId: "n1", title: "Paint Tracks" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    }, token);
    assert.equal(blocked.status, 200, blocked.text);
    stamp = blocked.json.siteContentUpdatedAt;
    const blockedPub = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      lessonPlan: {
        id: "cur-lp-owner-ws-notitle",
        enrichmentDraft: { week: { weeklyOverview: "x".repeat(20) }, activities: {}, updatedAt: new Date().toISOString() },
      },
    }, token);
    assert.equal(blockedPub.status, 409, blockedPub.text);
    assert.equal(blockedPub.json.code, "true_publish_blockers");
    assert.ok((blockedPub.json.blockers || []).some((item) => item.code === "missing_title"));
    stamp = (await requestJson("GET", "/api/admin/site-content", null, token)).json.siteContent?.updatedAt || stamp;
    console.log("PASS  5 server missing title blocks publish");

    const noAge = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: "cur-lp-owner-ws-noage",
        title: "Needs an age band",
        age: "not-an-age-band",
        status: "draft",
        plan: "Pro",
        dailyPlans: {
          monday: { items: [{ itemId: "g1", title: "Paint Tracks" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    }, token);
    assert.equal(noAge.status, 200, noAge.text);
    stamp = noAge.json.siteContentUpdatedAt;
    const noAgePub = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      lessonPlan: {
        id: "cur-lp-owner-ws-noage",
        enrichmentDraft: { week: { weeklyOverview: "Children paint vehicle tracks." }, activities: {}, updatedAt: new Date().toISOString() },
      },
    }, token);
    assert.equal(noAgePub.status, 409, noAgePub.text);
    assert.equal(noAgePub.json.code, "true_publish_blockers");
    assert.ok((noAgePub.json.blockers || []).some((item) => item.code === "missing_age"));
    stamp = (await requestJson("GET", "/api/admin/site-content", null, token)).json.siteContent?.updatedAt || stamp;
    console.log("PASS  6 server missing age blocks publish");

    const published = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      lessonPlan: {
        id: saved.id,
        enrichmentDraft: {
          week: { weeklyOverview: "Children explore vehicles with paint and ramps." },
          activities: { p1: { teacherTips: ["Offer two trays."] } },
          updatedAt: new Date().toISOString(),
        },
        ownerWorkspace: saved.ownerWorkspace,
      },
    }, token);
    assert.equal(published.status, 200, published.text);
    assert.equal(published.json.ok, true);
    console.log("PASS  1,7 core lesson publishes with optional todos remaining");

    const publicLib = await requestJson("GET", "/api/site-content");
    const publicBlob = JSON.stringify(publicLib.json || {});
    assert.doesNotMatch(publicBlob, /Make GO\/STOP later/);
    assert.doesNotMatch(publicBlob, /Create printables later/);
    assert.doesNotMatch(publicBlob, /ownerWorkspace/);
    console.log("PASS  2,11 owner-only notes stay out of public payload");

    const emptyAge = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: "cur-lp-owner-ws-empty-age",
        title: "Empty Age Stays Empty",
        age: "",
        theme: "Vehicles",
        status: "draft",
        plan: "Pro",
        dailyPlans: {
          monday: { items: [{ itemId: "e1", title: "Paint Tracks" }] },
          tuesday: { items: [{ itemId: "e2", title: "Box Bus" }] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    }, token);
    assert.equal(emptyAge.status, 200, emptyAge.text);
    stamp = emptyAge.json.siteContentUpdatedAt;
    assert.equal(emptyAge.json.lessonPlan.age, "", "empty age must not become Preschool on save");
    const emptyAgeTheme = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: {
        ...emptyAge.json.lessonPlan,
        theme: "Wheels and ramps",
      },
    }, token);
    assert.equal(emptyAgeTheme.status, 200, emptyAgeTheme.text);
    stamp = emptyAgeTheme.json.siteContentUpdatedAt;
    assert.equal(emptyAgeTheme.json.lessonPlan.age, "", "saving unrelated fields must not mutate empty age");
    assert.equal(emptyAgeTheme.json.lessonPlan.theme, "Wheels and ramps");
    const emptyAgePublish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: stamp,
      lessonPlan: {
        ...emptyAgeTheme.json.lessonPlan,
        status: "published",
      },
    }, token);
    assert.equal(emptyAgePublish.status, 409, emptyAgePublish.text);
    assert.equal(emptyAgePublish.json.code, "true_publish_blockers");
    assert.ok((emptyAgePublish.json.blockers || []).some((item) => item.message === "Choose an age band"));
    stamp = (await requestJson("GET", "/api/admin/site-content", null, token)).json.siteContent?.updatedAt || stamp;
    console.log("PASS  empty age stays empty and blocks publishing");

    for (const age of ["Toddler", "Infant", "Preschool"]) {
      const savedAge = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        expectedUpdatedAt: stamp,
        lessonPlan: {
          id: `cur-lp-owner-ws-age-${age.toLowerCase()}`,
          title: `${age} Stays ${age}`,
          age,
          status: "draft",
          plan: "Pro",
          dailyPlans: {
            monday: { items: [{ itemId: `${age}-1`, title: "Paint Tracks" }] },
            tuesday: { items: [{ itemId: `${age}-2`, title: "Box Bus" }] },
            wednesday: { items: [] },
            thursday: { items: [] },
            friday: { items: [] },
          },
        },
      }, token);
      assert.equal(savedAge.status, 200, savedAge.text);
      stamp = savedAge.json.siteContentUpdatedAt;
      assert.equal(savedAge.json.lessonPlan.age, age, `${age} must remain ${age}`);
      const themeOnly = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        expectedUpdatedAt: stamp,
        lessonPlan: {
          ...savedAge.json.lessonPlan,
          theme: `${age} theme only`,
        },
      }, token);
      assert.equal(themeOnly.status, 200, themeOnly.text);
      stamp = themeOnly.json.siteContentUpdatedAt;
      assert.equal(themeOnly.json.lessonPlan.age, age, `unrelated save must keep ${age}`);
    }
    console.log("PASS  valid Toddler/Infant/Preschool ages persist unchanged");
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  assertUnitContract();
  await runPersistTests();
  console.log("\nAll owner-workspace editor tests passed.");
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
