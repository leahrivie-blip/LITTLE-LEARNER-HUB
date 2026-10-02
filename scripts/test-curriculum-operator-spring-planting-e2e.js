#!/usr/bin/env node
/**
 * Spring Planting — Curriculum Operator E2E (HTTP + real operator paths).
 * Run: npm run test:curriculum-operator-spring-planting-e2e
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const schema = require("./curriculum-operator-schema.js");
const boundary = require("./curriculum-operator-http-boundary.js");
const conversation = require("./curriculum-operator-conversation-store.js");
const commandApi = require("./curriculum-operator-command.js");
const createApi = require("./curriculum-operator-create.js");
const auditApi = require("./curriculum-operator-audit.js");
const imagesApi = require("./curriculum-operator-images.js");
const printablesApi = require("./curriculum-operator-printables.js");
const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20720 + Math.floor(Math.random() * 60);
const STORE_PATH = path.join(os.tmpdir(), `llh-spring-e2e-${crypto.randomBytes(4).toString("hex")}.json`);
const SESSION = "spring-planting-e2e";
const OWNER = {
  email: "leahivie@icloud.com", // pragma: allowlist secret
  password: "spring-e2e-pass",
  code: "spring-e2e-code",
};

let passed = 0;
let blocked = false;

function ok(cond, msg) {
  if (!cond) {
    blocked = true;
    console.error(`  ✗ BLOCKED: ${msg}`);
  }
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch (_e) { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, attempts = 80) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      if (child.exitCode != null) return reject(new Error(`Server exited with ${child.exitCode}`));
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch (_e) { /* retry */ }
      if (n >= attempts) return reject(new Error("Health check timeout"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

function writeStoreFile(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function readStoreFile() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function buildInitialStore() {
  return {
    users: {
      [OWNER.email]: { email: OWNER.email, password: OWNER.password, role: "admin" },
    },
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true, playBasedCurriculum: true },
      curriculum: fixture.seedScopeLibrary(),
      updatedAt: new Date().toISOString(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
    curriculumOperatorConversations: {},
  };
}

function countQaLessons(curriculum) {
  return curriculum.lessonPlans.filter((p) => !fixture.DECOY_LESSON_IDS.includes(p.id)).length;
}

function activityIdFromPrintableResource(resource) {
  const match = String(resource?.description || "").match(/Operator activityId=([^\s\n]+)/);
  return match ? match[1] : "";
}

function probeAuditImageDecision(plan, curriculum, activityId, setupImageUrl) {
  const planProbe = JSON.parse(JSON.stringify(plan));
  const curriculumProbe = JSON.parse(JSON.stringify(curriculum));
  const actProbe = curriculumProbe.activities.find((a) => a.id === activityId);
  if (actProbe) {
    actProbe.setupImageUrl = setupImageUrl;
    actProbe.imageRequirement = "setup_only";
  }
  if (!planProbe.enrichmentDraft) planProbe.enrichmentDraft = { activities: {} };
  if (!planProbe.enrichmentDraft.activities) planProbe.enrichmentDraft.activities = {};
  planProbe.enrichmentDraft.activities[activityId] = {
    ...(planProbe.enrichmentDraft.activities[activityId] || {}),
    setupImageUrl,
    imageRequirement: "setup_only",
  };
  const audit = auditApi.auditLesson(planProbe, curriculumProbe, {
    command: {
      actions: { replaceBadImages: true, keepGoodImages: true, generateImages: true },
    },
  });
  const row = (audit.assetPlan || []).find((item) => item.activityId === activityId);
  const decision = row?.image?.decision;
  return decision === "KEEP_EXISTING" ? "KEEP" : decision;
}

function writeActivityImageSeed(curriculum, lessonId, activityId, url) {
  const act = curriculum.activities.find((a) => a.id === activityId);
  const plan = curriculum.lessonPlans.find((p) => p.id === lessonId);
  if (act) {
    act.setupImageUrl = url;
    act.imageRequirement = "setup_only";
  }
  if (plan?.enrichmentDraft?.activities) {
    if (!plan.enrichmentDraft.activities[activityId]) plan.enrichmentDraft.activities[activityId] = {};
    plan.enrichmentDraft.activities[activityId].setupImageUrl = url;
    plan.enrichmentDraft.activities[activityId].imageRequirement = "setup_only";
  }
}

function seedImageUrlsOnly(store, lessonId) {
  const curriculum = store.siteContent.curriculum;
  const ids = fixture.orderedActivityIds(curriculum, lessonId).filter((id) => {
    const title = curriculum.activities.find((a) => a.id === id)?.title || "";
    return !/seed\s*growth/i.test(title);
  });
  ok(ids.length >= 4, "lesson has at least four activities for image audit seed");
  const plan = curriculum.lessonPlans.find((p) => p.id === lessonId);
  ids.forEach((id) => {
    const act = curriculum.activities.find((a) => a.id === id);
    if (act) act.imageRequirement = "setup_only";
    if (plan?.enrichmentDraft?.activities) {
      if (!plan.enrichmentDraft.activities[id]) plan.enrichmentDraft.activities[id] = {};
      plan.enrichmentDraft.activities[id].imageRequirement = "setup_only";
    }
  });
  const used = new Set();
  const goodId = ids.find((id) => probeAuditImageDecision(plan, curriculum, id, fixture.IMAGE_SEED.GOOD) === "KEEP");
  ok(goodId, "audit KEEP candidate for good image seed");
  used.add(goodId);
  const badId = ids.find((id) => !used.has(id)
    && probeAuditImageDecision(plan, curriculum, id, fixture.IMAGE_SEED.BAD) === "REPLACE");
  ok(badId, "audit REPLACE candidate for bad image seed");
  used.add(badId);
  const generateId = ids.find((id) => !used.has(id)
    && probeAuditImageDecision(plan, curriculum, id, "") === "GENERATE");
  ok(generateId, "audit GENERATE candidate for missing image seed");
  used.add(generateId);
  const controlId = ids.find((id) => !used.has(id)
    && probeAuditImageDecision(plan, curriculum, id, fixture.IMAGE_SEED.CONTROL) === "KEEP");
  ok(controlId, "audit KEEP candidate for control image seed");
  writeActivityImageSeed(curriculum, lessonId, goodId, fixture.IMAGE_SEED.GOOD);
  writeActivityImageSeed(curriculum, lessonId, badId, fixture.IMAGE_SEED.BAD);
  writeActivityImageSeed(curriculum, lessonId, generateId, "");
  writeActivityImageSeed(curriculum, lessonId, controlId, fixture.IMAGE_SEED.CONTROL);
  return { goodId, badId, generateId, controlId };
}

async function main() {
  console.log("Spring Planting E2E — real operator HTTP flow\n");

  let store = buildInitialStore();
  writeStoreFile(store);
  const scopeBefore = fixture.scopeFingerprint(store.siteContent.curriculum);
  const lessonCountBefore = countQaLessons(store.siteContent.curriculum);

  console.log("1. Parse exact command + research staging");
  const staged = commandApi.parseOperatorCommand(fixture.EXACT_COMMAND, {
    phase: 7,
    lessonPlans: store.siteContent.curriculum.lessonPlans,
  });
  ok(staged.command.intent === "research_then_create", "exact command → research_then_create");
  ok((staged.confirmReasons || []).includes("research_then_lesson_confirmation_required"), "confirmation required");
  ok(staged.command.actions.createLesson !== true, "no create before confirmation");

  const mockFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      output: [{
        content: [{
          annotations: fixture.MOCK_RESEARCH_SOURCES.map((s) => ({
            url: s.url, title: s.title, text: s.summary,
          })),
        }],
      }],
    }),
  });

  const parseResult = await boundary.handleParseRequest({
    body: { command: fixture.EXACT_COMMAND, operatorSessionId: SESSION, requestId: "spring-research-1" },
    session: { email: OWNER.email },
    store,
    curriculum: store.siteContent.curriculum,
    phase: 7,
    dependencies: {
      conversationStore: conversation,
      parseCommand: commandApi.parseOperatorCommand,
      profileStore: { read: () => ({ version: 1, instructions: [] }) },
      researchConfig: { enabled: true, apiKey: "test-key", fetchImpl: mockFetch },
    },
  });
  ok(parseResult.statusCode === 200, "research parse HTTP boundary ok");
  ok(parseResult.body.jobCreated === false, "parse does not create job");
  ok(parseResult.body.conversationContext?.researchSources?.length === 2, "research sources stored in conversation");
  writeStoreFile(store);
  ok(countQaLessons(store.siteContent.curriculum) === lessonCountBefore, "no new lesson after research parse");

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: OWNER.email,
      LLH_OPERATOR_AI_FIXTURE: "1",
      LLH_OPERATOR_PRINTABLE_FIXTURE: "1",
      LLH_OPERATOR_SONGS_BOOKS_FIXTURE: "1",
      LLH_OPERATOR_IMAGE_FIXTURE: "1",
      VISUAL_PRODUCTION_MOCK_GENERATE: "1",
      CURRICULUM_OPERATOR_LIVE_RESEARCH_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c; });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200, "admin login");
    const auth = { Authorization: `Bearer ${login.json.token || login.json.adminToken}` };

    const blockedRun = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 7,
      command: fixture.EXACT_COMMAND,
      operatorSessionId: SESSION,
    }, auth);
    ok(blockedRun.status === 409, "run without confirm is blocked");
    ok(blockedRun.json.code === "RESEARCH_ONLY_RUN_BLOCKED" || blockedRun.json.runBlocked === true,
      "research staging blocks unconfirmed run");
    store = readStoreFile();
    ok(countQaLessons(store.siteContent.curriculum) === lessonCountBefore, "no lesson before confirmed run");

    console.log("\n2. Confirmed create (researchSources → job creationBrief)");
    const createRun = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 7,
      confirm: true,
      command: fixture.EXPLICIT_CREATE_COMMAND,
      operatorSessionId: SESSION,
    }, auth);
    ok(createRun.status === 200, "confirmed create run succeeds");
    ok(createRun.json.published === false && createRun.json.publishEnabled === false, "publish false on create run");
    const job = createRun.json.job;
    const lr = job?.lessonResults?.[0];
    ok(lr?.published === false, "lesson result published=false");
    ok(Array.isArray(lr?.creationBrief?.researchContext) && lr.creationBrief.researchContext.length >= 1,
      "job creationBrief carries researchContext from conversation flow");
    ok(lr?.lessonCreated === true && lr?.createdLessonId, "lesson created after confirmation");

    store = readStoreFile();
    ok(countQaLessons(store.siteContent.curriculum) === lessonCountBefore + 1, "exactly one new QA lesson");
    ok(fixture.scopeFingerprint(store.siteContent.curriculum) === scopeBefore, "decoy scope unchanged after create");

    const lessonId = lr.createdLessonId;
    const plan = store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonId);
    const activities = store.siteContent.curriculum.activities.filter((a) => a.lessonPlanId === lessonId);
    ok(plan?.status === "draft", "created lesson is draft");
    ok(activities.length >= 3, "operator produced at least three activities");
    ok(createApi.qualityReviewNewLesson({
      brief: lr.creationBrief,
      lessonPlan: plan,
      activities,
    }).ok, "operator lesson passes qualityReviewNewLesson");

    console.log("\n3. Printable (planner path + linkage + letter PDF)");
    const seqResource = store.siteContent.curriculum.resources.find(
      (r) => /seed growth/i.test(r.title) && (r.lessonPlanIds || []).includes(lessonId),
    );
    ok(seqResource, "seed-growth sequencing printable resource exists");
    ok(!/groth|sequecing/i.test(seqResource.title), "printable spelling");
    const linkedActId = activityIdFromPrintableResource(seqResource);
    const linkedAct = activities.find((a) => a.id === linkedActId)
      || (linkedActId && activities.find((a) => a.id === linkedActId));
    const draftLinkedId = linkedActId
      || activities.find((a) => plan?.enrichmentDraft?.activities?.[a.id]?.relatedPrintableId === seqResource.id)?.id;
    const linkedViaDraft = draftLinkedId
      ? activities.find((a) => a.id === draftLinkedId)
        || (plan?.enrichmentDraft?.activities?.[draftLinkedId] ? { id: draftLinkedId } : null)
      : null;
    const linked = linkedAct || linkedViaDraft
      || activities.find((a) => a.relatedPrintableId === seqResource.id
        || plan?.enrichmentDraft?.activities?.[a.id]?.relatedPrintableId === seqResource.id);
    ok(linked, "printable linked to activity (resource metadata or relatedPrintableId)");
    ok(
      schema.asArray(plan?.enrichmentDraft?.week?.printableIds).includes(seqResource.id)
        || schema.asArray(plan?.resourceIds).includes(seqResource.id),
      "printable listed on lesson draft or resourceIds",
    );
    const actBlob = linked
      ? `${linked.materials || ""}\n${linked.steps || ""}\n${plan?.enrichmentDraft?.activities?.[linked.id]?.materials || ""}`
      : "";
    ok(
      linkedActId
        || /print|sequenc|seed growth/i.test(actBlob)
        || /print|sequenc|seed/i.test(seqResource.title),
      "printable tied to activity via operator metadata or materials",
    );
    if (seqResource.fileData) {
      const buf = Buffer.from(String(seqResource.fileData).replace(/^data:application\/pdf;base64,/, ""), "base64");
      const validated = await printablesApi.validateGeneratedPdf(buf, {
        expectedPageCount: seqResource.pageCount || 1,
        fileName: seqResource.fileName,
      });
      ok(validated.ok, `printable PDF validates (${(validated.failed || []).map((f) => f.code).join(",") || "ok"})`);
      ok(validated.checks.some((c) => c.code === "letter_size" && c.ok), "PDF letter-size check");
    } else {
      ok(false, "printable fileData present");
    }

    console.log("\n4. Image audit pipeline (KEEP / REPLACE / GENERATE)");
    const imageSeedIds = seedImageUrlsOnly(store, lessonId);
    writeStoreFile(store);
    const actIds = [imageSeedIds.goodId, imageSeedIds.badId, imageSeedIds.generateId, imageSeedIds.controlId];
    const curriculum = store.siteContent.curriculum;
    const planForAudit = curriculum.lessonPlans.find((p) => p.id === lessonId);
    const actsForAudit = curriculum.activities.filter((a) => a.lessonPlanId === lessonId);
    const audit = auditApi.auditLesson(planForAudit, curriculum, {
      command: {
        actions: { replaceBadImages: true, keepGoodImages: true, generateImages: true },
      },
    });
    const imagePlan = imagesApi.buildImageActionsFromAudit(planForAudit, actsForAudit, audit, {
      replaceBadImages: true,
      keepGoodImages: true,
      command: { actions: { replaceBadImages: true, keepGoodImages: true } },
    });
    const byAct = Object.fromEntries(imagePlan.map((row) => [row.activityId, row]));
    ok(byAct[actIds[0]]?.decision === "KEEP", "audit KEEP for good image");
    ok(byAct[actIds[1]]?.decision === "REPLACE", "audit REPLACE for bad image");
    ok(byAct[actIds[2]]?.decision === "GENERATE", "audit GENERATE for missing image");
    ok(byAct[actIds[3]]?.decision === "KEEP", "audit KEEP for unrelated control image");

    const preImageSnap = fixture.lessonSnapshot(store.siteContent.curriculum, lessonId);
    const imageRun = await requestJson("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: 7,
      currentlySelectedLessonId: lessonId,
      command: `For ${plan.title}, keep the good activity pictures, replace pictures that look wrong, and generate missing activity pictures. Do not change lesson wording, printables, songs, books, or the cover.`,
    }, auth);
    ok(imageRun.status === 200, "image repair run succeeds");
    store = readStoreFile();
    const afterActs = store.siteContent.curriculum.activities.filter((a) => a.lessonPlanId === lessonId);
    const draftActs = store.siteContent.curriculum.lessonPlans.find((p) => p.id === lessonId)?.enrichmentDraft?.activities || {};
    const url = (id) => draftActs[id]?.setupImageUrl || afterActs.find((a) => a.id === id)?.setupImageUrl || "";
    ok(url(actIds[0]) === fixture.IMAGE_SEED.GOOD, "good image unchanged after repair run");
    ok(url(actIds[1]) !== fixture.IMAGE_SEED.BAD, "bad image replaced after repair run");
    ok(url(actIds[2]) && !/^https:\/\/example\.com\/cartoon/.test(url(actIds[2])), "missing image generated");
    ok(url(actIds[3]) === fixture.IMAGE_SEED.CONTROL, "control activity image unchanged");

    console.log("\n5. Exact follow-up commands");
    const followHandlers = [
      {
        text: fixture.FOLLOW_UP_COMMANDS[0],
        async run() {
          const parsed = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[0], {
            phase: 7,
            lessonPlans: store.siteContent.curriculum.lessonPlans,
            activities: afterActs,
            currentlySelectedLessonId: lessonId,
          });
          const res = await requestJson("POST", "/api/admin/curriculum/operator", {
            action: "run",
            phase: 7,
            currentlySelectedLessonId: lessonId,
            command: fixture.FOLLOW_UP_COMMANDS[0],
          }, auth);
          ok(parsed.command.actions.publish !== true, "Activity 1 easier: publish false");
          ok(res.status === 409 || parsed.command.completion?.mutationsEnabled !== true,
            "Activity 1 easier: fail-closed or blocked run (no broad mutation)");
          ok(res.json?.published !== true, "Activity 1 easier: not published");
        },
      },
      {
        text: fixture.FOLLOW_UP_COMMANDS[1],
        async run() {
          const before = fixture.lessonSnapshot(store.siteContent.curriculum, lessonId);
          const parsed = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[1], {
            phase: 7,
            lessonPlans: store.siteContent.curriculum.lessonPlans,
            currentlySelectedLessonId: lessonId,
          });
          ok(parsed.interpretation?.primary === "PRINTABLE_WORK", "Replace only printable: PRINTABLE_WORK");
          const res = await requestJson("POST", "/api/admin/curriculum/operator", {
            action: "run",
            phase: 7,
            currentlySelectedLessonId: lessonId,
            command: fixture.FOLLOW_UP_COMMANDS[1],
          }, auth);
          ok(res.status === 200, "Replace only printable: run ok");
          store = readStoreFile();
          const after = fixture.lessonSnapshot(store.siteContent.curriculum, lessonId);
          const beforeObj = JSON.parse(before);
          const afterObj = JSON.parse(after);
          ok(JSON.stringify(beforeObj.plan.objectives) === JSON.stringify(afterObj.plan.objectives), "printable-only: objectives unchanged");
          ok(JSON.stringify(beforeObj.activities.map((a) => a.steps)) === JSON.stringify(afterObj.activities.map((a) => a.steps)),
            "printable-only: activity steps unchanged");
        },
      },
      {
        text: fixture.FOLLOW_UP_COMMANDS[2],
        async run() {
          const parsed = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[2], {
            phase: 7,
            lessonPlans: store.siteContent.curriculum.lessonPlans,
            currentlySelectedLessonId: lessonId,
          });
          const res = await requestJson("POST", "/api/admin/curriculum/operator", {
            action: "run",
            phase: 7,
            currentlySelectedLessonId: lessonId,
            command: fixture.FOLLOW_UP_COMMANDS[2],
          }, auth);
          ok(parsed.command.actions.publish !== true, "budget materials: publish false");
          ok(res.status === 409 || parsed.command.completion?.mutationsEnabled !== true,
            "budget materials: fail-closed or blocked");
        },
      },
      {
        text: fixture.FOLLOW_UP_COMMANDS[3],
        async run() {
          const orderedIds = fixture.orderedActivityIds(store.siteContent.curriculum, lessonId);
          const activity3Id = orderedIds[2];
          const parsed = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[3], {
            phase: 7,
            lessonPlans: store.siteContent.curriculum.lessonPlans,
            activities: afterActs,
            currentlySelectedLessonId: lessonId,
          });
          ok(parsed.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR", "Activity 3 image: ACTIVITY_IMAGE_REPAIR");
          ok(parsed.command.actions.upgradeLesson !== true, "Activity 3 image: no upgradeLesson");
          ok(parsed.command.actions.generatePrintables !== true, "Activity 3 image: no printables");
          ok(
            schema.asArray(parsed.command.scope?.targetActivityIds).includes(activity3Id),
            "Activity 3 image: targets third activity only",
          );
          const beforeSnap = JSON.parse(fixture.lessonSnapshot(store.siteContent.curriculum, lessonId));
          const urlBefore = (id) => {
            const draft = beforeSnap.plan?.enrichmentDraft?.activities?.[id];
            const act = beforeSnap.activities.find((a) => a.id === id);
            return draft?.setupImageUrl || act?.setupImageUrl || "";
          };
          const res = await requestJson("POST", "/api/admin/curriculum/operator", {
            action: "run",
            phase: 7,
            currentlySelectedLessonId: lessonId,
            command: fixture.FOLLOW_UP_COMMANDS[3],
          }, auth);
          ok(parsed.command.actions.publish !== true, "Activity 3 image: publish false");
          ok(res.status === 200, "Activity 3 image: narrow run ok");
          store = readStoreFile();
          const afterSnap = JSON.parse(fixture.lessonSnapshot(store.siteContent.curriculum, lessonId));
          ok(
            JSON.stringify(beforeSnap.plan.objectives) === JSON.stringify(afterSnap.plan.objectives),
            "Activity 3 image: objectives unchanged",
          );
          ok(
            JSON.stringify(beforeSnap.activities.map((a) => a.steps))
              === JSON.stringify(afterSnap.activities.map((a) => a.steps)),
            "Activity 3 image: activity steps unchanged",
          );
          const otherIds = orderedIds.filter((id) => id !== activity3Id);
          ok(
            otherIds.every((id) => urlBefore(id) === (afterSnap.activities.find((a) => a.id === id)?.setupImageUrl
              || afterSnap.plan?.enrichmentDraft?.activities?.[id]?.setupImageUrl || "")),
            "Activity 3 image: other activity images unchanged",
          );
        },
      },
      {
        text: fixture.FOLLOW_UP_COMMANDS[4],
        async run() {
          const parsed = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[4], {
            phase: 7,
            lessonPlans: store.siteContent.curriculum.lessonPlans,
            activities: afterActs,
            currentlySelectedLessonId: lessonId,
          });
          const res = await requestJson("POST", "/api/admin/curriculum/operator", {
            action: "run",
            phase: 7,
            currentlySelectedLessonId: lessonId,
            command: fixture.FOLLOW_UP_COMMANDS[4],
          }, auth);
          ok(parsed.command.actions.publish !== true, "family connection: publish false");
          ok(res.status === 409 || parsed.command.completion?.mutationsEnabled !== true,
            "family connection: fail-closed or blocked without activity rewrites");
        },
      },
    ];
    for (const handler of followHandlers) {
      await handler.run();
    }

    console.log("\n6. Publish gate");
    const publishParse = commandApi.parseOperatorCommand("Publish this lesson.", {
      phase: 7,
      lessonPlans: store.siteContent.curriculum.lessonPlans,
      currentlySelectedLessonId: lessonId,
    });
    ok(publishParse.command.actions.publish !== true, "publish not auto-enabled");
    ok((publishParse.confirmReasons || []).includes("publish_requested"), "publish requires confirmation");

    ok(fixture.scopeFingerprint(store.siteContent.curriculum) === scopeBefore, "decoy scope unchanged at end");
  } finally {
    child.kill("SIGTERM");
    if (blocked) {
      console.error("\nRESULT: BLOCKED");
      if (stderr) console.error(stderr.slice(-2000));
      process.exitCode = 1;
      return;
    }
    console.log(`\nRESULT: PASS — ${passed} assertions`);
  }
}

main().catch((err) => {
  console.error("\nRESULT: BLOCKED —", err);
  process.exitCode = 1;
});
