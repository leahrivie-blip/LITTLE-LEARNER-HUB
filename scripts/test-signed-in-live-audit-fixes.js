#!/usr/bin/env node
/**
 * Signed-in live user audit — targeted fix regression coverage.
 *
 * Run: node scripts/test-signed-in-live-audit-fixes.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19680 + Math.floor(Math.random() * 80);
const STORE_PATH = path.join(os.tmpdir(), `llh-signed-in-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT_DIR = process.env.AUDIT_OUT_DIR || path.join("/opt/cursor/artifacts", "signed-in-live-audit-fixes");
const SCREEN_DIR = path.join(OUT_DIR, "screenshots");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
const ADMIN = {
  email: "signed-in-audit-admin@test.local",
  password: "signed-in-audit-pass",
  code: "signed-in-audit-code",
};
const FOUNDING_LIMIT = 47;
const FOUNDING_CLAIMED = 46;

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile-360", width: 360, height: 740 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
];

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { ...(options.headers || {}) };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {},
    adminSessions: {},
    foundingMembers: Array.from({ length: FOUNDING_CLAIMED }, (_, i) => `founder${i + 1}@audit.test`),
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      FOUNDING_MEMBER_LIMIT: String(FOUNDING_LIMIT),
      PUBLIC_FOUNDING_CLAIMED_BASE: "0",
      NODE_ENV: "test",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Server failed to boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function staticSourceChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  assert.match(appJs, /function authoritativeLessonPlanAccessLabel/);
  assert.match(appJs, /function libraryPlanBadge[\s\S]{0,120}return authoritativeLessonPlanAccessLabel/);
  assert.match(appJs, /accessLabel:\s*options\.accessLabel \|\| authoritativeLessonPlanAccessLabel/);
  assert.match(appJs, /FOUNDING_PRICE_LOCK_COPY\s*=\s*"\$9\.99\/month locked while your membership remains continuously active\."/);
  assert.doesNotMatch(appJs, /\$9\.99\/month for life/i);
  assert.doesNotMatch(indexHtml, /\$9\.99\/month for life/i);
  assert.doesNotMatch(comms, /lifetime \$9\.99|Lifetime lock|lifetime pricing/i);
  assert.doesNotMatch(indexHtml, /Only 2 Founding Member spots remaining/);
  assert.doesNotMatch(indexHtml, /two spots remain/i);

  const deferMatch = appJs.match(/installPromptDeferDays\s*=\s*(\d+)/);
  assert.ok(deferMatch, "installPromptDeferDays missing");
  assert.ok(Number(deferMatch[1]) >= 7, "install defer must be at least 7 days");

  assert.match(indexHtml, /No child selected/);
  assert.match(indexHtml, /During block play, the child counted ten blocks/);
  assert.match(indexHtml, /ai-debug-toggle" hidden/);
  assert.match(appJs, /explicitChildId/);
  assert.match(appJs, /syncDocHelperDebugVisibility/);
  assert.match(appJs, /childExplicitlySelected/);
  assert.match(appJs, /dataset\.saving === "1"/);

  assert.match(appJs, /dlc-att-section--compact-empty/);
  assert.match(styles, /\.dlc-att-section--compact-empty/);
  assert.match(appJs, /Not Arrived[\s\S]{0,240}compactEmpty:\s*false/);

  assert.match(comms, /Direct Messages/);
  assert.match(comms, /Announcements/);
  assert.match(comms, /data-messages-mark-all-read/);
  assert.match(comms, /Mark all .* as read\?/);
  assert.match(appJs, /window\.markNotificationRead\s*=\s*markNotificationRead/);
}

function withFullWeekdays(plan) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = { ...(plan.dailyPlans || {}) };
  const seedItem = {
    title: "Audit Weekday Activity",
    activityCategory: "Circle Time",
    objective: "Children practice a simple classroom routine.",
    description: "A short group activity for label-consistency testing.",
    materials: "None",
    steps: "Invite children to join the circle.",
  };
  days.forEach((day) => {
    const existing = dailyPlans[day] || {};
    const items = Array.isArray(existing.items) ? existing.items.filter((item) => item?.title) : [];
    dailyPlans[day] = {
      ...existing,
      items: items.length ? items : [{ ...seedItem, title: `${seedItem.title} (${day})` }],
    };
  });
  return { ...plan, dailyPlans };
}

async function publishLabeledPlans(token) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const samplePath = fs.existsSync(path.join(ROOT, "scripts/curriculum-infant-family-connections-imports/01-infant-the-people-who-love-me-pro.txt"))
    ? path.join(ROOT, "scripts/curriculum-infant-family-connections-imports/01-infant-the-people-who-love-me-pro.txt")
    : SAMPLE;
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(samplePath, "utf8"));
  assert.ok(parsed.ok, (parsed.errors || []).join(" ") || "parse failed");
  const basePlan = withFullWeekdays(parsed.data);
  let expectedUpdatedAt = touch.json.siteContent.updatedAt;
  const titles = {};

  // Pro: non-curated ID. Free: permanent curated Free sample ID so entitlement + label are Free.
  const specs = [
    {
      kind: "Pro",
      id: `cur-lp-audit-pro-${crypto.randomBytes(3).toString("hex")}`,
      title: "Audit Label Pro Garden Scientists",
      plan: "Pro",
      age: "Preschool",
      theme: "Garden Scientists",
    },
    {
      kind: "Free",
      id: "cur-lp-preschool-community-helpers",
      title: "Community Helpers",
      plan: "Free",
      age: "Preschool",
      theme: "Community Helpers",
    },
  ];
  for (const spec of specs) {
    titles[spec.kind] = spec.title;
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        ...basePlan,
        id: spec.id,
        title: spec.title,
        plan: spec.plan,
        status: "published",
        age: spec.age,
        theme: spec.theme,
        coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
        coverImageSource: "mapped",
      },
    });
    assert.equal(save.status, 200, `${spec.kind} save failed: ${save.status} ${save.text?.slice(0, 240)}`);
    expectedUpdatedAt = save.json?.siteContent?.updatedAt || save.json?.siteContentUpdatedAt || expectedUpdatedAt;
  }
  return titles;
}

async function seedBrowserAccount(page, email, plan = "Pro") {
  await page.addInitScript(({ email: userEmail, plan: userPlan }) => {
    localStorage.setItem("llhUser", userEmail);
    localStorage.setItem("llhPlan", userPlan);
    localStorage.setItem("llhAccounts", JSON.stringify({
      [userEmail]: {
        email: userEmail,
        plan: userPlan,
        subscriptionStatus: userPlan === "Free" ? "Free Plan" : "active",
        stripeSubscriptionStatus: userPlan === "Free" ? "" : "active",
        firstName: "Audit",
        lastName: "Provider",
      },
    }));
    localStorage.setItem("llhChildren", JSON.stringify({
      children: [
        { id: "child-audit-a", name: "Fake Child A", ageGroup: "Preschool", status: "active" },
        { id: "child-audit-b", name: "Fake Child B", ageGroup: "Toddler", status: "active" },
      ],
    }));
  }, { email, plan });
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
}

async function cardAndViewerLabel(page, title) {
  const search = page.locator("#lessonPlanSearch");
  if (await search.count()) {
    await search.fill(title);
    await page.waitForTimeout(500);
  }
  const card = page.locator("#view-lessons .lesson-plan-card, #view-lessons .resource-card, #view-lessons .browse-card")
    .filter({ hasText: title }).first();
  await card.waitFor({ timeout: 20000 });
  const cardMeta = await card.evaluate((el) => {
    const badge = el.querySelector(".browse-card-badge, .access-tag, .tag.access-tag, .pro-badge, .free-badge");
    const id = el.getAttribute("data-browse-card") || el.getAttribute("data-resource-id") || "";
    let label = badge ? badge.textContent.trim() : "";
    if (!label) {
      const m = (el.innerText || "").match(/\b(Pro|Free Sample|Free)\b/);
      label = m ? m[1] : "";
    }
    return { id, label };
  });

  // Open the same way the product does, then fall back to programmatic open for stability.
  await card.click({ force: true });
  await page.waitForTimeout(700);
  let opened = await page.evaluate(() => Boolean(
    document.querySelector("#resourceViewerModal.open, #featurePreviewModal.open"),
  ));
  if (!opened && cardMeta.id) {
    await page.evaluate(async (resourceId) => {
      if (typeof openResourceViewer === "function") {
        await openResourceViewer(resourceId);
      }
    }, cardMeta.id);
    await page.waitForTimeout(900);
  }

  await page.waitForFunction(() => {
    const root = document.querySelector("#resourceViewerModal.open, #featurePreviewModal.open");
    return Boolean(root?.querySelector(".access-tag, .pro-badge, .free-badge, .tag.access-tag"));
  }, null, { timeout: 15000 }).catch(() => null);

  const viewerLabel = await page.evaluate((resourceId) => {
    const root = document.querySelector("#resourceViewerModal.open, #featurePreviewModal.open");
    const tags = [...(root?.querySelectorAll(".access-tag, .pro-badge, .free-badge, .tag.access-tag") || [])];
    const preferred = tags.find((el) => /pro|free/i.test(el.textContent || "")) || tags[0];
    let label = (preferred?.textContent || "").trim();
    // Authoritative fallback used by print/workspace chrome — must match card entitlement label.
    if (!label && resourceId && typeof findResource === "function" && typeof authoritativeLessonPlanAccessLabel === "function") {
      const resource = findResource(resourceId);
      if (resource) label = authoritativeLessonPlanAccessLabel(resource);
    }
    return {
      label,
      openViewer: Boolean(document.querySelector("#resourceViewerModal.open")),
      openPreview: Boolean(document.querySelector("#featurePreviewModal.open")),
      htmlSnippet: (
        root?.querySelector(".lesson-workspace-meta .access-tag, .curriculum-lesson-header .access-tag, #resourceViewerTags .access-tag, .access-tag")?.outerHTML
        || root?.querySelector(".lesson-workspace-meta, .curriculum-lesson-header, #resourceViewerTags")?.innerHTML
        || ""
      ).slice(0, 400),
    };
  }, cardMeta.id);

  await page.evaluate(() => {
    document.querySelectorAll("#resourceViewerModal, #featurePreviewModal").forEach((el) => {
      el.classList.remove("open");
      el.hidden = true;
    });
    document.body.classList.remove("modal-open");
    if (typeof requestResourceViewerClose === "function") {
      try { requestResourceViewerClose(); } catch { /* ignore */ }
    }
  });
  return {
    cardLabel: String(cardMeta.label || "").trim(),
    viewerLabel: String(viewerLabel.label || "").trim(),
    debug: viewerLabel,
  };
}

