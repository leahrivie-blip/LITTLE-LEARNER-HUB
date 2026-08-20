#!/usr/bin/env node
/**
 * Finalize Priority 1 Pro lessons for owner review/publish readiness.
 * - Relink draft printableIds onto enrichmentDraft
 * - Attach generated VP activity images into enrichment_draft
 * - Generate remaining missing curated images
 * - Upload covers from strongest activity photos
 * - NEVER publish enrichment or printables
 *
 * LLH_APPLY_PRODUCTION_DRAFTS=1 + admin env required.
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

const P1 = [
  {
    key: "pet-vet",
    id: "cur-lp-toddler-pet-vet-clinic",
    coverActivity: "Veterinarian Dramatic Play Center",
  },
  {
    key: "zoo-adventures",
    id: "cur-lp-toddler-zoo-adventures",
    coverActivity: "Zoo Keeper Dramatic Play",
  },
  {
    key: "camping",
    id: "cur-lp-toddler-camping-under-the-stars",
    coverActivity: "Set Up the Campsite",
  },
  {
    key: "pirate",
    id: "cur-lp-toddler-pirate-adventure",
    coverActivity: "Ocean Adventure Pretend Play",
  },
  {
    key: "superhero",
    id: "cur-lp-toddler-superhero-training-camp",
    coverActivity: "City Rescue Adventure",
  },
  {
    key: "apples-kitchen",
    id: "cur-lp-toddler-apples-in-the-kitchen",
    coverActivity: "Little Apple Kitchen",
  },
  {
    key: "johnny-appleseed",
    id: "cur-lp-toddler-johnny-appleseed-apple-fun",
    coverActivity: "Plant Your Own Apple Seed",
  },
];

function text(v) {
  return String(v == null ? "" : v).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
            json = { raw: raw.slice(0, 400) };
          }
          resolve({ status: res.statusCode, json, raw, buffer: Buffer.concat(chunks) });
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
        res.on("end", () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] || "" }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function withRetry(fn, label, tries = 5) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = String(err.message || err);
      const retryable = /not ready|503|500|concurrency|media_storage|ECONNRESET|ETIMEDOUT/i.test(msg);
      console.log(JSON.stringify({ phase: "retry", label, attempt: i + 1, error: msg.slice(0, 200) }));
      if (!retryable || i === tries - 1) throw err;
      await sleep(3000 * (i + 1));
    }
  }
  throw last;
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    code: ADMIN_ACCESS_CODE,
  });
  if (res.status !== 200 || !res.json?.token) throw new Error(`login ${res.status}`);
  return res.json.token;
}

async function loadSite(token) {
  const res = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error(`site-content ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`);
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

async function vp(token, body) {
  return requestJson("POST", "/api/admin/curriculum/visual-production", body, {
    Authorization: `Bearer ${token}`,
  });
}

async function uploadEnrichmentPhoto(token, lessonPlanId, activityKey, field, buffer, fileName) {
  const fileData = `data:image/png;base64,${buffer.toString("base64")}`;
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

async function uploadCover(token, lessonPlanId, buffer, fileName, alt) {
  const fileData = `data:image/png;base64,${buffer.toString("base64")}`;
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-covers/upload",
    {
      lessonPlanId,
      fileName,
      fileData,
      coverImageAlt: alt,
      coverImagePosition: "center",
      coverQualityStatus: "good",
    },
    { Authorization: `Bearer ${token}` },
  );
}

function sanitizeBriefLines(brief) {
  return String(brief || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[-*•]\s*/, ""))
    .filter((s) => !/littlelearnershubbyleah\.com|footer\s*:/i.test(s))
    .filter((s) => !/\b(realistic\s+(?:photo|daycare|classroom)|photorealistic|teacher\s+took\s+the\s+photo|daycare\s+setup|preschool\s+(?:setup|classroom))\b/i.test(s))
    .slice(0, 8);
}

