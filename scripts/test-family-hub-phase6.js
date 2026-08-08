#!/usr/bin/env node
/**
 * Phase 6 — Family Hub Completion (testing spine, no production).
 * Covers: HD + Center, multi-child / multi-guardian, Daily Ops → FH,
 * messaging + unread, forms share/ack ACL, photo privacy, revoke,
 * server-side household isolation, staff owner resolution, no second roster.
 *
 * Run: npm run test:family-hub-phase6
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const familyHubLib = require("../server/family-hub-lib.js");

function pass(id) {
  console.log(`PASS  ${id}`);
}

function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body, familyToken } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    if (familyToken) {
      headers.Authorization = `Bearer ${familyToken}`;
      headers["X-LLH-Family-Session"] = familyToken;
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "1",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

function sourceMarkers() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(serverJs, /function resolveFamilyHubOwnerEmail/);
  assert.match(serverJs, /function familyHubHouseholdChildIdSet/);
  assert.match(serverJs, /function publicFamilyHouseholdWithLiveChildren/);
  assert.match(serverJs, /shareWithFamily !== true/);
  assert.match(serverJs, /audience: "provider"/);
  assert.match(serverJs, /unreadMessages/);
  assert.match(appJs, /data-fh-billing-placeholder/);
  assert.match(appJs, /c\.name \|\| c\.id/);
  assert.match(appJs, /Family Hub households are the membership/);
  assert.match(stylesCss, /\.fh-parent|fh-today|family-hub-parent/);
  // No second Family Hub roster / parallel care store
  assert.doesNotMatch(appJs, /llhFamilyHubChildRoster|familyHubChildrenByUser|parallelFamilyRoster/);
  assert.doesNotMatch(serverJs, /familyHubChildRoster|duplicateChildNamesForFamilyHub/);
  pass("source_markers_phase6");
}

function visibilityUnit() {
  const day = familyHubLib.todayIso();
  const feed = familyHubLib.buildSharedFamilyFeed({
    Meals: [
      { id: "m1", childId: "c1", date: day, lunch: "Pasta", shareWithFamily: true },
      { id: "m2", childId: "c1", date: day, lunch: "Staff meal note", shareWithFamily: false },
    ],
    Diapers: [
      { id: "d1", childId: "c1", date: day, type: "Wet", shareWithFamily: true },
      { id: "d2", childId: "c1", date: day, type: "Internal", shareWithFamily: false },
    ],
    Naps: [
      { id: "n1", childId: "c1", date: day, napStart: "12:00", napEnd: "13:00", shareWithFamily: true },
    ],
    ActivityLogs: [
      { id: "a1", childId: "c1", date: day, activity: "Blocks", shareWithFamily: true },
    ],
    Communications: [
      { id: "mood1", childId: "c1", date: day, type: "Mood Note", mood: "Calm", shareWithFamily: true },
      { id: "staff1", childId: "c1", date: day, type: "Staff Note", summary: "Internal", shareWithFamily: false },
    ],
    Photos: [
      { id: "p1", childId: "c1", caption: "Shared", shareWithFamily: true },
      { id: "p2", childId: "c1", caption: "Private", shareWithFamily: false },
    ],
    Observations: [
      { id: "o1", childId: "c1", summary: "For family", shareWithFamily: true },
      { id: "o2", childId: "c1", summary: "Staff only", shareWithFamily: false },
    ],
    Reports: [
      { id: "r1", childId: "c1", title: "Daily", summary: "Good day", shareWithFamily: true },
    ],
  }, ["c1"]);
  assert.equal(feed.meals.length, 1);
  assert.equal(feed.diapers.length, 1);
  assert.equal(feed.naps.length, 1);
  assert.equal(feed.activities.length, 1);
  assert.equal(feed.photos.length, 1);
  assert.equal(feed.observations.length, 1);
  assert.equal(feed.reports.length, 1);
  const today = familyHubLib.buildFamilyHubToday({
    childData: {
      Meals: feed.meals.map((m) => ({ ...m, childId: "c1", date: day, lunch: "Pasta", shareWithFamily: true })),
      Diapers: [{ id: "d1", childId: "c1", date: day, type: "Wet", shareWithFamily: true }],
      Naps: [{ id: "n1", childId: "c1", date: day, napStart: "12:00", napEnd: "13:00", shareWithFamily: true }],
      ActivityLogs: [{ id: "a1", childId: "c1", date: day, activity: "Blocks", shareWithFamily: true }],
      Communications: [
        { id: "mood1", childId: "c1", date: day, type: "Mood Note", mood: "Calm", shareWithFamily: true },
        { id: "staff1", childId: "c1", date: day, type: "Staff Note", summary: "Internal", shareWithFamily: false },
      ],
      Photos: [
        { id: "p1", childId: "c1", caption: "Shared", shareWithFamily: true },
        { id: "p2", childId: "c1", caption: "Private", shareWithFamily: false },
      ],
      Reports: [{ id: "r1", childId: "c1", title: "Daily", summary: "Good day", shareWithFamily: true }],
      Observations: [{ id: "o1", childId: "c1", summary: "For family", shareWithFamily: true }],
    },
    children: [{ id: "c1", name: "Ava" }],
    childId: "c1",
    date: day,
    messages: [],
    events: [],
  });
  assert.ok(today.meals.length >= 1);
  assert.ok(today.photos.every((p) => p.caption !== "Private"));
  assert.ok(!JSON.stringify(today).includes("Internal"));
  pass("visibility_staff_vs_family");
}

async function runtimePhase6() {
  const port = 4600 + Math.floor(Math.random() * 400);
  const storePath = path.join(os.tmpdir(), `llh-phase6-${crypto.randomBytes(4).toString("hex")}.json`);
  const hdOwner = "hd.phase6@example.invalid";
  const centerOwner = "center.phase6@example.invalid";
  const teacher = "teacher.phase6@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [hdOwner]: { email: hdOwner, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [centerOwner]: { email: centerOwner, role: "owner", accountType: "center", plan: "Pro" },
      [teacher]: {
        email: teacher,
        role: "teacher",
        accountType: "center",
        linkedProgramOwnerEmail: centerOwner,
        classroomIds: ["room-a"],
      },
    },
  }, null, 2));

  const childProc = spawnServer({ port, storePath });
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ }
  };
  process.on("exit", kill);

  try {
    await waitForHealth(port, childProc);
    const today = familyHubLib.todayIso();

    // ——— Home Daycare: one child + one guardian ———
    const hdSeed = await request(port, "POST", "/api/child-data", {
      email: hdOwner,
      body: {
        data: {
          Profiles: [
            { id: "hd-ava", name: "Ava Home", classroomId: "classroom-main", ageGroup: "Toddler" },
          ],
          Meals: [{ id: "hd-m1", childId: "hd-ava", date: today, lunch: "Soup", shareWithFamily: true }],
          Photos: [
            { id: "hd-p1", childId: "hd-ava", caption: "Family photo", shareWithFamily: true },
            { id: "hd-p2", childId: "hd-ava", caption: "Staff photo", shareWithFamily: false },
          ],
          Communications: [
            { id: "hd-mood", childId: "hd-ava", date: today, type: "Mood Note", mood: "Happy", shareWithFamily: true },
            { id: "hd-staff", childId: "hd-ava", date: today, type: "Staff Note", summary: "SECRET_STAFF_NOTE", shareWithFamily: false },
          ],
          Documents: [
            { id: "hd-doc-shared", childId: "hd-ava", title: "Handbook", status: "notified", shareWithFamily: true },
            { id: "hd-doc-private", childId: "hd-ava", title: "Staff form", status: "needed", shareWithFamily: false },
          ],
          Reports: [{ id: "hd-r1", childId: "hd-ava", date: today, title: "Daily", summary: "Nice day", shareWithFamily: true }],
          Diapers: [{ id: "hd-d1", childId: "hd-ava", date: today, type: "Wet", shareWithFamily: true }],
          Naps: [{ id: "hd-n1", childId: "hd-ava", date: today, napStart: "12:30", napEnd: "14:00", shareWithFamily: true }],
          ActivityLogs: [{ id: "hd-a1", childId: "hd-ava", date: today, activity: "Sensory bin", shareWithFamily: true }],
          Observations: [{ id: "hd-o1", childId: "hd-ava", summary: "Explored textures", shareWithFamily: true }],
        },
      },
    });
    assert.equal(hdSeed.status, 200, hdSeed.text);

    const hdInvite = await request(port, "POST", "/api/family-hub/households", {
      email: hdOwner,
      body: {
        label: "Ava Family",
        email: "ava.parent@example.invalid",
        children: [{ id: "hd-ava" }],
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Phase6 Home Daycare",
      },
    });
    assert.equal(hdInvite.status, 200, hdInvite.text);
    assert.ok((hdInvite.json.household.children || []).some((c) => c.name === "Ava Home"), "invite overlays Profile name");
    const hdLogin = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "ava.parent@example.invalid", code: hdInvite.json.loginCode },
    });
    assert.equal(hdLogin.status, 200, hdLogin.text);
    const hdToken = hdLogin.json.sessionToken;
    const hdMe = await request(port, "GET", "/api/family-hub/me", { familyToken: hdToken });
    assert.equal(hdMe.status, 200, hdMe.text);
    assert.equal(hdMe.json.children.length, 1);
    assert.equal(hdMe.json.children[0].name, "Ava Home");
    assert.ok(hdMe.json.today);
    assert.ok((hdMe.json.shared?.photos || hdMe.json.today?.photos || []).length >= 1);
    const hdBlob = JSON.stringify(hdMe.json);
    assert.ok(!hdBlob.includes("SECRET_STAFF_NOTE"));
    assert.ok(!hdBlob.includes("Staff photo"));
    assert.ok((hdMe.json.documents || []).some((d) => d.id === "hd-doc-shared"));
    assert.ok(!(hdMe.json.documents || []).some((d) => d.id === "hd-doc-private"));
    pass("home_daycare_one_child_one_guardian");

    // Staff-only form cannot be acknowledged even if id is guessed
    const denyAck = await request(port, "POST", `/api/family-hub/documents/${encodeURIComponent("hd-doc-private")}/acknowledge`, {
      familyToken: hdToken,
      body: { signerName: "Parent" },
    });
    assert.equal(denyAck.status, 404, "staff-only doc must not acknowledge");
    const allowAck = await request(port, "POST", `/api/family-hub/documents/${encodeURIComponent("hd-doc-shared")}/acknowledge`, {
      familyToken: hdToken,
      body: { signerName: "Ava Parent" },
    });
    assert.equal(allowAck.status, 200, allowAck.text);
    assert.ok(["signed", "submitted"].includes(String(allowAck.json.document.status || "")), "ack sets submitted/signed lifecycle");
    pass("forms_share_ack_acl");

    // ——— Center: multi classroom, siblings, multi guardian, teacher owner resolve ———
    const centerSeed = await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "c-maya", name: "Maya Center", classroomId: "room-a", ageGroup: "Toddler" },
            { id: "c-noah", name: "Noah Center", classroomId: "room-b", ageGroup: "Preschool" },
            { id: "c-other", name: "Other Kid", classroomId: "room-a", ageGroup: "Infant" },
          ],
          Meals: [
            { id: "c-m1", childId: "c-maya", date: today, lunch: "Tacos", shareWithFamily: true },
            { id: "c-m2", childId: "c-noah", date: today, lunch: "Tacos", shareWithFamily: true },
            { id: "c-m3", childId: "c-other", date: today, lunch: "SECRET_OTHER_MEAL", shareWithFamily: true },
          ],
          Photos: [{ id: "c-p1", childId: "c-maya", caption: "Maya art", shareWithFamily: true }],
          Documents: [
            { id: "c-doc1", childId: "c-maya", title: "Enrollment", status: "notified", shareWithFamily: true },
          ],
          Communications: [
            { id: "c-bridge", childId: "c-maya", date: today, type: "Teacher Note", summary: "Bridged note for Maya", shareWithFamily: true },
          ],
        },
      },
    });
    assert.equal(centerSeed.status, 200, centerSeed.text);

    // Household A: siblings + two guardians
    const hhA = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Sibling Family",
        email: "sib.parent@example.invalid",
        guardianEmail: "sib.guardian@example.invalid",
        children: [{ id: "c-maya" }, { id: "c-noah" }],
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Phase6 Center",
      },
    });
    assert.equal(hhA.status, 200, hhA.text);
    assert.equal((hhA.json.household.children || []).length, 2);
    assert.ok(hhA.json.household.children.every((c) => c.name));

    // Household B: other child (isolation target)
    const hhB = await request(port, "POST", "/api/family-hub/households", {
      email: centerOwner,
      body: {
        label: "Other Family",
        email: "other.parent@example.invalid",
        children: [{ id: "c-other" }],
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Phase6 Center",
      },
    });
    assert.equal(hhB.status, 200, hhB.text);

    // Teacher can list households via owner resolution
    const teacherList = await request(port, "GET", "/api/family-hub/households", { email: teacher });
    assert.equal(teacherList.status, 200, teacherList.text);
    assert.ok((teacherList.json.households || []).length >= 2, "teacher resolves program owner households");
    assert.ok((teacherList.json.households || []).some((h) => (h.children || []).some((c) => c.name === "Maya Center")));
    pass("center_teacher_owner_resolution_names");

    const g1 = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "sib.parent@example.invalid", code: hhA.json.loginCode },
    });
    const g2 = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "sib.guardian@example.invalid", code: hhA.json.loginCode },
    });
    assert.equal(g1.status, 200, g1.text);
    assert.equal(g2.status, 200, g2.text);
    const tokenA = g1.json.sessionToken;
    const meA = await request(port, "GET", `/api/family-hub/me?childId=c-maya`, { familyToken: tokenA });
    assert.equal(meA.status, 200, meA.text);
    assert.equal(meA.json.children.length, 2);
    assert.ok(meA.json.children.map((c) => c.id).sort().join(",") === "c-maya,c-noah");
    const meABlob = JSON.stringify(meA.json);
    assert.ok(!meABlob.includes("SECRET_OTHER_MEAL"));
    assert.ok(!meABlob.includes("Other Kid") || meA.json.children.every((c) => c.id !== "c-other"));
    pass("siblings_multi_guardian");

    // Guardian connected to multiple children (same household) — switch child
    const meNoah = await request(port, "GET", `/api/family-hub/me?childId=c-noah`, { familyToken: tokenA });
    assert.equal(meNoah.status, 200, meNoah.text);
    assert.equal(meNoah.json.today?.childId, "c-noah");
    pass("guardian_multi_child_focus");

    // Messages: parent → provider notify + unread
    const msg = await request(port, "POST", "/api/family-hub/messages", {
      familyToken: tokenA,
      body: { body: "Pickup will be 10 minutes late." },
    });
    assert.equal(msg.status, 200, msg.text);
    const inbox = await request(port, "GET", "/api/family-hub/provider-inbox", { email: teacher });
    assert.equal(inbox.status, 200, inbox.text);
    assert.ok((inbox.json.unreadMessages || 0) >= 1 || (inbox.json.unread || 0) >= 1);
    const msgsGet = await request(port, "GET", "/api/family-hub/messages", { familyToken: tokenA });
    assert.equal(msgsGet.status, 200, msgsGet.text);
    assert.ok((msgsGet.json.messages || []).some((m) => /Pickup will be/i.test(m.body || "")));
    assert.ok((msgsGet.json.messages || []).some((m) => /Bridged note for Maya/i.test(m.body || m.summary || "")), "GET /messages merges bridged Communications");
    const providerMsg = await request(port, "POST", "/api/family-hub/provider-messages", {
      email: teacher,
      body: { householdId: hhA.json.household.id, body: "Thanks — see you at pickup." },
    });
    assert.equal(providerMsg.status, 200, providerMsg.text);
    const notifs = await request(port, "GET", "/api/family-hub/notifications", { familyToken: tokenA });
    assert.equal(notifs.status, 200, notifs.text);
    assert.ok((notifs.json.unread || 0) >= 1);
    pass("messaging_unread_provider_parent");

    // Isolation: household A cannot see / act on household B child or docs
    const tokenB = (await request(port, "POST", "/api/family-hub/login", {
      body: { email: "other.parent@example.invalid", code: hhB.json.loginCode },
    })).json.sessionToken;
    const meB = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenB });
    assert.equal(meB.json.children.length, 1);
    assert.equal(meB.json.children[0].id, "c-other");

    const crossMe = await request(port, "GET", `/api/family-hub/me?childId=c-other`, { familyToken: tokenA });
    assert.equal(crossMe.status, 200);
    // Server keeps session household; focus child outside membership must not expose other child's secret meal in shared feed for unauthorized child
    const crossBlob = JSON.stringify(crossMe.json);
    assert.ok(!crossBlob.includes("SECRET_OTHER_MEAL") || !(crossMe.json.children || []).some((c) => c.id === "c-other"));
    // Prefer: children list stays household A only
    assert.ok(!(crossMe.json.children || []).some((c) => c.id === "c-other"), "must not attach other household child via query");

    const crossAck = await request(port, "POST", `/api/family-hub/documents/${encodeURIComponent("c-doc1")}/acknowledge`, {
      familyToken: tokenB,
      body: { signerName: "Hacker" },
    });
    assert.equal(crossAck.status, 404, "other household cannot ack sibling family form");

    const crossReq = await request(port, "POST", "/api/family-hub/requests", {
      familyToken: tokenB,
      body: { type: "absence", childId: "c-maya", date: today, details: "Trying to absence another child" },
    });
    assert.equal(crossReq.status, 400, "cannot request for unauthorized child");
    pass("server_side_household_isolation");

    // Classroom change on Profile flows to Family Hub overlay
    const move = await request(port, "POST", "/api/child-data", {
      email: centerOwner,
      body: {
        data: {
          Profiles: [
            { id: "c-maya", name: "Maya Center", classroomId: "room-b", ageGroup: "Toddler" },
            { id: "c-noah", name: "Noah Center", classroomId: "room-b", ageGroup: "Preschool" },
            { id: "c-other", name: "Other Kid", classroomId: "room-a", ageGroup: "Infant" },
          ],
          Meals: [
            { id: "c-m1", childId: "c-maya", date: today, lunch: "Tacos", shareWithFamily: true },
            { id: "c-m2", childId: "c-noah", date: today, lunch: "Tacos", shareWithFamily: true },
            { id: "c-m3", childId: "c-other", date: today, lunch: "SECRET_OTHER_MEAL", shareWithFamily: true },
          ],
          Photos: [{ id: "c-p1", childId: "c-maya", caption: "Maya art", shareWithFamily: true }],
          Documents: [
            { id: "c-doc1", childId: "c-maya", title: "Enrollment", status: "notified", shareWithFamily: true },
          ],
          Communications: [
            { id: "c-bridge", childId: "c-maya", date: today, type: "Teacher Note", summary: "Bridged note for Maya", shareWithFamily: true },
          ],
        },
      },
    });
    assert.equal(move.status, 200, move.text);
    const afterMove = await request(port, "GET", "/api/family-hub/me?childId=c-maya", { familyToken: tokenA });
    assert.equal(afterMove.status, 200);
    const maya = (afterMove.json.children || []).find((c) => c.id === "c-maya");
    assert.equal(maya?.classroomId, "room-b");
    pass("classroom_change_flows_to_family_hub");

    // Revoke guardian / household access
    const revoke = await request(port, "DELETE", `/api/family-hub/households/${encodeURIComponent(hhA.json.household.id)}`, {
      email: centerOwner,
    });
    assert.equal(revoke.status, 200, revoke.text);
    const afterRevoke = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenA });
    assert.equal(afterRevoke.status, 401);
    const loginRevoked = await request(port, "POST", "/api/family-hub/login", {
      body: { email: "sib.parent@example.invalid", code: hhA.json.loginCode },
    });
    assert.ok([401, 404].includes(loginRevoked.status));
    pass("guardian_access_revoked");

    // Daily Ops → FH already covered via HD seed; confirm today has care sections
    const hdToday = await request(port, "GET", "/api/family-hub/today", { familyToken: hdToken });
    assert.equal(hdToday.status, 200, hdToday.text);
    assert.ok((hdToday.json.today?.meals || []).length >= 1);
    assert.ok((hdToday.json.today?.naps || []).length >= 1);
    assert.ok((hdToday.json.today?.diapers || []).length >= 1);
    assert.ok((hdToday.json.today?.activities || []).length >= 1);
    pass("daily_ops_to_family_hub_flow");

    // Household list still works for HD owner after center work
    const hdList = await request(port, "GET", "/api/family-hub/households", { email: hdOwner });
    assert.equal(hdList.status, 200);
    assert.ok((hdList.json.households || []).some((h) => (h.children || []).some((c) => c.name === "Ava Home")));
    pass("provider_household_list_overlay");
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

function mobileMarkers() {
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(stylesCss, /safe-area-inset/);
  assert.match(appJs, /family-hub-parent-mode/);
  assert.match(stylesCss, /\.fh-parent|\.fh-app-header|\.fh-today/);
  pass("mobile_markers_phase6");
}

async function main() {
  try { sourceMarkers(); } catch (error) { fail("source_markers_phase6", error); }
  try { visibilityUnit(); } catch (error) { fail("visibility_staff_vs_family", error); }
  try { mobileMarkers(); } catch (error) { fail("mobile_markers_phase6", error); }
  if (process.exitCode) return;
  try {
    await runtimePhase6();
  } catch (error) {
    fail("runtime_phase6", error);
  }
  if (!process.exitCode) {
    console.log("\nPhase 6 Family Hub completion suite: ALL PASSED");
  }
}

main();