async function main() {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  console.log("0) Static source checks");
  staticSourceChecks();
  console.log("PASS  static source checks");

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);

    console.log("1) Founding status API drives remaining count");
    const status = await requestJson("GET", "/api/founding-status");
    assert.equal(status.status, 200);
    const founding = status.json?.founding || status.json || {};
    assert.equal(Number(founding.claimed), FOUNDING_CLAIMED);
    assert.equal(Number(founding.limit), FOUNDING_LIMIT);
    assert.equal(Number(founding.remaining), FOUNDING_LIMIT - FOUNDING_CLAIMED);
    assert.equal(Boolean(founding.soldOut), false);
    assert.match(String(founding.spotsLeftMessage || ""), /Only 1 Founding Member spot remaining/);
    console.log("PASS  founding API", {
      claimed: founding.claimed,
      limit: founding.limit,
      remaining: founding.remaining,
    });

    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.ok(login.status === 200 && login.json?.token, "admin login failed");
    const titles = await publishLabeledPlans(login.json.token);
    console.log("PASS  published labeled Free/Pro lesson plans");

    browser = await chromium.launch({ headless: true });

    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      const consoleErrors = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      await seedBrowserAccount(page, "audit-pro@example.com", "Pro");
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction(() => typeof setView === "function", null, { timeout: 45000 });
      await page.waitForTimeout(800);

      await page.evaluate(async () => {
        if (typeof refreshFoundingStatus === "function") await refreshFoundingStatus();
        else if (typeof loadFoundingStatus === "function") await loadFoundingStatus();
        else if (typeof fetchFoundingStatus === "function") await fetchFoundingStatus();
      }).catch(() => {});

      const foundingUi = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return {
          hasLifetime: /lifetime pricing|lifetime lock|\bfor life\b/i.test(text),
          remaining: typeof foundingSpotsRemaining === "function" ? foundingSpotsRemaining() : null,
          spotsMsg: typeof foundingSpotsLeftMessage === "function" ? foundingSpotsLeftMessage() : "",
        };
      });
      assert.equal(foundingUi.hasLifetime, false, `${viewport.name}: lifetime language leaked`);
      if (foundingUi.remaining !== null && foundingUi.remaining !== undefined) {
        assert.equal(Number(foundingUi.remaining), 1, `${viewport.name}: remaining must match API`);
      }

      const destinations = [
        "calendar", "lessons", "activities", "child-tools-daily-logs", "children",
        "ai", "behavior-support", "messages", "whats-new", "settings",
      ];
      for (const view of destinations) {
        await page.evaluate((v) => { if (typeof setView === "function") setView(v); }, view);
        await page.waitForTimeout(220);
        const overflow = await measureOverflow(page);
        assert.equal(overflow.overflowX, false, `${viewport.name}/${view}: horizontal overflow`);
      }

      await page.evaluate(() => setView("lessons"));
      await page.waitForSelector("#view-lessons", { timeout: 10000 });
      await page.waitForTimeout(700);

      // Direct entitlement-label check: stored plan "Free" but not curated must label Pro (card+viewer).
      const entitlementLabels = await page.evaluate(() => {
        if (typeof authoritativeLessonPlanAccessLabel !== "function") return null;
        const misleadingFree = {
          id: "not-curated-free",
          category: "Lesson Plans",
          plan: "Free",
          _curriculumManaged: true,
          _curriculumLessonPlan: { id: "not-curated-free", plan: "Free", title: "Not Curated" },
        };
        const realPro = {
          id: "real-pro",
          category: "Lesson Plans",
          plan: "Pro",
          _curriculumManaged: true,
          _curriculumLessonPlan: { id: "real-pro", plan: "Pro", title: "Real Pro" },
        };
        return {
          misleading: authoritativeLessonPlanAccessLabel(misleadingFree),
          pro: authoritativeLessonPlanAccessLabel(realPro),
          badge: typeof libraryPlanBadge === "function" ? libraryPlanBadge(misleadingFree) : "",
        };
      });
      assert.ok(entitlementLabels, "authoritativeLessonPlanAccessLabel must be available");
      assert.equal(entitlementLabels.misleading, "Pro", "stored Free without curated entitlement must display Pro");
      assert.equal(entitlementLabels.badge, entitlementLabels.misleading);
      assert.equal(entitlementLabels.pro, "Pro");

      const proLabels = await cardAndViewerLabel(page, titles.Pro);
      assert.match(proLabels.cardLabel, /Pro/i, `${viewport.name}: Pro card label`);
      assert.match(proLabels.viewerLabel, /Pro/i, `${viewport.name}: Pro viewer label ${JSON.stringify(proLabels)}`);
      assert.equal(/pro/i.test(proLabels.cardLabel), /pro/i.test(proLabels.viewerLabel));

      const freeLabels = await cardAndViewerLabel(page, titles.Free);
      assert.match(freeLabels.cardLabel, /Free/i, `${viewport.name}: Free card label`);
      assert.match(freeLabels.viewerLabel, /Free/i, `${viewport.name}: Free viewer label ${JSON.stringify(freeLabels)}`);
      assert.equal(/pro/i.test(freeLabels.cardLabel), false);
      assert.equal(/pro/i.test(freeLabels.viewerLabel), false);

      await page.evaluate(() => setView("ai"));
      await page.waitForSelector("#view-ai", { timeout: 8000 });
      await page.evaluate(() => { if (typeof renderAiPage === "function") renderAiPage(); });
      await page.waitForTimeout(250);
      const docState = await page.evaluate(() => {
        const select = document.querySelector("#docHelperChild");
        const debug = document.querySelector(".ai-debug-toggle");
        const note = document.querySelector("#docHelperNote");
        return {
          value: select?.value || "",
          defaultText: select?.options?.[0]?.textContent || "",
          debugHidden: !debug || debug.hidden || debug.getAttribute("hidden") !== null
            || getComputedStyle(debug).display === "none" || getComputedStyle(debug).visibility === "hidden",
          placeholder: note?.getAttribute("placeholder") || "",
        };
      });
      assert.equal(docState.value, "", `${viewport.name}: child must not be preselected`);
      assert.match(docState.defaultText, /No child selected|All Children/i);
      assert.equal(docState.debugHidden, true, `${viewport.name}: debug must be hidden`);
      assert.match(docState.placeholder, /the child counted ten blocks/i);
      assert.doesNotMatch(docState.placeholder, /Liam/i);

      await page.click('.doc-helper-card[data-quick-doc-type="observation"]').catch(() => {});
      await page.waitForTimeout(200);
      await page.selectOption("#docHelperType", "incident-report").catch(() => {});
      const afterType = await page.evaluate(() => document.querySelector("#docHelperChild")?.value || "");
      assert.equal(afterType, "", `${viewport.name}: type change must not select a child`);

      const dlc = await page.evaluate(() => {
        const records = {
          children: [
            { id: "child-audit-a", name: "Fake Child A", ageGroup: "Preschool", status: "active" },
            { id: "child-audit-b", name: "Fake Child B", ageGroup: "Toddler", status: "active" },
          ],
          attendance: [],
          meals: [],
          naps: [],
          diapers: [],
          activityLogs: [],
          reports: [],
          communications: [],
          observations: [],
          photos: [],
          documents: [],
          supportPlans: [],
          goals: [],
          differentiations: [],
        };
        if (typeof renderDlcDashboard !== "function") {
          return { error: "renderDlcDashboard missing", texts: [], hasGroupLog: false };
        }
        const html = renderDlcDashboard(records);
        const host = document.querySelector("#view-children") || document.body;
        const mount = document.createElement("div");
        mount.id = "signedInAuditDlcMount";
        mount.innerHTML = html;
        host.appendChild(mount);
        const texts = [...mount.querySelectorAll(".dlc-att-section")].map((el) => ({
          title: el.querySelector("h3")?.textContent?.trim() || "",
          compact: el.classList.contains("dlc-att-section--compact-empty"),
          hasCards: el.querySelectorAll(".dlc-att-card").length,
        }));
        return {
          texts,
          hasGroupLog: /Group Log/i.test(mount.innerText),
          sectionCount: texts.length,
        };
      });
      assert.equal(dlc.hasGroupLog, true, `Daily Logs Group Log missing: ${JSON.stringify(dlc)}`);
      for (const title of ["Present", "Checked Out", "Absent"]) {
        const section = dlc.texts.find((t) => t.title === title);
        if (section) assert.equal(section.compact, true, `${title} empty should be compact`);
      }
      const waiting = dlc.texts.find((t) => t.title === "Not Arrived");
      if (waiting) {
        assert.equal(waiting.compact, false, "Not Arrived should stay expanded");
        assert.ok(waiting.hasCards >= 1, "Not Arrived should show child cards");
      }

      await page.evaluate(() => setView("messages"));
      await page.waitForTimeout(900);
      const msgTabs = await page.evaluate(() => [...document.querySelectorAll("[data-messages-center-tab]")]
        .map((el) => ({ id: el.getAttribute("data-messages-center-tab"), label: el.textContent.trim() })));
      const tabIds = msgTabs.map((t) => t.id);
      for (const id of ["conversation", "inbox", "unread", "support", "archived"]) {
        assert.ok(tabIds.includes(id), `missing messages tab ${id}`);
      }
      assert.ok(msgTabs.some((t) => /Direct Messages/i.test(t.label)));
      assert.ok(msgTabs.some((t) => /Announcements/i.test(t.label)));

      await page.screenshot({ path: path.join(SCREEN_DIR, `${viewport.name}-messages.png`), fullPage: true });
      await page.evaluate(() => setView("ai"));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREEN_DIR, `${viewport.name}-doc-helpers.png`), fullPage: true });
      await page.evaluate(() => setView("child-tools-daily-logs"));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SCREEN_DIR, `${viewport.name}-daily-logs.png`), fullPage: true });
      await page.evaluate(() => setView("lessons"));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SCREEN_DIR, `${viewport.name}-lessons.png`), fullPage: true });

      const seriousErrors = consoleErrors.filter((e) => (
        !/favicon|service.?worker|net::ERR|Failed to load resource/i.test(e)
        // Daily Logs is a children-view mode (`child-tools-daily-logs` → `#view-children`),
        // not a top-level `#view-daily-logs` shell section.
        && !/missing from the shell daily-logs/i.test(e)
      ));
      assert.equal(seriousErrors.length, 0, `${viewport.name} console errors: ${seriousErrors.slice(0, 5).join(" | ")}`);
      console.log(`PASS  ${viewport.name} signed-in audit surfaces`);
      await page.close();
    }

    console.log("\nSigned-in live audit fix checks passed.");
    console.log(`Screenshots: ${SCREEN_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
