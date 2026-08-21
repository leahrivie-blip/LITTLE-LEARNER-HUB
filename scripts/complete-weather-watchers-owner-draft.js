#!/usr/bin/env node
/**
 * Complete Weather Watchers for Owner Admin review (enrichment DRAFT only).
 *
 * Target: cur-lp-preschool-weather-watchers only
 * - Does NOT publish enrichment
 * - Does NOT change lesson.status or Free/Pro
 * - Does NOT create a duplicate lesson
 * - Merges photo URLs into enrichmentDraft after upload (upload alone does not attach)
 *
 * Latch: LLH_APPLY_PRODUCTION_DRAFTS=1
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const {
  planMeta,
  activitiesByDay,
  removedActivityTitles,
} = require("./lib/teaching-kit-premium-drafts/kit-preschool-weather-watchers.js");
const { completeWeekMetaForAdmin, buildEnrichmentDraft } = require("./lib/teaching-kit-premium-drafts/shared.js");
const { BY_TITLE: QUALITY_BY_TITLE } = require("./lib/teaching-kit-premium-drafts/quality-content-by-title.js");
const { generateVisualProductionImage } = require("../server/visual-production-image.js");

const ROOT = path.join(__dirname, "..");
const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const PLAN_ID = "cur-lp-preschool-weather-watchers";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const OUT_DIR = path.join(ROOT, "curriculum-drafts/teaching-kits-premium");
const GEN_DIR = path.join(ROOT, "curriculum-drafts/weather-watchers-generated");
const REPORT_PATH = path.join(OUT_DIR, "weather-watchers-complete-report.json");

const PRINTABLES = [
  {
    title: "Weather Symbol Cards (draft)",
    rel: "printables/weather-watchers/weather-symbol-cards.pdf",
    pages: 5,
    purpose: "Daily weather identification for the class chart and sorting",
    teacherUse: "Hold up / place in chart day box during circle and helper time",
    childUse: "Choose the symbol that matches what they observe",
    why: "Children need a concrete symbol set to record observations — not filler vocab cards",
  },
  {
    title: "Weekly Weather Observation Chart (draft)",
    rel: "printables/weather-watchers/weekly-weather-observation-chart.pdf",
    pages: 1,
    purpose: "Mon–Fri class recording sheet for weather + air feel + notice line",
    teacherUse: "Post at child height; guide helpers to mark each day",
    childUse: "Place today’s symbol and talk about warm/cool/cold",
    why: "Core science habit of the week; chart helpers and meteorologist report depend on it",
  },
  {
    title: "Clothing for Weather Cards (draft)",
    rel: "printables/weather-watchers/clothing-for-weather-cards.pdf",
    pages: 4,
    purpose: "Match clothing objects to weather for dress-up and sorting",
    teacherUse: "Headers/prompts in dress-up, sort trays, and dress relay",
    childUse: "Choose gear that fits the weather card",
    why: "Supports clothing–weather connection without worksheets",
  },
];

/** Map live/kit titles → quality overlay titles (legacy names in quality file). */
const QUALITY_TITLE_ALIASES = {
  "Cloudy Day Process Art": "Cloud Cotton Art",
  "Rain Drop Sensory Investigate": "Rain Drop Sensory Play",
  "Windy Day Pinwheel Lab": "Windy Day Pinwheels",
  "Clothing and Season Sort": "Season Sorting Trays",
  "Weather Colors Process Painting": "Rainbow After Rain Art",
};

const IMAGE_PLAN = {
  "Weather Watchers Circle": { plan: "IMAGE_HELPFUL", generate: true },
  "Sunshine Movement Game": { plan: "IMAGE_NOT_NEEDED", generate: false },
  "Cloudy Day Process Art": { plan: "IMAGE_REQUIRED", generate: true },
  "Rain Drop Sensory Investigate": { plan: "IMAGE_REQUIRED", generate: true },
  "Weather Dress-Up Center": { plan: "IMAGE_REQUIRED", generate: true },
  "Windy Day Pinwheel Lab": { plan: "IMAGE_REQUIRED", generate: true },
  "Weather Chart Helpers": { plan: "IMAGE_NOT_NEEDED", generate: false },
  "Thunder Drum Experiment": { plan: "IMAGE_HELPFUL", generate: true },
  "Weather Book Nook": { plan: "IMAGE_NOT_NEEDED", generate: false },
  "Clothing and Season Sort": { plan: "IMAGE_HELPFUL", generate: true },
  "Weather Colors Process Painting": { plan: "IMAGE_REQUIRED", generate: true },
  "Weather Yoga and Rest": { plan: "IMAGE_NOT_NEEDED", generate: false },
  "Meteorologist Report Circle": { plan: "IMAGE_NOT_NEEDED", generate: false },
  "Weather Dress Relay": { plan: "IMAGE_HELPFUL", generate: true },
  "Weather Watchers Celebration": { plan: "IMAGE_NOT_NEEDED", generate: false },
};

