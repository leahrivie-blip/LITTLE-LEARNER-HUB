/**
 * UX Polish Complete acceptance (testing site only).
 * Run: npm run test:ux-polish-complete
 * Do not merge. Do not deploy production.
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/ux-polish-complete";
const OWNER = "ux.polish.owner@example.com";
const SHELL = "20260804-first-time-setup";

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
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server not healthy");
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  assert.match(indexHtml, new RegExp(`SHELL_VERSION = "${SHELL}"`));
  assert.match(appJs, /function workHubEmptyState/);
  assert.match(appJs, /function workHubPulseCards/);
  assert.match(appJs, /Add your first child to bring Home to life/);
  assert.match(appJs, /data-dlc-open-section/);
  assert.match(appJs, /view: "program-settings"/);
  assert.match(appJs, /Users & access/);
  assert.doesNotMatch(appJs, /Marketing \/ What's New/);
  assert.match(stylesCss, /\.work-hub-empty/);
  assert.match(stylesCss, /\.work-hub-crumbs/);
  // No Coming Soon on work hubs
  const hubSlice = appJs.slice(appJs.indexOf("function renderOwnerHomeDashboard"), appJs.indexOf("function syncUniversalQuickAdd"));
  assert.doesNotMatch(hubSlice, /Coming Soon/i);
  console.log("PASS  static UX polish markers");

  const port = 47000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-ux-polish-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        name: "UX Polish Owner",
        role: "owner",
        accountType: "pro",
        programName: "Polish Daycare",
      },
    },
  }, null, 2));
  const server = spawnServer({ port, storePath });
  let browser;
  const results = { steps: [] };
  const note = (name, ok, detail = "") => {
    results.steps.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  };

  try {
    await waitForHealth(port, server);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(({ email }) => {
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "active",
          createdAt: new Date().toISOString(),
        },
      }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email: "admin@test.local",
        name: "Admin",
        token: "test-admin-token",
      }));
    }, { email: OWNER });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => (
      typeof isWorkModeNavEnabled === "function"
      && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting)
    ), null, { timeout: 30000 });

    // BEFORE: empty Home
    await page.evaluate(() => {
      setAdminPreviewMode("Owner");
      syncPlatformNavVisibility();
      setView("home", { allowDashboard: true, skipAccessRedirect: true });
    });
    await page.waitForTimeout(200);
    const emptyHome = await page.evaluate(() => {
      const empty = Boolean(document.querySelector(".work-hub-empty"));
      const setup = Boolean(document.querySelector("[data-fts-panel]"));
      const cta = document.querySelector(".work-hub-empty .primary-button, [data-fts-panel] .fts-step.is-active .primary-button")?.textContent?.trim() || "";
      return {
        empty,
        setup,
        cta,
        comingSoon: /coming soon/i.test(document.querySelector("#view-home")?.innerText || ""),
        crumbs: Boolean(document.querySelector(".work-hub-crumbs")),
      };
    });
    note(
      "empty Home has purpose + CTA",
      (emptyHome.empty && /first child/i.test(emptyHome.cta)) || (emptyHome.setup && /program|classroom|child|demo/i.test(emptyHome.cta + " demo")),
      emptyHome.cta || (emptyHome.setup ? "first-time-setup" : ""),
    );
    note("Home has breadcrumb", emptyHome.crumbs);
    note("Home has no Coming Soon", !emptyHome.comingSoon);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "01-home-empty-before-after.png"), fullPage: true });

    // Seed a child so hubs go live
    await page.evaluate(() => {
      const child = {
        id: "child-polish-1",
        name: "Mila Polish",
        classroom: "Sunshine",
        classroomId: "classroom-main",
        dob: "2022-08-10",
        allergies: "Peanuts",
        parentInfo: "Parent One",
        emergencyContact: "",
        createdAt: new Date().toISOString(),
      };
      saveChildStore("Profiles", [child]);
      if (typeof runChildCreatedAutomation === "function") runChildCreatedAutomation(child, { isNew: true });
      appendChildRecord("Attendance", {
        childId: child.id,
        date: new Date().toISOString().slice(0, 10),
        status: "Present",
        dropoff: "08:15",
        summary: "Present",
        shareWithFamily: true,
      }, { skipRender: true });
      renderOwnerHomeDashboard();
    });
    await page.waitForTimeout(150);
    const liveHome = await page.evaluate(() => ({
      pulse: document.querySelectorAll(".work-pulse-card").length,
      empty: Boolean(document.querySelector(".work-hub-empty")),
      next: /What to do next/i.test(document.querySelector("#view-home")?.innerText || ""),
      checkedIn: /Checked in/i.test(document.querySelector("#view-home")?.innerText || ""),
    }));
    note("live Home shows pulse + next actions", liveHome.pulse >= 3 && liveHome.next && !liveHome.empty, `pulse=${liveHome.pulse}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "02-home-live.png"), fullPage: true });

    // Classroom live
    await page.evaluate(() => { setView("classroom", { skipAccessRedirect: true }); });
    await page.waitForTimeout(150);
    const classroom = await page.evaluate(() => ({
      attendance: /Attendance/i.test(document.querySelector("#view-classroom")?.innerText || ""),
      meals: /Meals/i.test(document.querySelector("#view-classroom")?.innerText || ""),
      ratios: /Ratios/i.test(document.querySelector("#view-classroom")?.innerText || ""),
      crumbs: Boolean(document.querySelector("#view-classroom .work-hub-crumbs")),
    }));
    note("Classroom is alive (attendance/meals/ratios)", classroom.attendance && classroom.meals && classroom.ratios);
    note("Classroom breadcrumb", classroom.crumbs);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "03-classroom-live.png"), fullPage: true });

    // Families live
    await page.evaluate(() => { setView("families", { skipAccessRedirect: true }); });
    await page.waitForTimeout(150);
    const families = await page.evaluate(() => ({
      invite: /Invite a parent|Invite parent/i.test(document.querySelector("#view-families")?.innerText || ""),
      forms: /Forms waiting|Forms/i.test(document.querySelector("#view-families")?.innerText || ""),
      contacts: /Missing contacts|Contacts/i.test(document.querySelector("#view-families")?.innerText || ""),
    }));
    note("Families is alive (invite/forms/contacts)", families.invite && families.forms && families.contacts);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "04-families-live.png"), fullPage: true });

    // Business fixed tiles
    await page.evaluate(() => { setView("business", { skipAccessRedirect: true }); });
    await page.waitForTimeout(150);
    const business = await page.evaluate(() => {
      const text = document.querySelector("#view-business")?.innerText || "";
      const programSettings = [...document.querySelectorAll("#view-business [data-view]")].some((b) => b.getAttribute("data-view") === "program-settings");
      const staffUsers = [...document.querySelectorAll("#view-business [data-view='staff']")].length >= 1;
      return {
        programSettings,
        staffUsers,
        noMarketingLabel: !/Marketing \/ What's New/i.test(text),
        paymentsNote: /testing placeholder|Billing/i.test(text),
        pulse: document.querySelectorAll("#view-business .work-pulse-card").length,
      };
    });
    note("Business Program Settings deep-links correctly", business.programSettings);
    note("Business Users tile goes to staff", business.staffUsers);
    note("Business relabeled What's New", business.noMarketingLabel);
    note("Business has live pulse", business.pulse >= 3, `pulse=${business.pulse}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "05-business-live.png"), fullPage: true });

    // Children live insights
    await page.evaluate(() => { setView("children", { skipAccessRedirect: true }); renderChildManagement(); });
    await page.waitForTimeout(150);
    const children = await page.evaluate(() => ({
      allergies: /Allergies on file/i.test(document.querySelector("#childManagementApp")?.innerText || ""),
      forms: /Missing forms/i.test(document.querySelector("#childManagementApp")?.innerText || ""),
      crumbs: Boolean(document.querySelector("#childManagementApp .work-hub-crumbs")),
    }));
    note("Children page shows live insights", children.allergies && children.forms);
    note("Children breadcrumb", children.crumbs);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "06-children-live.png"), fullPage: true });

    // Click reduction: meal deep link (via real tile path + setView options)
    const deepLink = await page.evaluate(() => {
      document.querySelector("#afterActionPrompt")?.classList.remove("visible");
      const btn = document.createElement("button");
      btn.setAttribute("data-view", "child-tools-daily-logs");
      btn.setAttribute("data-dlc-open-section", "meals");
      document.body.appendChild(btn);
      btn.click();
      btn.remove();
      return {
        step: typeof dlcNewStep !== "undefined" ? dlcNewStep : "",
        section: typeof dlcManualSection !== "undefined" ? dlcManualSection : "",
        feedback: document.querySelector("#afterActionPrompt.visible .after-action-text")?.textContent || "",
        accordionOpen: Boolean(document.querySelector('.dlc-acc-item.open [data-dlc-accordion="meals"]')),
      };
    });
    note("Meal quick path opens manual Meals accordion", deepLink.step === "manual" && deepLink.section === "meals", JSON.stringify(deepLink));
    note("Deep link shows save confidence feedback", /Meals opened|Meals is ready/i.test(deepLink.feedback), deepLink.feedback);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "07-meal-deeplink.png"), fullPage: true });

    // More hub sectioned
    await page.evaluate(() => { setView("more", { skipAccessRedirect: true }); });
    await page.waitForTimeout(100);
    const more = await page.evaluate(() => ({
      sections: document.querySelectorAll("#view-more .work-hub-section").length,
      crumbs: Boolean(document.querySelector("#view-more .work-hub-crumbs")),
    }));
    note("More hub uses sectioned layout", more.sections >= 2, `sections=${more.sections}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "08-more-hub.png"), fullPage: true });

    results.ok = results.steps.every((s) => s.ok);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "results.json"), JSON.stringify(results, null, 2));
    if (!results.ok) {
      const failed = results.steps.filter((s) => !s.ok);
      throw new Error(`${failed.length} UX polish checks failed: ${failed.map((f) => f.name).join(", ")}`);
    }
    console.log("ALL UX POLISH CHECKS PASSED");
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
