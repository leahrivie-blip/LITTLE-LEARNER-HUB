#!/usr/bin/env node
/**
 * Final safety gate for PR #638 (do not deploy from this script).
 *
 * Proves:
 * 1) lastSeenAt stays precise in-memory while durable persist is throttled
 * 2) Single ~29MB upsert completes (app-side metrics; mock cannot measure PG RAM)
 * 3) Sequential durable mutations persist correctly
 * 4) page_view noise during Admin save does NOT dirty-drain a second 29MB write
 * 5) Concurrent durable mutations A/B/C all survive reload from Postgres fixture
 *
 * Run: NODE_ENV=test node scripts/test-postgres-final-safety-gate.js
 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 18990 + Math.floor(Math.random() * 40);
const ADMIN = {
  email: "final-gate@llh-test.org",
  password: "final-gate-pass",
  code: "final-gate-code",
};
const controlPath = path.join(os.tmpdir(), `llh-final-ctrl-${crypto.randomBytes(4).toString("hex")}.json`);
const statusPath = path.join(os.tmpdir(), `llh-final-status-${crypto.randomBytes(4).toString("hex")}.json`);
const storePath = path.join(os.tmpdir(), `llh-final-store-${crypto.randomBytes(4).toString("hex")}.json`);
const dumpPath = path.join(os.tmpdir(), `llh-final-dump-${crypto.randomBytes(4).toString("hex")}.json`);
const SEED_PAD_BYTES = 28_000_000; // ~28MB pad ≈ production ~29MB document once curriculum seeds merge

function writeControl(ctrl) {
  fs.writeFileSync(controlPath, JSON.stringify(ctrl, null, 2));
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch {
    return {};
  }
}

function readDump() {
  return JSON.parse(fs.readFileSync(dumpPath, "utf8"));
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
        timeout: 180000,
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

function childRssMb(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
}

function startServer() {
  writeControl({});
  const child = spawn(
    process.execPath,
    ["-r", path.join(__dirname, "mock-pg-preload.js"), "server/index.js"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        SITE_URL: `http://127.0.0.1:${PORT}`,
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
        ADMIN_NAME: "Final Gate",
        DATABASE_PROVIDER: "postgres",
        PRODUCTION_DATABASE_URL: "postgres://mock:mock@127.0.0.1:5432/mock",
        LLH_STORE_PATH: storePath,
        MOCK_PG_CONTROL_PATH: controlPath,
        MOCK_PG_STATUS_PATH: statusPath,
        MOCK_PG_STORE_DUMP_PATH: dumpPath,
        MOCK_PG_SEED_PAYLOAD_BYTES: String(SEED_PAD_BYTES),
        MOCK_PG_QUERY_DELAY_MS: "20",
        LLH_SKIP_STARTUP_CURRICULUM_SEED: "true",
        POSTGRES_RECONNECT_INTERVAL_MS: "800",
        STORE_SAFETY_ALERT_COOLDOWN_MS: "1000",
        STORE_WRITE_DEBOUNCE_MS: "250",
        LAST_SEEN_STORE_PERSIST_MIN_INTERVAL_MS: "60000",
        RESEND_API_KEY: "",
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 240; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) break;
    } catch { /* */ }
    if (child.exitCode !== null) throw new Error(`exited early:\n${child.__output().slice(-2500)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 80; i += 1) {
    const count = readStatus().conflictUpsertSuccesses || 0;
    if (count === last) stable += 1;
    else stable = 0;
    last = count;
    if (stable >= 4) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 8000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin() {
  const login = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert.equal(login.status, 200, `login failed ${login.status} ${login.text}`);
  return login.json.token;
}

async function saveLesson(token, { id, title, teachingKit, theme }) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  assert.equal(bootstrap.status, 200, `bootstrap ${bootstrap.status}`);
  const expectedUpdatedAt = bootstrap.json.siteContent?.updatedAt || "";
  const lessonPlan = {
    id,
    title,
    age: "Toddler",
    theme: theme || "FinalGate",
    plan: "Free",
    status: "draft",
    learningDomains: ["Cognitive"],
    weeklyOverview: "Gate",
    objectives: "Persist",
    weeklyMaterials: "none",
    vocabularyWords: "test",
    observationOpportunities: "watch",
    adaptations: "n/a",
    familyConnection: "share",
    books: [],
    songs: [],
    dailyPlans: {
      monday: {
        items: [{
          itemId: "item-1",
          activityCategory: "Sensory Play",
          title: "Activity",
          description: "d",
          materials: "m",
          steps: "1. do",
          learningGoals: ["g"],
        }],
      },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    resourceIds: [],
    activityIds: [],
  };
  if (teachingKit) lessonPlan.teachingKit = teachingKit;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
  return save;
}

async function main() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /postgresWriteInFlight/);
  assert.match(serverJs, /analyticsFullStoreWritesAvoided/);
  assert.match(serverJs, /LAST_SEEN_STORE_PERSIST_MIN_INTERVAL_MS/);
  assert.match(serverJs, /withPostgresClient/);
  // page_view must skip durable schedule while a full-store write is in flight
  assert.match(
    serverJs,
    /if \(postgresWriteInFlight\) \{\s*[\s\S]*?analyticsFullStoreWritesAvoided \+= 1;/,
  );
  console.log("PASS  source: lastSeenAt cannot dirty-drain during in-flight Admin write");

  const child = startServer();
  const results = {
    postgresDbMemoryMeasurable: false,
    postgresDbMemoryNote: "Mock pg has no PostgreSQL process; DB-side RAM on basic_1gb cannot be proven here.",
  };
  try {
    const rssBootStart = childRssMb(child.pid);
    await waitForBoot(child);
    const token = await adminLogin();
    const statusAfterBoot = readStatus();
    assert.ok(
      (statusAfterBoot.storePayloadChars || 0) >= 20_000_000
      || (statusAfterBoot.lastWritePayloadBytes || 0) >= 20_000_000,
      `expected ~29MB-class fixture, got chars=${statusAfterBoot.storePayloadChars} lastWrite=${statusAfterBoot.lastWritePayloadBytes}`,
    );
    console.log(`PASS  production-sized fixture loaded (payloadChars=${statusAfterBoot.storePayloadChars || statusAfterBoot.lastWritePayloadBytes})`);

    // ---------- lastSeenAt in-memory precision ----------
    console.log("1) lastSeenAt throttle: memory precise, durable throttled");
    const member = "active-member@llh-test.org";
    await requestJson("POST", "/api/analytics/event", {
      name: "account_login_complete",
      user: member,
      sessionId: "final-login",
    });
    await new Promise((r) => setTimeout(r, 800));
    const writesAfterLogin = readStatus().conflictUpsertSuccesses || 0;
    for (let i = 0; i < 8; i += 1) {
      const res = await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/final-active-${i}`,
        user: member,
        sessionId: `final-sess-${i}`,
      });
      assert.equal(res.status, 200);
    }
    await new Promise((r) => setTimeout(r, 600));
    const writesAfterViews = readStatus().conflictUpsertSuccesses || 0;
    assert.ok(
      writesAfterViews - writesAfterLogin <= 1,
      `page_views must not durably rewrite store each time (delta=${writesAfterViews - writesAfterLogin})`,
    );
    // Admin analytics reads live storeCache via peekStore — member should look active/online.
    // Response shape: { analytics: { totals, marketing: { realtime }, users, ... }, correlationId }
    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    assert.equal(analytics.status, 200, analytics.text);
    const totals = analytics.json?.analytics?.totals || {};
    const realtime = analytics.json?.analytics?.marketing?.realtime || {};
    const online = Number(totals.usersOnlineNow || realtime.usersOnlineNow || 0);
    const memberRow = (analytics.json?.analytics?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === member,
    );
    assert.ok(memberRow?.lastSeenAt, `expected analytics user row with lastSeenAt for ${member}`);
    const seenAgeMs = Date.now() - new Date(memberRow.lastSeenAt).getTime();
    assert.ok(seenAgeMs <= 15 * 60 * 1000, `in-memory lastSeenAt too stale: ${memberRow.lastSeenAt}`);
    assert.ok(online >= 1, `expected usersOnlineNow >= 1 with fresh in-memory lastSeenAt, got ${online}`);
    console.log(`PASS  online visibility ok (usersOnlineNow=${online}, lastSeenAt=${memberRow.lastSeenAt}); durable upserts for 8 views delta=${writesAfterViews - writesAfterLogin}`);

    // ---------- Single ~29MB write ----------
    console.log("2) Single production-sized durable Admin save");
    writeControl({});
    const beforeSingle = readStatus().conflictUpsertSuccesses || 0;
    const rssBefore = childRssMb(child.pid);
    const t0 = Date.now();
    const single = await saveLesson(token, {
      id: "cur-lp-final-single",
      title: "Final Gate Single Save",
    });
    const singleMs = Date.now() - t0;
    assert.equal(single.status, 200, single.text);
    await new Promise((r) => setTimeout(r, 400));
    const afterSingle = readStatus();
    const singlePayload = afterSingle.lastWritePayloadBytes || 0;
    const rssAfter = childRssMb(child.pid);
    assert.ok(singlePayload >= 20_000_000, `single save payload too small: ${singlePayload}`);
    assert.equal(afterSingle.maxActiveConflictUpserts || 0, 1, "single save must not overlap upserts");
    assert.equal(afterSingle.overlappingUpserts || 0, 0, "no overlapping upserts on single save");
    results.singleWrite = {
      payloadBytes: singlePayload,
      durationMs: singleMs,
      childRssMbBefore: rssBefore,
      childRssMbAfter: rssAfter,
      maxActiveConflictUpserts: afterSingle.maxActiveConflictUpserts,
      upsertDelta: (afterSingle.conflictUpsertSuccesses || 0) - beforeSingle,
    };
    console.log("PASS  single ~29MB save", results.singleWrite);

    // ---------- Sequential mutations ----------
    console.log("3) Sequential Admin / Teaching Kit / curriculum mutations");
    writeControl({});
    const seqStart = readStatus().conflictUpsertSuccesses || 0;
    const a = await saveLesson(token, { id: "cur-lp-final-A", title: "Mutation A Admin" });
    assert.equal(a.status, 200, a.text);
    await new Promise((r) => setTimeout(r, 300));
    const b = await saveLesson(token, {
      id: "cur-lp-final-B",
      title: "Mutation B Teaching Kit",
      teachingKit: { title: "TK-B-Final", completeness: "ready", activities: [{ title: "Paint" }] },
    });
    assert.equal(b.status, 200, b.text);
    await new Promise((r) => setTimeout(r, 300));
    const c = await saveLesson(token, { id: "cur-lp-final-C", title: "Mutation C Curriculum", theme: "CurriculumC" });
    assert.equal(c.status, 200, c.text);
    await new Promise((r) => setTimeout(r, 500));
    const seqStatus = readStatus();
    assert.ok((seqStatus.conflictUpsertSuccesses || 0) - seqStart >= 3, "three sequential durable writes expected");
    assert.equal(seqStatus.maxActiveConflictUpserts || 0, 1, "sequential writes must never overlap");
    const dumpSeq = readDump();
    const ids = (dumpSeq.siteContent?.curriculum?.lessonPlans || []).map((p) => p.id);
    assert.ok(ids.includes("cur-lp-final-A"), "A missing from Postgres dump");
    assert.ok(ids.includes("cur-lp-final-B"), "B missing from Postgres dump");
    assert.ok(ids.includes("cur-lp-final-C"), "C missing from Postgres dump");
    const planB = dumpSeq.siteContent.curriculum.lessonPlans.find((p) => p.id === "cur-lp-final-B");
    assert.ok(planB?.teachingKit?.title === "TK-B-Final" || planB?.teachingKit, "Teaching Kit B not persisted");
    results.sequential = {
      upsertDelta: (seqStatus.conflictUpsertSuccesses || 0) - seqStart,
      maxActiveConflictUpserts: seqStatus.maxActiveConflictUpserts,
      persistedIds: ["cur-lp-final-A", "cur-lp-final-B", "cur-lp-final-C"],
    };
    console.log("PASS  sequential mutations", results.sequential);

    // ---------- Dirty-drain / page_view noise during Admin save ----------
    console.log("4) page_view noise must not force dirty-drain second 29MB write");
    writeControl({ delayConflictUpsertMs: 1200 });
    const beforeBurst = readStatus().conflictUpsertSuccesses || 0;
    const dirtyBefore = (child.__output().match(/dirty_store_drain/g) || []).length;
    const adminPromise = saveLesson(token, {
      id: "cur-lp-final-admin-burst",
      title: "Admin Save During Burst",
    });
    await new Promise((r) => setTimeout(r, 150));
    for (let i = 0; i < 10; i += 1) {
      await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/noise-${i}`,
        user: member,
        sessionId: `noise-${i}`,
      });
    }
    const adminRes = await adminPromise;
    assert.equal(adminRes.status, 200, adminRes.text);
    await new Promise((r) => setTimeout(r, 1800));
    writeControl({});
    const afterBurst = readStatus();
    const dirtyAfter = (child.__output().match(/dirty_store_drain/g) || []).length;
    const burstDelta = (afterBurst.conflictUpsertSuccesses || 0) - beforeBurst;
    assert.equal(afterBurst.maxActiveConflictUpserts || 0, 1, "no concurrent full-store UPSERTs");
    assert.equal(afterBurst.overlappingUpserts || 0, 0, "overlapping upsert counter must stay 0");
    // Admin save = 1 upsert. page_view must not add a dirty-drain second write.
    assert.ok(burstDelta <= 1, `expected ≤1 upsert (Admin only), got ${burstDelta}`);
    assert.equal(dirtyAfter, dirtyBefore, "page_view must not trigger dirty_store_drain during Admin save");
    const dumpBurst = readDump();
    assert.ok(
      (dumpBurst.siteContent?.curriculum?.lessonPlans || []).some((p) => p.id === "cur-lp-final-admin-burst"),
      "Admin burst lesson missing after settle",
    );
    results.dirtyDrain = {
      upsertDelta: burstDelta,
      dirtyDrainDelta: dirtyAfter - dirtyBefore,
      maxActiveConflictUpserts: afterBurst.maxActiveConflictUpserts,
      overlappingUpserts: afterBurst.overlappingUpserts,
    };
    console.log("PASS  dirty-drain/page_view isolation", results.dirtyDrain);

    // ---------- Persisted race: A write + B TK + C field + page_views ----------
    // Note: concurrent Admin lesson saves against the same siteContent.updatedAt correctly
    // return 409 (optimistic concurrency). This race proves store durability: B and C apply
    // with fresh expectedUpdatedAt WHILE A's UPSERT is still in flight, then we reload
    // from the Postgres fixture dump (not in-memory).
    console.log("5) Persisted race reload from Postgres fixture");
    writeControl({ delayConflictUpsertMs: 1800 });
    const raceBefore = readStatus().conflictUpsertSuccesses || 0;
    const dirtyBeforeRace = (child.__output().match(/dirty_store_drain/g) || []).length;
    const raceAPromise = saveLesson(token, { id: "cur-lp-race-A", title: "Race A Admin" });
    // Wait until A's full-store UPSERT is actively in flight (bootstrap over a ~28MB
    // fixture can take multiple seconds before the UPSERT begins).
    let sawInFlight = false;
    for (let i = 0; i < 200; i += 1) {
      if ((readStatus().activeConflictUpserts || 0) >= 1) {
        sawInFlight = true;
        break;
      }
      if (child.__output().includes("cur-lp-race-A") && child.__output().includes("full_store_write_start")) {
        // Write started in logs; give the mock a tick to bump activeConflictUpserts.
        await new Promise((r) => setTimeout(r, 30));
        if ((readStatus().activeConflictUpserts || 0) >= 1) {
          sawInFlight = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(sawInFlight, "expected A UPSERT in flight before B/C");
    // B/C use fresh bootstrap timestamps so Admin optimistic lock allows them; both mutate
    // storeCache during A's in-flight window (coalesce / dirty-drain path).
    const raceBRes = await saveLesson(token, {
      id: "cur-lp-race-B",
      title: "Race B Teaching Kit",
      teachingKit: { title: "TK-Race-B", completeness: "ready" },
    });
    assert.equal(raceBRes.status, 200, raceBRes.text);
    const raceCRes = await saveLesson(token, {
      id: "cur-lp-race-C",
      title: "Race C Durable Field",
      theme: "RaceThemeC",
    });
    assert.equal(raceCRes.status, 200, raceCRes.text);
    for (let i = 0; i < 6; i += 1) {
      await requestJson("POST", "/api/analytics/event", {
        name: "page_view",
        path: `/race-noise-${i}`,
        user: member,
        sessionId: `race-noise-${i}`,
      });
    }
    const raceARes = await raceAPromise;
    assert.equal(raceARes.status, 200, raceARes.text);
    // Allow write chain + optional dirty-drain to settle.
    await new Promise((r) => setTimeout(r, 3500));
    writeControl({});
    // Authoritative reload: mock dump file is rewritten on each successful upsert.
    const dumped = readDump();
    const raceIds = (dumped.siteContent?.curriculum?.lessonPlans || []).map((p) => p.id);
    assert.ok(raceIds.includes("cur-lp-race-A"), "race A missing from persisted store");
    assert.ok(raceIds.includes("cur-lp-race-B"), "race B missing from persisted store");
    assert.ok(raceIds.includes("cur-lp-race-C"), "race C missing from persisted store");
    const raceB = dumped.siteContent.curriculum.lessonPlans.find((p) => p.id === "cur-lp-race-B");
    const raceC = dumped.siteContent.curriculum.lessonPlans.find((p) => p.id === "cur-lp-race-C");
    assert.ok(raceB?.teachingKit, "Teaching Kit B lost from persisted store");
    assert.equal(raceC?.theme, "RaceThemeC", "theme C overwritten/lost");
    const raceStatus = readStatus();
    assert.equal(raceStatus.maxActiveConflictUpserts || 0, 1, "race must not overlap upserts");
    assert.equal(raceStatus.overlappingUpserts || 0, 0, "race must not overlap upserts (counter)");
    const dirtyAfterRace = (child.__output().match(/dirty_store_drain/g) || []).length;
    const raceUpsertDelta = (raceStatus.conflictUpsertSuccesses || 0) - raceBefore;
    // A + follow-up drain for B/C is expected; page_view must not amplify further.
    assert.ok(raceUpsertDelta >= 2 && raceUpsertDelta <= 3, `unexpected race upsert delta ${raceUpsertDelta}`);
    results.race = {
      upsertDelta: raceUpsertDelta,
      dirtyDrainDelta: dirtyAfterRace - dirtyBeforeRace,
      maxActiveConflictUpserts: raceStatus.maxActiveConflictUpserts,
      overlappingUpserts: raceStatus.overlappingUpserts,
      persisted: ["cur-lp-race-A", "cur-lp-race-B", "cur-lp-race-C"],
      themeC: raceC?.theme,
      teachingKitBPresent: Boolean(raceB?.teachingKit),
    };
    console.log("PASS  persisted race", results.race);

    results.bootRssMb = rssBootStart;
    results.finalRssMb = childRssMb(child.pid);
    results.finalPayloadChars = readStatus().storePayloadChars || readStatus().lastWritePayloadBytes;
    console.log("\n=== FINAL SAFETY GATE MEASUREMENTS ===");
    console.log(JSON.stringify(results, null, 2));
    assert.equal(child.exitCode, null, "server must remain alive");
    console.log("\nAll final safety gate checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    console.error(child.__output().slice(-4500));
    process.exitCode = 1;
  } finally {
    await stopServer(child);
    for (const file of [controlPath, statusPath, storePath, dumpPath]) {
      try { fs.unlinkSync(file); } catch { /* */ }
    }
  }
}

main();
