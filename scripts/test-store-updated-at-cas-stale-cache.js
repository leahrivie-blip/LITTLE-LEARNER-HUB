#!/usr/bin/env node
/**
 * Proves stale storeCache cannot overwrite a newer llh_store after external prune.
 *
 * A) App boots; seed fat enrichment history into storeCache+Postgres
 * B) Simulate controlled Postgres prune (newer row updated_at + pruned history) without
 *    refreshing the process storeCache
 * C) Trigger normal application persistence from the stale in-memory store
 * D) Fat history must NOT return to Postgres
 * E) App detects conflict and reloads authoritative state
 * F) Legitimate newer non-history mutation is preserved afterward
 */
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pruneEnrichmentPublishHistoryInStore } = require("../server/enrichment-publish-history.js");

const ROOT = path.join(__dirname, "..");
const PORT = 18820 + Math.floor(Math.random() * 30);
const ADMIN = {
  email: "cas-test@example.com",
  password: "cas-test-pass",
  code: "cas-test-code",
};
const PLAN_ID = "cur-lp-cas-fat-history";

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
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function makeFatHistory(n) {
  const out = [];
  for (let i = n; i >= 1; i -= 1) {
    out.push({
      versionId: `fat-${i}`,
      kind: "draft",
      publishedAt: new Date(Date.UTC(2026, 0, i)).toISOString(),
      publishedBy: "tester",
      fingerprint: `fat-fp-${i}`,
      snapshot: { enrichmentDraft: { tip: `old-${i}` } },
    });
  }
  return out;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llh-cas-"));
  const controlPath = path.join(tmp, "control.json");
  const statusPath = path.join(tmp, "status.json");
  const dumpPath = path.join(tmp, "store-dump.json");
  fs.writeFileSync(controlPath, "{}");

  const child = spawn(
    process.execPath,
    ["-r", path.join(ROOT, "scripts/mock-pg-preload.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        SITE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
        ADMIN_NAME: "CAS Test",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        NODE_ENV: "test",
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_STORE_DUMP_PATH: dumpPath,
        MOCK_PG_QUERY_DELAY_MS: "15",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });

  try {
    for (let i = 0; i < 150; i += 1) {
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200 && health.json?.ok) break;
      } catch { /* retry */ }
      if (child.exitCode !== null) throw new Error(`Server exited early: ${output.slice(-800)}`);
      await new Promise((r) => setTimeout(r, 100));
      if (i === 149) throw new Error(`Server did not boot: ${output.slice(-800)}`);
    }

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200, `login failed: ${login.status}`);
    const token = login.json.token;

    const bootstrap = await requestJson(
      "GET",
      `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`,
    );
    assert(bootstrap.status === 200, "bootstrap failed");
    let stamp = bootstrap.json.siteContent?.updatedAt || "";

    // A) Seed fat history through curriculum lesson-plan save (updates storeCache + Postgres).
    const fatHistory = makeFatHistory(12);
    const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: PLAN_ID,
        title: "CAS Fat History Fixture",
        age: "Preschool",
        theme: "Test",
        plan: "Free",
        status: "draft",
        learningDomains: ["Cognitive"],
        weeklyOverview: "CAS",
        objectives: "Persist",
        weeklyMaterials: "none",
        vocabularyWords: "test",
        observationOpportunities: "watch",
        adaptations: "n/a",
        familyConnection: "seed-family",
        books: [],
        songs: [],
        teachingKit: { binderTitle: "CAS TK" },
        enrichmentDraft: { tip: "live-draft" },
        enrichmentPublishHistory: fatHistory,
        dailyPlans: {
          monday: { items: [{ itemId: `${PLAN_ID}-1`, title: "Circle", activityCategory: "Cognitive" }] },
          tuesday: { items: [{ itemId: `${PLAN_ID}-2`, title: "Art", activityCategory: "Art" }] },
          wednesday: { items: [{ itemId: `${PLAN_ID}-3`, title: "Music", activityCategory: "Music" }] },
          thursday: { items: [{ itemId: `${PLAN_ID}-4`, title: "Outside", activityCategory: "Gross Motor" }] },
          friday: { items: [{ itemId: `${PLAN_ID}-5`, title: "Books", activityCategory: "Literacy" }] },
        },
        resourceIds: [],
        activityIds: [],
      },
    });
    assert(seed.status === 200, `seed failed: ${seed.status} ${seed.text}`);
    stamp = seed.json.siteContentUpdatedAt || stamp;
    await new Promise((r) => setTimeout(r, 250));

    let beforeDump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    let beforePlan = (beforeDump.siteContent.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
    assert(beforePlan, "seeded plan missing from dump");
    // Classic lesson-plan save may not persist enrichmentPublishHistory; inject via mock
    // Postgres row so storeCache remains fat while we can prune the DB underneath.
    if ((beforePlan.enrichmentPublishHistory || []).length < 12) {
      const injected = JSON.parse(JSON.stringify(beforeDump));
      injected.siteContent.curriculum.lessonPlans = injected.siteContent.curriculum.lessonPlans.map((p) => (
        p.id === PLAN_ID
          ? {
            ...p,
            enrichmentDraft: { tip: "live-draft" },
            teachingKit: { binderTitle: "CAS TK" },
            enrichmentPublishHistory: fatHistory,
          }
          : p
      ));
      // Force process storeCache to match injected fat store by saving a noop through
      // enrichment draft path after writing mock row + reloading via conflict recovery.
      fs.writeFileSync(controlPath, JSON.stringify({
        externalStorePrune: {
          store: injected,
          updatedAt: new Date("2026-08-13T00:30:00.000Z").toISOString(),
        },
      }, null, 2));
      const sync = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        lessonPlan: { id: PLAN_ID, weeklyOverview: "sync-fat-history" },
      });
      assert(sync.status === 200, `fat sync failed: ${sync.status} ${sync.text}`);
      stamp = sync.json.siteContentUpdatedAt || stamp;
      await new Promise((r) => setTimeout(r, 300));
      beforeDump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
      beforePlan = (beforeDump.siteContent.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
    }
    assert(
      (beforePlan.enrichmentPublishHistory || []).length === 12,
      `expected fat history 12, got ${(beforePlan.enrichmentPublishHistory || []).length}`,
    );

    // B) External prune updates Postgres only (storeCache remains fat until next write).
    const prunedStore = JSON.parse(JSON.stringify(beforeDump));
    pruneEnrichmentPublishHistoryInStore(prunedStore);
    const prunedPlan = prunedStore.siteContent.curriculum.lessonPlans.find((p) => p.id === PLAN_ID);
    assert((prunedPlan.enrichmentPublishHistory || []).length === 5, "prune helper failed in test setup");
    fs.writeFileSync(controlPath, JSON.stringify({
      externalStorePrune: {
        store: prunedStore,
        updatedAt: new Date("2026-08-13T01:00:00.000Z").toISOString(),
      },
    }, null, 2));

    // C) Legitimate NEW curriculum mutation on the stale process, then persist.
    // Lesson-plan save carries fat history in storeCache while Postgres is already pruned.
    const NEW_OVERVIEW = "cas-new-admin-overview";
    const NEW_OBJECTIVES = "cas-new-admin-objectives";
    const staleTouch = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: PLAN_ID,
        weeklyOverview: NEW_OVERVIEW,
        objectives: NEW_OBJECTIVES,
      },
    });
    assert(staleTouch.status === 200, `stale touch failed: ${staleTouch.status} ${staleTouch.text}`);
    stamp = staleTouch.json.siteContentUpdatedAt || stamp;
    await new Promise((r) => setTimeout(r, 400));

    // D/E/F) Dump must show pruned history AND the new Admin mutation.
    const afterDump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    const afterPlan = (afterDump.siteContent.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
    assert(afterPlan, "plan missing after stale persistence");
    assert(
      (afterPlan.enrichmentPublishHistory || []).length === 5,
      `stale cache restored fat history: ${(afterPlan.enrichmentPublishHistory || []).length}`,
    );
    assert(afterPlan.weeklyOverview === NEW_OVERVIEW, "new weekly overview mutation was lost");
    assert(afterPlan.objectives === NEW_OBJECTIVES, "new objectives mutation was lost");
    assert(
      !Array.isArray(afterPlan.enrichmentPublishHistory)
        || afterPlan.enrichmentPublishHistory.every((e) => e && e.versionId),
      "retained history entries lost versionId",
    );
    assert(output.includes("store_updated_at_conflict"), "expected updated_at conflict recovery log");
    assert(
      output.includes("full_store_write_success_after_updated_at_conflict"),
      "expected exactly one successful recovery retry",
    );
    assert(
      !output.includes("store_updated_at_conflict_retry_exhausted"),
      "single conflict must not exhaust retries",
    );

    // F) Legitimate newer mutation after recovery persists; history stays capped.
    // Refresh concurrency stamp from live admin content after CAS recovery.
    const refresh = await requestJson(
      "GET",
      `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`,
    );
    assert(refresh.status === 200, `refresh failed: ${refresh.status}`);
    stamp = refresh.json.siteContent?.updatedAt || stamp;
    const mutate = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: PLAN_ID,
        familyConnection: "cas-legit-mutation",
        enrichmentPublishHistory: afterPlan.enrichmentPublishHistory,
      },
    });
    assert(
      mutate.status === 200,
      `legit mutate failed: ${mutate.status} ${String(mutate.text || "").slice(0, 240)}`,
    );
    stamp = mutate.json.siteContentUpdatedAt || stamp;
    await new Promise((r) => setTimeout(r, 300));
    const finalDump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    const finalPlan = (finalDump.siteContent.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
    assert((finalPlan.enrichmentPublishHistory || []).length === 5, "history re-inflated after legit mutate");
    assert(finalPlan.familyConnection === "cas-legit-mutation", "legitimate mutation lost");

    // Concurrent bump of row updated_at under a normal persistence: history remains pruned;
    // the in-flight curriculum mutation and earlier mutations are preserved by reconcile.
    fs.writeFileSync(controlPath, JSON.stringify({
      bumpRowUpdatedAt: new Date("2026-08-13T02:00:00.000Z").toISOString(),
    }, null, 2));
    const CONCURRENT_OVERVIEW = "after-bump-touch";
    const concurrentTouch = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: PLAN_ID,
        weeklyOverview: CONCURRENT_OVERVIEW,
        objectives: NEW_OBJECTIVES,
      },
    });
    assert(concurrentTouch.status === 200, `concurrent touch failed: ${concurrentTouch.status} ${String(concurrentTouch.text||"").slice(0,200)}`);
    await new Promise((r) => setTimeout(r, 400));
    const concurrentDump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    const concurrentPlan = (concurrentDump.siteContent.curriculum.lessonPlans || []).find((p) => p.id === PLAN_ID);
    assert((concurrentPlan.enrichmentPublishHistory || []).length === 5, "history changed after concurrent bump");
    assert(
      concurrentPlan.weeklyOverview === CONCURRENT_OVERVIEW,
      `concurrent curriculum mutation lost (overview=${concurrentPlan.weeklyOverview})`,
    );
    assert(
      concurrentPlan.objectives === NEW_OBJECTIVES,
      `earlier objectives mutation lost after concurrency recovery (objectives=${concurrentPlan.objectives})`,
    );

    console.log("Store updated_at CAS stale-cache checks passed.");
  } catch (error) {
    console.error("FAIL:", String(error.message || error).slice(0, 500));
    console.error(output.slice(-2500));
    process.exitCode = 1;
  } finally {
    if (child.exitCode === null) {
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
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
