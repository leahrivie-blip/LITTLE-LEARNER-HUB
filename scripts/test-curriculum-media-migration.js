#!/usr/bin/env node
/**
 * Curriculum media migration + inline upload freeze tests.
 * Includes Postgres integration when TEST_DATABASE_URL / PRODUCTION_DATABASE_URL is set.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");

const curriculumMedia = require("../server/curriculum-media.js");
const curriculumResourceMigration = require("../server/curriculum-resource-migration.js");

const ROOT = path.join(__dirname, "..");
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function mockPool() {
  const assets = new Map();
  const migrations = new Map();
  return {
    assets,
    async query(sql, params = []) {
      if (sql.includes("CREATE TABLE IF NOT EXISTS llh_curriculum_media_migrations")) return { rows: [] };
      if (sql.includes("INSERT INTO llh_media_assets")) {
        const [id, kind, mimeType, fileName, buffer] = params;
        assets.set(id, { id, kind, mimeType, fileName, buffer, byteLen: buffer.length });
        return { rows: [] };
      }
      if (sql.includes("FROM llh_media_assets")) {
        const [id, kind] = params;
        const asset = assets.get(id);
        if (!asset || asset.kind !== kind) return { rows: [] };
        return { rows: [{ mime_type: asset.mimeType, bytes: asset.buffer, byte_len: asset.byteLen }] };
      }
      if (sql.includes("FROM llh_curriculum_media_migrations")) {
        const row = migrations.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes("INSERT INTO llh_curriculum_media_migrations")) {
        const row = {
          resource_id: params[0],
          media_asset_id: params[1],
          sha256: params[2],
          original_bytes: Number(params[3]),
          base64_chars: Number(params[4]),
          status: params[5],
          error: params[6] || "",
        };
        migrations.set(params[0], row);
        return { rows: [] };
      }
      throw new Error(`Unhandled mock SQL: ${sql.slice(0, 80)}`);
    },
  };
}

function buildFixtureStore() {
  return {
    siteContent: {
      updatedAt: "2026-07-30T00:00:00.000Z",
      curriculum: {
        updatedAt: "2026-07-30T00:00:00.000Z",
        lessonPlans: [{ id: "cur-lp-1", title: "Test Plan", resourceIds: ["cur-res-inline-1"], status: "published", plan: "Free" }],
        activities: [{ id: "cur-act-1", lessonPlanId: "cur-lp-1", title: "Act", status: "published" }],
        resources: [{
          id: "cur-res-inline-1",
          title: "Inline PNG",
          resourceCategory: "Classroom Resources",
          fileData: PNG_DATA_URL,
          fileName: "tiny.png",
          mimeType: "image/png",
          lessonPlanIds: ["cur-lp-1"],
          status: "published",
        }],
        series: [],
      },
    },
  };
}

async function testDecodeAndInventory() {
  const decoded = curriculumMedia.decodeInlineCurriculumFileData(PNG_DATA_URL);
  assert.equal(decoded.originalBytes, 70);
  assert.match(decoded.sha256, /^[a-f0-9]{64}$/);
  const inventory = curriculumResourceMigration.inventoryInlineCurriculumResources(buildFixtureStore());
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].resourceId, "cur-res-inline-1");
  console.log("PASS  decode + inventory");
}

async function testUploadSignatureValidation() {
  const fake = curriculumMedia.decodeInlineCurriculumFileData(
    `data:image/png;base64,${Buffer.from("notpng").toString("base64")}`,
  );
  assert.equal(fake, null);
  assert.ok(curriculumMedia.validateCurriculumUploadBuffer("image/png", Buffer.from(PNG_BASE64, "base64")));
  assert.equal(curriculumMedia.validateCurriculumUploadBuffer("image/png", Buffer.from("bad")), false);
  console.log("PASS  upload signature validation");
}

async function testDryRunMigration() {
  const pool = mockPool();
  const store = buildFixtureStore();
  const before = Buffer.byteLength(JSON.stringify(store), "utf8");
  const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, { dryRun: true });
  assert.equal(summary.attempted, 1);
  assert.equal(summary.results[0].status, "dry_run");
  assert.equal(pool.assets.size, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(store), "utf8"), before);
  console.log("PASS  dry-run changes nothing");
}

async function testExecuteKeepsInlineUntilRemoved() {
  const pool = mockPool();
  const store = buildFixtureStore();
  const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, {
    dryRun: false,
    removeInlineAfterVerify: false,
  });
  assert.equal(summary.results[0].status, "verified");
  const resource = store.siteContent.curriculum.resources[0];
  assert.ok(resource.mediaAssetId);
  assert.ok(resource.mediaUrl);
  assert.ok(resource.fileData.startsWith("data:image/png"));
  assert.equal(pool.assets.size, 1);
  console.log("PASS  execute stores asset and retains inline until removal");
}

async function testIdempotentSecondRun() {
  const pool = mockPool();
  const store = buildFixtureStore();
  await curriculumResourceMigration.runInlineResourceMigration(pool, store, { dryRun: false });
  const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, { dryRun: false });
  assert.equal(summary.results[0].status, "skipped");
  assert.equal(pool.assets.size, 1);
  console.log("PASS  idempotent re-run skips completed migration");
}

async function testRemoveInlineAfterVerify() {
  const pool = mockPool();
  const store = buildFixtureStore();
  await curriculumResourceMigration.runInlineResourceMigration(pool, store, {
    dryRun: false,
    removeInlineAfterVerify: true,
  });
  const resource = store.siteContent.curriculum.resources[0];
  assert.equal(resource.fileData, "");
  assert.ok(resource.mediaAssetId);
  console.log("PASS  inline removal clears fileData while keeping media reference");
}

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function testPostgresIntegration() {
  const dbUrl = process.env.TEST_DATABASE_URL
    || process.env.PRODUCTION_DATABASE_URL
    || process.env.DATABASE_URL
    || "";
  if (!dbUrl) {
    console.error("FAIL  Postgres integration requires TEST_DATABASE_URL or PRODUCTION_DATABASE_URL");
    process.exit(1);
  }
  const storeRecordId = `test-media-migration-${crypto.randomBytes(4).toString("hex")}`;
  const resourceId = `cur-res-pg-int-${crypto.randomBytes(3).toString("hex")}`;
  const mediaAssetId = curriculumMedia.curriculumResourceMediaAssetId(resourceId);
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  const port = 4410 + Math.floor(Math.random() * 200);
  let child = null;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS llh_store (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS llh_media_assets (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, mime_type TEXT NOT NULL, file_name TEXT NOT NULL,
        bytes BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await curriculumResourceMigration.initMigrationTable(pool);

    const store = {
      siteContent: {
        updatedAt: "2026-07-30T00:00:00.000Z",
        curriculum: {
          updatedAt: "2026-07-30T00:00:00.000Z",
          lessonPlans: [{ id: "cur-lp-pg", title: "PG", status: "published", plan: "Free" }],
          activities: [],
          resources: [{
            id: resourceId,
            title: "PG Inline",
            resourceCategory: "Classroom Resources",
            fileData: PNG_DATA_URL,
            fileName: "tiny.png",
            mimeType: "image/png",
            lessonPlanIds: ["cur-lp-pg"],
            status: "published",
          }],
          series: [],
        },
      },
    };
    await pool.query(
      "INSERT INTO llh_store (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())",
      [storeRecordId, JSON.stringify(store)],
    );

    const summary = await curriculumResourceMigration.runInlineResourceMigration(pool, store, {
      dryRun: false,
      resourceIds: [resourceId],
    });
    assert.equal(summary.results[0].status, "verified");
    const row = await curriculumResourceMigration.getMigrationRow(pool, resourceId);
    assert.equal(row.status, "verified");
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.equal(typeof row.original_bytes, "string");
    assert.ok(Number(row.base64_chars) > 0);
    assert.ok(!String(row.error || "").includes("data:"), "migration row must not contain inline data");

    const dup = await curriculumResourceMigration.runInlineResourceMigration(pool, store, {
      dryRun: false,
      resourceIds: [resourceId],
    });
    assert.equal(dup.results[0].status, "skipped");
    const count = await pool.query(
      "SELECT COUNT(*)::int AS n FROM llh_media_assets WHERE id = $1",
      [mediaAssetId],
    );
    assert.equal(count.rows[0].n, 1, "idempotent migration must not duplicate media row");

    child = spawn(process.execPath, ["server/index.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "test",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: dbUrl,
        LLH_STORE_RECORD_ID: storeRecordId,
        ADMIN_EMAIL: "pg-mig@test.local",
        ADMIN_PASSWORD: "pg-mig-pass",
        ADMIN_ACCESS_CODE: "pg-mig-code",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      const health = await requestJson(port, "GET", "/api/health").catch(() => ({ status: 0 }));
      if (health.status === 200 && health.json?.ok) { ready = true; break; }
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(ready, "server did not become ready");
    const login = await requestJson(port, "POST", "/api/admin/login", {
      email: "pg-mig@test.local",
      password: "pg-mig-pass",
      code: "pg-mig-code",
    });
    const token = login.json?.token;
    assert.ok(token);
    const upload = await requestJson(port, "POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      fileName: "tiny.png",
      fileData: PNG_DATA_URL,
    });
    assert.equal(upload.status, 200, JSON.stringify(upload.json));
    assert.ok(upload.json.mediaAssetId);
    assert.equal(upload.json.fileData, undefined);
    const blocked = await requestJson(port, "POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      resource: {
        id: `cur-res-block-${crypto.randomBytes(3).toString("hex")}`,
        title: "Blocked Inline",
        resourceCategory: "Classroom Resources",
        fileData: PNG_DATA_URL,
        fileName: "tiny.png",
        mimeType: "image/png",
        status: "draft",
      },
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.json?.code, "inline_curriculum_file_blocked");
    console.log("PASS  postgres integration (migration + upload freeze + no duplicate row)");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    await pool.query("DELETE FROM llh_media_assets WHERE id = $1", [mediaAssetId]).catch(() => {});
    await pool.query("DELETE FROM llh_curriculum_media_migrations WHERE resource_id = $1", [resourceId]).catch(() => {});
    await pool.query("DELETE FROM llh_store WHERE id = $1", [storeRecordId]).catch(() => {});
    await pool.end();
  }
}

async function main() {
  await testDecodeAndInventory();
  await testUploadSignatureValidation();
  await testDryRunMigration();
  await testExecuteKeepsInlineUntilRemoved();
  await testIdempotentSecondRun();
  await testRemoveInlineAfterVerify();
  await testPostgresIntegration();
  console.log("\nAll curriculum media migration tests passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
