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
const visualProductionImage = require("../server/visual-production-image.js");

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

async function assertImageProviderContract() {
  ok(visualProductionImage.OPENAI_IMAGES_URL === "https://api.openai.com/v1/images/generations", "uses OpenAI images generations endpoint");
  ok(visualProductionImage.BRAND_URL === "littlelearnershubbyleah.com", "sharp watermark uses exact site spelling");
  const footer = visualProductionImage.buildBrandWatermarkSvg(200, 100);
  ok(footer.brandUrl === "littlelearnershubbyleah.com", "watermark svg receives exact littlelearnershubbyleah.com");
  ok(footer.layerCount === 1, "exactly one footer layer is defined for sharp");
  const svgText = footer.svg.toString("utf8");
  const brandMatches = svgText.match(/littlelearnershubbyleah\.com/g) || [];
  ok(brandMatches.length === 1, "watermark svg contains the brand URL exactly once");
  ok((svgText.match(/<text\b/g) || []).length === 1, "watermark svg has exactly one text node");

  const farmPrompt = model.createVisualBriefFromInstruction({
    lessonId: LESSON_ID,
    instruction: FARM_INSTRUCTION,
    activities: seedActivities(),
  }).generationPrompt;
  ok(!/require:[^\n]*littlelearnershubbyleah\.com|website credit along the bottom edge:[^\n]*littlelearnershubbyleah/i.test(farmPrompt), "provider prompt has no instruction to render the URL");
  ok(/do not render any text, labels, logos, or website URLs/i.test(farmPrompt), "provider prompt explicitly prohibits text/URLs/logos");
  ok(!farmPrompt.includes("Use the exact spelling littlelearnershubbyleah.com"), "provider prompt no longer asks the model to spell the URL");

  const prevMock = process.env.VISUAL_PRODUCTION_MOCK_GENERATE;
  delete process.env.VISUAL_PRODUCTION_MOCK_GENERATE;
  try {
    await visualProductionImage.generateVisualProductionImage({
      apiKey: "",
      model: "gpt-image-2",
      brief: { generationPrompt: "test prompt", visualStyle: "REALISTIC_CLASSROOM" },
    });
    ok(false, "missing OPENAI_API_KEY should fail");
  } catch (error) {
    ok(error.code === "provider_not_configured", "missing OPENAI_API_KEY returns provider_not_configured");
  } finally {
    if (prevMock) process.env.VISUAL_PRODUCTION_MOCK_GENERATE = prevMock;
    else delete process.env.VISUAL_PRODUCTION_MOCK_GENERATE;
  }
  process.env.VISUAL_PRODUCTION_MOCK_GENERATE = "1";
  const mocked = await visualProductionImage.generateVisualProductionImage({
    apiKey: "sk-test-visual-production-local",
    model: "gpt-image-2",
    brief: { generationPrompt: "test prompt", visualStyle: "REALISTIC_CLASSROOM" },
  });
  ok(mocked.buffer?.length > 0, "mock generation returns PNG bytes when VISUAL_PRODUCTION_MOCK_GENERATE=1");

  const overlay = require("../server/visual-production-printable-overlay.js");
  const brandedFooter = visualProductionImage.buildBrandWatermarkSvg(1024, 1536);
  ok((brandedFooter.svg.toString("utf8").match(/littlelearnershubbyleah\.com/g) || []).length === 1, "brand footer still appears once after overlay module exists");
  const printableMock = await visualProductionImage.generateVisualProductionImage({
    apiKey: "sk-test-visual-production-local",
    model: "gpt-image-2",
    brief: {
      generationPrompt: "test printable prompt",
      visualStyle: "CLEAN_PRINTABLE",
      pageTitle: "Color Tummy-Time Cards",
      pageNumber: 3,
    },
  });
  ok(printableMock.buffer?.length > 0, "printable mock generation still returns PNG bytes");
  ok(overlay.overlayKindForBrief({ pageTitle: "Black, White + Bright Color Visual Cards" }) === "none", "cards without required text skip overlay");
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
  ok(!/require:.*littlelearnershubbyleah\.com|website credit along the bottom edge:.*littlelearnershubbyleah/i.test(farm.generationPrompt), "farm prompt does not instruct the model to render the site URL");
  ok(!farm.requiredElements.some((item) => item.includes("littlelearnershubbyleah.com")), "farm required elements do not ask the model to draw the URL");
  ok(/do not render any text, labels, logos, or website URLs/i.test(farm.generationPrompt), "farm prompt prohibits text/labels/logos/URLs");
  ok(/bottom edge visually clear/i.test(farm.generationPrompt), "farm prompt requires a clear bottom edge for footer overlay");
  ok(farm.forbiddenElements.some((item) => /website URLs/i.test(item)), "farm forbidden list includes website URLs");
  ok(!/llh\.com|littlelearnerhub/i.test(farm.generationPrompt), "farm prompt does not invent a shortened URL");

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
  ok(!/require:.*littlelearnershubbyleah\.com|website credit along the bottom edge:.*littlelearnershubbyleah/i.test(apple.generationPrompt), "apple prompt does not instruct the model to render the site URL");
  ok(/do not render any text, labels, logos, or website URLs/i.test(apple.generationPrompt), "apple prompt prohibits text/labels/logos/URLs");
  ok(/bottom edge visually clear/i.test(apple.generationPrompt), "apple prompt keeps bottom edge clear for footer");

  const omitBrand = model.createVisualBriefFromInstruction({
    lessonId: LESSON_ID,
    instruction: `${APPLE_INSTRUCTION}\nOmit the website credit for this asset only.`,
    activities: seedActivities(),
  });
  ok(!omitBrand.requiredElements.some((item) => /no website URLs/i.test(item)), "explicit omit skips model branding-clear rules for that asset only");
  ok(!/POST-PROCESS FOOTER ONLY/i.test(omitBrand.generationPrompt), "explicit omit skips post-process footer prompt section");

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
  const generatedBlocked = model.transitionVisualBriefStatus(approved.brief, "GENERATED", { confirmGenerate: true });
  ok(!generatedBlocked.ok && approved.brief.status === "APPROVED", "GENERATED is blocked without a successful provider result");
  const generated = model.transitionVisualBriefStatus(approved.brief, "GENERATED", {
    confirmGenerate: true,
    generationSucceeded: true,
  });
  ok(generated.ok && generated.brief.status === "GENERATED", "GENERATED allowed after successful provider result");
  const attached = model.transitionVisualBriefStatus(approved.brief, "ATTACHED");
  ok(!attached.ok, "ATTACHED is blocked");

  const card = model.toReviewCard(farm);
  ok(card.originalInstruction && card.generationPrompt && Array.isArray(card.forbiddenElements), "review card has instruction, prompt, forbidden");
  ok(card.canApprove === true, "READY_FOR_REVIEW card can approve");
  ok(card.canGenerate === false && card.canAttach === false, "review card keeps attach blocked and generate gated by provider");
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
  ok(uiJs.includes("Make this visual") && uiJs.includes("Attach (blocked)"), "generate/attach UI gates present");
  ok(!uiJs.includes("if (!state.lessonId) {\n      state.cards = [];"), "refreshList does not hard-empty when lessonId is blank");
  ok(uiJs.includes('api("list", state.lessonId ? { lessonId: state.lessonId } : {})'), "refreshList lists all briefs when lesson filter is blank");
  ok(uiJs.includes("typedLessonId") && uiJs.includes("form?.lessonId?.value"), "refreshList syncs Lesson ID input before listing");
  ok(uiJs.includes("void run(refreshList)"), "mount always refreshes planned visuals");
  ok(serverJs.includes("/api/admin/media/visual-production-previews/"), "admin preview media route registered");
  ok(serverJs.includes("OPENAI_IMAGE_MODEL"), "image model env wired server-side");
  ok(uiJs.includes("Activity link pending"), "review UI marks pending activity links");
  ok(uiJs.includes("Post-generation text overlay"), "review UI shows overlay text requirements");
  ok(indexHtml.includes("visual-production-brief.js"), "brief module loaded");
  ok(indexHtml.includes("visual-production-ui.js"), "review UI loaded");
}

