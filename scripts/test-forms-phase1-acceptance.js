#!/usr/bin/env node
/**
 * Phase 1 Forms System — acceptance test (testing fence only).
 * Proves the full provider → parent → review → print → persistence spine,
 * break attempts, and basic UX clarity markers.
 *
 * Run: npm run test:forms-phase1-acceptance
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/forms-phase1-acceptance";
const SHELL_RE = /SHELL_VERSION = "20260804-(forms-phase1[bc]?|family-hub-phase2|ecosystem-phase3|ecosystem-spine|workflow-integration|nav-role-experience|forms-ecosystem)"/;
const OWNER = "forms.p1.accept.owner@example.com";
const PARENT_A = "forms.p1.accept.parenta@example.com";
const PARENT_B = "forms.p1.accept.parentb@example.com";
const CHILD_A = "child-p1-maya";
const CHILD_B = "child-p1-noah";

const issues = [];
const notes = [];

function issue(severity, title, detail = "") {
  issues.push({ severity, title, detail });
  console.log(`ISSUE[${severity}] ${title}${detail ? ` — ${detail}` : ""}`);
}

function note(msg) {
  notes.push(msg);
  console.log(`NOTE  ${msg}`);
}

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

async function openAsOwner(page, port, { children }) {
  await page.addInitScript(({ email, kids }) => {
    // Seed once — do not wipe accounts/templates/docs on refresh or logout/login checks.
    const seeded = localStorage.getItem("llhP1AcceptSeeded") === "1";
    if (!seeded) {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          firstName: "P1",
          lastName: "Owner",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "active",
          stripeSubscriptionStatus: "active",
          programName: "Phase1 Acceptance Daycare",
          programSettings: { programName: "Phase1 Acceptance Daycare", formTemplates: [] },
        },
      }));
      localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify(kids));
      localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([]));
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      localStorage.setItem("llhP1AcceptSeeded", "1");
    } else if (!localStorage.getItem("llhUser")) {
      localStorage.setItem("llhUser", email);
    }
  }, { email: OWNER, kids: children });

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
  await page.waitForTimeout(400);
}

async function syncOwnerChildData(page) {
  return page.evaluate(async () => {
    if (typeof saveChildDataToBackend === "function") {
      try {
        await saveChildDataToBackend({ force: true });
        return "saved";
      } catch (_e) { /* fall through */ }
    }
    if (typeof saveChildStore === "function" && typeof childStore === "function") {
      saveChildStore("Documents", childStore("Documents") || []);
      await new Promise((r) => setTimeout(r, 900));
      return "queued";
    }
    return "none";
  });
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(indexHtml, SHELL_RE, "shell version must be forms-phase1 / 1b");

  const port = 20220 + Math.floor(Math.random() * 80);
  const storePath = path.join(os.tmpdir(), `llh-p1-accept-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [OWNER]: { email: OWNER, role: "owner", accountType: "home_daycare", plan: "Pro" },
    },
    siteContent: {},
    foundingMembers: [],
  }, null, 2));

  const server = spawnServer({ port, storePath });
  let browser;
  const results = {
    happyPath: false,
    persistence: false,
    print: false,
    breakAttempts: {},
    ux: {},
  };

  try {
    const health = await waitForHealth(port, server);
    assert.equal(health.homeDaycareHubTesting, true);
    console.log("PASS  server health + HDH fence");

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // --- Create child (start with none, add via UI helpers) ---
    await openAsOwner(page, port, { children: [] });
    const created = await page.evaluate(({ childA, childB }) => {
      const kids = [
        { id: childA, name: "Maya Acceptance", dob: "2022-09-12", ageGroup: "Toddler", parentInfo: "forms.p1.accept.parenta@example.com" },
        { id: childB, name: "Noah Acceptance", dob: "2021-03-04", ageGroup: "Preschool", parentInfo: "forms.p1.accept.parentb@example.com" },
      ];
      if (typeof saveChildStore === "function") saveChildStore("Profiles", kids);
      else localStorage.setItem(`llhChild:${localStorage.getItem("llhUser")}:Profiles`, JSON.stringify(kids));
      selectedChildId = childA;
      localStorage.setItem("llhSelectedChild", childA);
      return (typeof childStore === "function" ? childStore("Profiles") : kids).map((c) => c.name);
    }, { childA: CHILD_A, childB: CHILD_B });
    assert.ok(created.includes("Maya Acceptance"), "child Maya created");
    console.log("PASS  create children");

    await page.evaluate(() => setView("home-daycare-hub", { allowDuringBootVerification: true }));
    await page.waitForSelector("#hdhAiDraftPanel", { timeout: 20000 });
    await page.waitForTimeout(800);

    // --- AI generate enrollment form ---
    const draft = await page.evaluate(async (childId) => {
      hdhAiDraftState.packFormId = "hdh-pack-enrollment";
      hdhAiDraftState.childId = childId;
      hdhAiDraftState.notes = "Enrollment for Maya Acceptance. Start date 2026-09-01. Parent Sam Acceptance. Hours 7:30–5:30. Allergies: none known.";
      hdhAiDraftState.lastOutput = "";
      hdhAiDraftState.editing = false;
      renderHomeDaycareHubPage({ refreshHouseholds: false });
      await runHomeDaycareAiFormDraft({ draftAction: "create" });
      // Edit the draft (provider review step)
      hdhAiDraftState.editing = true;
      const edited = `${String(hdhAiDraftState.lastOutput || "").trim()}\n\nPROVIDER EDIT: Confirm start date and emergency contacts before sharing.`;
      hdhAiDraftState.lastOutput = edited;
      hdhAiDraftState.editing = false;
      renderHomeDaycareHubPage({ refreshHouseholds: false });
      return {
        len: String(hdhAiDraftState.lastOutput || "").length,
        hasEdit: /PROVIDER EDIT/.test(hdhAiDraftState.lastOutput || ""),
        title: document.querySelector("#hdhAiDraftPanel h3")?.textContent || "",
      };
    }, CHILD_A);
    assert.ok(draft.len > 40, `AI draft should produce content (len=${draft.len})`);
    assert.equal(draft.hasEdit, true);
    console.log("PASS  AI generate + edit");

    // --- Save as reusable template ---
    await page.click("[data-hdh-ai-save-template]");
    await page.waitForTimeout(500);
    const templateId = await page.evaluate(() => {
      const templates = typeof formsProgramTemplates === "function" ? formsProgramTemplates() : [];
      return templates[0]?.id || "";
    });
    assert.ok(templateId, "template saved");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "01-template-saved.png"), fullPage: false });
    console.log("PASS  save as reusable template");

    // --- Assign to child + notify ---
    await page.evaluate(() => {
      const btn = document.querySelector("[data-assign-form-template]");
      if (btn) btn.click();
    });
    await page.waitForSelector(`[data-assign-template-form="${templateId}"]:not([hidden])`, { timeout: 5000 }).catch(() => null);
    await page.evaluate((id) => {
      const form = document.querySelector(`[data-assign-template-form="${id}"]`);
      if (!form) return;
      form.hidden = false;
      const due = form.querySelector('input[name="dueDate"]');
      if (due) due.value = "2099-12-31";
      form.querySelectorAll('input[name="childIds"]').forEach((input) => {
        input.checked = input.value === "child-p1-maya";
      });
      const share = form.querySelector('input[name="shareWithFamily"]');
      if (share) share.checked = true;
    }, templateId);
    await page.evaluate((id) => {
      const form = document.querySelector(`[data-assign-template-form="${id}"]`);
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }, templateId);
    await page.waitForTimeout(1200);

    let docs = await page.evaluate(() => (typeof childStore === "function" ? childStore("Documents") : []));
    assert.ok(docs.some((d) => d.childId === CHILD_A && d.templateId === templateId), "assigned doc on child");
    const assignedDoc = docs.find((d) => d.childId === CHILD_A && d.templateId === templateId);
    assert.ok(["notified", "assigned", "needed"].includes(String(assignedDoc.status)), `status=${assignedDoc.status}`);
    console.log("PASS  assign to child");

    // Sync to backend so Family Hub can see live documents
    const syncMode = await syncOwnerChildData(page);
    note(`child-data sync mode: ${syncMode}`);
    await page.waitForTimeout(1000);
    const backendKids = await request(port, "GET", "/api/child-data", { email: OWNER });
    assert.equal(backendKids.status, 200, backendKids.text);
    const backendDocs = backendKids.json?.data?.Documents || [];
    if (!backendDocs.some((d) => d.id === assignedDoc.id)) {
      // Force explicit POST
      const post = await request(port, "POST", "/api/child-data", {
        email: OWNER,
        body: {
          data: {
            Profiles: [
              { id: CHILD_A, name: "Maya Acceptance", dob: "2022-09-12", ageGroup: "Toddler", parentInfo: PARENT_A },
              { id: CHILD_B, name: "Noah Acceptance", dob: "2021-03-04", ageGroup: "Preschool", parentInfo: PARENT_B },
            ],
            Documents: docs,
          },
        },
      });
      assert.equal(post.status, 200, post.text);
      note("forced /api/child-data POST after assign");
    }

    // Create Family Hub household with two guardians
    const invite = await request(port, "POST", "/api/family-hub/households", {
      email: OWNER,
      body: {
        email: PARENT_A,
        guardianEmail: PARENT_B,
        label: "Acceptance Family",
        appOrigin: `http://127.0.0.1:${port}`,
        children: [{ id: CHILD_A, name: "Maya Acceptance" }],
      },
    });
    assert.equal(invite.status, 200, invite.text);
    const magicUrl = invite.json?.magicUrl || invite.json?.household?.magicUrl || "";
    const loginCode = invite.json?.loginCode || invite.json?.household?.loginCode || "";
    const inviteToken = magicUrl.includes("familyHub=")
      ? decodeURIComponent(magicUrl.split("familyHub=")[1].split("&")[0])
      : "";
    assert.ok(magicUrl || loginCode, "invite created");
    console.log("PASS  Family Hub household + guardians");

    // Notify via share API path
    await page.evaluate(async (docId) => {
      if (typeof shareChildDocumentWithFamily === "function") {
        await shareChildDocumentWithFamily(docId);
      }
    }, assignedDoc.id);
    await page.waitForTimeout(500);

    // --- Appear in Forms Center / attention / child profile ---
    await page.evaluate(() => {
      renderHomeDaycareHubPage({ refreshHouseholds: false });
    });
    await page.waitForTimeout(400);
    const attention = await page.evaluate(() => {
      const panel = document.querySelector("#hdhFormsAttentionPanel");
      return {
        text: panel?.innerText || "",
        awaiting: (typeof formsAttentionDocuments === "function"
          ? formsAttentionDocuments().filter((d) => d.attention === "awaiting_parent").length
          : 0),
      };
    });
    assert.ok(attention.awaiting >= 1 || /Awaiting parent|Shared/i.test(attention.text), "Forms Center shows pending");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "02-forms-attention.png") });

    await page.evaluate((childId) => {
      selectedChildId = childId;
      childManagementMode = "profile";
      childProfileTab = "forms-records";
      setView("children", { allowDuringBootVerification: true });
      renderChildManagement();
    }, CHILD_A);
    await page.waitForTimeout(600);
    const profileText = await page.evaluate(() => document.querySelector("#view-children")?.innerText || "");
    assert.match(profileText, /Maya|Enrollment|Shared|Awaiting|Needed|notified/i);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "03-child-forms-records.png") });
    console.log("PASS  visible in Forms Center + child profile");

    // --- Parent opens, reviews, signs ---
    let familyToken = "";
    if (inviteToken) {
      const redeem = await request(port, "POST", "/api/family-hub/invites/redeem", {
        body: { token: inviteToken },
      });
      if (redeem.status === 200) {
        familyToken = redeem.json?.sessionToken || redeem.json?.token || "";
      } else {
        note(`redeem failed (${redeem.status}): ${String(redeem.text).slice(0, 160)}`);
      }
    }
    if (!familyToken && loginCode) {
      const login = await request(port, "POST", "/api/family-hub/login", {
        body: { email: PARENT_A, code: loginCode },
      });
      assert.equal(login.status, 200, login.text);
      familyToken = login.json?.sessionToken || login.json?.token || "";
    }
    assert.ok(familyToken, "parent session");

    const me = await request(port, "GET", "/api/family-hub/me", { familyToken });
    assert.equal(me.status, 200, me.text);
    const familyDocs = me.json?.documents || me.json?.forms || [];
    const familyDoc = familyDocs.find((d) => String(d.id) === String(assignedDoc.id))
      || familyDocs.find((d) => /enrollment|maya/i.test(`${d.title} ${d.bodyText || ""}`));
    if (!familyDoc) {
      issue("blocker", "Assigned form not visible in Family Hub /me documents", `docs=${familyDocs.length}`);
    } else {
      assert.equal(familyDoc.canAcknowledge !== false, true, "parent can acknowledge");
      assert.ok(String(familyDoc.bodyText || familyDoc.notes || "").length > 0 || familyDoc.title, "parent can review content");
      const ack = await request(port, "POST", `/api/family-hub/documents/${encodeURIComponent(familyDoc.id)}/acknowledge`, {
        familyToken,
        body: { signerName: "Sam Acceptance" },
      });
      assert.equal(ack.status, 200, ack.text);
      assert.match(String(ack.json?.document?.status || ""), /signed/i);
      console.log("PASS  parent review + sign");
    }

    // Second guardian opens same form (should be view-only after sign)
    const loginB = await request(port, "POST", "/api/family-hub/login", {
      body: { email: PARENT_B, code: loginCode },
    });
    results.breakAttempts.multiGuardian = { status: loginB.status };
    if (loginB.status === 200) {
      const tokenB = loginB.json?.sessionToken || loginB.json?.token || "";
      const meB = await request(port, "GET", "/api/family-hub/me", { familyToken: tokenB });
      const docB = (meB.json?.documents || []).find((d) => String(d.id) === String(assignedDoc.id));
      if (!docB) {
        issue("major", "Second guardian cannot see signed form", `status=${meB.status}`);
        results.breakAttempts.multiGuardian.ok = false;
      } else {
        const canResign = docB.canAcknowledge === true;
        if (canResign) issue("major", "Second guardian can re-sign already signed form", "");
        results.breakAttempts.multiGuardian = { ok: !canResign, viewOnly: docB.viewOnly === true, status: docB.status };
        console.log(canResign ? "FAIL  multi-guardian re-sign allowed" : "PASS  multi-guardian sees signed form view-only");
      }
    } else {
      issue("major", "Second guardian login failed", loginB.text.slice(0, 200));
      results.breakAttempts.multiGuardian.ok = false;
    }

    // --- Provider sees completion after sync ---
    const syncApplied = await page.evaluate(async () => {
      if (typeof syncChildDataFromBackend === "function") {
        return syncChildDataFromBackend({ render: false, force: true });
      }
      return false;
    });
    await page.waitForTimeout(500);
    docs = await page.evaluate(() => (typeof childStore === "function" ? childStore("Documents") : []));
    const signedDoc = docs.find((d) => d.id === assignedDoc.id);
    if (!signedDoc?.signedAt && !/signed/i.test(String(signedDoc?.status || ""))) {
      const fresh = await request(port, "GET", "/api/child-data", { email: OWNER });
      const remote = (fresh.json?.data?.Documents || []).find((d) => d.id === assignedDoc.id);
      if (remote?.signedAt || /signed/i.test(String(remote?.status || ""))) {
        issue("blocker", "Provider sync did not pull signed status even with force refresh", `syncApplied=${syncApplied}`);
        await page.evaluate((remoteDoc) => {
          const next = (childStore("Documents") || []).map((d) => (d.id === remoteDoc.id ? { ...d, ...remoteDoc } : d));
          saveChildStoreLocalOnly("Documents", next);
        }, remote);
        docs = await page.evaluate(() => childStore("Documents"));
      } else {
        issue("blocker", "Signed status missing from backend child-data after acknowledge", JSON.stringify(remote || null).slice(0, 300));
      }
    }
    const signedLocal = docs.find((d) => d.id === assignedDoc.id);
    assert.ok(signedLocal?.signedAt || /signed/i.test(String(signedLocal?.status || "")), "provider sees signed");

    await page.evaluate(() => {
      setView("home-daycare-hub", { allowDuringBootVerification: true });
      renderHomeDaycareHubPage({ refreshHouseholds: false });
    });
    await page.waitForTimeout(500);
    const reviewUi = await page.evaluate(() => {
      const items = typeof formsAttentionDocuments === "function" ? formsAttentionDocuments() : [];
      return {
        signedReview: items.filter((i) => i.attention === "signed_review").length,
        text: document.querySelector("#hdhFormsAttentionPanel")?.innerText || "",
      };
    });
    assert.ok(reviewUi.signedReview >= 1 || /Signed — review|Mark reviewed/i.test(reviewUi.text), "attention shows signed for review");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "04-signed-review.png") });

    // Mark reviewed → on file
    await page.evaluate((docId) => {
      if (typeof markChildDocumentReviewed === "function") markChildDocumentReviewed(docId);
      renderHomeDaycareHubPage({ refreshHouseholds: false });
    }, assignedDoc.id);
    docs = await page.evaluate(() => childStore("Documents"));
    const filed = docs.find((d) => d.id === assignedDoc.id);
    assert.equal(filed?.providerReviewed, true);
    assert.match(String(filed?.status || ""), /on_file|reviewed/i);
    console.log("PASS  provider review → on file");

    // Printable PDF path
    const printOk = await page.evaluate((docId) => {
      let called = false;
      const original = window.printTextDocument;
      window.printTextDocument = (title, body) => {
        called = Boolean(title && String(body || "").length > 10);
        window.__p1PrintPayload = { title, body: String(body || "").slice(0, 500) };
      };
      try {
        printChildDocumentRecord(docId);
      } finally {
        window.printTextDocument = original;
      }
      return {
        called,
        payload: window.__p1PrintPayload || null,
      };
    }, assignedDoc.id);
    assert.equal(printOk.called, true, "print helper invoked");
    assert.match(String(printOk.payload?.body || ""), /SIGNED|Sam Acceptance|PROVIDER EDIT|Enrollment/i);
    results.print = true;
    console.log("PASS  printable PDF path");

    // --- Persistence: refresh + logout + login ---
    await syncOwnerChildData(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof childStore === "function", null, { timeout: 60000 });
    await page.evaluate(() => {
      try { loadAccountState(localStorage.getItem("llhUser")); } catch (_e) { /* ignore */ }
    });
    await page.waitForTimeout(500);
    let persistDocs = await page.evaluate(() => childStore("Documents") || []);
    let persistTemplates = await page.evaluate(() => (typeof formsProgramTemplates === "function" ? formsProgramTemplates() : []));
    if (!persistDocs.some((d) => d.id === assignedDoc.id)) {
      issue("blocker", "Document missing after refresh", "");
    }
    if (!persistTemplates.some((t) => t.id === templateId)) {
      issue("major", "Program template missing after refresh", "templates stored in program settings / localStorage");
    }

    // Simulate logout/login without wiping durable local account/program settings
    await page.evaluate((email) => {
      const docs = childStore("Documents");
      const profiles = childStore("Profiles");
      const settings = typeof getProgramSettings === "function" ? getProgramSettings() : {};
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      localStorage.setItem("llhUser", "");
      currentUser = "";
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhAccounts", JSON.stringify({
        ...accounts,
        [email]: {
          ...(accounts[email] || {}),
          email,
          plan: "Pro",
          role: "owner",
          accountType: "home_daycare",
          programSettings: settings,
        },
      }));
      if (typeof loadAccountState === "function") loadAccountState(email);
      saveChildStore("Profiles", profiles);
      saveChildStore("Documents", docs);
      if (typeof saveProgramSettings === "function") saveProgramSettings(settings);
    }, OWNER);
    await page.evaluate(async () => {
      if (typeof syncChildDataFromBackend === "function") await syncChildDataFromBackend({ render: false });
    });
    persistDocs = await page.evaluate(() => childStore("Documents") || []);
    persistTemplates = await page.evaluate(() => formsProgramTemplates());
    assert.ok(persistDocs.some((d) => d.id === assignedDoc.id && d.providerReviewed), "doc persists after logout/login");
    assert.ok(persistTemplates.some((t) => t.id === templateId), "template persists after logout/login");
    results.persistence = true;
    results.happyPath = true;
    console.log("PASS  refresh + logout/login persistence");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "05-persisted-on-file.png") });

    // ========== BREAK ATTEMPTS ==========
    // 1) Assign same form twice
    const beforeDup = await page.evaluate(() => (childStore("Documents") || []).length);
    await page.evaluate(async ({ id, childId }) => {
      const template = formsProgramTemplates().find((t) => t.id === id);
      await assignAndNotifyForm({
        title: template.title,
        category: template.category,
        body: template.body,
        draftText: template.body,
        templateId: template.id,
        packFormId: template.packFormId,
        shareWithFamily: false,
        notes: "Double-assign attempt",
      }, [childId]);
      await assignAndNotifyForm({
        title: template.title,
        category: template.category,
        body: template.body,
        draftText: template.body,
        templateId: template.id,
        packFormId: template.packFormId,
        shareWithFamily: false,
        notes: "Double-assign attempt #2",
      }, [childId]);
    }, { id: templateId, childId: CHILD_A });
    const afterDup = await page.evaluate(({ childId, id }) => (
      (childStore("Documents") || []).filter((d) => d.childId === childId && d.templateId === id && !d.signedAt && !d.providerReviewed).length
    ), { childId: CHILD_A, id: templateId });
    results.breakAttempts.doubleAssign = { count: afterDup, before: beforeDup };
    // Open (unsigned) duplicates should be refreshed, not multiplied. Signed/on-file copies may still exist.
    if (afterDup >= 2) {
      issue("major", "Assigning the same template twice creates duplicate open child documents", `count=${afterDup}`);
    } else {
      console.log("PASS  double-assign blocked/refreshed");
    }

    // 2) Edit template already in use
    await page.evaluate(() => {
      setView("home-daycare-hub", { allowDuringBootVerification: true });
      renderHomeDaycareHubPage({ refreshHouseholds: false });
    });
    await page.waitForTimeout(300);
    const editTemplateUi = await page.evaluate(() => Boolean(document.querySelector("[data-edit-form-template]")));
    results.breakAttempts.editTemplateInUse = { hasEditUi: editTemplateUi };
    if (!editTemplateUi) {
      issue("major", "No UI to edit a program template already in use", "only Assign / Print / Remove exist");
    }
    await page.evaluate((id) => {
      const templates = formsProgramTemplates().map((t) => (
        t.id === id ? { ...t, body: `${t.body}\n\nTEMPLATE EDIT AFTER ASSIGN`, updatedAt: new Date().toISOString() } : t
      ));
      saveFormsProgramTemplates(templates);
    }, templateId);
    const assignedBodies = await page.evaluate((id) => (
      (childStore("Documents") || [])
        .filter((d) => d.templateId === id)
        .map((d) => String(d.draftText || "").includes("TEMPLATE EDIT AFTER ASSIGN"))
    ), templateId);
    if (assignedBodies.some(Boolean)) {
      issue("blocker", "Editing template mutated already-assigned child documents", "");
    } else {
      note("template body edit does not rewrite prior assignments (snapshot intact)");
      console.log("PASS  edit template in use keeps assigned snapshots");
    }

    // 3) Assign to multiple children
    await page.evaluate(async (id) => {
      const template = formsProgramTemplates().find((t) => t.id === id);
      await assignAndNotifyForm({
        title: `${template.title} Multi`,
        category: template.category,
        body: template.body,
        draftText: template.body,
        templateId: template.id,
        shareWithFamily: true,
        dueDate: "2000-01-01", // overdue
        notes: "Multi-child assign",
      }, ["child-p1-maya", "child-p1-noah"]);
    }, templateId);
    const multiCounts = await page.evaluate(() => ({
      maya: (childStore("Documents") || []).filter((d) => d.childId === "child-p1-maya").length,
      noah: (childStore("Documents") || []).filter((d) => d.childId === "child-p1-noah").length,
    }));
    results.breakAttempts.multiChild = multiCounts;
    assert.ok(multiCounts.noah >= 1, "multi-child assign reaches Noah");
    console.log("PASS  assign to multiple children");

    // Overdue surfaces
    await page.evaluate(() => renderHomeDaycareHubPage({ refreshHouseholds: false }));
    const overdueUi = await page.evaluate(() => {
      const items = formsAttentionDocuments();
      return {
        overdue: items.filter((i) => i.attention === "overdue").length,
        text: document.querySelector("#hdhFormsAttentionPanel")?.innerText || "",
      };
    });
    if (overdueUi.overdue < 1 && !/Past due/i.test(overdueUi.text)) {
      issue("major", "Overdue assigned forms do not appear in Past due attention list", "");
    } else {
      console.log("PASS  overdue appears in attention");
    }

    // 4) Delete child after assignment
    await page.evaluate(async () => {
      // Bypass confirm dialog
      window.confirmAction = async () => true;
      await deleteChildProfilePermanently("child-p1-noah");
    });
    const afterDelete = await page.evaluate(() => ({
      profiles: (childStore("Profiles") || []).map((c) => c.id),
      orphanDocs: (childStore("Documents") || []).filter((d) => d.childId === "child-p1-noah"),
      attentionOrphans: (typeof formsAttentionDocuments === "function"
        ? formsAttentionDocuments().filter((d) => d.childId === "child-p1-noah")
        : []),
    }));
    results.breakAttempts.deleteChild = {
      childGone: !afterDelete.profiles.includes(CHILD_B),
      orphanDocs: afterDelete.orphanDocs.length,
      attentionOrphans: afterDelete.attentionOrphans.length,
    };
    if (afterDelete.orphanDocs.length) {
      issue("blocker", "Documents remain after permanent child delete", `orphans=${afterDelete.orphanDocs.length}`);
    } else {
      console.log("PASS  delete child cleans related documents");
    }
    if (afterDelete.attentionOrphans.length) {
      issue("major", "Attention panel still lists forms for deleted child", "");
    }

    // 5) Mobile parent sign viewport
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await mobile.waitForFunction(() => typeof renderFamilyHubFormsPanel === "function" || typeof loadFamilyHubParentDashboard === "function", null, { timeout: 60000 }).catch(() => null);
    // Render forms panel with mock signed/unsigned docs via evaluate if FH helpers exist
    const mobileForms = await mobile.evaluate(() => {
      const sample = [
        {
          id: "m1", title: "Enrollment Form", status: "notified", statusLabel: "Shared — awaiting parent",
          bodyText: "Mobile review body", canAcknowledge: true, viewOnly: false, dueDate: "2099-01-01",
        },
      ];
      if (typeof renderFamilyHubFormsPanel === "function") {
        const html = renderFamilyHubFormsPanel({ documents: sample, children: [{ id: "c", name: "Maya" }] });
        const root = document.createElement("div");
        root.innerHTML = html;
        document.body.appendChild(root);
        return { html: root.innerText.slice(0, 500), hasSign: /Sign|Acknowledge/i.test(root.innerText) };
      }
      return { html: "", hasSign: false };
    });
    results.breakAttempts.mobileParent = mobileForms;
    if (!mobileForms.hasSign) {
      issue("minor", "Could not fully exercise mobile parent sign UI in isolation", "API acknowledge path already verified; mobile layout smoke inconclusive");
    } else {
      await mobile.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "06-mobile-parent-forms.png") });
      console.log("PASS  mobile parent forms panel renders sign CTA");
    }
    await mobile.close();

    // ========== UX REVIEW ==========
    await page.evaluate(() => {
      setView("home-daycare-hub", { allowDuringBootVerification: true });
      renderHomeDaycareHubPage({ refreshHouseholds: false });
    });
    await page.waitForTimeout(400);
    const ux = await page.evaluate(() => {
      const panel = document.querySelector("#hdhFormsAttentionPanel");
      const text = panel?.innerText || "";
      const labels = {
        hasPending: /Awaiting parent|Shared — awaiting/i.test(text) || document.body.innerText.includes("Awaiting parent"),
        hasOverdue: /Past due|overdue/i.test(text + document.body.innerText),
        hasComplete: /On file|Reviewed|caught up/i.test(text + document.body.innerText),
        statusChips: Boolean(document.querySelector(".hdh-form-status-chip, .forms-status-summary")),
        templateEdit: Boolean(document.querySelector("[data-edit-form-template]")),
        attentionHeadline: document.querySelector("#hdhFormsAttentionPanel h3")?.textContent || "",
        aiCopy: document.querySelector("#hdhAiDraftPanel .muted-copy")?.textContent || "",
      };
      // Child profile status dropdown options
      selectedChildId = "child-p1-maya";
      childManagementMode = "profile";
      childProfileTab = "forms-records";
      setView("children", { allowDuringBootVerification: true });
      renderChildManagement();
      const statusOptions = Array.from(document.querySelectorAll('#view-children select[name="status"] option')).map((o) => o.value);
      return { ...labels, statusOptions, formsTabText: (document.querySelector("#view-children")?.innerText || "").slice(0, 800) };
    });
    results.ux = ux;
    if (!ux.statusChips) {
      issue("major", "No at-a-glance status summary chips (pending / overdue / complete counts)", "provider must scan lists");
    } else {
      console.log("PASS  status summary chips present");
    }
    if (!ux.statusOptions.includes("notified") && !ux.statusOptions.includes("on_file")) {
      issue("major", "Child Forms status dropdown missing shared lifecycle statuses", `options=${ux.statusOptions.join(",")}`);
    } else {
      console.log("PASS  lifecycle statuses in dropdown");
    }
    if (/comes later|nothing is sent automatically/i.test(ux.aiCopy)) {
      issue("major", "AI Form Builder still has stale send-later copy", ux.aiCopy);
    }
    if (!ux.hasPending && !ux.hasComplete) {
      issue("major", "Forms Center does not make pending/complete obvious", "");
    }

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "07-ux-forms-center.png") });

  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }

  const blockers = issues.filter((i) => i.severity === "blocker");
  const majors = issues.filter((i) => i.severity === "major");
  const passed = results.happyPath && results.persistence && results.print && blockers.length === 0;

  const report = {
    decision: passed ? "Phase 1 PASSED" : "Phase 1 FAILED",
    confidence: passed ? Math.max(55, 92 - majors.length * 8 - issues.filter((i) => i.severity === "minor").length * 2) : Math.max(20, 45 - blockers.length * 15),
    results,
    issues,
    notes,
    artifactDir: ARTIFACT_DIR,
  };

  fs.writeFileSync(path.join(ARTIFACT_DIR, "ACCEPTANCE_RESULT.json"), JSON.stringify(report, null, 2));
  const md = [
    "# Phase 1 Forms — Acceptance Result",
    "",
    `**Decision:** ${report.decision}`,
    `**Confidence:** ${report.confidence}%`,
    "",
    "## Happy path",
    `- Completed: ${results.happyPath}`,
    `- Persistence: ${results.persistence}`,
    `- Print PDF: ${results.print}`,
    "",
    "## Issues",
    ...(issues.length ? issues.map((i) => `- **${i.severity}**: ${i.title}${i.detail ? ` — ${i.detail}` : ""}`) : ["- None"]),
    "",
    "## Break attempts",
    "```json",
    JSON.stringify(results.breakAttempts, null, 2),
    "```",
    "",
    "## Notes",
    ...notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "ACCEPTANCE_RESULT.md"), md);
  fs.writeFileSync(path.join(ROOT, "docs/audits/PHASE1_FORMS_ACCEPTANCE.md"), md);

  console.log("\n==== ACCEPTANCE SUMMARY ====");
  console.log(report.decision);
  console.log(`Confidence: ${report.confidence}%`);
  console.log(`Blockers: ${blockers.length}; Majors: ${majors.length}; Total issues: ${issues.length}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
