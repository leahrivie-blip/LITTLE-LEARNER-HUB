"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const sharp = require("sharp");
const { generateVisualProductionImage } = require("../../../server/visual-production-image.js");

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

function requestJson(method, urlPath, body, headers = {}, siteUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, siteUrl);
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
    req.setTimeout(300000, () => req.destroy(new Error("request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function createClient(env = process.env) {
  const siteUrl = String(env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
  const adminEmail = env.ADMIN_EMAIL || "";
  const adminPassword = env.ADMIN_PASSWORD || "";
  const adminAccessCode = env.ADMIN_ACCESS_CODE || "";

  async function login() {
    const res = await requestJson("POST", "/api/admin/login", {
      email: adminEmail,
      password: adminPassword,
      code: adminAccessCode,
    }, {}, siteUrl);
    if (res.status !== 200 || !res.json?.token) {
      throw new Error(`Admin login failed (${res.status})`);
    }
    return res.json.token;
  }

  async function loadAdminSite(token) {
    const res = await requestJson("GET", "/api/admin/site-content", null, {
      Authorization: `Bearer ${token}`,
    }, siteUrl);
    if (res.status === 401) {
      const error = new Error("site-content failed (401)");
      error.code = "admin_session_expired";
      throw error;
    }
    if (res.status !== 200) throw new Error(`site-content failed (${res.status})`);
    return {
      updatedAt: res.json.siteContent?.updatedAt || "",
      curriculum: res.json.siteContent?.curriculum || {},
    };
  }

  /** Re-login helper for long image-generation runs (sessions can expire). */
  async function ensureToken(tokenRef) {
    try {
      await loadAdminSite(tokenRef.token);
      return tokenRef.token;
    } catch (error) {
      if (error.code !== "admin_session_expired" && !/401/.test(String(error.message || ""))) throw error;
      tokenRef.token = await login();
      return tokenRef.token;
    }
  }

  async function saveEnrichmentDraft(token, planId, expectedUpdatedAt, enrichmentDraft) {
    return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail,
      lessonPlan: { id: planId, enrichmentDraft },
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  /**
   * Persist enrichment into the real lesson/activity records Owner Admin edits.
   * Uses existing saveMode "publish_enrichment" (Apply enrichment):
   * - merges draft fields + photos onto live activities/plan
   * - clears enrichmentDraft
   * - does NOT change lesson status (never sets operatorOwnerPublish)
   * - promotes draft printables only when the lesson is already public
   */
  async function applyEnrichmentToLiveLesson(token, planId, expectedUpdatedAt, enrichmentDraft) {
    return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      saveMode: "publish_enrichment",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail,
      publishedBy: adminEmail || "owner-complete-script",
      lessonPlan: {
        id: planId,
        enrichmentDraft: enrichmentDraft || undefined,
      },
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  /**
   * Re-sync curriculum.activities from the lesson dailyPlans (same path Owner Admin
   * full lesson save uses). Needed so activity fields that landed on dailyPlans
   * appear in the activity records the lesson editor reads.
   * Preserves status / Free-Pro / cover; does not set operatorOwnerPublish.
   */
  async function syncLiveActivitiesFromDailyPlans(token, planId, expectedUpdatedAt) {
    const site = await loadAdminSite(token);
    const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
    if (!plan) throw new Error(`syncLiveActivities: lesson ${planId} not found`);
    return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: expectedUpdatedAt || site.updatedAt || "",
      adminEmail,
      lessonPlan: {
        ...plan,
        // Explicit identity — never invent a status change.
        id: planId,
        status: plan.status,
        plan: plan.plan,
      },
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  /**
   * Readiness against live curriculum activities (same source as Owner Admin lesson editor).
   * READY is forbidden while completed content exists only in an unapplied enrichmentDraft.
   */
  function assertLiveLessonComplete(site, planId, {
    expectedActivityCount = 15,
    minImages = 0,
    requiredResourceIds = [],
  } = {}) {
    const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
    if (!plan) return { ok: false, errors: [`lesson ${planId} missing`] };
    const errors = [];
    const draft = plan.enrichmentDraft;
    const draftKeys = draft && typeof draft === "object"
      ? Object.keys(draft.activities || {}).filter((k) => k.startsWith("cur-act-"))
      : [];
    if (draftKeys.length) {
      errors.push(`enrichmentDraft still has ${draftKeys.length} activities — content not persisted to live lesson`);
    }
    const live = (site.curriculum.activities || []).filter(
      (a) => a.lessonPlanId === planId && a.status !== "archived",
    );
    if (live.length !== expectedActivityCount) {
      errors.push(`live activities=${live.length} expected ${expectedActivityCount}`);
    }
    const requiredFields = [
      "objective", "description", "materials", "steps", "teacherLanguage", "safetyNotes",
    ];
    const blank = [];
    for (const a of live) {
      for (const f of requiredFields) {
        const v = a[f];
        const ok = Array.isArray(v) ? v.length > 0 : String(v || "").trim().length > 0;
        if (!ok) blank.push(`${a.title}.${f}`);
      }
    }
    if (blank.length) {
      errors.push(`live blank fields (${blank.length}): ${blank.slice(0, 6).join("; ")}`);
    }
    const withImg = live.filter((a) => a.setupImageUrl || a.exampleImageUrl);
    if (withImg.length < minImages) {
      errors.push(`live images=${withImg.length} expected >= ${minImages}`);
    }
    const resources = site.curriculum.resources || [];
    for (const rid of requiredResourceIds) {
      const r = resources.find((x) => x.id === rid);
      if (!r) errors.push(`resource missing ${rid}`);
      else if (!(r.lessonPlanIds || []).includes(planId) && !(plan.resourceIds || []).includes(rid)) {
        errors.push(`resource ${rid} not linked`);
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      liveActivityCount: live.length,
      liveImageCount: withImg.length,
      draftActivityCount: draftKeys.length,
      status: plan.status,
      plan: plan.plan,
      coverImageUrl: plan.coverImageUrl || "",
      title: plan.title,
      age: plan.age,
    };
  }

  async function uploadSetupPhoto(token, planId, activityKey, pngPath) {
    const buf = fs.readFileSync(pngPath);
    const mime = /\.jpe?g$/i.test(pngPath) ? "image/jpeg" : "image/png";
    const fileData = `data:${mime};base64,${buf.toString("base64")}`;
    return requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
      adminToken: token,
      lessonPlanId: planId,
      activityKey,
      field: "setupImageUrl",
      fileName: path.basename(pngPath),
      fileData,
      adminEmail,
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  async function uploadCoverJpeg(token, planId, jpegPath, alt) {
    const buf = fs.readFileSync(jpegPath);
    const fileData = `data:image/jpeg;base64,${buf.toString("base64")}`;
    const up = await requestJson("POST", "/api/admin/curriculum/lesson-covers/upload", {
      fileName: path.basename(jpegPath),
      fileData,
      adminToken: token,
      adminEmail,
    }, { Authorization: `Bearer ${token}` }, siteUrl);
    if (up.status !== 200 || !up.json?.url) return { upload: up, assign: null };
    const assign = await requestJson("POST", "/api/admin/curriculum/lesson-covers/assign", {
      adminToken: token,
      assignments: [{
        id: planId,
        coverImageUrl: up.json.url,
        coverImageAlt: alt || "Classroom activity photo",
        coverImageSource: "uploaded",
        coverQualityStatus: "good",
      }],
    }, { Authorization: `Bearer ${token}` }, siteUrl);
    return { upload: up, assign };
  }

  async function replacePrintablePdf(token, planId, resourceId, pdfPath, expectedUpdatedAt) {
    const buf = fs.readFileSync(pdfPath);
    const fileData = `data:application/pdf;base64,${buf.toString("base64")}`;
    return requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "replace_pdf",
      lessonPlanId: planId,
      resourceId,
      fileName: path.basename(pdfPath),
      fileData,
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail,
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  async function createPrintable(token, planId, title, pdfPath, expectedUpdatedAt, accessLevel = "free") {
    const buf = fs.readFileSync(pdfPath);
    const fileData = `data:application/pdf;base64,${buf.toString("base64")}`;
    return requestJson("POST", "/api/admin/curriculum/resources/tk-printable", {
      action: "create",
      lessonPlanId: planId,
      title,
      status: "draft",
      accessLevel,
      fileName: path.basename(pdfPath),
      fileData,
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail,
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  async function renameLessonTitle(token, planId, newTitle, expectedUpdatedAt) {
    const site = await loadAdminSite(token);
    const existing = (site.curriculum.lessonPlans || []).find((p) => p.id === planId);
    if (!existing) throw new Error(`rename: lesson ${planId} not found`);
    const lessonPlan = {
      ...existing,
      title: newTitle,
      enrichmentDraft: existing.enrichmentDraft || undefined,
    };
    return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: expectedUpdatedAt || site.updatedAt || "",
      adminEmail,
      lessonPlan,
    }, { Authorization: `Bearer ${token}` }, siteUrl);
  }

  return {
    siteUrl,
    adminEmail,
    login,
    loadAdminSite,
    ensureToken,
    saveEnrichmentDraft,
    applyEnrichmentToLiveLesson,
    syncLiveActivitiesFromDailyPlans,
    assertLiveLessonComplete,
    uploadSetupPhoto,
    uploadCoverJpeg,
    replacePrintablePdf,
    createPrintable,
    renameLessonTitle,
  };
}

const DIVERSITY_NOTES = [
  "Include children with varied skin tones and hair textures naturally in the group.",
  "Feature at least one child with darker skin tone and textured hair in the frame.",
  "Feature children with different hairstyles and clothing styles naturally.",
  "Include mixed gender presentation among the children without stereotyping.",
  "Show a small mixed group with natural variation in appearance.",
];

async function generateRealisticActivityPng({ title, brief, index, outPath, ageLabel }) {
  const prompt = [
    "REALISTIC_ACTIVITY_PHOTO of a real childcare classroom in the United States.",
    `Age group: ${ageLabel}.`,
    `Activity: ${title}.`,
    `Scene: ${brief}.`,
    "Natural child movement, not posing for the camera.",
    "Real daycare materials matching the activity. Natural classroom lighting.",
    "Documentary childcare photography — not stock, not glossy, not cartoon, not illustrated.",
    "No circle-head bubble people, no stick figures, no emoji faces, no gibberish text.",
    "No unsafe setups. No adult staring at camera.",
    DIVERSITY_NOTES[index % DIVERSITY_NOTES.length],
    "Photorealistic, shallow depth of field, authentic mess where appropriate.",
  ].join(" ");
  const result = await generateVisualProductionImage({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    brief: {
      visualStyle: "REALISTIC_CLASSROOM",
      generationPrompt: prompt,
      overlayTextLines: [],
    },
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.buffer);
  return outPath;
}

async function compressCoverJpeg(srcPng, outJpg) {
  await sharp(srcPng).resize(1536, 1024, { fit: "cover" }).jpeg({ quality: 78, mozjpeg: true }).toFile(outJpg);
  return outJpg;
}

function mergeActivityPatch(live, overlay) {
  const o = overlay || {};
  const materials = joinLines(o.materials || live.materials);
  const preparation = text(o.preparation || live.preparation);
  const setup = text(o.setup || live.setup);
  const steps = numberedSteps(o.steps || live.steps);
  const questions = text(o.teacherLanguage || live.teacherLanguage);
  const observation = joinLines(o.observationOpportunities || live.observationOpportunities);
  return {
    title: text(live.title),
    dayOfWeek: text(live.dayOfWeek || o.dayOfWeek),
    activityCategory: text(o.activityCategory || live.activityCategory),
    ageModifications: text(o.ageModifications || live.ageModifications || o.age || ""),
    durationMinutes: o.durationMinutes != null ? o.durationMinutes : (live.durationMinutes || ""),
    objective: text(o.objective || live.objective),
    description: text(o.description || live.description),
    materials,
    preparation,
    setup,
    steps,
    teacherLanguage: questions,
    observationOpportunities: observation,
    observationPrompts: lines(o.observationPrompts || observation).slice(0, 3),
    safetyNotes: text(o.safetyNotes || live.safetyNotes),
    cleanupTips: text(o.cleanupTips || live.cleanupTips),
    teacherTips: lines(o.teacherTips || live.teacherTips),
    substitutions: Array.isArray(o.substitutions) ? o.substitutions : [],
    vocabulary: lines(o.vocabulary || live.vocabulary),
    extensions: text(o.extensions || live.extensions || o.addedChallenge || ""),
    adaptations: text(o.adaptations || live.adaptations || o.supportAdaptations || ""),
    supportAdaptations: text(o.supportAdaptations || o.adaptations || ""),
    addedChallenge: text(o.addedChallenge || o.extensions || ""),
    mixedAgeAdaptations: text(o.mixedAgeAdaptations || ""),
    indoorAlternatives: text(o.indoorAlternatives || ""),
    outdoorAlternatives: text(o.outdoorAlternatives || ""),
    learningGoals: lines(o.learningGoals),
    imageRequirement: text(o.imageRequirement || "not_needed"),
    imagePlan: text(o.imagePlan || "IMAGE_NOT_NEEDED"),
    imageBriefSetup: text(o.imageBriefSetup || ""),
    decision: text(o.decision || "improve"),
    replaces: text(o.replaces || ""),
    replaceReason: text(o.replaceReason || ""),
    printableDecision: text(o.printableDecision || ""),
  };
}

module.exports = {
  text,
  lines,
  joinLines,
  numberedSteps,
  createClient,
  generateRealisticActivityPng,
  compressCoverJpeg,
  mergeActivityPatch,
};
