/**
 * Wave 7 — Forms paperwork uploads + expiration helpers + reminder + packet link.
 * Binaries live in llh_media_assets (Postgres) or a store-sidecar directory (local-json).
 * Document rows store FileRef metadata only — never hot-path full-store clones.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const formsLib = require("./forms-lib.js");

const FORMS_MEDIA_KIND = "forms-paperwork";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_MB = 5;
const MAX_DATA_URL_CHARS = Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 64;
const EXPIRING_SOON_DAYS = 30;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const EXT_BY_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function newMediaId() {
  return `forms-media-${crypto.randomBytes(16).toString("hex")}`;
}

function newDocId(prefix = "upl") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function isFormsMediaAssetId(value) {
  return /^forms-media-[a-f0-9]{16,64}$/i.test(String(value || "").trim());
}

function formsMediaUrl(assetId) {
  const id = String(assetId || "").trim();
  if (!isFormsMediaAssetId(id)) return "";
  return `/api/program-forms/media/${encodeURIComponent(id)}`;
}

function todayIso(now = new Date()) {
  const d = now instanceof Date ? now : new Date();
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Derive UI expiration state. Does not mutate compliance.
 * @returns {""|"current"|"expiring_soon"|"expired"}
 */
function expirationState(expiresAt, { today = todayIso(), soonDays = EXPIRING_SOON_DAYS } = {}) {
  const exp = String(expiresAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return "";
  if (exp < today) return "expired";
  const horizon = addDaysIso(today, soonDays);
  if (exp <= horizon) return "expiring_soon";
  return "current";
}

function expirationLabel(state) {
  if (state === "expired") return "Expired";
  if (state === "expiring_soon") return "Expiring Soon";
  if (state === "current") return "Current";
  return "";
}

function validateMagic(mimeType, buffer) {
  if (!buffer || !buffer.length) return false;
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "application/pdf") {
    return buffer.length >= 5 && buffer.slice(0, 5).toString("ascii") === "%PDF-";
  }
  if (mime === "image/png") {
    return buffer.length >= 8
      && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/webp") {
    return buffer.length >= 12
      && buffer.slice(0, 4).toString("ascii") === "RIFF"
      && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function parseUploadDataUrl(value, { originalFileName = "" } = {}) {
  const text = String(value || "").trim();
  if (!text) {
    return { ok: false, code: "missing_file", error: "Choose a PDF or image file to upload." };
  }
  if (text.length > MAX_DATA_URL_CHARS) {
    return { ok: false, code: "file_too_large", error: `File must be ${MAX_UPLOAD_MB} MB or smaller.` };
  }
  if (/^data:text\/html/i.test(text) || /^data:image\/svg/i.test(text)) {
    return { ok: false, code: "invalid_type", error: "HTML and SVG uploads are not allowed." };
  }
  const match = text.match(/^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return { ok: false, code: "invalid_file", error: "A valid PDF or image upload is required." };
  }
  const mimeType = String(match[1] || "").trim().toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return {
      ok: false,
      code: "invalid_type",
      error: "Use a PDF, JPEG, PNG, or WebP file.",
    };
  }
  let buffer;
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  } catch (_e) {
    return { ok: false, code: "invalid_file", error: "Could not read the uploaded file." };
  }
  if (!buffer.length) {
    return { ok: false, code: "invalid_file", error: "A valid PDF or image upload is required." };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, code: "file_too_large", error: `File must be ${MAX_UPLOAD_MB} MB or smaller.` };
  }
  if (!validateMagic(mimeType, buffer)) {
    return { ok: false, code: "invalid_type", error: "File content does not match an allowed type." };
  }
  const name = cleanText(originalFileName, 180) || `upload.${EXT_BY_MIME[mimeType] || "bin"}`;
  const ext = (path.extname(name) || "").toLowerCase().replace(".", "");
  const expected = EXT_BY_MIME[mimeType];
  if (ext && expected && ext !== expected && !(mimeType === "image/jpeg" && (ext === "jpeg" || ext === "jpg"))) {
    // Extension mismatch is a soft fail → reject for safety
    return {
      ok: false,
      code: "invalid_extension",
      error: `File extension does not match ${expected.toUpperCase()}.`,
    };
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return {
    ok: true,
    mimeType,
    buffer,
    byteLen: buffer.length,
    sha256,
    originalFileName: name,
  };
}