function assertPackAndColorsPlanContract() {
  const roundtrip = model.normalizeVisualBrief({
    lessonId: LESSON_ID,
    activityName: "Page 2 — Cards",
    assetType: "PRINTABLE_CARDS",
    visualStyle: "CLEAN_PRINTABLE",
    originalInstruction: "Black, White + Bright Color Visual Cards",
    status: "READY_FOR_REVIEW",
    printablePackId: "vpp-test-pack",
    packTitle: "Test Pack",
    pageNumber: 2,
    pageTitle: "Black, White + Bright Color Visual Cards",
    textOverlayRequirements: ["Red", "Blue"],
  });
  ok(roundtrip.printablePackId === "vpp-test-pack", "normalize keeps printablePackId");
  ok(roundtrip.packTitle === "Test Pack", "normalize keeps packTitle");
  ok(roundtrip.pageNumber === 2, "normalize keeps pageNumber");
  ok(roundtrip.pageTitle === "Black, White + Bright Color Visual Cards", "normalize keeps pageTitle");
  ok(roundtrip.textOverlayRequirements.includes("Red"), "normalize keeps text overlay requirements");
  const review = model.toReviewCard(roundtrip);
  ok(review.printablePackId === "vpp-test-pack" && review.pageNumber === 2, "review card keeps pack fields");

  const stored = model.normalizeVisualProductionStore({ briefs: [roundtrip], updatedAt: "2026-08-20T00:00:00.000Z" });
  ok(stored.briefs[0].printablePackId === "vpp-test-pack", "store roundtrip keeps pack id");

  const unmatched = model.createVisualBriefFromInstruction({
    lessonId: LESSON_ID,
    instruction: "No such activity\nActivity image.\nRealistic daycare setup.\nOne bright scarf.",
    activityName: "No such activity",
    assetType: "ACTIVITY_IMAGE",
    visualStyle: "REALISTIC_CLASSROOM",
    activities: seedActivities(),
  });
  ok(unmatched.status === "NEEDS_REVIEW", "parser unmatched activity stays NEEDS_REVIEW");
  ok(unmatched.reviewFlags.includes("unmatched_activity"), "parser unmatched activity is flagged");

  const pending = model.planStructuredVisualBrief({
    lessonId: LESSON_ID,
    instruction: "No such activity\nActivity image.\nRealistic daycare setup.\nOne bright scarf.",
    activityName: "No such activity",
    assetType: "ACTIVITY_IMAGE",
    visualStyle: "REALISTIC_CLASSROOM",
    activities: seedActivities(),
    allowPendingActivity: true,
  });
  ok(pending.status === "READY_FOR_REVIEW", "pending unmatched activity is READY_FOR_REVIEW");
  ok(pending.activityLinkStatus === "pending", "pending link status marked clearly");
  ok(!pending.activityId, "pending activity does not invent an activity id");
  ok(!pending.reviewFlags.includes("unmatched_activity"), "pending path does not keep unmatched_activity flag");

  const colorsPlan = require("./lib/visual-production-colors-all-around-us-plan.js");
  const overlay = require("../server/visual-production-printable-overlay.js");
  const planned = colorsPlan.buildColorsAllAroundUsStructuredBriefs({ activities: [] });
  ok(planned.lessonId === "cur-lp-infant-colors-all-around-us", "colors plan uses stable lesson id");
  ok(planned.printablePackId === "vpp-infant-colors-all-around-us", "colors pack id is stable");
  ok(planned.packTitle === "Colors All Around Us Infant Visual & Keepsake Pack", "colors pack title is exact");
  ok(planned.structuredBriefs.length === 21, "15 activity + 6 printable briefs");
  const activityRows = planned.structuredBriefs.filter((row) => row.assetType === "ACTIVITY_IMAGE");
  const pageRows = planned.structuredBriefs.filter((row) => row.printablePackId);
  ok(activityRows.length === 15, "15 activity briefs");
  ok(pageRows.length === 6, "6 printable pack pages");
  ok(activityRows.map((row) => row.activityName).join("|") === colorsPlan.EXPECTED_ACTIVITY_NAMES.join("|"), "activity briefs follow exact new names, not kit ordinals");
  ok(pageRows.map((row) => row.pageTitle).join("|") === colorsPlan.PAGE_TITLES.join("|"), "printable page titles stay in owner order");
  ok(activityRows.every((row) => !row.activityId), "no invented activity ids when catalog is empty");
  ok(pageRows[5].assetType === "HANDPRINT_FOOTPRINT_TEMPLATE", "keepsake page is a footprint template");
  ok(pageRows[5].textOverlayRequirements.some((line) => /Name:/i.test(line)) && pageRows[5].textOverlayRequirements.some((line) => /Date:/i.test(line)), "footprint overlay keeps Name/Date");
  ok(pageRows[4].textOverlayRequirements.some((line) => /Red, red, red so bright/i.test(line)), "song page overlay keeps Rainbow Scarf Song lyrics");
  ok(pageRows[2].textOverlayRequirements.join("|") === "RED|YELLOW|BLUE|GREEN", "tummy-time labels are exact color names");
  ok(!pageRows[1].textOverlayRequirements.length, "black/white/bright cards have no extra text overlay");
  ok(!pageRows[3].textOverlayRequirements.length, "favorite color look cards have no text overlay");

  const linked = colorsPlan.buildColorsAllAroundUsStructuredBriefs({
    activities: [
      { id: "cur-act-gallery", itemId: "item-gallery", title: "Color Tummy-Time Gallery" },
      { id: "cur-act-colors-scarf", title: "Rainbow Scarf Tracking" },
    ],
  });
  const linkedScarf = linked.structuredBriefs.find((row) => row.activityName === "Rainbow Scarf Tracking");
  const linkedGallery = linked.structuredBriefs.find((row) => row.activityName === "Color Tummy-Time Gallery");
  ok(linkedScarf.activityId === "cur-act-colors-scarf", "relink uses exact Rainbow Scarf Tracking name, not position 0");
  ok(linkedGallery.activityId === "cur-act-gallery", "relink uses exact Color Tummy-Time Gallery name even when it is not first");
  ok(!linked.ambiguousMatches.length, "unique exact names are not ambiguous");

  const ambiguous = colorsPlan.buildColorsAllAroundUsStructuredBriefs({
    activities: [
      { id: "cur-act-a", title: "Rainbow Scarf Tracking" },
      { id: "cur-act-b", title: "Rainbow Scarf Tracking" },
    ],
  });
  ok(ambiguous.ambiguousMatches.some((item) => item.activityName === "Rainbow Scarf Tracking"), "duplicate exact names stop relink");
  ok(!ambiguous.structuredBriefs.find((row) => row.activityName === "Rainbow Scarf Tracking").activityId, "ambiguous name does not pick an id by position");

  const scarf = model.planStructuredVisualBrief({
    ...activityRows[0],
    lessonId: planned.lessonId,
    activities: [{ id: "cur-act-colors-scarf", title: "Rainbow Scarf Tracking" }],
    allowPendingActivity: true,
  });
  ok(scarf.activityId === "cur-act-colors-scarf" && scarf.activityLinkStatus === "linked", "unique title match links without inventing ids");
  ok(scarf.status === "READY_FOR_REVIEW", "linked colors activity is READY_FOR_REVIEW");
  ok(scarf.originalInstruction.includes("An adult safely holds one bright scarf"), "activity originalInstruction keeps owner image brief");

  const cover = model.planStructuredVisualBrief({
    ...pageRows[0],
    lessonId: planned.lessonId,
    activities: [{ id: "cur-act-colors-scarf", title: "Rainbow Scarf Tracking" }],
  });
  ok(cover.printablePackId === planned.printablePackId && cover.pageNumber === 1, "cover brief keeps pack fields");
  ok(cover.status === "READY_FOR_REVIEW", "printable cover is READY_FOR_REVIEW");
  ok(/POST-GENERATION TEXT OVERLAY/i.test(cover.generationPrompt), "cover prompt preserves overlay text as post-generation");
  ok(!/require:.*littlelearnershubbyleah\.com/i.test(cover.generationPrompt), "printable prompt does not ask the model to draw the URL");

  const tummySvg = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[2]);
  ok(tummySvg.kind === "tummyTimeLabels", "tummy-time overlay kind is selected by page title");
  ok(tummySvg.exactLines.join("|") === "RED|YELLOW|BLUE|GREEN", "tummy-time overlay spells RED YELLOW BLUE GREEN");
  ok(!tummySvg.svg.toString("utf8").includes("littlelearnershubbyleah.com"), "printable overlay does not duplicate the brand footer");
  const songSvg = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[4]);
  ok(songSvg.exactLines.includes("Rainbow Scarf Song"), "song overlay includes exact title");
  ok(songSvg.exactLines.includes("Red, red, red so bright"), "song overlay includes exact lyrics");
  ok(songSvg.exactLines.includes("Are your eyes following it?"), "song overlay includes exact teacher prompt");
  const coverSvg = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[0]);
  ok(coverSvg.exactLines.includes("Colors All Around Us") && coverSvg.exactLines.includes("Infant Visual & Keepsake Pack"), "cover overlay uses exact pack titles");
  const footSvg = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[5]);
  ok(footSvg.exactLines.includes("My Color Footprint") && footSvg.exactLines.includes("Name: __________"), "footprint overlay uses exact Name/Date lines");
}

