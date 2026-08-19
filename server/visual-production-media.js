/**
 * Visual Production preview media — isolated from lesson assets.
 * Postgres BYTEA in production; local-json sidecar for dev/test.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const VISUAL_PRODUCTION_PREVIEW_KIND = "visual-production-preview";

function visualProductionPreviewAssetId() {
  return `vp-preview-${crypto.randomBytes(16).toString("hex")}`;
}

function isVisualProductionPreviewAssetId(value) {
  return /^vp-preview-[a-f0-9]{16,64}$/i.test(String(value || "").trim());
}

function visualProductionPreviewMediaUrl(assetId) {
  const id = String(assetId || "").trim();
  if (!id) return "";
  return `/api/admin/media/visual-production-previews/${encodeURIComponent(id)}`;
}

function localPreviewDirFromStorePath(storePath) {
  return String(storePath || "").replace(/(\.json)?$/i, ".visual-production-previews");
}

function writeLocalVisualProductionPreview(dir, assetId, { mimeType, buffer, fileName, meta }) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, assetId);
  const payload = {
    id: assetId,
    kind: VISUAL_PRODUCTION_PREVIEW_KIND,
    mimeType: mimeType || "image/png",
    fileName: fileName || "visual-production-preview.png",
    byteLen: buffer.length,
    briefId: meta?.briefId || "",
    lessonId: meta?.lessonId || "",
    updatedAt: new Date().toISOString(),
  };
  const tmpBin = `${base}.bin.tmp-${process.pid}`;
  const tmpJson = `${base}.json.tmp-${process.pid}`;
  fs.writeFileSync(tmpBin, buffer);
  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpBin, `${base}.bin`);
  fs.renameSync(tmpJson, `${base}.json`);
  return payload;
}

function readLocalVisualProductionPreview(dir, assetId) {
  const base = path.join(dir, String(assetId || "").trim());
  const binPath = `${base}.bin`;
  const metaPath = `${base}.json`;
  if (!fs.existsSync(binPath) || !fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const buffer = fs.readFileSync(binPath);
  if (!buffer.length) return null;
  return {
    id: assetId,
    kind: VISUAL_PRODUCTION_PREVIEW_KIND,
    mimeType: meta.mimeType || "image/png",
    fileName: meta.fileName || "",
    buffer,
    byteLen: buffer.length,
    briefId: meta.briefId || "",
    lessonId: meta.lessonId || "",
  };
}

/**
 * @param {object} input
 * @returns {Promise<{ assetId: string, url: string, storage: string }>}
 */
async function persistVisualProductionPreview(input) {
  const source = input && typeof input === "object" ? input : {};
  const buffer = source.buffer;
  if (!buffer?.length) throw new Error("Preview image bytes are required.");
  const assetId = String(source.assetId || visualProductionPreviewAssetId()).trim();
  const mimeType = String(source.mimeType || "image/png").trim();
  const fileName = String(source.fileName || "visual-production-preview.png").trim();
  const briefId = String(source.briefId || "").trim();
  const lessonId = String(source.lessonId || "").trim();
  const meta = { briefId, lessonId };

  if (source.usePostgresStore?.() && source.postgresPool && source.databaseReady?.()) {
    await source.curriculumMedia.insertMediaAsset(source.postgresPool, {
      id: assetId,
      kind: VISUAL_PRODUCTION_PREVIEW_KIND,
      mimeType,
      fileName,
      buffer,
    });
    return {
      assetId,
      url: visualProductionPreviewMediaUrl(assetId),
      storage: "postgres",
    };
  }

  writeLocalVisualProductionPreview(
    localPreviewDirFromStorePath(source.storePath),
    assetId,
    { mimeType, buffer, fileName, meta },
  );
  return {
    assetId,
    url: visualProductionPreviewMediaUrl(assetId),
    storage: "local-sidecar",
  };
}

/**
 * @param {object} input
 * @returns {Promise<{ mimeType: string, buffer: Buffer } | null>}
 */
async function readVisualProductionPreview(input) {
  const source = input && typeof input === "object" ? input : {};
  const assetId = String(source.assetId || "").trim();
  if (!isVisualProductionPreviewAssetId(assetId)) return null;

  if (source.usePostgresStore?.() && source.postgresPool && source.databaseReady?.()) {
    const asset = await source.curriculumMedia.readMediaAsset(
      source.postgresPool,
      assetId,
      VISUAL_PRODUCTION_PREVIEW_KIND,
    );
    if (!asset?.buffer?.length) return null;
    return { mimeType: asset.mimeType || "image/png", buffer: asset.buffer };
  }

  const local = readLocalVisualProductionPreview(
    localPreviewDirFromStorePath(source.storePath),
    assetId,
  );
  if (!local?.buffer?.length) return null;
  return { mimeType: local.mimeType || "image/png", buffer: local.buffer };
}

module.exports = {
  VISUAL_PRODUCTION_PREVIEW_KIND,
  visualProductionPreviewAssetId,
  isVisualProductionPreviewAssetId,
  visualProductionPreviewMediaUrl,
  localPreviewDirFromStorePath,
  writeLocalVisualProductionPreview,
  readLocalVisualProductionPreview,
  persistVisualProductionPreview,
  readVisualProductionPreview,
};