function buildInstruction(activity) {
  const title = text(activity.title);
  const brief = text(activity.imageBriefSetup) || text(activity.imageBriefExample);
  const detailLines = sanitizeBriefLines(brief);
  if (!detailLines.length) detailLines.push(`${title} invitation with toddler-safe materials`);
  return [
    `${title}:`,
    "Activity image.",
    "Realistic photo.",
    "Show a classroom table or floor invitation with toddler-safe materials.",
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
  const rank = (a) => {
    const cat = String(a.activityCategory || "").toLowerCase();
    if (/dramatic/.test(cat)) return 0;
    if (/sensory/.test(cat)) return 1;
    if (/art/.test(cat)) return 2;
    if (/stem|discovery|open/.test(cat)) return 3;
    return 4;
  };
  return acts.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

function cloneDraft(plan) {
  return plan.enrichmentDraft && typeof plan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(plan.enrichmentDraft))
    : { activities: {}, week: {} };
}

function patchActivityImage(draft, live, upload, requirement) {
  const key = text(live.id) || text(live.itemId);
  const prev = draft.activities[key] || {};
  const mediaUrl = upload.mediaUrl || upload.url || "";
  const thumbUrl = upload.thumbUrl || mediaUrl;
  const mediaAssetId = upload.mediaAssetId || upload.assetId || "";
  draft.activities[key] = {
    ...prev,
    replaceOwned: prev.replaceOwned !== false,
    imageRequirement: requirement || prev.imageRequirement || "recommended",
    setupImageUrl: mediaUrl,
    setupImageThumbUrl: thumbUrl,
    setupMediaAssetId: mediaAssetId,
  };
  if (text(live.itemId) && text(live.itemId) !== key) {
    draft.activities[text(live.itemId)] = { ...draft.activities[key] };
  }
  return key;
}

async function generateAndUpload(token, lessonId, live, activityRow) {
  const instruction = buildInstruction(activityRow);
  const planRes = await vp(token, { action: "plan", lessonId, instruction });
  if (planRes.status !== 200) throw new Error(`plan ${planRes.status} ${JSON.stringify(planRes.json).slice(0, 200)}`);
  const card = (planRes.json.cards || [])[0];
  if (!card?.id) throw new Error("no brief");
  if (card.status !== "READY_FOR_REVIEW" && card.status !== "APPROVED") {
    const ready = await vp(token, { action: "ready-for-review", id: card.id });
    if (ready.status !== 200 && card.status === "NEEDS_REVIEW") {
      throw new Error(`brief needs review: ${JSON.stringify(card.reviewFlags || ready.json).slice(0, 200)}`);
    }
  }
  const approve = await vp(token, { action: "approve", id: card.id, confirmApprove: true });
  if (approve.status !== 200) throw new Error(`approve ${approve.status} ${JSON.stringify(approve.json).slice(0, 200)}`);
  const gen = await vp(token, { action: "generate", id: card.id, confirmGenerate: true });
  if (gen.status !== 200 || !gen.json?.previewUrl) throw new Error(`generate ${gen.status} ${JSON.stringify(gen.json).slice(0, 200)}`);
  const bin = await requestBinary(gen.json.previewUrl, { Authorization: `Bearer ${token}` });
  if (bin.status !== 200 || !bin.buffer.length) throw new Error(`preview download ${bin.status}`);
  const up = await uploadEnrichmentPhoto(
    token,
    lessonId,
    text(live.id) || text(live.itemId),
    "setupImageUrl",
    bin.buffer,
    `${text(live.id)}-setup.png`,
  );
  if (up.status !== 200) throw new Error(`upload ${up.status} ${JSON.stringify(up.json).slice(0, 200)}`);
  return { upload: up.json, buffer: bin.buffer, briefId: card.id, previewUrl: gen.json.previewUrl };
}

async function attachExistingGenerated(token, lessonId, liveActs, draft) {
  const list = await vp(token, { action: "list", lessonId });
  const cards = (list.json.cards || []).filter((c) => c.status === "GENERATED" && text(c.generatedPreviewUrl));
  const byTitle = new Map(liveActs.map((a) => [text(a.title).toLowerCase(), a]));
  const attached = [];
  const seen = new Set();
  for (const card of cards) {
    const titleKey = text(card.activityName).toLowerCase();
    if (!titleKey || seen.has(titleKey)) continue;
    const live = byTitle.get(titleKey);
    if (!live) continue;
    const key = text(live.id) || text(live.itemId);
    const existing = draft.activities[key] || {};
    if (text(existing.setupImageUrl) || text(existing.exampleImageUrl)) {
      seen.add(titleKey);
      continue;
    }
    const bin = await requestBinary(card.generatedPreviewUrl, { Authorization: `Bearer ${token}` });
    if (bin.status !== 200 || !bin.buffer.length) continue;
    const up = await withRetry(
      () => uploadEnrichmentPhoto(token, lessonId, key, "setupImageUrl", bin.buffer, `${key}-setup.png`),
      `upload-${titleKey}`,
    );
    if (up.status !== 200) throw new Error(`attach upload failed ${up.status}`);
    patchActivityImage(draft, live, up.json);
    attached.push({ title: live.title, mediaAssetId: up.json.mediaAssetId || up.json.assetId });
    seen.add(titleKey);
    await sleep(800);
  }
  return attached;
}

async function ensureImages(token, meta, limit = 5) {
  const upgrade = JSON.parse(
    fs.readFileSync(path.join(ROOT, "curriculum-drafts/pro-upgrade", `${meta.key}.upgrade.json`), "utf8"),
  );
  let site = await loadSite(token);
  let plan = (site.curriculum.lessonPlans || []).find((p) => p.id === meta.id);
  const liveActs = (site.curriculum.activities || []).filter(
    (a) => a.lessonPlanId === meta.id && a.status !== "archived",
  );
  const draft = cloneDraft(plan);
  draft.activities = draft.activities || {};
  draft.week = draft.week || {};

  const attachedExisting = await attachExistingGenerated(token, meta.id, liveActs, draft);
  const byTitle = new Map(liveActs.map((a) => [text(a.title).toLowerCase(), a]));
  const targets = pickTargets(upgrade, limit);
  const generated = [];
  for (const row of targets) {
    const live = byTitle.get(text(row.title).toLowerCase());
    if (!live) continue;
    const key = text(live.id) || text(live.itemId);
    const existing = draft.activities[key] || {};
    if (text(existing.setupImageUrl) || text(existing.exampleImageUrl)) continue;
    try {
      const result = await withRetry(() => generateAndUpload(token, meta.id, live, row), `gen-${row.title}`);
      patchActivityImage(draft, live, result.upload, row.imageRequirement);
      generated.push({ title: row.title, mediaAssetId: result.upload.mediaAssetId || result.upload.assetId });
      console.log(JSON.stringify({ phase: "image_ok", lesson: meta.id, title: row.title }));
      await sleep(1200);
    } catch (err) {
      console.log(JSON.stringify({ phase: "image_fail", lesson: meta.id, title: row.title, error: err.message.slice(0, 240) }));
    }
  }

  // Relink printables from plan.resourceIds that are draft TK printables we created
  const resources = site.curriculum.resources || [];
  const linkedDraftPrintables = (plan.resourceIds || [])
    .map((id) => resources.find((r) => r.id === id))
    .filter((r) => r && r.status === "draft" && /draft/i.test(r.title || ""))
    .map((r) => r.id);
  const currentPrintableIds = Array.isArray(draft.week.printableIds) ? draft.week.printableIds.slice() : [];
  draft.week.printableIds = Array.from(new Set(currentPrintableIds.concat(linkedDraftPrintables)));

  draft.previewReady = true;
  draft.draftOnly = true;
  draft.neverAutoPublish = true;
  draft.week.coverStatus = "COVER_FROM_ACTIVITY_PHOTO";
  draft.week.proposedCoverActivity = meta.coverActivity;
  draft.meta = {
    ...(draft.meta || {}),
    ownerReviewReady: true,
    ownerReviewReadyAt: new Date().toISOString(),
    neverAutoPublish: true,
    purpose: "Pro Priority 1 upgrade — enrichment draft ready for owner manual Publish",
  };

  site = await loadSite(token);
  const save = await withRetry(() => saveDraft(token, meta.id, draft, site.updatedAt), `save-${meta.id}`);
  if (save.status !== 200) throw new Error(`save failed ${save.status} ${JSON.stringify(save.json).slice(0, 200)}`);

  return { attachedExisting, generated, printableIds: draft.week.printableIds };
}

async function setCoverFromActivity(token, meta) {
  let site = await loadSite(token);
  const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === meta.id);
  const liveActs = (site.curriculum.activities || []).filter(
    (a) => a.lessonPlanId === meta.id && a.status !== "archived",
  );
  const draft = plan.enrichmentDraft || {};
  const live = liveActs.find((a) => text(a.title).toLowerCase() === text(meta.coverActivity).toLowerCase());
  if (!live) return { ok: false, reason: "cover activity not found" };
  const key = text(live.id) || text(live.itemId);
  const patch = (draft.activities || {})[key] || (draft.activities || {})[text(live.itemId)] || {};
  const url = text(patch.setupImageUrl) || text(patch.exampleImageUrl);
  if (!url) return { ok: false, reason: "no activity image on cover candidate" };

  const bin = await requestBinary(url, { Authorization: `Bearer ${token}` });
  if (bin.status !== 200 || !bin.buffer.length) return { ok: false, reason: `download ${bin.status}` };

  const up = await withRetry(
    () => uploadCover(token, meta.id, bin.buffer, `${meta.key}-cover.png`, `${plan.title} — ${meta.coverActivity}`),
    `cover-${meta.id}`,
  );
  if (up.status !== 200) return { ok: false, reason: `cover upload ${up.status} ${JSON.stringify(up.json).slice(0, 200)}` };
  const coverUrl = text(up.json?.url);
  if (!coverUrl) return { ok: false, reason: "cover upload missing url" };

  const assign = await withRetry(
    () =>
      requestJson(
        "POST",
        "/api/admin/curriculum/lesson-covers/assign",
        {
          assignments: [
            {
              id: meta.id,
              coverImageUrl: coverUrl,
              coverImageAlt: `${plan.title} — ${meta.coverActivity}`,
              coverImageSource: "uploaded",
              coverImagePosition: "center",
              coverQualityStatus: "good",
            },
          ],
        },
        { Authorization: `Bearer ${token}` },
      ),
    `cover-assign-${meta.id}`,
  );
  if (assign.status !== 200) {
    return { ok: false, reason: `cover assign ${assign.status} ${JSON.stringify(assign.json).slice(0, 200)}` };
  }

  // Refresh draft cover status note
  site = await loadSite(token);
  const fresh = (site.curriculum.lessonPlans || []).find((p) => p.id === meta.id);
  const nextDraft = cloneDraft(fresh);
  nextDraft.week = nextDraft.week || {};
  nextDraft.week.coverStatus = "UPDATED_FROM_ACTIVITY_PHOTO";
  nextDraft.week.proposedCoverActivity = meta.coverActivity;
  nextDraft.previewReady = true;
  nextDraft.meta = { ...(nextDraft.meta || {}), ownerReviewReady: true, neverAutoPublish: true };
  const save = await saveDraft(token, meta.id, nextDraft, site.updatedAt);
  return {
    ok: save.status === 200,
    coverImageUrl: fresh.coverImageUrl || coverUrl,
    coverActivity: meta.coverActivity,
    saveStatus: save.status,
    assignStatus: assign.status,
  };
}

