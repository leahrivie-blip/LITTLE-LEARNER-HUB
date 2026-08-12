#!/usr/bin/env node
/**
 * Owner Draft Review Queue — complete disposable-fixture workflow.
 * Rich Mon–Fri kit + multi-page printable + publish → customer access → rollback.
 * Desktop + mobile screenshots. Never touches Farm Animals / customer flags permanently.
 *
 * Run: npm run test:draft-review-owner-workflow
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = path.join(__dirname, "..");
const PORT = 6700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-draft-review-workflow-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/draft-review-owner-workflow";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "draft-review-owner-pass",
  code: "draft-review-owner-code",
};
const OTHER = {
  email: "other-admin@example.com",
  password: "draft-review-owner-pass",
  code: "draft-review-owner-code",
};
const FIXTURE_ID = `cur-lp-disposable-draft-review-${crypto.randomBytes(4).toString("hex")}`;
const FARM_ID = "cur-lp-preschool-farm-animals";
const PUBLISH_PHRASE = "PUBLISH TEACHING KIT";
const LEGACY_TITLE = "OLD Disposable Sorting Cards";
const RESOURCE_ID = () => `cur-res-draft-${FIXTURE_ID}`;

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
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 45000) {
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

async function makeMultiPagePdfDataUrl(pages = 4) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText("Little Learner Hub", { x: 72, y: 720, size: 18, font, color: rgb(0.12, 0.22, 0.42) });
    page.drawText("littlelearnershubbyleah.com", { x: 72, y: 690, size: 12, font });
    page.drawText(`Disposable page ${i + 1} — cut lines — margins — labels`, {
      x: 72,
      y: 420,
      size: 14,
      font,
    });
    page.drawRectangle({
      x: 36,
      y: 36,
      width: 540,
      height: 720,
      borderColor: rgb(0.65, 0.65, 0.65),
      borderWidth: 1,
    });
  }
  const bytes = await doc.save();
  return {
    dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`,
    pageCount: pages,
    bytes: Buffer.from(bytes),
  };
}

function corruptPdfDataUrl() {
  return `data:application/pdf;base64,${Buffer.from("not-a-real-pdf").toString("base64")}`;
}

function completeBook() {
  return {
    title: "Color Farm",
    author: "Lois Ehlert",
    whyThisBook: "Matches the disposable theme and invites talk about animals and colors.",
    beforeReadingQuestions: ["What colors do you see on the cover?"],
    duringReadingPrompts: ["Point to a farm animal you know."],
    afterReadingQuestions: ["Which animal would you visit first?"],
  };
}

function completeSong() {
  return {
    title: "Old MacDonald Had a Farm",
    rightsStatus: "traditional",
    motions: "Tap knees for each animal sound.",
    teacherDirections: "Sing slowly and invite children to join the animal sounds.",
  };
}

function completeToolkit() {
  return {
    teacherPreparation: "Stage trays before arrival and preview tongs with peers.",
    mixedAgeAdaptations: "Toddlers sort two colors; older peers lead naming games.",
    extraSupportAdaptations: "Offer hand-over-hand for tongs as needed during play.",
    challengeExtensions: "Invite children to invent a new sorting rule together.",
    safetyInclusionNotes: "Keep small pieces out of mouths; supervise tongs closely.",
    endOfWeekReflection: "Which animal words showed up most during free play?",
    familyConnection: "Ask families which farm animals children talk about at home.",
    teacherTips: ["Model one sort, then step back."],
    setupCleanupShortcuts: ["Bins on low shelf", "Tongs in caddy"],
    observationFocus: ["Uses animal words", "Takes turns"],
    documentationPrompts: ["Photo of child sorting with a peer"],
    materialSubstitutions: [{ need: "hay", use: "shredded paper" }],
  };
}

function dayThemes() {
  return {
    monday: "Sort warm colors",
    tuesday: "Sort cool colors",
    wednesday: "Mix and match animals",
    thursday: "Peer sorting games",
    friday: "Family color share",
  };
}

function disposablePlan() {
  const themes = dayThemes();
  const days = {};
  const legacyItem = {
    itemId: `${FIXTURE_ID}-legacy-1`,
    title: LEGACY_TITLE,
    objective: "Legacy activity that must be removed from the proposed customer version.",
    description: "Old printable-dependent sort that is being replaced.",
    materials: "old cards",
    setup: "Remove from tables.",
    steps: "Do not use.",
    imageRequirement: "not_needed",
  };
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const items = [1, 2, 3].map((n) => ({
      itemId: `${FIXTURE_ID}-${day}-${n}`,
      title: `Disposable ${day} activity ${n}`,
      objective: "Practice a play-based skill with peers.",
      description: "Open-ended classroom invitation with sensory and story language.",
      materials: "paper, crayons, baskets, trays",
      setup: "Set materials on a low table near the rug.",
      steps: "1. Invite children.\n2. Narrate gently.\n3. Clean up together.",
      imageRequirement: day === "monday" && n === 1 ? "required" : "not_needed",
      category: n === 1 ? "table" : (n === 2 ? "movement" : "story"),
    }));
    if (day === "monday") items.push(legacyItem);
    days[day] = {
      theme: themes[day],
      objectives: "Explore colors and animals through play invitations.",
      materials: "paper, crayons, basket, cups, spoons, cloth, tongs, trays",
      items,
    };
  });
  return {
    id: FIXTURE_ID,
    title: "ZZ Disposable Draft Review Workflow Kit",
    age: "Preschool",
    theme: "Workflow QA",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Disposable fixture week for owner Draft Review workflow QA with full Teaching Kit depth.",
    objectives: "Explore colors and animals through play invitations and peer talk each day.",
    weeklyMaterials: "paper\ncrayons\nbasket\ncups\nspoons\ncloth\nblocks\nbooks\ntongs\ntrays",
    vocabularyWords: "sort, tray, color, animal, gentle, share",
    familyConnection: "Ask families what song they enjoy singing together this week.",
    books: [completeBook()],
    songs: [completeSong()],
    resourceIds: [],
    dailyPlans: days,
    disposableQaFixture: true,
    adminOnly: true,
    excludeFromCustomerLibrary: true,
    qaDisposable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
}

function proposedDailyPlans(plan) {
  const proposed = JSON.parse(JSON.stringify(plan.dailyPlans));
  Object.keys(proposed).forEach((day) => {
    proposed[day].items = (proposed[day].items || []).filter((item) => item.title !== LEGACY_TITLE);
  });
  return proposed;
}

function enrichmentFor(plan, resourceId) {
  const proposed = proposedDailyPlans(plan);
  const activities = {};
  Object.keys(proposed).forEach((day) => {
    (proposed[day].items || []).forEach((item) => {
      const key = `${plan.id}:${item.itemId}`;
      const required = item.imageRequirement === "required";
      activities[key] = {
        imageRequirement: item.imageRequirement || "not_needed",
        teacherTips: ["Stay nearby and narrate gently while children explore."],
        substitutions: ["Use recycled paper if needed."],
        observationPrompts: ["Notice how the child starts and whether they invite a peer."],
        materials: item.materials,
        setup: item.setup,
        steps: item.steps,
        adaptations: "Offer larger crayons for beginners who need more success.",
        extensions: "Add a third sorting rule for older peers to lead.",
        indoorAlternatives: "Table sort if weather blocks outdoor time today.",
        outdoorAlternatives: "Take the sort mats outdoors onto the patio.",
        vocabulary: ["sort", "tray", "color", "animal"],
        settingTags: ["indoor", "small_group"],
        ...(required ? {
          setupImageUrl: "/api/enrichment-media/disposable-setup.png",
          exampleImageUrl: "/api/enrichment-media/disposable-example.png",
          setupImageAlt: "Trays ready on a low table",
          exampleImageAlt: "Child sorting scarves into baskets",
        } : {}),
      };
    });
  });
  const keptTitles = Object.values(proposed).flatMap((d) => (d.items || []).map((i) => i.title));
  return {
    activities,
    week: {
      weeklyOverview: plan.weeklyOverview,
      objectives: plan.objectives,
      weeklyMaterials: "baskets, brushes, tongs, trays, mats, cups, scarves, crayons, paper, cloth",
      familyConnection: plan.familyConnection,
      teacherPreparation: completeToolkit().teacherPreparation,
      proposedDailyPlans: proposed,
      activityDecisions: [
        ...keptTitles.map((title) => ({ title, decision: "rewrite", note: "Disposable fixture rewrite" })),
        { title: LEGACY_TITLE, decision: "remove", note: "Replaced by refreshed sorting invitation" },
        {
          title: "Disposable monday activity 1",
          decision: "replace",
          note: "Replaces OLD Disposable Sorting Cards",
          replaces: LEGACY_TITLE,
        },
      ],
      removedActivityTitles: [LEGACY_TITLE],
      songs: [completeSong()],
      books: [completeBook()],
      teacherToolkit: completeToolkit(),
      printableIds: [resourceId],
    },
    updatedAt: new Date().toISOString(),
    lastEditedBy: OWNER.email,
  };
}

async function recordAllPages(ownerAuth, draftId, resourceId, pageCount) {
  const pagesViewed = Array.from({ length: pageCount }, (_, i) => i + 1);
  return requestJson("POST", "/api/admin/curriculum/draft-review", {
    action: "record-printable-pages",
    id: draftId,
    resourceId,
    pageCount,
    pagesViewed,
    checklist: {
      branding: true,
      website: true,
      cutLines: true,
      margins: true,
      labels: true,
      illustrations: true,
    },
  }, ownerAuth);
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const farm = {
    id: FARM_ID,
    title: "Farm Animals",
    age: "Preschool",
    theme: "Farm Animals",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Farm week stays untouched.",
    dailyPlans: {
      monday: { theme: "Barn", items: [{ itemId: "farm-1", title: "Barn Visit" }] },
      tuesday: { theme: "Barn", items: [] },
      wednesday: { theme: "Barn", items: [] },
      thursday: { theme: "Barn", items: [] },
      friday: { theme: "Barn", items: [] },
    },
    resourceIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
  const plan = disposablePlan();
  const resourceId = RESOURCE_ID();
  const pdf = await makeMultiPagePdfDataUrl(4);
  const longPdf = await makeMultiPagePdfDataUrl(12);
  const featureFlagsBefore = {
    teachingKitEnrichmentEditor: false,
    teachingKitViewer: false,
    teachingKitPrintCenter: false,
    teachingKitAttachments: false,
    teachingKitQualityReview: true,
    playBasedCurriculum: true,
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { ...featureFlagsBefore },
      curriculum: {
        lessonPlans: [plan, farm],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      curriculumDraftReviews: [],
      updatedAt: new Date().toISOString(),
    },
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

  const report = { passed: 0, steps: [], auth: {}, screenshots: [], risks: [], counts: {} };

  try {
    await waitForHealth(child);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    ok(ownerLogin.status === 200, "owner login");
    const ownerToken = ownerLogin.json.token || ownerLogin.json.adminToken;
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const loggedOut = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "owner",
    });
    ok(loggedOut.status === 401, "logged out denied");
    report.auth.loggedOut = loggedOut.status;

    const otherLogin = await requestJson("POST", "/api/admin/login", OTHER);
    const otherAuth = { Authorization: `Bearer ${otherLogin.json.token || otherLogin.json.adminToken}` };
    const otherDenied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "owner",
    }, otherAuth);
    ok(otherDenied.status === 403, "other admin denied");
    report.auth.otherAdmin = otherDenied.status;

    let stampRes = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    let stamp = stampRes.json.siteContent?.updatedAt;
    const farmBefore = JSON.stringify(stampRes.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FARM_ID));
    const flagsBefore = { ...stampRes.json.siteContent.featureFlags };

    const enrichmentDraft = enrichmentFor(plan, resourceId);
    const submit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: FIXTURE_ID,
      title: plan.title,
      age: plan.age,
      theme: plan.theme,
      batchName: "Disposable owner workflow",
      source: "cursor-agent",
      enrichmentDraft,
      printables: [{
        id: resourceId,
        title: "Disposable Picture Cards",
        fileName: "disposable-cards.pdf",
        fileData: pdf.dataUrl,
        pageCount: pdf.pageCount,
        printingInstructions: "Print US Letter. Cut on solid lines. Keep branding and website visible.",
      }],
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(submit.status === 200 && submit.json.ok === true, "submit disposable draft");
    stamp = submit.json.siteContentUpdatedAt || stamp;
    const draftId = submit.json.detail?.id || submit.json.entry?.id;
    ok(Boolean(draftId), "queue item id returned");
    report.steps.push("submit");

    const list = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "list" }, ownerAuth);
    ok(list.json.items.length === 1, "exactly one queue item");
    ok(list.json.items[0].id === draftId, "no duplicate queue items");
    ok(Number(list.json.items[0].activityCount) === 15, "canonical activity count 15 (legacy removed)");
    ok(Number(list.json.items[0].activitiesRemoved) >= 1, "queue shows removed activity");
    ok(Number(list.json.items[0].printablePages) === 4, "queue printable page count 4");
    report.counts.queueActivities = list.json.items[0].activityCount;
    report.counts.queuePages = list.json.items[0].printablePages;

    const get = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "get", id: draftId }, ownerAuth);
    ok(get.status === 200 && get.json.activityCount === 15, "get reports same activity count");
    ok((get.json.revisionHistory || []).some((h) => h.newest), "revision history identifies newest");
    ok(get.json.publishReady !== true, "blocked/draft printable lesson is not Publish Ready");

    ok(flagsBefore.teachingKitEnrichmentEditor === false, "enrichment editor flag remains false before UI");

    const preview = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "preview", id: draftId }, ownerAuth);
    ok(preview.status === 200 && preview.json.preview?.title, "preview ok");
    ok((preview.json.preview.activities || []).length === 15, "preview activity count matches queue");
    ok(!(preview.json.preview.activities || []).some((a) => a.title === LEGACY_TITLE), "removed legacy activity absent from preview");
    ok(preview.json.preview.teacherToolkit, "preview includes Teacher Toolkit");
    ok((preview.json.preview.songs || []).length === 1, "preview includes song");
    ok((preview.json.preview.books || []).length === 1, "preview includes book");
    report.steps.push("preview");

    const printableReview = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "printable-review", id: draftId }, ownerAuth);
    ok(printableReview.status === 200 && printableReview.json.printables.length >= 1, "printable review ok");
    ok(printableReview.json.reviewMode === "every_page_thumbnail", "printable review uses every-page mode");
    ok(Number(printableReview.json.printables[0].pageCount) === 4, "printable review page count 4");
    const publicFile = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    ok(publicFile.status === 404, "customer denied draft PDF");
    const ownerFile = await requestJson("GET", `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, null, ownerAuth);
    ok(ownerFile.status === 200, "owner can open draft PDF");
    report.steps.push("printable-review");

    const approveTooSoon = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve-printable",
      id: draftId,
      resourceId,
      expectedUpdatedAt: stamp,
      reviewNotes: "Opened file only",
    }, ownerAuth);
    ok(approveTooSoon.status === 400 && approveTooSoon.json.code === "pages_not_reviewed", "approve blocked until every page inspected");

    const recorded = await recordAllPages(ownerAuth, draftId, resourceId, 4);
    ok(recorded.status === 200 && recorded.json.entry.resourceApprovals[resourceId].pagesComplete === true, "page inspection recorded");

    // Corrupt replace then recover with multi-page PDF — lesson draft preserved.
    stamp = (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent.updatedAt;
    const badReplace = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "replace-printable",
      id: draftId,
      resourceId,
      fileData: corruptPdfDataUrl(),
      fileName: "corrupt.pdf",
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(badReplace.status === 400, "corrupt PDF replace rejected");

    stamp = (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent.updatedAt;
    const longReplace = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "replace-printable",
      id: draftId,
      resourceId,
      fileData: longPdf.dataUrl,
      fileName: "disposable-long.pdf",
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(longReplace.status === 200 && longReplace.json.lessonDraftPreserved === true, "replace long PDF keeps lesson draft");
    ok(Number(longReplace.json.pageCount) === 12, "long PDF page count 12");
    stamp = longReplace.json.siteContentUpdatedAt || stamp;
    const draftStill = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "get", id: draftId }, ownerAuth);
    ok(modelEnrichmentStillPresent(draftStill.json.entry || draftStill.json.detail), "enrichment draft still present after PDF replace");
    report.steps.push("replace-printable");

    // Restore to 4-page branded PDF for publish path.
    const restorePdf = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "replace-printable",
      id: draftId,
      resourceId,
      fileData: pdf.dataUrl,
      fileName: "disposable-cards.pdf",
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(restorePdf.status === 200, "restore 4-page PDF");
    stamp = restorePdf.json.siteContentUpdatedAt || stamp;
    await recordAllPages(ownerAuth, draftId, resourceId, 4);

    const imageReview = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "image-review", id: draftId }, ownerAuth);
    ok(imageReview.status === 200, "image review ok");
    ok((imageReview.json.images || []).some((img) => /example|setup/i.test(img.purpose || img.group || "")), "required example/setup image listed");
    report.steps.push("image-review");

    const compare = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "compare", id: draftId }, ownerAuth);
    ok(compare.status === 200 && compare.json.compare?.readable, "compare readable");
    ok((compare.json.compare.readable.removed || []).some((r) => String(r.title || r).includes("OLD Disposable") || String(r.note || "").includes("OLD")), "compare shows removed legacy activity");
    report.steps.push("compare");

    stamp = (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent.updatedAt;
    const revision = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "request-revision",
      id: draftId,
      expectedUpdatedAt: stamp,
      reviewNotes: "Please tighten Monday cleanup language.",
    }, ownerAuth);
    ok(revision.status === 200 && revision.json.entry.status === "revision_requested", "request revision");
    stamp = revision.json.siteContentUpdatedAt || stamp;

    const revisedDraft = JSON.parse(JSON.stringify(enrichmentDraft));
    revisedDraft.week.ownerNote = "revision 2";
    revisedDraft.week.teacherToolkit.endOfWeekReflection = "What felt calm after cleanup language tightened?";
    const reviseSubmit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: FIXTURE_ID,
      title: plan.title,
      age: plan.age,
      theme: plan.theme,
      batchId: list.json.items[0].batchId,
      submissionKey: list.json.items[0].submissionKey,
      enrichmentDraft: revisedDraft,
      expectedUpdatedAt: stamp,
      source: "cursor-agent",
    }, ownerAuth);
    ok(reviseSubmit.status === 200, "revise same queue item");
    ok((await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "list" }, ownerAuth)).json.items.length === 1, "still one queue item after revise");
    stamp = reviseSubmit.json.siteContentUpdatedAt || stamp;
    report.steps.push("revise-same-item");

    // Refresh persistence of page review after revise — re-record pages.
    await recordAllPages(ownerAuth, draftId, resourceId, 4);
    const approvePrintable = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve-printable",
      id: draftId,
      resourceId,
      expectedUpdatedAt: stamp,
      reviewNotes: "All pages inspected; branding and cut lines look good",
    }, ownerAuth);
    ok(approvePrintable.status === 200, "approve printable after page inspection");
    stamp = approvePrintable.json.siteContentUpdatedAt || stamp;

    const cancelPublish = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "publish",
      id: draftId,
      confirmPhrase: "NOPE",
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(cancelPublish.status === 400 && cancelPublish.json.code === "confirm_phrase_required", "publish cancel / bad phrase rejected");

    const approve = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve",
      id: draftId,
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    if (approve.status !== 200) {
      console.error("approve blockers:", JSON.stringify(approve.json?.blockers || approve.json, null, 2));
    }
    ok(approve.status === 200 && approve.json.entry.status === "approved", "approved rich disposable fixture");
    stamp = approve.json.siteContentUpdatedAt || stamp;
    report.steps.push("approve");

    const publish = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "publish",
      id: draftId,
      confirmPhrase: PUBLISH_PHRASE,
      publishPrintables: true,
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(publish.status === 200 && publish.json.entry.status === "published", "publish disposable fixture");
    stamp = publish.json.siteContentUpdatedAt || stamp;
    report.steps.push("publish");

    const afterPublish = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const publishedPlan = afterPublish.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FIXTURE_ID);
    ok(Boolean(publishedPlan.enrichmentPublished), "enrichment published on lesson");
    ok(!publishedPlan.enrichmentDraft, "enrichment draft cleared after publish");
    const pubActs = publishedPlan.enrichmentPublished?.week?.proposedDailyPlans;
    const pubCount = pubActs
      ? ["monday", "tuesday", "wednesday", "thursday", "friday"].reduce((n, d) => n + (pubActs[d]?.items || []).length, 0)
      : Object.keys(publishedPlan.enrichmentPublished?.activities || {}).length;
    ok(pubCount === 15, "published proposed activity count 15");
    const publishedTitles = pubActs
      ? ["monday", "tuesday", "wednesday", "thursday", "friday"].flatMap((d) => (pubActs[d]?.items || []).map((i) => i.title))
      : Object.values(publishedPlan.enrichmentPublished?.activities || {}).map((a) => a.title);
    ok(!publishedTitles.includes(LEGACY_TITLE), "legacy activity removed from published proposed customer activities");
    ok((publishedPlan.enrichmentPublished?.week?.removedActivityTitles || []).includes(LEGACY_TITLE)
      || (publishedPlan.enrichmentPublished?.week?.activityDecisions || []).some((d) => d.decision === "remove" && d.title === LEGACY_TITLE),
    "removal decision retained for audit");
    const pubResource = afterPublish.json.siteContent.curriculum.resources.find((r) => r.id === resourceId);
    ok(pubResource?.status === "published", "printable published with lesson");
    const customerPdf = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    // Draft was 404; published Pro printable is membership-gated (403) rather than missing.
    ok(customerPdf.status === 403 || customerPdf.status === 200, `customer path sees published printable (${customerPdf.status})`);
    ok(customerPdf.status !== 404, "published printable is no longer a draft 404");
    ok((publishedPlan.enrichmentPublished?.activities?.[`${FIXTURE_ID}:${FIXTURE_ID}-monday-1`]?.exampleImageUrl
      || Object.values(publishedPlan.enrichmentPublished?.activities || {}).some((a) => a.exampleImageUrl)), "published example image present");

    // Farm + flags unchanged after publish
    const farmMid = afterPublish.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FARM_ID);
    ok(JSON.stringify(farmMid) === farmBefore, "Farm Animals unchanged after publish");
    ok(afterPublish.json.siteContent.featureFlags.teachingKitViewer === false, "customer viewer flag unchanged after publish");

    stamp = afterPublish.json.siteContent.updatedAt;
    const rollback = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "rollback",
      id: draftId,
      expectedUpdatedAt: stamp,
      reviewNotes: "Rollback disposable publish proof",
    }, ownerAuth);
    ok(rollback.status === 200 && rollback.json.customerRestored === true, "publish rollback restores customer set");
    stamp = rollback.json.siteContentUpdatedAt || stamp;
    report.steps.push("rollback-publish");

    const afterRollback = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const rolledPlan = afterRollback.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FIXTURE_ID);
    ok(!rolledPlan.enrichmentPublished, "enrichmentPublished cleared after rollback (no prior published kit)");
    ok(Boolean(rolledPlan.enrichmentDraft), "enrichment draft restored after publish rollback");
    const rolledResource = afterRollback.json.siteContent.curriculum.resources.find((r) => r.id === resourceId);
    ok(rolledResource?.status === "draft", "printable returned to draft after rollback");
    const customerPdfAfter = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    ok(customerPdfAfter.status === 404, "customer cannot access rolled-back draft PDF");
    ok(JSON.stringify(afterRollback.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FARM_ID)) === farmBefore, "Farm Animals unchanged after rollback");

    // Safe fixture cleanup: archive disposable lesson + draft resource; remove queue item via discard path if needed.
    const cleanupStamp = afterRollback.json.siteContent.updatedAt;
    const archived = await requestJson("POST", "/api/admin/site-content", {
      expectedUpdatedAt: cleanupStamp,
      siteContent: {
        ...afterRollback.json.siteContent,
        curriculum: {
          ...afterRollback.json.siteContent.curriculum,
          lessonPlans: afterRollback.json.siteContent.curriculum.lessonPlans.map((p) => (
            p.id === FIXTURE_ID
              ? { ...p, status: "archived", enrichmentDraft: null, enrichmentPublished: null, resourceIds: [] }
              : p
          )),
          resources: afterRollback.json.siteContent.curriculum.resources.map((r) => (
            r.id === resourceId
              ? { ...r, status: "archived", lessonPlanIds: [], fileData: "" }
              : r
          )),
        },
        curriculumDraftReviews: (afterRollback.json.siteContent.curriculumDraftReviews || []).filter((e) => e.id !== draftId),
      },
    }, ownerAuth);
    ok(archived.status === 200, "safe cleanup archived disposable fixture");
    report.steps.push("cleanup");

    const finalSite = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const finalFarm = finalSite.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FARM_ID);
    ok(JSON.stringify(finalFarm) === farmBefore, "Farm Animals unchanged at end");
    ok(finalSite.json.siteContent.featureFlags.teachingKitViewer === false, "customer viewer flag unchanged");
    ok(finalSite.json.siteContent.featureFlags.teachingKitPrintCenter === false, "customer print flag unchanged");
    ok(finalSite.json.siteContent.featureFlags.teachingKitEnrichmentEditor === false, "enrichment editor flag unchanged");
    report.steps.push("data-preservation");

    // Playwright UI screenshots: queue, open review, printable thumbs, preview, compare, content home
    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      playwright = null;
    }
    if (playwright) {
      // Re-submit a disposable draft for UI screenshots (prior one cleaned up).
      const uiPlanId = `${FIXTURE_ID}-ui`;
      const uiResource = `cur-res-draft-${uiPlanId}`;
      const uiPlan = { ...disposablePlan(), id: uiPlanId, title: "ZZ Disposable Draft Review UI Kit" };
      const site = (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent;
      const seeded = await requestJson("POST", "/api/admin/site-content", {
        expectedUpdatedAt: site.updatedAt,
        siteContent: {
          ...site,
          curriculum: {
            ...site.curriculum,
            lessonPlans: [...site.curriculum.lessonPlans, uiPlan],
          },
        },
      }, ownerAuth);
      ok(seeded.status === 200, "seed UI disposable lesson");
      const uiStamp = seeded.json.siteContent.updatedAt;
      const uiEnrich = enrichmentFor(uiPlan, uiResource);
      const uiSubmit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
        action: "submit",
        lessonPlanId: uiPlanId,
        title: uiPlan.title,
        age: uiPlan.age,
        theme: uiPlan.theme,
        batchName: "Disposable UI screenshots",
        source: "cursor-agent",
        enrichmentDraft: uiEnrich,
        printables: [{
          id: uiResource,
          title: "Disposable UI Picture Cards",
          fileName: "disposable-ui.pdf",
          fileData: pdf.dataUrl,
          pageCount: 4,
          printingInstructions: "Print US Letter.",
        }],
        expectedUpdatedAt: uiStamp,
      }, ownerAuth);
      ok(uiSubmit.status === 200, "submit UI disposable draft");
      const uiDraftId = uiSubmit.json.detail?.id || uiSubmit.json.entry?.id;

      const { chromium } = playwright;
      const browser = await chromium.launch({ headless: true });
      for (const viewport of [
        { name: "desktop", width: 1280, height: 900 },
        { name: "mobile", width: 390, height: 844 },
      ]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        const pageErrors = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => typeof setAdminSession === "function" && typeof setView === "function" && typeof setAdminSectionTab === "function",
          null,
          { timeout: 30000 },
        );
        await page.evaluate(({ owner, token }) => {
          setAdminSession({
            email: owner.email,
            name: "Owner",
            token,
            mode: "server",
            trustedDevice: true,
          });
          localStorage.setItem("llhAdminPreviewMode", "Admin");
        }, { owner: OWNER, token: ownerToken });
        await page.evaluate(async () => {
          if (typeof setView === "function") setView("admin");
          if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
          if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-draft-review");
          if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
        });
        await page.waitForFunction(
          () => !document.querySelector(".tk-draft-loading")
            && (
              document.querySelector("[data-draft-review-open-kit]")
              || /No drafts waiting|Queue loaded|Draft Review failed|sign in as/i.test(document.querySelector("#adminDraftReviewQueueApp")?.textContent || "")
            ),
          null,
          { timeout: 30000 },
        );
        if (!(await page.locator("[data-draft-review-open-kit]").count())) {
          await page.click("[data-draft-review-refresh]").catch(() => {});
          await page.waitForTimeout(1200);
        }
        const shotQueue = path.join(ARTIFACT_DIR, `queue-${viewport.name}.png`);
        await page.screenshot({ path: shotQueue, fullPage: true });
        report.screenshots.push(shotQueue);

        const openBtn = page.locator("[data-draft-review-open-kit]").first();
        if (await openBtn.count()) {
          await page.evaluate(() => {
            const el = document.querySelector("[data-draft-review-open-kit]");
            if (el) {
              el.scrollIntoView({ block: "center" });
              el.click();
            }
          });
          await page.waitForTimeout(1500);
          const editorOpen = await page.evaluate(() => (
            document.body.classList.contains("llh-lre-open")
            || document.body.classList.contains("tk-enrich-open")
            || Boolean(window.LLHLessonReviewEditor?.isOpen?.())
            || Boolean(window.LLHTeachingKitEnrichmentEditor?.isOpen?.())
          ));
          ok(editorOpen === true, `Open Review opens editor (${viewport.name})`);
          const editorProbe = await page.evaluate(() => {
            const lreOpen = Boolean(window.LLHLessonReviewEditor?.isOpen?.());
            if (lreOpen) {
              const state = window.LLHLessonReviewEditor.getState?.() || {};
              const sections = (window.LLHLessonReviewEditor.SECTION_DEFS || []).map((row) => row.label);
              const header = document.querySelector(".llh-lre-header")?.textContent || "";
              const chrome = document.querySelector("[data-lre-section-chrome]")?.textContent || "";
              const activityCards = document.querySelectorAll(".llh-lre-activity-card").length;
              // Open Activities to count cards when not already there.
              return {
                mode: "lesson-review",
                sectionId: state.sectionId || "",
                sections,
                header,
                chrome,
                activityCards,
                stepLabel: header,
                workflow: header,
                flatCount: activityCards,
                activityOf: [],
                titles: sections,
                flagOff: (window.effectiveSiteContent?.()?.featureFlags?.teachingKitEnrichmentEditor !== true),
              };
            }
            const draft = window.LLHTeachingKitEnrichmentEditor?.getDraft?.() || {};
            const acts = window.LLHTeachingKitEnrichment?.flattenLessonActivities?.(
              { id: "probe" },
              [],
              draft,
            ) || [];
            const navText = document.querySelector(".tk-enrich-chrome, [data-enrich-activity-nav]")?.textContent || "";
            const activityOf = (navText.match(/Activity\s+(\d+)\s+of\s+(\d+)/i) || []).slice(1);
            const stepLabel = document.querySelector("[data-publish-ready-step]")?.textContent?.trim() || "";
            const workflow = document.querySelector("[data-workflow-status-chrome]")?.textContent?.trim() || "";
            const titles = [...document.querySelectorAll(".tk-enrich-activity-list button, [data-enrich-activity-jump]")]
              .map((el) => el.textContent.trim())
              .filter(Boolean);
            return {
              mode: "enrichment",
              flatCount: acts.length,
              activityOf,
              stepLabel,
              workflow,
              titles,
              flagOff: (window.effectiveSiteContent?.()?.featureFlags?.teachingKitEnrichmentEditor !== true),
            };
          });
          ok(editorProbe.flagOff === true, `Open Review works with enrichment editor flag off (${viewport.name})`);
          if (editorProbe.mode === "lesson-review") {
            ok(editorProbe.sections.includes("Activities"), `section editor has Activities (${viewport.name})`);
            ok(editorProbe.sections.includes("Preview / Publish"), `section editor has Preview / Publish (${viewport.name})`);
            // Navigate to Activities and confirm cards for the disposable Mon–Fri kit.
            await page.evaluate(() => {
              const btn = document.querySelector('[data-lre-section="activities"]');
              if (btn && btn.offsetParent !== null) {
                btn.click();
                return;
              }
              const sel = document.querySelector("[data-lre-section-select]");
              if (sel) {
                sel.value = "activities";
                sel.dispatchEvent(new Event("change", { bubbles: true }));
              }
            });
            await page.waitForTimeout(350);
            const activityCards = await page.locator(".llh-lre-activity-card").count();
            ok(activityCards === 15, `section editor shows 15 activity cards (${viewport.name}: ${activityCards})`);
          } else if (editorProbe.activityOf[1]) {
            ok(Number(editorProbe.activityOf[1]) === 15, `editor Activity N of 15 (${viewport.name}: ${editorProbe.activityOf.join("/")})`);
          } else {
            ok(editorProbe.flatCount === 15, `editor flatten count 15 with queue draft (${viewport.name}: ${editorProbe.flatCount})`);
          }
          ok(!/Publish Ready/i.test(editorProbe.stepLabel), `stepper not Publish Ready while reviewing disposable (${viewport.name}: ${editorProbe.stepLabel})`);
          ok(!/Publish Ready/i.test(editorProbe.workflow), `workflow badge not Publish Ready (${viewport.name}: ${editorProbe.workflow})`);
          const shotEditor = path.join(ARTIFACT_DIR, `open-review-${viewport.name}.png`);
          await page.screenshot({ path: shotEditor, fullPage: true });
          report.screenshots.push(shotEditor);
          const exitLre = page.locator("[data-lre-back]").first();
          const exitEnrich = page.locator("[data-enrich-exit]").first();
          if (await exitLre.count()) {
            await exitLre.click({ force: true }).catch(() => {});
            await page.waitForTimeout(900);
          } else if (await exitEnrich.count()) {
            await exitEnrich.click({ force: true }).catch(() => {});
            await page.waitForTimeout(900);
          } else {
            await page.evaluate(() => {
              if (window.LLHLessonReviewEditor?.close) {
                window.LLHLessonReviewEditor.close({ force: true, skipReturnNavigation: true });
              }
              if (window.LLHTeachingKitEnrichmentEditor?.close) {
                window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
              }
            });
            await page.waitForTimeout(700);
          }
        } else {
          ok(false, `Open Review button missing (${viewport.name})`);
        }

        // Open Review close remounts the queue + re-opens detail asynchronously — wait for it.
        await page.waitForFunction(
          () => Boolean(document.querySelector("[data-draft-review-printables]"))
            && !document.querySelector(".tk-draft-loading")
            && !(window.LLHDraftReviewQueue?.state?.busy),
          null,
          { timeout: 30000 },
        );
        const printablesBtn = page.locator("[data-draft-review-printables]").first();
        ok(await printablesBtn.count() > 0, `Printable review control visible (${viewport.name})`);
        if (await printablesBtn.count()) {
          page.once("dialog", async (dialog) => { await dialog.accept().catch(() => {}); });
          await printablesBtn.click({ force: true });
          // Drive the page viewer directly if the click path races remount.
          await page.evaluate(async () => {
            const api = window.LLHDraftReviewQueue;
            const pdf = window.LLHCurriculumDraftPrintableReview;
            if (!api?.state?.selectedId || !pdf) return;
            if (!api.state.printableReview) {
              const token = (typeof adminSession === "function" ? adminSession()?.token : "") || "";
              const res = await fetch("/api/admin/curriculum/draft-review", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: "printable-review", id: api.state.selectedId }),
              });
              api.state.printableReview = await res.json();
              api.state.printableViewers = {};
            }
            const rows = api.state.printableReview?.printables || [];
            for (const row of rows) {
              if (!api.state.printableViewers[row.id]) {
                api.state.printableViewers[row.id] = pdf.createViewerState(row);
              }
              const viewer = api.state.printableViewers[row.id];
              if (!viewer.pdfDoc && !viewer.error) await pdf.loadDocument(viewer);
            }
            api.render();
          });
          await page.waitForSelector(".tk-draft-pdf-thumb, .tk-draft-pdf-error", { timeout: 90000 });
          await page.waitForTimeout(400);
          const thumbCount = await page.locator(".tk-draft-pdf-thumb").count();
          const panelText = await page.locator(".tk-draft-printable-panel").innerText().catch(() => "");
          ok(thumbCount >= 1, `printable thumbnails rendered (${viewport.name}: ${thumbCount})`);
          if (thumbCount < 1) {
            console.error("printable panel text:", panelText.slice(0, 800));
          }
          const shotThumbs = path.join(ARTIFACT_DIR, `printable-thumbs-${viewport.name}.png`);
          await page.screenshot({ path: shotThumbs, fullPage: true });
          report.screenshots.push(shotThumbs);
          const thumb = page.locator(".tk-draft-pdf-thumb").first();
          if (await thumb.count()) {
            await thumb.click({ force: true });
            await page.waitForSelector(".tk-draft-pdf-lightbox", { timeout: 20000 });
            await page.waitForFunction(() => {
              const canvas = document.querySelector(".tk-draft-pdf-lightbox canvas");
              return Boolean(canvas && canvas.width > 40 && canvas.height > 40);
            }, null, { timeout: 20000 }).catch(() => {});
            await page.waitForTimeout(500);
            const shotPreview = path.join(ARTIFACT_DIR, `printable-page-preview-${viewport.name}.png`);
            await page.screenshot({ path: shotPreview, fullPage: true });
            report.screenshots.push(shotPreview);
            await page.locator("[data-pdf-close]").first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(400);
          }
        }

        const previewBtn = page.locator("[data-draft-review-preview]").first();
        if (await previewBtn.count()) {
          await previewBtn.click({ force: true });
          await page.waitForTimeout(900);
          const shotPreviewKit = path.join(ARTIFACT_DIR, `teaching-kit-preview-${viewport.name}.png`);
          await page.screenshot({ path: shotPreviewKit, fullPage: true });
          report.screenshots.push(shotPreviewKit);
        }

        const imagesBtn = page.locator("[data-draft-review-images]").first();
        if (await imagesBtn.count()) {
          await imagesBtn.click({ force: true });
          await page.waitForTimeout(700);
          const shotImages = path.join(ARTIFACT_DIR, `image-review-${viewport.name}.png`);
          await page.screenshot({ path: shotImages, fullPage: true });
          report.screenshots.push(shotImages);
        }

        const compareBtn = page.locator("[data-draft-review-compare]").first();
        if (await compareBtn.count()) {
          await compareBtn.click({ force: true });
          await page.waitForTimeout(700);
          const shotCompare = path.join(ARTIFACT_DIR, `compare-${viewport.name}.png`);
          await page.screenshot({ path: shotCompare, fullPage: true });
          report.screenshots.push(shotCompare);
        }

        const revisionBtn = page.locator("[data-draft-review-request-revision]").first();
        if (await revisionBtn.count()) {
          await page.fill("[data-draft-review-notes]", "UI evidence: please tighten Monday cleanup language.");
          await revisionBtn.click({ force: true });
          await page.waitForTimeout(900);
          const shotRev = path.join(ARTIFACT_DIR, `revision-request-${viewport.name}.png`);
          await page.screenshot({ path: shotRev, fullPage: true });
          report.screenshots.push(shotRev);
        }

        const back = page.locator("[data-draft-review-back-content]").first();
        if (await back.count()) {
          await back.click();
          await page.waitForTimeout(500);
          const tab = await page.evaluate(() => (typeof adminActiveSectionTab !== "undefined" ? adminActiveSectionTab : ""));
          ok(tab === "content-home", `Content Home return works (${viewport.name})`);
          const shotHome = path.join(ARTIFACT_DIR, `content-home-${viewport.name}.png`);
          await page.screenshot({ path: shotHome, fullPage: true });
          report.screenshots.push(shotHome);
        }

        ok(pageErrors.length === 0, `no page errors during ${viewport.name} pass (${pageErrors.join("; ")})`);
        await page.close();
      }
      await browser.close();
      report.steps.push("ui-desktop-mobile");

      // Cleanup UI fixture
      const endSite = (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent;
      await requestJson("POST", "/api/admin/site-content", {
        expectedUpdatedAt: endSite.updatedAt,
        siteContent: {
          ...endSite,
          curriculum: {
            ...endSite.curriculum,
            lessonPlans: endSite.curriculum.lessonPlans.filter((p) => p.id !== uiPlanId),
            resources: (endSite.curriculum.resources || []).filter((r) => r.id !== uiResource),
          },
          curriculumDraftReviews: (endSite.curriculumDraftReviews || []).filter((e) => e.id !== uiDraftId),
        },
      }, ownerAuth);
    } else {
      report.risks.push("Playwright not installed — UI screenshots skipped");
    }

    report.passed = passed;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(ARTIFACT_DIR, "OWNER-WORKFLOW-REPORT.json"), JSON.stringify(report, null, 2));
    console.log(`\nPASS ${passed} assertions (draft-review-owner-workflow)`);
  } catch (error) {
    console.error("\nFAIL", error);
    if (stderr) console.error("server stderr:", stderr.slice(-5000));
    report.error = String(error && error.stack || error);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "OWNER-WORKFLOW-REPORT.json"), JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

function modelEnrichmentStillPresent(entry) {
  const draft = entry?.enrichmentDraft || entry?.detail?.enrichmentDraft;
  return Boolean(draft && draft.week && (draft.activities || draft.week.proposedDailyPlans));
}

main();
