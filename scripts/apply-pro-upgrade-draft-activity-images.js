#!/usr/bin/env node
/**
 * Generate Priority 1 activity images via Visual Production (realistic),
 * then upload into enrichment_draft setup/example image fields.
 * NEVER publishes. NEVER auto-attaches via VP attach (blocked by design).
 *
 * Env: SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE
 * Requires: LLH_APPLY_PRODUCTION_DRAFTS=1
 *
 * Usage:
 *   node scripts/apply-pro-upgrade-draft-activity-images.js [--lesson=pet-vet] [--limit=6]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const SITE_URL = String(process.env.SITE_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || "";
const IMAGE_CACHE = path.join(ROOT, "curriculum-drafts/pro-upgrade/images");

const LESSON_KEYS = {
  "pet-vet": "pet-vet",
  "zoo-adventures": "zoo-adventures",
  camping: "camping",
  pirate: "pirate",
  superhero: "superhero",
  "apples-kitchen": "apples-kitchen",
  "johnny-appleseed": "johnny-appleseed",
};

function text(v) {
  return String(v == null ? "" : v).trim();
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
          Accept: "application/json",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
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
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw: raw.slice(0, 500) };
          }
          resolve({ status: res.statusCode, json, raw, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestBinary(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, SITE_URL);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "GET",
        headers: { Accept: "image/*,application/octet-stream", ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] || "" });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !res.json?.token) throw new Error(`login failed ${res.status}`);
  return res.json.token;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content ${res.status}`);
  return res.json.siteContent;
}

function sanitizeBriefLines(brief) {
  return String(brief || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[-*•]\s*/, ""))
    // Branding is applied by sharp post-process — never ask the model to draw the URL.
    .filter((s) => !/littlelearnershubbyleah\.com|footer\s*:/i.test(s))
    // Avoid second style cues that trigger conflicting_visual_style.
    .filter((s) => !/\b(realistic\s+(?:photo|daycare|classroom)|photorealistic|teacher\s+took\s+the\s+photo|daycare\s+setup|preschool\s+(?:setup|classroom))\b/i.test(s))
    .slice(0, 8);
}

function buildInstruction(activity, field) {
  const title = text(activity.title);
  const brief =
    field === "exampleImageUrl"
      ? text(activity.imageBriefExample) || text(activity.imageBriefSetup)
      : text(activity.imageBriefSetup) || text(activity.imageBriefExample);
  const isArtExample = field === "exampleImageUrl";
  // Use ONLY one style phrase ("Realistic photo") — do not also say daycare setup / teacher took photo.
  const styleLine = isArtExample
    ? "Realistic photo.\nFinished child-made art on paper, imperfect and uneven, photographed in a childcare room."
    : "Realistic photo.\nShow a classroom table or floor invitation with toddler-safe materials.";

  const detailLines = sanitizeBriefLines(brief);
  if (!detailLines.length) {
    detailLines.push(`${title} invitation with age-appropriate toddler materials`);
  }

  return [
    `${title}:`,
    "Activity image.",
    styleLine,
    "Use:",
    ...detailLines.map((s) => `- ${s}`),
    "- natural indoor light",
    "- believable real-life materials",
    "- realistic scale",
    "- slightly imperfect setup",
    "Do NOT include:",
    "- children",
    "- adults",
    "- cartoon animals",
    "- 3D blob-style artwork",
    "- glossy CGI",
    "- fake plastic-looking scene",
    "- floating objects",
    "- fantasy lighting",
    "- random decorations",
    "- random text",
    "- logos",
    "- website URLs",
    "- overly staged Pinterest-style setup",
    "- obvious AI artifacts",
    "Leave the bottom edge visually clear enough for a footer overlay.",
  ].join("\n");
}

function pickTargets(upgrade, limit) {
  const acts = (upgrade.activities || []).filter((a) => text(a.imageRequirement) && text(a.imageRequirement) !== "not_needed");
  // Prefer dramatic play / sensory / art / STEM setups first
  const rank = (a) => {
    const cat = String(a.activityCategory || "").toLowerCase();
    if (/dramatic/.test(cat)) return 0;
    if (/sensory/.test(cat)) return 1;
    if (/art/.test(cat)) return 2;
    if (/stem|discovery|open/.test(cat)) return 3;
    return 4;
  };
  acts.sort((a, b) => rank(a) - rank(b));
  return acts.slice(0, limit);
}

async function vp(token, body) {
  return requestJson("POST", "/api/admin/curriculum/visual-production", body, {
    Authorization: `Bearer ${token}`,
  });
}