function localMediaDirFromStorePath(storePath) {
  return String(storePath || "").replace(/(\.json)?$/i, ".forms-media");
}

function writeLocalFormsAsset(dir, assetId, { mimeType, buffer, meta = {} }) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, assetId);
  const payload = {
    id: assetId,
    kind: FORMS_MEDIA_KIND,
    mimeType,
    byteLen: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    ...meta,
  };
  const tmpBin = `${base}.bin.tmp-${process.pid}`;
  const tmpJson = `${base}.json.tmp-${process.pid}`;
  fs.writeFileSync(tmpBin, buffer);
  fs.writeFileSync(tmpJson, JSON.stringify(payload));
  fs.renameSync(tmpBin, `${base}.bin`);
  fs.renameSync(tmpJson, `${base}.json`);
  return payload;
}

function readLocalFormsAsset(dir, assetId) {
  if (!isFormsMediaAssetId(assetId)) return null;
  const base = path.join(dir, assetId);
  const binPath = `${base}.bin`;
  const jsonPath = `${base}.json`;
  if (!fs.existsSync(binPath) || !fs.existsSync(jsonPath)) return null;
  const meta = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (String(meta.kind || "") !== FORMS_MEDIA_KIND) return null;
  const buffer = fs.readFileSync(binPath);
  return {
    id: assetId,
    kind: FORMS_MEDIA_KIND,
    mimeType: meta.mimeType || "application/octet-stream",
    fileName: meta.originalFileName || meta.fileName || "",
    buffer,
    byteLen: buffer.length,
    sha256: meta.sha256 || "",
    programId: meta.programId || "",
    documentId: meta.documentId || "",
  };
}

function removeLocalFormsAsset(dir, assetId) {
  if (!isFormsMediaAssetId(assetId)) return;
  const base = path.join(dir, assetId);
  try { fs.unlinkSync(`${base}.bin`); } catch (_e) { /* ignore */ }
  try { fs.unlinkSync(`${base}.json`); } catch (_e) { /* ignore */ }
}

function mediaAssetIdForIdempotency({ programId = "", idempotencyKey = "" } = {}) {
  const key = String(idempotencyKey || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key)) return newMediaId();
  const digest = crypto
    .createHash("sha256")
    .update(`forms-upload:${cleanText(programId, 80)}:${key}`)
    .digest("hex")
    .slice(0, 32);
  return `forms-media-${digest}`;
}

/**
 * Best-effort delete for Wave 7 forms-paperwork orphans only.
 * Never deletes other media kinds.
 */
async function removeFormsMediaAsset({
  mediaAssetId,
  storePath,
  postgresPool = null,
  usePostgres = false,
} = {}) {
  const id = String(mediaAssetId || "").trim();
  if (!isFormsMediaAssetId(id)) {
    return { ok: false, code: "invalid_media_id" };
  }
  if (usePostgres && postgresPool) {
    try {
      const result = await postgresPool.query(
        `DELETE FROM llh_media_assets WHERE id = $1 AND kind = $2`,
        [id, FORMS_MEDIA_KIND],
      );
      return { ok: true, deleted: Number(result.rowCount || 0) > 0, backend: "postgres" };
    } catch (error) {
      return { ok: false, code: "postgres_delete_failed", error: error.message || "delete_failed" };
    }
  }
  try {
    removeLocalFormsAsset(localMediaDirFromStorePath(storePath), id);
    return { ok: true, deleted: true, backend: "local" };
  } catch (error) {
    return { ok: false, code: "local_delete_failed", error: error.message || "delete_failed" };
  }
}

