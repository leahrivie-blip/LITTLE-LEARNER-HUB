#!/usr/bin/env node
/**
 * Family Hub provider request inbox + director ACL (testing fence only).
 * Run: npm run test:family-hub-provider-inbox
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OWNER = "fh.inbox.owner@example.com";
const DIRECTOR = "fh.inbox.director@example.com";
const TEACHER = "fh.inbox.teacher@example.com";
const PARENT = "fh.inbox.parent@example.com";
const CHILD_ID = "child-inbox-mira";

function request(port, method, urlPath, { email = "", familyToken = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  if (familyToken) {
    headers.Authorization = `Bearer ${familyToken}`;
    headers["X-LLH-Family-Session"] = familyToken;
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

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, ["server/index.js"], {
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
}

async function waitForHealth(port, child, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch (_error) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server on ${port} did not become healthy`);
}

function account(email, role) {
  return {
    email,
    role,
    plan: "Pro",
    accountType: "center",
    subscriptionStatus: "active",
    programId: "prog-fh-inbox",
    linkedProgramOwnerEmail: role === "owner" ? "" : OWNER,
    programAccessViaOwner: role !== "owner",
  };
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(serverJs, /requireFamilyHubProviderManager/);
  assert.match(serverJs, /recentDecided/);
  assert.match(appJs, /data-fh-request-note/);
  assert.match(appJs, /recentDecided/);
  console.log("PASS  source markers");

  const port = 20410 + Math.floor(Math.random() * 80);
  const storePath = path.join(os.tmpdir(), `llh-fh-inbox-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [OWNER]: account(OWNER, "owner"),
      [DIRECTOR]: account(DIRECTOR, "director"),
      [TEACHER]: account(TEACHER, "teacher"),
    },
  }, null, 2));
  const server = spawnServer({ port, storePath });
  const today = new Date().toISOString().slice(0, 10);

  try {
    await waitForHealth(port, server);

    const seedChildren = await request(port, "POST", "/api/child-data", {
      email: OWNER,
      body: {
        data: {
          Profiles: [{
            id: CHILD_ID,
            name: "Mira Inbox",
            dob: "2022-06-01",
            ageGroup: "Toddler",
            parentInfo: PARENT,
          }],
        },
      },
    });
    assert.equal(seedChildren.status, 200, seedChildren.text);

    const invite = await request(port, "POST", "/api/family-hub/households", {
      email: OWNER,
      body: {
        email: PARENT,
        label: "Inbox Family",
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Inbox Daycare",
        children: [{ id: CHILD_ID, name: "Mira Inbox" }],
      },
    });
    assert.equal(invite.status, 200, invite.text);
    const loginCode = invite.json.loginCode;
    assert.ok(loginCode);

    const teacherDenied = await request(port, "GET", "/api/family-hub/provider-inbox", { email: TEACHER });
    assert.equal(teacherDenied.status, 403, teacherDenied.text);
    console.log("PASS  teacher cannot open provider inbox");

    const teacherApproveDenied = await request(port, "PATCH", "/api/family-hub/requests/does-not-exist", {
      email: TEACHER,
      body: { status: "approved" },
    });
    assert.equal(teacherApproveDenied.status, 403, teacherApproveDenied.text);
    console.log("PASS  teacher cannot approve requests");

    const login = await request(port, "POST", "/api/family-hub/login", {
      body: { email: PARENT, code: loginCode },
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.sessionToken;
    assert.ok(token);

    const absence = await request(port, "POST", "/api/family-hub/requests", {
      familyToken: token,
      body: {
        type: "absence",
        childId: CHILD_ID,
        childName: "Mira Inbox",
        date: today,
        details: "Morning dentist",
      },
    });
    assert.equal(absence.status, 200, absence.text);
    const requestId = absence.json?.request?.id || absence.json?.id;
    assert.ok(requestId, absence.text);

    const directorInbox = await request(port, "GET", "/api/family-hub/provider-inbox", { email: DIRECTOR });
    assert.equal(directorInbox.status, 200, directorInbox.text);
    assert.equal(directorInbox.json.programOwnerEmail, OWNER);
    assert.ok((directorInbox.json.pendingRequestCount || 0) >= 1);
    assert.ok(
      (directorInbox.json.pendingRequests || []).some((item) => item.id === requestId),
      "director sees pending request under owner households",
    );
    console.log("PASS  director inbox sees owner pending requests");

    const directorApprove = await request(port, "PATCH", `/api/family-hub/requests/${encodeURIComponent(requestId)}`, {
      email: DIRECTOR,
      body: { status: "approved", providerNote: "Thanks — marked on the attendance board." },
    });
    assert.equal(directorApprove.status, 200, directorApprove.text);
    assert.equal(directorApprove.json.request?.status, "approved");
    assert.equal(directorApprove.json.request?.reviewedBy, DIRECTOR);
    assert.match(String(directorApprove.json.request?.providerNote || ""), /attendance board/);
    console.log("PASS  director can approve with note");

    const inboxAfter = await request(port, "GET", "/api/family-hub/provider-inbox", { email: OWNER });
    assert.equal(inboxAfter.status, 200, inboxAfter.text);
    assert.ok(
      (inboxAfter.json.recentDecided || []).some((item) => item.id === requestId && item.status === "approved"),
      "recent decided includes approved request",
    );
    assert.ok(!(inboxAfter.json.pendingRequests || []).some((item) => item.id === requestId));
    console.log("PASS  owner inbox shows recent decided history");

    const parentMe = await request(port, "GET", "/api/family-hub/me", { familyToken: token });
    assert.equal(parentMe.status, 200, parentMe.text);
    const parentNtf = (parentMe.json.notifications || []).find((item) => (
      /approved|Request approved/i.test(`${item.title || ""} ${item.body || ""}`)
    ));
    assert.ok(parentNtf, "parent received approval notification");
    assert.match(String(parentNtf.body || ""), /attendance board|approved/i);
    console.log("PASS  parent notified on approve with note");

    const pickup = await request(port, "POST", "/api/family-hub/requests", {
      familyToken: token,
      body: {
        type: "pickup_change",
        childId: CHILD_ID,
        childName: "Mira Inbox",
        date: today,
        time: "16:00",
        details: "Neighbor will pick up",
      },
    });
    assert.equal(pickup.status, 200, pickup.text);
    const pickupId = pickup.json?.request?.id || pickup.json?.id;
    assert.ok(pickupId);

    const ownerDecline = await request(port, "PATCH", `/api/family-hub/requests/${encodeURIComponent(pickupId)}`, {
      email: OWNER,
      body: { status: "declined", providerNote: "Neighbor is not on the authorized list yet." },
    });
    assert.equal(ownerDecline.status, 200, ownerDecline.text);
    assert.equal(ownerDecline.json.request?.status, "declined");

    const parentMe2 = await request(port, "GET", "/api/family-hub/me", { familyToken: token });
    const declineNtf = (parentMe2.json.notifications || []).find((item) => (
      /declined/i.test(`${item.title || ""} ${item.body || ""}`)
    ));
    assert.ok(declineNtf, "parent received decline notification");
    console.log("PASS  owner can decline; parent notified");

    const houses = await request(port, "GET", "/api/family-hub/households", { email: DIRECTOR });
    assert.equal(houses.status, 200, houses.text);
    assert.equal(houses.json.programOwnerEmail, OWNER);
    assert.ok(Array.isArray(houses.json.households));
    console.log("PASS  director lists owner households");

    console.log("\nALL PASS  family-hub-provider-inbox");
  } finally {
    try { server.kill("SIGTERM"); } catch (_error) { /* ignore */ }
    try { fs.unlinkSync(storePath); } catch (_error) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
