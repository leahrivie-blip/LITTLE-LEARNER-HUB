/**
 * Teaching Kit Enrichment Editor — private draft activity photos.
 * Binaries live in llh_media_assets (Postgres) or a store-sidecar directory (local-json).
 * Curriculum JSON stores only mediaAssetId + admin media URLs (never large blobs).
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ENRICHMENT_MEDIA_KIND = "teaching-kit-enrichment";
const MAX_ENRICHMENT_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_ENRICHMENT_UPLOAD_MB = 5;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const FULL_MAX_EDGE = 1600;
const THUMB_MAX_EDGE = 360;

let sharpLib = null;
try {
  sharpLib = require("sharp");
} catch {
  sharpLib = null;
}

function enrichmentMediaAssetId() {
  return `tk-enrich-${crypto.randomBytes(16).toString("hex")}`;
}

function enrichmentMediaUrl(assetId, variant = "full") {
  const id = String(assetId || "").trim();
  if (!id) return "";
  const v = variant === "thumb" ? "thumb" : "full";
  return `/api/admin/media/enrichment-photos/${encodeURIComponent(id)}?variant=${v}`;
}

/** Provider-visible URL after successful publish (never the admin draft path). */
function publicEnrichmentMediaUrl(assetId, variant = "full") {
  const id = String(assetId || "").trim();
  if (!id) return "";
  const v = variant === "thumb" ? "thumb" : "full";
  return `/api/media/enrichment-photos/${encodeURIComponent(id)}?variant=${v}`;
}

function isEnrichmentMediaAssetId(value) {
  return /^tk-enrich-[a-f0-9]{16,64}$/i.test(String(value || "").trim());
}

function enrichmentVariantAssetId(assetId, variant) {
  const id = String(assetId || "").trim();
  if (!isEnrichmentMediaAssetId(id)) return "";
  return variant === "thumb" ? `${id}-thumb` : id;
}

function isEnrichmentMediaUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const u = text.startsWith("/") ? new URL(text, "http://local.invalid") : new URL(text);
    return /^\/api\/(admin\/)?media\/enrichment-photos\/tk-enrich-[a-f0-9]+$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function isPublicEnrichmentMediaUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const u = text.startsWith("/") ? new URL(text, "http://local.invalid") : new URL(text);
    return /^\/api\/media\/enrichment-photos\/tk-enrich-[a-f0-9]+$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function isAdminEnrichmentMediaUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const u = text.startsWith("/") ? new URL(text, "http://local.invalid") : new URL(text);
    return /^\/api\/admin\/media\/enrichment-photos\/tk-enrich-[a-f0-9]+$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function assetIdFromEnrichmentMediaUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const u = text.startsWith("/") ? new URL(text, "http://local.invalid") : new URL(text);
    const id = decodeURIComponent(u.pathname.split("/").pop() || "");
    return isEnrichmentMediaAssetId(id) ? id : "";
  } catch {
    return "";
  }
}