function assertCommunityHelpersPlanContract() {
  const chPlan = require("./lib/visual-production-community-helpers-busy-little-town-plan.js");
  const overlay = require("../server/visual-production-printable-overlay.js");
  const chOverlay = require("../server/visual-production-community-helpers-overlay.js");
  const planned = chPlan.buildCommunityHelpersBusyLittleTownStructuredBriefs({ activities: [] });
  ok(planned.lessonId === chPlan.LESSON_ID, "community helpers plan uses exact lesson id");
  ok(planned.packTitle === "Community Helpers: Our Busy Little Town Printable Pack", "community helpers pack title is exact");
  ok(chPlan.EXPECTED_ACTIVITY_NAMES.length === 17, "community helpers lesson has 17 expected activities");
  ok(new Set(chPlan.EXPECTED_ACTIVITY_NAMES).size === 17, "community helpers activity names are unique");
  ok(chPlan.PAGE_TITLES.length === 24, "community helpers pack has 24 pages");
  ok(new Set(chPlan.PAGE_TITLES).size === 24, "community helpers page titles are unique");
  const activityRows = planned.structuredBriefs.filter((row) => row.assetType === "ACTIVITY_IMAGE");
  const pageRows = planned.structuredBriefs.filter((row) => row.printablePackId);
  ok(activityRows.length === 8, "8 useful community helpers activity images, not every activity");
  ok(pageRows.length === 24, "24 printable pack pages");
  ok(planned.structuredBriefs.length === 32, "8 activity + 24 printable briefs");
  ok(activityRows.map((row) => row.activityName).join("|") === [
    "Build Our Little Town",
    "Post Office Delivery Route",
    "Firefighter Rescue the Numbers",
    "Doctor Teddy Check-Up Clinic",
    "Construction Blueprint Challenge",
    "Recycling Truck Sorting Station",
    "Little Community Café",
    "When I Grow Up Collaborative Mural",
  ].join("|"), "generated activity images follow exact names, not weekday order");
  ok(chPlan.ACTIVITY_IMAGE_PLAN["Who Should We Call"].classification === "NO_IMAGE_NEEDED", "Who Should We Call uses the printable, not a filler photo");
  ok(chPlan.ACTIVITY_IMAGE_PLAN["When I Grow Up Collaborative Mural"].field === "exampleImageUrl", "mural attaches as finished example");
  ok(chPlan.ACTIVITY_IMAGE_PLAN["Little Community Café"].field === "setupImageUrl", "cafe attaches as setup image");
  ok(!chOverlay.HELPER_NAMES.includes("Police Officer"), "tool matching omits police because the lesson has no police activity");
  ok(pageRows[0].pageNumber === 1 && pageRows[23].pageNumber === 24, "page numbers are 1 through 24");
  ok(pageRows.map((row) => row.pageTitle).join("|") === chPlan.PAGE_TITLES.join("|"), "printable page titles stay in planned order");
  ok(overlay.overlayKindForBrief({ pageTitle: "Cover" }) === "cover", "colors cover overlay kind is unchanged");
  ok(overlay.overlayKindForBrief({ pageTitle: "Who Should We Call? Situation Cards (1 of 4)" }) === "communityHelpers", "situation cards use community helpers overlay");
  ok(overlay.overlayKindForBrief({
    activityName: "When I Grow Up Collaborative Mural",
    assetType: "ACTIVITY_IMAGE",
  }) === "communityHelpers", "mural photo gets a deterministic heading overlay");
  const sitSvg = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[0]);
  ok(sitSvg.kind === "communityHelpers", "situation overlay kind is communityHelpers");
  ok(sitSvg.exactLines.includes("Someone feels sick") && sitSvg.exactLines.includes("A pet needs a checkup"), "situation overlay uses exact calm labels");
  ok(!sitSvg.svg.toString("utf8").includes("littlelearnershubbyleah.com"), "community helpers overlay does not duplicate the brand footer");
  const portrait = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[19]);
  ok(portrait.exactLines.includes("When I Grow Up...") && portrait.exactLines.includes("I want to be a __________.") && portrait.exactLines.includes("Because __________."), "portrait overlay uses exact keepsake lines");
  const order = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[16]);
  ok(order.exactLines.includes("My Order") && order.exactLines.includes("sandwich"), "cafe order overlay uses exact My Order text");
  const badges = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[11]);
  ok(badges.exactLines.includes("Firefighter") && badges.exactLines.includes("Builder"), "badge overlay uses exact helper names");
  const mail = overlay.buildPrintableOverlaySvg(1024, 1536, pageRows[13]);
  ok(mail.exactLines.filter((line) => line === "Name: __________").length === 4, "mail name cards overlay four blank Name lines");
  ok(mail.exactLines.includes("Mailbox") && mail.exactLines.includes("Classroom Mail"), "mail page overlay uses Mailbox and Classroom Mail");
  ok(pageRows.every((row) => Array.isArray(row.textOverlayRequirements) && row.textOverlayRequirements.length), "every pack page has deterministic overlay copy");
  ok(pageRows.every((row) => !/littlelearnershubbyleah\.com/i.test(row.originalInstruction)), "printable prompts do not ask the model to draw the website");

  const linked = chPlan.buildCommunityHelpersBusyLittleTownStructuredBriefs({
    activities: [
      { id: "cur-act-cafe", itemId: "item-cafe", title: "Little Community Café" },
      { id: "cur-act-town", title: "Build Our Little Town" },
    ],
  });
  const linkedCafe = linked.structuredBriefs.find((row) => row.activityName === "Little Community Café");
  const linkedTown = linked.structuredBriefs.find((row) => row.activityName === "Build Our Little Town");
  ok(linkedCafe.activityId === "cur-act-cafe", "relink uses exact Little Community Café name, not Friday slot");
  ok(linkedTown.activityId === "cur-act-town", "relink uses exact Build Our Little Town name even when it is not first");
  ok(!linked.ambiguousMatches.length, "unique exact names are not ambiguous");

  const ambiguous = chPlan.buildCommunityHelpersBusyLittleTownStructuredBriefs({
    activities: [
      { id: "cur-act-a", title: "Little Community Café" },
      { id: "cur-act-b", title: "Little Community Café" },
    ],
  });
  ok(ambiguous.ambiguousMatches.some((item) => item.activityName === "Little Community Café"), "duplicate exact names stop relink");
  ok(!ambiguous.structuredBriefs.find((row) => row.activityName === "Little Community Café").activityId, "ambiguous name does not pick an id by position");
}

