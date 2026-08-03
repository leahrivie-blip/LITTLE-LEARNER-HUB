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
    return /^\/api\/admin\/media\/enrichment-photos\/tk-enrich-[a-f0-9]+$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Draft photo refs: admin enrichment media URLs or https only — never data: blobs. */
function sanitizedEnrichmentPhotoRef(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) return "";
  if (isEnrichmentMediaUrl(text)) {
    const u = new URL(text, "http://local.invalid");
    const variant = u.searchParams.get("variant") === "thumb" ? "thumb" : "full";
    const id = decodeURIComponent(u.pathname.split("/").pop() || "");
    return enrichmentMediaUrl(id, variant).slice(0, 400);
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
  fs.writeFileSync(`${base}.bin`, buffer);
  fs.writeFileSync(`${base}.json`, JSON.stringify({
    id: assetId,
    variant,
    kind: ENRICHMENT_MEDIA_KIND,
    mimeType,
    byteLen: buffer.length,
    ...meta,
  }, null, 2));
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

module.exports = {
  ENRICHMENT_MEDIA_KIND,
  MAX_ENRICHMENT_UPLOAD_BYTES,
  MAX_ENRICHMENT_UPLOAD_MB,
  ALLOWED_MIME,
  FULL_MAX_EDGE,
  THUMB_MAX_EDGE,
  enrichmentMediaAssetId,
  enrichmentMediaUrl,
  enrichmentVariantAssetId,
  isEnrichmentMediaAssetId,
  isEnrichmentMediaUrl,
  sanitizedEnrichmentPhotoRef,
  validateEnrichmentUploadBuffer,
  parseEnrichmentUploadDataUrl,
  optimizeEnrichmentImage,
  buildEnrichmentVariants,
  localMediaDirFromStorePath,
  writeLocalEnrichmentAsset,
  readLocalEnrichmentAsset,
  deleteLocalEnrichmentAsset,
  sha256Buffer,
  sanitizeEnrichmentDraftPhotos,
  withAdminToken,
  sharpAvailable: () => Boolean(sharpLib),
};