/** Draft photo refs: admin enrichment media URLs or https only — never data: blobs. */
function sanitizedEnrichmentPhotoRef(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) return "";
  if (isAdminEnrichmentMediaUrl(text)) {
    const u = new URL(text, "http://local.invalid");
    const variant = u.searchParams.get("variant") === "thumb" ? "thumb" : "full";
    const id = decodeURIComponent(u.pathname.split("/").pop() || "");
    return enrichmentMediaUrl(id, variant).slice(0, 400);
  }
  if (isPublicEnrichmentMediaUrl(text)) {
    const u = new URL(text, "http://local.invalid");
    const variant = u.searchParams.get("variant") === "thumb" ? "thumb" : "full";
    const id = decodeURIComponent(u.pathname.split("/").pop() || "");
    return publicEnrichmentMediaUrl(id, variant).slice(0, 400);
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") return "";
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

/** Published activity/plan image fields — public enrichment media or https only (never admin draft URLs). */
function sanitizedPublishedEnrichmentImageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) return "";
  if (isAdminEnrichmentMediaUrl(text)) return ""; // never publish private draft URLs
  if (isPublicEnrichmentMediaUrl(text)) {
    const id = assetIdFromEnrichmentMediaUrl(text);
    const u = new URL(text, "http://local.invalid");
    const variant = u.searchParams.get("variant") === "thumb" ? "thumb" : "full";
    return publicEnrichmentMediaUrl(id, variant).slice(0, 400);
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") return "";
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

function validateEnrichmentUploadBuffer(mimeType, buffer) {
  if (!buffer || !buffer.length) return false;
  const mime = String(mimeType || "").trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return false;
  if (mime === "image/png") {
    return buffer.length >= 8
      && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/gif") {
    const head = buffer.slice(0, 6).toString("ascii");
    return head === "GIF87a" || head === "GIF89a";
  }
  if (mime === "image/webp") {
    return buffer.length >= 12
      && buffer.slice(0, 4).toString("ascii") === "RIFF"
      && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function parseEnrichmentUploadDataUrl(value) {
  const text = String(value || "").trim();
  const match = text.match(/^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return { ok: false, code: "invalid_file", error: "A valid image upload is required." };
  const mimeType = String(match[1] || "").trim().toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return {
      ok: false,
      code: "invalid_type",
      error: "Use a JPEG, PNG, WebP, or GIF image.",
    };
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) {
    return { ok: false, code: "invalid_file", error: "A valid image upload is required." };
  }
  if (buffer.length > MAX_ENRICHMENT_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      error: `Image must be ${MAX_ENRICHMENT_UPLOAD_MB} MB or smaller.`,
    };
  }
  if (!validateEnrichmentUploadBuffer(mimeType, buffer)) {
    return {
      ok: false,
      code: "invalid_type",
      error: "File content does not match an allowed image type.",
    };
  }
  return { ok: true, mimeType, buffer };
}

async function optimizeEnrichmentImage(buffer, { maxEdge, quality }) {
  if (!sharpLib) {
    return { buffer, mimeType: null, optimized: false };
  }
  const image = sharpLib(buffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const needsResize = (width > maxEdge) || (height > maxEdge);
  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  // Prefer JPEG for photos; keep PNG when source has alpha.
  const hasAlpha = Boolean(meta.hasAlpha);
  if (hasAlpha) {
    const out = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer: out, mimeType: "image/png", optimized: true };
  }
  const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  return { buffer: out, mimeType: "image/jpeg", optimized: true };
}

async function buildEnrichmentVariants(sourceBuffer) {
  const full = await optimizeEnrichmentImage(sourceBuffer, { maxEdge: FULL_MAX_EDGE, quality: 82 });
  const thumb = await optimizeEnrichmentImage(sourceBuffer, { maxEdge: THUMB_MAX_EDGE, quality: 72 });
  return {
    full: {
      buffer: full.buffer,
      mimeType: full.mimeType || "image/jpeg",
      optimized: full.optimized,
    },
    thumb: {
      buffer: thumb.buffer,
      mimeType: thumb.mimeType || "image/jpeg",
      optimized: thumb.optimized,
    },
  };
}

function localMediaDirFromStorePath(storePath) {
  return String(storePath || "").replace(/(\.json)?$/i, ".enrichment-media");
}

function writeLocalEnrichmentAsset(dir, assetId, variant, { mimeType, buffer, meta }) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${assetId}.${variant}`);
  const payload = {
    id: assetId,
    variant,
    kind: ENRICHMENT_MEDIA_KIND,
    mimeType,
    byteLen: buffer.length,
    ...meta,
  };
  const tmpBin = `${base}.bin.tmp-${process.pid}`;
  const tmpJson = `${base}.json.tmp-${process.pid}`;
  fs.writeFileSync(tmpBin, buffer);
  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpBin, `${base}.bin`);
  fs.renameSync(tmpJson, `${base}.json`);
}

function updateLocalEnrichmentAssetMeta(dir, assetId, patch) {
  for (const variant of ["full", "thumb"]) {
    const metaPath = path.join(dir, `${assetId}.${variant}.json`);
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    fs.writeFileSync(metaPath, JSON.stringify({ ...meta, ...patch }, null, 2));
  }
}

function readLocalEnrichmentAsset(dir, assetId, variant) {
  const base = path.join(dir, `${assetId}.${variant}`);
  const binPath = `${base}.bin`;
  const metaPath = `${base}.json`;
  if (!fs.existsSync(binPath) || !fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const buffer = fs.readFileSync(binPath);
  if (!buffer.length) return null;
  return {
    id: assetId,
    variant,
    kind: ENRICHMENT_MEDIA_KIND,
    mimeType: meta.mimeType || "application/octet-stream",
    fileName: meta.fileName || "",
    buffer,
    byteLen: buffer.length,
    lessonPlanId: meta.lessonPlanId || "",
    activityKey: meta.activityKey || "",
    field: meta.field || "",
    visibility: meta.visibility || "draft_private",
  };
}

function deleteLocalEnrichmentAsset(dir, assetId) {
  for (const variant of ["full", "thumb"]) {
    const base = path.join(dir, `${assetId}.${variant}`);
    try { fs.rmSync(`${base}.bin`, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(`${base}.json`, { force: true }); } catch { /* ignore */ }
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Sanitize enrichmentDraft.activities photo fields so curriculum never keeps data: blobs.
 */
function sanitizeEnrichmentDraftPhotos(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return draft;
  const activities = draft.activities && typeof draft.activities === "object" && !Array.isArray(draft.activities)
    ? draft.activities
    : {};
  const nextActs = {};
  Object.keys(activities).forEach((key) => {
    const act = activities[key] && typeof activities[key] === "object" ? { ...activities[key] } : {};
    if (Object.prototype.hasOwnProperty.call(act, "setupImageUrl")) {
      act.setupImageUrl = sanitizedEnrichmentPhotoRef(act.setupImageUrl);
    }
    if (Object.prototype.hasOwnProperty.call(act, "exampleImageUrl")) {
      act.exampleImageUrl = sanitizedEnrichmentPhotoRef(act.exampleImageUrl);
    }
    if (Object.prototype.hasOwnProperty.call(act, "setupImageThumbUrl")) {
      act.setupImageThumbUrl = sanitizedEnrichmentPhotoRef(act.setupImageThumbUrl);
    }
    if (Object.prototype.hasOwnProperty.call(act, "exampleImageThumbUrl")) {
      act.exampleImageThumbUrl = sanitizedEnrichmentPhotoRef(act.exampleImageThumbUrl);
    }
    if (Object.prototype.hasOwnProperty.call(act, "setupMediaAssetId")) {
      act.setupMediaAssetId = isEnrichmentMediaAssetId(act.setupMediaAssetId) ? String(act.setupMediaAssetId) : "";
    }
    if (Object.prototype.hasOwnProperty.call(act, "exampleMediaAssetId")) {
      act.exampleMediaAssetId = isEnrichmentMediaAssetId(act.exampleMediaAssetId) ? String(act.exampleMediaAssetId) : "";
    }
    nextActs[key] = act;
  });
  return { ...draft, activities: nextActs };
}

function withAdminToken(mediaUrl, adminToken) {
  const base = String(mediaUrl || "").trim();
  const token = String(adminToken || "").trim();
  if (!base || !token) return base;
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}adminToken=${encodeURIComponent(token)}`;
}

function collectAssetIdsFromValue(value, into = new Set()) {
  if (value == null) return into;
  if (typeof value === "string") {
    if (isEnrichmentMediaAssetId(value)) into.add(value);
    const fromUrl = assetIdFromEnrichmentMediaUrl(value);
    if (fromUrl) into.add(fromUrl);
    const re = /tk-enrich-[a-f0-9]{16,64}/gi;
    let match = re.exec(value);
    while (match) {
      into.add(match[0]);
      match = re.exec(value);
    }
    return into;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetIdsFromValue(item, into));
    return into;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectAssetIdsFromValue(item, into));
  }
  return into;
}

