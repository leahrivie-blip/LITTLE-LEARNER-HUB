#!/usr/bin/env node
/**
 * Phase 2D curriculum resource checks — Postgres / data-URL storage (no disk).
 * Run: node scripts/test-curriculum-uploads-storage.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 4321 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const ADMIN = {
  email: "storage-test@example.com",
  password: "storage-test-pass",
  code: "storage-test-code",
};
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

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

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
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
  delete env.CURRICULUM_UPLOADS_DIR;
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

async function runUploadSaveOpenTest() {
  console.log("1) Upload validates and save stores fileData in app store");
  const child = startServer();
  let resourceId = "";
  try {
    await waitForHealth(child);
    const token = await login();
    resourceId = `cur-res-test-${crypto.randomBytes(4).toString("hex")}`;
    const upload = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      resourceId,
      fileName: "tiny.png",
      fileData: PNG_DATA_URL,
    });
    assert(upload.status === 200, `Upload failed: ${upload.status} ${upload.text}`);
    assert(upload.json.fileData?.startsWith("data:image/png"), "Upload must return fileData data URL");
    assert(!upload.json.fileUrl || !String(upload.json.fileUrl).includes("/api/curriculum-files/"), "Must not return disk file URLs");

    const save = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      resource: {
        id: resourceId,
        title: "Tiny Test Resource",
        resourceCategory: "Classroom Resources",
        fileData: upload.json.fileData,
        fileName: "tiny.png",
        mimeType: "image/png",
        status: "draft",
      },
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
    assert(save.json.resource.fileData?.startsWith("data:image/png"), "Saved resource missing fileData");
    assert(!("fileUrl" in save.json.resource) || !save.json.resource.fileUrl, "Saved resource should not keep disk fileUrl");
    assert(fs.existsSync(STORE_PATH), "Expected launch-store.json for local durability check");
    const storeText = fs.readFileSync(STORE_PATH, "utf8");
    assert(storeText.includes(resourceId), "Store should contain resource id");
    assert(storeText.includes("data:image/png;base64,"), "Store should contain file data URL");
    assert(!fs.existsSync(path.join(ROOT, "server/data/curriculum-uploads", resourceId)), "Must not write curriculum-uploads disk path");

    console.log("2) Open/download via stored fileData");
    const listed = await requestJson("GET", `/api/admin/curriculum/resources?adminToken=${encodeURIComponent(token)}`);
    assert(listed.status === 200, `List failed: ${listed.status}`);
    const found = (listed.json.resources || []).find((item) => item.id === resourceId);
    assert(found?.fileData === upload.json.fileData, "Listed resource fileData mismatch");

    console.log("3) Durability across restart (store file survives)");
    await stopServer(child);
    const child2 = startServer();
    try {
      await waitForHealth(child2);
      const token2 = await login();
      const listed2 = await requestJson("GET", `/api/admin/curriculum/resources?adminToken=${encodeURIComponent(token2)}`);
      const found2 = (listed2.json.resources || []).find((item) => item.id === resourceId);
      assert(found2?.fileData?.startsWith("data:image/png"), "fileData missing after restart");
      assert(found2.fileData === upload.json.fileData, "fileData changed after restart");
    } finally {
      await stopServer(child2);
    }
    return resourceId;
  } finally {
    await stopServer(child);
  }
}

async function runLinkAndSyncTests(existingResourceId) {
  console.log("4) Lesson plan resource linking");
  const child = startServer();
  try {
    await waitForHealth(child);
    const token = await login();
    const lessonPlanId = `cur-lp-link-${crypto.randomBytes(4).toString("hex")}`;
    const itemId = `item-${crypto.randomBytes(4).toString("hex")}`;
    const planSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      lessonPlan: {
        id: lessonPlanId,
        title: "Link Test Plan",
        age: "Preschool",
        theme: "Storage",
        plan: "Free",
        status: "draft",
        learningDomains: ["Math"],
        dailyPlans: {
          monday: {
            items: [{
              itemId,
              activityCategory: "Sensory Play",
              title: "Sand Scoop",
              description: "Scoop",
              materials: "Sand",
              steps: "1. Scoop",
              learningGoals: ["Fine motor"],
            }],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    });
    assert(planSave.status === 200, `Lesson plan save failed: ${planSave.status} ${planSave.text}`);

    const resourceId = existingResourceId || `cur-res-link-${crypto.randomBytes(4).toString("hex")}`;
    if (!existingResourceId) {
      const save = await requestJson("POST", "/api/admin/curriculum/resources/save", {
        adminToken: token,
        resource: {
          id: resourceId,
          title: "Linkable Resource",
          resourceCategory: "Printables",
          fileData: PNG_DATA_URL,
          fileName: "link.png",
          mimeType: "image/png",
          status: "published",
        },
      });
      assert(save.status === 200, `Resource save failed: ${save.status}`);
    }

    const link = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      adminToken: token,
      resourceId,
      lessonPlanId,
    });
    assert(link.status === 200, `Link failed: ${link.status} ${link.text}`);
    assert(link.json.resource.lessonPlanIds.includes(lessonPlanId), "Resource missing lessonPlanId");
    assert(link.json.lessonPlan.resourceIds.includes(resourceId), "Lesson plan missing resourceId");
    assert(!("activityIds" in (link.json.resource || {})), "Resources must not have activity-level links");

    const unlink = await requestJson("POST", "/api/admin/curriculum/resources/unlink", {
      adminToken: token,
      resourceId,
      lessonPlanId,
    });
    assert(unlink.status === 200, `Unlink failed: ${unlink.status}`);
    assert(!unlink.json.resource.lessonPlanIds.includes(lessonPlanId), "Unlink did not clear lessonPlanId");

    console.log("5) Activity sync unchanged (no duplicates on double save)");
    const payload = {
      adminToken: token,
      lessonPlan: planSave.json.lessonPlan,
    };
    // Re-save with same daily item ids
    payload.lessonPlan.dailyPlans = {
      monday: {
        items: [{
          itemId,
          activityCategory: "Sensory Play",
          title: "Sand Scoop",
          description: "Scoop",
          materials: "Sand",
          steps: "1. Scoop",
          learningGoals: ["Fine motor"],
        }],
      },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    };
    const first = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload);
    const second = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      ...payload,
      lessonPlan: { ...first.json.lessonPlan, dailyPlans: payload.lessonPlan.dailyPlans },
    });
    const acts1 = (first.json.activities || []).filter((a) => a.status !== "archived");
    const acts2 = (second.json.activities || []).filter((a) => a.status !== "archived");
    assert(acts1.length === 1 && acts2.length === 1, `Activity sync duplicated: ${acts1.length} -> ${acts2.length}`);
    assert(acts1[0].id === acts2[0].id, "Activity id changed on re-save");

    console.log("6) Categories + public API + size limit + no disk routes");
    const invalid = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      resource: {
        id: `cur-res-cat-${crypto.randomBytes(4).toString("hex")}`,
        title: "Bad Category",
        resourceCategory: "Not A Real Category",
        fileData: PNG_DATA_URL,
        fileName: "cat.png",
        status: "draft",
      },
    });
    assert(invalid.json.resource.resourceCategory === "Classroom Resources", "Invalid category should normalize");

    const tooBig = await requestJson("POST", "/api/admin/curriculum/resources/upload", {
      adminToken: token,
      resourceId: `cur-res-big-${crypto.randomBytes(4).toString("hex")}`,
      fileName: "big.png",
      fileData: `data:image/png;base64,${Buffer.alloc(6 * 1024 * 1024).toString("base64")}`,
    });
    assert(tooBig.status === 400, `Expected 400 for >5MB upload, got ${tooBig.status}`);

    const publicContent = await requestJson("GET", "/api/site-content");
    assert(!("curriculum" in publicContent.json.siteContent), "Public API must omit curriculum");
    assert(!("featureFlags" in publicContent.json.siteContent), "Public API must omit featureFlags");

    const diskRoute = await requestJson("GET", "/api/curriculum-files/x/y");
    assert(diskRoute.status === 404, "Disk file route should be removed");
  } finally {
    await stopServer(child);
  }
}

async function main() {
  const results = [];
  try {
    const resourceId = await runUploadSaveOpenTest();
    results.push("upload/save/open + restart durability: PASS");
    await runLinkAndSyncTests(resourceId);
    results.push("lesson-plan linking: PASS");
    results.push("activity sync: PASS");
    results.push("categories / public API / size limit / no disk route: PASS");
    console.log("\nAll Phase 2D data-URL storage checks passed:");
    results.forEach((line) => console.log(`  - ${line}`));
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  }
}

main();