const SETUP_PNG_BY_TITLE = {
  "Weather Watchers Circle": "weather-chart-setup.png",
  "Cloudy Day Process Art": "cloud-process-art-setup.png",
  "Rain Drop Sensory Investigate": "rain-sensory-setup.png",
  "Weather Dress-Up Center": "weather-dressup-setup.png",
  "Windy Day Pinwheel Lab": "wind-lab-setup.png",
  "Thunder Drum Experiment": "thunder-drum-setup.png",
  "Clothing and Season Sort": "clothing-sort-setup.png",
  "Weather Colors Process Painting": "weather-paint-setup.png",
  "Weather Dress Relay": "dress-relay-setup.png",
};

const SCENE_BRIEFS = {
  "Weather Watchers Circle":
    "Preschoolers gathered near a classroom window with a child-height weekly weather chart and large weather symbol cards; one child places a cloudy/sunny card on Monday while others look outside — natural classroom lighting, documentary photo.",
  "Cloudy Day Process Art":
    "Preschool art table with blue/gray paper, cotton, chalk, white washable paint and sponges; children exploring materials with smocks on — no finished sample cloud to copy; realistic mess.",
  "Rain Drop Sensory Investigate":
    "Shallow water sensory bin with cups and eyedroppers; preschoolers dripping and pouring water like rain, towels on floor, smocks — real daycare sensory table.",
  "Weather Dress-Up Center":
    "Dramatic play corner with raincoats, boots, hats, sunglasses and weather cards; children choosing gear for a weather card while looking in a mirror.",
  "Windy Day Pinwheel Lab":
    "Preschoolers testing pinwheels and scarves at a wind investigation tray; teacher-held small fan optional in background; curiosity faces not posed smiles.",
  "Thunder Drum Experiment":
    "Sound circle with small drums and metal pans; children tapping soft then louder; calm-down scarves nearby; preschool classroom.",
  "Clothing and Season Sort":
    "Table with four labeled trays and laminated clothing/weather picture cards; preschoolers sorting cards into sunny/rainy/cold/windy trays.",
  "Weather Colors Process Painting":
    "Easel/table painting with blue gray white tempera, brushes and sponges; children painting weather colors of their choice — no rainbow template.",
  "Weather Dress Relay":
    "Indoor/outdoor relay with three weather gear piles and cones; preschoolers carefully choosing one matching item for a called weather type.",
};

function text(v) {
  return String(v == null ? "" : v).trim();
}