function collectDraftMediaAssetIds(draft) {
  return collectAssetIdsFromValue(draft && draft.activities ? draft.activities : {});
}

/**
 * Scan curriculum for enrichment media references (drafts, published fields, history).
 * Returns Map<assetId, Array<{ lessonPlanId, source }>>
 */
function collectCurriculumEnrichmentMediaRefs(curriculum) {
  const refs = new Map();
  const add = (assetId, lessonPlanId, source) => {
    const id = String(assetId || "").trim();
    if (!isEnrichmentMediaAssetId(id)) return;
    if (!refs.has(id)) refs.set(id, []);
    refs.get(id).push({ lessonPlanId: lessonPlanId || "", source: source || "" });
  };
  const plans = Array.isArray(curriculum?.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum?.activities) ? curriculum.activities : [];
  plans.forEach((plan) => {
    const planId = plan?.id || "";
    collectAssetIdsFromValue(plan?.enrichmentDraft).forEach((id) => add(id, planId, "enrichmentDraft"));
    collectAssetIdsFromValue(plan?.dailyPlans).forEach((id) => add(id, planId, "dailyPlans"));
    collectAssetIdsFromValue(plan?.enrichmentPublishHistory).forEach((id) => add(id, planId, "enrichmentPublishHistory"));
    // Discard undo stash is restoreable — keep those bytes until undo expires/clears.
    collectAssetIdsFromValue(plan?.enrichmentDraftUndo).forEach((id) => add(id, planId, "enrichmentDraftUndo"));
    collectAssetIdsFromValue(plan?.setupImageUrl).forEach((id) => add(id, planId, "plan.setupImageUrl"));
    collectAssetIdsFromValue(plan?.exampleImageUrl).forEach((id) => add(id, planId, "plan.exampleImageUrl"));
  });
  activities.forEach((act) => {
    const planId = act?.lessonPlanId || "";
    collectAssetIdsFromValue(act?.setupImageUrl).forEach((id) => add(id, planId, "activity.setupImageUrl"));
    collectAssetIdsFromValue(act?.exampleImageUrl).forEach((id) => add(id, planId, "activity.exampleImageUrl"));
    collectAssetIdsFromValue(act?.setupMediaAssetId).forEach((id) => add(id, planId, "activity.setupMediaAssetId"));
    collectAssetIdsFromValue(act?.exampleMediaAssetId).forEach((id) => add(id, planId, "activity.exampleMediaAssetId"));
  });
  return refs;
}

