/**
 * Resumable, idempotent migration of inline curriculum resource fileData → llh_media_assets.
 * Never runs automatically — invoked only via admin API or explicit CLI script.
 */
const curriculumMedia = require("./curriculum-media.js");

const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS llh_curriculum_media_migrations (
    resource_id TEXT PRIMARY KEY,
    media_asset_id TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    original_bytes BIGINT NOT NULL,
    base64_chars BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const TERMINAL_STATUSES = new Set(["verified", "inline_removed"]);

async function initMigrationTable(pool, queryFn) {
  const run = queryFn || ((sql, params) => pool.query(sql, params));
  await run(MIGRATION_TABLE_SQL, []);
}

async function getMigrationRow(pool, resourceId) {
  const result = await pool.query(
    `SELECT resource_id, media_asset_id, sha256, original_bytes, base64_chars, status, error, updated_at
     FROM llh_curriculum_media_migrations WHERE resource_id = $1`,
    [resourceId],
  );
  return result.rows[0] || null;
}

async function upsertMigrationRow(pool, row) {
  await pool.query(
    `INSERT INTO llh_curriculum_media_migrations (
      resource_id, media_asset_id, sha256, original_bytes, base64_chars, status, error, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (resource_id) DO UPDATE SET
      media_asset_id = EXCLUDED.media_asset_id,
      sha256 = EXCLUDED.sha256,
      original_bytes = EXCLUDED.original_bytes,
      base64_chars = EXCLUDED.base64_chars,
      status = EXCLUDED.status,
      error = EXCLUDED.error,
      updated_at = NOW()`,
    [
      row.resource_id,
      row.media_asset_id,
      row.sha256,
      row.original_bytes,
      row.base64_chars,
      row.status,
      row.error || "",
    ],
  );
}

function pickResourcesToMigrate(store, { resourceIds = [], limit = 0 } = {}) {
  const inventory = curriculumMedia.inventoryInlineCurriculumResources(store);
  let rows = inventory;
  if (resourceIds.length) {
    const wanted = new Set(resourceIds);
    rows = rows.filter((r) => wanted.has(r.resourceId));
  }
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}

function patchResourceInStore(store, resourceId, patch) {
  const curriculum = store?.siteContent?.curriculum;
  if (!curriculum || !Array.isArray(curriculum.resources)) return false;
  const idx = curriculum.resources.findIndex((r) => r.id === resourceId);
  if (idx < 0) return false;
  curriculum.resources[idx] = { ...curriculum.resources[idx], ...patch };
  return true;
}

async function migrateOneInlineResource(pool, store, item, options = {}) {
  const {
    dryRun = true,
    removeInlineAfterVerify = false,
  } = options;
  const resourceId = item.resourceId;
  const existing = await getMigrationRow(pool, resourceId);
  if (existing && TERMINAL_STATUSES.has(existing.status) && !removeInlineAfterVerify) {
    return {
      resourceId,
      status: "skipped",
      reason: `already_${existing.status}`,
      mediaAssetId: existing.media_asset_id,
      sha256: existing.sha256,
    };
  }

  const curriculum = store?.siteContent?.curriculum || {};
  const resource = (curriculum.resources || []).find((r) => r.id === resourceId);
  if (!resource) {
    return { resourceId, status: "failed", error: "resource_not_found" };
  }

  const inline = String(resource.fileData || "").trim();
  if (!curriculumMedia.isInlineCurriculumFileData(inline)) {
    if (resource.mediaAssetId) {
      return { resourceId, status: "skipped", reason: "already_external", mediaAssetId: resource.mediaAssetId };
    }
    return { resourceId, status: "skipped", reason: "not_inline" };
  }

  const decoded = curriculumMedia.decodeInlineCurriculumFileData(inline);
  if (!decoded) {
    return { resourceId, status: "failed", error: "decode_failed" };
  }

  const mediaAssetId = resource.mediaAssetId || curriculumMedia.curriculumResourceMediaAssetId(resourceId);
  const mediaUrl = curriculumMedia.curriculumResourceMediaUrl(mediaAssetId);
  const result = {
    resourceId,
    title: resource.title || "",
    mimeType: resource.mimeType || decoded.mimeType,
    fileName: resource.fileName || "resource",
    mediaAssetId,
    mediaUrl,
    sha256: decoded.sha256,
    originalBytes: decoded.originalBytes,
    base64Chars: decoded.base64Chars,
    dryRun,
  };

  if (dryRun) {
    result.status = "dry_run";
    return result;
  }

  try {
    if (!existing || existing.status === "pending" || existing.status === "failed") {
      await curriculumMedia.insertMediaAsset(pool, {
        id: mediaAssetId,
        kind: curriculumMedia.CURRICULUM_RESOURCE_MEDIA_KIND,
        mimeType: resource.mimeType || decoded.mimeType,
        fileName: resource.fileName || "resource",
        buffer: decoded.buffer,
      });
      await upsertMigrationRow(pool, {
        resource_id: resourceId,
        media_asset_id: mediaAssetId,
        sha256: decoded.sha256,
        original_bytes: decoded.originalBytes,
        base64_chars: decoded.base64Chars,
        status: "asset_stored",
        error: "",
      });
    }

    const verified = await curriculumMedia.verifyMediaAssetChecksum(
      pool,
      mediaAssetId,
      curriculumMedia.CURRICULUM_RESOURCE_MEDIA_KIND,
      decoded.sha256,
    );
    if (!verified.ok) {
      await upsertMigrationRow(pool, {
        resource_id: resourceId,
        media_asset_id: mediaAssetId,
        sha256: decoded.sha256,
        original_bytes: decoded.originalBytes,
        base64_chars: decoded.base64Chars,
        status: "failed",
        error: verified.reason || "verify_failed",
      });
      return { ...result, status: "failed", error: verified.reason || "verify_failed" };
    }

    const now = new Date().toISOString();
    patchResourceInStore(store, resourceId, {
      mediaAssetId,
      mediaUrl,
      mimeType: resource.mimeType || decoded.mimeType,
      updatedAt: now,
    });

    let nextStatus = "verified";
    if (removeInlineAfterVerify) {
      patchResourceInStore(store, resourceId, {
        fileData: "",
        inlineFileDataRetained: false,
        updatedAt: now,
      });
      nextStatus = "inline_removed";
    } else {
      patchResourceInStore(store, resourceId, {
        inlineFileDataRetained: true,
        updatedAt: now,
      });
    }

    await upsertMigrationRow(pool, {
      resource_id: resourceId,
      media_asset_id: mediaAssetId,
      sha256: decoded.sha256,
      original_bytes: decoded.originalBytes,
      base64_chars: decoded.base64Chars,
      status: nextStatus,
      error: "",
    });

    return {
      ...result,
      status: nextStatus,
      verified: true,
      inlineRemoved: removeInlineAfterVerify,
    };
  } catch (error) {
    await upsertMigrationRow(pool, {
      resource_id: resourceId,
      media_asset_id: mediaAssetId,
      sha256: decoded.sha256,
      original_bytes: decoded.originalBytes,
      base64_chars: decoded.base64Chars,
      status: "failed",
      error: String(error.message || error).slice(0, 500),
    }).catch(() => {});
    return { ...result, status: "failed", error: error.message || String(error) };
  }
}

async function runInlineResourceMigration(pool, store, options = {}) {
  const {
    dryRun = true,
    limit = 0,
    resourceIds = [],
    removeInlineAfterVerify = false,
  } = options;
  await initMigrationTable(pool);
  const targets = pickResourcesToMigrate(store, { resourceIds, limit });
  const results = [];
  for (const item of targets) {
    results.push(await migrateOneInlineResource(pool, store, item, { dryRun, removeInlineAfterVerify }));
  }
  const summary = {
    dryRun,
    attempted: results.length,
    succeeded: results.filter((r) => ["verified", "inline_removed", "dry_run"].includes(r.status)).length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
  return summary;
}

module.exports = {
  initMigrationTable,
  inventoryInlineCurriculumResources: curriculumMedia.inventoryInlineCurriculumResources,
  runInlineResourceMigration,
  migrateOneInlineResource,
  getMigrationRow,
};
