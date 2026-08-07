#!/usr/bin/env node
/**
 * Forms Ecosystem acceptance (testing fence only).
 * Run: npm run test:forms-ecosystem
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/forms-ecosystem";
const SHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");
const OWNER = "forms.eco.owner@example.com";
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

function waitForHealth(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ hostname: "127.0.0.1", port, path: "/api/health" }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - started > timeoutMs) return reject(new Error("health timeout"));
        setTimeout(tick, 200);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) return reject(new Error("health timeout"));
        setTimeout(tick, 200);
      });
    };
    tick();
  });
}

async function main() {
  ensureDirs();
  console.log("Forms Ecosystem acceptance — testing only\n");

  // Static
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const ecoJs = fs.readFileSync(path.join(ROOT, "scripts/forms-ecosystem.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(sw, /SHELL_VERSION = "2026080[45]-[^"]+"/);
  assert.ok(indexHtml.includes(`SHELL_VERSION = "${SHELL}"`), "index.html shell must match service-worker");
  assert.match(sw, /forms-ecosystem\.js\?v=2026080[45]-[^"]+/);
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/llh-lazy-loader.js"), "utf8"), /forms-ecosystem\.js/);
  assert.match(ecoJs, /FormsEcosystem/);
  assert.match(ecoJs, /FIELD_TYPES/);
  assert.match(ecoJs, /REFINE_ACTIONS/);
  assert.match(ecoJs, /dashboardHtml/);
  assert.match(appJs, /FormsEcosystem\.dashboardHtml/);
  assert.match(appJs, /FormsEcosystem\.onFormSigned/);
  assert.match(appJs, /fieldsSchema/);
  assert.match(styles, /\.fe-dashboard/);
  assert.match(styles, /\.fe-beautiful-form/);
  assert.ok(appJs.includes("Asthma Action Plan"));
  assert.ok(appJs.includes("Custody Information"));
  console.log("PASS  static forms-ecosystem markers");

  const storePath = path.join(os.tmpdir(), `llh-fe-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = 4500 + Math.floor(Math.random() * 1000);
  const server = spawnServer({ port, storePath });
  let browser;
  try {
    await waitForHealth(port);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript((email) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          firstName: "Forms",
          lastName: "Eco",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "active",
          stripeSubscriptionStatus: "active",
          programName: "Sunshine Little Learners",
          programSettings: { programName: "Sunshine Little Learners", formTemplates: [], digitalSignatures: true },
        },
      }));
      localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify([]));
      localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([]));
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      localStorage.removeItem("llhFormsEcosystemV1");
      localStorage.removeItem("llhFormsEcosystemAiDraftV1");
    }, OWNER);

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setView === "function" && window.LLHLazyLoader?.ensure, null, { timeout: 60000 });
    await page.waitForFunction(() => {
      try {
        if (typeof isAppBootInteractive === "function") return isAppBootInteractive();
        if (typeof appBootState !== "undefined") return appBootState === "ready" || appBootState === "failed";
      } catch (_e) { /* ignore */ }
      return Boolean(document.body.classList.contains("app-booted"));
    }, null, { timeout: 60000 });
    await page.evaluate(async () => {
      await window.LLHLazyLoader.ensure("forms");
      try { if (typeof loadAccountState === "function") loadAccountState(localStorage.getItem("llhUser")); } catch (_e) { /* ignore */ }
      try { if (typeof updateAuthButtons === "function") updateAuthButtons(); } catch (_e) { /* ignore */ }
      try { if (typeof syncHomeDaycareHubNavVisibility === "function") syncHomeDaycareHubNavVisibility(); } catch (_e) { /* ignore */ }
    });
    await page.waitForFunction(() => typeof FormsEcosystem !== "undefined", null, { timeout: 60000 });

    const audit = await page.evaluate(() => window.FormsEcosystem.auditReport());
    assert.ok(audit.catalogTotal >= 60, `expected >=60 catalog forms, got ${audit.catalogTotal}`);
    assert.equal(audit.categories.length, 7);
    assert.ok(audit.fieldTypes.length >= 18);
    assert.ok(audit.refineActions.length >= 8);
    assert.ok(audit.linkedExisting >= 30, `expected many linked existing, got ${audit.linkedExisting}`);
    assert.ok(audit.newStructured >= 15, `expected new structured forms, got ${audit.newStructured}`);
    console.log(`PASS  catalog audit — total=${audit.catalogTotal} linked=${audit.linkedExisting} new=${audit.newStructured}`);

    // AI generate + refine
    const gen = await page.evaluate(() => {
      const draft = window.FormsEcosystem.generateFromPrompt("Make a medication authorization form.");
      const refined = window.FormsEcosystem.refineSchema("allergies");
      const shorter = window.FormsEcosystem.refineSchema("shorter");
      const spanish = window.FormsEcosystem.refineSchema("spanish");
      return {
        title: draft.schema.title,
        fields: draft.schema.fields.length,
        hasAllergy: refined.schema.fields.some((f) => /allerg/i.test(f.key + f.label)),
        shorterFields: shorter.schema.fields.length,
        language: spanish.schema.language,
        refineCount: window.FormsEcosystem.REFINE_ACTIONS.length,
      };
    });
    assert.match(gen.title, /medication/i);
    assert.ok(gen.hasAllergy);
    assert.ok(gen.shorterFields > 0);
    assert.equal(gen.language, "es");
    console.log(`PASS  AI generate + refine — title=${gen.title} fields=${gen.fields}→${gen.shorterFields} lang=${gen.language}`);

    // Seed a child + open hub
    await page.evaluate(() => {
      const child = {
        id: "child-fe-maya",
        name: "Maya Eco",
        ageGroup: "Preschool",
        parentInfo: "Parent Eco",
        enrollmentDate: "",
        allergies: "",
        emergencyContact: "",
        pickupContacts: "",
      };
      if (typeof saveChildStore === "function") {
        saveChildStore("Profiles", [child]);
        saveChildStore("Documents", []);
      } else {
        localStorage.setItem("llhChild:forms.eco.owner@example.com:Profiles", JSON.stringify([child]));
      }
      localStorage.setItem("llhSelectedChild", child.id);
    });

    await page.evaluate(() => {
      if (typeof setView === "function") setView("home-daycare-hub", { allowDuringBootVerification: true });
      else if (typeof showView === "function") showView("home-daycare-hub");
    });
    await page.waitForSelector("#view-home-daycare-hub.active-view [data-fe-dashboard]", { timeout: 15000 });
    await page.waitForSelector("#view-home-daycare-hub.active-view [data-fe-library]", { timeout: 5000 });
    await page.waitForSelector("#view-home-daycare-hub.active-view [data-fe-ai-builder]", { timeout: 5000 });

    const dash = await page.evaluate(() => {
      const s = window.FormsEcosystem.dashboardStats();
      const centerSections = document.querySelectorAll("[data-fc-section]").length;
      const legacyCategories = document.querySelectorAll("[data-fe-category]").length;
      const cards = document.querySelectorAll(".fe-library-card, .fc-section-card, .fc-form-tile").length;
      return {
        library: s.libraryCount,
        hasDash: Boolean(document.querySelector("[data-fe-dashboard], [data-fc-dashboard]")),
        hasLib: Boolean(document.querySelector("[data-fe-library], [data-fc-sections]")),
        hasAi: Boolean(document.querySelector("[data-fe-ai-builder], [data-fc-ai]")),
        categories: Math.max(centerSections, legacyCategories),
        cards,
        center: Boolean(window.FormsCenter),
      };
    });
    assert.ok(dash.hasDash && dash.hasLib && dash.hasAi);
    assert.ok(dash.categories === 7 || dash.categories === 10, `expected 7 or 10 sections, got ${dash.categories}`);
    assert.ok(dash.cards >= 10 || dash.library >= 60);
    console.log(`PASS  Hub dashboard + library UI — cards=${dash.cards} sections=${dash.categories}`);

    await page.evaluate(() => {
      document.querySelector("[data-dismiss-announcement], [data-dismiss-whats-new], .cookie-accept, [data-cookie-accept]")?.click();
      document.querySelector("button")?.closest?.(".cookie-banner")?.querySelector("button")?.click();
      document.querySelectorAll("button").forEach((btn) => {
        if (/got it|dismiss/i.test(btn.textContent || "")) btn.click();
      });
    });
    await page.locator("[data-fe-dashboard], [data-fc-dashboard]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, "01-forms-dashboard.png"), fullPage: false });
    await page.locator("#feLibraryPanel, #fcSections, [data-fc-sections]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, "02-forms-library.png"), fullPage: false });
    await page.locator("#feAiBuilder, #fcAiChat, [data-fc-ai]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, "03-ai-form-builder.png"), fullPage: false });

    // Beautiful form preview
    await page.evaluate(() => {
      window.FormsEcosystem.generateFromPrompt("Create an enrollment packet for my home daycare.");
      if (typeof renderHomeDaycareHubPage === "function") renderHomeDaycareHubPage({ refreshHouseholds: false });
    });
    await page.waitForSelector(".fe-beautiful-form", { timeout: 8000 });
    await page.locator("#feAiBuilder, #fcAiChat, [data-fc-ai]").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, "04-beautiful-form-preview.png"), fullPage: false });
    console.log("PASS  beautiful form preview");

    // Connections
    const conn = await page.evaluate(() => {
      const item = window.FormsEcosystem.findCatalogItem("Allergy Information");
      const schema = window.FormsEcosystem.cloneSchema(item);
      const doc = {
        id: "doc-fe-allergy",
        childId: "child-fe-maya",
        title: item.title,
        fieldsSchema: schema,
        connections: item.connections,
        signedAt: new Date().toISOString(),
        signedBy: "Parent Eco",
      };
      const result = window.FormsEcosystem.applyConnections(doc, {
        allergies: "Peanuts — EpiPen in bag",
        reactionPlan: "Call 911 and parent",
        emergency1Name: "Sam Parent",
        emergency1Phone: "555-0100",
      });
      const profiles = (typeof childStore === "function" ? childStore("Profiles") : JSON.parse(localStorage.getItem("llhChild:forms.eco.owner@example.com:Profiles") || "[]")) || [];
      const child = profiles.find((c) => c.id === "child-fe-maya");
      // enrollment connection
      const enrollItem = window.FormsEcosystem.findCatalogItem("Enrollment Application");
      const enrollDoc = {
        id: "doc-fe-enroll",
        childId: "child-fe-maya",
        title: enrollItem.title,
        fieldsSchema: window.FormsEcosystem.cloneSchema(enrollItem),
        connections: enrollItem.connections,
        signedAt: new Date().toISOString(),
      };
      window.FormsEcosystem.applyConnections(enrollDoc, {
        parentSignature: "Parent Eco",
        startDate: "2026-08-10",
        pickupList: "Sam Parent 555-0100",
      });
      const after = (typeof childStore === "function" ? childStore("Profiles") : []) || [];
      const child2 = after.find((c) => c.id === "child-fe-maya") || child;
      return {
        updated: result.updated,
        changes: result.changes,
        allergies: child2?.allergies || child?.allergies || "",
        enrollmentStatus: child2?.enrollmentStatus || "",
        pickup: child2?.pickupContacts || "",
      };
    });
    assert.ok(conn.updated || /Peanut/i.test(conn.allergies));
    assert.match(conn.allergies, /Peanut/i);
    assert.equal(conn.enrollmentStatus, "Enrolled");
    assert.match(conn.pickup, /Sam Parent/i);
    console.log(`PASS  automatic connections — allergies + enrolled + pickup`);

    // Field types coverage in a medication form
    const types = await page.evaluate(() => {
      const item = window.FormsEcosystem.findCatalogItem("Medication Authorization");
      const used = new Set(item.fields.map((f) => f.type));
      return {
        used: [...used],
        allSupported: window.FormsEcosystem.FIELD_TYPES.length,
      };
    });
    assert.ok(types.used.includes("signature"));
    assert.ok(types.used.includes("date") || types.used.includes("text"));
    console.log(`PASS  smart fields — form uses ${types.used.length} types; platform supports ${types.allSupported}`);

    await page.locator("[data-fe-dashboard]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, "05-dashboard-after-activity.png"), fullPage: false });

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "audit.json"),
      JSON.stringify({ shell: SHELL, audit, gen, dash, conn, types }, null, 2),
    );

    console.log("\nALL FORMS ECOSYSTEM CHECKS PASSED");
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