function lines(v) {
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  return String(v || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function joinLines(v) {
  return lines(v).join("\n");
}

function numberedSteps(steps) {
  return lines(steps)
    .map((step, i) => (/^\d+\./.test(step) ? step : `${i + 1}. ${step}`))
    .join("\n");
}

function qualityFor(title) {
  const direct = QUALITY_BY_TITLE[title];
  if (direct) return direct;
  const alias = QUALITY_TITLE_ALIASES[title];
  return alias ? QUALITY_BY_TITLE[alias] || {} : {};
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, SITE_URL);
    const lib = u.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        timeout: 300000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw: raw.slice(0, 400) }; }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(300000, () => {
      req.destroy(new Error("request timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`Admin login failed (${res.status}): ${res.raw?.slice(0, 200)}`);
  }
  return res.json.token;
}

async function loadAdminSite(token) {
  const res = await requestJson("GET", "/api/admin/site-content", null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content failed (${res.status})`);
  return {
    updatedAt: res.json.siteContent?.updatedAt || "",
    curriculum: res.json.siteContent?.curriculum || {},
    siteContent: res.json.siteContent,
  };
}

function kitActivitiesFlat() {
  const out = [];
  WEEKDAYS.forEach((day) => {
    (activitiesByDay[day] || []).forEach((act, index) => {
      out.push({ ...act, dayOfWeek: day, index });
    });
  });
  return out;
}

function normalizeSubs(subs) {
  if (!Array.isArray(subs)) return [];
  return subs.map((s) => {
    if (s && typeof s === "object" && (s.need || s.use)) {
      return { need: text(s.need), use: text(s.use) };
    }
    const parts = String(s).split("→").map((p) => p.trim());
    if (parts.length === 2) return { need: parts[0], use: parts[1] };
    return { need: "If material unavailable", use: String(s) };
  }).filter((s) => s.need || s.use);
}

function buildActivityPatch(kitAct) {
  const q = qualityFor(kitAct.title);
  const imagePlan = IMAGE_PLAN[kitAct.title] || { plan: "IMAGE_NOT_NEEDED", generate: false };
  const prep = text(q.preparation) || joinLines(kitAct.preparation);
  const questions = text(q.teacherLanguage) || text(kitAct.teacherLanguage);
  const safety = text(q.safetyNotes) || text(kitAct.safetyNotes);
  const cleanup = text(q.cleanupTips) || text(kitAct.cleanupTips);
  const tips = lines(q.teacherTips?.length ? q.teacherTips : kitAct.teacherTips);
  const subs = normalizeSubs(q.substitutions?.length ? q.substitutions : kitAct.substitutions);
  const adaptations = text(q.adaptations) || text(kitAct.adaptations) || text(kitAct.ageModifications);
  const extensions = text(q.extensions) || text(kitAct.extensions);
  const mixedAge = text(q.mixedAgeAdaptations)
    || "Toddlers can join with simpler choices (two weather options). Older preschoolers can explain their choice in a full sentence.";
  const indoor = text(q.indoorAlternatives)
    || "Run fully indoors using window observation when outdoor weather is unsafe.";
  const outdoor = text(q.outdoorAlternatives)
    || "When conditions are safe, move observation or movement portions outdoors.";
  const challenge = text(kitAct.addedChallenge)
    || "Invite a child to teach a friend one weather word or to justify a clothing choice.";
  const support = text(kitAct.supportAdaptations)
    || adaptations
    || "Offer picture choices, hand-over-hand chart marking, or a peer buddy.";
  const materials = [
    ...lines(kitAct.materials),
    ...(q.materialsExtra ? [q.materialsExtra] : []),
  ];

  let imageRequirement = "not_needed";
  if (imagePlan.plan === "IMAGE_REQUIRED") imageRequirement = "required";
  else if (imagePlan.plan === "IMAGE_HELPFUL") imageRequirement = "optional";

  return {
    title: text(kitAct.title),
    dayOfWeek: text(kitAct.dayOfWeek),
    activityCategory: text(kitAct.activityCategory),
    ageModifications: text(kitAct.ageModifications) || "Preschool 3–5",
    durationMinutes: kitAct.durationMinutes || "",
    objective: text(kitAct.objective),
    description: text(kitAct.description),
    materials: joinLines(materials),
    preparation: prep,
    setup: text(kitAct.setup),
    steps: numberedSteps(kitAct.steps),
    teacherLanguage: questions,
    observationOpportunities: joinLines(kitAct.observationOpportunities),
    observationPrompts: lines(kitAct.observationOpportunities).slice(0, 3),
    safetyNotes: safety,
    cleanupTips: cleanup,
    teacherTips: tips,
    substitutions: subs,
    vocabulary: lines(kitAct.vocabulary),
    extensions,
    adaptations,
    supportAdaptations: support,
    addedChallenge: challenge,
    mixedAgeAdaptations: mixedAge,
    indoorAlternatives: indoor,
    outdoorAlternatives: outdoor,
    settingTags: lines(kitAct.settingTags || ["Indoor", "Small group"]),
    learningGoals: lines(kitAct.learningGoals),
    imageRequirement,
    imagePlan: imagePlan.plan,
    imageBriefSetup: text(SCENE_BRIEFS[kitAct.title] || kitAct.imageBriefSetup || kitAct.description),
    imageBriefExample: text(kitAct.imageBriefExample),
    decision: text(kitAct.decision) || "keep",
    replaces: text(kitAct.replaces || ""),
    replaceReason: text(kitAct.replaceReason || ""),
    printableDecision: text(q.printableDecision || ""),
    printableTitles: Array.isArray(q.printableTitles) ? q.printableTitles : [],
  };
}

function realisticPrompt(title, brief, diversityNote) {
  return [
    "REALISTIC_ACTIVITY_PHOTO of a real preschool childcare classroom in the United States.",
    `Activity: ${title}.`,
    `Scene: ${brief}.`,
    "Ages approximately 3–5 years. Natural child movement, not posing for the camera.",
    "Real daycare materials matching the activity. Natural indoor classroom lighting.",
    "Documentary childcare photography look — not stock, not glossy, not cartoon, not illustrated.",
    "No circle-head bubble people, no stick figures, no emoji faces, no gibberish text.",
    "No unsafe setups. No lightning outdoors. No adult staring at camera.",
    diversityNote,
    "Photorealistic, shallow depth of field, authentic mess where appropriate.",
  ].join(" ");
}

const DIVERSITY_NOTES = [
  "Include children with varied skin tones and hair textures naturally in the group.",
  "Feature at least one child with darker skin tone and textured hair in the frame.",
  "Feature children with different hairstyles and clothing styles naturally.",
  "Include mixed gender presentation among the children without stereotyping.",
  "Show a small mixed group with natural variation in appearance.",
];

async function generateRealisticPng(title, brief, index) {
  fs.mkdirSync(GEN_DIR, { recursive: true });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
  const outPath = path.join(GEN_DIR, `${slug}.png`);
  const prompt = realisticPrompt(title, brief, DIVERSITY_NOTES[index % DIVERSITY_NOTES.length]);
  const result = await generateVisualProductionImage({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    brief: {
      visualStyle: "REALISTIC_CLASSROOM",
      generationPrompt: prompt,
      overlayTextLines: [],
    },
  });
  fs.writeFileSync(outPath, result.buffer);
  return outPath;
}

async function saveEnrichmentDraft(token, expectedUpdatedAt, enrichmentDraft) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-plans",
    {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
      lessonPlan: {
        id: PLAN_ID,
        enrichmentDraft,
      },
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function uploadPrintable(token, title, pdfPath, expectedUpdatedAt) {
  const buf = fs.readFileSync(pdfPath);
  const fileData = `data:application/pdf;base64,${buf.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/resources/tk-printable",
    {
      action: "create",
      lessonPlanId: PLAN_ID,
      title,
      status: "draft",
      accessLevel: "free",
      fileName: path.basename(pdfPath),
      fileData,
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function uploadSetupPhoto(token, activityKey, pngPath) {
  const buf = fs.readFileSync(pngPath);
  const mime = pngPath.toLowerCase().endsWith(".jpg") || pngPath.toLowerCase().endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";
  const fileData = `data:${mime};base64,${buf.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/enrichment-photos/upload",
    {
      adminToken: token,
      lessonPlanId: PLAN_ID,
      activityKey,
      field: "setupImageUrl",
      fileName: path.basename(pngPath),
      fileData,
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function uploadCover(token, pngPath) {
  const buf = fs.readFileSync(pngPath);
  const mime = pngPath.toLowerCase().endsWith(".jpg") || pngPath.toLowerCase().endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";
  const fileData = `data:${mime};base64,${buf.toString("base64")}`;
  const up = await requestJson(
    "POST",
    "/api/admin/curriculum/lesson-covers/upload",
    {
      fileName: path.basename(pngPath),
      fileData,
      adminEmail: ADMIN_EMAIL,
    },
    { Authorization: `Bearer ${token}` },
  );
  if (up.status !== 200 || !up.json?.url) {
    return { upload: up, assign: null };
  }
  const assign = await requestJson(
    "POST",
    "/api/admin/curriculum/lesson-covers/assign",
    {
      assignments: [{
        id: PLAN_ID,
        coverImageUrl: up.json.url,
        coverImageAlt: "Preschool children exploring weather in a childcare classroom",
        coverImageSource: "uploaded",
        coverQualityStatus: "good",
      }],
    },
    { Authorization: `Bearer ${token}` },
  );
  return { upload: up, assign };
}

async function assignMappedCoverFallback(token) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-covers/assign",
    {
      assignments: [{
        id: PLAN_ID,
        coverImageUrl: "/images/lesson-covers/weather-watchers.jpg",
        coverImageAlt: "Weather Watchers preschool lesson cover",
        coverImageSource: "mapped",
        coverQualityStatus: "needs_upgrade",
      }],
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1");
    process.exit(2);
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    console.error("ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_ACCESS_CODE required");
    process.exit(2);
  }

  const report = {
    startedAt: new Date().toISOString(),
    planId: PLAN_ID,
    siteUrl: SITE_URL,
    steps: [],
    audit: { keep: [], improve: [], replace: [] },
    imagePlan: { required: [], helpful: [], notNeeded: [] },
    images: { created: [], skippedNoNeed: [], failed: [], usedFallback: [] },
    printables: [],
    cover: null,
    verify: null,
  };

  const kitActs = kitActivitiesFlat();
  kitActs.forEach((a) => {
    const d = String(a.decision || "keep").toLowerCase();
    if (d === "replace") report.audit.replace.push(a.title);
    else if (d === "improve") report.audit.improve.push(a.title);
    else report.audit.keep.push(a.title);
    const plan = IMAGE_PLAN[a.title]?.plan || "IMAGE_NOT_NEEDED";
    if (plan === "IMAGE_REQUIRED") report.imagePlan.required.push(a.title);
    else if (plan === "IMAGE_HELPFUL") report.imagePlan.helpful.push(a.title);
    else report.imagePlan.notNeeded.push(a.title);
  });

  const token = await login();
  let site = await loadAdminSite(token);
  const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
  if (!plan) throw new Error("Weather Watchers not found on production");
  const weatherCount = (site.curriculum.lessonPlans || []).filter((p) =>
    /weather\s*watchers/i.test(String(p.title || "")) || p.id === PLAN_ID
  ).length;
  if (weatherCount !== 1) throw new Error(`Expected exactly 1 Weather Watchers lesson, found ${weatherCount}`);

  report.before = {
    id: plan.id,
    title: plan.title,
    age: plan.age,
    status: plan.status,
    plan: plan.plan,
    activityCount: (site.curriculum.activities || []).filter((a) => a.lessonPlanId === PLAN_ID && a.status !== "archived").length,
    hasEnrichmentDraft: !!(plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"),
    coverImageUrl: plan.coverImageUrl || "",
  };
  console.log("TARGET", JSON.stringify(report.before, null, 2));

  // Skip re-uploading identical draft printable titles already linked
  const existingRes = (site.curriculum.resources || []).filter((r) =>
    (Array.isArray(r.lessonPlanIds) && r.lessonPlanIds.includes(PLAN_ID))
    || (Array.isArray(plan.resourceIds) && plan.resourceIds.includes(r.id))
  );
  const existingByTitle = new Map(existingRes.map((r) => [String(r.title || "").trim().toLowerCase(), r]));

  const printableIds = [];
  for (const meta of PRINTABLES) {
    const pdfPath = path.join(OUT_DIR, meta.rel);
    const existing = existingByTitle.get(meta.title.toLowerCase());
    if (existing?.id) {
      printableIds.push(existing.id);
      report.printables.push({
        ...meta,
        id: existing.id,
        status: existing.status || "draft",
        reused: true,
      });
      console.log("PRINTABLE REUSE", meta.title, existing.id);
      continue;
    }
    if (!fs.existsSync(pdfPath)) {
      report.printables.push({ title: meta.title, error: "missing_file", pages: meta.pages });
      continue;
    }
    site = await loadAdminSite(token);
    const up = await uploadPrintable(token, meta.title, pdfPath, site.updatedAt);
    if (up.status === 200) {
      const rid = up.json?.resource?.id || up.json?.resourceId;
      if (rid) printableIds.push(rid);
      report.printables.push({
        ...meta,
        id: rid || null,
        status: up.json?.resource?.status || "draft",
        reused: false,
      });
      console.log("PRINTABLE OK", meta.title, rid);
    } else {
      report.printables.push({ title: meta.title, error: up.json?.error || `HTTP ${up.status}`, pages: meta.pages });
      console.warn("PRINTABLE FAIL", meta.title, up.status, up.json?.error);
    }
  }
  report.steps.push("printables_uploaded");

  site = await loadAdminSite(token);
  const livePlan = (site.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
  const liveActs = (site.curriculum.activities || []).filter((a) => a.lessonPlanId === PLAN_ID && a.status !== "archived");
  const byTitle = new Map(liveActs.map((a) => [String(a.title || "").trim().toLowerCase(), a]));
  const priorDraft = livePlan.enrichmentDraft && typeof livePlan.enrichmentDraft === "object"
    ? livePlan.enrichmentDraft
    : { activities: {}, week: {} };

  const activities = {};
  const imageJobs = [];
  for (const kitAct of kitActs) {
    const live = byTitle.get(String(kitAct.title).trim().toLowerCase());
    if (!live?.id) {
      throw new Error(`Live activity missing for kit title “${kitAct.title}” — refusing to create duplicates`);
    }
    const patch = buildActivityPatch(kitAct);
    activities[live.id] = {
      ...(priorDraft.activities?.[live.id] || {}),
      ...patch,
      activityId: live.id,
      itemId: live.itemId,
      sourceKey: `${PLAN_ID}:${live.itemId}`,
    };
    activities[live.itemId] = { ...activities[live.id] };

    const planImg = IMAGE_PLAN[kitAct.title] || { plan: "IMAGE_NOT_NEEDED", generate: false };
    if (!planImg.generate) {
      report.images.skippedNoNeed.push({ title: kitAct.title, reason: planImg.plan });
    } else {
      imageJobs.push({
        activityKey: live.id,
        title: kitAct.title,
        brief: SCENE_BRIEFS[kitAct.title] || kitAct.imageBriefSetup || kitAct.description,
        fallback: SETUP_PNG_BY_TITLE[kitAct.title]
          ? path.join(ROOT, "images/teaching-kit-drafts/weather-watchers", SETUP_PNG_BY_TITLE[kitAct.title])
          : null,
        requirement: planImg.plan,
      });
    }
  }

  const baseDraft = buildEnrichmentDraft(planMeta, activitiesByDay, {
    printableIds,
    removedActivityTitles,
  });
  const weekMeta = completeWeekMetaForAdmin({
    ...planMeta,
    id: PLAN_ID,
    title: livePlan.title,
    age: livePlan.age,
  });

  let enrichmentDraft = {
    ...baseDraft,
    schemaVersion: 1,
    draftOnly: true,
    neverAutoPublish: true,
    previewReady: true,
    updatedAt: new Date().toISOString(),
    lastEditedBy: ADMIN_EMAIL || "owner-complete-script",
    activities,
    week: {
      ...baseDraft.week,
      weeklyOverview: weekMeta.weeklyOverview,
      objectives: Array.isArray(weekMeta.objectives) ? weekMeta.objectives.join("\n") : weekMeta.objectives,
      weeklyMaterials: Array.isArray(weekMeta.weeklyMaterials) ? weekMeta.weeklyMaterials.join("\n") : weekMeta.weeklyMaterials,
      familyConnection: weekMeta.familyConnection,
      adaptations: weekMeta.adaptations,
      vocabularyWords: Array.isArray(weekMeta.vocabularyWords) ? weekMeta.vocabularyWords.join("\n") : weekMeta.vocabularyWords,
      teacherPreparation: Array.isArray(weekMeta.teacherPreparation) ? weekMeta.teacherPreparation.join("\n") : weekMeta.teacherPreparation,
      observationFocus: Array.isArray(weekMeta.observationOpportunities)
        ? weekMeta.observationOpportunities.join("\n")
        : (weekMeta.teacherToolkit?.observationFocus || []).join("\n"),
      books: weekMeta.books,
      songs: weekMeta.songs,
      teacherToolkit: weekMeta.teacherToolkit,
      printableIdeas: weekMeta.printableIdeas,
      printableIds,
      vocabCards: weekMeta.vocabCards,
      milestones: weekMeta.milestones,
      researchSources: weekMeta.researchSources,
      draftOnly: true,
      neverAutoPublish: true,
    },
    proposedDailyPlans: livePlan.dailyPlans,
    meta: {
      ...(baseDraft.meta || {}),
      purpose: "Weather Watchers complete for Owner Admin review — enrichment_draft only; do not auto-publish",
      sourceLessonId: PLAN_ID,
      completedAt: new Date().toISOString(),
    },
  };

  let save = await saveEnrichmentDraft(token, site.updatedAt, enrichmentDraft);
  if (save.status !== 200) {
    throw new Error(`enrichment_draft save failed (${save.status}): ${save.json?.error || save.raw?.slice(0, 300)}`);
  }
  console.log("ENRICHMENT DRAFT SAVED");
  report.steps.push("enrichment_draft_saved");

  let imgIndex = 0;
  let coverCandidatePath = null;
  for (const job of imageJobs) {
    let pngPath = null;
    let source = "fallback";
    try {
      if (process.env.OPENAI_API_KEY) {
        console.log("GEN START", job.title);
        pngPath = await generateRealisticPng(job.title, job.brief, imgIndex);
        source = "openai_realistic";
        const st = fs.statSync(pngPath);
        if (st.size < 20000) throw new Error("generated image too small");
      }
    } catch (error) {
      report.images.failed.push({ title: job.title, error: error.message || String(error), stage: "generate" });
      console.warn("GEN FAIL", job.title, error.message);
      pngPath = null;
    }
    if (!pngPath && job.fallback && fs.existsSync(job.fallback)) {
      pngPath = job.fallback;
      source = "kit_fallback_setup";
      report.images.usedFallback.push(job.title);
    }
    if (!pngPath) {
      report.images.failed.push({ title: job.title, error: "no_image_available" });
      imgIndex += 1;
      continue;
    }

    const up = await uploadSetupPhoto(token, job.activityKey, pngPath);
    if (up.status === 200 && up.json?.mediaUrl) {
      const url = up.json.mediaUrl;
      const assetId = up.json.mediaAssetId || "";
      activities[job.activityKey].setupImageUrl = url;
      activities[job.activityKey].setupMediaAssetId = assetId;
      if (activities[activities[job.activityKey].itemId]) {
        activities[activities[job.activityKey].itemId].setupImageUrl = url;
        activities[activities[job.activityKey].itemId].setupMediaAssetId = assetId;
      }
      report.images.created.push({
        title: job.title,
        activityKey: job.activityKey,
        requirement: job.requirement,
        source,
        url: String(url).slice(0, 160),
        mediaAssetId: assetId,
        localPath: pngPath,
      });
      if (source === "openai_realistic" && !coverCandidatePath) {
        coverCandidatePath = pngPath;
      }
      // Prefer art/sensory scenes for cover when available
      if (source === "openai_realistic" && /Process Art|Process Painting|Sensory|Dress-Up|Pinwheel/.test(job.title)) {
        coverCandidatePath = pngPath;
      }
      console.log("IMAGE OK", job.title, source);
    } else {
      report.images.failed.push({ title: job.title, error: up.json?.error || `HTTP ${up.status}`, stage: "upload" });
      console.warn("IMAGE UPLOAD FAIL", job.title, up.status, up.json?.error);
    }
    imgIndex += 1;
  }
  report.steps.push("images_processed");

  enrichmentDraft = {
    ...enrichmentDraft,
    activities: { ...activities },
    week: {
      ...enrichmentDraft.week,
      printableIds,
    },
    draftOnly: true,
    neverAutoPublish: true,
    previewReady: true,
    updatedAt: new Date().toISOString(),
    lastEditedBy: ADMIN_EMAIL || "owner-complete-script",
  };
  site = await loadAdminSite(token);
  save = await saveEnrichmentDraft(token, site.updatedAt, enrichmentDraft);
  if (save.status !== 200) {
    throw new Error(`post-photo enrichment_draft save failed (${save.status}): ${save.json?.error || save.raw?.slice(0, 300)}`);
  }
  report.steps.push("enrichment_draft_resaved");

  // Cover: prefer strongest realistic activity photo; else mapped fallback
  site = await loadAdminSite(token);
  if (coverCandidatePath && fs.existsSync(coverCandidatePath)) {
    const coverRes = await uploadCover(token, coverCandidatePath);
    report.cover = {
      mode: "uploaded_activity_scene",
      uploadStatus: coverRes.upload?.status,
      assignStatus: coverRes.assign?.status,
      ok: coverRes.upload?.status === 200 && coverRes.assign?.status === 200,
      url: coverRes.upload?.json?.url || null,
      error: coverRes.upload?.json?.error || coverRes.assign?.json?.error || null,
      sourceFile: path.basename(coverCandidatePath),
    };
  } else {
    const coverRes = await assignMappedCoverFallback(token);
    report.cover = {
      mode: "mapped_fallback",
      status: coverRes.status,
      ok: coverRes.status === 200,
      error: coverRes.json?.error || null,
      assigned: coverRes.json?.updated?.[0] || null,
    };
  }
  console.log("COVER", report.cover);
  report.steps.push("cover_assigned");

  site = await loadAdminSite(token);
  const finalPlan = (site.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
  const finalActs = (site.curriculum.activities || []).filter((a) => a.lessonPlanId === PLAN_ID && a.status !== "archived");
  const draft = finalPlan?.enrichmentDraft || {};
  const draftActKeys = Object.keys(draft.activities || {}).filter((k) => k.startsWith("cur-act-"));
  const withImages = draftActKeys.filter((k) => {
    const a = draft.activities[k];
    return !!(a?.setupImageUrl || a?.exampleImageUrl);
  });
  const linkedRes = (site.curriculum.resources || []).filter((r) =>
    (Array.isArray(r.lessonPlanIds) && r.lessonPlanIds.includes(PLAN_ID))
    || (Array.isArray(finalPlan.resourceIds) && finalPlan.resourceIds.includes(r.id))
    || (Array.isArray(draft.week?.printableIds) && draft.week.printableIds.includes(r.id))
  );

  const weatherLessons = (site.curriculum.lessonPlans || []).filter((p) =>
    /weather\s*watchers/i.test(String(p.title || "")) || p.id === PLAN_ID
  );

  // Ensure resources only link to this lesson (not accidentally multi-linked wrongly)
  const badLinks = linkedRes.filter((r) => {
    const ids = r.lessonPlanIds || [];
    return ids.some((id) => id !== PLAN_ID);
  });

  report.verify = {
    id: finalPlan?.id,
    title: finalPlan?.title,
    age: finalPlan?.age,
    status: finalPlan?.status,
    plan: finalPlan?.plan,
    activityCount: finalActs.length,
    enrichmentDraftPresent: !!draft && Object.keys(draft.activities || {}).length > 0,
    draftActivityCount: draftActKeys.length,
    draftActivitiesWithImages: withImages.length,
    printableIds: draft.week?.printableIds || printableIds,
    linkedResourceCount: linkedRes.length,
    linkedResources: linkedRes.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      lessonPlanIds: r.lessonPlanIds || [],
    })),
    multiLessonResourceLinks: badLinks.map((r) => ({ id: r.id, lessonPlanIds: r.lessonPlanIds })),
    coverImageUrl: (finalPlan?.coverImageUrl || "").slice(0, 200),
    weatherLessonCount: weatherLessons.length,
    freeProUnchanged: finalPlan?.plan === report.before.plan,
    statusUnchanged: finalPlan?.status === report.before.status,
    idUnchanged: finalPlan?.id === PLAN_ID,
    enrichmentPublished: !!(finalPlan?.enrichmentPublished && typeof finalPlan.enrichmentPublished === "object"
      && Object.keys(finalPlan.enrichmentPublished).length > 0),
    publishedUnchangedFlag: save.json?.publishedUnchanged,
  };

  if (!report.verify.freeProUnchanged) throw new Error("Free/Pro changed — abort");
  if (!report.verify.statusUnchanged) throw new Error("Lesson status changed — abort");
  if (report.verify.weatherLessonCount !== 1) throw new Error("Duplicate Weather Watchers detected");
  if (report.verify.enrichmentPublished) throw new Error("Enrichment was published unexpectedly");

  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("\nREPORT", REPORT_PATH);
  console.log(JSON.stringify({
    verify: report.verify,
    auditCounts: {
      keep: report.audit.keep.length,
      improve: report.audit.improve.length,
      replace: report.audit.replace.length,
    },
    imagesCreated: report.images.created.length,
    imagesSkipped: report.images.skippedNoNeed.length,
    printables: report.printables.map((p) => ({ title: p.title, id: p.id, pages: p.pages })),
    cover: report.cover,
  }, null, 2));
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