async function main() {
  console.log("Visual production brief tests");
  assertParserContract();
  assertStaticContract();
  assertPackAndColorsPlanContract();
  assertCommunityHelpersPlanContract();
  process.env.VISUAL_PRODUCTION_MOCK_GENERATE = "1";
  await assertImageProviderContract();

  const lesson = seedLesson();
  const activities = seedActivities();
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { playBasedCurriculum: true },
      curriculum: {
        lessonPlans: [lesson, {
          id: "cur-lp-infant-colors-all-around-us",
          title: "Colors All Around Us",
          age: "Infant 0–6 Months",
          theme: "Colors",
          plan: "Free",
          status: "published",
          coverImageUrl: COVER_URL,
          resourceIds: [RESOURCE_ID],
          dailyPlans: {
            monday: { items: [] },
            tuesday: { items: [] },
            wednesday: { items: [] },
            thursday: { items: [] },
            friday: { items: [] },
          },
        }, {
          id: require("./lib/visual-production-community-helpers-busy-little-town-plan.js").LESSON_ID,
          title: "Community Helpers: Our Busy Little Town",
          age: "Preschool 3–4 Years",
          theme: "",
          plan: "Free",
          status: "published",
          coverImageUrl: COVER_URL,
          resourceIds: [RESOURCE_ID],
          dailyPlans: {
            monday: { items: [] },
            tuesday: { items: [] },
            wednesday: { items: [] },
            thursday: { items: [] },
            friday: { items: [] },
          },
        }],
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
      OPENAI_API_KEY: "sk-test-visual-production-local",
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      VISUAL_PRODUCTION_MOCK_GENERATE: "1",
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

    const generated = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "generate",
      id: farmCard.id,
      confirmGenerate: true,
    }, ownerAuth);
    ok(generated.status === 200, "mock generate succeeds for one approved brief");
    ok(generated.json.generated === true && generated.json.attached === false, "generate returns preview only");
    ok(generated.json.card.status === "GENERATED", "approved brief moves to GENERATED after mock generation");
    ok(Boolean(generated.json.previewUrl), "preview URL returned");
    ok(Boolean(generated.json.previewMediaAssetId), "preview media asset id returned");
    ok(generated.json.card.canAttach === false, "attach remains blocked after generation");
    ok(generated.json.lessonAssetsUnchanged === true, "successful generate leaves lesson assets unchanged");

    const previewRes = await requestJson(
      "GET",
      `${generated.json.previewUrl}?adminToken=${encodeURIComponent(ownerLogin.json.token || ownerLogin.json.adminToken)}`,
    );
    ok(previewRes.status === 200, "owner can fetch generated preview bytes");
    ok((previewRes.text || "").length > 0, "preview response has body");

    const regenerate = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "generate",
      id: farmCard.id,
      confirmGenerate: true,
    }, ownerAuth);
    ok(regenerate.status === 409, "only APPROVED briefs can generate; GENERATED brief is blocked");

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
    const generatedBrief = (storeAfter.visualProduction?.briefs || []).find((item) => item.id === farmCard.id);
    ok(generatedBrief?.status === "GENERATED", "generated brief metadata stored in isolated collection");
    ok(Boolean(generatedBrief?.generatedPreviewUrl), "preview metadata stored on brief only");
    ok(!generatedBrief?.setupImageUrl, "preview metadata does not mutate lesson image fields");

    const listed = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "list",
      lessonId: LESSON_ID,
    }, ownerAuth);
    ok(listed.status === 200 && listed.json.cards.length === 2, "list returns planned cards");

    const colorsPlan = require("./lib/visual-production-colors-all-around-us-plan.js");
    const colorsPayload = colorsPlan.buildColorsAllAroundUsStructuredBriefs({ activities: [] });
    const colorsPlanned = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "plan",
      lessonId: colorsPlan.LESSON_ID,
      structuredBriefs: colorsPayload.structuredBriefs,
    }, ownerAuth);
    ok(colorsPlanned.status === 200, "colors structured plan succeeds");
    ok(colorsPlanned.json.generationStarted === false && colorsPlanned.json.attached === false, "colors plan does not generate or attach");
    ok(colorsPlanned.json.lessonAssetsUnchanged === true, "colors plan leaves lesson assets unchanged");
    ok(Array.isArray(colorsPlanned.json.cards) && colorsPlanned.json.cards.length === 21, "colors plan persists 21 briefs");
    ok(colorsPlanned.json.cards.every((card) => card.status === "READY_FOR_REVIEW"), "all colors briefs are READY_FOR_REVIEW");
    const colorsActivityCards = colorsPlanned.json.cards.filter((card) => card.assetType === "ACTIVITY_IMAGE");
    const colorsPageCards = colorsPlanned.json.cards.filter((card) => card.printablePackId);
    ok(colorsActivityCards.length === 15, "15 colors activity cards stored");
    ok(colorsPageCards.length === 6, "6 colors pack pages stored");
    ok(colorsActivityCards.every((card) => card.activityLinkStatus === "pending" && !card.activityId), "colors activities stay pending without invented ids");
    ok(colorsPageCards.every((card) => card.printablePackId === colorsPlan.PACK_ID), "pack pages share printablePackId");
    ok(colorsPageCards.map((card) => card.pageTitle).join("|") === colorsPlan.PAGE_TITLES.join("|"), "pack page order is preserved in API cards");

    const storeColors = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const colorsLesson = (storeColors.siteContent.curriculum.lessonPlans || []).find((item) => item.id === colorsPlan.LESSON_ID);
    const colorsBriefs = (storeColors.visualProduction?.briefs || []).filter((item) => item.lessonId === colorsPlan.LESSON_ID);
    ok(colorsLesson.plan === "Free" && colorsLesson.status === "published", "colors Free/Pro and publish state unchanged");
    ok(JSON.stringify(colorsLesson.resourceIds) === JSON.stringify([RESOURCE_ID]), "colors existing printables unchanged");
    ok(colorsLesson.coverImageUrl === COVER_URL, "colors cover unchanged");
    ok(!colorsLesson.visualProduction, "colors briefs are not written onto the lesson plan");
    ok(colorsBriefs.length === 21, "colors briefs live in store.visualProduction.briefs");
    ok(colorsBriefs.every((item) => item.status === "READY_FOR_REVIEW"), "stored colors briefs stay READY_FOR_REVIEW");
    ok(colorsBriefs.every((item) => !item.generatedPreviewUrl && item.status !== "GENERATED"), "nothing generated for colors");
    const storedPages = colorsBriefs.filter((item) => item.printablePackId).sort((a, b) => a.pageNumber - b.pageNumber);
    ok(storedPages[0].pageTitle === "Cover" && storedPages[5].pageTitle === "My Color Footprint Keepsake", "stored pack page titles survive normalize");
    ok(storedPages.every((item) => item.packTitle === colorsPlan.PACK_TITLE), "stored pack title survives normalize");

    const chPlan = require("./lib/visual-production-community-helpers-busy-little-town-plan.js");
    const chPayload = chPlan.buildCommunityHelpersBusyLittleTownStructuredBriefs({ activities: [] });
    const chPlanned = await requestJson("POST", "/api/admin/curriculum/visual-production", {
      action: "plan",
      lessonId: chPlan.LESSON_ID,
      structuredBriefs: chPayload.structuredBriefs,
    }, ownerAuth);
    ok(chPlanned.status === 200, "community helpers structured plan succeeds");
    ok(chPlanned.json.generationStarted === false && chPlanned.json.attached === false, "community helpers plan does not generate or attach");
    ok(chPlanned.json.lessonAssetsUnchanged === true, "community helpers plan leaves lesson assets unchanged");
    ok(Array.isArray(chPlanned.json.cards) && chPlanned.json.cards.length === 32, "community helpers plan persists 32 briefs");
    ok(chPlanned.json.cards.every((card) => card.status === "READY_FOR_REVIEW"), "all community helpers briefs are READY_FOR_REVIEW");
    const storeCh = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const chLesson = (storeCh.siteContent.curriculum.lessonPlans || []).find((item) => item.id === chPlan.LESSON_ID);
    ok(chLesson.plan === "Free" && chLesson.status === "published", "community helpers Free/Pro and publish state unchanged");
    ok(JSON.stringify(chLesson.resourceIds) === JSON.stringify([RESOURCE_ID]), "community helpers existing printables unchanged");
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
