#!/usr/bin/env node
/**
 * Fix activity-image attachments for the four draft Teaching Kits.
 * - Generates unique activity-specific PNGs
 * - Uploads via enrichment-photos API
 * - Writes setupImageUrl into enrichment_draft only
 * - Clears wrong/extra images on NOT_NEEDED activities
 *
 * LLH_APPLY_PRODUCTION_DRAFTS=1 SITE_URL ADMIN_EMAIL ADMIN_PASSWORD ADMIN_ACCESS_CODE
 * Does NOT publish.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const enrichment = require("./teaching-kit-enrichment.js");
const { BY_TITLE } = require("./lib/teaching-kit-premium-drafts/quality-content-by-title.js");
const {
  TITLE_TO_IMAGE,
  generateAllMappedImages,
  OUT: IMAGE_OUT,
} = require("./lib/teaching-kit-premium-drafts/build-activity-images-v2.js");

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "leahivie@icloud.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const REPORT = path.join(__dirname, "..", "curriculum-drafts/teaching-kits-premium/image-fix-report.json");

const TARGET_IDS = [
  "cur-lp-infant-colors-all-around-us",
  "cur-lp-infant-black-white-discovery",
  "cur-lp-preschool-community-helpers",
  "cur-lp-preschool-weather-watchers",
];

/** Activities that should keep/receive an image (mapped). Others clear setupImageUrl. */
const KEEP_IMAGE_TITLES = new Set(Object.keys(TITLE_TO_IMAGE));

function text(v) {
  return String(v == null ? "" : v).trim();
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, SITE_URL);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: {
          ...(data
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
            : {}),
          ...headers,
        },
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
    if (data) req.write(data);
    req.end();
  });
}

async function login() {
  const res = await requestJson(
    "POST",
    "/api/admin/login",
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
    { "x-llh-admin-access-code": ADMIN_ACCESS_CODE },
  );
  if (res.status !== 200) throw new Error(`login ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.token || res.json.adminToken;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content ${res.status}`);
  return res.json.siteContent;
}