async function persistFormsUpload({
  parsed,
  programId,
  documentId,
  uploadedBy,
  storePath,
  postgresPool = null,
  usePostgres = false,
  idempotencyKey = "",
}) {
  // Deterministic media id when idempotencyKey present → retries overwrite same asset
  // instead of leaking endless orphan blobs.
  const assetId = mediaAssetIdForIdempotency({ programId, idempotencyKey });
  const mediaUrl = formsMediaUrl(assetId);
  const meta = {
    programId: cleanText(programId, 80),
    documentId: cleanText(documentId, 80),
    originalFileName: parsed.originalFileName,
    uploadedBy: normalizeEmail(uploadedBy),
    uploadedAt: nowIso(),
  };
  if (usePostgres && postgresPool) {
    const curriculumMedia = require("./curriculum-media.js");
    await curriculumMedia.insertMediaAsset(postgresPool, {
      id: assetId,
      kind: FORMS_MEDIA_KIND,
      mimeType: parsed.mimeType,
      fileName: parsed.originalFileName,
      buffer: parsed.buffer,
    });
  } else {
    const dir = localMediaDirFromStorePath(storePath);
    writeLocalFormsAsset(dir, assetId, {
      mimeType: parsed.mimeType,
      buffer: parsed.buffer,
      meta,
    });
  }
  // Drop buffer reference for caller GC.
  parsed.buffer = null;
  return {
    mediaAssetId: assetId,
    mediaUrl,
    fileUrl: mediaUrl,
    fileName: parsed.originalFileName,
    mimeType: parsed.mimeType,
    byteLen: parsed.byteLen,
    sha256: parsed.sha256,
    sourceType: "upload",
    documentKind: "upload",
    uploadedAt: meta.uploadedAt,
    uploadedBy: meta.uploadedBy,
  };
}

async function loadFormsUploadBytes({
  mediaAssetId,
  storePath,
  postgresPool = null,
  usePostgres = false,
}) {
  const id = String(mediaAssetId || "").trim();
  if (!isFormsMediaAssetId(id)) return null;
  if (usePostgres && postgresPool) {
    const curriculumMedia = require("./curriculum-media.js");
    return curriculumMedia.readMediaAsset(postgresPool, id, FORMS_MEDIA_KIND);
  }
  return readLocalFormsAsset(localMediaDirFromStorePath(storePath), id);
}

function buildUploadDocumentRow({
  assigneeType = "child",
  title = "",
  category = "Upload",
  childId = "",
  householdId = "",
  assigneeEmail = "",
  programId = "",
  shareWithFamily = false,
  expiresAt = "",
  notes = "",
  fileRef = {},
  actorUserId = "",
  idempotencyKey = "",
} = {}) {
  const now = nowIso();
  const id = idempotencyKey && /^[a-zA-Z0-9_-]{8,80}$/.test(idempotencyKey)
    ? `upl_${idempotencyKey}`
    : newDocId("upl");
  const exp = String(expiresAt || "").slice(0, 10);
  const expState = expirationState(exp);
  const status = expState === "expired" ? formsLib.FORM_STATUSES.EXPIRED : formsLib.FORM_STATUSES.COMPLETED;
  const base = {
    id,
    programId: cleanText(programId, 80),
    title: cleanText(title, 160) || (fileRef.fileName || "Uploaded document"),
    category: cleanText(category, 80) || "Upload",
    status,
    statusLabel: formsLib.formStatusLabel(status),
    notes: cleanText(notes, 800),
    assigneeType: assigneeType === "staff" ? "staff" : (assigneeType === "program" ? "program" : "child"),
    childId: cleanText(childId, 80),
    householdId: cleanText(householdId, 80),
    assigneeEmail: normalizeEmail(assigneeEmail),
    shareWithFamily: shareWithFamily === true || shareWithFamily === "true",
    requiresSignature: false,
    sourceType: "upload",
    documentKind: "upload",
    mediaAssetId: fileRef.mediaAssetId || "",
    mediaUrl: fileRef.mediaUrl || "",
    fileUrl: fileRef.fileUrl || fileRef.mediaUrl || "",
    fileName: fileRef.fileName || "",
    mimeType: fileRef.mimeType || "",
    byteLen: Number(fileRef.byteLen || 0) || 0,
    sha256: fileRef.sha256 || "",
    uploadedAt: fileRef.uploadedAt || now,
    uploadedBy: fileRef.uploadedBy || actorUserId || "",
    expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : "",
    expirationState: expState,
    assignedAt: now,
    completedAt: now,
    updatedAt: now,
    providerReviewed: true,
    archived: false,
    draftText: "",
    fields: [],
    answers: {},
    presentation: "uploaded_document",
  };
  return base;
}

