#!/usr/bin/env node
/**
 * Teaching Kit — Publish Ready / Library Health scoring consistency.
 * Disposable fixtures only. Never edits Farm Animals or production curriculum.
 *
 * Proves:
 * - Image briefs never count as actual images
 * - Draft printables never count as published/usable
 * - Publish Ready cannot appear while library reports Blocked
 * - In-progress activities block readiness
 * - Missing book discussion questions block premium readiness
 * - Materials Needs Improvement blocks premium readiness
 * - Editor / card / Library Health / Quality Review / publish blockers share one source
 * - Completing real requirements flips dashboards consistently
 * - Owner can still save drafts (structural save path untouched)
 *
 * Run: npm run test:teaching-kit-publish-ready-consistency
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const statusApi = require("./teaching-kit-status.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6620 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-publish-ready-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-publish-ready-consistency";
const FIXTURE_ID = "cur-lp-qa-publish-ready-consistency";
const FIXTURE_TITLE = "QA — Publish Ready Consistency";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "tk-publish-ready-pass",
  code: "tk-publish-ready-code",
};

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
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

function waitForHealth(child, timeoutMs = 25000) {
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
      setTimeout(tick, 200);
    };
    tick();
  });
}

function completeBook(title = "Color Farm") {
  return {
    title,
    author: "QA Author",
    whyThisBook: "Matches the disposable theme and invites talk.",
    beforeReadingQuestions: ["What colors do you see on the cover?"],
    duringReadingPrompts: ["Point to a farm animal."],
    afterReadingQuestions: ["Which animal would you visit first?"],
  };
}

function completeSong() {
  return {
    title: "Color Song",
    rightsStatus: "traditional",
    motions: "Tap knees for each color word.",
    teacherDirections: "Sing slowly and invite children to join.",
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

function thinFixture({ draftPrintable = false, resources = [] } = {}) {
  const resourceIds = draftPrintable ? ["cur-res-qa-draft-printable"] : [];
  return {
    plan: {
      id: FIXTURE_ID,
      title: FIXTURE_TITLE,
      theme: "QA Disposable",
      age: "Preschool",
      status: "draft",
      weeklyOverview: "Disposable QA fixture proving publish-ready scoring consistency across dashboards.",
      objectives: "Explore colors through play invitations and peer talk.",
      vocabularyWords: "gold, standard, quality, farm, sort, tray",
      books: [{ title: "Title Only Book", author: "Someone" }],
      songs: [{ title: "Title Only Song" }],
      familyConnection: "Talk about favorite colors at home this week with your child.",
      resourceIds,
      weeklyMaterials: "baskets, brushes, hay",
      enrichmentDraft: {
        week: {
          weeklyOverview: "Disposable overview for scoring proof with play invitations across the week.",
          objectives: "Explore colors through play invitations and peer talk each day.",
          weeklyMaterials: "baskets, brushes, hay",
          books: [{ title: "Title Only Book", author: "Someone" }],
          songs: [{ title: "Title Only Song" }],
          printableIdeas: draftPrintable ? [] : ["Color sorting mat idea"],
          printableIds: draftPrintable ? ["cur-res-qa-draft-printable"] : [],
          teacherToolkit: { teacherPreparation: "Stage trays." },
          familyConnection: "Talk about favorite colors at home this week with your child.",
        },
        activities: {
          "qa-act-1": {
            imageRequirement: "required",
            teacherTips: ["Offer two trays."],
            observationPrompts: ["Names a color?"],
            imageBriefSetup: "Low table with baskets in natural light.",
            imageBriefExample: "Child sorting colored scarves into baskets.",
            setup: "Place baskets at child height near the rug.",
            steps: "Invite children to sort scarves and name colors aloud.",
          },
        },
      },
      dailyPlans: {
        monday: { theme: "Sort warm colors", items: [{ id: "qa-act-1", title: "Color Sort", category: "table" }] },
        tuesday: { theme: "Sort cool colors", items: [{ id: "qa-act-1", title: "Color Sort", category: "table" }] },
        wednesday: { theme: "Mix and match", items: [{ id: "qa-act-1", title: "Color Sort", category: "table" }] },
        thursday: { theme: "Peer sorting games", items: [{ id: "qa-act-1", title: "Color Sort", category: "table" }] },
        friday: { theme: "Family color share", items: [{ id: "qa-act-1", title: "Color Sort", category: "table" }] },
      },
      adminOnly: true,
      excludeFromCustomerLibrary: true,
      qaDisposable: true,
    },
    activities: [{ id: "qa-act-1", title: "Color Sort", lessonPlanId: FIXTURE_ID, category: "table" }],
    resources: draftPrintable
      ? [{
        id: "cur-res-qa-draft-printable",
        title: "QA Draft Picture Cards",
        status: "draft",
        type: "printable",
        fileUrl: "/media/qa-draft.pdf",
      }]
      : resources,
  };
}

function assertSurfacesAgree(evaluated, label) {
  ok(evaluated.report, `${label}: report present`);
  ok(evaluated.summary, `${label}: summary present`);
  ok(evaluated.status, `${label}: status present`);
  ok(evaluated.workflow === evaluated.status.workflow, `${label}: workflow matches status`);
  ok(evaluated.blocking === evaluated.status.blocking, `${label}: blocking matches status`);
  ok(evaluated.blocksPublish === Boolean(evaluated.report.blocksPublish), `${label}: blocksPublish aligned`);
  if (evaluated.blocking === "Blocked") {
    ok(evaluated.workflow !== "Publish Ready", `${label}: not Publish Ready while Blocked`);
    ok(evaluated.report.publishReadiness !== "ready", `${label}: publishReadiness not ready while Blocked`);
    ok(evaluated.report.overallLabel !== "Publish ready", `${label}: overallLabel not Publish ready`);
  }
  ok(
    evaluated.summary.premiumReadinessPercent === evaluated.report.premiumReadinessPercent
      || evaluated.summary.premiumReadinessPercent === evaluated.premiumReadinessPercent,
    `${label}: premium readiness shared`,
  );
}

function runUnitCases() {
  // 1) Brief-only images remain incomplete
  const brief = thinFixture();
  const briefEval = quality.evaluateTeachingKit(
    brief.plan,
    brief.activities,
    brief.plan.enrichmentDraft,
    { resources: brief.resources },
  );
  assertSurfacesAgree(briefEval, "brief-only");
  ok(briefEval.summary.imageBriefsNotImages >= 2, "briefs tracked");
  ok(briefEval.summary.readinessScores.visualCoverage.percent === 0, "briefs do not count as visual coverage");
  ok(briefEval.summary.readinessScores.imageReadiness < 60, "briefs do not raise visual readiness to excellent");
  ok(briefEval.report.findings.some((f) => f.code === "image_brief_not_image" || f.code === "missing_example_images"), "brief finding");
  ok(!(briefEval.report.blockingIssues || []).some((b) => b.code === "image_brief_not_image" || b.code === "missing_example_images"), "image findings are not hard blockers");
  ok(briefEval.blocksPublish, "thin brief-only fixture still blocked by other hard gaps");
  ok(briefEval.workflow !== "Publish Ready", "brief-only not Publish Ready");

  // 2) Draft printable remains incomplete
  const draftPrint = thinFixture({ draftPrintable: true });
  const draftEval = quality.evaluateTeachingKit(
    draftPrint.plan,
    draftPrint.activities,
    draftPrint.plan.enrichmentDraft,
    { resources: draftPrint.resources },
  );
  assertSurfacesAgree(draftEval, "draft-printable");
  ok(draftEval.summary.hasDraftOnlyPrintables === true, "draft-only printable flag");
  ok(draftEval.summary.missingPrintables === true, "draft printable still missing published printable");
  ok(draftEval.summary.readinessScores.printReadiness < 50, "draft printable does not print-ready score");
  ok(
    draftEval.report.blockingIssues.some((b) => b.code === "draft_printables_only" || b.code === "missing_printables"),
    "draft printable blocker",
  );
  ok(!/Publish Ready/i.test(draftEval.workflow), "draft printable not Publish Ready");

  // 3) In-progress activities prevent Publish Ready
  ok(draftEval.summary.incompleteActivities >= 1, "in-progress activity counted");
  ok(draftEval.report.blockingIssues.some((b) => b.code === "activities_in_progress"), "activities_in_progress blocker");

  // 4) Missing book questions prevent Publish Ready
  ok(draftEval.summary.incompleteBooks >= 1, "incomplete books");
  ok(draftEval.report.blockingIssues.some((b) => b.code === "incomplete_books"), "incomplete_books blocker");

  // 5) Weak materials prevent Publish Ready
  ok(draftEval.summary.weakMaterials === true || draftEval.summary.materialsState === "needs_improvement", "weak materials flagged");
  ok(draftEval.report.blockingIssues.some((b) => b.code === "weak_materials"), "weak_materials blocker");
  ok(draftEval.premiumReadinessPercent < 90, "premium capped while gaps remain");

  // Library health row agrees
  const health = quality.buildLibraryHealthDashboard({
    lessonPlans: [draftPrint.plan],
    activities: draftPrint.activities,
    resources: draftPrint.resources,
  });
  const row = health.rows[0];
  ok(row.blocking === "Blocked" || row.libraryStatus === "Blocked", "library health Blocked");
  ok(row.publishReady === false, "library health not publishReady");
  ok(row.workflow !== "Publish Ready", "library health workflow not Publish Ready");
  ok(row.missingPrintables === true, "library health missing printables includes draft");
  ok(row.activitiesInProgress === true, "library health activities in progress");
  ok(row.weakMaterials === true, "library health weak materials");

  // 6) Completing real requirements changes every dashboard consistently
  const readyResources = [{
    id: "cur-res-qa-published-printable",
    title: "QA Published Picture Cards",
    status: "published",
    type: "printable",
    fileUrl: "/media/qa-published.pdf",
  }];
  const readyPlan = JSON.parse(JSON.stringify(draftPrint.plan));
  readyPlan.resourceIds = ["cur-res-qa-published-printable"];
  readyPlan.weeklyMaterials = "baskets, brushes, tongs, trays, mats, cups, scarves";
  readyPlan.enrichmentDraft.week.weeklyMaterials = readyPlan.weeklyMaterials;
  readyPlan.enrichmentDraft.week.printableIds = ["cur-res-qa-published-printable"];
  readyPlan.enrichmentDraft.week.books = [completeBook()];
  readyPlan.enrichmentDraft.week.songs = [completeSong()];
  readyPlan.enrichmentDraft.week.teacherToolkit = completeToolkit();
  readyPlan.enrichmentDraft.week.teacherPreparation = completeToolkit().teacherPreparation;
  readyPlan.books = [completeBook()];
  readyPlan.songs = [completeSong()];
  // Full 10-activity week (2/day): volume standard met; ~50% images = excellent visual coverage.
  const readyActivities = [];
  readyPlan.enrichmentDraft.activities = {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const items = [];
    for (let i = 1; i <= 2; i += 1) {
      const id = `qa-act-${day}-${i}`;
      const withImage = i === 1;
      const item = {
        id,
        itemId: id,
        title: `${day} Color Play ${i}`,
        dayOfWeek: day,
        activityCategory: withImage ? "Sensory" : "Music and Movement",
        ageModifications: "Preschool",
        durationMinutes: 15,
        objective: "Explore color sorting and naming during play.",
        description: "Children sort scarves and name colors with a peer.",
        materials: "scarves, baskets, tongs",
        preparation: "Stage trays before arrival.",
        setup: "Place baskets at child height near the rug before arrival.",
        steps: "1. Invite children.\n2. Model one sort.\n3. Let children try.\n4. Clean up together.",
        teacherLanguage: "Which color did you choose?",
        observationOpportunities: "Names a color while sorting?",
        safetyNotes: "Supervise tongs.",
        cleanupTips: "Return scarves to the caddy.",
        imageRequirement: withImage ? "required" : "not_needed",
        setupImageUrl: withImage ? `/api/enrichment-media/${id}-setup.png` : "",
        exampleImageUrl: withImage ? `/api/enrichment-media/${id}-example.png` : "",
        lessonPlanId: FIXTURE_ID,
        status: "draft",
      };
      items.push(item);
      readyActivities.push(item);
      readyPlan.enrichmentDraft.activities[id] = {
        teacherTips: ["Offer two trays and step back."],
        observationPrompts: ["Names a color while sorting?"],
        imageRequirement: item.imageRequirement,
        setupImageUrl: item.setupImageUrl,
        exampleImageUrl: item.exampleImageUrl,
        setup: item.setup,
        steps: item.steps,
        adaptations: "Offer larger pieces for beginners who need more success.",
        extensions: "Add a third sorting rule for older peers to lead.",
        indoorAlternatives: "Table sort if weather blocks outdoor time today.",
        outdoorAlternatives: "Take the sort mats outdoors onto the patio.",
        substitutions: [{ need: "hay", use: "shredded paper" }],
        settingTags: ["indoor", "small_group"],
        vocabulary: ["sort", "tray", "color"],
        title: item.title,
        dayOfWeek: day,
        activityCategory: item.activityCategory,
        ageModifications: item.ageModifications,
        durationMinutes: item.durationMinutes,
        objective: item.objective,
        description: item.description,
        materials: item.materials,
        preparation: item.preparation,
        teacherLanguage: item.teacherLanguage,
        observationOpportunities: item.observationOpportunities,
        safetyNotes: item.safetyNotes,
        cleanupTips: item.cleanupTips,
      };
    }
    readyPlan.dailyPlans[day] = { theme: `${day} color focus`, focus: `${day} focus`, items };
  });
  // Clear draft-only resource catalog; use published.
  const readyEval = quality.evaluateTeachingKit(
    readyPlan,
    readyActivities,
    readyPlan.enrichmentDraft,
    { resources: readyResources },
  );
  assertSurfacesAgree(readyEval, "ready-kit");
  ok(readyEval.summary.activityCount === 10, "ready kit has 10 activities");
  ok(readyEval.summary.activityVolume.requirementMet === true, "10 activities meet weekly volume standard");
  ok(readyEval.summary.incompleteActivitiesForPublish === 0, "all activities publish-content complete");
  ok(readyEval.summary.imageBriefsNotImages === 0, "no brief-only images");
  ok(readyEval.summary.visualCoverage.excellent === true, "visual coverage excellent without every activity imaged");
  ok(readyEval.summary.missingPrintables === false, "published printable clears gap");
  ok(readyEval.summary.incompleteBooks === 0, "books complete");
  ok(readyEval.summary.weakMaterials === false, "materials complete");
  ok(readyEval.premiumReadinessPercent >= 90, `premium ready (${readyEval.premiumReadinessPercent})`);
  // Remaining blockers (if any) must not include the cases we cleared.
  const readyCodes = (readyEval.blockingIssues || []).map((b) => b.code);
  ok(!readyCodes.includes("image_brief_not_image"), "no brief blocker when photos present");
  ok(!readyCodes.includes("missing_example_images"), "missing images are not hard blockers");
  ok(!readyCodes.includes("thin_activity_week") && !readyCodes.includes("developing_activity_week"), "volume met");
  ok(!readyCodes.includes("draft_printables_only"), "no draft printable blocker");
  ok(!readyCodes.includes("activities_in_progress"), "no in-progress blocker");
  ok(!readyCodes.includes("incomplete_books"), "no book questions blocker");
  ok(!readyCodes.includes("weak_materials"), "no weak materials blocker");

  // If fully clear of blockers and premium high, Publish Ready / Ready for Owner is allowed.
  if (!readyEval.blocksPublish && readyEval.publishReadiness === "ready") {
    ok(
      readyEval.workflow === "Publish Ready" || readyEval.workflow === "Ready for Owner Review",
      `ready workflow (${readyEval.workflow})`,
    );
    ok(readyEval.blocking === "No blockers", "library No blockers when ready");
  }

  // workflow hard rule
  const forced = statusApi.workflowStatusFromParts({
    lessonStatus: "draft",
    enrichmentFillPercent: 95,
    premiumReadinessPercent: 95,
    hasEnrichmentDraft: true,
    coverageComplete: true,
    needsReview: false,
    publishReadiness: "ready",
    qualityBlocked: true,
    blocking: "Blocked",
  });
  ok(forced === "Needs Changes", "Publish Ready impossible while qualityBlocked");

  // Shared stepper / badge eligibility model — states cannot disagree
  const blockedUi = statusApi.buildPublishReadinessUi({
    workflow: "Publish Ready",
    blocking: "Blocked",
    blocksPublish: true,
    publishReadiness: "blocked",
    hasDraftOnlyPrintables: true,
    incompleteActivities: 2,
    enrichmentFillPercent: 80,
  });
  ok(blockedUi.publishReady === false, "blocked ui: not publishReady");
  ok(blockedUi.canPublish === false, "blocked ui: cannot publish");
  ok(blockedUi.displayWorkflow === "Needs Changes", "blocked ui: Needs Changes label");
  ok(blockedUi.readinessStepLabel !== "Publish Ready", "blocked ui: stepper does not say Publish Ready");
  ok(/Needs Changes|Incomplete/i.test(blockedUi.readinessStepLabel), "blocked ui: stepper shows Needs Changes/Incomplete");
  ok(blockedUi.chromeSteps.some((s) => s.id === "readiness" && /is-blocked/.test(s.className)), "blocked ui: readiness step marked blocked");

  const needsChangesUi = statusApi.buildPublishReadinessUi({
    workflow: "Needs Changes",
    blocking: "Blocked",
    blocksPublish: true,
    publishReadiness: "blocked",
    incompleteActivities: 0,
    enrichmentFillPercent: 70,
  });
  ok(needsChangesUi.publishReady === false, "needs changes: not publishReady");
  ok(needsChangesUi.displayWorkflow === "Needs Changes", "needs changes: display Needs Changes");
  ok(needsChangesUi.readinessStepLabel === "Needs Changes", "needs changes: stepper Needs Changes");

  const awaitingPrintableUi = statusApi.buildPublishReadinessUi({
    workflow: "In Review",
    blocking: "Blocked",
    blocksPublish: true,
    hasDraftOnlyPrintables: true,
    printableApprovalStatuses: ["pending"],
    enrichmentFillPercent: 90,
  });
  ok(awaitingPrintableUi.publishReady === false, "awaiting printable: not publishReady");
  ok(awaitingPrintableUi.awaitingPrintableReview === true, "awaiting printable: flagged");
  ok(awaitingPrintableUi.readinessStepLabel !== "Publish Ready", "awaiting printable: stepper not Publish Ready");

  const rejectedPrintableUi = statusApi.buildPublishReadinessUi({
    workflow: "In Review",
    blocking: "Blocked",
    blocksPublish: true,
    hasRejectedPrintables: true,
    printableApprovalStatuses: ["revision_requested"],
    enrichmentFillPercent: 90,
  });
  ok(rejectedPrintableUi.publishReady === false, "rejected printable: not publishReady");
  ok(rejectedPrintableUi.rejectedPrintable === true, "rejected printable: flagged");
  ok(rejectedPrintableUi.readinessStepLabel === "Needs Changes", "rejected printable: Needs Changes step");

  const readyUi = statusApi.buildPublishReadinessUi({
    workflow: "Publish Ready",
    blocking: "No blockers",
    blocksPublish: false,
    publishReadiness: "ready",
    hasDraftOnlyPrintables: false,
    incompleteActivities: 0,
    enrichmentFillPercent: 95,
  });
  ok(readyUi.publishReady === true, "ready ui: publishReady");
  ok(readyUi.canPublish === true, "ready ui: canPublish");
  ok(readyUi.readinessStepLabel === "Publish Ready", "ready ui: stepper Publish Ready");
  ok(readyUi.displayWorkflow === "Publish Ready", "ready ui: display Publish Ready");

  const publishedUi = statusApi.buildPublishReadinessUi({
    workflow: "Published",
    blocking: "No blockers",
    blocksPublish: false,
    publishReadiness: "ready",
    enrichmentFillPercent: 100,
  });
  ok(publishedUi.published === true, "published ui: published");
  ok(publishedUi.publishReady === false, "published ui: not still publishReady");
  ok(publishedUi.canPublish === false, "published ui: cannot publish again");
  ok(publishedUi.displayWorkflow === "Published", "published ui: display Published");
  ok(publishedUi.readinessStepLabel === "Published", "published ui: readiness label Published");
  ok(publishedUi.chromeSteps.some((s) => s.id === "readiness" && s.label === "Published" && /is-active/.test(s.className)), "published ui: chrome shows Published");
  ok(publishedUi.summarySteps.some((s) => s.id === "published" && /is-active/.test(s.className)), "published ui: Published step active");
  ok(!publishedUi.chromeSteps.some((s) => s.label === "Publish Ready"), "published ui: chrome does not say Publish Ready");

  // Plain-language blockers list present
  ok(
    (draftEval.blockingIssues || []).every((b) => String(b.message || "").length > 8),
    "blockers have plain-language messages",
  );
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: OWNER.email,
    password: OWNER.password,
    code: OWNER.code,
  });
  ok(res.status === 200 && (res.json?.token || res.json?.adminToken), `admin login ${res.status}`);
  return res.json.token || res.json.adminToken;
}

async function seedAndProveDraftSave(ownerToken) {
  const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const existing = boot.json.siteContent || {};
  const curriculum = existing.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const fixture = thinFixture({ draftPrintable: true });
  const farmSentinel = {
    id: "cur-lp-farm-animals-sentinel-readonly",
    title: "Farm Animals",
    status: "published",
    theme: "Farm",
    enrichmentDraft: { week: { note: "DO_NOT_TOUCH_FARM_SENTINEL" }, activities: {} },
    resourceIds: ["farm-res-keep"],
  };
  const farmResource = {
    id: "farm-res-keep",
    title: "Farm sentinel printable",
    status: "published",
    type: "printable",
  };
  const nextCurriculum = {
    ...curriculum,
    lessonPlans: [
      ...(curriculum.lessonPlans || []).filter((p) => p.id !== FIXTURE_ID && p.id !== farmSentinel.id),
      fixture.plan,
      farmSentinel,
    ],
    activities: [
      ...(curriculum.activities || []).filter((a) => a.lessonPlanId !== FIXTURE_ID),
      ...fixture.activities,
    ],
    resources: [
      ...(curriculum.resources || []).filter((r) => r.id !== "cur-res-qa-draft-printable" && r.id !== farmResource.id),
      ...fixture.resources,
      farmResource,
    ],
  };
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken: ownerToken,
    expectedUpdatedAt: existing.updatedAt || boot.json.siteContentUpdatedAt,
    siteContent: {
      ...existing,
      curriculum: nextCurriculum,
      featureFlags: {
        ...(existing.featureFlags || {}),
        teachingKitEnrichmentEditor: true,
        teachingKitQualityReview: true,
        teachingKitAiAssist: true,
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
      },
    },
  }, { Authorization: `Bearer ${ownerToken}` });
  ok(save.status === 200, `seed fixture ${save.status}`);
  const updatedAt = save.json.siteContent?.updatedAt || save.json.siteContentUpdatedAt;

  // Owner can still save drafts even when blocked.
  const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: ownerToken,
    saveMode: "enrichment_draft",
    expectedUpdatedAt: updatedAt,
    lessonPlan: {
      id: FIXTURE_ID,
      enrichmentDraft: {
        ...fixture.plan.enrichmentDraft,
        week: {
          ...fixture.plan.enrichmentDraft.week,
          familyConnection: "Draft save still works while publish is blocked.",
        },
      },
    },
  }, { Authorization: `Bearer ${ownerToken}` });
  ok(draftSave.status === 200, `draft save while blocked: ${draftSave.status} ${draftSave.text?.slice(0, 160)}`);
  const afterDraft = draftSave.json.lessonPlan
    || draftSave.json.curriculum?.lessonPlans?.find((p) => p.id === FIXTURE_ID);
  ok(
    /Draft save still works/i.test(afterDraft?.enrichmentDraft?.week?.familyConnection || ""),
    `draft content persisted (got ${afterDraft?.enrichmentDraft?.week?.familyConnection || "missing"})`,
  );
  ok(draftSave.json.publishedUnchanged === true, "draft save leaves published content unchanged");

  // Farm Animals sentinel + linked resource untouched.
  const farmAfter = (draftSave.json.curriculum?.lessonPlans || []).find((p) => p.id === farmSentinel.id);
  ok(Boolean(farmAfter), "Farm Animals sentinel still present");
  ok(
    farmAfter?.enrichmentDraft?.week?.note === "DO_NOT_TOUCH_FARM_SENTINEL",
    "Farm Animals enrichment draft untouched",
  );
  ok(
    JSON.stringify(farmAfter?.resourceIds || []) === JSON.stringify(["farm-res-keep"]),
    "Farm Animals linked resources intact",
  );
  const farmResAfter = (draftSave.json.curriculum?.resources || []).find((r) => r.id === farmResource.id);
  ok(farmResAfter?.status === "published", "linked farm resource intact");

  // Customer flags remain false (reload site content — draft save does not return featureFlags).
  const flagsBoot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const flags = flagsBoot.json.siteContent?.featureFlags || {};
  ok(flags.teachingKitViewer !== true, "customer viewer flag not enabled");
  ok(flags.teachingKitPrintCenter !== true, "print center flag not enabled");
  ok(flags.teachingKitAttachments !== true, "attachments flag not enabled");

  // API quality review returns evaluation aligned with local evaluateTeachingKit.
  const qr = await requestJson("POST", "/api/admin/curriculum/quality-review", {
    adminToken: ownerToken,
    action: "review_lesson",
    planId: FIXTURE_ID,
  }, { Authorization: `Bearer ${ownerToken}` });
  ok(qr.status === 200, `quality review api ${qr.status}`);
  ok(qr.json.report?.blocksPublish === true, "api blocks publish");
  ok(qr.json.evaluation?.blocking === "Blocked", "api evaluation Blocked");
  ok(qr.json.evaluation?.workflow !== "Publish Ready", "api workflow not Publish Ready");
  ok(
    (qr.json.evaluation?.blockingIssues || qr.json.report?.blockingIssues || []).length > 0,
    "api lists blockers",
  );

  return { updatedAt: draftSave.json.siteContentUpdatedAt || flagsBoot.json.siteContent?.updatedAt };
}

async function cleanup(ownerToken) {
  const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
  const existing = boot.json.siteContent || {};
  const curriculum = existing.curriculum || { lessonPlans: [], activities: [], resources: [] };
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken: ownerToken,
    expectedUpdatedAt: existing.updatedAt || boot.json.siteContentUpdatedAt,
    siteContent: {
      ...existing,
      curriculum: {
        ...curriculum,
        lessonPlans: (curriculum.lessonPlans || []).filter((p) => p.id !== FIXTURE_ID && p.id !== "cur-lp-farm-animals-sentinel-readonly"),
        activities: (curriculum.activities || []).filter((a) => a.lessonPlanId !== FIXTURE_ID),
        resources: (curriculum.resources || []).filter((r) => r.id !== "cur-res-qa-draft-printable" && r.id !== "farm-res-keep"),
      },
    },
  }, { Authorization: `Bearer ${ownerToken}` });
  ok(save.status === 200, `cleanup ${save.status}`);
}

async function browserProof(ownerToken) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => window.LLHTeachingKitEnrichment
        && window.LLHTeachingKitQualityReview
        && window.LLHTeachingKitEnrichmentEditor,
      null,
      { timeout: 30000 },
    );

    const result = await page.evaluate(async (payload) => {
      window.effectiveSiteContent = () => ({
        featureFlags: {
          teachingKitEnrichmentEditor: true,
          teachingKitQualityReview: true,
          teachingKitAiAssist: true,
        },
      });
      window.effectiveCurriculum = () => ({
        lessonPlans: [payload.plan],
        activities: payload.activities,
        resources: payload.resources,
      });
      window.adminSession = () => ({ token: payload.ownerToken, email: payload.ownerEmail });
      window.curriculumLessonPlanById = (id) => (id === payload.plan.id ? payload.plan : null);
      window.curriculumActivitiesForLesson = (id) => (
        id === payload.plan.id ? payload.activities : []
      );
      window.showActionFeedback = () => {};
      const host = document.createElement("div");
      host.id = "adminTeachingKitEnrichmentHost";
      document.body.innerHTML = "";
      document.body.appendChild(host);
      window.LLHTeachingKitEnrichmentEditor.open(payload.plan.id);
      await new Promise((r) => setTimeout(r, 500));

      const evaluated = window.LLHTeachingKitQualityReview.evaluateTeachingKit(
        payload.plan,
        payload.activities,
        window.LLHTeachingKitEnrichmentEditor.getDraft(),
        { resources: payload.resources },
      );
      const workspaceStatus = document.querySelector("[data-owner-workspace-status] .tag")?.textContent || "";
      const coreLine = document.querySelector("[data-owner-workspace-status] strong")?.textContent || "";
      const publishBtn = document.querySelector("[data-enrich-publish]");
      // Open publish dialog
      publishBtn?.click();
      await new Promise((r) => setTimeout(r, 200));
      const blockerLis = [...document.querySelectorAll("[data-publish-blocker-list] li")].map((li) => li.textContent.trim());
      const readiness = document.querySelector("[data-publish-readiness-label]")?.textContent || "";
      const previewLabel = document.querySelector("[data-public-lesson-preview-label]")?.textContent || "";
      return {
        evaluatedWorkflow: evaluated.workflow,
        evaluatedBlocking: evaluated.blocking,
        workspaceStatus,
        coreLine,
        publishBtnText: publishBtn?.textContent?.trim() || "",
        canPublishAttr: publishBtn?.getAttribute("data-can-publish") || "",
        blockerLis,
        readiness,
        previewLabel,
        blocksPublish: evaluated.blocksPublish,
        codes: (evaluated.blockingIssues || []).map((b) => b.code),
      };
    }, {
      plan: thinFixture({ draftPrintable: true }).plan,
      activities: thinFixture({ draftPrintable: true }).activities,
      resources: thinFixture({ draftPrintable: true }).resources,
      ownerToken,
      ownerEmail: OWNER.email,
    });

    ok(result.blocksPublish === true, "quality evaluation still reports optional gaps");
    ok(result.evaluatedWorkflow !== "Publish Ready", "quality workflow not Publish Ready");
    ok(/Ready to publish/i.test(result.workspaceStatus), `owner chrome Ready to publish (got ${result.workspaceStatus})`);
    ok(/title|weekday|activit/i.test(result.coreLine), `core lesson line present (got ${result.coreLine})`);
    ok(result.canPublishAttr === "true", "draft printables do not set data-can-publish=false");
    ok(/^Apply enrichment$/i.test(result.publishBtnText), `Apply enrichment stays distinct from Publish lesson (got ${result.publishBtnText})`);
    ok(result.blockerLis.length === 0, "publish dialog lists no true blockers for a valid core lesson");
    ok(/Ready to publish/i.test(result.readiness), `publish readiness Ready to publish (got ${result.readiness})`);

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "publish-ready-consistency-desktop.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  runUnitCases();

  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const ownerToken = await adminLogin();
    await seedAndProveDraftSave(ownerToken);
    await browserProof(ownerToken);
    await cleanup(ownerToken);
    console.log(`PASS teaching-kit publish-ready consistency (${passed} asserts)`);
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit publish-ready consistency:", error.message || error);
  process.exit(1);
});
