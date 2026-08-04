/**
 * Day Assistant acceptance (testing site only).
 * Morning brief · quiet mid-day helpers · end-of-day wrap · Family Hub warmth · no tester chrome for providers.
 * Run: npm run test:day-assistant
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/day-assistant";
const OWNER = "day.assistant.owner@example.com";
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
  assert.match(appJs, /function buildDayAssistantSnapshot/);
  assert.match(appJs, /function dayAssistantBriefHtml/);
  assert.match(appJs, /function dayAssistantEndOfDayHtml/);
  assert.match(appJs, /What deserves attention today/);
  assert.match(appJs, /Suggested first task/);
  assert.match(appJs, /meal_skipped/);
  assert.match(appJs, /report_due/);
  assert.match(appJs, /Family invite link/);
  assert.match(appJs, /See what parents see/);
  assert.match(appJs, /Invite families &amp; staff/);
  assert.match(appJs, /New memories from today/);
  assert.match(appJs, /A form is ready when you have a moment/);
  assert.match(stylesCss, /\.day-assist-brief/);
  assert.doesNotMatch(appJs, /Where to add testers/);
  // Seed demo gated
  assert.match(appJs, /data-family-hub-seed-demo[\s\S]{0,120}isAdminUnlocked|isAdminUnlocked[\s\S]{0,200}data-family-hub-seed-demo/);
  console.log("PASS  static day-assistant markers");

  const port = 48500 + Math.floor(Math.random() * 900);
  const storePath = path.join(os.tmpdir(), `llh-day-assist-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        name: "Day Assistant Owner",
        role: "owner",
        accountType: "pro",
        programName: "Harbor Daycare",
      },
    },
  }, null, 2));
  const server = spawnServer({ port, storePath });
  let browser;
  const steps = [];
  const note = (name, ok, detail = "") => {
    steps.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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
          stripeSubscriptionStatus: "active",
          internalAccessOverride: true,
          programSettings: {
            programName: "Harbor Daycare",
            programType: "home_daycare",
            classrooms: [{ id: "room-1", name: "Sunshine" }],
          },
        },
      }));
      localStorage.setItem("llhMetaCookieNoticeDismissed", "1");
      localStorage.setItem("llhCookieNoticeDismissed", "1");
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
    }, { email: OWNER });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => (
      typeof setView === "function"
      && typeof buildDayAssistantSnapshot === "function"
      && Boolean(window.LLH_CONFIG?.homeDaycareHubTesting)
    ), null, { timeout: 90000 });

    // Seed two children + one meal for one child only
    await page.evaluate(() => {
      const today = typeof dlcActiveDate === "function" ? dlcActiveDate() : new Date().toISOString().slice(0, 10);
      const a = appendChildRecord("Profiles", {
        name: "Ava Harbor",
        ageGroup: "Toddler",
        classroom: "Sunshine",
        classroomId: "room-1",
        dob: "2023-08-04",
        allergies: "Peanuts",
        medicationNotes: "EpiPen in backpack",
        parentInfo: "Parent A",
      });
      const b = appendChildRecord("Profiles", {
        name: "Ben Harbor",
        ageGroup: "Toddler",
        classroom: "Sunshine",
        classroomId: "room-1",
        dob: "2022-01-10",
        parentInfo: "Parent B",
      });
      appendChildRecord("Attendance", {
        childId: a.id,
        date: today,
        status: "Present",
        dropoff: "08:10",
        summary: "Present",
        shareWithFamily: true,
      });
      appendChildRecord("Attendance", {
        childId: b.id,
        date: today,
        status: "Present",
        dropoff: "08:20",
        summary: "Present",
        shareWithFamily: true,
      });
      appendChildRecord("Meals", {
        childId: a.id,
        date: today,
        lunch: "Ate most",
        summary: "Lunch: Ate most",
        shareWithFamily: true,
      });
      window.__dayAssistKids = { a: a.id, b: b.id, today };
    });
    await page.waitForTimeout(500);
    await page.waitForFunction(() => (childRecords()?.children || []).length >= 2, null, { timeout: 10000 });

    const home = await page.evaluate(() => {
      if (typeof setAdminPreviewMode === "function") {
        try { setAdminPreviewMode("Owner"); } catch (_e) { /* ignore */ }
      }
      const kids = (typeof childRecords === "function" ? childRecords().children : []) || [];
      setView("home", { allowDashboard: true, skipAccessRedirect: true, allowDuringBootVerification: true });
      if (typeof renderOwnerHomeDashboard === "function") renderOwnerHomeDashboard();
      const root = document.querySelector("#view-home");
      const text = root?.innerText || "";
      const snap = typeof buildDayAssistantSnapshot === "function" ? buildDayAssistantSnapshot() : null;
      return {
        kidCount: kids.length,
        brief: Boolean(root?.querySelector(".day-assist-brief")),
        expected: /Expected/i.test(text),
        allergies: /Allergies/i.test(text) || Boolean(snap?.allergies?.length),
        medications: /Medications/i.test(text) || Boolean(snap?.medications?.length),
        firstTask: /Suggested first task/i.test(text),
        attention: /What deserves attention today/i.test(text),
        mealSkip: /Meal still needed|still need/i.test(text),
        testerGuide: /Where to add testers|Testing Pro|View As/i.test(text),
        snapExpected: snap?.expected || 0,
        allergyCount: snap?.allergies?.length || 0,
        medCount: snap?.medications?.length || 0,
      };
    });
    note("Home shows Today’s brief", home.brief && home.expected && home.kidCount >= 2, JSON.stringify(home));
    note("Home surfaces allergies / medications", home.allergies && home.medications, `allergies=${home.allergyCount} meds=${home.medCount}`);
    note("Home suggests first task", home.firstTask);
    note("Home attention uses assistant framing", home.attention || home.mealSkip || home.firstTask);
    note("Home has no tester chrome", !home.testerGuide);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "01-owner-home-brief.png"), fullPage: true });

    // Teacher Today
    await page.evaluate(() => {
      // Simulate teacher role via preview if available, else just open Today
      if (typeof setAdminPreviewMode === "function") {
        try { setAdminPreviewMode("Teacher"); } catch (_e) { /* ignore */ }
      }
      setView("today", { allowDuringBootVerification: true });
      if (typeof renderTeacherTodayPage === "function") renderTeacherTodayPage();
    });
    await page.waitForTimeout(350);
    const todayView = await page.evaluate(() => {
      const text = document.querySelector("#view-today")?.innerText || "";
      return {
        brief: Boolean(document.querySelector("#view-today .day-assist-brief")),
        attention: /What deserves attention today|Suggested first task|Meal still needed/i.test(text),
      };
    });
    note("Teacher Today has morning brief", todayView.brief || todayView.attention, JSON.stringify(todayView));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "02-teacher-today.png"), fullPage: true });

    // Checkout → report_due helper
    const checkout = await page.evaluate(() => {
      const { b, today } = window.__dayAssistKids;
      const before = (typeof listOpsAlerts === "function" ? listOpsAlerts() : []).filter((a) => a.type === "report_due" && !a.read).length;
      // Give Ben some facts then checkout
      appendChildRecord("Naps", { childId: b, date: today, napStart: "12:00", summary: "Nap started", shareWithFamily: true });
      saveDailyLogQuickAction("check-out", b, { date: today, time: "15:30" });
      const after = (typeof listOpsAlerts === "function" ? listOpsAlerts() : []).filter((a) => a.type === "report_due" && !a.read);
      return { before, after: after.length, title: after[0]?.title || "" };
    });
    note("Checkout creates quiet report reminder", checkout.after > checkout.before, checkout.title);

    // Observation → goal suggestion alert
    const obsGoal = await page.evaluate(() => {
      const { a, today } = window.__dayAssistKids;
      const before = (listOpsAlerts() || []).filter((x) => x.type === "goal_suggested" && !x.read).length;
      appendChildRecord("Observations", {
        childId: a,
        date: today,
        text: "Ava used both hands for fine motor stacking and stayed focused for several minutes.",
        developmentArea: "Fine Motor",
        shareWithFamily: false,
      });
      const after = (listOpsAlerts() || []).filter((x) => x.type === "goal_suggested" && !x.read);
      return { before, after: after.length, title: after[0]?.title || "" };
    });
    note("Observation suggests linking a learning goal", obsGoal.after > obsGoal.before, obsGoal.title);

    // Family Hub provider copy (no magic link / seed for non-admin)
    await page.evaluate(() => {
      if (typeof setAdminPreviewMode === "function") {
        try { setAdminPreviewMode("Owner"); } catch (_e) { /* ignore */ }
      }
      localStorage.removeItem("llhAdminUnlocked");
      setView("home-daycare-hub", { allowDuringBootVerification: true });
    });
    await page.waitForTimeout(500);
    const hub = await page.evaluate(() => {
      const panel = document.querySelector("#hdhFamilyHubPanel");
      const guide = document.querySelector("#hdhTesterGuidePanel");
      const panelText = panel?.innerText || "";
      const guideText = guide?.innerText || "";
      return {
        inviteLink: /Family invite link|Create invite link|invite link/i.test(panelText),
        noMagic: !/magic link/i.test(panelText),
        seeParents: /See what parents see/i.test(panelText),
        noSeed: !document.querySelector("[data-family-hub-seed-demo]"),
        inviteFamilies: /Invite families/i.test(guideText),
        noWhereTesters: !/Where to add testers|Testing Pro|View As/i.test(guideText),
      };
    });
    note("Family Hub uses family invite language", hub.inviteLink && hub.noMagic && hub.seeParents, JSON.stringify(hub));
    note("Sample household seed hidden without Admin", hub.noSeed);
    note("Provider guide has no tester terminology", hub.inviteFamilies && hub.noWhereTesters);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "03-family-hub-provider.png"), fullPage: true });

    // Parent warmth markers in renderer
    const parentWarm = await page.evaluate(() => {
      const html = String(renderFamilyHubTodayPanel.toString());
      return {
        memories: /New memories from today/.test(html),
        formReady: /A form is ready when you have a moment/.test(html),
        enjoyed: /See what .* enjoyed today|See what .* is enjoying today|Here’s how .* day is going/.test(String(familyHubDayHeadline.toString())),
      };
    });
    note("Parent Today wording is family-friendly", parentWarm.memories && parentWarm.formReady && parentWarm.enjoyed, JSON.stringify(parentWarm));

    // End-of-day HTML renders for late-day snapshots
    const eod = await page.evaluate(() => {
      const snap = { ...buildDayAssistantSnapshot(), hour: 16 };
      const html = dayAssistantEndOfDayHtml(snap);
      const host = document.querySelector("#view-home .work-hub-body") || document.querySelector("#view-home");
      if (host && html) {
        const wrap = document.createElement("div");
        wrap.innerHTML = html;
        host.appendChild(wrap.firstElementChild);
      }
      return {
        htmlOk: /End of day|Attendance complete|daily report/i.test(html || ""),
        inDom: Boolean(document.querySelector(".day-assist-eod")),
      };
    });
    note("End-of-day wrap-up appears in afternoon", eod.htmlOk && eod.inDom, JSON.stringify(eod));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", "04-eod-wrap.png"), fullPage: true });

    // Role landings smoke
    for (const role of ["Owner", "Director", "Teacher", "Assistant"]) {
      const landing = await page.evaluate((preview) => {
        if (typeof setAdminPreviewMode === "function") {
          try { setAdminPreviewMode(preview); } catch (_e) { /* ignore */ }
        }
        if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
        if (typeof syncWorkModeNav === "function") syncWorkModeNav();
        const land = typeof workModeLandingView === "function" ? workModeLandingView() : "";
        setView(land, { allowDashboard: true, skipAccessRedirect: true, allowDuringBootVerification: true });
        const active = document.querySelector(".active-view, .view.active")?.id || "";
        const text = document.querySelector(`#${active}`)?.innerText || document.body.innerText || "";
        return {
          land,
          hasNext: /What to do next|Suggested first task|What deserves attention|Run the day|Continue/i.test(text),
          testerLeak: /Where to add testers|Testing Pro|Seed demo/i.test(text),
        };
      }, role);
      note(`${role} landing explains next step`, landing.hasNext && !landing.testerLeak, JSON.stringify(landing));
    }

    const failed = steps.filter((s) => !s.ok);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "results.json"), JSON.stringify({ shell: SHELL, steps, failed }, null, 2));
    if (failed.length) throw new Error(`Failures: ${failed.map((f) => f.name).join("; ")}`);
    console.log(`\nALL DAY ASSISTANT CHECKS PASSED (${steps.length})`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
