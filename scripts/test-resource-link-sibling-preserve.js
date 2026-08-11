#!/usr/bin/env node
/**
 * Curriculum resource link / unlink / save / archive → sibling preservation.
 *
 * Proves resource mutation paths use surgical writeSiteCurriculumTouched
 * and cannot rewrite unrelated sibling lesson plans, activities, resources,
 * or feature flags on disk.
 *
 * Disposable fixtures only.
 * Run: npm run test:resource-link-sibling-preserve
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 8100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-res-sib-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "res-sib-pass",
  code: "res-sib-code",
};

const TARGET = "cur-lp-res-sib-target";
const SIB_A = "cur-lp-res-sib-a";
const SIB_B = "cur-lp-res-sib-b";
const FARM = "cur-lp-preschool-farm-animals";
const TARGET_RES = "cur-res-res-sib-target";
const SIB_RES = "cur-res-res-sib-keep";
const ORPHAN_RES = "cur-res-res-sib-orphan";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fp(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function curriculum(store) {
  return store?.siteContent?.curriculum || { lessonPlans: [], activities: [], resources: [] };
}

function plan(store, id) {
  return (curriculum(store).lessonPlans || []).find((p) => p.id === id) || null;
}

function resource(store, id) {
  return (curriculum(store).resources || []).find((r) => r.id === id) || null;
}

function siblingShell(id, title, opts = {}) {
  return {
    id,
    title,
    age: "Preschool",
    theme: "Sibling Preserve",
    plan: "Pro",
    status: "published",
    weeklyOverview: `${title} overview — immutable`,
    objectives: "keep",
    weeklyMaterials: "blocks",
    vocabularyWords: "keep",
    familyConnection: "keep",
    books: [{ title: "Keep Book" }],
    songs: [{ title: "Keep Song" }],
    resourceIds: opts.resourceIds || [],
    ownershipMarker: `own-${id}`,
    disposableQaFixture: true,
    setupMinutesOdd: opts.setupMinutesOdd,
    dailyPlans: {
      monday: {
        theme: "Mon",
        items: [{
          itemId: `item-${id}-0`,
          title: `${title} act`,
          objective: "keep",
          materials: "blocks",
          setup: "setup",
          steps: "steps",
          setupMinutes: opts.setupMinutes,
        }],
      },
    },
    updatedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function assertSiblingsUnchanged(beforeStore, afterStore, label) {
  for (const id of [SIB_A, SIB_B, FARM]) {
    ok(fp(plan(beforeStore, id)) === fp(plan(afterStore, id)), `${label}: sibling plan ${id} unchanged`);
  }
  ok(fp(resource(beforeStore, SIB_RES)) === fp(resource(afterStore, SIB_RES)), `${label}: sibling resource unchanged`);
  ok(
    fp(beforeStore.siteContent.featureFlags) === fp(afterStore.siteContent.featureFlags),
    `${label}: feature flags unchanged`,
  );
  ok(
    (curriculum(beforeStore).activities || []).length === (curriculum(afterStore).activities || []).length,
    `${label}: activity count unchanged`,
  );
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  for (const name of [
    "handleAdminCurriculumResourceSave",
    "handleAdminCurriculumResourceArchive",
    "handleAdminCurriculumResourceLink",
    "handleAdminCurriculumResourceUnlink",
  ]) {
    const start = serverJs.indexOf(`async function ${name}`);
    ok(start >= 0, `${name} present`);
    const end = serverJs.indexOf("\nasync function ", start + 10);
    const body = serverJs.slice(start, end > start ? end : start + 4000);
    ok(body.includes("writeSiteCurriculumTouched"), `${name} uses writeSiteCurriculumTouched`);
    ok(!/\bwriteSiteCurriculum\s*\(/.test(body), `${name} does not call whole-store writeSiteCurriculum`);
  }

  const distinctiveFlags = {
    teachingKitViewer: true,
    teachingKitPrintCenter: true,
    teachingKitEnrichmentEditor: true,
    customDeployedMarker: "res-sib-preserve",
    unexpectedCustomKey: { nested: true, n: 3 },
  };

  const storeSeed = {
    siteContent: {
      updatedAt: "2026-01-01T00:00:00.000Z",
      featureFlags: distinctiveFlags,
      curriculum: {
        updatedAt: "2026-01-01T00:00:00.000Z",
        lessonPlans: [
          siblingShell(TARGET, "Resource Sibling Target", { resourceIds: [] }),
          siblingShell(SIB_A, "Sibling A", {
            resourceIds: [SIB_RES],
            setupMinutes: null,
            setupMinutesOdd: "odd-a",
          }),
          siblingShell(SIB_B, "Sibling B", {
            resourceIds: [],
            setupMinutes: 0,
            setupMinutesOdd: "odd-b",
          }),
          siblingShell(FARM, "Farm Animals (protected-like)", {
            resourceIds: [],
            setupMinutes: null,
          }),
        ],
        activities: [],
        resources: [
          {
            id: TARGET_RES,
            title: "Target Draft Printable",
            type: "Printable",
            status: "draft",
            pageCount: 1,
            lessonPlanIds: [],
            accessLevel: "pro",
            disposableQaFixture: true,
            fileName: "target.pdf",
            mimeType: "application/pdf",
            fileData: "data:application/pdf;base64,JVBERi0xLjE=",
            updatedAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: SIB_RES,
            title: "Sibling Keep Printable",
            type: "Printable",
            status: "published",
            pageCount: 2,
            lessonPlanIds: [SIB_A],
            accessLevel: "pro",
            disposableQaFixture: true,
            ownershipMarker: "keep-res",
            updatedAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: ORPHAN_RES,
            title: "Orphan Archive Candidate",
            type: "Printable",
            status: "draft",
            pageCount: 1,
            lessonPlanIds: [TARGET],
            accessLevel: "pro",
            disposableQaFixture: true,
            fileName: "orphan.pdf",
            mimeType: "application/pdf",
            fileData: "data:application/pdf;base64,JVBERi0xLjE=",
            updatedAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        series: [],
      },
    },
    users: [],
  };
  // Pre-link orphan to target for archive test path.
  storeSeed.siteContent.curriculum.lessonPlans[0].resourceIds = [ORPHAN_RES];

  fs.writeFileSync(STORE_PATH, JSON.stringify(storeSeed, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += String(d); });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", OWNER);
    ok(login.status === 200 && login.json?.token, `owner login (${login.status})`);
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    // Seeders may stamp siteContent after boot — always read the live stamp.
    const stamp0 = readStore().siteContent.updatedAt;

    // LINK
    const beforeLink = readStore();
    const linkRes = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      resourceId: TARGET_RES,
      lessonPlanId: TARGET,
      expectedUpdatedAt: beforeLink.siteContent.updatedAt || stamp0,
    }, auth);
    ok(linkRes.status === 200, `link status 200 (got ${linkRes.status})`);
    const afterLink = readStore();
    assertSiblingsUnchanged(beforeLink, afterLink, "link");
    ok(
      (plan(afterLink, TARGET).resourceIds || []).includes(TARGET_RES),
      "link: target plan gained resource id",
    );
    ok(
      (resource(afterLink, TARGET_RES).lessonPlanIds || []).includes(TARGET),
      "link: target resource gained lesson id",
    );

    // SAVE (metadata only on target resource)
    const beforeSave = readStore();
    const saveRes = await requestJson("POST", "/api/admin/curriculum/resources/save", {
      expectedUpdatedAt: afterLink.siteContent.updatedAt,
      resource: {
        ...resource(beforeSave, TARGET_RES),
        title: "Target Draft Printable (renamed)",
        status: "draft",
      },
    }, auth);
    ok(saveRes.status === 200, `save status 200 (got ${saveRes.status}: ${saveRes.json?.error || ""})`);
    const afterSave = readStore();
    assertSiblingsUnchanged(beforeSave, afterSave, "save");
    ok(resource(afterSave, TARGET_RES).title.includes("renamed"), "save: target title updated");
    ok(resource(afterSave, TARGET_RES).status === "draft", "save: target remains draft");

    // UNLINK
    const beforeUnlink = readStore();
    const unlinkRes = await requestJson("POST", "/api/admin/curriculum/resources/unlink", {
      resourceId: TARGET_RES,
      lessonPlanId: TARGET,
      expectedUpdatedAt: afterSave.siteContent.updatedAt,
    }, auth);
    ok(unlinkRes.status === 200, `unlink status 200 (got ${unlinkRes.status})`);
    const afterUnlink = readStore();
    assertSiblingsUnchanged(beforeUnlink, afterUnlink, "unlink");
    ok(!(plan(afterUnlink, TARGET).resourceIds || []).includes(TARGET_RES), "unlink: removed from plan");

    // ARCHIVE orphan (was linked to TARGET)
    const beforeArch = readStore();
    const archRes = await requestJson("POST", "/api/admin/curriculum/resources/archive", {
      id: ORPHAN_RES,
      expectedUpdatedAt: afterUnlink.siteContent.updatedAt,
    }, auth);
    ok(archRes.status === 200, `archive status 200 (got ${archRes.status}: ${archRes.json?.error || ""})`);
    const afterArch = readStore();
    assertSiblingsUnchanged(beforeArch, afterArch, "archive");
    ok(resource(afterArch, ORPHAN_RES).status === "archived", "archive: orphan archived");
    ok(!(plan(afterArch, TARGET).resourceIds || []).includes(ORPHAN_RES), "archive: unlinked from target plan");
    ok((plan(afterArch, SIB_A).resourceIds || []).includes(SIB_RES), "archive: sibling link preserved");

    console.log(`\nPASS ${passed} checks — resource link/unlink/save/archive sibling preserve`);
  } catch (error) {
    console.error("\nFAIL", error);
    if (stderr) console.error(stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