function publicUploadSummary(doc = {}) {
  const expState = expirationState(doc.expiresAt) || doc.expirationState || "";
  return {
    id: String(doc.id || ""),
    title: String(doc.title || "Uploaded document"),
    category: String(doc.category || "Upload"),
    sourceType: "upload",
    documentKind: "upload",
    presentation: "uploaded_document",
    mediaAssetId: String(doc.mediaAssetId || ""),
    mediaUrl: String(doc.mediaUrl || doc.fileUrl || ""),
    fileName: String(doc.fileName || ""),
    mimeType: String(doc.mimeType || ""),
    byteLen: Number(doc.byteLen || 0) || 0,
    uploadedAt: String(doc.uploadedAt || ""),
    uploadedBy: String(doc.uploadedBy || ""),
    expiresAt: String(doc.expiresAt || ""),
    expirationState: expState,
    expirationLabel: expirationLabel(expState),
    shareWithFamily: doc.shareWithFamily === true || doc.shareWithFamily === "true",
    assigneeType: String(doc.assigneeType || "child"),
    childId: String(doc.childId || ""),
    assigneeEmail: String(doc.assigneeEmail || ""),
    archived: Boolean(doc.archived),
  };
}

/**
 * Manual reminder — validates live relationship; idempotent within short window.
 */
function applyManualReminder(doc, {
  actorUserId = "",
  channel = "family_hub_notification",
  now = nowIso(),
  idempotencyWindowMs = 60_000,
} = {}) {
  const last = Date.parse(doc.lastNotifiedAt || doc.remindedAt || "") || 0;
  const t = Date.parse(now) || Date.now();
  if (last && (t - last) < idempotencyWindowMs) {
    return {
      document: doc,
      idempotentReplay: true,
      remindedAt: doc.lastNotifiedAt || doc.remindedAt || now,
      channel,
    };
  }
  const next = {
    ...doc,
    lastNotifiedAt: now,
    remindedAt: now,
    updatedAt: now,
  };
  if (next.shareWithFamily === true || next.shareWithFamily === "true") {
    if (!next.signedAt && formsLib.isParentActionableStatus(next.status, { signedAt: next.signedAt })) {
      next.status = formsLib.FORM_STATUSES.ASSIGNED;
      next.statusLabel = formsLib.formStatusLabel("notified");
    }
  }
  return {
    document: next,
    idempotentReplay: false,
    remindedAt: now,
    channel,
    actorUserId: normalizeEmail(actorUserId),
  };
}

/**
 * Resolve packet item status from linked Document when documentId present.
 * Canonical Document status wins; legacy items without documentId unchanged.
 */
function resolvePacketItemFromDocument(item = {}, document = null) {
  const base = {
    id: item.id || "",
    packFormId: item.packFormId || "",
    title: item.title || "",
    category: item.category || "",
    status: item.status || "needed",
    statusLabel: item.statusLabel || item.status || "Needed",
    documentId: cleanText(item.documentId || "", 80),
  };
  if (!base.documentId) return { ...base, linked: false };
  if (!document) {
    return {
      ...base,
      linked: true,
      linkStatus: "missing_document",
      status: base.status,
      statusLabel: `${base.statusLabel || "Needed"} (linked document missing)`,
    };
  }
  const status = formsLib.normalizeFormStatus(document.status);
  return {
    ...base,
    linked: true,
    linkStatus: "ok",
    status,
    statusLabel: formsLib.formStatusLabel(document.statusLabel || status),
    signedAt: document.signedAt || "",
    completedAt: document.completedAt || "",
    archived: Boolean(document.archived),
    // Canonical wins — do not keep a parallel mutable status.
    statusSource: "document",
  };
}

function findIdempotentUpload(collection, idempotencyKey) {
  if (!idempotencyKey || !/^[a-zA-Z0-9_-]{8,80}$/.test(idempotencyKey)) return null;
  const id = `upl_${idempotencyKey}`;
  return (Array.isArray(collection) ? collection : []).find((d) => String(d?.id) === id) || null;
}

module.exports = {
  FORMS_MEDIA_KIND,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MAX_DATA_URL_CHARS,
  EXPIRING_SOON_DAYS,
  ALLOWED_MIME,
  isFormsMediaAssetId,
  formsMediaUrl,
  parseUploadDataUrl,
  persistFormsUpload,
  loadFormsUploadBytes,
  localMediaDirFromStorePath,
  removeLocalFormsAsset,
  removeFormsMediaAsset,
  mediaAssetIdForIdempotency,
  buildUploadDocumentRow,
  publicUploadSummary,
  expirationState,
  expirationLabel,
  applyManualReminder,
  resolvePacketItemFromDocument,
  findIdempotentUpload,
  todayIso,
  addDaysIso,
};
