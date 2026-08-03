#!/usr/bin/env node
/**
 * Home Daycare Hub A–G browser walkthrough (testing-only).
 * Covers: fence off/on, hub shell, forms pack, AI draft→save, Family Hub parent view,
 * staff visibility, CPR training tracker, enrollment packets.
 * Run: npm run test:home-daycare-hub-walkthrough
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
const SHELL = "20260803-family-hub-polish3";
const OWNER = "hdh.walkthrough.owner@example.com";
const PARENT = "hdh.walkthrough.parent@example.com";
const HELPER = "hdh.walkthrough.helper@example.com";
const CHILD_ID = "child-walk-ava";

function request(port, method, urlPath, { email = "", familyToken = "", body = null, extraHeaders = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) {
    headers.Authorization = `Bearer test:${email}`;
    headers["X-LLH-User-Email"] = email;
  }
  if (familyToken) headers.Authorization = `Bearer ${familyToken}`;
  if (extraHeaders && typeof extraHeaders === "object") Object.assign(headers, extraHeaders);
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

function spawnServer({ port, storePath, hubTesting }) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: hubTesting ? "true" : "false",
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "true",
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

async function openAsOwner(page, port) {
  await page.addInitScript(({ email, childId }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Pro",
        firstName: "Walk",
        lastName: "Owner",
        role: "owner",
        accountType: "home_daycare",
        subscriptionStatus: "active",
        stripeSubscriptionStatus: "active",
        programName: "Walkthrough Home Daycare",
      },
    }));
    localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify([
      { id: childId, name: "Ava Walk", dob: "2023-04-01", ageGroup: "Toddler" },
    ]));
    localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([]));
    localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
  }, { email: OWNER, childId: CHILD_ID });

  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof isHomeDaycareHubTestingEnabled === "function", null, { timeout: 60000 });
  await page.waitForFunction(() => {
    try {
      if (typeof isAppBootInteractive === "function") return isAppBootInteractive();
      if (typeof appBootState !== "undefined") return appBootState === "ready" || appBootState === "failed";
    } catch (_e) { /* ignore */ }
    return Boolean(document.body.classList.contains("app-booted"));
  }, null, { timeout: 60000 });
  await page.evaluate(() => {
    try { if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser")); } catch (_e) { /* ignore */ }
    try { if (typeof updateAuthButtons === "function") updateAuthButtons(); } catch (_e) { /* ignore */ }
    try { if (typeof syncHomeDaycareHubNavVisibility === "function") syncHomeDaycareHubNavVisibility(); } catch (_e) { /* ignore */ }
  });
  await page.waitForTimeout(300);
}

