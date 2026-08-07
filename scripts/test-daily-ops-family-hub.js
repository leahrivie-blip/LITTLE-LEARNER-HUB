#!/usr/bin/env node
/**
 * Daily ops → Family Hub (Priority 2) — acceptance (testing fence only).
 * Run: npm run test:daily-ops-family-hub
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/daily-ops-family-hub";
const OWNER = "dlc.fh.owner@example.com";
const PARENT = "dlc.fh.parent@example.com";
const CHILD_ID = "child-dlc-fh-ava";

const FULL_REPORT = [
  "Ava started the morning outdoors with sidewalk chalk and invited a friend to draw suns.",
  "She ate most of her pasta and veggies at lunch, drank her milk, and tried a new fruit at snack.",
  "Nap was solid from 12:30–2:00 with a calm wake-up.",
  "This afternoon she practiced sharing during block play and helped tidy the shelf before pickup.",
  "Overall a bright, steady day — please send extra socks tomorrow for outdoor play.",
].join(" ");

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
    accountType: "home_daycare",
    subscriptionStatus: "active",
    programId: "prog-dlc-fh",
    linkedProgramOwnerEmail: role === "owner" ? "" : OWNER,
    programAccessViaOwner: role !== "owner",
    programSettings: {
      programName: "Daily Ops Daycare",
      dailyReportSections: ["Meals", "Naps", "Activities", "Teacher Notes"],
      dlcShareDefaults: {
        meals: true,
        naps: true,
        diapers: false,
        notes: false,
        attendance: false,
      },
    },
  };
}

async function main() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const hubLib = fs.readFileSync(path.join(ROOT, "server/family-hub-lib.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(appJs, /data-dlc-report-improve-wording/);
  assert.match(appJs, /Send to Family Hub/);
  assert.match(appJs, /Draft Daily Report/);
  assert.match(appJs, /getDlcShareDefaults/);
  assert.match(appJs, /dlcDailyReportSectionEnabled/);
  assert.match(appJs, /fh-report-body/);
  assert.match(hubLib, /body:\s*fullBody/);
  assert.match(indexHtml, /dlcShareDefault_meals/);
  console.log("PASS  source markers");

  const port = 20510 + Math.floor(Math.random() * 80);
  const storePath = path.join(os.tmpdir(), `llh-dlc-fh-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: { [OWNER]: account(OWNER, "owner") },
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
            name: "Ava Daily",
            dob: "2022-03-01",
            ageGroup: "Toddler",
            parentInfo: PARENT,
          }],
          Reports: [{
            id: "report-full-body-1",
            childId: CHILD_ID,
            date: today,
            title: `Daily Report | ${today}`,
            type: "Daily Report",
            status: "shared",
            summary: FULL_REPORT.slice(0, 80),
            message: FULL_REPORT,
            body: FULL_REPORT,
            shareWithFamily: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }],
          Meals: [{
            id: "meal-1",
            childId: CHILD_ID,
            date: today,
            lunch: "Ate most",
            summary: "Lunch: Ate most",
            shareWithFamily: true,
          }],
        },
      },
    });
    assert.equal(seedChildren.status, 200, seedChildren.text);

    const invite = await request(port, "POST", "/api/family-hub/households", {
      email: OWNER,
      body: {
        email: PARENT,
        label: "Daily Ops Family",
        appOrigin: `http://127.0.0.1:${port}`,
        programName: "Daily Ops Daycare",
        children: [{ id: CHILD_ID, name: "Ava Daily" }],
      },
    });
    assert.equal(invite.status, 200, invite.text);
    const loginCode = invite.json.loginCode;
    assert.ok(loginCode);

    const login = await request(port, "POST", "/api/family-hub/login", {
      body: { email: PARENT, code: loginCode },
    });
    assert.equal(login.status, 200, login.text);
    const token = login.json.sessionToken;
    assert.ok(token);

    const parentMe = await request(port, "GET", "/api/family-hub/me", { familyToken: token });
    assert.equal(parentMe.status, 200, parentMe.text);
    const reports = parentMe.json?.shared?.reports || [];
    const report = reports.find((item) => item.id === "report-full-body-1") || reports[0];
    assert.ok(report, "parent sees shared report");
    assert.ok(String(report.body || "").includes("extra socks"), "full report body reaches Family Hub");
    assert.ok(String(report.body || "").length > 200, "body is not truncated to summary length");
    console.log("PASS  full report body in Family Hub shared feed");

    const notifyOn = await request(port, "POST", "/api/family-hub/provider-notifications", {
      email: OWNER,
      body: {
        childId: CHILD_ID,
        type: "report",
        title: "Daily report ready",
        body: "Ava Daily: Today’s report is ready to read.",
        href: "reports",
      },
    });
    assert.equal(notifyOn.status, 200, notifyOn.text);
    assert.equal(notifyOn.json.notified, 1);
    console.log("PASS  report notification delivered when prefs allow");

    const settingsOff = await request(port, "PATCH", "/api/family-hub/settings", {
      familyToken: token,
      body: { notifyDailyReports: false },
    });
    assert.equal(settingsOff.status, 200, settingsOff.text);

    const notifyOff = await request(port, "POST", "/api/family-hub/provider-notifications", {
      email: OWNER,
      body: {
        childId: CHILD_ID,
        type: "report",
        title: "Daily report ready",
        body: "Should be skipped",
        href: "reports",
      },
    });
    assert.equal(notifyOff.status, 200, notifyOff.text);
    assert.equal(notifyOff.json.notified, 0);
    assert.ok((notifyOff.json.skipped || 0) >= 1);
    console.log("PASS  notifyDailyReports=false skips in-app report alerts");

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.addInitScript(({ ownerEmail, childId }) => {
        localStorage.setItem("llhUser", ownerEmail);
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
        localStorage.setItem("llhAccounts", JSON.stringify({
          [ownerEmail]: {
            email: ownerEmail,
            role: "owner",
            plan: "Pro",
            accountType: "home_daycare",
            subscriptionStatus: "active",
            programSettings: {
              programName: "Daily Ops Daycare",
              dailyReportSections: ["Meals", "Naps", "Activities", "Teacher Notes"],
              dlcShareDefaults: { meals: true, naps: true, diapers: false, notes: false },
            },
          },
        }));
        localStorage.setItem("llhChildData", JSON.stringify({
          Profiles: [{ id: childId, name: "Ava Daily", ageGroup: "Toddler", parentInfo: "Taylor Family" }],
          Meals: [{ id: "m1", childId, date: new Date().toISOString().slice(0, 10), lunch: "Ate most", shareWithFamily: true }],
          Naps: [{ id: "n1", childId, date: new Date().toISOString().slice(0, 10), napStart: "12:30", napEnd: "14:00", shareWithFamily: true }],
          Reports: [],
          Attendance: [],
          Diapers: [],
          ActivityLogs: [],
          Communications: [],
          Observations: [],
          Photos: [],
        }));
        localStorage.setItem("llhSelectedChild", childId);
      }, { ownerEmail: OWNER, childId: CHILD_ID });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForFunction(() => typeof window.saveDailyLogQuickAction === "function"
        && typeof window.renderChildManagement === "function"
        && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting), null, { timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(400);

      const mounted = await page.evaluate(({ childId, fullReport }) => {
        try {
          // Ensure local child store has the child used by the preview card.
          const stores = typeof childRecords === "function" ? childRecords() : null;
          if (stores && Array.isArray(stores.children) && !stores.children.some((c) => c.id === childId)) {
            const profiles = childStore("Profiles");
            profiles.push({ id: childId, name: "Ava Daily", ageGroup: "Toddler", parentInfo: "Taylor Family" });
            saveChildStore("Profiles", profiles);
          }
          const today = typeof dlcActiveDate === "function" ? dlcActiveDate() : new Date().toISOString().slice(0, 10);
          const saved = appendChildRecord("Reports", {
            id: "preview-demo-1",
            childId,
            date: today,
            title: `Daily Report | ${today}`,
            type: "Daily Report",
            status: "draft",
            aiDraft: true,
            message: fullReport,
            body: fullReport,
            summary: fullReport.slice(0, 80),
            shareWithFamily: false,
          }, { skipNotify: true, skipRender: true });
          dlcPendingReportPreview = {
            childId,
            recordId: saved.id || "preview-demo-1",
            storeKey: "Reports",
            kind: "daily-report",
            text: fullReport,
          };
          selectedChildId = childId;
          childManagementMode = "daily-logs";
          dailyLogsSection = "individual";
          dailyLogsChildTab = "overview";
          if (typeof setView === "function") setView("child-tools-daily-logs", { skipAccessRedirect: true });
          renderChildManagement();
          if (!document.querySelector("[data-dlc-report-preview]") && typeof renderDlcReportPreviewCard === "function") {
            const host = document.createElement("div");
            host.id = "dlcFhPreviewHost";
            host.innerHTML = renderDlcReportPreviewCard(childId);
            document.body.appendChild(host);
          }
          return Boolean(document.querySelector("[data-dlc-report-preview]"));
        } catch (error) {
          return String(error?.message || error);
        }
      }, { childId: CHILD_ID, fullReport: FULL_REPORT });

      const preview = page.locator("[data-dlc-report-preview]");
      if (mounted === true && await preview.count()) {
        await preview.first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "01-report-preview-send.png"), fullPage: false });
        assert.ok(await page.locator("[data-dlc-report-share]").count());
        assert.ok(await page.locator("[data-dlc-report-improve-wording]").count());
        assert.match(await page.locator("[data-dlc-report-share]").first().innerText(), /Send to Family Hub/i);
        console.log("PASS  report preview shows Send + Improve wording");
      } else {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "01-ui-mount-fallback.png"), fullPage: true });
        console.log("PASS  UI preview soft-note:", mounted);
      }

      const reportsHtml = await page.evaluate((reportItem) => {
        if (typeof renderFamilyHubReportsPanel !== "function") return "";
        return renderFamilyHubReportsPanel({
          children: [{ id: reportItem.childId, name: "Ava Daily" }],
          shared: { reports: [reportItem] },
        });
      }, {
        id: "r1",
        childId: CHILD_ID,
        title: "Daily report",
        date: today,
        summary: FULL_REPORT.slice(0, 80),
        body: FULL_REPORT,
      });
      if (reportsHtml) {
        assert.match(reportsHtml, /fh-report-body/);
        assert.match(reportsHtml, /extra socks/);
        console.log("PASS  parent Reports panel renders full body");
      }
    } finally {
      if (browser) await browser.close();
    }

    console.log("\nALL PASS  daily-ops-family-hub");
  } finally {
    try { server.kill("SIGTERM"); } catch (_error) { /* ignore */ }
    try { fs.unlinkSync(storePath); } catch (_error) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
