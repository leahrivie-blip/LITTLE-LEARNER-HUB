/**
 * Smart Automation Pass acceptance (testing site only).
 * Run: npm run test:smart-automation
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/smart-automation";
const OWNER = "smart.auto.owner@example.com";
const SHELL = "20260805-tk-owner-preview-r2";

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

  assert.match(indexHtml, new RegExp(`SHELL_VERSION = "${SHELL}"`));
  assert.match(appJs, /function isSmartAutomationEnabled/);
  assert.match(appJs, /function runChildCreatedAutomation/);
  assert.match(appJs, /function runIncidentAutomation/);
  assert.match(appJs, /function runObservationAutomation/);
  assert.match(appJs, /function runFormSignedAutomation/);
  assert.match(appJs, /function runLessonAssignedAutomation/);
  assert.match(appJs, /function buildActionOnlyAttentionCards/);
  assert.match(appJs, /function syncWhatsNewNavVisibility/);
  assert.match(appJs, /AutomationEvents/);
  // Meals/attendance stay off the Family Hub push allowlist (silent Today updates).
  assert.match(appJs, /Meals \/ attendance \/ naps stay silent/);
  assert.equal(appJs.includes('["Photos", "Reports", "Observations", "Goals", "SupportPlans"]'), true);
  console.log("PASS  static smart-automation markers");

  const port = 45000 + Math.floor(Math.random() * 10000);
  const storePath = path.join(os.tmpdir(), `llh-smart-auto-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        name: "Smart Auto Owner",
        role: "owner",
        accountType: "pro",
        programName: "Automation Daycare",
      },
    },
  }, null, 2));
  const child = spawnServer({ port, storePath });
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(port, child);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
      typeof isSmartAutomationEnabled === "function"
      && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting)
    ), null, { timeout: 30000 });
    await page.waitForTimeout(200);

    const results = await page.evaluate(async (ownerEmail) => {
      const out = { steps: [] };
      const note = (name, ok, detail = "") => out.steps.push({ name, ok, detail });

      if (typeof setAdminPreviewMode === "function") setAdminPreviewMode("Owner");
      if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();

      const enabled = typeof isSmartAutomationEnabled === "function" && isSmartAutomationEnabled();
      note("smart automation enabled", enabled);

      const child = {
        id: `child-auto-${Date.now()}`,
        name: "Avery Auto",
        classroom: "Sunshine",
        classroomId: "classroom-main",
        dob: "2022-05-01",
        ageGroup: "Toddler",
        createdAt: new Date().toISOString(),
      };
      const profiles = (typeof childStore === "function" ? childStore("Profiles") : []) || [];
      saveChildStore("Profiles", [...profiles, child]);
      const created = runChildCreatedAutomation(child, { isNew: true }) || {};
      const events = childStore("AutomationEvents") || [];
      const docs = (childStore("Documents") || []).filter((d) => d.childId === child.id);
      note("child create timeline", events.some((e) => e.childId === child.id && /enrolled/i.test(e.title || "")), `${events.length} events`);
      note("child create forms folder", created.formsAdded > 0 || docs.length > 0, `formsAdded=${created.formsAdded} docs=${docs.length}`);
      note("child readiness markers", Boolean((childStore("Profiles").find((c) => c.id === child.id) || {}).automation?.timelineReady));

      const attendance = appendChildRecord("Attendance", {
        childId: child.id,
        date: new Date().toISOString().slice(0, 10),
        status: "Present",
        dropoff: "08:30",
        title: "Attendance",
        summary: "Present at 08:30",
        shareWithFamily: true,
      }, { skipRender: true });
      note("attendance saved", Boolean(attendance?.id));

      const meal = appendChildRecord("Meals", {
        childId: child.id,
        date: new Date().toISOString().slice(0, 10),
        lunch: "Ate all",
        title: "Meals",
        summary: "Lunch: Ate all",
        shareWithFamily: true,
      }, { skipRender: true });
      note("meal saved", Boolean(meal?.id));

      const obs = appendChildRecord("Observations", {
        childId: child.id,
        date: new Date().toISOString().slice(0, 10),
        text: "Avery used new language during circle time and asked a peer for the red block.",
        summary: "Language moment at circle",
        area: "Language",
        shareWithFamily: true,
      }, { skipRender: true });
      const goals = (childStore("Goals") || []).filter((g) => g.childId === child.id);
      note("observation goal suggestion", goals.length > 0, `goals=${goals.length}`);
      const ops = typeof listOpsAlerts === "function" ? listOpsAlerts() : [];
      note("observation shared alert", ops.some((a) => a.type === "observation_shared"), `ops=${ops.length}`);

      const incident = appendChildRecord("Communications", {
        childId: child.id,
        date: new Date().toISOString().slice(0, 10),
        type: "Incident Report",
        title: "Incident",
        summary: "Minor bump on playground; ice pack applied; child calm.",
        description: "Minor bump on playground; ice pack applied; child calm.",
        shareWithFamily: false,
      }, { skipRender: true });
      const incidentDocs = (childStore("Documents") || []).filter((d) => d.sourceRecordId === incident.id);
      const drafts = (childStore("Communications") || []).filter((c) => c.sourceIncidentId === incident.id && /parent message/i.test(c.type || ""));
      const behavior = (childStore("Communications") || []).filter((c) => c.sourceIncidentId === incident.id && /behavior/i.test(c.type || ""));
      note("incident internal document", incidentDocs.length > 0);
      note("incident parent draft", drafts.length > 0);
      note("incident behavior history", behavior.length > 0);
      note("incident director alert", (typeof listOpsAlerts === "function" ? listOpsAlerts() : []).some((a) => a.type === "incident_review"));

      const signed = {
        id: `Documents-signed-${Date.now()}`,
        childId: child.id,
        title: "Enrollment Agreement",
        status: "signed",
        statusLabel: "Signed",
        signedAt: new Date().toISOString(),
        signedBy: "Parent Auto",
      };
      saveChildStore("Documents", [...(childStore("Documents") || []), signed]);
      runFormSignedAutomation(signed);
      const formEvents = (childStore("AutomationEvents") || []).filter((e) => e.childId === child.id && /signed form/i.test(e.title || ""));
      note("form signed timeline", formEvents.length > 0);
      note("form signed alert", (listOpsAlerts() || []).some((a) => a.type === "form_signed"));

      runLessonAssignedAutomation({
        lessonPlanTitle: "Colors & Counting",
        classroomId: "classroom-main",
        childIds: [child.id],
        weekStartDate: new Date().toISOString().slice(0, 10),
      }, { classroomId: "classroom-main", childIds: [child.id] });
      note("lesson assigned timeline", (childStore("AutomationEvents") || []).some((e) => /lesson assigned/i.test(e.title || "")));
      note("lesson assigned alert", (listOpsAlerts() || []).some((a) => a.type === "lesson_assigned"));

      const attention = typeof buildActionOnlyAttentionCards === "function" ? buildActionOnlyAttentionCards() : [];
      note("action-only attention cards", Array.isArray(attention) && attention.every((c) => c.title && c.view), `cards=${attention.length}`);
      // No placeholder-only business/AI empty cards when nothing pending beyond real alerts
      note("no empty placeholder titles", !attention.some((c) => /open families → messages/i.test(c.detail || "")));

      const timeline = typeof childTimelineEntries === "function"
        ? childTimelineEntries(child, childRecords())
        : [];
      note("timeline includes forms", timeline.some((e) => e.type === "Forms" || e.storeKey === "Documents"));

      out.ok = out.steps.every((s) => s.ok);
      return out;
    }, OWNER);

    fs.writeFileSync(path.join(ARTIFACT_DIR, "results.json"), JSON.stringify(results, null, 2));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "smart-automation.png"), fullPage: true });

    const failed = results.steps.filter((s) => !s.ok);
    if (failed.length) {
      console.error("FAIL steps:", failed);
      throw new Error(`${failed.length} smart automation checks failed`);
    }
    console.log("PASS  browser smart-automation connections");
    results.steps.forEach((s) => console.log(`  ✓ ${s.name}${s.detail ? ` (${s.detail})` : ""}`));
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
