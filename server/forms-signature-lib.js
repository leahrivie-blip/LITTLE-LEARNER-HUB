/**
 * Wave 5 — Electronic signatures + signed-version immutability.
 *
 * Extends Phase 7 buildSignatureRecord / Documents / staffDocuments.
 * Does NOT create a second signature system or a broad file-upload architecture.
 *
 * Memory rules (post-OOM baseline):
 * - No full-store clones here
 * - Strict size caps on drawn signature data URIs
 * - Audit rows never store raw signature images or full answers
 */
"use strict";

const crypto = require("node:crypto");
const formsLib = require("./forms-lib.js");
const formFieldsLib = require("./form-fields-lib.js");

const SIGNATURE_METHODS = Object.freeze({
  TYPED: "typed",
  DRAWN: "drawn",
  ACKNOWLEDGMENT_TEXT: "acknowledgment_text",
});

const MAX_TYPED_SIGNATURE = 120;
const MAX_DRAWN_DATA_URI_CHARS = 48_000; // ~36KB — keep drawn evidence small
const MAX_ANSWERS_JSON_CHARS = 40_000;
const ALLOWED_DRAWN_PREFIXES = [
  "data:image/png;base64,",
  "data:image/jpeg;base64,",
  "data:image/jpg;base64,",
];

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value = "", max = 200) {
  return String(value || "").trim().slice(0, max);
}

