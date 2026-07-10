#!/usr/bin/env node
/**
 * Curriculum readiness + Phase 2E public library cutover checks.
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

async function main() {
  fs.rmSync(STORE_PATH, { force: true });
  const child = startServer();
  try {
    await waitForHealth(child);
    const token = await login();
    const bootstrap = await requestJson("GET", `/api/admin/curriculum/resources?adminToken=${encodeURIComponent(token)}`);
    let expectedUpdatedAt = bootstrap.json?.siteContentUpdatedAt || "";

    console.log("1) Save resource bumps siteContent.updatedAt + stores fileData");
    const resourceId = `cur-res-test-${crypto.randomBytes(4).toString("hex")}`;
    const save = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      expectedUpdatedAt,
      resource: {
        id: resourceId,
        title: "Tiny Test Resource",
        resourceCategory: "Classroom Resources",
        fileData: PNG_DATA_URL,
        fileName: "tiny.png",
        mimeType: "image/png",
        status: "draft",
      },
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
    assert(save.json.siteContentUpdatedAt, "Missing siteContentUpdatedAt");
    assert(save.json.resource.fileData?.startsWith("data:image/png"), "Saved resource missing fileData");
    assert(!save.json.curriculum.resources[0].fileData, "Curriculum payload must omit fileData");
    assert(save.json.curriculum.resources[0].hasFile === true, "Metadata must include hasFile");
    expectedUpdatedAt = save.json.siteContentUpdatedAt;

    console.log("2) List returns metadata only");
    const listed = await requestJson("GET", `/api/admin/curriculum/resources?adminToken=${encodeURIComponent(token)}`);
    assert(listed.status === 200, `List failed: ${listed.status}`);
    const meta = (listed.json.resources || []).find((item) => item.id === resourceId);
    assert(meta, "Resource missing from list");
    assert(!("fileData" in meta), "List must not include fileData");
    assert(meta.hasFile === true, "List metadata missing hasFile");

    console.log("3) File endpoint loads bytes on demand");
    const file = await requestJson(
      "GET",
      `/api/admin/curriculum/resources/file?adminToken=${encodeURIComponent(token)}&id=${encodeURIComponent(resourceId)}`,
    );
    assert(file.status === 200, `File fetch failed: ${file.status} ${file.text}`);
    assert(file.json.resource.fileData === PNG_DATA_URL, "File endpoint returned wrong data");

    console.log("4) Stale expectedUpdatedAt returns 409");
    const conflict = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      resource: {
        id: resourceId,
        title: "Stale Save",
        resourceCategory: "Classroom Resources",
        fileName: "tiny.png",
        status: "draft",
      },
    });
    assert(conflict.status === 409, `Expected 409, got ${conflict.status}`);
    assert(conflict.json.conflict === true, "Conflict flag missing");

    console.log("5) Lesson plan save + link + archive unlinks");
    const lessonPlanId = `cur-lp-link-${crypto.randomBytes(4).toString("hex")}`;
    const itemId = `item-${crypto.randomBytes(4).toString("hex")}`;
    const planSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
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
    expectedUpdatedAt = planSave.json.siteContentUpdatedAt;

    const link = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      adminToken: token,
      expectedUpdatedAt,
      resourceId,
      lessonPlanId,
    });
    assert(link.status === 200, `Link failed: ${link.status} ${link.text}`);
    assert(link.json.resource.lessonPlanIds.includes(lessonPlanId), "Link missing lessonPlanId");
    assert(link.json.lessonPlan.resourceIds.includes(resourceId), "Lesson missing resourceId");
    expectedUpdatedAt = link.json.siteContentUpdatedAt;

    const archive = await requestJson("POST", "/api/admin/curriculum/resources/archive", {
      adminToken: token,
      expectedUpdatedAt,
      id: resourceId,
    });
    assert(archive.status === 200, `Archive failed: ${archive.status} ${archive.text}`);
    assert(archive.json.resource.status === "archived", "Resource not archived");
    assert((archive.json.resource.lessonPlanIds || []).length === 0, "Archived resource still linked");
    const archivedPlan = archive.json.curriculum.lessonPlans.find((item) => item.id === lessonPlanId);
    assert(!(archivedPlan.resourceIds || []).includes(resourceId), "Lesson plan still references archived resource");
    expectedUpdatedAt = archive.json.siteContentUpdatedAt;

    console.log("6) Activity sync still stable + public API omits full curriculum when flag OFF");
    const payload = {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        ...planSave.json.lessonPlan,
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
    };
    const first = await requestJson("POST", "/api/admin/curriculum/lesson-plans", payload);
    assert(first.status === 200, `Re-save failed: ${first.status} ${first.text}`);
    const second = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: first.json.siteContentUpdatedAt,
      lessonPlan: {
        ...first.json.lessonPlan,
        dailyPlans: payload.lessonPlan.dailyPlans,
      },
    });
    assert(second.status === 200, `Second save failed: ${second.status}`);
    const acts1 = (first.json.activities || []).filter((a) => a.status !== "archived");
    const acts2 = (second.json.activities || []).filter((a) => a.status !== "archived");
    assert(acts1.length === 1 && acts2.length === 1, "Activity sync duplicated");
    assert(acts1[0].id === acts2[0].id, "Activity id changed");
    expectedUpdatedAt = second.json.siteContentUpdatedAt;

    const publicOff = await requestJson("GET", "/api/site-content");
    assert(publicOff.status === 200, "Public site-content failed");
    assert(!("curriculum" in publicOff.json.siteContent), "Public API must omit curriculum");
    assert(!("featureFlags" in publicOff.json.siteContent), "Public API must omit featureFlags");
    assert(publicOff.json.siteContent.playBasedCurriculum === false, "Flag should be false publicly when OFF");
    assert(!("curriculumLibrary" in publicOff.json.siteContent), "curriculumLibrary must be absent when flag OFF");

    const fileOff = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    assert(fileOff.status === 404, "Public file endpoint must 404 when flag OFF");

    console.log("7) Flag ON exposes published curriculumLibrary only (no fileData, no drafts)");
    // Publish lesson + recreate a published linked resource for library DTO tests.
    const publishedResourceId = `cur-res-pub-${crypto.randomBytes(4).toString("hex")}`;
    const pubResource = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      expectedUpdatedAt,
      resource: {
        id: publishedResourceId,
        title: "Published Tiny Resource",
        resourceCategory: "Printables",
        fileData: PNG_DATA_URL,
        fileName: "tiny-pub.png",
        mimeType: "image/png",
        status: "published",
      },
    });
    assert(pubResource.status === 200, `Published resource save failed: ${pubResource.status} ${pubResource.text}`);
    expectedUpdatedAt = pubResource.json.siteContentUpdatedAt;

    const draftResourceId = `cur-res-draft-${crypto.randomBytes(4).toString("hex")}`;
    const draftResource = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      adminToken: token,
      expectedUpdatedAt,
      resource: {
        id: draftResourceId,
        title: "Draft Hidden Resource",
        resourceCategory: "Classroom Resources",
        fileData: PNG_DATA_URL,
        fileName: "draft.png",
        mimeType: "image/png",
        status: "draft",
      },
    });
    assert(draftResource.status === 200, `Draft resource save failed: ${draftResource.status}`);
    expectedUpdatedAt = draftResource.json.siteContentUpdatedAt;

    const publishPlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        ...second.json.lessonPlan,
        status: "published",
        dailyPlans: payload.lessonPlan.dailyPlans,
      },
    });
    assert(publishPlan.status === 200, `Publish lesson failed: ${publishPlan.status} ${publishPlan.text}`);
    expectedUpdatedAt = publishPlan.json.siteContentUpdatedAt;
    const publishedActivity = (publishPlan.json.activities || []).find((item) => item.status === "published");
    assert(publishedActivity, "Publishing lesson should publish synced activities");
    assert(publishedActivity.lessonPlanId === lessonPlanId, "Activity must link to parent lesson plan");

    const linkPub = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      adminToken: token,
      expectedUpdatedAt,
      resourceId: publishedResourceId,
      lessonPlanId,
    });
    assert(linkPub.status === 200, `Link published resource failed: ${linkPub.status} ${linkPub.text}`);
    expectedUpdatedAt = linkPub.json.siteContentUpdatedAt;

    const linkDraft = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      adminToken: token,
      expectedUpdatedAt,
      resourceId: draftResourceId,
      lessonPlanId,
    });
    assert(linkDraft.status === 200, `Link draft resource failed: ${linkDraft.status}`);
    expectedUpdatedAt = linkDraft.json.siteContentUpdatedAt;

    const reloadForFlag = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(reloadForFlag.status === 200, "Reload before flag enable failed");
    const flagOk = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...reloadForFlag.json.siteContent,
        featureFlags: { playBasedCurriculum: true },
        updatedAt: reloadForFlag.json.siteContent.updatedAt,
      },
    });
    assert(flagOk.status === 200, `Enable flag failed: ${flagOk.status} ${flagOk.text}`);
    assert(flagOk.json.siteContent.featureFlags?.playBasedCurriculum === true, "Flag not persisted");

    const publicOn = await requestJson("GET", "/api/site-content");
    assert(publicOn.status === 200, "Public site-content failed with flag ON");
    assert(publicOn.json.siteContent.playBasedCurriculum === true, "Public flag should be true");
    assert(!("curriculum" in publicOn.json.siteContent), "Public API must still omit full curriculum");
    assert(!("featureFlags" in publicOn.json.siteContent), "Public API must still omit featureFlags object");
    const library = publicOn.json.siteContent.curriculumLibrary;
    assert(library, "curriculumLibrary missing when flag ON");
    assert(Array.isArray(library.lessonPlans) && library.lessonPlans.some((p) => p.id === lessonPlanId), "Published lesson missing from library DTO");
    assert(library.lessonPlans.every((p) => p.status === "published" || p.status === "featured"), "Draft lessons leaked");
    assert(Array.isArray(library.activities) && library.activities.some((a) => a.id === publishedActivity.id), "Published activity missing");
    assert(library.activities.every((a) => a.status === "published" && a.lessonPlanId), "Activities must be published and parent-linked");
    assert(library.resources.some((r) => r.id === publishedResourceId), "Published linked resource missing");
    assert(!library.resources.some((r) => r.id === draftResourceId), "Draft resource leaked into public library");
    assert(library.resources.every((r) => !("fileData" in r)), "Public library resources must not include fileData");
    assert(library.resources.every((r) => r.hasFile === true || r.hasFile === false), "Public resources should expose hasFile");

    console.log("8) Public file endpoint serves published linked files only");
    const pubFile = await requestJson(
      "GET",
      `/api/curriculum/resources/file?id=${encodeURIComponent(publishedResourceId)}`,
    );
    assert(pubFile.status === 200, `Public file fetch failed: ${pubFile.status} ${pubFile.text}`);
    assert(pubFile.json.resource.fileData === PNG_DATA_URL, "Public file payload mismatch");

    const draftFile = await requestJson(
      "GET",
      `/api/curriculum/resources/file?id=${encodeURIComponent(draftResourceId)}`,
    );
    assert(draftFile.status === 404, "Draft resource file must not be publicly readable");

    console.log("\nAll Phase 2E curriculum library checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
