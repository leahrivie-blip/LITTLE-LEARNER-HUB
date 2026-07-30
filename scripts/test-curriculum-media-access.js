#!/usr/bin/env node
/**
 * Curriculum media endpoint auth + upload validation (Postgres integration).
 * Run: npm run test:curriculum-media-access
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");

const curriculumMedia = require("../server/curriculum-media.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4620 + Math.floor(Math.random() * 200);
const STORE_RECORD_ID = `test-curriculum-media-${crypto.randomBytes(4).toString("hex")}`;
const ADMIN = {
  email: "media-access-test@example.com",
  password: "media-access-test-pass",
  code: "media-access-test-code",
};

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const PNG_BUFFER = Buffer.from(PNG_BASE64, "base64");

// Minimal valid PDF for signature tests
const PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
  "utf8",
);
const PDF_DATA_URL = `data:application/pdf;base64,${PDF_BUFFER.toString("base64")}`;

const FAKE_PNG_DATA_URL = `data:image/png;base64,${Buffer.from("not-a-png-file").toString("base64")}`;
const EXE_DATA_URL = `data:application/x-msdownload;base64,${Buffer.from("MZfake").toString("base64")}`;

const PRO_RESOURCE_ID = "cur-res-media-test-pro";
const FREE_RESOURCE_ID = "cur-res-media-test-free";
const DRAFT_RESOURCE_ID = "cur-res-media-test-draft";
const UNLINKED_RESOURCE_ID = "cur-res-media-test-unlinked";
const PRO_LESSON_ID = "cur-lp-media-test-pro";
const FREE_LESSON_ID = "cur-lp-media-test-free";

function requestRaw(port, method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : null;
    const headers = { ...(options.headers || {}) };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buffer.toString("utf8")); } catch { json = null; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer,
          json,
          text: buffer.toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function authHeader(email) {
  return { Authorization: `Bearer test:${email}` };
}

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS llh_store (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS llh_media_assets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
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
  `);
}

function buildTestStore() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const makeResource = (id, title, lessonPlanIds, status) => ({
    id,
    title,
    resourceCategory: "Classroom Resources",
    fileName: `${id}.png`,
    mimeType: "image/png",
    mediaAssetId: curriculumMedia.curriculumResourceMediaAssetId(id),
    mediaUrl: curriculumMedia.curriculumResourceMediaUrl(curriculumMedia.curriculumResourceMediaAssetId(id)),
    fileData: "",
    lessonPlanIds,
    status,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === "published" ? now : "",
  });
  return {
    users: {
      "free@media.test": {
        email: "free@media.test",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        freeLessonAccessMode: "curated",
        createdAt: now,
        updatedAt: now,
      },
      "pro@media.test": {
        email: "pro@media.test",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        currentPeriodEnd: future,
        accessEndsAt: future,
        subscriptionStartedAt: now,
        updatedAt: now,
      },
    },
    siteContent: {
      updatedAt: now,
      curriculum: {
        updatedAt: now,
        lessonPlans: [
          {
            id: PRO_LESSON_ID,
            title: "Media Test Pro Lesson",
            plan: "Pro",
            status: "published",
            age: "Preschool",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: FREE_LESSON_ID,
            title: "Media Test Free Lesson",
            plan: "Free",
            status: "published",
            age: "Preschool",
            createdAt: now,
            updatedAt: now,
          },
        ],
        activities: [],
        resources: [
          makeResource(PRO_RESOURCE_ID, "Pro Media Resource", [PRO_LESSON_ID], "published"),
          makeResource(FREE_RESOURCE_ID, "Free Media Resource", [FREE_LESSON_ID], "published"),
          makeResource(DRAFT_RESOURCE_ID, "Draft Media Resource", [FREE_LESSON_ID], "draft"),
          makeResource(UNLINKED_RESOURCE_ID, "Unlinked Media Resource", [], "published"),
        ],
        series: [],
      },
    },
    adminSessions: {},
  };
}

async function seedMediaAssets(pool) {
  for (const resourceId of [PRO_RESOURCE_ID, FREE_RESOURCE_ID, DRAFT_RESOURCE_ID, UNLINKED_RESOURCE_ID]) {
    const mediaAssetId = curriculumMedia.curriculumResourceMediaAssetId(resourceId);
    await curriculumMedia.insertMediaAsset(pool, {
      id: mediaAssetId,
      kind: curriculumMedia.CURRICULUM_RESOURCE_MEDIA_KIND,
      mimeType: "image/png",
      fileName: `${resourceId}.png`,
      buffer: PNG_BUFFER,
    });
  }
}

async function cleanup(pool) {
  const assetIds = [PRO_RESOURCE_ID, FREE_RESOURCE_ID, DRAFT_RESOURCE_ID, UNLINKED_RESOURCE_ID]
    .map((id) => curriculumMedia.curriculumResourceMediaAssetId(id));
  await pool.query("DELETE FROM llh_media_assets WHERE id = ANY($1::text[])", [assetIds]);
  await pool.query("DELETE FROM llh_curriculum_media_migrations WHERE resource_id LIKE 'cur-res-media-test-%'");
  await pool.query("DELETE FROM llh_store WHERE id = $1", [STORE_RECORD_ID]);
}

function startServer(dbUrl) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "postgres",
      PRODUCTION_DATABASE_URL: dbUrl,
      LLH_STORE_RECORD_ID: STORE_RECORD_ID,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestRaw(PORT, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server did not become ready");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 4000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function mediaPath(resourceId) {
  const assetId = curriculumMedia.curriculumResourceMediaAssetId(resourceId);
  return `/api/media/curriculum-resources/${encodeURIComponent(assetId)}`;
}

async function testUploadValidation(token) {
  const oversize = `data:image/png;base64,${"A".repeat(7 * 1024 * 1024)}`;
  const cases = [
    ["valid png", { fileName: "ok.png", fileData: PNG_DATA_URL }, 200],
    ["valid pdf", { fileName: "ok.pdf", fileData: PDF_DATA_URL }, 200],
    ["bad mime exe", { fileName: "bad.exe", fileData: EXE_DATA_URL }, 400],
    ["fake png signature", { fileName: "fake.png", fileData: FAKE_PNG_DATA_URL }, 400],
    ["oversize", { fileName: "big.png", fileData: oversize }, 400],
    ["unsafe filename", { fileName: "../../etc/passwd.png", fileData: PNG_DATA_URL }, 200],
  ];
  for (const [label, body, expectedStatus] of cases) {
    const res = await requestRaw(PORT, "POST", "/api/admin/curriculum/resources/upload", {
      body: { adminToken: token, ...body },
    });
    assert.equal(res.status, expectedStatus, `${label}: ${res.text.slice(0, 200)}`);
    if (expectedStatus === 200) {
      assert.ok(res.json.mediaAssetId, `${label} missing mediaAssetId`);
      assert.ok(res.json.mediaUrl, `${label} missing mediaUrl`);
      assert.equal(res.json.fileData, undefined, `${label} must not return inline fileData`);
      if (label === "unsafe filename") {
        assert.ok(!res.json.fileName.includes(".."), "filename sanitized");
      }
      // cleanup uploaded test asset
      if (res.json.mediaAssetId) {
        await global.__testPool.query(
          "DELETE FROM llh_media_assets WHERE id = $1",
          [res.json.mediaAssetId],
        );
      }
    }
  }
  console.log("PASS  upload validation (mime, size, signature, filename)");
}

async function testMediaAccess(token) {
  const proUrl = mediaPath(PRO_RESOURCE_ID);
  const freeUrl = mediaPath(FREE_RESOURCE_ID);
  const draftUrl = mediaPath(DRAFT_RESOURCE_ID);
  const unlinkedUrl = mediaPath(UNLINKED_RESOURCE_ID);

  const loggedOutPro = await requestRaw(PORT, "GET", proUrl);
  assert.equal(loggedOutPro.status, 403, "logged-out pro must be 403");
  assert.ok(!loggedOutPro.buffer.includes(PNG_BUFFER[0]), "logged-out pro must not receive bytes");

  const loggedOutFree = await requestRaw(PORT, "GET", freeUrl);
  assert.equal(loggedOutFree.status, 200, "logged-out free linked resource allowed");
  assert.equal(loggedOutFree.headers["content-type"], "image/png");

  const freeUserPro = await requestRaw(PORT, "GET", proUrl, { headers: authHeader("free@media.test") });
  assert.equal(freeUserPro.status, 403, "free user pro resource blocked");

  const proUserPro = await requestRaw(PORT, "GET", proUrl, { headers: authHeader("pro@media.test") });
  assert.equal(proUserPro.status, 200, "pro user pro resource allowed");
  assert.equal(proUserPro.buffer.length, PNG_BUFFER.length);

  const freeUserFree = await requestRaw(PORT, "GET", freeUrl, { headers: authHeader("free@media.test") });
  assert.equal(freeUserFree.status, 200, "free user free resource allowed");

  const adminDraft = await requestRaw(
    PORT,
    "GET",
    `${draftUrl}?admin=1&adminToken=${encodeURIComponent(token)}`,
  );
  assert.equal(adminDraft.status, 200, "admin can access draft via admin media flag");

  const loggedOutDraft = await requestRaw(PORT, "GET", draftUrl);
  assert.equal(loggedOutDraft.status, 404, "logged-out draft hidden");

  const loggedOutUnlinked = await requestRaw(PORT, "GET", unlinkedUrl);
  assert.equal(loggedOutUnlinked.status, 404, "unlinked published resource hidden from public media");

  const adminUnlinked = await requestRaw(
    PORT,
    "GET",
    `${unlinkedUrl}?admin=1&adminToken=${encodeURIComponent(token)}`,
  );
  assert.equal(adminUnlinked.status, 200, "admin can access unlinked draft-like resource");

  console.log("PASS  media access (logged-out, free, pro, admin)");
}

async function testMigrationTableHasNoBinary() {
  const rows = await global.__testPool.query(
    `SELECT resource_id, media_asset_id, sha256, original_bytes, base64_chars, status, error
     FROM llh_curriculum_media_migrations
     WHERE resource_id LIKE 'cur-res-media-test-%'`,
  );
  for (const row of rows.rows) {
    assert.match(row.sha256, /^[a-f0-9]{64}$/, "migration row stores checksum only");
    assert.ok(!String(row.error || "").includes("data:"), "migration error must not contain inline data");
    assert.equal(typeof row.original_bytes, "string");
  }
  console.log("PASS  migration progress table stores metadata only");
}

async function main() {
  const dbUrl = process.env.TEST_DATABASE_URL
    || process.env.PRODUCTION_DATABASE_URL
    || process.env.DATABASE_URL
    || "";
  if (!dbUrl) {
    console.error("FAIL  TEST_DATABASE_URL or PRODUCTION_DATABASE_URL required for Postgres integration");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: dbUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
  global.__testPool = pool;
  let child = null;
  try {
    await ensureTables(pool);
    await cleanup(pool);
    const store = buildTestStore();
    await pool.query(
      "INSERT INTO llh_store (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())",
      [STORE_RECORD_ID, JSON.stringify(store)],
    );
    await seedMediaAssets(pool);

    child = startServer(dbUrl);
    child.stderr.on("data", () => {});
    child.stdout.on("data", () => {});
    await waitForHealth(child);

    const login = await requestRaw(PORT, "POST", "/api/admin/login", { body: ADMIN });
    assert.equal(login.status, 200, login.text);
    const token = login.json.token;
    assert.ok(token);

    await testUploadValidation(token);
    await testMediaAccess(token);
    await testMigrationTableHasNoBinary();

    console.log("\nAll curriculum media access tests passed.");
  } finally {
    await stopServer(child);
    await cleanup(pool).catch(() => {});
    await pool.end();
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
