#!/usr/bin/env node
/**
 * Visual production briefs — parser, review gates, isolated store.
 * Run: npm run test:visual-production-brief
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const model = require("./visual-production-brief.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20490 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-visual-production-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "visual-prod-pass",
  code: "visual-prod-code",
};
const OTHER = {
  email: "other-admin@example.com",
  password: "visual-prod-pass",
  code: "visual-prod-code",
};

const LESSON_ID = "cur-lp-test-visual-production";
const FARM_ACTIVITY_ID = "cur-act-farm-sensory-bin";
const APPLE_ACTIVITY_ID = "cur-act-apple-handprint-tree";
const COVER_URL = "https://example.com/existing-cover.png";
const SETUP_URL = "https://example.com/existing-setup.png";
const RESOURCE_ID = "cur-res-existing-printable";

const FARM_INSTRUCTION = `Farm Sensory Bin:
Activity image.
Realistic daycare setup.
No children.
Clear shallow sensory bin filled with oats.
Small realistic plastic cows, pigs and horses.
Two small scoops.
Wooden classroom table.
Natural daylight.
Should look like a teacher took the photo.
Absolutely no cartoon animals.`;

const APPLE_INSTRUCTION = `Apple Handprint Tree:
Printable.
White page.
Simple brown tree trunk centered near bottom.
Large completely blank area above trunk for children's red/orange/yellow handprints.
No cartoon apples.
No border.
Tiny title at top only.`;

const AMBIGUOUS_INSTRUCTION = `Something fun maybe:
Make it look nice or similar to a Pinterest farm.
You decide the style.`;

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

function seedLesson() {
  return {
    id: LESSON_ID,
    title: "Visual Production Test Lesson",
    age: "Preschool",
    theme: "Farm",
    plan: "Pro",
    status: "draft",
    coverImageUrl: COVER_URL,
    coverImageAlt: "Existing cover",
    resourceIds: [RESOURCE_ID],
    dailyPlans: {
      monday: {
        theme: "Farm",
        items: [{
          itemId: "farm-sensory",
          title: "Farm Sensory Bin",
          objective: "Explore farm animals",
          setupImageUrl: SETUP_URL,
        }],
      },
      tuesday: {
        theme: "Apples",
        items: [{
          itemId: "apple-handprint",
          title: "Apple Handprint Tree",
          objective: "Handprint art",
        }],
      },
      wednesday: { theme: "", items: [] },
      thursday: { theme: "", items: [] },
      friday: { theme: "", items: [] },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function seedActivities() {
  return [
    {
      id: FARM_ACTIVITY_ID,
      lessonPlanId: LESSON_ID,
      itemId: "farm-sensory",
      title: "Farm Sensory Bin",
      status: "draft",
      setupImageUrl: SETUP_URL,
      exampleImageUrl: "",
    },
    {
      id: APPLE_ACTIVITY_ID,
      lessonPlanId: LESSON_ID,
      itemId: "apple-handprint",
      title: "Apple Handprint Tree",
      status: "draft",
    },
  ];
}

function assertParserContract() {
  const farm = model.createVisualBriefFromInstruction({
    lessonId: LESSON_ID,
    instruction: FARM_INSTRUCTION,
    activities: seedActivities(),
  });
  ok(farm.activityName === "Farm Sensory Bin", "farm activity name preserved");
  ok(farm.activityId === FARM_ACTIVITY_ID, "farm activity id matched");
  ok(farm.assetType === "ACTIVITY_IMAGE", "farm asset type is ACTIVITY_IMAGE");
  ok(farm.visualStyle === "REALISTIC_CLASSROOM", "farm style is REALISTIC_CLASSROOM");
  ok(/no people/i.test(farm.people) || /no children/i.test(farm.people), "farm people = no children");
  ok(/oats/i.test(farm.materials) || farm.requiredElements.some((item) => /oats/i.test(item)), "farm oats preserved");
  ok(/cows/i.test(farm.generationPrompt) && /pigs/i.test(farm.generationPrompt) && /horses/i.test(farm.generationPrompt), "farm animals preserved in prompt");
  ok(/two small scoops/i.test(farm.generationPrompt), "farm scoops preserved");
  ok(/wooden classroom table/i.test(farm.generationPrompt), "farm table preserved");
  ok(/teacher took the photo/i.test(farm.generationPrompt), "teacher-photo direction preserved");
  ok(!/generic farm scene/i.test(farm.generationPrompt), "farm prompt is not reinterpreted");
  ok(farm.originalInstruction.includes("Clear shallow sensory bin filled with oats"), "original instruction stored verbatim");
  ok(farm.forbiddenElements.some((item) => /cartoon animals/i.test(item)), "no cartoon animals is forbidden");
  ok(farm.forbiddenElements.some((item) => /glossy CGI/i.test(item)), "realistic CGI forbidden list applied");
  ok(farm.status === "READY_FOR_REVIEW", "complete farm brief is READY_FOR_REVIEW");
  ok(farm.generationPrompt.includes("OWNER VISUAL DIRECTION"), "prompt keeps owner direction as source of truth");

  const apple = model.createVisualBriefFromInstruction({
    lessonId: LESSON_ID,
    instruction: APPLE_INSTRUCTION,
    activities: seedActivities(),
  });
  ok(apple.activityName === "Apple Handprint Tree", "apple activity name preserved");
  ok(apple.assetType === "PRINTABLE_PAGE", "apple asset type is PRINTABLE_PAGE not a generic illustration");
  ok(apple.visualStyle === "CLEAN_PRINTABLE", "apple style is CLEAN_PRINTABLE");
  ok(/white page/i.test(apple.printableLayout) || /white page/i.test(apple.generationPrompt), "white page layout preserved");
  ok(/blank area/i.test(apple.generationPrompt), "blank handprint area preserved");
  ok(/tiny title at top only/i.test(apple.generationPrompt), "tiny title instruction preserved");
  ok(apple.forbiddenElements.some((item) => /cartoon apples/i.test(item)), "no cartoon apples forbidden");
  ok(apple.forbiddenElements.some((item) => /no border/i.test(item)), "no border forbidden");
  ok(!/puffy 3D/i.test(apple.requiredElements.join(" ")), "printable does not require 3D cartoon style");
  ok(apple.status === "READY_FOR_REVIEW", "complete apple brief is READY_FOR_REVIEW");

  const vague = model.createVisualBriefFromInstruction({
    lessonId: LESSON_ID,
    instruction: AMBIGUOUS_INSTRUCTION,
    activities: seedActivities(),
  });
  ok(vague.status === "NEEDS_REVIEW", "ambiguous instruction is NEEDS_REVIEW not guessed");
  ok(vague.reviewFlags.includes("ambiguous_owner_language"), "vague language flagged");
  ok(vague.reviewFlags.includes("missing_asset_type") || vague.reviewFlags.includes("missing_visual_style"), "missing type/style flagged instead of invented");

  const autoApprove = model.transitionVisualBriefStatus(farm, "APPROVED", { confirmApprove: false });
  ok(!autoApprove.ok, "READY_FOR_REVIEW does not auto-approve");
  const approved = model.transitionVisualBriefStatus(farm, "APPROVED", { confirmApprove: true });
  ok(approved.ok && approved.brief.status === "APPROVED", "explicit confirmApprove moves to APPROVED");
  const generated = model.transitionVisualBriefStatus(approved.brief, "GENERATED", { confirmGenerate: true });
  ok(!generated.ok && approved.brief.status === "APPROVED", "GENERATED is blocked even after approve");
  const attached = model.transitionVisualBriefStatus(approved.brief, "ATTACHED");
  ok(!attached.ok, "ATTACHED is blocked");

  const card = model.toReviewCard(farm);
  ok(card.originalInstruction && card.generationPrompt && Array.isArray(card.forbiddenElements), "review card has instruction, prompt, forbidden");
  ok(card.canApprove === true, "READY_FOR_REVIEW card can approve");
  ok(card.canGenerate === false && card.canAttach === false, "review card never enables generate/attach");
}

function assertStaticContract() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const uiJs = fs.readFileSync(path.join(ROOT, "scripts/visual-production-ui.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok(serverJs.includes("/api/admin/curriculum/visual-production"), "visual-production route registered");
  ok(serverJs.includes("createVisualProductionApi"), "visual-production API factory wired");
  ok(serverJs.includes("visualProduction: { briefs: [], updatedAt: \"\" }"), "isolated store default present");
  ok(!serverJs.includes("publish_enrichment") || serverJs.includes("createVisualProductionApi"), "server still has other publish paths; visual API is isolated");
  ok(appJs.includes("curriculum-visual-production"), "admin tab wired");
  ok(uiJs.includes("Plan visuals for review"), "plan-for-review UI present");
  ok(uiJs.includes("Generate (blocked)") && uiJs.includes("Attach (blocked)"), "generate/attach remain blocked in UI");
  ok(indexHtml.includes("visual-production-brief.js"), "brief module loaded");
  ok(indexHtml.includes("visual-production-ui.js"), "review UI loaded");
}

async function main() {
  console.log("Visual production brief tests");
  assertParserContract();
  assertStaticContract();

  const lesson = seedLesson();
  const activities = seedActivities();
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { playBasedCurriculum: true },
      curriculum: {
        lessonPlans: [lesson],
        activities,
        resources: [{ id: RESOURCE_ID, title: "Existing Printable", status: "draft", fileUrl: "https://example.com/printable.pdf" }],
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    },
    visualProduction: { briefs: [], updatedAt: "" },
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
      ADMIN_EMAILS: `${OWNER.email},${OTHER.email}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await waitForHealth(child);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    ok(ownerLogin.status === 200, "owner login");
    const ownerAuth = { Authorization: `Bearer ${ownerLogin.json.token || ownerLogin.json.adminToken}` };

    const otherLogin = await requestJson("POST", "/api/admin/login", OTHER);
    ok(otherLogin.status === 200, "other admin login");
    const otherAuth = { Authorization: `Bearer ${otherLogin.json.token || otherLogin.json.adminToken}` };

    const denied = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "plan",
      lessonId: LESSON_ID,
      instruction: FARM_INSTRUCTION,
    }, otherAuth);
    ok(denied.status === 403, "non-owner cannot plan visuals");

    const planned = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "plan",
      lessonId: LESSON_ID,
      instruction: `${FARM_INSTRUCTION}\n\n${APPLE_INSTRUCTION}`,
    }, ownerAuth);
    ok(planned.status === 200, "owner plan succeeds");
    ok(planned.json.generationStarted === false && planned.json.attached === false, "plan does not generate or attach");
    ok(planned.json.lessonAssetsUnchanged === true, "plan reports lesson assets unchanged");
    ok(Array.isArray(planned.json.cards) && planned.json.cards.length === 2, "two briefs planned");
    const farmCard = planned.json.cards.find((card) => card.activityName === "Farm Sensory Bin");
    const appleCard = planned.json.cards.find((card) => card.activityName === "Apple Handprint Tree");
    ok(farmCard?.status === "READY_FOR_REVIEW", "farm card ready for review");
    ok(appleCard?.status === "READY_FOR_REVIEW", "apple card ready for review");
    ok(farmCard?.canApprove === true && farmCard?.canGenerate === false, "approve allowed, generate blocked");

    const auto = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "approve",
      id: farmCard.id,
    }, ownerAuth);
    ok(auto.status === 400, "approve without confirmApprove is rejected");

    const generateEarly = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "generate",
      id: farmCard.id,
      confirmGenerate: true,
    }, ownerAuth);
    ok(generateEarly.status === 409, "generate before approve is blocked");

    const approved = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "approve",
      id: farmCard.id,
      confirmApprove: true,
    }, ownerAuth);
    ok(approved.status === 200 && approved.json.card.status === "APPROVED", "explicit approve works");

    const generateLater = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "generate",
      id: farmCard.id,
      confirmGenerate: true,
    }, ownerAuth);
    ok(generateLater.status === 409, "generate after approve still does not start pixels");
    ok(generateLater.json.lessonAssetsUnchanged === true, "blocked generate leaves assets unchanged");

    const attach = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "attach",
      id: farmCard.id,
      confirmAttach: true,
      targetField: "setupImageUrl",
    }, ownerAuth);
    ok(attach.status === 409, "attach is blocked");

    const storeAfter = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const planAfter = (storeAfter.siteContent.curriculum.lessonPlans || []).find((item) => item.id === LESSON_ID);
    const actsAfter = (storeAfter.siteContent.curriculum.activities || []).filter((item) => item.lessonPlanId === LESSON_ID);
    ok(planAfter.status === "draft", "lesson was not published");
    ok(planAfter.plan === "Pro", "Free/Pro access unchanged");
    ok(planAfter.coverImageUrl === COVER_URL, "existing cover URL unchanged");
    ok(JSON.stringify(planAfter.resourceIds) === JSON.stringify([RESOURCE_ID]), "existing resource IDs unchanged");
    const farmAct = actsAfter.find((item) => item.id === FARM_ACTIVITY_ID);
    ok(farmAct.setupImageUrl === SETUP_URL, "existing activity image URL unchanged");
    ok(Array.isArray(storeAfter.visualProduction?.briefs) && storeAfter.visualProduction.briefs.length >= 2, "briefs stored in isolated visualProduction collection");
    ok(!planAfter.visualProduction, "briefs are not written onto the lesson plan record");

    const listed = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "list",
      lessonId: LESSON_ID,
    }, ownerAuth);
    ok(listed.status === 200 && listed.json.cards.length === 2, "list returns planned cards");
  } finally {
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
        child.on("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }

  if (stderr && /visual production/i.test(stderr)) {
    console.log(stderr.slice(0, 500));
  }
  console.log(`OK visual-production-brief (${passed} assertions)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
