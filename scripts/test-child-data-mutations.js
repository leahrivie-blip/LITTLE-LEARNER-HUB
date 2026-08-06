#!/usr/bin/env node
/**
 * Phase 2 proof — server child-data mutation idempotency + auth isolation.
 * Run: npm run test:child-data-mutations
 * Disposable only. Do not merge. Do not deploy.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const mutations = require(path.join(ROOT, "server/child-data-mutations"));

function unitTests() {
  const store = {
    users: {
      "owner@example.com": { email: "owner@example.com", role: "owner", programId: "prog-a" },
      "teacher@example.com": {
        email: "teacher@example.com",
        role: "teacher",
        programId: "prog-a",
        classroomIds: ["room-oaks"],
      },
      "assistant@example.com": {
        email: "assistant@example.com",
        role: "assistant",
        programId: "prog-a",
        classroomIds: ["room-oaks"],
      },
      "other-teacher@example.com": {
        email: "other-teacher@example.com",
        role: "teacher",
        programId: "prog-a",
        classroomIds: ["room-maples"],
      },
    },
    programData: {
      "prog-a": {
        programId: "prog-a",
        child: {
          data: {
            ...mutations.emptyPayload(),
            Profiles: [
              { id: "child-ava", name: "Ava", classroomId: "room-oaks", classroom: "Oaks" },
              { id: "child-cara", name: "Cara", classroomId: "room-maples", classroom: "Maples" },
            ],
          },
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    },
  };

  const teacherCtx = {
    programId: "prog-a",
    actorEmail: "teacher@example.com",
    actorUid: "t1",
    role: "teacher",
    ownerEmail: "owner@example.com",
  };

  const mealId = "meal-1";
  const first = mutations.applyMutations(store, teacherCtx, [{
    clientMutationId: "mid-1",
    op: "upsert",
    storeKey: "Meals",
    record: {
      id: mealId,
      childId: "child-ava",
      date: "2026-08-06",
      lunch: "Pasta",
      createdAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:00:00.000Z",
    },
  }]);
  assert.equal(first.ok, true);
  assert.equal(first.applied, 1);
  assert.equal(first.duplicates, 0);
  assert.equal(store.programData["prog-a"].child.data.Meals.length, 1);

  const retry = mutations.applyMutations(store, teacherCtx, [{
    clientMutationId: "mid-1",
    op: "upsert",
    storeKey: "Meals",
    record: {
      id: mealId,
      childId: "child-ava",
      date: "2026-08-06",
      lunch: "DUPLICATE SHOULD NOT APPLY",
      createdAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:05:00.000Z",
    },
  }]);
  assert.equal(retry.duplicates, 1);
  assert.equal(store.programData["prog-a"].child.data.Meals[0].lunch, "Pasta");

  const denied = mutations.applyMutations(store, teacherCtx, [{
    clientMutationId: "mid-2",
    op: "upsert",
    storeKey: "Meals",
    record: {
      id: "meal-2",
      childId: "child-cara",
      date: "2026-08-06",
      lunch: "Should fail",
      createdAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:00:00.000Z",
    },
  }]);
  assert.equal(denied.failed, 1);
  assert.match(denied.results[0].error || "", /assigned classroom/i);

  const assistantCtx = {
    ...teacherCtx,
    actorEmail: "assistant@example.com",
    role: "assistant",
  };
  const assistantProfile = mutations.applyMutations(store, assistantCtx, [{
    clientMutationId: "mid-3",
    op: "upsert",
    storeKey: "Profiles",
    record: {
      id: "child-ava",
      name: "Ava Edited",
      classroomId: "room-oaks",
      createdAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:10:00.000Z",
    },
  }]);
  assert.equal(assistantProfile.failed, 1);
  assert.match(assistantProfile.results[0].error || "", /cannot edit child profiles/i);

  const assistantMeal = mutations.applyMutations(store, assistantCtx, [{
    clientMutationId: "mid-4",
    op: "upsert",
    storeKey: "Meals",
    record: {
      id: "meal-asst",
      childId: "child-ava",
      date: "2026-08-06",
      snack: "Apple",
      createdAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:00:00.000Z",
    },
  }]);
  assert.equal(assistantMeal.applied, 1);

  // Two writers: teacher updates nap; maple teacher cannot overwrite oaks child.
  const mapleCtx = {
    ...teacherCtx,
    actorEmail: "other-teacher@example.com",
    role: "teacher",
  };
  const mapleDenied = mutations.applyMutations(store, mapleCtx, [{
    clientMutationId: "mid-5",
    op: "upsert",
    storeKey: "Naps",
    record: {
      id: "nap-x",
      childId: "child-ava",
      date: "2026-08-06",
      napStart: "12:00",
      createdAt: "2026-08-06T12:00:00.000Z",
      updatedAt: "2026-08-06T12:00:00.000Z",
    },
  }]);
  assert.equal(mapleDenied.failed, 1);

  // Simultaneous appends (different ids) both survive.
  const dual = mutations.applyMutations(store, teacherCtx, [
    {
      clientMutationId: "mid-6a",
      op: "upsert",
      storeKey: "Naps",
      record: {
        id: "nap-a",
        childId: "child-ava",
        date: "2026-08-06",
        napStart: "12:00",
        createdAt: "2026-08-06T12:00:00.000Z",
        updatedAt: "2026-08-06T12:00:00.000Z",
      },
    },
    {
      clientMutationId: "mid-6b",
      op: "upsert",
      storeKey: "Diapers",
      record: {
        id: "diaper-b",
        childId: "child-ava",
        date: "2026-08-06",
        type: "Wet",
        createdAt: "2026-08-06T12:01:00.000Z",
        updatedAt: "2026-08-06T12:01:00.000Z",
      },
    },
  ]);
  assert.equal(dual.applied, 2);
  assert.equal(store.programData["prog-a"].child.data.Naps.some((n) => n.id === "nap-a"), true);
  assert.equal(store.programData["prog-a"].child.data.Diapers.some((n) => n.id === "diaper-b"), true);

  // Stale edit conflict — meal edit must not clobber when baseRevision is outdated.
  const meal = store.programData["prog-a"].child.data.Meals.find((m) => m.id === mealId);
  assert.equal(meal.revision, 1);
  const edited = mutations.applyMutations(store, teacherCtx, [{
    clientMutationId: "mid-7",
    op: "upsert",
    storeKey: "Meals",
    baseRevision: 1,
    record: {
      ...meal,
      lunch: "Pasta with sauce",
      updatedAt: "2026-08-06T12:20:00.000Z",
    },
  }]);
  assert.equal(edited.applied, 1);
  assert.equal(store.programData["prog-a"].child.data.Meals.find((m) => m.id === mealId).revision, 2);
  assert.equal(store.programData["prog-a"].child.data.Meals.find((m) => m.id === mealId).lunch, "Pasta with sauce");

  const stale = mutations.applyMutations(store, teacherCtx, [{
    clientMutationId: "mid-8",
    op: "upsert",
    storeKey: "Meals",
    baseRevision: 1,
    record: {
      id: mealId,
      childId: "child-ava",
      lunch: "STALE OVERWRITE",
      updatedAt: "2026-08-06T12:30:00.000Z",
    },
  }]);
  assert.equal(stale.conflicts, 1);
  assert.equal(stale.results[0].conflict, true);
  assert.equal(stale.results[0].code, "stale_revision");
  assert.equal(store.programData["prog-a"].child.data.Meals.find((m) => m.id === mealId).lunch, "Pasta with sauce");
  // Nap/diaper from earlier still present — meal conflict did not wipe other stores.
  assert.equal(store.programData["prog-a"].child.data.Naps.some((n) => n.id === "nap-a"), true);

  console.log("PASS  child-data-mutations unit (idempotency + classroom auth + revision conflicts)");
}

function request(port, method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function apiTests() {
  const port = 48000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-mut-${crypto.randomBytes(4).toString("hex")}.json`);
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    for (let i = 0; i < 80; i += 1) {
      if (server.exitCode !== null) throw new Error(`Server exited ${server.exitCode}`);
      try {
        const health = await request(port, "GET", "/api/health");
        if (health.status === 200 && health.json?.ok) break;
      } catch (_e) { /* retry */ }
      await new Promise((r) => setTimeout(r, 150));
    }

    const OWNER = "phase2.mut.owner@example.com";
    const TEACHER = "phase2.mut.teacher@example.com";
    const OWNER_B = "phase2.mut.ownerb@example.com";

    // Bootstrap owner program + child snapshot
    const seed = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        data: {
          Profiles: [
            { id: "child-ava", name: "Ava", classroomId: "room-oaks", classroom: "Oaks" },
            { id: "child-cara", name: "Cara", classroomId: "room-maples", classroom: "Maples" },
          ],
          Attendance: [],
          Meals: [],
          Naps: [],
          Diapers: [],
          ActivityLogs: [],
          Communications: [],
          Photos: [],
          Reports: [],
          Observations: [],
          SupportPlans: [],
          Goals: [],
          Differentiations: [],
          MealPresets: [],
          Documents: [],
        },
      },
    });
    assert.equal(seed.status, 200, JSON.stringify(seed.json));

    // Invite + accept teacher into owner's program / oaks
    const invite = await request(port, "POST", "/api/staff/invites", {
      email: OWNER,
      body: {
        email: TEACHER,
        role: "teacher",
        classroomId: "room-oaks",
        classroomName: "Oaks",
        programName: "Mutation Nest",
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(invite.status, 200, JSON.stringify(invite.json));
    const token = new URL(invite.json.acceptUrl).searchParams.get("staffInvite");
    const accept = await request(port, "POST", "/api/staff/invites/accept", {
      email: TEACHER,
      body: { token },
    });
    assert.equal(accept.status, 200, JSON.stringify(accept.json));

    // Teacher snapshot POST rejected
    const snapDenied = await request(port, "POST", "/api/child-data", {
      email: TEACHER,
      body: { data: { Profiles: [], Meals: [] } },
    });
    assert.equal(snapDenied.status, 400);
    assert.equal(snapDenied.json?.code, "child_data_mutations_required");

    const mutationBody = {
      mutations: [{
        clientMutationId: "api-mid-1",
        op: "upsert",
        storeKey: "Meals",
        record: {
          id: "meal-api-1",
          childId: "child-ava",
          date: "2026-08-06",
          lunch: "Rice",
          createdAt: "2026-08-06T12:00:00.000Z",
          updatedAt: "2026-08-06T12:00:00.000Z",
        },
      }],
    };
    const applied = await request(port, "POST", "/api/child-data", { email: TEACHER, body: mutationBody });
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    assert.equal(applied.json.applied, 1);

    const dup = await request(port, "POST", "/api/child-data", { email: TEACHER, body: mutationBody });
    assert.equal(dup.status, 200);
    assert.equal(dup.json.duplicates, 1);

    const getOwner = await request(port, "GET", "/api/child-data", { email: OWNER });
    assert.equal(getOwner.status, 200);
    assert.equal((getOwner.json.data?.Meals || []).filter((m) => m.id === "meal-api-1").length, 1);

    // Cross-program: owner B cannot see owner A's meals
    await request(port, "POST", "/api/child-data", {
      email: OWNER_B,
      body: {
        data: {
          Profiles: [{ id: "child-zoe", name: "Zoe", classroomId: "room-z", classroom: "Z" }],
          Meals: [],
          Attendance: [],
          Naps: [],
          Diapers: [],
          ActivityLogs: [],
          Communications: [],
          Photos: [],
          Reports: [],
          Observations: [],
          SupportPlans: [],
          Goals: [],
          Differentiations: [],
          MealPresets: [],
          Documents: [],
        },
      },
    });
    const getB = await request(port, "GET", "/api/child-data", { email: OWNER_B });
    assert.equal(getB.status, 200);
    assert.equal((getB.json.data?.Meals || []).length, 0);
    assert.ok(!(getB.json.data?.Profiles || []).some((p) => p.id === "child-ava"));

    // Teacher cannot mutate other classroom child
    const otherRoom = await request(port, "POST", "/api/child-data", {
      email: TEACHER,
      body: {
        mutations: [{
          clientMutationId: "api-mid-2",
          op: "upsert",
          storeKey: "Meals",
          record: {
            id: "meal-bad",
            childId: "child-cara",
            date: "2026-08-06",
            lunch: "Nope",
            createdAt: "2026-08-06T12:00:00.000Z",
            updatedAt: "2026-08-06T12:00:00.000Z",
          },
        }],
      },
    });
    assert.ok([200, 403].includes(otherRoom.status), `expected 200/403 got ${otherRoom.status}`);
    assert.equal(otherRoom.json.failed, 1);

    // Simultaneous appends from two devices
    const [a, b] = await Promise.all([
      request(port, "POST", "/api/child-data", {
        email: TEACHER,
        body: {
          mutations: [{
            clientMutationId: "api-sim-a",
            op: "upsert",
            storeKey: "Naps",
            record: {
              id: "nap-sim-a",
              childId: "child-ava",
              date: "2026-08-06",
              napStart: "12:00",
              createdAt: "2026-08-06T12:00:00.000Z",
              updatedAt: "2026-08-06T12:00:00.000Z",
            },
          }],
        },
      }),
      request(port, "POST", "/api/child-data", {
        email: OWNER,
        body: {
          mutations: [{
            clientMutationId: "api-sim-b",
            op: "upsert",
            storeKey: "Diapers",
            record: {
              id: "diaper-sim-b",
              childId: "child-ava",
              date: "2026-08-06",
              type: "Wet",
              createdAt: "2026-08-06T12:00:01.000Z",
              updatedAt: "2026-08-06T12:00:01.000Z",
            },
          }],
        },
      }),
    ]);
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(b.status, 200, JSON.stringify(b.json));
    const afterSim = await request(port, "GET", "/api/child-data", { email: OWNER });
    assert.ok((afterSim.json.data?.Naps || []).some((n) => n.id === "nap-sim-a"));
    assert.ok((afterSim.json.data?.Diapers || []).some((n) => n.id === "diaper-sim-b"));

    // Stale edit → 409, original meal preserved
    const meal = (afterSim.json.data?.Meals || []).find((m) => m.id === "meal-api-1");
    assert.ok(meal);
    const firstEdit = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        mutations: [{
          clientMutationId: "api-edit-1",
          op: "upsert",
          storeKey: "Meals",
          baseRevision: meal.revision || 1,
          record: { ...meal, lunch: "Rice updated", updatedAt: new Date().toISOString() },
        }],
      },
    });
    assert.equal(firstEdit.status, 200);
    const staleEdit = await request(port, "POST", "/api/child-data", {
      email: TEACHER,
      body: {
        mutations: [{
          clientMutationId: "api-edit-stale",
          op: "upsert",
          storeKey: "Meals",
          baseRevision: meal.revision || 1,
          record: { ...meal, lunch: "STALE", updatedAt: new Date().toISOString() },
        }],
      },
    });
    assert.equal(staleEdit.status, 409);
    assert.equal(staleEdit.json.conflicts, 1);
    const afterConflict = await request(port, "GET", "/api/child-data", { email: OWNER });
    const mealAfter = (afterConflict.json.data?.Meals || []).find((m) => m.id === "meal-api-1");
    assert.equal(mealAfter.lunch, "Rice updated");
    assert.ok((afterConflict.json.data?.Naps || []).some((n) => n.id === "nap-sim-a"), "conflict must not wipe other events");

    console.log("PASS  child-data-mutations API (idempotency, simultaneous appends, 409 stale edit, isolation)");
  } finally {
    server.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  unitTests();
  await apiTests();
  console.log("ALL CHILD DATA MUTATION CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