function diffRemovedMediaAssetIds(prevDraft, nextDraft) {
  const before = collectDraftMediaAssetIds(prevDraft);
  const after = collectDraftMediaAssetIds(nextDraft);
  const removed = [];
  before.forEach((id) => {
    if (!after.has(id)) removed.push(id);
  });
  return removed;
}

/**
 * Asset ids present in history entries that were dropped by the ENRICHMENT_HISTORY_LIMIT cap
 * when a new entry is prepended. Callers must still run ref-safe cleanup (other lessons /
 * live drafts / remaining history / published fields may still reference them).
 */
function assetIdsOnlyInDroppedHistory(previousHistory, nextHistory) {
  const prev = new Set();
  const next = new Set();
  collectAssetIdsFromValue(previousHistory).forEach((id) => prev.add(id));
  collectAssetIdsFromValue(nextHistory).forEach((id) => next.add(id));
  const dropped = [];
  prev.forEach((id) => {
    if (!next.has(id)) dropped.push(id);
  });
  return dropped;
}

function cleanupLogPathFromStorePath(storePath) {
  return String(storePath || "").replace(/(\.json)?$/i, ".enrichment-media-cleanup.log");
}

function logEnrichmentMediaCleanup(storePath, entry) {
  const record = {
    event: "enrichment_media_cleanup",
    assetId: String(entry.assetId || ""),
    lessonPlanId: String(entry.lessonPlanId || ""),
    reason: String(entry.reason || ""),
    result: String(entry.result || ""),
    timestamp: String(entry.timestamp || new Date().toISOString()),
  };
  const line = JSON.stringify(record);
  console.log(`[enrichment-media-cleanup] ${line}`);
  try {
    const logPath = cleanupLogPathFromStorePath(storePath);
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("[enrichment-media-cleanup] log write failed", error.message);
  }
  return record;
}

