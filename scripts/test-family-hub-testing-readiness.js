#!/usr/bin/env node
/**
 * Family Hub testing-readiness + parent beta MVP suite (testing fence only).
 * Covers: durable storage gate, invite lifecycle, guardians, Today feed,
 * messages, calendar, settings, logout, production fence.
 * Run: npm run test:family-hub-testing-readiness
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const familyHubLib = require("../server/family-hub-lib");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function request(port, method, urlPath, { email = "", body = null, familyToken = "" } = {}) {
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

function spawnServer({ port, storePath, hubTesting, allowEphemeral = true, databaseProvider = "local-json" }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: databaseProvider,
      HOME_DAYCARE_HUB_TESTING: hubTesting ? "true" : "false",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: allowEphemeral ? "true" : "false",
      NODE_ENV: "test",
      ALLOW_EMAIL_SCHEDULE_AUTH: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child, attempts = 50) {
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

test("shell markers for Family Hub parent beta UX", () => {
  assert.match(indexHtml, /SHELL_VERSION = "20260804-(forms-phase1[bc]?|family-hub-phase2|ecosystem-phase3|ecosystem-spine)"/);
  assert.match(indexHtml, /llhPendingUrlSecrets/);
  assert.match(indexHtml, /referrer" content="strict-origin-when-cross-origin"/);
  assert.match(appJs, /function loadFamilyHubParentDashboard/);
  assert.match(appJs, /function renderFamilyHubTodayPanel/);
  assert.match(appJs, /family-hub-parent-mode/);
  assert.match(appJs, /data-family-hub-seed-demo/);
  assert.match(appJs, /ensureFamilyHubParentAppReady/);
  assert.match(appJs, /signOutFamilyHubParent/);
  assert.match(appJs, /acknowledgeFamilyHubDocument/);
  assert.match(appJs, /redactSensitiveUrl/);
  assert.match(appJs, /adminAccessOverridesMemberPlan/);
  assert.match(appJs, /membershipDisplayStatus/);
  assert.match(appJs, /hdhTesterPersonaStorageKey/);
  assert.match(appJs, /AbortController/);
  assert.match(appJs, /allowParentLeaveFamilyHub/);
  assert.doesNotMatch(appJs, /Family Hub testing preview/);
  assert.match(stylesCss, /\.family-hub-parent-mode/);
  assert.match(stylesCss, /\.fh-today-hero/);
  assert.match(serverJs, /persistFamilyHubStore/);
  assert.match(serverJs, /redactSensitiveAnalyticsUrl/);
  assert.match(serverJs, /handleFamilyHubDocumentAcknowledge/);
  assert.match(serverJs, /Referrer-Policy/);
  assert.match(serverJs, /\/api\/family-hub\/seed-demo/);
  assert.match(serverJs, /\/api\/family-hub\/storage/);
  assert.match(serverJs, /\/api\/family-hub\/today/);
  assert.match(serverJs, /\/api\/family-hub\/messages/);
  assert.match(serverJs, /\/api\/family-hub\/calendar/);
  assert.match(serverJs, /\/api\/family-hub\/logout/);
  assert.match(serverJs, /\/api\/family-hub\/provider-notifications/);
  assert.match(serverJs, /handleFamilyHubHouseholdChildrenPatch/);
  assert.match(serverJs, /GROUNDED FACTS \(authoritative/);
  assert.match(appJs, /function maybeLinkChildToFamilyHubHouseholds/);
  assert.match(appJs, /function shareChildDocumentWithFamily/);
  assert.match(appJs, /function classroomOptionsHtml/);
  assert.match(appJs, /function staffAssignedClassroomIds/);
  assert.match(appJs, /function saveAiFormAsProgramTemplate/);
  assert.match(appJs, /function assignAndNotifyForm/);
  assert.match(appJs, /function formsAttentionDocuments/);
  assert.match(appJs, /function printChildDocumentRecord/);
  assert.match(appJs, /function markChildDocumentReviewed/);
  assert.match(serverJs, /"form"/);
  assert.match(serverJs, /AI_VALID_TOOLS/);
  const familyHubLibSource = fs.readFileSync(path.join(ROOT, "server", "family-hub-lib.js"), "utf8");
  assert.match(familyHubLibSource, /shareWithFamily === true/);
  assert.match(familyHubLibSource, /requested/);
  assert.doesNotMatch(appJs, /badge-coming-soon/);
  assert.doesNotMatch(indexHtml, /Daily operations <span class="llh-status-pill">In Development<\/span>/);
});

test("family-hub-lib storage + today + calendar helpers", () => {
  const ephemeral = familyHubLib.familyHubStorageStatus({
    databaseProvider: "postgres",
    databaseReady: false,
    usePostgres: true,
    storePath: "/tmp/llh-testing-store.json",
    allowEphemeral: false,
  });
  assert.equal(ephemeral.durable, false);
  assert.match(ephemeral.reason, /memory only|PRODUCTION_DATABASE_URL|not ready/i);

  const localOk = familyHubLib.familyHubStorageStatus({
    databaseProvider: "local-json",
    databaseReady: false,
    usePostgres: false,
    storePath: path.join(ROOT, "server/data/launch-store.json"),
    allowEphemeral: false,
  });
  assert.equal(localOk.durable, true);

  const feed = familyHubLib.buildSharedFamilyFeed({
    Reports: [{ id: "r1", childId: "c1", title: "Daily", summary: "Nap", shareWithFamily: true }],
    Photos: [{ id: "p1", childId: "c1", caption: "Art", shareWithFamily: true }],
    Observations: [{ id: "o1", childId: "c2", summary: "Other", shareWithFamily: true }],
    Meals: [{ id: "m1", childId: "c1", lunch: "Ate all", shareWithFamily: true }],
  }, ["c1"]);
  assert.equal(feed.reports.length, 1);
  assert.equal(feed.photos.length, 1);
  assert.equal(feed.observations.length, 0);
  assert.equal(feed.meals.length, 1);

  const day = familyHubLib.todayIso();
  const today = familyHubLib.buildFamilyHubToday({
    childData: {
      Meals: [{ id: "m1", childId: "c1", date: day, lunch: "Pasta", shareWithFamily: true }],
      Communications: [{ id: "mood1", childId: "c1", date: day, type: "Mood Note", mood: "Happy", shareWithFamily: true }],
      Naps: [],
      Diapers: [],
      ActivityLogs: [],
      Photos: [],
      Reports: [],
    },
    children: [{ id: "c1", name: "Ava" }],
    childId: "c1",
    date: day,
    messages: [{ id: "msg1", from: "provider", body: "Hi", authorName: "Leah", readByParent: false, createdAt: new Date().toISOString() }],
    events: [{ id: "e1", title: "Picnic", startDate: day }],
  });
  assert.equal(today.mood.value, "Happy");
  assert.ok(today.meals.length >= 1);
  assert.equal(today.messages.length, 1);
  assert.equal(today.upcomingEvents.length, 1);

  const calendar = familyHubLib.buildFamilyHubCalendar({
    items: [
      { id: "e1", type: "family_event", title: "Picnic", startDate: day, endDate: day },
      { id: "e2", type: "lesson_plan", title: "Hidden", startDate: day, endDate: day },
    ],
  }, { fromDate: day, days: 7 });
  assert.equal(calendar.length, 1);

  const guardians = familyHubLib.normalizeGuardianEmails("a@example.com", ["b@example.com", "a@example.com"]);
  assert.deepEqual(guardians, ["a@example.com", "b@example.com"]);

  assert.equal(familyHubLib.documentNeedsParentAction("needed"), true);
  assert.equal(familyHubLib.documentNeedsParentAction("requested"), true);
  assert.equal(familyHubLib.documentNeedsParentAction("received"), true);
  assert.equal(familyHubLib.documentNeedsParentAction("notified"), true);
  assert.equal(familyHubLib.documentNeedsParentAction("signed"), false);
  const liveShared = familyHubLib.liveDocumentsForChildren({
    Documents: [
      { id: "d1", childId: "c1", title: "Shared", shareWithFamily: true, status: "notified" },
      { id: "d2", childId: "c1", title: "Private", shareWithFamily: false, status: "needed" },
    ],
  }, ["c1"]);
  assert.equal(liveShared.length, 1);
  assert.equal(liveShared[0].id, "d1");
  assert.ok(liveShared[0].canAcknowledge);

  const seed = familyHubLib.buildFamilyHubDemoSeed({ now: new Date("2026-08-03T15:00:00Z") });
  assert.equal(seed.household.programName, "Sunshine Home Daycare");
  assert.equal(seed.household.label, "Rivera Family");
  assert.ok(seed.children.every((child) => /Rivera$/i.test(child.name || "")));
  assert.ok(seed.childData.Photos.every((photo) => String(photo.url || "").startsWith("data:image/svg+xml")));
  assert.ok(seed.childData.Profiles.every((profile) => String(profile.photoUrl || "").startsWith("data:image/svg+xml")));
  const napToday = familyHubLib.buildFamilyHubToday({
    childData: seed.childData,
    children: seed.children,
    childId: seed.children[0].id,
    date: familyHubLib.todayIso(new Date("2026-08-03T15:00:00Z")),
    messages: seed.messages,
    events: seed.scheduleItems,
    now: new Date("2026-08-03T15:00:00Z"),
  });
  assert.ok(String(napToday.naps[0]?.detail || "").includes("12:30"));
  assert.ok(napToday.messages.length >= 1);
  assert.ok(napToday.photos.length >= 1);
});

async function main() {
  if (process.exitCode) return;

  const offPort = 20210 + Math.floor(Math.random() * 40);
  const onPort = offPort + 1;
  const offStore = path.join(os.tmpdir(), `llh-fh-ready-off-${crypto.randomBytes(4).toString("hex")}.json`);
  const onStore = path.join(os.tmpdir(), `llh-fh-ready-on-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(offStore, JSON.stringify({ users: { "owner@example.com": { email: "owner@example.com", role: "owner" } } }, null, 2));
  fs.writeFileSync(onStore, JSON.stringify({
    users: {
      "owner@example.com": { email: "owner@example.com", role: "owner", accountType: "home_daycare" },
    },
  }, null, 2));

  const offChild = spawnServer({ port: offPort, storePath: offStore, hubTesting: false });
  const onChild = spawnServer({ port: onPort, storePath: onStore, hubTesting: true, allowEphemeral: true });

  try {
    await waitForHealth(offPort, offChild);
    const blocked = await request(offPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: { email: "parent@example.com", children: [{ id: "c1", name: "Ava" }] },
    });
    assert.equal(blocked.status, 404, "Family Hub must stay testing-fenced");

    const health = await waitForHealth(onPort, onChild);
    assert.equal(health.homeDaycareHubTesting, true);
    assert.ok(health.homeDaycareHub?.features?.includes("family-hub"));

    const storage = await request(onPort, "GET", "/api/family-hub/storage");
    assert.equal(storage.status, 200, storage.text);
    assert.equal(storage.json.storage.durable, true);

    // Seed demo
    const seeded = await request(onPort, "POST", "/api/family-hub/seed-demo", {
      email: "owner@example.com",
      body: { appOrigin: `http://127.0.0.1:${onPort}`, programName: "Ready Daycare" },
    });
    assert.equal(seeded.status, 200, seeded.text);
    assert.ok(seeded.json.demo?.magicUrl);
    assert.ok(seeded.json.demo?.loginCode);
    assert.equal(seeded.json.demo?.parentEmail, "familyhub.demo.parent@llh.test");
    assert.equal(seeded.json.demo?.guardianEmail, "familyhub.demo.guardian@llh.test");
    assert.equal(seeded.json.demo?.children?.length, 2);
    assert.ok(seeded.json.demo?.messageCount >= 1);
    assert.ok(seeded.json.demo?.eventCount >= 1);
    assert.ok((seeded.json.demo?.children || []).some((child) => /Rivera/i.test(child.name || "")));
    assert.equal(seeded.json.demo?.household?.programName, "Ready Daycare");
    assert.ok((seeded.json.demo?.messageCount || 0) >= 2);

    const token = String(seeded.json.demo.magicUrl).split("familyHub=")[1];
    const peek = await request(onPort, "GET", `/api/family-hub/invites/peek?token=${encodeURIComponent(token)}`);
    assert.equal(peek.status, 200);
    assert.equal(peek.json.invite.children.length, 2);

    // Header-based peek (preferred — keeps tokens out of access-log query strings).
    const peekHeader = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port: onPort,
        path: "/api/family-hub/invites/peek",
        method: "GET",
        headers: { Accept: "application/json", "X-LLH-Invite-Token": token },
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
      req.end();
    });
    assert.equal(peekHeader.status, 200, peekHeader.text);
    assert.equal(peekHeader.json.invite.children.length, 2);

    const redeemed = await request(onPort, "POST", "/api/family-hub/invites/redeem", { body: { token } });
    assert.equal(redeemed.status, 200, redeemed.text);
    const sessionToken = redeemed.json.sessionToken;
    const me = await request(onPort, "GET", "/api/family-hub/me", { familyToken: sessionToken });
    assert.equal(me.status, 200, me.text);
    assert.equal(me.json.children.length, 2);
    assert.ok(me.json.shared?.reports?.length >= 1, "shared reports should appear");
    assert.ok(me.json.shared?.photos?.length >= 1, "shared photos should appear");
    assert.ok(me.json.today?.mood, "today mood should appear");
    assert.ok(me.json.today?.meals?.length >= 1, "today meals should appear");
    assert.ok(me.json.today?.naps?.length >= 1, "today naps should appear");
    assert.ok(me.json.messages?.length >= 1, "messages should appear");
    assert.ok(me.json.calendar?.length >= 1, "calendar events should appear");
    assert.ok(me.json.documents?.length >= 1, "documents should appear");
    assert.ok(me.json.settings, "settings should appear");
    assert.ok(!me.json.comingSoon, "beta required features must not be Coming Soon");

    const neededDoc = (me.json.documents || []).find((doc) => doc.canAcknowledge || /needed|action needed/i.test(doc.statusLabel || doc.status || ""));
    assert.ok(neededDoc, "demo should include a form that needs parent action");
    const signed = await request(onPort, "POST", `/api/family-hub/documents/${encodeURIComponent(neededDoc.id)}/acknowledge`, {
      familyToken: sessionToken,
      body: { signerName: "Sam Rivera" },
    });
    assert.equal(signed.status, 200, signed.text);
    assert.equal(signed.json.document.status, "signed");
    assert.match(String(signed.json.document.statusLabel || ""), /signed/i);
    const meAfterSign = await request(onPort, "GET", "/api/family-hub/me", { familyToken: sessionToken });
    assert.equal(meAfterSign.status, 200, meAfterSign.text);
    const signedDoc = (meAfterSign.json.documents || []).find((doc) => doc.id === neededDoc.id);
    assert.ok(signedDoc, "signed form remains on household");
    assert.equal(signedDoc.status, "signed");
    assert.ok(signedDoc.signedAt);

    const today = await request(onPort, "GET", "/api/family-hub/today", { familyToken: sessionToken });
    assert.equal(today.status, 200, today.text);
    assert.ok(today.json.today?.greeting);

    const messagePost = await request(onPort, "POST", "/api/family-hub/messages", {
      familyToken: sessionToken,
      body: { body: "Thanks for the update today!" },
    });
    assert.equal(messagePost.status, 200, messagePost.text);
    assert.ok(messagePost.json.messages.some((msg) => msg.from === "parent"));

    const settingsPatch = await request(onPort, "PATCH", "/api/family-hub/settings", {
      familyToken: sessionToken,
      body: { preferredName: "Sam", notifyPhotos: false },
    });
    assert.equal(settingsPatch.status, 200, settingsPatch.text);
    assert.equal(settingsPatch.json.settings.preferredName, "Sam");
    assert.equal(settingsPatch.json.settings.notifyPhotos, false);

    const notifRead = await request(onPort, "POST", "/api/family-hub/notifications/read", {
      familyToken: sessionToken,
      body: { all: true, messages: true },
    });
    assert.equal(notifRead.status, 200, notifRead.text);
    assert.equal(notifRead.json.unread, 0);

    // Second guardian login
    const guardianLogin = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: seeded.json.demo.guardianEmail, code: seeded.json.demo.loginCode },
    });
    assert.equal(guardianLogin.status, 200, guardianLogin.text);

    // Parent login
    const parentLogin = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: seeded.json.demo.parentEmail, code: seeded.json.demo.loginCode },
    });
    assert.equal(parentLogin.status, 200, parentLogin.text);

    // Logout clears session
    const logout = await request(onPort, "POST", "/api/family-hub/logout", { familyToken: parentLogin.json.sessionToken });
    assert.equal(logout.status, 200, logout.text);
    const afterLogout = await request(onPort, "GET", "/api/family-hub/me", { familyToken: parentLogin.json.sessionToken });
    assert.equal(afterLogout.status, 401);

    // Invalid invite
    const badPeek = await request(onPort, "GET", "/api/family-hub/invites/peek?token=not-a-real-token");
    assert.equal(badPeek.status, 404);

    // Duplicate invite replaces prior active invite for same email
    const first = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "Dup Family",
        email: "dup.parent@example.com",
        guardianEmail: "dup.guardian@example.com",
        children: [{ id: "dup-child", name: "Dup Child" }],
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(first.status, 200, first.text);
    const second = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "Dup Family 2",
        email: "dup.parent@example.com",
        children: [{ id: "dup-child", name: "Dup Child" }],
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(second.status, 200, second.text);
    assert.ok(second.json.replacedDuplicates >= 1);

    // Link an additional child onto an active household + notify parent
    const linkChild = await request(onPort, "PATCH", `/api/family-hub/households/${encodeURIComponent(second.json.household.id)}/children`, {
      email: "owner@example.com",
      body: {
        children: [
          { id: "dup-child", name: "Dup Child" },
          { id: "dup-sibling", name: "Dup Sibling" },
        ],
      },
    });
    assert.equal(linkChild.status, 200, linkChild.text);
    assert.equal(linkChild.json.household.children.length, 2);
    assert.ok(linkChild.json.household.childIds.includes("dup-sibling"));

    const notify = await request(onPort, "POST", "/api/family-hub/provider-notifications", {
      email: "owner@example.com",
      body: {
        childId: "dup-child",
        type: "form",
        title: "New form to review",
        body: "Enrollment form is ready in Family Hub Forms.",
        href: "forms",
      },
    });
    assert.equal(notify.status, 200, notify.text);
    assert.ok(notify.json.notified >= 1);

    // Revoke then reject redeem/login
    const householdId = second.json.household.id;
    const revoke = await request(onPort, "DELETE", `/api/family-hub/households/${encodeURIComponent(householdId)}`, {
      email: "owner@example.com",
    });
    assert.equal(revoke.status, 200, revoke.text);
    const revokedToken = String(second.json.magicUrl).split("familyHub=")[1];
    const revokedRedeem = await request(onPort, "POST", "/api/family-hub/invites/redeem", { body: { token: revokedToken } });
    assert.equal(revokedRedeem.status, 404);
    const revokedLogin = await request(onPort, "POST", "/api/family-hub/login", {
      body: { email: "dup.parent@example.com", code: second.json.loginCode },
    });
    assert.equal(revokedLogin.status, 404);

    // Expired invite
    const expiredCreate = await request(onPort, "POST", "/api/family-hub/households", {
      email: "owner@example.com",
      body: {
        label: "Expired Family",
        email: "expired.parent@example.com",
        children: [{ id: "exp-child", name: "Exp Child" }],
        appOrigin: `http://127.0.0.1:${onPort}`,
      },
    });
    assert.equal(expiredCreate.status, 200, expiredCreate.text);
    const store = JSON.parse(fs.readFileSync(onStore, "utf8"));
    const expHousehold = store.familyHouseholds[expiredCreate.json.household.id];
    expHousehold.expiresAt = new Date(Date.now() - 1000).toISOString();
    store.familyHouseholds[expHousehold.id] = expHousehold;
    const expToken = String(expiredCreate.json.magicUrl).split("familyHub=")[1];
    if (store.familyMagicLinks[expToken]) {
      store.familyMagicLinks[expToken].expiresAt = expHousehold.expiresAt;
    }
    fs.writeFileSync(onStore, JSON.stringify(store, null, 2));
    await new Promise((r) => setTimeout(r, 50));
    const expiredPeek = await request(onPort, "GET", `/api/family-hub/invites/peek?token=${encodeURIComponent(expToken)}`);
    assert.equal(expiredPeek.status, 410, expiredPeek.text);

    console.log("PASS  Family Hub beta runtime: fence, seed, today, messages, settings, logout, guardians, revoke, expire");
  } catch (error) {
    console.error("FAIL  Family Hub readiness runtime");
    console.error(error);
    process.exitCode = 1;
  } finally {
    offChild.kill("SIGTERM");
    onChild.kill("SIGTERM");
    try { fs.unlinkSync(offStore); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(onStore); } catch (_e) { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll Family Hub testing-readiness checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