function newVersionId() {
  return `fver_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function hashRequestIp(request) {
  try {
    const raw = String(
      request?.headers?.["x-forwarded-for"]
      || request?.socket?.remoteAddress
      || "",
    ).split(",")[0].trim();
    if (!raw) return "";
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 20);
  } catch (_error) {
    return "";
  }
}

function normalizeSignatureMethod(raw = "") {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "typed" || key === "type" || key === "typed_name") return SIGNATURE_METHODS.TYPED;
  if (key === "drawn" || key === "draw" || key === "canvas") return SIGNATURE_METHODS.DRAWN;
  if (
    key === "acknowledgment_text"
    || key === "acknowledgement_text"
    || key === "acknowledge"
    || key === "text"
    || key === "legacy"
    || !key
  ) {
    return SIGNATURE_METHODS.ACKNOWLEDGMENT_TEXT;
  }
  const err = new Error("Unsupported signature method.");
  err.status = 400;
  err.code = "unsupported_signature_method";
  throw err;
}

function normalizeDrawnSignatureDataUrl(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.length > MAX_DRAWN_DATA_URI_CHARS) {
    const err = new Error("Drawn signature is too large. Clear the pad and try a simpler signature.");
    err.status = 400;
    err.code = "drawn_signature_too_large";
    throw err;
  }
  const lower = value.toLowerCase();
  if (lower.includes("<svg") || lower.includes("<script") || lower.includes("javascript:")) {
    const err = new Error("Unsupported drawn signature format.");
    err.status = 400;
    err.code = "drawn_signature_unsafe";
    throw err;
  }
  const ok = ALLOWED_DRAWN_PREFIXES.some((prefix) => lower.startsWith(prefix));
  if (!ok) {
    const err = new Error("Drawn signature must be a PNG or JPEG image.");
    err.status = 400;
    err.code = "drawn_signature_format";
    throw err;
  }
  // Reject non-base64 junk after the comma.
  const b64 = value.slice(value.indexOf(",") + 1);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64) || b64.replace(/\s+/g, "").length < 32) {
    const err = new Error("Drawn signature data is invalid.");
    err.status = 400;
    err.code = "drawn_signature_invalid";
    throw err;
  }
  return value;
}

function contentFingerprint(doc = {}) {
  const bodyText = String(doc.draftText || doc.bodyText || doc.signedSnapshot || "").trim();
  const fields = Array.isArray(doc.fields) ? doc.fields : [];
  const answers = doc.answers && typeof doc.answers === "object" ? doc.answers : {};
  const bodyHash = formsLib.hashFormBody(bodyText);
  const fieldsHash = formFieldsLib.fieldsFingerprint(fields);
  const answersHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(answers))
    .digest("hex");
  return {
    bodyText,
    bodyHash,
    fieldsHash,
    answersHash,
    contentHash: crypto
      .createHash("sha256")
      .update(`${bodyHash}:${fieldsHash}:${answersHash}`)
      .digest("hex"),
  };
}

function validateRequiredAnswers(fields = [], answers = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const values = answers && typeof answers === "object" ? answers : {};
  const missing = [];
  list.forEach((field) => {
    if (!field || field.type === "info" || field.type === "file" || field.type === "signature") return;
    if (!field.required) return;
    const raw = values[field.id];
    const empty = raw == null
      || raw === ""
      || (Array.isArray(raw) && !raw.length)
      || (typeof raw === "boolean" && field.type !== "checkbox" && field.type !== "yes_no");
    if (empty) missing.push({ id: field.id, label: field.label || field.id });
  });
  if (missing.length) {
    const err = new Error(
      `Please complete required fields before signing: ${missing.map((m) => m.label).join(", ")}.`,
    );
    err.status = 400;
    err.code = "required_fields_missing";
    err.missingFields = missing;
    throw err;
  }
  return true;
}

function sanitizeAnswers(answers = {}) {
  const src = answers && typeof answers === "object" ? answers : {};
  const out = {};
  Object.keys(src).slice(0, 80).forEach((key) => {
    const id = cleanText(key, 80);
    if (!id) return;
    const value = src[key];
    if (typeof value === "boolean" || typeof value === "number") {
      out[id] = value;
      return;
    }
    if (Array.isArray(value)) {
      out[id] = value.map((v) => cleanText(v, 200)).filter(Boolean).slice(0, 40);
      return;
    }
    out[id] = cleanText(value, 4000);
  });
  const json = JSON.stringify(out);
  if (json.length > MAX_ANSWERS_JSON_CHARS) {
    const err = new Error("Form answers are too large to submit.");
    err.status = 400;
    err.code = "answers_too_large";
    throw err;
  }
  return out;
}

/**
 * Migration-on-read: ensure versions[] exists without mass-converting the whole store.
 * Legacy signed docs get a single immutable version synthesized from top-level fields.
 */
function ensureDocumentVersions(doc = {}) {
  const base = doc && typeof doc === "object" ? { ...doc } : {};
  if (Array.isArray(base.versions) && base.versions.length) {
    return base;
  }
  const fp = contentFingerprint(base);
  const versionNumber = Number(base.contentVersion || 1) || 1;
  // Deterministic legacy id so migration-on-read is stable across requests
  // (avoids false stale_version when versions[] were never persisted yet).
  const legacyId = cleanText(base.currentVersionId || "", 80)
    || `fver_${cleanText(base.id || "doc", 60) || "doc"}_v${versionNumber}`;
  const version = {
    id: legacyId,
    versionNumber,
    bodyText: fp.bodyText,
    fields: Array.isArray(base.fields) ? base.fields : [],
    answers: base.answers && typeof base.answers === "object" ? base.answers : {},
    bodyHash: fp.bodyHash,
    contentHash: fp.contentHash,
    createdAt: cleanText(base.assignedAt || base.createdAt || base.updatedAt || nowIso(), 40),
    createdBy: cleanText(base.createdBy || base.assignedBy || "", 120),
    reason: base.signedAt ? "legacy_signed_snapshot" : "legacy_current",
    immutable: Boolean(base.signedAt),
    voided: false,
    voidedAt: "",
    voidedBy: "",
    voidReason: "",
    supersededByVersionId: "",
    signature: null,
  };
  if (base.signedAt) {
    version.signature = {
      method: SIGNATURE_METHODS.ACKNOWLEDGMENT_TEXT,
      signedAt: String(base.signedAt),
      signedBy: String(base.signedBy || ""),
      signerDisplayName: String(base.signedBy || ""),
      signerUserId: String(base.signerUserId || ""),
      signerRole: String(base.signedRole || ""),
      signedSnapshot: String(base.signedSnapshot || fp.bodyText).slice(0, 20000),
      signedBodyHash: String(base.signedBodyHash || base.bodyHash || fp.bodyHash),
      contentVersionSigned: Number(base.contentVersionSigned || base.contentVersion || versionNumber),
      versionId: version.id,
      drawnSignatureRef: Boolean(base.drawnSignatureDataUrl),
    };
    // Keep drawn payload on version only when already present and within cap.
    if (base.drawnSignatureDataUrl) {
      try {
        version.signature.drawnSignatureDataUrl = normalizeDrawnSignatureDataUrl(base.drawnSignatureDataUrl);
      } catch (_error) {
        /* drop oversized/unsafe legacy blob rather than failing reads */
      }
    }
  }
  base.versions = [version];
  base.currentVersionId = version.id;
  base.contentVersion = versionNumber;
  base.bodyHash = base.bodyHash || fp.bodyHash;
  return base;
}

function getCurrentVersion(doc = {}) {
  const ensured = ensureDocumentVersions(doc);
  const versions = ensured.versions || [];
  const current = versions.find((v) => String(v.id) === String(ensured.currentVersionId))
    || versions[versions.length - 1]
    || null;
  return { doc: ensured, current };
}

function publicVersionSummary(version = {}, { includeDrawn = false } = {}) {
  if (!version) return null;
  const signature = version.signature && typeof version.signature === "object"
    ? {
      method: version.signature.method || SIGNATURE_METHODS.ACKNOWLEDGMENT_TEXT,
      signedAt: version.signature.signedAt || "",
      signerDisplayName: version.signature.signerDisplayName || version.signature.signedBy || "",
      signerRole: version.signature.signerRole || version.signature.signedRole || "",
      signedBodyHash: version.signature.signedBodyHash || "",
      contentVersionSigned: version.signature.contentVersionSigned || version.versionNumber,
      versionId: version.signature.versionId || version.id,
      hasDrawnSignature: Boolean(
        version.signature.drawnSignatureDataUrl || version.signature.drawnSignatureRef,
      ),
      // Never expose raw IP hash on family-facing summaries.
    }
    : null;
  const out = {
    id: version.id,
    versionNumber: version.versionNumber,
    bodyHash: version.bodyHash,
    contentHash: version.contentHash,
    createdAt: version.createdAt,
    reason: version.reason || "",
    immutable: Boolean(version.immutable),
    voided: Boolean(version.voided),
    voidReason: version.voidReason || "",
    supersededByVersionId: version.supersededByVersionId || "",
    signature,
  };
  if (includeDrawn && signature && version.signature?.drawnSignatureDataUrl) {
    out.signature = {
      ...signature,
      drawnSignatureDataUrl: version.signature.drawnSignatureDataUrl,
    };
  }
  return out;
}

/**
 * Extended signature record — compatible with Phase 7 top-level fields.
 */
function buildSignatureRecord(doc = {}, {
  signerName = "",
  signedRole = "guardian",
  signedAt = "",
  signatureMethod = SIGNATURE_METHODS.ACKNOWLEDGMENT_TEXT,
  signerUserId = "",
  typedSignature = "",
  drawnSignatureDataUrl = "",
  versionId = "",
  ipHash = "",
  programId = "",
  householdId = "",
  childId = "",
  assignmentId = "",
  answers = null,
} = {}) {
  const method = normalizeSignatureMethod(signatureMethod);
  const body = String(doc.draftText || doc.bodyText || doc.signedSnapshot || "").trim();
  const bodyHash = String(doc.bodyHash || formsLib.hashFormBody(body));
  const at = signedAt || nowIso();
  const displayName = cleanText(
    typedSignature || signerName || "Signer",
    MAX_TYPED_SIGNATURE,
  ) || "Signer";
  const drawn = method === SIGNATURE_METHODS.DRAWN
    ? normalizeDrawnSignatureDataUrl(drawnSignatureDataUrl)
    : "";
  if (method === SIGNATURE_METHODS.TYPED && !displayName) {
    const err = new Error("Type your name to sign.");
    err.status = 400;
    err.code = "typed_signature_required";
    throw err;
  }
  if (method === SIGNATURE_METHODS.DRAWN && !drawn) {
    const err = new Error("Draw your signature before submitting.");
    err.status = 400;
    err.code = "drawn_signature_required";
    throw err;
  }
  const record = {
    status: formsLib.FORM_STATUSES.SUBMITTED,
    statusLabel: formsLib.formStatusLabel(formsLib.FORM_STATUSES.SUBMITTED),
    signedAt: at,
    signedBy: displayName,
    signedRole: cleanText(signedRole || "guardian", 80) || "guardian",
    signedSnapshot: body.slice(0, 20000),
    signedBodyHash: bodyHash,
    bodyHash,
    contentVersion: Number(doc.contentVersion || 1),
    contentVersionSigned: Number(doc.contentVersion || 1),
    providerReviewed: false,
    updatedAt: at,
    // Wave 5 evidence
    signatureMethod: method,
    signerUserId: cleanText(signerUserId, 120),
    signerDisplayName: displayName,
    typedSignature: method === SIGNATURE_METHODS.TYPED ? displayName : "",
    drawnSignatureDataUrl: drawn,
    versionId: cleanText(versionId, 80),
    ipHash: cleanText(ipHash, 64),
    programId: cleanText(programId, 80),
    householdId: cleanText(householdId, 80),
    childId: cleanText(childId, 80),
    assignmentId: cleanText(assignmentId || doc.id, 80),
    answers: answers && typeof answers === "object" ? answers : undefined,
  };
  return record;
}

function attachSignatureToVersion(doc, signature, { expectedVersionId = "", expectedBodyHash = "" } = {}) {
  const { doc: ensured, current } = getCurrentVersion(doc);
  if (!current) {
    const err = new Error("Form version is missing.");
    err.status = 409;
    err.code = "version_missing";
    throw err;
  }
  if (current.voided) {
    const err = new Error("This form version was voided. Review the latest version before signing.");
    err.status = 409;
    err.code = "version_voided";
    throw err;
  }
  if (current.immutable && current.signature?.signedAt) {
    // Idempotent path handled by caller — here treat as conflict if different signer attempt.
    const err = new Error("This version is already signed.");
    err.status = 409;
    err.code = "version_already_signed";
    err.existing = current;
    throw err;
  }
  if (expectedVersionId && String(expectedVersionId) !== String(current.id)) {
    const err = new Error("This form was updated. Please review the latest version before signing.");
    err.status = 409;
    err.code = "stale_version";
    err.currentVersionId = current.id;
    err.currentBodyHash = current.bodyHash;
    throw err;
  }
  const liveHash = String(current.bodyHash || contentFingerprint(ensured).bodyHash);
  if (expectedBodyHash && String(expectedBodyHash) !== liveHash) {
    const err = new Error("This form was updated. Please review the latest version before signing.");
    err.status = 409;
    err.code = "stale_version";
    err.currentVersionId = current.id;
    err.currentBodyHash = liveHash;
    throw err;
  }

  const versionSignature = {
    method: signature.signatureMethod,
    signedAt: signature.signedAt,
    signedBy: signature.signedBy,
    signerDisplayName: signature.signerDisplayName,
    signerUserId: signature.signerUserId,
    signerRole: signature.signedRole,
    signedSnapshot: signature.signedSnapshot,
    signedBodyHash: signature.signedBodyHash,
    contentVersionSigned: signature.contentVersionSigned,
    versionId: current.id,
    ipHash: signature.ipHash || "",
    programId: signature.programId || "",
    householdId: signature.householdId || "",
    childId: signature.childId || "",
    assignmentId: signature.assignmentId || ensured.id,
    typedSignature: signature.typedSignature || "",
    drawnSignatureDataUrl: signature.drawnSignatureDataUrl || "",
    drawnSignatureRef: Boolean(signature.drawnSignatureDataUrl),
    answers: signature.answers,
  };

  const versions = (ensured.versions || []).map((ver) => {
    if (String(ver.id) !== String(current.id)) return ver;
    return {
      ...ver,
      bodyText: String(ver.bodyText || ensured.draftText || "").slice(0, 20000),
      fields: Array.isArray(ver.fields) ? ver.fields : (ensured.fields || []),
      answers: signature.answers || ver.answers || {},
      immutable: true,
      signature: versionSignature,
    };
  });

  return {
    ...ensured,
    versions,
    currentVersionId: current.id,
    status: signature.status,
    statusLabel: signature.statusLabel,
    signedAt: signature.signedAt,
    signedBy: signature.signedBy,
    signedRole: signature.signedRole,
    signedSnapshot: signature.signedSnapshot,
    signedBodyHash: signature.signedBodyHash,
    bodyHash: signature.bodyHash,
    contentVersion: signature.contentVersion,
    contentVersionSigned: signature.contentVersionSigned,
    signerUserId: signature.signerUserId,
    signatureMethod: signature.signatureMethod,
    typedSignature: signature.typedSignature || "",
    // Keep drawn only on the version object to avoid duplicating large payloads on the root.
    drawnSignatureDataUrl: "",
    answers: signature.answers || ensured.answers || {},
    providerReviewed: false,
    updatedAt: signature.updatedAt,
    completedAt: signature.signedAt,
  };
}

/**
 * Create a new mutable version after a signed version (correction / reissue).
 * Preserves prior signed versions forever.
 */
function createSupersedingVersion(doc = {}, {
  nextBody = "",
  nextFields = null,
  nextAnswers = null,
  createdBy = "",
  reason = "correction",
  voidPrior = false,
  voidReason = "",
} = {}) {
  const ensured = ensureDocumentVersions(doc);
  const { current } = getCurrentVersion(ensured);
  const body = String(nextBody != null ? nextBody : (ensured.draftText || "")).trim();
  const fields = Array.isArray(nextFields) ? nextFields : (ensured.fields || []);
  const answers = nextAnswers && typeof nextAnswers === "object" ? nextAnswers : {};
  const fp = contentFingerprint({ draftText: body, fields, answers });
  const nextNumber = Math.max(
    ...((ensured.versions || []).map((v) => Number(v.versionNumber) || 0)),
    Number(ensured.contentVersion) || 1,
  ) + 1;
  const nextId = newVersionId();
  const versions = (ensured.versions || []).map((ver) => {
    if (!current || String(ver.id) !== String(current.id)) return ver;
    const patched = {
      ...ver,
      supersededByVersionId: nextId,
    };
    if (voidPrior && ver.signature?.signedAt) {
      patched.voided = true;
      patched.voidedAt = nowIso();
      patched.voidedBy = cleanText(createdBy, 120);
      patched.voidReason = cleanText(voidReason || reason || "Superseded by corrected version", 240);
      // Remains immutable + historically accessible.
      patched.immutable = true;
    }
    return patched;
  });
  versions.push({
    id: nextId,
    versionNumber: nextNumber,
    bodyText: body.slice(0, 20000),
    fields,
    answers,
    bodyHash: fp.bodyHash,
    contentHash: fp.contentHash,
    createdAt: nowIso(),
    createdBy: cleanText(createdBy, 120),
    reason: cleanText(reason, 240) || "correction",
    immutable: false,
    voided: false,
    voidedAt: "",
    voidedBy: "",
    voidReason: "",
    supersededByVersionId: "",
    signature: null,
  });

  return {
    ...ensured,
    versions,
    currentVersionId: nextId,
    draftText: body,
    bodyText: body,
    fields,
    answers,
    bodyHash: fp.bodyHash,
    contentVersion: nextNumber,
    // Current row is unsigned (latest version).
    signedAt: "",
    signedBy: "",
    signedRole: "",
    signedSnapshot: "",
    signedBodyHash: "",
    signerUserId: "",
    signatureMethod: "",
    typedSignature: "",
    drawnSignatureDataUrl: "",
    providerReviewed: false,
    status: formsLib.FORM_STATUSES.NEEDS_CORRECTION,
    statusLabel: formsLib.formStatusLabel(formsLib.FORM_STATUSES.NEEDS_CORRECTION),
    updatedAt: nowIso(),
    signatureInvalidatedAt: "",
    signatureInvalidatedReason: "",
  };
}

function voidCurrentSignedVersion(doc = {}, { voidedBy = "", voidReason = "" } = {}) {
  const ensured = ensureDocumentVersions(doc);
  const { current } = getCurrentVersion(ensured);
  if (!current?.signature?.signedAt) {
    const err = new Error("There is no signed version to void.");
    err.status = 400;
    err.code = "nothing_to_void";
    throw err;
  }
  if (!cleanText(voidReason, 240)) {
    const err = new Error("A reason is required to void a signed version.");
    err.status = 400;
    err.code = "void_reason_required";
    throw err;
  }
  const versions = (ensured.versions || []).map((ver) => {
    if (String(ver.id) !== String(current.id)) return ver;
    return {
      ...ver,
      voided: true,
      voidedAt: nowIso(),
      voidedBy: cleanText(voidedBy, 120),
      voidReason: cleanText(voidReason, 240),
      immutable: true,
    };
  });
  return {
    ...ensured,
    versions,
    // Keep historical top-level signature fields for legacy readers, but mark needs_correction.
    status: formsLib.FORM_STATUSES.NEEDS_CORRECTION,
    statusLabel: formsLib.formStatusLabel(formsLib.FORM_STATUSES.NEEDS_CORRECTION),
    updatedAt: nowIso(),
    voidedAt: nowIso(),
    voidReason: cleanText(voidReason, 240),
  };
}

/**
 * Material body edit after a signature → new version (preserve history).
 * Replaces destructive signature clearing.
 */
function applyFormBodyEditPreservingHistory(doc = {}, nextBody = "", {
  createdBy = "",
  reason = "Form content changed after signature — new version created",
} = {}) {
  const body = String(nextBody || "").trim();
  const nextHash = formsLib.hashFormBody(body);
  const prevHash = String(doc.bodyHash || "").trim();
  const hadSignature = Boolean(doc.signedAt) || Boolean(doc.signedSnapshot)
    || (Array.isArray(doc.versions) && doc.versions.some((v) => v?.signature?.signedAt));
  const materialChange = hadSignature && prevHash && prevHash !== nextHash;
  if (!materialChange) {
    const ensured = ensureDocumentVersions({
      ...doc,
      draftText: body,
      bodyHash: nextHash || formsLib.hashFormBody(body),
      updatedAt: nowIso(),
    });
    // Keep current version body in sync when unsigned / non-material.
    const { current } = getCurrentVersion(ensured);
    if (current && !current.immutable) {
      ensured.versions = ensured.versions.map((ver) => (
        String(ver.id) === String(current.id)
          ? { ...ver, bodyText: body, bodyHash: nextHash || ver.bodyHash }
          : ver
      ));
    }
    return {
      ...ensured,
      draftText: body,
      bodyHash: nextHash || formsLib.hashFormBody(body),
      contentVersion: Number(ensured.contentVersion || 1),
      updatedAt: nowIso(),
    };
  }
  return createSupersedingVersion(doc, {
    nextBody: body,
    nextFields: doc.fields,
    createdBy,
    reason,
    voidPrior: false,
  });
}

function findLatestSignedVersion(doc = {}) {
  const ensured = ensureDocumentVersions(doc);
  const signed = (ensured.versions || [])
    .filter((v) => v?.signature?.signedAt)
    .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber));
  return signed[0] || null;
}

function isIdempotentResign(doc = {}, { signerUserId = "", expectedBodyHash = "" } = {}) {
  const { current } = getCurrentVersion(doc);
  if (!current?.signature?.signedAt) return false;
  const hashOk = !expectedBodyHash
    || String(expectedBodyHash) === String(current.bodyHash || current.signature.signedBodyHash || "");
  const signerOk = !signerUserId
    || !current.signature.signerUserId
    || String(current.signature.signerUserId).toLowerCase() === String(signerUserId).toLowerCase();
  return Boolean(hashOk && signerOk && current.immutable);
}

module.exports = {
  SIGNATURE_METHODS,
  MAX_TYPED_SIGNATURE,
  MAX_DRAWN_DATA_URI_CHARS,
  normalizeSignatureMethod,
  normalizeDrawnSignatureDataUrl,
  hashRequestIp,
  contentFingerprint,
  validateRequiredAnswers,
  sanitizeAnswers,
  ensureDocumentVersions,
  getCurrentVersion,
  publicVersionSummary,
  buildSignatureRecord,
  attachSignatureToVersion,
  createSupersedingVersion,
  voidCurrentSignedVersion,
  applyFormBodyEditPreservingHistory,
  findLatestSignedVersion,
  isIdempotentResign,
};
