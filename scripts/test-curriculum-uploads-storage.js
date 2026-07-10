#!/usr/bin/env node
/**
 * Phase 2D storage checks for CURRICULUM_UPLOADS_DIR.
 * Run: node scripts/test-curriculum-uploads-storage.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 4321 + Math.floor(Math.random() * 200);
const MOUNT_DIR = path.join("/tmp", `llh-curriculum-uploads-${process.pid}`);
const FALLBACK_DIR = path.resolve(ROOT, "server/data/curriculum-uploads");
const ADMIN = {
  email: "storage-test@example.com",
  password: "storage-test-pass",
  code: "storage-test-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer({ uploadsDir, dataDir }) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (uploadsDir) fs.mkdirSync(uploadsDir, { recursive: true });
  const env = {
    ...process.env,
    PORT: String(PORT),
    SITE_URL: `http://127.0.0.1:${PORT}`,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_ACCESS_CODE: ADMIN.code,
    ADMIN_NAME: "Storage Test",
    NODE_ENV: "test",
  };
  // Point dataDir by using a custom working approach: server uses __dirname/data.
  // We override CURRICULUM_UPLOADS_DIR when provided; for fallback tests we leave it unset
  // and use the real server/data path (cleaned afterward).
  if (uploadsDir) env.CURRICULUM_UPLOADS_DIR = uploadsDir;
  else delete env.CURRICULUM_UPLOADS_DIR;

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `Login failed: ${res.status} ${res.text}`);
  return res.json.token;
}

function requestRaw(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function runConfiguredDirTest() {
  console.log("1) Upload writes to CURRICULUM_UPLOADS_DIR");
  fs.rmSync(MOUNT_DIR, { recursive: true, force: true });
  fs.mkdirSync(MOUNT_DIR, { recursive: true });
  const dataDir = path.join("/tmp", `llh-data-${process.pid}`);
  // Server always uses server/data for store; that's fine for this test.
  const child = startServer({ uploadsDir: MOUNT_DIR, dataDir });
  try {
    await waitForHealth(child);
    const token = await login();
    const pngBase64 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    const resourceId = `cur-res-test-${crypto.randomBytes(4).toString("hex")}`;
    const upload = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      resourceId,
      fileName: "tiny.png",
      fileData: `data:image/png;base64,${pngBase64}`,
    });
    assert(upload.status === 200, `Upload failed: ${upload.status} ${upload.text}`);
    assert(upload.json.fileUrl === `/api/curriculum-files/${encodeURIComponent(resourceId)}/tiny.png`, "fileUrl mismatch");
    assert(!upload.json.fileData && !upload.json.buffer, "Upload response must not include file bytes");
    const diskPath = path.join(MOUNT_DIR, resourceId, "tiny.png");
    assert(fs.existsSync(diskPath), `Expected file on disk at ${diskPath}`);
    assert(fs.readFileSync(diskPath).length > 0, "Uploaded file empty");

    console.log("2) Metadata save stores only file URL (no file bytes)");
    const save = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      resource: {
        id: resourceId,
        title: "Tiny Test Resource",
        resourceCategory: "Classroom Resources",
        fileUrl: upload.json.fileUrl,
        fileName: "tiny.png",
        mimeType: "image/png",
        status: "draft",
      },
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
    const saved = save.json.resource;
    assert(saved.fileUrl === upload.json.fileUrl, "Saved resource missing fileUrl");
    assert(!("fileData" in saved), "Saved resource must not include fileData");
    assert(saved.resourceCategory === "Classroom Resources", "Category mismatch");
    const storePath = path.join(ROOT, "server/data/launch-store.json");
    if (fs.existsSync(storePath)) {
      const storeText = fs.readFileSync(storePath, "utf8");
      assert(!storeText.includes(pngBase64.slice(0, 40)), "Store must not contain upload base64 payload");
      assert(storeText.includes(upload.json.fileUrl), "Store should contain file URL");
    }

    console.log("3) File survives app restart with same mounted directory");
    await stopServer(child);
    const child2 = startServer({ uploadsDir: MOUNT_DIR, dataDir });
    try {
      await waitForHealth(child2);
      assert(fs.existsSync(diskPath), "File missing after restart");
      const token2 = await login();
      const serve = await requestRaw(
        "GET",
        `${upload.json.fileUrl}?adminToken=${encodeURIComponent(token2)}`,
      );
      assert(serve.status === 200, `Serve after restart failed: ${serve.status}`);
      assert(serve.body.length > 0, "Empty file after restart");
    } finally {
      await stopServer(child2);
    }
  } finally {
    await stopServer(child);
  }
}

async function runFallbackTest() {
  console.log("4) Local development works without CURRICULUM_UPLOADS_DIR");
  const child = startServer({ uploadsDir: null, dataDir: path.join(ROOT, "server/data") });
  try {
    await waitForHealth(child);
    const token = await login();
    const resourceId = `cur-res-fallback-${crypto.randomBytes(4).toString("hex")}`;
    const pngBase64 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    const upload = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      resourceId,
      fileName: "fallback.png",
      fileData: `data:image/png;base64,${pngBase64}`,
    });
    assert(upload.status === 200, `Fallback upload failed: ${upload.status} ${upload.text}`);
    const diskPath = path.join(FALLBACK_DIR, resourceId, "fallback.png");
    assert(fs.existsSync(diskPath), `Expected fallback path ${diskPath}`);
    // cleanup test file
    fs.rmSync(path.join(FALLBACK_DIR, resourceId), { recursive: true, force: true });
  } finally {
    await stopServer(child);
  }
}

async function runActivitySyncTest() {
  console.log("5) Existing lesson-plan activity sync still works");
  const child = startServer({ uploadsDir: MOUNT_DIR, dataDir: path.join(ROOT, "server/data") });
  try {
    await waitForHealth(child);
    const token = await login();
    const lessonPlanId = `cur-lp-sync-${crypto.randomBytes(4).toString("hex")}`;
    const itemId = `item-${crypto.randomBytes(4).toString("hex")}`;
    const payload = {
      adminToken: token,
      lessonPlan: {
        id: lessonPlanId,
        title: "Sync Test Plan",
        age: "Preschool",
        theme: "Storage",
        plan: "Free",
        status: "draft",
        learningDomains: ["Math"],
        weeklyOverview: "Overview",
        objectives: "Objectives",
        dailyPlans: {
          monday: {
            items: [
              {
                itemId,
                activityCategory: "Sensory Play",
                title: "Sand Scoop",
                description: "Scoop and pour",
                materials: "Sand",
                steps: "1. Scoop",
                learningGoals: ["Fine motor"],
              },
            ],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    };
    const first = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload);
    assert(first.status === 200, `First save failed: ${first.status} ${first.text}`);
    const activities1 = (first.json.activities || []).filter((a) => a.status !== "archived");
    assert(activities1.length === 1, `Expected 1 activity, got ${activities1.length}`);
    const second = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      ...payload,
      lessonPlan: {
        ...payload.lessonPlan,
        ...first.json.lessonPlan,
        dailyPlans: payload.lessonPlan.dailyPlans,
      },
    });
    assert(second.status === 200, `Second save failed: ${second.status} ${second.text}`);
    const activities2 = (second.json.activities || []).filter((a) => a.status !== "archived");
    assert(activities2.length === 1, `Double save duplicated activities: ${activities2.length}`);
    assert(activities2[0].id === activities1[0].id, "Activity id changed on re-save");
    assert(activities2[0].sourceKey === `${lessonPlanId}:${itemId}`, "sourceKey mismatch");
  } finally {
    await stopServer(child);
  }
}

async function runCategoryAndPublicChecks() {
  console.log("6) Categories + public API unchanged");
  const child = startServer({ uploadsDir: MOUNT_DIR, dataDir: path.join(ROOT, "server/data") });
  try {
    await waitForHealth(child);
    const token = await login();
    const resourceId = `cur-res-cat-${crypto.randomBytes(4).toString("hex")}`;
    const pngBase64 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ).toString("base64");
    await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      resourceId,
      fileName: "cat.png",
      fileData: `data:image/png;base64,${pngBase64}`,
    });
    const invalid = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      resource: {
        id: resourceId,
        title: "Invalid Category Resource",
        resourceCategory: "Not A Real Category",
        fileUrl: `/api/curriculum-files/${encodeURIComponent(resourceId)}/cat.png`,
        fileName: "cat.png",
        status: "draft",
      },
    });
    assert(invalid.status === 200, `Category save failed: ${invalid.status}`);
    assert(
      invalid.json.resource.resourceCategory === "Classroom Resources",
      `Invalid category should normalize to Classroom Resources, got ${invalid.json.resource.resourceCategory}`,
    );
    assert(!("activityIds" in invalid.json.resource), "Resources must not have activity-level links");
    assert(Array.isArray(invalid.json.resource.lessonPlanIds), "Resources link via lessonPlanIds only");

    const publicContent = await requestJson("GET", "/api/site-content");
    assert(publicContent.status === 200, "Public site-content failed");
    assert(!("curriculum" in publicContent.json.siteContent), "Public API must omit curriculum");
    assert(!("featureFlags" in publicContent.json.siteContent), "Public API must omit featureFlags");
  } finally {
    await stopServer(child);
  }
}

async function main() {
  const results = [];
  try {
    await runConfiguredDirTest();
    results.push("configured dir + restart: PASS");
    await runFallbackTest();
    results.push("local fallback: PASS");
    await runActivitySyncTest();
    results.push("activity sync: PASS");
    await runCategoryAndPublicChecks();
    results.push("categories + public API: PASS");
    console.log("\nAll Phase 2D storage checks passed:");
    results.forEach((line) => console.log(`  - ${line}`));
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(MOUNT_DIR, { recursive: true, force: true });
  }
}

main();
