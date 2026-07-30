#!/usr/bin/env node
/**
 * AI Guide full button/UI audit (Phases 1–3) — Playwright.
 * Spawns a local testing-fenced server and exercises every AI Guide control.
 * Run: npm run test:ai-guide-button-audit
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const OWNER = "ai-guide-audit@example.com";
const CHILD_ID = "child_audit_1";
const REPORT = [];

function note(status, area, detail) {
  REPORT.push({ status, area, detail });
  console.log(`${status === "PASS" ? "PASS" : status === "GAP" ? "GAP " : "FAIL"}  [${area}] ${detail}`);
}

function request(port, method, urlPath, { body = null, headers = {}, email } = {}) {
  return new Promise((resolve, reject) => {
    const authHeaders = email
      ? { Authorization: `Bearer test:${email}`, "X-LLH-User-Email": email }
      : {};
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders, ...headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json, raw });
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
      NODE_ENV: "test",
      AI_GUIDE_ENABLED: "true",
      AI_GUIDE_TESTING_ONLY: "true",
      HOME_DAYCARE_HUB_TESTING: "true",
      OPENAI_API_KEY: "",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, child) {
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return res.json;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

async function openAsOwner(page, port) {
  await page.addInitScript(({ email, childId }) => {
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhPlan", "Pro");
    localStorage.setItem("llhAccounts", JSON.stringify({
      [email]: {
        email,
        plan: "Pro",
        firstName: "Guide",
        lastName: "Auditor",
        role: "owner",
        accountType: "home_daycare",
        subscriptionStatus: "active",
        stripeSubscriptionStatus: "active",
        programName: "AI Guide Audit Daycare",
      },
    }));
    localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify([
      { id: childId, name: "Maya Audit", dob: "2023-04-01", ageGroup: "Toddler" },
    ]));
    localStorage.setItem(`llhChild:${email}:Observations`, JSON.stringify([
      {
        id: "obs_audit_1",
        childId,
        childName: "Maya Audit",
        title: "Block play",
        notes: "Maya stacked five blocks and tried again when they fell.",
        date: "2026-07-30",
      },
    ]));
    localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([]));
    localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
  }, { email: OWNER, childId: CHILD_ID });

  page.setDefaultTimeout(60000);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof isAiGuideEnabled === "function", null, { timeout: 60000 });
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
    try { if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility(); } catch (_e) { /* ignore */ }
    try { if (typeof syncAiGuideNavVisibility === "function") syncAiGuideNavVisibility(); } catch (_e) { /* ignore */ }
  });
  await page.waitForTimeout(400);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (_error) {
    console.error("Playwright not installed.");
    process.exitCode = 1;
    return;
  }

  const port = 20300 + Math.floor(Math.random() * 80);
  const storePath = path.join(os.tmpdir(), `llh-ai-guide-audit-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [OWNER]: {
        email: OWNER,
        plan: "Pro",
        name: "Guide Auditor",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
        internalAccessOverride: true,
      },
    },
    siteContent: {},
    foundingMembers: [],
  }, null, 2));

  const child = spawnServer({ port, storePath });
  let browser;
  try {
    const health = await waitForHealth(port, child);
    assert.equal(health.aiGuideEnabled, true);
    note("PASS", "Fence", "Health reports aiGuideEnabled=true");

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await openAsOwner(page, port);

    const navState = await page.evaluate(() => {
      const btn = document.querySelector('[data-view="ai-guide"][data-nav-ai-guide="true"]');
      return {
        enabled: typeof isAiGuideEnabled === "function" ? isAiGuideEnabled() : false,
        loggedIn: typeof isLoggedIn === "function" ? isLoggedIn() : false,
        navExists: Boolean(btn),
        navHidden: btn ? Boolean(btn.hidden) : true,
      };
    });
    note(navState.enabled ? "PASS" : "FAIL", "Client flag", `isAiGuideEnabled=${navState.enabled}`);
    note(navState.loggedIn ? "PASS" : "FAIL", "Auth", `isLoggedIn=${navState.loggedIn}`);
    note(navState.navExists && !navState.navHidden ? "PASS" : "FAIL", "Nav button", navState.navExists
      ? (navState.navHidden ? "AI Guide nav exists but HIDDEN" : "AI Guide nav visible when signed in")
      : "AI Guide nav button missing from DOM");

    // Click nav button path
    if (navState.navExists && !navState.navHidden) {
      await page.locator('[data-view="ai-guide"][data-nav-ai-guide="true"]').click();
    } else {
      await page.evaluate(() => setView("ai-guide", { allowDuringBootVerification: true }));
    }
    await page.waitForSelector("#view-ai-guide.active-view .ai-guide-page", { timeout: 20000 });
    note("PASS", "Open view", "AI Guide page active");

    await page.waitForSelector(".ai-guide-category-card", { timeout: 15000 });
    const enabledCards = page.locator(".ai-guide-category-card:not([disabled])");
    const categoryCount = await enabledCards.count();
    note(categoryCount >= 13 ? "PASS" : "GAP", "Home categories", `${categoryCount} enabled category cards`);

    const labels = (await enabledCards.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
    const expected = [
      "Lesson Planning", "Activities", "Observations", "Daily Reports", "Parent Communication",
      "Incident", "Behavior", "Child Development", "Forms", "Policies", "Staff", "Enrollment",
      "Administrative Writing", "Ask About My Program",
    ];
    for (const needle of expected) {
      note(labels.some((t) => t.includes(needle)) ? "PASS" : "GAP", "Category label", labels.some((t) => t.includes(needle)) ? `“${needle}” present` : `MISSING “${needle}”`);
    }

    // Insights
    const insightsBtn = page.locator("[data-ai-guide-insights]");
    if (await insightsBtn.count()) {
      await insightsBtn.first().click();
      await page.waitForTimeout(700);
      const panel = await page.locator(".ai-guide-insights").count();
      note(panel ? "PASS" : "GAP", "Insights", panel ? "insights panel rendered" : "button clicked, panel empty");
    } else note("GAP", "Insights", "Documentation insights button missing");

    const flows = [
      "observations", "daily-reports", "behavior", "parent-communication", "incident",
      "lesson-planning", "activities", "forms", "policies", "enrollment", "staff",
      "admin-writing", "development", "ask-program",
    ];

    async function goHome() {
      const back = page.locator("[data-ai-guide-back-home]");
      if (await back.count()) {
        await back.first().click();
        await page.waitForSelector(".ai-guide-category-grid", { timeout: 10000 });
      } else {
        await page.evaluate(() => setView("ai-guide", { allowDuringBootVerification: true }));
        await page.waitForSelector(".ai-guide-category-grid", { timeout: 10000 });
      }
    }

    for (const categoryId of flows) {
      try {
        await goHome();
        const card = page.locator(`.ai-guide-category-card[data-ai-guide-category="${categoryId}"]`);
        assert.ok(await card.count(), `missing ${categoryId}`);
        assert.equal(await card.isDisabled(), false, `${categoryId} disabled`);
        await card.click();
        await page.waitForSelector("#aiGuideComposeForm", { timeout: 10000 });
        note("PASS", "Category open", `${categoryId} → compose`);

        await page.locator('#aiGuideComposeForm textarea[name="notes"]').fill(`Audit notes for ${categoryId}: outdoor play, snack mostly eaten.`);
        if (categoryId === "policies") {
          const state = page.locator('#aiGuideComposeForm select[name="state"]');
          note(await state.count() ? "PASS" : "GAP", "Policy state", await state.count() ? "state selector present" : "state selector missing");
          if (await state.count()) await state.selectOption("TX");
        }
        if (categoryId === "development" || categoryId === "ask-program") {
          const sources = page.locator('input[name="sourceRecordIds"]');
          const n = await sources.count();
          note(n ? "PASS" : "GAP", "Source records", n ? `${categoryId}: ${n} source checkbox(es)` : `${categoryId}: no source checkboxes`);
          if (n) await sources.first().check();
        }

        // Save template on parent message
        if (categoryId === "parent-communication") {
          const saveTpl = page.locator("[data-ai-guide-save-template]");
          if (await saveTpl.count()) {
            await saveTpl.click();
            await page.waitForTimeout(600);
            note("PASS", "Templates", "Save as template clicked");
          } else note("GAP", "Templates", "Save as template missing");
          const fixture = page.locator("[data-ai-guide-fixture]").first();
          if (await fixture.count()) {
            await fixture.click();
            const val = await page.locator('#aiGuideComposeForm textarea[name="notes"]').inputValue();
            note(val.trim() ? "PASS" : "GAP", "Demo fixtures", val.trim() ? "fixture filled notes" : "fixture did not fill");
          } else note("GAP", "Demo fixtures", "no fixture buttons for parent-communication");
        }

        await page.locator('#aiGuideComposeForm select[name="length"]').selectOption("quick");
        await page.locator('#aiGuideComposeForm button[type="submit"]').click();
        await page.waitForSelector("#aiGuideDraftText", { timeout: 20000 });
        const draftText = await page.locator("#aiGuideDraftText").inputValue();
        assert.ok(draftText.trim().length > 5);
        note("PASS", "Generate", `${categoryId} draft length=${draftText.trim().length}`);

        note(await page.locator(".ai-guide-banner").count() ? "PASS" : "GAP", "Review banner", `${categoryId}`);
        const dangerous = await page.locator("button").evaluateAll((buttons) => buttons
          .map((b) => (b.textContent || "").trim().toLowerCase())
          .filter((t) => /send to family|publish now|auto-send|file incident|approve & close/.test(t)).length);
        note(dangerous === 0 ? "PASS" : "FAIL", "No auto-send", `${categoryId}: dangerousButtons=${dangerous}`);

        // Revise suite presence
        const reviseActions = [
          "make_shorter", "add_detail", "make_warmer", "make_direct", "make_family_friendly",
          "make_professional", "simpler_words", "remove_edu_wording", "facts_only", "missing_info_prompts",
        ];
        let reviseOk = 0;
        for (const action of reviseActions) {
          if (await page.locator(`[data-ai-guide-revise="${action}"]`).count()) reviseOk += 1;
        }
        note(reviseOk === reviseActions.length ? "PASS" : "GAP", "Revise buttons", `${categoryId}: ${reviseOk}/${reviseActions.length}`);
        if (await page.locator('[data-ai-guide-revise="make_shorter"]').count()) {
          await page.locator('[data-ai-guide-revise="make_shorter"]').click();
          await page.waitForTimeout(700);
          note("PASS", "Revise click", `${categoryId}: make_shorter`);
        }

        if (await page.locator("#aiGuideReviewAck").count()) {
          await page.locator("#aiGuideReviewAck").check();
          await page.locator("[data-ai-guide-save-draft]").click();
          await page.waitForTimeout(500);
          note("PASS", "Save draft", `${categoryId}`);
        } else note("GAP", "Save draft", `${categoryId}: ack missing`);

        if (await page.locator("[data-ai-guide-copy]").count()) {
          await page.locator("[data-ai-guide-copy]").click();
          note("PASS", "Copy", `${categoryId}`);
        }

        const feedbackRatings = ["helpful", "needs_improvement", "incorrect", "unsafe", "missing_info"];
        let fb = 0;
        for (const rating of feedbackRatings) {
          if (await page.locator(`[data-ai-guide-feedback="${rating}"]`).count()) fb += 1;
        }
        note(fb === feedbackRatings.length ? "PASS" : "GAP", "Feedback buttons", `${categoryId}: ${fb}/${feedbackRatings.length}`);
        if (await page.locator('[data-ai-guide-feedback="helpful"]').count()) {
          await page.locator('[data-ai-guide-feedback="helpful"]').click();
          await page.waitForTimeout(300);
        }

        const useHelpers = await page.locator("[data-ai-guide-use-helpers]").count();
        if (categoryId === "ask-program") {
          note(useHelpers === 0 ? "PASS" : "GAP", "Ask isolation", useHelpers === 0 ? "Ask hides Use in Helpers" : "Ask still shows Use in Helpers");
          const cites = await page.locator(".ai-guide-citations").count();
          note(cites ? "PASS" : "GAP", "Citations", cites ? "sources used shown" : "citations block missing on ask answer");
        } else {
          note(useHelpers ? "PASS" : "GAP", "Use helpers", `${categoryId}: ${useHelpers ? "present" : "MISSING"}`);
        }

        if (await page.locator("[data-ai-guide-clear-draft]").count()) {
          await page.locator("[data-ai-guide-clear-draft]").click();
          await page.waitForTimeout(300);
          note("PASS", "Clear", `${categoryId}`);
        }
        await goHome();
        note("PASS", "Back home", `${categoryId}`);
      } catch (error) {
        note("FAIL", categoryId, error.message || String(error));
        try {
          await page.evaluate(() => setView("ai-guide", { allowDuringBootVerification: true }));
          await page.waitForTimeout(500);
        } catch (_e) { /* ignore */ }
      }
    }

    // Use in Documentation Helpers end-to-end once
    try {
      await goHome();
      await page.locator('[data-ai-guide-category="observations"]').click();
      await page.waitForSelector("#aiGuideComposeForm");
      await page.locator('#aiGuideComposeForm textarea[name="notes"]').fill("Maya stacked five blocks.");
      await page.locator('#aiGuideComposeForm button[type="submit"]').click();
      await page.waitForSelector("#aiGuideDraftText");
      await page.locator("[data-ai-guide-use-helpers]").click();
      await page.waitForTimeout(1000);
      const onHelpers = await page.evaluate(() => document.querySelector("#view-ai.active-view") != null || document.body.classList.contains("doc-helpers-view"));
      note(onHelpers ? "PASS" : "GAP", "Helpers handoff", onHelpers ? "navigated to Documentation Helpers" : "did not land on helpers view");
    } catch (error) {
      note("FAIL", "Helpers handoff", error.message || String(error));
    }

    // Admin kill controls exist in app source
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    for (const attr of [
      "data-ai-guide-category", "data-ai-guide-back-home", "data-ai-guide-revise", "data-ai-guide-save-draft",
      "data-ai-guide-copy", "data-ai-guide-use-helpers", "data-ai-guide-clear-draft", "data-ai-guide-feedback",
      "data-ai-guide-insights", "data-ai-guide-open-ask", "data-ai-guide-save-template", "data-ai-guide-fixture", "data-ai-guide-kill",
      "data-ai-guide-template",
    ]) {
      note(appJs.includes(attr) ? "PASS" : "GAP", "Control inventory", `${attr}`);
    }
    note(indexHtml.includes('data-view="ai-guide"') ? "PASS" : "FAIL", "Nav markup", "index.html AI Guide nav");

    // API admin overview
    const login = await request(port, "POST", "/api/admin/login", {
      body: { email: "admin@example.com", password: "test-password", code: "test-code" },
    });
    note(login.status === 200 ? "PASS" : "FAIL", "Admin login", `status ${login.status}`);
    if (login.json.token) {
      const overview = await request(port, "GET", "/api/admin/ai-guide/overview", {
        headers: { Authorization: `Bearer ${login.json.token}` },
      });
      note(overview.status === 200 ? "PASS" : "FAIL", "Admin overview API", `status ${overview.status}`);
    }

    // Logged-out fence: config 401/redirect style via API without auth
    const anon = await request(port, "GET", "/api/ai-guide/config");
    note(anon.status === 401 || anon.status === 404 ? "PASS" : "GAP", "Logged-out API", `config status ${anon.status}`);

  } catch (error) {
    note("FAIL", "Audit runner", error.message || String(error));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }

  const fails = REPORT.filter((r) => r.status === "FAIL");
  const gaps = REPORT.filter((r) => r.status === "GAP");
  const passes = REPORT.filter((r) => r.status === "PASS");
  const outPath = path.join(ROOT, "docs/audits/AI_GUIDE_BUTTON_AUDIT.md");
  const md = [
    "# AI Guide button audit (Phases 1–3)",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `**PASS:** ${passes.length} · **GAP:** ${gaps.length} · **FAIL:** ${fails.length}`,
    "",
    "## Testing site status (at audit time)",
    "",
    "- Code on testing: `20260730-ai-guide-audit` / merge commit present",
    "- Feature flag: requires `AI_GUIDE_ENABLED=true` + `AI_GUIDE_TESTING_ONLY=true` on testing only",
    "- Production must keep these unset",
    "",
    "## Results",
    "",
    "| Status | Area | Detail |",
    "|--------|------|--------|",
    ...REPORT.map((r) => `| ${r.status} | ${r.area} | ${String(r.detail).replace(/\|/g, "/")} |`),
    "",
    "## Gaps / buttons to add or fix",
    "",
    ...(gaps.length ? gaps.map((g) => `- **${g.area}:** ${g.detail}`) : ["- None."]),
    "",
    "## Failures",
    "",
    ...(fails.length ? fails.map((g) => `- **${g.area}:** ${g.detail}`) : ["- None."]),
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
  console.log(`\nWrote ${outPath}`);
  console.log(`Summary: PASS=${passes.length} GAP=${gaps.length} FAIL=${fails.length}`);
  if (fails.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
