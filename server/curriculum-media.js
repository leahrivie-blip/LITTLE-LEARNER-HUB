/**
 * Curriculum resource media — externalize binaries from llh_store into llh_media_assets.
 * Mirrors the lesson-plan cover pattern (BYTEA in Postgres, served via /api/media/*).
 */
const crypto = require("node:crypto");

const CURRICULUM_RESOURCE_MEDIA_KIND = "curriculum-resource";
const INLINE_DATA_URL_MAX_BYTES = 8_000_000;

function curriculumResourceMediaAssetId(resourceId) {
  const id = String(resourceId || "").trim();
  if (!id) return "";
  return `curriculum-resource-${id}`;
}

function curriculumResourceMediaUrl(mediaAssetId) {
  const id = String(mediaAssetId || "").trim();
  if (!id) return "";
  return `/api/media/curriculum-resources/${encodeURIComponent(id)}`;
}

function isInlineCurriculumFileData(value) {
  const text = String(value || "").trim();
  return text.startsWith("data:image/") || text.startsWith("data:application/pdf");
}

function isHttpsCurriculumFileRef(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("https://")) return false;
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function decodeInlineCurriculumFileData(fileData) {
  const text = String(fileData || "").trim();
  const match = text.match(/^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = String(match[1] || "").trim().toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) return null;
  return {
    mimeType,
    buffer,
    originalBytes: buffer.length,
    base64Chars: text.length,
    sha256: sha256Buffer(buffer),
  };
}

async function insertMediaAsset(pool, { id, kind, mimeType, fileName, buffer }) {
  await pool.query(
    `INSERT INTO llh_media_assets (id, kind, mime_type, file_name, bytes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       kind = EXCLUDED.kind,
       mime_type = EXCLUDED.mime_type,
       file_name = EXCLUDED.file_name,
       bytes = EXCLUDED.bytes`,
    [id, kind, mimeType, fileName, buffer],
  );
}

async function readMediaAsset(pool, id, kind) {
  const result = await pool.query(
    `SELECT id, kind, mime_type, file_name, bytes, octet_length(bytes) AS byte_len
     FROM llh_media_assets
     WHERE id = $1 AND kind = $2
     LIMIT 1`,
    [id, kind],
  );
  const row = result.rows[0];
  if (!row?.bytes) return null;
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    fileName: row.file_name,
    buffer: row.bytes,
    byteLen: Number(row.byte_len || row.bytes.length || 0),
  };
}

async function verifyMediaAssetChecksum(pool, id, kind, expectedSha256) {
  const asset = await readMediaAsset(pool, id, kind);
  if (!asset) return { ok: false, reason: "asset_missing" };
  const actual = sha256Buffer(asset.buffer);
  if (actual !== expectedSha256) return { ok: false, reason: "checksum_mismatch", actual };
  return { ok: true, asset };
}

function inventoryInlineCurriculumResources(store) {
  const curriculum = store?.siteContent?.curriculum || {};
  const resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];
  const lessonPlans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  const rows = [];
  for (const resource of resources) {
    if (!resource || typeof resource !== "object") continue;
    const fileData = String(resource.fileData || "").trim();
    if (!isInlineCurriculumFileData(fileData)) continue;
    const decoded = decodeInlineCurriculumFileData(fileData);
    const lessonRefs = (resource.lessonPlanIds || []).map((lessonPlanId) => {
      const plan = lessonPlans.find((p) => p.id === lessonPlanId);
      return plan ? { lessonPlanId, title: plan.title || "" } : { lessonPlanId, title: "" };
    });
    const activityRefs = activities
      .filter((a) => (resource.lessonPlanIds || []).includes(a.lessonPlanId))
      .slice(0, 20)
      .map((a) => ({ activityId: a.id, title: a.title || "", lessonPlanId: a.lessonPlanId }));
    rows.push({
      resourceId: resource.id,
      title: resource.title || "",
      mimeType: resource.mimeType || decoded?.mimeType || "",
      fileName: resource.fileName || "",
      status: resource.status || "",
      originalBytes: decoded?.originalBytes || 0,
      base64Chars: decoded?.base64Chars || fileData.length,
      sha256: decoded?.sha256 || "",
      fileDataStatus: resource.mediaAssetId ? "inline_and_external" : "inline_only",
      mediaAssetId: resource.mediaAssetId || curriculumResourceMediaAssetId(resource.id),
      proposedMediaUrl: curriculumResourceMediaUrl(curriculumResourceMediaAssetId(resource.id)),
      lessonPlanRefs: lessonRefs,
      activityRefs,
      updatedAt: resource.updatedAt || "",
    });
  }
  return rows;
}

function curriculumResourceHasDeliverableFile(resource) {
  if (!resource) return false;
  if (resource.mediaAssetId || resource.mediaUrl) return true;
  return Boolean(String(resource.fileData || "").trim());
}

function curriculumResourcePublicDto(resource, { fileData = "", mediaUrl = "" } = {}) {
  return {
    id: resource.id,
    title: resource.title,
    resourceCategory: resource.resourceCategory,
    mimeType: resource.mimeType,
    fileName: resource.fileName,
    status: resource.status,
    mediaAssetId: resource.mediaAssetId || "",
    mediaUrl: mediaUrl || resource.mediaUrl || "",
    fileData,
    hasFile: curriculumResourceHasDeliverableFile(resource),
  };
}

module.exports = {
  CURRICULUM_RESOURCE_MEDIA_KIND,
  INLINE_DATA_URL_MAX_BYTES,
  curriculumResourceMediaAssetId,
  curriculumResourceMediaUrl,
  isInlineCurriculumFileData,
  isHttpsCurriculumFileRef,
  sha256Buffer,
  decodeInlineCurriculumFileData,
  insertMediaAsset,
  readMediaAsset,
  verifyMediaAssetChecksum,
  inventoryInlineCurriculumResources,
  curriculumResourceHasDeliverableFile,
  curriculumResourcePublicDto,
};
