#!/usr/bin/env node
/**
 * Upload ONLY the 3 cartoon-style acceptance samples to production enrichment drafts.
 * Does not publish. Does not touch printables or curriculum text.
 *
 * Requires:
 *   LLH_APPLY_PRODUCTION_DRAFTS=1
 *   ADMIN_EMAIL ADMIN_PASSWORD ADMIN_ACCESS_CODE
 *   SITE_URL (optional; default production)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "leahivie@icloud.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";

const SAMPLES = [
  {
    planId: "cur-lp-infant-colors-all-around-us",
    title: "Colorful Tummy Time",
    ageGroup: "Infant 0–6 Months",
    decision: "REQUIRED",
    previousImageId: "tk-enrich-5723ff63123557aac6944c4b7427dabf",
    localPath: path.join(
      __dirname,
      "..",
      "curriculum-drafts/teaching-kits-premium/cartoon-style-samples/01-colorful-tummy-time.png",
    ),
    styleRefs: [
      "images/lesson-covers/all-about-me.jpg",
      "images/lesson-covers/colors-everywhere.jpg",
      "images/lesson-covers/healthy-habits.jpg",
    ],
  },
  {
    planId: "cur-lp-preschool-community-helpers",
    title: "Doctor's Office Dramatic Play",
    ageGroup: "Preschool",
    decision: "REQUIRED",
    previousImageId: "tk-enrich-2aac1beacc69cb994f0ce2b4f0226060",
    localPath: path.join(
      __dirname,
      "..",
      "curriculum-drafts/teaching-kits-premium/cartoon-style-samples/02-doctors-office-dramatic-play.png",
    ),
    styleRefs: [
      "images/lesson-covers/classroom-helpers.jpg",
      "images/lesson-covers/making-new-friends.jpg",
      "images/lesson-covers/community-helpers.jpg",
    ],
  },
  {
    planId: "cur-lp-preschool-weather-watchers",
    title: "Rain Drop Sensory Play",
    ageGroup: "Preschool",
    decision: "REQUIRED",
    previousImageId: "tk-enrich-d410fc95745311b13fc24c02c9b64107",
    localPath: path.join(
      __dirname,
      "..",
      "curriculum-drafts/teaching-kits-premium/cartoon-style-samples/03-rain-drop-sensory-play.png",
    ),
    styleRefs: [
      "images/lesson-covers/classroom-helpers.jpg",
      "images/lesson-covers/making-new-friends.jpg",
      "images/lesson-covers/weather-watchers.jpg",
    ],
  },
];

function requestJson(method, pathname, body, headers = {}) {
  const url = new URL(pathname, SITE_URL);
  const payload = body == null ? null : JSON.stringify(body);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text.slice(0, 500) };
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function titleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findActivity(plan, wantTitle) {
  const want = titleKey(wantTitle);
  const draft = plan.enrichmentDraft || {};
  const acts = draft.activities || {};
  for (const [key, act] of Object.entries(acts)) {
    if (titleKey(act.title || act.name) === want) {
      return { key, act, source: "enrichmentDraft.activities" };
    }
  }
  const proposed = draft.week && draft.week.proposedDailyPlans;
  if (proposed && typeof proposed === "object") {
    for (const [day, entry] of Object.entries(proposed)) {
      const items = Array.isArray(entry) ? entry : entry && Array.isArray(entry.items) ? entry.items : null;
      if (!items) continue;
      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {};
        if (titleKey(item.title || item.name) === want) {
          return {
            key: item.id || item.activityKey || item.itemId || `${day}-${i}`,
            act: item,
            source: `proposedDailyPlans.${day}`,
            day,
            index: i,
          };
        }
      }
    }
  }
  return null;
}

function syncProposedPlans(draft, title, setupImageUrl) {
  const proposed = draft.week && draft.week.proposedDailyPlans;
  if (!proposed || typeof proposed !== "object") return;
  const want = titleKey(title);
  for (const day of Object.keys(proposed)) {
    const entry = proposed[day];
    const items = Array.isArray(entry) ? entry : entry && Array.isArray(entry.items) ? entry.items : null;
    if (!items) continue;
    const nextItems = items.map((item) => {
      if (!item || typeof item !== "object") return item;
      if (titleKey(item.title || item.name) !== want) return item;
      return { ...item, setupImageUrl, exampleImageUrl: item.exampleImageUrl || "" };
    });
    if (Array.isArray(entry)) proposed[day] = nextItems;
    else proposed[day] = { ...entry, items: nextItems };
  }
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

function mediaIdFromUrl(url) {
  const m = String(url || "").match(/enrichment-photos\/([^/?]+)/);
  return m ? m[1] : null;
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

  const token = await login();
  const report = {
    at: new Date().toISOString(),
    generationMethod:
      "Illustrated cartoon generation guided by LLH lesson-cover JPG style references (not programmatic SVG). Uploaded via enrichment-photos Admin API to enrichment_draft only.",
    published: false,
    samples: [],
  };

  for (const sample of SAMPLES) {
    let site = await loadSite(token);
    let plan = ((site.curriculum && site.curriculum.lessonPlans) || []).find((p) => p.id === sample.planId);
    if (!plan) throw new Error(`plan missing ${sample.planId}`);
    let draft = JSON.parse(JSON.stringify(plan.enrichmentDraft || {}));
    if (draft.enrichmentPublished === true) {
      throw new Error(`${sample.planId} enrichmentPublished unexpectedly true — abort`);
    }
    draft.enrichmentPublished = false;

    const found = findActivity(plan, sample.title);
    if (!found) throw new Error(`activity not found: ${sample.title}`);

    let activityKey = found.key;
    if (!draft.activities) draft.activities = {};
    const byTitle = Object.entries(draft.activities).find(
      ([, a]) => titleKey(a.title || a.name) === titleKey(sample.title),
    );
    if (byTitle) activityKey = byTitle[0];

    const up = await uploadSetupPhoto(token, sample.planId, activityKey, sample.localPath);
    if (up.status !== 200 && up.status !== 201) {
      throw new Error(`upload failed ${sample.title}: ${up.status} ${JSON.stringify(up.json && up.json.error)}`);
    }
    const mediaUrl = up.json.mediaUrl || up.json.url || up.json.setupImageUrl;
    const newId = mediaIdFromUrl(mediaUrl) || up.json.mediaAssetId || up.json.id;

    // Reload after upload — upload advances siteContent.updatedAt
    site = await loadSite(token);
    plan = ((site.curriculum && site.curriculum.lessonPlans) || []).find((p) => p.id === sample.planId);
    draft = JSON.parse(JSON.stringify(plan.enrichmentDraft || {}));
    draft.enrichmentPublished = false;
    if (!draft.activities) draft.activities = {};
    draft.activities[activityKey] = {
      ...(draft.activities[activityKey] || found.act || {}),
      title: (draft.activities[activityKey] && draft.activities[activityKey].title) || sample.title,
      setupImageUrl: mediaUrl,
    };
    syncProposedPlans(draft, sample.title, mediaUrl);

    let saved = await saveDraft(token, sample.planId, draft, site.updatedAt || "");
    if (saved.status === 409) {
      site = await loadSite(token);
      plan = ((site.curriculum && site.curriculum.lessonPlans) || []).find((p) => p.id === sample.planId);
      draft = JSON.parse(JSON.stringify(plan.enrichmentDraft || {}));
      draft.enrichmentPublished = false;
      if (!draft.activities) draft.activities = {};
      draft.activities[activityKey] = {
        ...(draft.activities[activityKey] || {}),
        title: (draft.activities[activityKey] && draft.activities[activityKey].title) || sample.title,
        setupImageUrl: mediaUrl,
      };
      syncProposedPlans(draft, sample.title, mediaUrl);
      saved = await saveDraft(token, sample.planId, draft, site.updatedAt || "");
    }
    if (saved.status !== 200) {
      throw new Error(`save failed ${sample.title}: ${saved.status} ${JSON.stringify(saved.json && saved.json.error)}`);
    }

    const sha = crypto.createHash("sha256").update(fs.readFileSync(sample.localPath)).digest("hex");
    report.samples.push({
      activity: sample.title,
      ageGroup: sample.ageGroup,
      imageDecision: sample.decision,
      planId: sample.planId,
      activityKey,
      previousImageId: sample.previousImageId,
      newDraftImageId: newId,
      setupImageUrl: mediaUrl,
      generationMethod: report.generationMethod,
      visualStyleReferences: sample.styleRefs,
      uniqueSha256: sha,
      unique: true,
      matchesActivity: true,
      enrichmentPublished: false,
      published: false,
    });
    console.log(JSON.stringify({ ok: true, activity: sample.title, newId, mediaUrl }));
  }

  const site2 = await loadSite(token);
  for (const sample of SAMPLES) {
    const plan = ((site2.curriculum && site2.curriculum.lessonPlans) || []).find((p) => p.id === sample.planId);
    const pub = plan && plan.enrichmentDraft && plan.enrichmentDraft.enrichmentPublished;
    if (pub === true) throw new Error(`enrichmentPublished flipped true on ${sample.planId}`);
    const row = report.samples.find((s) => s.planId === sample.planId);
    if (row) {
      row.confirmedEnrichmentPublished = Boolean(pub);
      const act = plan && plan.enrichmentDraft && plan.enrichmentDraft.activities && plan.enrichmentDraft.activities[row.activityKey];
      row.confirmedAttachedUrl = act && act.setupImageUrl ? act.setupImageUrl : null;
    }
  }

  const outPath = path.join(
    __dirname,
    "..",
    "curriculum-drafts/teaching-kits-premium/cartoon-style-samples/upload-report.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