function promoteDraftPhotoUrlsToPublic(draftActivity) {
  const act = draftActivity && typeof draftActivity === "object" ? { ...draftActivity } : {};
  const setupId = isEnrichmentMediaAssetId(act.setupMediaAssetId)
    ? act.setupMediaAssetId
    : assetIdFromEnrichmentMediaUrl(act.setupImageUrl);
  const exampleId = isEnrichmentMediaAssetId(act.exampleMediaAssetId)
    ? act.exampleMediaAssetId
    : assetIdFromEnrichmentMediaUrl(act.exampleImageUrl);
  if (setupId) {
    act.setupMediaAssetId = setupId;
    act.setupImageUrl = publicEnrichmentMediaUrl(setupId, "full");
    act.setupImageThumbUrl = publicEnrichmentMediaUrl(setupId, "thumb");
  } else {
    act.setupImageUrl = sanitizedPublishedEnrichmentImageUrl(act.setupImageUrl);
    act.setupImageThumbUrl = sanitizedPublishedEnrichmentImageUrl(act.setupImageThumbUrl);
  }
  if (exampleId) {
    act.exampleMediaAssetId = exampleId;
    act.exampleImageUrl = publicEnrichmentMediaUrl(exampleId, "full");
    act.exampleImageThumbUrl = publicEnrichmentMediaUrl(exampleId, "thumb");
  } else {
    act.exampleImageUrl = sanitizedPublishedEnrichmentImageUrl(act.exampleImageUrl);
    act.exampleImageThumbUrl = sanitizedPublishedEnrichmentImageUrl(act.exampleImageThumbUrl);
  }
  return act;
}

module.exports = {
  ENRICHMENT_MEDIA_KIND,
  MAX_ENRICHMENT_UPLOAD_BYTES,
  MAX_ENRICHMENT_UPLOAD_MB,
  ALLOWED_MIME,
  FULL_MAX_EDGE,
  THUMB_MAX_EDGE,
  enrichmentMediaAssetId,
  enrichmentMediaUrl,
  publicEnrichmentMediaUrl,
  enrichmentVariantAssetId,
  isEnrichmentMediaAssetId,
  isEnrichmentMediaUrl,
  isPublicEnrichmentMediaUrl,
  isAdminEnrichmentMediaUrl,
  assetIdFromEnrichmentMediaUrl,
  sanitizedEnrichmentPhotoRef,
  sanitizedPublishedEnrichmentImageUrl,
  validateEnrichmentUploadBuffer,
  parseEnrichmentUploadDataUrl,
  optimizeEnrichmentImage,
  buildEnrichmentVariants,
  localMediaDirFromStorePath,
  writeLocalEnrichmentAsset,
  updateLocalEnrichmentAssetMeta,
  readLocalEnrichmentAsset,
  deleteLocalEnrichmentAsset,
  sha256Buffer,
  sanitizeEnrichmentDraftPhotos,
  withAdminToken,
  collectAssetIdsFromValue,
  collectDraftMediaAssetIds,
  collectCurriculumEnrichmentMediaRefs,
  diffRemovedMediaAssetIds,
  assetIdsOnlyInDroppedHistory,
  cleanupLogPathFromStorePath,
  logEnrichmentMediaCleanup,
  promoteDraftPhotoUrlsToPublic,
  sharpAvailable: () => Boolean(sharpLib),
};