async function uploadPhoto(token, lessonPlanId, activityKey, field, pngBuffer, fileName) {
  const fileData = `data:image/png;base64,${pngBuffer.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/enrichment-photos/upload",
    {
      adminToken: token,
      lessonPlanId,
      activityKey,
      field,
      fileName,
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateOne(token, lessonId, liveAct, activityRow, field) {
  const instruction = buildInstruction(activityRow, field);
  const planRes = await vp(token, {
    action: "plan",
    lessonId,
    instruction,
  });
  if (planRes.status !== 200) {
    throw new Error(`plan failed: ${planRes.status} ${JSON.stringify(planRes.json).slice(0, 300)}`);
  }
  const card = (planRes.json.cards || [])[0];
  if (!card?.id) throw new Error("no brief card returned");

  // If planner flagged issues, try ready-for-review / update isn't always needed; approve may fail.
  let briefId = card.id;
  let status = card.status;
  if (status === "NEEDS_REVIEW" || status === "PLANNED") {
    // Try approve directly if possible; else move to ready then approve
    if (status !== "APPROVED") {
      const ready = await vp(token, { action: "ready-for-review", id: briefId });
      if (ready.status === 200) status = ready.json?.card?.status || status;
    }
  }

  const approve = await vp(token, { action: "approve", id: briefId, confirmApprove: true });
  if (approve.status !== 200) {
    // Attempt update to clear flags by reinforcing style language then re-approve
    await vp(token, {
      action: "update",
      id: briefId,
      patch: {
        visualStyle: "REALISTIC_PHOTO",
        assetType: "ACTIVITY_IMAGE",
        activityName: text(activityRow.title),
        originalInstruction: instruction,
      },
    });
    const ready2 = await vp(token, { action: "ready-for-review", id: briefId });
    const approve2 = await vp(token, { action: "approve", id: briefId, confirmApprove: true });
    if (approve2.status !== 200) {
      throw new Error(`approve failed: ${approve.status}/${approve2.status} ${JSON.stringify(approve2.json || approve.json).slice(0, 400)}`);
    }
  }

  const gen = await vp(token, { action: "generate", id: briefId, confirmGenerate: true });
  if (gen.status !== 200 || !gen.json?.previewUrl) {
    throw new Error(`generate failed: ${gen.status} ${JSON.stringify(gen.json).slice(0, 400)}`);
  }

  const previewUrl = gen.json.previewUrl;
  const bin = await requestBinary(previewUrl, { Authorization: `Bearer ${token}` });
  if (bin.status !== 200 || !bin.buffer?.length) {
    throw new Error(`preview download failed ${bin.status}`);
  }

  fs.mkdirSync(IMAGE_CACHE, { recursive: true });
  const fileName = `${lessonId}__${text(liveAct.id || liveAct.itemId)}__${field}.png`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const localPath = path.join(IMAGE_CACHE, fileName);
  fs.writeFileSync(localPath, bin.buffer);

  const activityKey = text(liveAct.id) || text(liveAct.itemId);
  const up = await uploadPhoto(token, lessonId, activityKey, field, bin.buffer, fileName);
  if (up.status !== 200) {
    throw new Error(`enrichment photo upload failed ${up.status} ${JSON.stringify(up.json).slice(0, 300)}`);
  }

  return {
    briefId,
    previewUrl,
    localPath,
    activityKey,
    field,
    mediaUrl: up.json?.mediaUrl || up.json?.url || "",
    thumbUrl: up.json?.thumbUrl || "",
    mediaAssetId: up.json?.mediaAssetId || up.json?.assetId || "",
    upload: up.json,
  };
}

async function processLesson(token, lessonKey, limit) {
  const upgradePath = path.join(ROOT, "curriculum-drafts/pro-upgrade", `${lessonKey}.upgrade.json`);
  const upgrade = JSON.parse(fs.readFileSync(upgradePath, "utf8"));
  const lessonId = upgrade.lessonId;
  const targets = pickTargets(upgrade, limit);

  let site = await loadSite(token);
  const plan = (site.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
  if (!plan) throw new Error(`missing plan ${lessonId}`);
  const liveActs = (site.curriculum?.activities || []).filter(
    (a) => a.lessonPlanId === lessonId && a.status !== "archived",
  );
  const byTitle = new Map(liveActs.map((a) => [text(a.title).toLowerCase(), a]));

  const draft = plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { activities: {}, week: {} };
  draft.activities = draft.activities || {};
  draft.week = draft.week || {};

  const results = [];
  for (const row of targets) {
    const live = byTitle.get(text(row.title).toLowerCase());
    if (!live) {
      results.push({ title: row.title, ok: false, error: "live activity not found" });
      continue;
    }
    const field = /art/i.test(row.activityCategory || "") && text(row.imageBriefExample)
      ? "exampleImageUrl"
      : "setupImageUrl";
    try {
      console.log(JSON.stringify({ phase: "generate_start", lessonKey, title: row.title, field }));
      const gen = await generateOne(token, lessonId, live, row, field);
      const key = gen.activityKey;
      const prev = draft.activities[key] || {};
      draft.activities[key] = {
        ...prev,
        replaceOwned: prev.replaceOwned !== false,
        imageRequirement: row.imageRequirement || prev.imageRequirement || "recommended",
        imageBriefSetup: row.imageBriefSetup || prev.imageBriefSetup || "",
        imageBriefExample: row.imageBriefExample || prev.imageBriefExample || "",
        ...(field === "setupImageUrl"
          ? {
              setupImageUrl: gen.mediaUrl || gen.upload?.mediaUrl,
              setupImageThumbUrl: gen.thumbUrl || gen.mediaUrl,
              setupMediaAssetId: gen.mediaAssetId,
            }
          : {
              exampleImageUrl: gen.mediaUrl || gen.upload?.mediaUrl,
              exampleImageThumbUrl: gen.thumbUrl || gen.mediaUrl,
              exampleMediaAssetId: gen.mediaAssetId,
            }),
      };
      // Also mirror under itemId if different
      if (text(live.itemId) && text(live.itemId) !== key) {
        draft.activities[text(live.itemId)] = { ...draft.activities[key] };
      }
      results.push({ title: row.title, ok: true, field, mediaAssetId: gen.mediaAssetId, briefId: gen.briefId });
      console.log(JSON.stringify({ phase: "generate_ok", title: row.title, mediaAssetId: gen.mediaAssetId }));
      await sleep(1500);
    } catch (err) {
      results.push({ title: row.title, ok: false, error: err.message });
      console.log(JSON.stringify({ phase: "generate_fail", title: row.title, error: err.message }));
      await sleep(1000);
    }
  }

  draft.week.coverStatus = draft.week.coverStatus || upgrade.week?.coverStatus || "COVER IMAGE PENDING";
  draft.meta = {
    ...(draft.meta || {}),
    activityImagesDraftAt: new Date().toISOString(),
    activityImagesDraftOk: results.filter((r) => r.ok).length,
    neverAutoPublish: true,
  };
  draft.draftOnly = true;
  draft.neverAutoPublish = true;

  site = await loadSite(token);
  const save = await saveDraft(token, lessonId, draft, site.updatedAt);
  if (save.status !== 200) {
    throw new Error(`draft save failed ${save.status} ${JSON.stringify(save.json).slice(0, 300)}`);
  }

  const after = await loadSite(token);
  const afterPlan = (after.curriculum?.lessonPlans || []).find((p) => p.id === lessonId);
  const patched = afterPlan?.enrichmentDraft?.activities || {};
  const withImages = Object.values(patched).filter(
    (p) => text(p.setupImageUrl) || text(p.exampleImageUrl),
  ).length;

  return {
    lessonId,
    title: afterPlan?.title,
    enrichmentPublished: afterPlan?.enrichmentPublished === true,
    targets: targets.length,
    results,
    draftActivitiesWithImages: withImages,
    printableIds: afterPlan?.enrichmentDraft?.week?.printableIds || [],
    publishStatus: "NOT PUBLISHED / REVIEW NEEDED",
  };
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    throw new Error("Refusing to write: set LLH_APPLY_PRODUCTION_DRAFTS=1");
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    throw new Error("Missing admin env credentials");
  }

  const args = process.argv.slice(2);
  const lessonArg = (args.find((a) => a.startsWith("--lesson=")) || "").split("=")[1];
  const limit = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=5").split("=")[1]) || 5;
  const keys = lessonArg ? [lessonArg] : Object.keys(LESSON_KEYS);

  const token = await login();
  const report = [];
  for (const key of keys) {
    console.log(JSON.stringify({ phase: "lesson_start", key, limit }));
    const row = await processLesson(token, key, limit);
    report.push(row);
    console.log(JSON.stringify({ phase: "lesson_done", key, ok: row.results.filter((r) => r.ok).length, fail: row.results.filter((r) => !r.ok).length }));
  }

  const outPath = path.join(ROOT, "docs/audits/pro-upgrade-draft-activity-images-result.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), limit, report }, null, 2));
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error("IMAGE_APPLY_FAILED", err.message);
  process.exit(1);
});