async function saveDraft(token, planId, enrichmentDraft, expectedUpdatedAt) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-plans",
    {
      saveMode: "enrichment_draft",
      expectedUpdatedAt: expectedUpdatedAt || "",
      adminEmail: ADMIN_EMAIL,
      lessonPlan: { id: planId, enrichmentDraft },
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function uploadSetupPhoto(token, lessonPlanId, activityKey, pngPath) {
  const buf = fs.readFileSync(pngPath);
  const fileData = `data:image/png;base64,${buf.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/enrichment-photos/upload",
    {
      adminToken: token,
      lessonPlanId,
      activityKey,
      field: "setupImageUrl",
      fileName: path.basename(pngPath),
      fileData,
    },
    { Authorization: `Bearer ${token}` },
  );
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    console.error("Set LLH_APPLY_PRODUCTION_DRAFTS=1");
    process.exit(2);
  }
  if (!ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    console.error("ADMIN_PASSWORD and ADMIN_ACCESS_CODE required");
    process.exit(2);
  }

  const written = await generateAllMappedImages();
  const localHashes = {};
  for (const rel of written) {
    localHashes[rel] = sha256(path.join(IMAGE_OUT, rel));
  }
  // uniqueness among local mapped files
  const byHash = {};
  Object.entries(localHashes).forEach(([rel, h]) => {
    byHash[h] = byHash[h] || [];
    byHash[h].push(rel);
  });
  const localDupes = Object.entries(byHash).filter(([, files]) => files.length > 1);
  if (localDupes.length) {
    throw new Error(`Local generated images not unique: ${JSON.stringify(localDupes)}`);
  }

  const token = await login();
  const report = {
    at: new Date().toISOString(),
    host: SITE_URL,
    generated: written,
    localUnique: true,
    kits: [],
    uploads: [],
    cleared: [],
    published: false,
  };

  for (const planId of TARGET_IDS) {
    let site = await loadSite(token);
    const plan = site.curriculum.lessonPlans.find((p) => p.id === planId);
    if (!plan) throw new Error(`missing ${planId}`);
    const prior = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
      : { activities: {}, week: {} };
    const list = enrichment.flattenLessonActivities(plan, site.curriculum.activities || [], prior);
    const activities = { ...(prior.activities || {}) };

    for (const act of list) {
      const key = text(act.id) || text(act.itemId);
      const title = text(act.title);
      const prev = activities[key] || {};
      const quality = BY_TITLE[title] || {};
      const next = { ...prev, title, dayOfWeek: act.dayOfWeek || prev.dayOfWeek };

      if (KEEP_IMAGE_TITLES.has(title)) {
        const rel = TITLE_TO_IMAGE[title];
        const pngPath = path.join(IMAGE_OUT, rel);
        const up = await uploadSetupPhoto(token, planId, key, pngPath);
        report.uploads.push({
          planId,
          title,
          activityKey: key,
          file: rel,
          http: up.status,
          error: up.json?.error || null,
          mediaUrl: up.json?.mediaUrl || up.json?.url || null,
          sha: localHashes[rel],
        });
        if (up.status !== 200) {
          throw new Error(`upload failed ${title}: ${up.status} ${up.json?.error || up.raw?.slice(0, 200)}`);
        }
        const mediaUrl = up.json.mediaUrl || up.json.url || up.json.setupImageUrl;
        if (!mediaUrl) throw new Error(`no mediaUrl for ${title}: ${JSON.stringify(up.json).slice(0, 300)}`);
        next.setupImageUrl = mediaUrl;
        next.imageRequirement = quality.imageRequirement || "required";
        next.imageBriefSetup = `Activity-specific setup for ${title}`;
      } else {
        // Clear leftover wrong images on activities that should not carry one
        if (prev.setupImageUrl || prev.exampleImageUrl) {
          report.cleared.push({ planId, title, activityKey: key, had: prev.setupImageUrl || prev.exampleImageUrl });
        }
        next.setupImageUrl = "";
        next.exampleImageUrl = "";
        next.imageRequirement = quality.imageRequirement || "not_needed";
        next.imageBriefSetup = "";
        next.imageBriefExample = "";
      }
      activities[key] = next;
    }

    // Keep proposedDailyPlans image URLs in sync for flatten path
    const proposed = prior.week?.proposedDailyPlans || {};
    const nextProposed = {};
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      const bucket = proposed[day] || {};
      nextProposed[day] = {
        ...bucket,
        items: (bucket.items || []).map((item) => {
          const key = text(item.id) || text(item.itemId) || text(item.activityId);
          const patch = activities[key] || {};
          return {
            ...item,
            setupImageUrl: patch.setupImageUrl || "",
            exampleImageUrl: patch.exampleImageUrl || "",
            imageRequirement: patch.imageRequirement || item.imageRequirement,
          };
        }),
      };
    });

    const enrichmentDraft = {
      ...prior,
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN_EMAIL,
      draftOnly: true,
      neverAutoPublish: true,
      activities,
      week: {
        ...(prior.week || {}),
        proposedDailyPlans: nextProposed,
        imageFixAt: new Date().toISOString(),
        imageFixNote: "Activity-specific unique setup images; cleared NOT_NEEDED leftovers",
      },
      meta: {
        ...(prior.meta || {}),
        imageFixAt: new Date().toISOString(),
        purpose: "Activity image quality fix — enrichment_draft only",
      },
    };

    site = await loadSite(token);
    const save = await saveDraft(token, planId, enrichmentDraft, site.updatedAt);
    if (save.status !== 200) {
      throw new Error(`save ${planId} ${save.status}: ${save.json?.error || save.raw?.slice(0, 200)}`);
    }

    report.kits.push({
      planId,
      title: plan.title,
      enrichmentPublished: Boolean(plan.enrichmentPublished),
      withImage: list.filter((a) => KEEP_IMAGE_TITLES.has(text(a.title))).map((a) => a.title),
      withoutImage: list.filter((a) => !KEEP_IMAGE_TITLES.has(text(a.title))).map((a) => a.title),
    });
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    generated: written.length,
    uploads: report.uploads.length,
    cleared: report.cleared.length,
    kits: report.kits.map((k) => ({
      id: k.planId,
      withImage: k.withImage.length,
      withoutImage: k.withoutImage.length,
    })),
    report: REPORT,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
