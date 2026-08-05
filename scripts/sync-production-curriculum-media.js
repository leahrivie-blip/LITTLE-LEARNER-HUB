#!/usr/bin/env node
/**
 * Copy missing production curriculum resources + llh_media_assets into testing.
 * Never writes production. Idempotent upserts by id.
 */
"use strict";

const fs = require("fs");
const { Client } = require("pg");
const sync = require("../server/curriculum-production-sync");

function readUrl(file) {
  return fs.readFileSync(file, "utf8").trim();
}

async function withClient(url, fn, { readOnly = false } = {}) {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  try {
    if (readOnly) {
      await client.query("BEGIN READ ONLY");
      try { return await fn(client); }
      finally { await client.query("ROLLBACK").catch(() => {}); }
    }
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

function collectMediaIds(curriculum) {
  const ids = new Set();
  const visit = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      const m = value.match(/\/api\/media\/(?:curriculum-resources|lesson-covers|enrichment)\/([^/?#]+)/i);
      if (m) ids.add(decodeURIComponent(m[1]));
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === "object") {
      if (value.mediaAssetId) ids.add(String(value.mediaAssetId));
      Object.values(value).forEach(visit);
    }
  };
  visit(curriculum);
  return [...ids];
}

async function main() {
  const sourceUrl = readUrl(process.argv.includes("--source-db-url-file")
    ? process.argv[process.argv.indexOf("--source-db-url-file") + 1]
    : "/tmp/llh-db/prod.url");
  const targetUrl = readUrl(process.argv.includes("--target-db-url-file")
    ? process.argv[process.argv.indexOf("--target-db-url-file") + 1]
    : "/tmp/llh-db/test.url");
  if (new URL(sourceUrl).hostname === new URL(targetUrl).hostname) {
    throw new Error("Refusing: source and target hosts match.");
  }

  const production = await withClient(sourceUrl, async (client) => {
    const row = await client.query("SELECT data FROM llh_store WHERE id = $1", ["launch-store"]);
    return sync.normalizeCurriculum(row.rows[0].data.siteContent.curriculum);
  }, { readOnly: true });

  const mediaIds = collectMediaIds(production);
  console.log(`[media-sync] Production resources=${production.resources.length} referencedMedia=${mediaIds.length}`);

  const mediaRows = await withClient(sourceUrl, async (client) => {
    if (!mediaIds.length) return [];
    const result = await client.query(
      "SELECT id, kind, mime_type, file_name, bytes, created_at FROM llh_media_assets WHERE id = ANY($1::text[])",
      [mediaIds],
    );
    return result.rows;
  }, { readOnly: true });
  console.log(`[media-sync] Loaded ${mediaRows.length} media rows from production`);

  const report = await withClient(targetUrl, async (client) => {
    await client.query("BEGIN");
    try {
      const storeRes = await client.query("SELECT data FROM llh_store WHERE id = $1 FOR UPDATE", ["launch-store"]);
      const store = storeRes.rows[0].data;
      const testing = sync.normalizeCurriculum(store.siteContent?.curriculum);
      const existingRes = new Map(testing.resources.map((r) => [r.id, r]));
      let resourcesImported = 0;
      let resourcesUpdated = 0;
      for (const res of production.resources) {
        const marked = sync.markProductionSnapshot(res);
        const prev = existingRes.get(res.id);
        if (!prev) {
          existingRes.set(res.id, marked);
          resourcesImported += 1;
        } else if (sync.contentHash(prev) !== sync.contentHash(res) || !sync.isProductionSnapshot(prev)) {
          existingRes.set(res.id, marked);
          resourcesUpdated += 1;
        }
      }
      const nextCurriculum = {
        ...testing,
        resources: [...existingRes.values()],
        updatedAt: new Date().toISOString(),
      };
      // never shrink lessons
      if (nextCurriculum.lessonPlans.length < testing.lessonPlans.length) {
        throw new Error("Safety abort: lesson count would shrink");
      }
      store.siteContent = store.siteContent || {};
      store.siteContent.curriculum = nextCurriculum;
      store.siteContent.updatedAt = nextCurriculum.updatedAt;
      store.curriculumProductionSync = {
        ...(store.curriculumProductionSync || {}),
        lastMediaSyncAt: nextCurriculum.updatedAt,
        resourcesImported,
        resourcesUpdated,
      };
      await client.query("UPDATE llh_store SET data = $2::jsonb, updated_at = NOW() WHERE id = $1", [
        "launch-store",
        JSON.stringify(store),
      ]);

      let mediaUpserted = 0;
      for (const row of mediaRows) {
        await client.query(
          `INSERT INTO llh_media_assets (id, kind, mime_type, file_name, bytes, created_at)
           VALUES ($1,$2,$3,$4,$5,COALESCE($6, NOW()))
           ON CONFLICT (id) DO UPDATE SET
             kind = EXCLUDED.kind,
             mime_type = EXCLUDED.mime_type,
             file_name = EXCLUDED.file_name,
             bytes = EXCLUDED.bytes`,
          [row.id, row.kind, row.mime_type, row.file_name, row.bytes, row.created_at],
        );
        mediaUpserted += 1;
      }
      await client.query("COMMIT");
      return {
        resourcesImported,
        resourcesUpdated,
        testingResourcesAfter: nextCurriculum.resources.length,
        mediaUpserted,
        productionResources: production.resources.length,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });

  // verify production unchanged resource count
  const prodAfter = await withClient(sourceUrl, async (client) => {
    const row = await client.query("SELECT data FROM llh_store WHERE id = $1", ["launch-store"]);
    return sync.normalizeCurriculum(row.rows[0].data.siteContent.curriculum).resources.length;
  }, { readOnly: true });

  console.log(JSON.stringify({ ...report, productionResourcesUnchanged: prodAfter === production.resources.length }, null, 2));
  fs.mkdirSync("/opt/cursor/artifacts/curriculum-integrity-audit", { recursive: true });
  fs.writeFileSync(
    "/opt/cursor/artifacts/curriculum-integrity-audit/media-sync-report.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), ...report, productionResourcesAfter: prodAfter }, null, 2),
  );
}

main().catch((error) => {
  console.error("[media-sync] FATAL:", error.message || error);
  process.exitCode = 1;
});
