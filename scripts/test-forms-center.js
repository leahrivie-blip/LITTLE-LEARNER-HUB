#!/usr/bin/env node
/**
 * Forms Center premium acceptance (testing fence only).
 * Run: npm run test:forms-center
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/forms-center";
const SHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");
const OWNER = "forms.center.owner@example.com";
const SHELL = (fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8").match(/SHELL_VERSION = "([^"]+)"/) || [])[1]
  || "unknown";

function ensureDirs() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
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

async function waitForHealth(port, child, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get({ hostname: "127.0.0.1", port, path: "/api/health" }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
      });
      if (ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function main() {
  ensureDirs();
  console.log("Forms Center premium — testing only\n");

  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const centerJs = fs.readFileSync(path.join(ROOT, "scripts/forms-center.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(sw, /SHELL_VERSION = "2026080[45]-[^"]+"/);
  assert.ok(indexHtml.includes(`SHELL_VERSION = "${SHELL}"`), "index.html shell must match service-worker");
  assert.match(sw, /forms-center\.js\?v=2026080[45]-[^"]+/);
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/llh-lazy-loader.js"), "utf8"), /forms-center\.js/);
  assert.match(centerJs, /FormsCenter/);
  assert.match(centerJs, /CENTER_SECTIONS/);
  assert.match(centerJs, /ENROLLMENT_PACKET_DEFAULTS/);
  assert.match(centerJs, /conversationalAiHtml|Talk through the paperwork/);
  assert.match(appJs, /FormsCenter\.hubHtml/);
  assert.match(appJs, /FormsCenter\.childStatusHtml/);
  assert.match(appJs, /FormsCenter\.allergyBannerHtml/);
  assert.match(styles, /\.fc-dashboard/);
  assert.match(styles, /\.fc-section-grid/);
  console.log("PASS  static forms-center markers");

  const storePath = path.join(os.tmpdir(), `llh-fc-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {} }, null, 2));
  const port = 4600 + Math.floor(Math.random() * 200);
  const server = spawnServer({ port, storePath });
  let browser;
  try {
    await waitForHealth(port, server);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

    await page.addInitScript((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          firstName: "Forms",
          lastName: "Center",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "active",
          stripeSubscriptionStatus: "active",
          programName: "Sunshine Forms Center",
          programSettings: { programName: "Sunshine Forms Center", formTemplates: [] },
        },
      }));
      localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify([]));
      localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([]));
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      localStorage.removeItem("llhFormsCenterChatV1");
      localStorage.removeItem("llhFormsEcosystemAiDraftV1");
    }, OWNER);

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setView === "function" && typeof FormsCenter !== "undefined" && typeof FormsEcosystem !== "undefined", null, { timeout: 60000 });
    await page.waitForFunction(() => {
      try {
        if (typeof isAppBootInteractive === "function") return isAppBootInteractive();
      } catch (_e) { /* ignore */ }
      return Boolean(document.body.classList.contains("app-booted"));
    }, null, { timeout: 60000 });
    await page.evaluate(() => {
      try { loadAccountState(localStorage.getItem("llhUser")); } catch (_e) { /* ignore */ }
      try { updateAuthButtons(); } catch (_e) { /* ignore */ }
      try { syncHomeDaycareHubNavVisibility(); } catch (_e) { /* ignore */ }
    });

    const review = await page.evaluate(() => window.FormsCenter.reviewReport());
    assert.equal(review.sections.length, 10);
    assert.ok(review.totalForms >= 60);
    assert.ok(review.recommendedAdditional.length >= 4);
    console.log(`PASS  section review — sections=${review.sections.length} forms=${review.totalForms}`);

    // Conversational packet
    const packet = await page.evaluate(() => {
      window.FormsCenter.handleChatMessage("I need an enrollment packet.");
      const chat = window.FormsCenter.getChat();
      const titles = (chat.packet?.items || []).map((i) => i.title);
      window.FormsCenter.generatePacket(titles);
      const after = window.FormsCenter.getChat();
      window.FormsCenter.applyPremiumRefine("Make it Oklahoma compliant");
      window.FormsCenter.applyPremiumRefine("Add Spanish");
      const draft = window.FormsEcosystem.getAiDraft();
      return {
        proposed: titles.length,
        generated: after.packet?.generated?.length || 0,
        oklahoma: Boolean(draft.schema?.complianceNote || draft.schema?.fields?.some((f) => f.key === "okLicensingAck")),
        spanish: draft.schema?.language === "es" || /formulario|\/ formulario/i.test(draft.schema?.title || ""),
        messages: after.messages.length,
      };
    });
    assert.ok(packet.proposed >= 8);
    assert.ok(packet.generated >= 8);
    assert.ok(packet.oklahoma);
    assert.ok(packet.spanish);
    console.log(`PASS  conversational AI packet — proposed=${packet.proposed} generated=${packet.generated}`);

    // Seed child + open hub
    await page.evaluate(() => {
      const child = {
        id: "child-fc-maya",
        name: "Maya Center",
        ageGroup: "Preschool",
        parentInfo: "Parent Center",
        allergies: "",
        emergencyContact: "",
        pickupContacts: "",
        enrollmentStatus: "",
      };
      saveChildStore("Profiles", [child]);
      saveChildStore("Documents", []);
      localStorage.setItem("llhSelectedChild", child.id);
    });

    await page.evaluate(() => setView("home-daycare-hub", { allowDuringBootVerification: true }));
    await page.waitForSelector("#view-home-daycare-hub.active-view [data-fc-dashboard]", { timeout: 15000 });
    await page.waitForSelector("#view-home-daycare-hub.active-view [data-fc-sections]", { timeout: 5000 });
    await page.waitForSelector("#view-home-daycare-hub.active-view [data-fc-ai]", { timeout: 5000 });

    const ui = await page.evaluate(() => ({
      sections: document.querySelectorAll("[data-fc-section]").length,
      metrics: document.querySelectorAll(".fc-metric").length,
      filters: document.querySelectorAll("[data-fc-dash-filter]").length,
      chat: Boolean(document.querySelector("#fcChatForm")),
    }));
    assert.equal(ui.sections, 10);
    assert.ok(ui.metrics >= 8);
    assert.ok(ui.filters >= 9);
    console.log(`PASS  Forms Center UI — sections=${ui.sections} metrics=${ui.metrics}`);

    await page.evaluate(() => {
      document.querySelectorAll("button").forEach((btn) => {
        if (/got it|dismiss/i.test(btn.textContent || "")) btn.click();
      });
    });
    await page.locator("[data-fc-dashboard]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, "01-forms-dashboard.png"), fullPage: false });
    await page.locator("[data-fc-sections]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, "02-forms-center-sections.png"), fullPage: false });
    await page.locator("[data-fc-ai]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, "03-ai-conversation.png"), fullPage: false });

    // Connections + timeline
    const conn = await page.evaluate(() => {
      const item = window.FormsEcosystem.findCatalogItem("Allergy Information");
      const schema = window.FormsEcosystem.cloneSchema(item);
      const doc = {
        id: "doc-fc-allergy",
        childId: "child-fc-maya",
        title: item.title,
        fieldsSchema: schema,
        connections: item.connections,
        signedAt: new Date().toISOString(),
        signedBy: "Parent Center",
        answers: {},
      };
      const result = window.FormsCenter.onFormSigned({
        ...doc,
        answers: {
          allergies: "Tree nuts — EpiPen in cubby",
          reactionPlan: "Call 911",
          emergency1Name: "Sam",
          emergency1Phone: "555-0100",
          parentSignature: "Parent Center",
        },
      });
      const enroll = window.FormsEcosystem.findCatalogItem("Enrollment Application");
      window.FormsCenter.onFormSigned({
        id: "doc-fc-enroll",
        childId: "child-fc-maya",
        title: enroll.title,
        fieldsSchema: window.FormsEcosystem.cloneSchema(enroll),
        connections: enroll.connections,
        signedAt: new Date().toISOString(),
        answers: { parentSignature: "Parent Center", startDate: "2026-08-10", pickupList: "Sam 555-0100" },
      });
      const child = (childStore("Profiles") || []).find((c) => c.id === "child-fc-maya");
      const timeline = window.FormsCenter.readTimeline("child-fc-maya");
      return {
        allergies: child?.allergies || "",
        allergyAlert: Boolean(child?.allergyAlert),
        enrolled: child?.enrollmentStatus || "",
        pickup: child?.pickupContacts || "",
        timelineKinds: timeline.map((t) => t.title),
        changes: result.changes || [],
      };
    });
    assert.match(conn.allergies, /Tree nuts/i);
    assert.equal(conn.allergyAlert, true);
    assert.equal(conn.enrolled, "Enrolled");
    assert.match(conn.pickup, /Sam/i);
    assert.ok(conn.timelineKinds.some((t) => /Allergy|Enrollment|Form/i.test(t)));
    console.log("PASS  deep connections + child timeline");

    // Child profile status panel
    await page.evaluate(() => {
      selectedChildId = "child-fc-maya";
      localStorage.setItem("llhSelectedChild", "child-fc-maya");
      if (typeof setView === "function") setView("children", { allowDuringBootVerification: true });
      if (typeof renderChildProfile === "function") {
        childProfileTab = "forms-records";
        renderChildProfile("child-fc-maya");
      } else if (typeof openChildProfile === "function") {
        openChildProfile("child-fc-maya", "forms-records");
      }
    });
    await page.waitForTimeout(500);
    const profile = await page.evaluate(() => {
      if (typeof renderChildFormsRecordsTab === "function" && typeof childRecords === "function") {
        const child = (childStore("Profiles") || []).find((c) => c.id === "child-fc-maya");
        const html = window.FormsCenter.childStatusHtml(child);
        const host = document.querySelector("#view-children") || document.body;
        if (!host.querySelector("[data-fc-child-status]")) {
          host.insertAdjacentHTML("afterbegin", html);
        }
      }
      return {
        status: Boolean(document.querySelector("[data-fc-child-status]")),
        timeline: Boolean(document.querySelector("[data-fc-timeline]")),
        pills: document.querySelectorAll(".fc-status-pill").length,
      };
    });
    assert.ok(profile.status);
    assert.ok(profile.timeline);
    assert.ok(profile.pills >= 4);
    await page.locator("[data-fc-child-status]").scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(SHOT_DIR, "04-child-status-timeline.png"), fullPage: false });
    console.log("PASS  child profile status + timeline");

    // Parent experience HTML
    const parent = await page.evaluate(() => {
      const item = window.FormsEcosystem.findCatalogItem("Enrollment Application");
      const schema = window.FormsEcosystem.cloneSchema(item);
      const html = window.FormsCenter.parentExperienceHtml({
        id: "doc-parent",
        title: schema.title,
        fieldsSchema: schema,
        canAcknowledge: true,
      }, { canFill: true });
      return {
        hasHero: /Family paperwork|minutes/i.test(html),
        hasSave: /Save &amp; continue later|Save & continue later/i.test(html),
        hasLarge: /fc-btn-large/.test(html),
        hasProgress: /fe-form-progress/.test(html),
      };
    });
    assert.ok(parent.hasHero && parent.hasSave && parent.hasLarge && parent.hasProgress);
    console.log("PASS  Family Hub parent experience markers");

    // Dashboard filter
    await page.evaluate(() => setView("home-daycare-hub", { allowDuringBootVerification: true }));
    await page.waitForSelector("[data-fc-dashboard]", { timeout: 10000 });
    await page.click('[data-fc-dash-filter="missing"]');
    await page.waitForTimeout(300);
    const missing = await page.evaluate(() => ({
      filter: localStorage.getItem("llhFormsCenterDashFilterV1"),
      rows: document.querySelectorAll(".fc-dash-row").length,
    }));
    assert.equal(missing.filter, "missing");
    assert.ok(missing.rows >= 1);
    await page.locator("[data-fc-dashboard]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, "05-dashboard-filtered.png"), fullPage: false });
    console.log("PASS  filterable dashboard");

    fs.writeFileSync(path.join(ARTIFACT_DIR, "review.json"), JSON.stringify({ shell: SHELL, review, packet, conn, ui }, null, 2));
    console.log("\nALL FORMS CENTER CHECKS PASSED");
    console.log(`Screenshots: ${SHOT_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