async function main() {
  if (process.env.LLH_APPLY_PRODUCTION_DRAFTS !== "1") {
    throw new Error("Set LLH_APPLY_PRODUCTION_DRAFTS=1");
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
    throw new Error("Missing admin env");
  }

  const token = await login();
  const report = [];

  for (const meta of P1) {
    console.log(JSON.stringify({ phase: "lesson_start", id: meta.id, title: meta.key }));
    const imageResult = await ensureImages(token, meta, 5);
    let coverResult = { ok: false, reason: "pending" };
    try {
      coverResult = await setCoverFromActivity(token, meta);
    } catch (err) {
      coverResult = { ok: false, reason: err.message.slice(0, 240) };
    }

    const site = await loadSite(token);
    const plan = (site.curriculum.lessonPlans || []).find((p) => p.id === meta.id);
    const liveActs = (site.curriculum.activities || []).filter(
      (a) => a.lessonPlanId === meta.id && a.status !== "archived",
    );
    const resources = site.curriculum.resources || [];
    const draft = plan.enrichmentDraft || {};
    const dActs = draft.activities || {};
    const uniqueImgTitles = new Set();
    Object.values(dActs).forEach((p) => {
      if (text(p.setupImageUrl) || text(p.exampleImageUrl)) uniqueImgTitles.add(text(p.title).toLowerCase());
    });
    const printableIds = draft.week?.printableIds || [];
    const printables = printableIds.map((id) => resources.find((r) => r.id === id)).filter(Boolean);

    report.push({
      lessonId: meta.id,
      title: plan.title,
      plan: plan.plan,
      status: plan.status,
      enrichmentPublished: plan.enrichmentPublished === true,
      activityCount: liveActs.length,
      draftPatchCount: Object.keys(dActs).length,
      imagesAttachedUnique: uniqueImgTitles.size,
      imagesAttachedNow: imageResult,
      printableIds,
      printables: printables.map((r) => ({ id: r.id, title: r.title, status: r.status })),
      cover: coverResult,
      coverImageUrl: plan.coverImageUrl || "",
      ownerReviewReady: draft.meta?.ownerReviewReady === true || draft.previewReady === true,
      publishStatus: "NOT PUBLISHED — ready for owner manual Publish",
    });
    console.log(JSON.stringify({ phase: "lesson_done", id: meta.id, images: uniqueImgTitles.size, printables: printableIds.length, coverOk: coverResult.ok }));
  }

  const out = path.join(ROOT, "docs/audits/PRO_PRIORITY1_OWNER_REVIEW_READY_REPORT.json");
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
  console.log("Wrote", out);
}

main().catch((err) => {
  console.error("READY_PASS_FAILED", err.message);
  process.exit(1);
});
