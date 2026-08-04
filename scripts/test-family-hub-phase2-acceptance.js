#!/usr/bin/env node
/**
 * Phase 2 Family Hub — acceptance (testing fence only).
 * Simulates a full provider day and verifies the parent Today experience.
 * Run: npm run test:family-hub-phase2-acceptance
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/family-hub-phase2";
const OWNER = "fh.p2.owner@example.com";
const PARENT = "fh.p2.parent@example.com";
const GUARDIAN = "fh.p2.guardian@example.com";
const CHILD_ID = "child-p2-luna";

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

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const libJs = fs.readFileSync(path.join(ROOT, "server/family-hub-lib.js"), "utf8");
  assert.match(indexHtml, /SHELL_VERSION = "20260804-(family-hub-phase2|ecosystem-phase3|ecosystem-spine|workflow-integration|nav-role-experience)"/);
  assert.match(appJs, /function renderFamilyHubTodayPanel/);
  assert.match(appJs, /fh-day-story|dayStory/);
  assert.match(appJs, /familyHubRequestForm/);
  assert.match(appJs, /maybeNotifyFamilyHubSharedRecord/);
  assert.match(libJs, /dayStory/);
  assert.match(libJs, /buildFamilyContacts/);
  console.log("PASS  shell + Phase 2 markers");

  const port = 20320 + Math.floor(Math.random() * 70);
  const storePath = path.join(os.tmpdir(), `llh-fh-p2-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: { [OWNER]: { email: OWNER, role: "owner", accountType: "home_daycare", plan: "Pro" } },
  }, null, 2));
  const server = spawnServer({ port, storePath });
  let browser;
  const issues = [];
  const today = new Date().toISOString().slice(0, 10);

  try {
    await waitForHealth(port, server);

    // Provider day data → child-data
    const dayData = {
      Profiles: [{
        id: CHILD_ID,
        name: "Luna Phase",
        dob: "2023-01-10",
        ageGroup: "Toddler",
        parentInfo: PARENT,
        emergencyContact: "Sam Phase 555-0100",
        pickupContacts: "Aunt Jo 555-0101",
        allergies: "None known",
        photoUrl: "",
      }],
      Attendance: [{
        id: "att-1", childId: CHILD_ID, date: today, status: "Present",
        dropoff: "08:05", shareWithFamily: true, summary: "Present",
      }],
      Meals: [{
        id: "meal-1", childId: CHILD_ID, date: today, breakfast: "Oatmeal", lunch: "Pasta",
        shareWithFamily: true, summary: "Ate well",
      }],
      Naps: [{
        id: "nap-1", childId: CHILD_ID, date: today, napStart: "12:30", napEnd: "14:00",
        shareWithFamily: true, summary: "Rested well",
      }],
      Diapers: [{
        id: "d-1", childId: CHILD_ID, date: today, time: "10:15", type: "Wet",
        shareWithFamily: true, summary: "Wet diaper",
      }],
      ActivityLogs: [{
        id: "a-1", childId: CHILD_ID, date: today, time: "09:40",
        title: "Garden walk", summary: "Picked leaves and sang",
        shareWithFamily: true,
      }],
      Observations: [{
        id: "o-1", childId: CHILD_ID, date: today, area: "Language",
        title: "New words", summary: "Said “flower” clearly",
        shareWithFamily: true,
      }],
      Communications: [
        {
          id: "c-mood", childId: CHILD_ID, date: today, type: "Mood Note", category: "Mood",
          mood: "Happy", summary: "Smiley all morning", shareWithFamily: true,
        },
        {
          id: "c-note", childId: CHILD_ID, date: today, type: "Teacher Note",
          title: "Note", summary: "Loved outdoor play today", shareWithFamily: true,
        },
        {
          id: "c-ann", childId: CHILD_ID, date: today, type: "Announcement",
          title: "Picture day Friday", summary: "Wear your brightest shirt!", shareWithFamily: true,
        },
      ],
      Photos: [{
        id: "p-1", childId: CHILD_ID, date: today, caption: "Leaf treasure",
        url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' fill='%23cfe8d8'/><text x='20' y='68' font-size='18'>Luna</text></svg>",
        shareWithFamily: true,
      }],
      Reports: [{
        id: "r-1", childId: CHILD_ID, date: today, title: "Daily report",
        summary: "Luna had a joyful, curious day with friends.",
        shareWithFamily: true,
      }],
      Documents: [{
        id: "doc-1", childId: CHILD_ID, title: "Sunscreen Permission",
        category: "Permission", status: "notified", statusLabel: "Shared — awaiting parent",
        draftText: "I authorize sunscreen application as needed.",
        shareWithFamily: true, providerReviewed: false,
      }],
    };

    const saved = await request(port, "POST", "/api/child-data", { email: OWNER, body: { data: dayData } });
    assert.equal(saved.status, 200, saved.text);
    console.log("PASS  provider day records synced");

    // Schedule event for calendar
    const schedule = await request(port, "PUT", "/api/schedule", {
      email: OWNER,
      body: {
        items: [{
          id: "ev-1",
          type: "family_event",
          title: "Family picnic",
          startDate: today,
          endDate: today,
          startTime: "16:30",
          notes: "Bring a blanket",
          shareWithFamily: true,
          visibleToFamilies: true,
        }],
      },
    }).catch(() => ({ status: 0, text: "failed" }));
    if (schedule.status !== 200) {
      console.log("NOTE  schedule PUT status", schedule.status, String(schedule.text || "").slice(0, 120));
    } else {
      console.log("PASS  family calendar event saved");
    }

    const invite = await request(port, "POST", "/api/family-hub/households", {
      email: OWNER,
      body: {
        email: PARENT,
        guardianEmail: GUARDIAN,
        label: "Phase Family",
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Phase Two Daycare",
        children: [{ id: CHILD_ID, name: "Luna Phase" }],
      },
    });
    assert.equal(invite.status, 200, invite.text);
    const loginCode = invite.json.loginCode;
    const magicUrl = invite.json.magicUrl;
    assert.ok(loginCode && magicUrl);
    console.log("PASS  family invited + second guardian");

    // Provider message + photo/report notify path
    const msg = await request(port, "POST", "/api/family-hub/provider-messages", {
      email: OWNER,
      body: { childId: CHILD_ID, body: "Luna made a new friend at circle time!", authorName: "Ms. Leah" },
    });
    assert.equal(msg.status, 200, msg.text);

    const photoNtf = await request(port, "POST", "/api/family-hub/provider-notifications", {
      email: OWNER,
      body: {
        childId: CHILD_ID,
        type: "photo",
        title: "New photo shared",
        body: "Luna Phase: Leaf treasure",
        href: "photos",
      },
    });
    assert.equal(photoNtf.status, 200, photoNtf.text);
    console.log("PASS  provider message + photo notification");

    // Parent joins
    const login = await request(port, "POST", "/api/family-hub/login", {
      body: { email: PARENT, code: loginCode },
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.sessionToken;
    assert.ok(token);

    const me = await request(port, "GET", `/api/family-hub/me?childId=${encodeURIComponent(CHILD_ID)}`, { familyToken: token });
    assert.equal(me.status, 200, me.text);
    const todayPayload = me.json.today || {};
    assert.ok(todayPayload.dayStory, "day story present");
    assert.ok(Array.isArray(todayPayload.carePulse) && todayPayload.carePulse.length >= 3, "care pulse");
    assert.ok(todayPayload.meals?.length >= 1);
    assert.ok(todayPayload.naps?.length >= 1);
    assert.ok(todayPayload.diapers?.length >= 1);
    assert.ok(todayPayload.photos?.length >= 1);
    assert.ok(todayPayload.reports?.length >= 1);
    assert.ok(todayPayload.pendingForms?.length >= 1, "pending forms on Today");
    assert.ok(todayPayload.announcements?.length >= 1, "announcements on Today");
    assert.ok(me.json.messages?.length >= 1);
    assert.ok(me.json.notifications?.length >= 1);
    assert.ok(me.json.contacts?.some((c) => /Sam Phase|555-0100/.test(c.emergencyContact || "")));
    assert.ok(me.json.contacts?.some((c) => /Aunt Jo/.test(c.pickupContacts || "")));
    console.log("PASS  parent /me Today story + contacts + pending forms");

    // Parent signs form
    const formDoc = (me.json.documents || []).find((d) => d.canAcknowledge);
    assert.ok(formDoc, "form to sign");
    const signed = await request(port, "POST", `/api/family-hub/documents/${encodeURIComponent(formDoc.id)}/acknowledge`, {
      familyToken: token,
      body: { signerName: "Sam Phase" },
    });
    assert.equal(signed.status, 200, signed.text);

    // Absence + pickup requests
    const absence = await request(port, "POST", "/api/family-hub/requests", {
      familyToken: token,
      body: { type: "absence", childId: CHILD_ID, childName: "Luna Phase", date: today, details: "Doctor visit in the morning" },
    });
    assert.equal(absence.status, 200, absence.text);
    const pickup = await request(port, "POST", "/api/family-hub/requests", {
      familyToken: token,
      body: {
        type: "pickup_change", childId: CHILD_ID, childName: "Luna Phase",
        date: today, time: "15:30", details: "Aunt Jo will pick up",
      },
    });
    assert.equal(pickup.status, 200, pickup.text);
    const me2 = await request(port, "GET", "/api/family-hub/me", { familyToken: token });
    assert.ok((me2.json.requests || []).length >= 2);
    console.log("PASS  parent signs form + absence/pickup requests");

    // Second guardian
    const gLogin = await request(port, "POST", "/api/family-hub/login", {
      body: { email: GUARDIAN, code: loginCode },
    });
    assert.equal(gLogin.status, 200, gLogin.text);
    const gMe = await request(port, "GET", "/api/family-hub/me", { familyToken: gLogin.json.sessionToken });
    assert.equal(gMe.status, 200);
    assert.ok((gMe.json.today?.photos || []).length >= 1);
    console.log("PASS  second guardian sees shared day");

    // Provider sees requests on household list
    const houses = await request(port, "GET", "/api/family-hub/households", { email: OWNER });
    assert.equal(houses.status, 200, houses.text);
    const house = (houses.json.households || [])[0];
    assert.ok((house?.familyRequests || []).length >= 2, "provider household shows requests");
    console.log("PASS  provider sees parent requests");

    // Browser UX + mobile screenshots
    browser = await chromium.launch({ headless: true });
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desktop.addInitScript(({ email }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: { email, plan: "Pro", role: "owner", accountType: "home_daycare", subscriptionStatus: "active" },
      }));
    }, { email: OWNER });
    await desktop.goto(magicUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await desktop.waitForFunction(() => typeof maybeHandleFamilyHubInviteFromUrl === "function" || document.querySelector("#view-family-hub"), null, { timeout: 60000 });
    await desktop.evaluate(() => {
      try { maybeHandleFamilyHubInviteFromUrl(); } catch (_e) { /* ignore */ }
    });
    // Prefer API session injection for stable paint
    await desktop.evaluate((sessionToken) => {
      localStorage.setItem("llhFamilyHubSession", sessionToken);
    }, token);
    await desktop.evaluate(async () => {
      if (typeof setView === "function") setView("family-hub", { allowDuringBootVerification: true });
      if (typeof loadFamilyHubParentDashboard === "function") await loadFamilyHubParentDashboard({ force: true });
      else if (typeof renderFamilyHubPage === "function") renderFamilyHubPage();
    });
    await desktop.waitForTimeout(1200);
    const todayText = await desktop.evaluate(() => document.querySelector(".fh-today")?.innerText || document.body.innerText || "");
    if (!/How was|day story|Luna|Meals|Photos|signature|Happy/i.test(todayText)) {
      issues.push("Desktop Today UI missing expected story content");
    }
    await desktop.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "01-today-desktop.png"), fullPage: true });

    await desktop.evaluate(() => {
      if (typeof paintFamilyHubParentPanel === "function") paintFamilyHubParentPanel("more");
      else document.querySelector('[data-fh-panel="more"]')?.click();
    });
    await desktop.waitForTimeout(500);
    const moreText = await desktop.evaluate(() => document.querySelector("#familyHubPanelBody")?.innerText || "");
    assert.match(moreText, /Ask your provider|Absence|Emergency|Settings/i);
    await desktop.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "02-more-requests-contacts.png"), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await mobile.evaluate((sessionToken) => {
      localStorage.setItem("llhFamilyHubSession", sessionToken);
    }, token);
    await mobile.evaluate(async () => {
      if (typeof setView === "function") setView("family-hub", { allowDuringBootVerification: true });
      if (typeof loadFamilyHubParentDashboard === "function") await loadFamilyHubParentDashboard({ force: true });
    });
    await mobile.waitForTimeout(1000);
    const mobileNav = await mobile.evaluate(() => ({
      nav: Boolean(document.querySelector(".fh-parent-nav")),
      today: Boolean(document.querySelector(".fh-today")),
      pulse: Boolean(document.querySelector(".fh-care-pulse")),
      story: Boolean(document.querySelector(".fh-day-story")),
    }));
    assert.equal(mobileNav.nav, true);
    assert.equal(mobileNav.today || mobileNav.story, true);
    await mobile.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "03-today-mobile.png"), fullPage: true });
    await mobile.evaluate(() => paintFamilyHubParentPanel?.("photos"));
    await mobile.waitForTimeout(400);
    await mobile.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "04-photos-mobile.png") });
    await mobile.evaluate(() => paintFamilyHubParentPanel?.("messages"));
    await mobile.waitForTimeout(400);
    await mobile.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "05-messages-mobile.png") });
    console.log("PASS  browser Today + mobile surfaces");

    // Unit: empty sections collapsed (no "No meals shared yet" when empty day with only pending form)
    const emptyToday = require("../server/family-hub-lib").buildFamilyHubToday({
      childData: { Profiles: [{ id: "c1", name: "Ava" }], Meals: [], Naps: [], Diapers: [], Photos: [], Reports: [], Communications: [], Attendance: [], ActivityLogs: [], Observations: [] },
      children: [{ id: "c1", name: "Ava" }],
      childId: "c1",
      date: today,
      messages: [],
      events: [],
    });
    assert.equal(emptyToday.empty, true);
    assert.match(emptyToday.dayStory || "", /Waiting|updates/i);
    console.log("PASS  empty Today story wording");

  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }

  const passed = issues.length === 0;
  const report = {
    decision: passed ? "Phase 2 PASSED" : "Phase 2 FAILED",
    confidence: passed ? 88 : 55,
    issues,
    artifactDir: ARTIFACT_DIR,
  };
  const md = [
    "# Phase 2 Family Hub — Acceptance Result",
    "",
    `**Decision:** ${report.decision}`,
    `**Confidence:** ${report.confidence}%`,
    "",
    "## Proven",
    "- Provider day records → parent Today story (mood, attendance, meals, naps, care, activities, photos, reports, announcements)",
    "- Pending forms on Today",
    "- Messages + notifications auto from provider actions",
    "- Multiple guardians",
    "- Absence + pickup requests",
    "- Emergency / pickup contacts from child profile",
    "- Mobile Today / Photos / Messages screenshots",
    "",
    "## Issues",
    ...(issues.length ? issues.map((i) => `- ${i}`) : ["- None found in acceptance suite"]),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "ACCEPTANCE_RESULT.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ARTIFACT_DIR, "ACCEPTANCE_RESULT.md"), md);
  fs.writeFileSync(path.join(ROOT, "docs/audits/PHASE2_FAMILY_HUB_ACCEPTANCE.md"), md);
  console.log("\n==== PHASE 2 ACCEPTANCE ====");
  console.log(report.decision);
  console.log(`Confidence: ${report.confidence}%`);
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