async function main() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "llh-shell-manifest.json"), "utf8"));

  assert.match(indexHtml, new RegExp(`SHELL_VERSION = "${SHELL}"`));
  assert.match(indexHtml, new RegExp(`app\\.js\\?v=${SHELL}`));
  assert.match(sw, new RegExp(SHELL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sw, /llh-shell-v165-family-hub-polish3/);
  assert.equal(manifest.version, SHELL);
  assert.equal(manifest.cacheName, "llh-shell-v165-family-hub-polish3");
  console.log("PASS  shell / SW / manifest cache-bust aligned");

  const offPort = 20110 + Math.floor(Math.random() * 40);
  const onPort = offPort + 1;
  const offStore = path.join(os.tmpdir(), `llh-hdh-walk-off-${crypto.randomBytes(4).toString("hex")}.json`);
  const onStore = path.join(os.tmpdir(), `llh-hdh-walk-on-${crypto.randomBytes(4).toString("hex")}.json`);
  const seedUsers = {
    users: {
      [OWNER]: { email: OWNER, role: "owner", accountType: "home_daycare", plan: "Pro" },
    },
    siteContent: {},
    foundingMembers: [],
  };
  fs.writeFileSync(offStore, JSON.stringify(seedUsers, null, 2));
  fs.writeFileSync(onStore, JSON.stringify(seedUsers, null, 2));

  const offChild = spawnServer({ port: offPort, storePath: offStore, hubTesting: false });
  const onChild = spawnServer({ port: onPort, storePath: onStore, hubTesting: true });
  let browser;

  try {
    const offHealth = await waitForHealth(offPort, offChild);
    assert.equal(offHealth.homeDaycareHubTesting, false);
    assert.equal(offHealth.homeDaycareHub?.enabled, false);
    const offBlocked = await request(offPort, "GET", "/api/home-daycare-hub/packets", { email: OWNER });
    assert.equal(offBlocked.status, 404, "packets must 404 when fence is off");
    const offFamily = await request(offPort, "POST", "/api/family-hub/households", {
      email: OWNER,
      body: { email: PARENT, children: [{ id: CHILD_ID, name: "Ava" }] },
    });
    assert.equal(offFamily.status, 404, "family hub must 404 when fence is off");
    console.log("PASS  fence off: health + APIs blocked");

    const onHealth = await waitForHealth(onPort, onChild);
    assert.equal(onHealth.homeDaycareHubTesting, true);
    assert.equal(onHealth.homeDaycareHub?.enabled, true);
    assert.ok(Array.isArray(onHealth.homeDaycareHub?.features));
    assert.ok(onHealth.homeDaycareHub.features.includes("forms-pack"));
    assert.ok(onHealth.homeDaycareHub.features.includes("family-hub"));
    assert.ok(onHealth.homeDaycareHub.features.includes("staff-visibility"));
    assert.ok(onHealth.homeDaycareHub.features.includes("trainings"));
    assert.ok(onHealth.homeDaycareHub.features.includes("packets"));

    const readiness = await request(onPort, "GET", "/api/launch-readiness");
    assert.equal(readiness.status, 200);
    assert.equal(readiness.json.optional?.homeDaycareHub?.enabled, true);
    console.log("PASS  fence on: health features + launch-readiness optional HDH");

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await openAsOwner(page, onPort);

    const navVisible = await page.evaluate(() => {
      const btn = document.querySelector('[data-view="home-daycare-hub"][data-nav-hdh-testing="true"]');
      return {
        flag: typeof isHomeDaycareHubTestingEnabled === "function" ? isHomeDaycareHubTestingEnabled() : false,
        loggedIn: typeof isLoggedIn === "function" ? isLoggedIn() : false,
        navExists: Boolean(btn),
        navHidden: btn ? Boolean(btn.hidden) : true,
      };
    });
    assert.equal(navVisible.flag, true);
    assert.equal(navVisible.loggedIn, true);
    assert.equal(navVisible.navExists, true);
    assert.equal(navVisible.navHidden, false, "Hub nav should show for owner when testing flag is on");

    await page.evaluate(() => {
      if (typeof setView === "function") setView("home-daycare-hub", { allowDuringBootVerification: true });
    });
    await page.waitForSelector("#view-home-daycare-hub.active-view .hdh-hub-page", { timeout: 20000 });
    await page.waitForSelector("#hdhAiDraftPanel", { timeout: 15000 });
    await page.waitForSelector("#hdhFamilyHubPanel", { timeout: 15000 });
    await page.waitForSelector("#hdhTrainingsPanel", { timeout: 15000 });
    await page.waitForSelector("#hdhPacketsPanel", { timeout: 15000 });
    // Hub re-renders after async household/trainings/packets refresh — wait for settle.
    await page.waitForTimeout(1200);
    await page.waitForSelector("#hdhAiDraftForm textarea[name='notes']", { timeout: 10000 });

    const hubSnapshot = await page.evaluate(() => {
      const packItems = Array.from(document.querySelectorAll("[data-hdh-open-form]"));
      return {
        title: document.querySelector("#view-home-daycare-hub h2")?.textContent?.trim() || "",
        packCount: packItems.length,
        hasGuide: Boolean(document.querySelector("#hdhTesterGuidePanel")),
        guideText: document.querySelector("#hdhTesterGuidePanel")?.innerText || "",
        hasRoleSwitcher: Boolean(document.querySelector("#hdhRoleSwitcher")),
        hasParentSwitch: Boolean(document.querySelector("[data-hdh-role-switch='parent']")),
        hasTeacherSwitch: Boolean(document.querySelector("[data-hdh-role-switch='teacher']")),
        hasAi: Boolean(document.querySelector("#hdhAiDraftPanel")),
        hasFamily: Boolean(document.querySelector("#hdhFamilyHubInviteForm")),
        hasStaff: Boolean(document.querySelector("#hdhStaffInviteForm")),
        hasFullAccessInvite: Boolean(document.querySelector("#hdhFullAccessInviteForm")),
        hasVisibility: Boolean(document.querySelector("[name='visibilityPreset']")),
        hasTraining: Boolean(document.querySelector("#hdhTrainingForm")),
        hasPacket: Boolean(document.querySelector("#hdhPacketForm")),
        disclaimer: document.querySelector(".hdh-disclaimer")?.textContent || "",
        guideMentionsNoAdmin: /not Admin|never get Admin|do not have Admin|No Admin/i.test(document.querySelector("#hdhTesterGuidePanel")?.innerText || ""),
        guideMentionsOwnKid: /own account \+ own kid|own starter child|own kid/i.test(document.querySelector("#hdhTesterGuidePanel")?.innerText || ""),
        guideMentionsMessageLeah: /Message Leah/i.test(document.querySelector("#hdhTesterGuidePanel")?.innerText || ""),
      };
    });
    assert.equal(hubSnapshot.title, "Home Daycare Hub");
    assert.equal(hubSnapshot.packCount, 10, "forms pack must list 10 forms");
    assert.equal(hubSnapshot.hasAi, true);
    assert.equal(hubSnapshot.hasFamily, true);
    assert.equal(hubSnapshot.hasStaff, true);
    assert.equal(hubSnapshot.hasFullAccessInvite, true, "independent tester invite form should be on hub");
    assert.equal(hubSnapshot.hasVisibility, true);
    assert.equal(hubSnapshot.guideMentionsNoAdmin, true, "guide should say testers do not get Admin");
    assert.equal(hubSnapshot.guideMentionsOwnKid, true, "guide should say each tester gets own kid");
    assert.equal(hubSnapshot.guideMentionsMessageLeah, true, "guide should point testers to Message Leah");
    assert.equal(hubSnapshot.hasTraining, true);
    assert.equal(hubSnapshot.hasPacket, true);
    assert.match(hubSnapshot.disclaimer, /state licensing/i);
    assert.equal(hubSnapshot.hasGuide, true, "tester guide should be at top of hub");
    assert.match(hubSnapshot.guideText || "", /Where to add testers/i);
    assert.equal(hubSnapshot.hasRoleSwitcher, true, "multi-role switcher should be on hub");
    assert.equal(hubSnapshot.hasParentSwitch, true);
    assert.equal(hubSnapshot.hasTeacherSwitch, true);
    console.log("PASS  browser hub shell shows A–G panels + 10-form pack");

    // Role switcher: teacher → staff helper → staff lead → parent → teacher
    const visibleRole = (role) => page.locator(`[data-hdh-role-switch='${role}']:visible`).first();
    await visibleRole("staff-helper").click();
    await page.waitForFunction(() => document.body.dataset.hdhTesterPersona === "staff-helper", { timeout: 15000 });
    const helperMode = await page.evaluate(() => ({
      persona: document.body.dataset.hdhTesterPersona || "",
      hubNavHidden: Boolean(document.querySelector("[data-nav-hdh-testing='true']")?.hidden),
    }));
    assert.equal(helperMode.persona, "staff-helper");
    assert.equal(helperMode.hubNavHidden, true, "Staff Helper should hide Home Daycare Hub nav");

    await visibleRole("staff-lead").click();
    await page.waitForFunction(() => document.body.dataset.hdhTesterPersona === "staff-lead", { timeout: 15000 });
    const leadMode = await page.evaluate(() => ({
      persona: document.body.dataset.hdhTesterPersona || "",
      hubNavHidden: Boolean(document.querySelector("[data-nav-hdh-testing='true']")?.hidden),
    }));
    assert.equal(leadMode.persona, "staff-lead");
    assert.equal(leadMode.hubNavHidden, false, "Staff Lead should keep Home Daycare Hub nav");

    await visibleRole("parent").click();
    await page.waitForFunction(() => {
      const hub = document.querySelector("#view-family-hub.active-view");
      const app = document.querySelector("#familyHubParentApp");
      if (!hub || !app) return false;
      if (app.querySelector("#familyHubLoadingState, .fh-loading")) return false;
      return Boolean(app.querySelector(".fh-parent-app") || /sign in|couldn.?t open/i.test(app.innerText || ""));
    }, { timeout: 30000 });
    const parentMode = await page.evaluate(() => ({
      active: Boolean(document.querySelector("#view-family-hub.active-view")),
      persona: document.body.dataset.hdhTesterPersona || "",
      hasBack: Boolean(document.querySelector("[data-hdh-role-switch='teacher']:not([disabled])")),
      text: document.querySelector("#familyHubParentApp")?.innerText || "",
      parentMode: document.body.classList.contains("family-hub-parent-mode"),
    }));
    assert.equal(parentMode.active, true, "Parent view should open from role switcher");
    assert.equal(parentMode.persona, "parent");
    assert.equal(parentMode.hasBack, true, "Parent view should offer Back to Teacher");
    assert.equal(parentMode.parentMode, true, "Parent chrome mode should hide provider UI");
    assert.match(parentMode.text, /Today|Reports|Photos|Messages|Calendar|Forms|Family Hub|day/i);
    await visibleRole("teacher").click();
    await page.waitForSelector("#view-home-daycare-hub.active-view #hdhRoleSwitcher", { timeout: 15000 });
    console.log("PASS  teacher ↔ staff ↔ parent role switcher");

    // Step C: AI draft → save to child (drive helpers directly so hub re-render races don't drop the submit)
    const draftOk = await page.evaluate(async (childId) => {
      hdhAiDraftState.packFormId = "hdh-pack-allergy";
      hdhAiDraftState.childId = childId;
      hdhAiDraftState.notes = "Peanut allergy; EpiPen in backpack; parent: Sam Walk.";
      hdhAiDraftState.lastOutput = "";
      renderHomeDaycareHubPage({ refreshHouseholds: false });
      await runHomeDaycareAiFormDraft({ draftAction: "create" });
      const text = document.querySelector("#hdhAiDraftOutput")?.innerText || "";
      const resultsVisible = document.querySelector("#hdhAiDraftResults") && !document.querySelector("#hdhAiDraftResults").hidden;
      return { text, resultsVisible, len: text.trim().length };
    }, CHILD_ID);
    assert.equal(draftOk.resultsVisible, true, "AI draft results should show");
    assert.ok(draftOk.len > 40, `AI/local draft should render content (got ${draftOk.len})`);
    await page.click("[data-hdh-ai-save]");
    await page.waitForTimeout(800);
    const savedDocs = await page.evaluate((email) => {
      try {
        return JSON.parse(localStorage.getItem(`llhChild:${email}:Documents`) || "[]");
      } catch {
        return [];
      }
    }, OWNER);
    assert.ok(savedDocs.length >= 1, "saving AI draft should add a child document");
    assert.ok(savedDocs.some((d) => d.childId === CHILD_ID), "saved draft linked to child");
    console.log("PASS  AI draft generate + save to child file");

    // Step A: Forms & Records tab
    await page.evaluate((childId) => {
      selectedChildId = childId;
      childManagementMode = "profile";
      childProfileTab = "forms-records";
      if (typeof setView === "function") setView("children", { allowDuringBootVerification: true });
      if (typeof renderChildManagement === "function") renderChildManagement();
    }, CHILD_ID);
    await page.waitForTimeout(600);
    const formsTab = await page.evaluate(() => {
      const tabBtn = document.querySelector('[data-child-tab="forms-records"]');
      if (tabBtn) tabBtn.click();
      return {
        hasFilters: Boolean(document.querySelector("[data-hdh-forms-search]")),
        hasStatus: Boolean(document.querySelector("[data-hdh-forms-status]")),
        tabPresent: Boolean(document.querySelector('[data-child-tab="forms-records"]')),
      };
    });
    assert.equal(formsTab.tabPresent || formsTab.hasFilters, true, "Forms & Records tab or filters should appear");
    assert.equal(formsTab.hasFilters, true);
    assert.equal(formsTab.hasStatus, true);
    console.log("PASS  Forms & Records tab filters present");

    // Back to hub for Family Hub / staff / trainings / packets
    await page.evaluate(() => setView("home-daycare-hub", { allowDuringBootVerification: true }));
    await page.waitForSelector("#hdhFamilyHubInviteForm", { timeout: 15000 });

    await page.fill("#hdhFamilyHubInviteForm input[name='label']", "Walk Family");
    await page.fill("#hdhFamilyHubInviteForm input[name='email']", PARENT);
    await page.fill("#hdhFamilyHubInviteForm input[name='phone']", "555-0199");
    await page.check(`#hdhFamilyHubInviteForm input[name='childIds'][value='${CHILD_ID}']`);
    await page.click("#hdhFamilyHubInviteForm button[type='submit']");
    await page.waitForSelector(".hdh-family-invite-result", { timeout: 20000 });
    const inviteUrl = await page.locator(".hdh-family-invite-result code.hdh-code").first().innerText();
    assert.match(inviteUrl, /familyHub=/);
    console.log("PASS  Family Hub household invite created in UI");

    // Parent Family Hub view via magic link
    const parentPage = await browser.newPage();
    await parentPage.goto(inviteUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await parentPage.waitForFunction(() => typeof maybeHandleFamilyHubInviteFromUrl === "function" || document.querySelector("#view-family-hub"), null, { timeout: 60000 });
    await parentPage.waitForTimeout(1200);
    await parentPage.evaluate(() => {
      try {
        if (typeof maybeHandleFamilyHubInviteFromUrl === "function") maybeHandleFamilyHubInviteFromUrl();
      } catch (_e) { /* ignore */ }
    });
    await parentPage.waitForTimeout(1500);
    const familyView = await parentPage.evaluate(() => {
      const view = document.querySelector("#view-family-hub");
      return {
        active: Boolean(document.querySelector("#view-family-hub.active-view")) || Boolean(view?.innerText?.trim()),
        text: (view?.innerText || document.body.innerText || "").slice(0, 1200),
      };
    });
    assert.ok(familyView.active || /Family Hub|Ava|form/i.test(familyView.text), "parent Family Hub should render after magic link");
    assert.match(familyView.text, /Ava|household|form|Walk/i);
    await parentPage.close();
    console.log("PASS  parent Family Hub magic-link view");

    // Step E: independent tester invite (own account + own kid, no Admin, no shared kids)
    const FULL_TESTER = "hdh.walkthrough.full@example.com";
    await page.fill("#hdhFullAccessInviteForm input[name='email']", FULL_TESTER);
    await page.fill("#hdhFullAccessInviteForm input[name='childName']", "Milo Tester");
    await page.click("#hdhFullAccessInviteForm button[type='submit']");
    await page.waitForSelector(".hdh-staff-invite-result", { timeout: 20000 });
    const fullInviteApi = await request(onPort, "GET", "/api/home-daycare-hub/tester-invites", {
      email: OWNER,
      extraHeaders: { Origin: `http://127.0.0.1:${onPort}` },
    });
    assert.equal(fullInviteApi.status, 200, fullInviteApi.text);
    const fullInvite = (fullInviteApi.json.invites || []).find((i) => i.email === FULL_TESTER);
    assert.ok(fullInvite, "independent tester invite stored");
    assert.equal(fullInvite.childName, "Milo Tester");
    assert.match(String(fullInvite.acceptUrl || ""), /testerInvite=/);
    const token = new URL(fullInvite.acceptUrl).searchParams.get("testerInvite");
    assert.ok(token, "tester invite token present");
    const acceptRes = await request(onPort, "POST", "/api/home-daycare-hub/tester-invites/accept", {
      email: FULL_TESTER,
      body: { token },
    });
    assert.equal(acceptRes.status, 200, acceptRes.text);
    assert.equal(acceptRes.json.account?.hdhIndependentTester, true);
    assert.equal(acceptRes.json.account?.linkedProgramOwnerEmail || "", "");
    assert.equal(acceptRes.json.demoChild?.name, "Milo Tester");
    const testerKids = await request(onPort, "GET", "/api/child-data", { email: FULL_TESTER });
    assert.equal(testerKids.status, 200, testerKids.text);
    const testerProfiles = testerKids.json?.data?.Profiles || [];
    assert.ok(testerProfiles.some((c) => c.name === "Milo Tester"), "tester has own starter child");
    assert.ok(!testerProfiles.some((c) => c.id === CHILD_ID), "tester does not receive owner children");
    console.log("PASS  independent tester invite (own account + own kid)");

    // Custom helper preset still available (forms_records off) under optional shared-program section
    await page.evaluate(() => {
      const details = document.querySelector("#hdhStaffCustomInviteDetails");
      if (details) details.open = true;
    });
    await page.waitForSelector("#hdhStaffInviteForm", { timeout: 10000 });
    await page.selectOption("#hdhStaffInviteForm select[name='visibilityPreset']", "helper");
    await page.fill("#hdhStaffInviteForm input[name='email']", HELPER);
    await page.click("#hdhStaffInviteForm button[type='submit']");
    let helperInvite = null;
    for (let i = 0; i < 40; i += 1) {
      const staffInviteApi = await request(onPort, "GET", "/api/staff/invites", { email: OWNER });
      assert.equal(staffInviteApi.status, 200, staffInviteApi.text);
      helperInvite = (staffInviteApi.json.invites || []).find((item) => item.email === HELPER) || null;
      if (helperInvite) break;
      await page.waitForTimeout(250);
    }
    assert.ok(helperInvite, "helper invite stored");
    assert.equal(helperInvite.visibilityPreset, "helper");
    assert.equal(helperInvite.hdhVisibility?.forms_records, false);
    console.log("PASS  staff invite helper preset + visibility stored");

    // Staff nav trim: helper account should hide Hub
    const helperPage = await browser.newPage();
    await helperPage.addInitScript(({ email, visibility }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          role: "assistant",
          accountType: "home_daycare",
          linkedProgramOwnerEmail: "hdh.walkthrough.owner@example.com",
          hdhVisibility: visibility,
          subscriptionStatus: "active",
        },
      }));
    }, {
      email: HELPER,
      visibility: { calendar: true, daily_logs: true, children: true, forms_records: false, lessons: false, activities: false },
    });
    await helperPage.goto(`http://127.0.0.1:${onPort}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await helperPage.waitForFunction(() => typeof syncHomeDaycareHubNavVisibility === "function", null, { timeout: 60000 });
    await helperPage.evaluate(() => {
      try { if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser")); } catch (_e) { /* ignore */ }
      try { if (typeof syncHomeDaycareHubNavVisibility === "function") syncHomeDaycareHubNavVisibility(); } catch (_e) { /* ignore */ }
    });
    await helperPage.waitForTimeout(300);
    const helperNav = await helperPage.evaluate(() => {
      const btn = document.querySelector('[data-view="home-daycare-hub"][data-nav-hdh-testing="true"]');
      return {
        maySee: typeof staffMaySeeHdhView === "function" ? staffMaySeeHdhView("home-daycare-hub") : null,
        hidden: btn ? Boolean(btn.hidden) : true,
      };
    });
    assert.equal(helperNav.maySee, false);
    assert.equal(helperNav.hidden, true);
    await helperPage.close();
    console.log("PASS  helper staff cannot see Hub nav");

    // Step F: training tracker
    await page.fill("#hdhTrainingForm input[name='staffEmail']", HELPER);
    await page.fill("#hdhTrainingForm input[name='staffName']", "Helper Walk");
    await page.selectOption("#hdhTrainingForm select[name='type']", "CPR");
    await page.fill("#hdhTrainingForm input[name='completedAt']", "2026-01-10");
    await page.fill("#hdhTrainingForm input[name='expiresAt']", "2028-01-10");
    await page.click("#hdhTrainingForm button[type='submit']");
    await page.waitForFunction(() => /CPR/.test(document.querySelector("#hdhTrainingsPanel")?.innerText || ""), null, { timeout: 20000 });
    const trainings = await request(onPort, "GET", "/api/home-daycare-hub/staff-trainings", { email: OWNER });
    assert.equal(trainings.status, 200);
    assert.ok((trainings.json.trainings || []).some((t) => t.type === "CPR" && t.staffEmail === HELPER));
    console.log("PASS  CPR training saved via UI + API");

    // Step G: packet (submit via evaluate so child select + form state stay in sync after hub refreshes)
    const packetUi = await page.evaluate(async (childId) => {
      const children = typeof childRecords === "function" ? (childRecords().children || []) : [];
      const form = document.querySelector("#hdhPacketForm");
      if (!form) return { ok: false, error: "missing packet form", children: children.map((c) => c.id) };
      const childSelect = form.querySelector("select[name='childId']");
      const titleInput = form.querySelector("input[name='title']");
      if (childSelect) childSelect.value = childId;
      if (titleInput) titleInput.value = "Ava enrollment packet";
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        const panelText = document.querySelector("#hdhPacketsPanel")?.innerText || "";
        const message = document.querySelector("#hdhPacketMessage")?.textContent || "";
        if (/Ava enrollment packet/.test(panelText)) return { ok: true, panelText, message, children: children.map((c) => c.id) };
        if (message && /could not|need|error/i.test(message)) return { ok: false, error: message, children: children.map((c) => c.id) };
      }
      return {
        ok: false,
        error: document.querySelector("#hdhPacketMessage")?.textContent || "packet did not appear",
        panelText: document.querySelector("#hdhPacketsPanel")?.innerText || "",
        children: children.map((c) => c.id),
      };
    }, CHILD_ID);
    assert.equal(packetUi.ok, true, `packet UI create failed: ${packetUi.error || ""} children=${(packetUi.children || []).join(",")}`);
    const packets = await request(onPort, "GET", "/api/home-daycare-hub/packets", { email: OWNER });
    assert.equal(packets.status, 200);
    const packet = (packets.json.packets || []).find((p) => p.title === "Ava enrollment packet");
    assert.ok(packet, "packet should be stored via API");
    assert.ok((packet.items || []).length >= 8, "packet should include pack forms");
    const itemId = packet.items[0].id;
    const patched = await request(onPort, "PATCH", `/api/home-daycare-hub/packets/${encodeURIComponent(packet.id)}/items`, {
      email: OWNER,
      body: { itemId, status: "signed" },
    });
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.json.packet.items.find((i) => i.id === itemId)?.status, "signed");
    console.log("PASS  enrollment packet create + item status update");

    console.log("\nAll Home Daycare Hub walkthrough checks passed.");
  } catch (error) {
    console.error("FAIL  Home Daycare Hub walkthrough");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    offChild.kill("SIGTERM");
    onChild.kill("SIGTERM");
    try { fs.unlinkSync(offStore); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(onStore); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
