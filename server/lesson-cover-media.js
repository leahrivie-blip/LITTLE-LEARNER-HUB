/**
 * Lesson-plan cover media helpers.
 * Postgres BYTEA in production; local-json sidecar next to the store for dev/test.
 * Never stores cover bytes inside curriculum JSON.
 */
const fs = require("node:fs");
const path = require("node:path");

const LESSON_COVER_MEDIA_KIND = "lesson-plan-cover";

function localCoverDirFromStorePath(storePath) {
  return String(storePath || "").replace(/(\.json)?$/i, ".lesson-covers");
}

function writeLocalLessonCover(dir, assetId, { mimeType, buffer, fileName }) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, assetId);
  const meta = {
    id: assetId,
    kind: LESSON_COVER_MEDIA_KIND,
    mimeType: mimeType || "application/octet-stream",
    fileName: fileName || "lesson-cover",
    byteLen: buffer.length,
    updatedAt: new Date().toISOString(),
  };
  const tmpBin = `${base}.bin.tmp-${process.pid}`;
  const tmpJson = `${base}.json.tmp-${process.pid}`;
  fs.writeFileSync(tmpBin, buffer);
  fs.writeFileSync(tmpJson, JSON.stringify(meta, null, 2));
  fs.renameSync(tmpBin, `${base}.bin`);
  fs.renameSync(tmpJson, `${base}.json`);
  return meta;
}

function readLocalLessonCover(dir, assetId) {
  const base = path.join(dir, String(assetId || "").trim());
  const binPath = `${base}.bin`;
  const metaPath = `${base}.json`;
  if (!fs.existsSync(binPath) || !fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const buffer = fs.readFileSync(binPath);
  if (!buffer.length) return null;
  return {
    id: assetId,
    kind: LESSON_COVER_MEDIA_KIND,
    mimeType: meta.mimeType || "application/octet-stream",
    fileName: meta.fileName || "",
    buffer,
    byteLen: buffer.length,
  };
}

function lessonCoverMediaUrl(assetId) {
  const id = String(assetId || "").trim();
  if (!id) return "";
  return `/api/media/lesson-covers/${encodeURIComponent(id)}`;
}

module.exports = {
  LESSON_COVER_MEDIA_KIND,
  localCoverDirFromStorePath,
  writeLocalLessonCover,
  readLocalLessonCover,
  lessonCoverMediaUrl,
};
