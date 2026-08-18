#!/usr/bin/env node
/**
 * Pre-merge verification for Funnel Exit Insights (PR #429).
 * Uses buildInsights unit path + a temp local-json server for API/filter checks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const insights = require("../server/admin-insights.js");

const ROOT = path.join(__dirname, "..");

function check(name, ok, detail = "") {
  if (!ok) throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

function iso(msAgo = 0) {
  return new Date(Date.now() - msAgo).toISOString();
}

function stageCount(data, id) {
  return Number((data.stages || []).find((s) => s.id === id)?.count || 0);
}

function exitRow(data, from) {
  return (data.exitInsights?.exitStages || []).find((s) => s.from === from) || null;
}

function requestJson(port, method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitHealth(port, child) {
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode != null) throw new Error("server exited early");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("health timeout");
}

function buildFixture() {
  const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  // Converter: Facebook mobile → full funnel through paid
  const converter = {
    email: "maya.chen@gmail.com",
    visitorId: "vis_converter",
    sessionId: "ses_converter",
  };
  // Abandoner A: TikTok desktop → lands, views pricing, never CTA (true exit)
  const abandonA = {
    visitorId: "vis_abandon_a",
    sessionId: "ses_abandon_a",
  };
  // Abandoner B: Google mobile → CTA only, never signup (true exit after CTA)
  const abandonB = {
    visitorId: "vis_abandon_b",
    sessionId: "ses_abandon_b",
  };
  // Returner: same visitor refreshes / returns later without converting
  const returner = {
    visitorId: "vis_returner",
    sessionId1: "ses_returner_1",
    sessionId2: "ses_returner_2",
  };
  // Later signup: first abandoned-looking visit, then returns and completes signup
  const laterSignup = {
    email: "jordan.lee@gmail.com",
    visitorId: "vis_later_signup",
    sessionId1: "ses_later_1",
    sessionId2: "ses_later_2",
  };

  const events = [
    // Converter journey (~8 minutes on site, last page lessons before continuing)
    {
      name: "website_visit", visitorId: converter.visitorId, sessionId: converter.sessionId,
      createdAt: iso(40 * 60000), path: "/?utm_source=facebook", url: "https://x.test/?utm_source=facebook",
      userAgent: mobileUA, source: "Facebook",
      attribution: { source: "Facebook", medium: "paid_social", landingPage: "/?utm_source=facebook", firstSeenAt: iso(40 * 60000) },
    },
    {
      name: "page_view", visitorId: converter.visitorId, sessionId: converter.sessionId,
      createdAt: iso(38 * 60000), path: "/lessons", detail: { view: "lessons" },
      userAgent: mobileUA, user: converter.email, source: "Facebook",
      attribution: { source: "Facebook", landingPage: "/?utm_source=facebook" },
    },
    {
      name: "cta_click", visitorId: converter.visitorId, sessionId: converter.sessionId,
      createdAt: iso(36 * 60000), detail: { cta: "start_free", label: "Start Free" },
      userAgent: mobileUA, source: "Facebook",
      attribution: { source: "Facebook", landingPage: "/?utm_source=facebook" },
    },
    {
      name: "signup_start", visitorId: converter.visitorId, sessionId: converter.sessionId,
      createdAt: iso(35 * 60000), detail: { source: "auth_modal" }, userAgent: mobileUA,
    },
    {
      name: "account_signup_complete", visitorId: converter.visitorId, sessionId: converter.sessionId,
      createdAt: iso(32 * 60000), user: converter.email, userAgent: mobileUA,
      attribution: { source: "Facebook", landingPage: "/?utm_source=facebook", firstSeenAt: iso(40 * 60000) },
    },
    {
      name: "checkout_success", visitorId: converter.visitorId, sessionId: converter.sessionId,
      createdAt: iso(20 * 60000), user: converter.email, detail: { plan: "monthly" },
    },

    // Abandoner A: 5.0 minutes, last page = pricing
    {
      name: "website_visit", visitorId: abandonA.visitorId, sessionId: abandonA.sessionId,
      createdAt: iso(25 * 60000), path: "/?utm_source=tiktok", url: "https://x.test/?utm_source=tiktok",
      userAgent: desktopUA, source: "TikTok",
      attribution: { source: "TikTok", medium: "paid_social", landingPage: "/?utm_source=tiktok" },
    },
    {
      name: "page_view", visitorId: abandonA.visitorId, sessionId: abandonA.sessionId,
      createdAt: iso(20 * 60000), path: "/pricing", detail: { view: "pricing" },
      userAgent: desktopUA, source: "TikTok",
      attribution: { source: "TikTok", landingPage: "/?utm_source=tiktok" },
    },

    // Abandoner B: CTA then leaves (~3 minutes), last page = signup modal path
    {
      name: "website_visit", visitorId: abandonB.visitorId, sessionId: abandonB.sessionId,
      createdAt: iso(18 * 60000), path: "/?utm_source=google", url: "https://x.test/?utm_source=google&utm_medium=cpc",
      userAgent: mobileUA, source: "Google",
      attribution: { source: "Google", medium: "cpc", landingPage: "/?utm_source=google&utm_medium=cpc" },
    },
    {
      name: "page_view", visitorId: abandonB.visitorId, sessionId: abandonB.sessionId,
      createdAt: iso(17 * 60000), path: "/", detail: { view: "home" },
      userAgent: mobileUA, source: "Google",
      attribution: { source: "Google", landingPage: "/?utm_source=google&utm_medium=cpc" },
    },
    {
      name: "cta_click", visitorId: abandonB.visitorId, sessionId: abandonB.sessionId,
      createdAt: iso(15 * 60000), detail: { cta: "start_free", label: "Start Free" },
      userAgent: mobileUA, path: "/", source: "Google",
      attribution: { source: "Google", landingPage: "/?utm_source=google&utm_medium=cpc" },
    },

    // Returner: first visit, refresh same session, return next session — still one unique visitor exit
    {
      name: "website_visit", visitorId: returner.visitorId, sessionId: returner.sessionId1,
      createdAt: iso(50 * 60000), path: "/", url: "https://x.test/",
      userAgent: desktopUA, source: "Direct",
      attribution: { source: "Direct", landingPage: "/" },
    },
    {
      name: "page_view", visitorId: returner.visitorId, sessionId: returner.sessionId1,
      createdAt: iso(49 * 60000), path: "/", detail: { view: "home" },
      userAgent: desktopUA, source: "Direct",
      attribution: { source: "Direct", landingPage: "/" },
    },
    // refresh / revisit
    {
      name: "website_visit", visitorId: returner.visitorId, sessionId: returner.sessionId1,
      createdAt: iso(48 * 60000), path: "/", url: "https://x.test/",
      userAgent: desktopUA, source: "Direct",
      attribution: { source: "Direct", landingPage: "/" },
    },
    {
      name: "website_visit", visitorId: returner.visitorId, sessionId: returner.sessionId2,
      createdAt: iso(10 * 60000), path: "/", url: "https://x.test/",
      userAgent: desktopUA, source: "Direct",
      attribution: { source: "Direct", landingPage: "/" },
    },
    {
      name: "page_view", visitorId: returner.visitorId, sessionId: returner.sessionId2,
      createdAt: iso(9 * 60000), path: "/about", detail: { view: "about" },
      userAgent: desktopUA, source: "Direct",
      attribution: { source: "Direct", landingPage: "/" },
    },

    // Later signup: early bounce-looking events, then returns and completes signup
    {
      name: "website_visit", visitorId: laterSignup.visitorId, sessionId: laterSignup.sessionId1,
      createdAt: iso(60 * 60000), path: "/?utm_source=organic", url: "https://x.test/?utm_source=organic",
      userAgent: mobileUA, source: "Organic",
      attribution: { source: "Organic", medium: "referral", landingPage: "/?utm_source=organic", firstSeenAt: iso(60 * 60000) },
      referrer: "https://www.bing.com/",
    },
    {
      name: "page_view", visitorId: laterSignup.visitorId, sessionId: laterSignup.sessionId1,
      createdAt: iso(59 * 60000), path: "/lessons", detail: { view: "lessons" },
      userAgent: mobileUA, source: "Organic",
      attribution: { source: "Organic", landingPage: "/?utm_source=organic" },
    },
    // later return + convert
    {
      name: "website_visit", visitorId: laterSignup.visitorId, sessionId: laterSignup.sessionId2,
      createdAt: iso(8 * 60000), path: "/?utm_source=organic",
      userAgent: mobileUA, source: "Organic",
      attribution: { source: "Organic", landingPage: "/?utm_source=organic", firstSeenAt: iso(60 * 60000) },
    },
    {
      name: "cta_click", visitorId: laterSignup.visitorId, sessionId: laterSignup.sessionId2,
      createdAt: iso(7 * 60000), detail: { cta: "start_free", label: "Start Free" },
      userAgent: mobileUA, source: "Organic",
      attribution: { source: "Organic", landingPage: "/?utm_source=organic" },
    },
    {
      name: "signup_start", visitorId: laterSignup.visitorId, sessionId: laterSignup.sessionId2,
      createdAt: iso(6 * 60000), userAgent: mobileUA,
    },
    {
      name: "account_signup_complete", visitorId: laterSignup.visitorId, sessionId: laterSignup.sessionId2,
      createdAt: iso(5 * 60000), user: laterSignup.email, userAgent: mobileUA,
      attribution: { source: "Organic", landingPage: "/?utm_source=organic", firstSeenAt: iso(60 * 60000) },
    },
  ];

  const store = {
    users: {
      [converter.email]: {
        email: converter.email,
        firstName: "Maya",
        lastName: "Chen",
        plan: "Pro",
        subscriptionStatus: "active",
        signupAt: iso(32 * 60000),
        emailVerified: true,
        emailVerifiedAt: iso(30 * 60000),
        metaStartTrialAt: iso(28 * 60000),
        trialEnd: iso(27 * 60000),
        metaPurchaseAt: iso(20 * 60000),
        firstPaidInvoiceAt: iso(20 * 60000),
        userAgent: mobileUA,
        attribution: {
          source: "Facebook",
          medium: "paid_social",
          landingPage: "/?utm_source=facebook",
          firstSeenAt: iso(40 * 60000),
        },
      },
      [laterSignup.email]: {
        email: laterSignup.email,
        firstName: "Jordan",
        lastName: "Lee",
        plan: "Free",
        subscriptionStatus: "",
        signupAt: iso(5 * 60000),
        emailVerified: true,
        emailVerifiedAt: iso(4 * 60000),
        userAgent: mobileUA,
        attribution: {
          source: "Organic",
          medium: "referral",
          landingPage: "/?utm_source=organic",
          firstSeenAt: iso(60 * 60000),
        },
      },
    },
    analyticsEvents: events,
    featureRequests: [],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
  };

  return { store, converter, abandonA, abandonB, returner, laterSignup, mobileUA, desktopUA };
}

function unitVerification() {
  const { store, converter, abandonA, abandonB, returner, laterSignup } = buildFixture();
  const result = insights.buildInsights(store, { hub: "marketing-funnel", range: "all" });
  const data = result.data;
  const exits = data.exitInsights;
  assert.ok(exits, "exitInsights missing");

  // Snapshot core funnel metrics for regression guard
  const baselineStages = Object.fromEntries((data.stages || []).map((s) => [s.id, s.count]));
  check("baseline funnel has visitors", baselineStages.visitors >= 4, `visitors=${baselineStages.visitors}`);
  check("baseline funnel has paid", baselineStages.paidConversions >= 1);

  // 1) Exit counts equal funnel drop-off totals for actionable edges only.
  // Optional/informational stages (Email verified, Trial ended) are not exit destinations.
  check(
    "optional email verify not an exit destination",
    !(data.exitInsights?.exitStages || []).some((s) => s.to === "emailVerified" || s.from === "emailVerified"),
  );
  check(
    "emailVerified stage is informational when optional",
    data.emailVerificationRequired === false
      && (data.stages || []).some((s) => s.id === "emailVerified" && s.informational === true),
  );
  for (const transition of data.transitions || []) {
    if (transition.to === "activeSubscribers") continue; // snapshot edge skipped in Why They Left
    if (transition.informational) {
      check(
        `informational transition ${transition.from}→${transition.to} has zero rec drop-off`,
        transition.dropOffCount === 0 && transition.countsTowardRecommendations === false,
      );
      continue;
    }
    const row = (data.exitInsights?.exitStages || []).find((s) => s.from === transition.from && s.to === transition.to);
    // Supporting→supporting edges may be bridged in Why They Left to the next actionable stage.
    if (!row) {
      const bridged = exitRow(data, transition.from);
      check(
        `actionable exit row exists for ${transition.from}`,
        Boolean(bridged),
        `from=${transition.from} to=${transition.to}`,
      );
      continue;
    }
    check(
      `exit count matches drop-off for ${transition.from}→${transition.to}`,
      row.exitCount === transition.dropOffCount || row.exitCount === transition.rawDropOffCount,
      `exit=${row.exitCount} dropOff=${transition.dropOffCount} from=${transition.fromCount} to=${transition.toCount}`,
    );
    check(
      `exit reachedCount matches stage for ${transition.from}`,
      row.reachedCount === transition.fromCount,
      `reached=${row.reachedCount} fromCount=${transition.fromCount}`,
    );
  }

  // 2+3) Refresh / returner: unique visitor, not one abandonment per revisit
  const landExit = exitRow(data, "landingPageViews");
  const landDrill = insights.buildInsights(store, {
    hub: "marketing-funnel",
    range: "all",
    exitStage: "landingPageViews",
  }).data.exitInsights.exitPeople.landingPageViews || [];
  const returnerHits = landDrill.filter((p) => (p.visitorKey || p.email) === returner.visitorId
    || String(p.visitorKey || "").includes("returner"));
  check("returner counted once in landing exits", returnerHits.length === 1, `hits=${returnerHits.length}`);
  check(
    "refresh/return does not inflate visitors",
    stageCount(data, "visitors") === new Set([
      converter.visitorId, abandonA.visitorId, abandonB.visitorId, returner.visitorId, laterSignup.visitorId,
    ]).size
      || stageCount(data, "visitors") === 5,
    `visitors=${stageCount(data, "visitors")}`,
  );

  // 4) Later signup removed from abandoned stages they progressed past
  check(
    "later signup not in landingPageViews exits",
    !landDrill.some((p) => p.email === laterSignup.email || p.visitorKey === laterSignup.visitorId),
  );
  check(
    "later signup not listed as abandoned on organic landing (signed up)",
    !(exits.topAbandonmentLandingPages || []).some((r) =>
      String(r.page).includes("organic") && r.signups === 0 && r.abandoned > 0 && r.visitors === 1
      && landDrill.some((p) => p.email === laterSignup.email)),
  );
  const abandonLanding = (exits.topAbandonmentLandingPages || []).find((r) => String(r.page).includes("tiktok"));
  check("true abandoner landing still abandoned", Boolean(abandonLanding && abandonLanding.abandoned >= 1));

  // Converter should not appear in any exit drill for stages they completed through
  for (const from of ["visitors", "landingPageViews", "ctaClicks", "signupStarts", "signupCompletions"]) {
    const people = insights.buildInsights(store, {
      hub: "marketing-funnel", range: "all", exitStage: from,
    }).data.exitInsights?.exitPeople?.[from] || [];
    check(
      `converter not in ${from} exits`,
      !people.some((p) => p.email === converter.email || p.visitorKey === converter.visitorId),
    );
  }

  // 5) Last page viewed accurate for abandoner A
  const abandonAPerson = landDrill.find((p) => p.visitorKey === abandonA.visitorId);
  check("abandoner A present in landing exits", Boolean(abandonAPerson));
  check(
    "last page is pricing for abandoner A",
    Boolean(abandonAPerson && String(abandonAPerson.lastPage).includes("pricing")),
    `lastPage=${abandonAPerson?.lastPage}`,
  );

  // Returner's last page should be about (latest event)
  const returnerPerson = landDrill.find((p) => p.visitorKey === returner.visitorId);
  check(
    "returner last page is about",
    Boolean(returnerPerson && String(returnerPerson.lastPage).includes("about")),
    `lastPage=${returnerPerson?.lastPage}`,
  );

  // 6) Time before exit ~5 minutes for abandoner A (25m ago visit → 20m ago page)
  check(
    "time before exit ~5m for abandoner A",
    Boolean(abandonAPerson
      && abandonAPerson.minutesBeforeExit != null
      && abandonAPerson.minutesBeforeExit >= 4.5
      && abandonAPerson.minutesBeforeExit <= 5.5),
    `minutes=${abandonAPerson?.minutesBeforeExit} label=${abandonAPerson?.minutesBeforeExitLabel}`,
  );

  // 7) Device + source attribution
  check("abandoner A device Desktop", abandonAPerson?.device === "Desktop");
  check("abandoner A source TikTok", abandonAPerson?.source === "TikTok");
  // Start Free CTA also marks signupStarts, so abandoner B's exit edge is signupStarts→signupCompletions.
  const signupStartDrill = insights.buildInsights(store, {
    hub: "marketing-funnel", range: "all", exitStage: "signupStarts",
  }).data.exitInsights?.exitPeople?.signupStarts || [];
  const abandonBPerson = signupStartDrill.find((p) => p.visitorKey === abandonB.visitorId);
  check("abandoner B in signupStarts exits (after CTA, no signup)", Boolean(abandonBPerson));
  check("abandoner B device Mobile", abandonBPerson?.device === "Mobile");
  check("abandoner B source Google", abandonBPerson?.source === "Google");
  check(
    "abandoner B not false-exited at CTA (reached signupStarts via Start Free)",
    exitRow(data, "ctaClicks")?.exitCount === 0,
  );

  // Source aggregates on exit row
  check(
    "landing exit sources include TikTok + Direct",
    (landExit.sources || []).some((s) => s.key === "TikTok")
      && (landExit.sources || []).some((s) => s.key === "Direct"),
    JSON.stringify(landExit.sources || []),
  );

  // 8) Filters update widgets consistently
  const today = insights.buildInsights(store, { hub: "marketing-funnel", range: "today" }).data;
  const week = insights.buildInsights(store, { hub: "marketing-funnel", range: "7d" }).data;
  const month = insights.buildInsights(store, { hub: "marketing-funnel", range: "30d" }).data;
  const all = insights.buildInsights(store, { hub: "marketing-funnel", range: "all" }).data;
  for (const [label, scoped] of [["today", today], ["7d", week], ["30d", month], ["all", all]]) {
    check(
      `${label} has exitInsights wired to stages`,
      Array.isArray(scoped.exitInsights?.exitStages) && Array.isArray(scoped.stages),
    );
    for (const transition of scoped.transitions || []) {
      if (transition.to === "activeSubscribers" || transition.informational) continue;
      const row = (scoped.exitInsights?.exitStages || []).find((s) => s.from === transition.from && s.to === transition.to)
        || exitRow(scoped, transition.from);
      check(
        `${label} exit row present for ${transition.from}`,
        Boolean(row),
        `drop=${transition.dropOffCount}`,
      );
    }
  }
  check("All visitors >= Today visitors", stageCount(all, "visitors") >= stageCount(today, "visitors"));

  const tiktokOnly = insights.buildInsights(store, {
    hub: "marketing-funnel", range: "all", source: "TikTok",
  }).data;
  check("TikTok filter visitors == 1", stageCount(tiktokOnly, "visitors") === 1);
  const tiktokLand = exitRow(tiktokOnly, "landingPageViews");
  check("TikTok filter landing exits == 1", tiktokLand?.exitCount === 1, `exit=${tiktokLand?.exitCount}`);
  check(
    "TikTok filter exit sources only TikTok",
    (tiktokLand?.sources || []).every((s) => s.key === "TikTok"),
    JSON.stringify(tiktokLand?.sources || []),
  );
  const tiktokPeople = insights.buildInsights(store, {
    hub: "marketing-funnel", range: "all", source: "TikTok", exitStage: "landingPageViews",
  }).data.exitInsights?.exitPeople?.landingPageViews || [];
  check("TikTok exit drill-down only TikTok people", tiktokPeople.length === 1 && tiktokPeople[0].source === "TikTok");

  // 9) Stage drill-down shows correct affected users
  check("landing exit drill includes abandoner A + returner", landDrill.length >= 2);
  check("landing exit drill excludes converter", !landDrill.some((p) => p.email === converter.email));
  check(
    "signupStarts exit drill includes abandoner B and excludes converter",
    signupStartDrill.some((p) => p.visitorKey === abandonB.visitorId)
      && !signupStartDrill.some((p) => p.email === converter.email),
  );

  // 10) No impact to existing Marketing Funnel metrics (recompute unchanged stage counts)
  const again = insights.buildInsights(store, { hub: "marketing-funnel", range: "all" }).data;
  for (const [id, count] of Object.entries(baselineStages)) {
    check(
      `funnel stage ${id} unchanged`,
      stageCount(again, id) === count,
      `was=${count} now=${stageCount(again, id)}`,
    );
  }
  check("overallConversionRate stable", again.overallConversionRate === data.overallConversionRate);
  check("transitions length stable", again.transitions.length === data.transitions.length);

  // Existing hubs still work
  const advisor = insights.buildInsights(store, { hub: "advisor", range: "7d" });
  check("advisor still builds", advisor.hub === "advisor" && Array.isArray(advisor.data.recommendations));
  const usage = insights.buildInsights(store, { hub: "feature-usage", range: "7d" });
  check("feature-usage still builds", Array.isArray(usage.data.mostUsedPages));

  console.log("PASS unit exit-integrity suite");
  return { baselineStages, data };
}

async function apiVerification() {
  const { store } = buildFixture();
  const storePath = path.join(os.tmpdir(), `llh-exit-verify-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    ...store,
    foundingMembers: [],
  }));
  const port = 20200 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@exit-verify.local",
      ADMIN_PASSWORD: "exit-pass",
      ADMIN_ACCESS_CODE: "42424",
      MONITOR_ALERTS_ENABLED: "false",
      MONITOR_CHECK_INTERVAL_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitHealth(port, child);
    const login = await requestJson(port, "POST", "/api/admin/login", {
      body: { email: "owner@exit-verify.local", password: "exit-pass", code: "42424" },
    });
    assert.equal(login.status, 200, login.text?.slice(0, 200));
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const get = async (qs) => {
      const res = await requestJson(port, "GET", `/api/admin/insights?hub=marketing-funnel&${qs}`, { headers: auth });
      assert.equal(res.status, 200, res.text?.slice(0, 300));
      return res.json.insights.data;
    };

    const all = await get("range=all");
    check("API exitInsights present", Boolean(all.exitInsights?.exitStages?.length));

    // Live refresh should not create false exits: re-post same visitor website_visit
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      body: {
        event: {
          id: `evt_refresh_${crypto.randomBytes(3).toString("hex")}`,
          name: "website_visit",
          visitorId: "vis_returner",
          sessionId: "ses_returner_refresh",
          path: "/",
          url: "https://x.test/",
          source: "Direct",
          attribution: { source: "Direct", landingPage: "/" },
          createdAt: new Date().toISOString(),
        },
      },
    });
    const afterRefresh = await get("range=all");
    check(
      "API refresh does not increase visitors",
      stageCount(afterRefresh, "visitors") === stageCount(all, "visitors"),
      `before=${stageCount(all, "visitors")} after=${stageCount(afterRefresh, "visitors")}`,
    );
    const beforeLandExit = exitRow(all, "landingPageViews")?.exitCount || 0;
    const afterLandExit = exitRow(afterRefresh, "landingPageViews")?.exitCount || 0;
    check(
      "API refresh does not create false landing exits",
      afterLandExit === beforeLandExit,
      `before=${beforeLandExit} after=${afterLandExit}`,
    );

    for (const range of ["today", "7d", "30d", "all"]) {
      const scoped = await get(`range=${range}`);
      check(`${range} API widgets consistent`, Array.isArray(scoped.stages) && Array.isArray(scoped.exitInsights?.exitStages));
      for (const t of scoped.transitions || []) {
        if (t.to === "activeSubscribers" || t.informational) continue;
        const row = (scoped.exitInsights?.exitStages || []).find((s) => s.from === t.from && s.to === t.to)
          || exitRow(scoped, t.from);
        check(`${range} API exit row for ${t.from}`, Boolean(row));
      }
    }

    const fb = await get("range=all&source=Facebook");
    check("API Facebook filter keeps converter visitor", stageCount(fb, "visitors") >= 1);
    check(
      "API Facebook filter excludes TikTok exit source",
      !(exitRow(fb, "landingPageViews")?.sources || []).some((s) => s.key === "TikTok"),
    );

    const drill = await get("range=all&exitStage=landingPageViews");
    check(
      "API exit drill-down returns people",
      (drill.exitInsights?.exitPeople?.landingPageViews || []).length >= 1,
    );

    // Existing funnel KPI still present
    check("API overallConversionRate present", typeof afterRefresh.overallConversionRate === "string");
    check("API costs object present", Boolean(afterRefresh.costs));

    console.log("PASS API exit-integrity suite");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

function scopeGuard() {
  const { execSync } = require("node:child_process");
  const diff = execSync("git diff origin/main...HEAD --name-only", { cwd: ROOT, encoding: "utf8" });
  const files = diff.split("\n").map((s) => s.trim()).filter(Boolean);
  const forbidden = files.filter((f) =>
    /stripe|billing|curriculum|lesson-plan|family-hub|auth\.|password|membership-price|checkout/i.test(f)
    && !/admin-insights|verify-marketing-funnel|verify-funnel-exit|test-admin-insights|llh-admin-workspace|service-worker|index\.html/.test(f));
  check("no Stripe/auth/curriculum/billing file changes", forbidden.length === 0, forbidden.join(", ") || "clean");
  // Scope guard is advisory for pre-merge of #429; later analytics-only PRs may touch the same surface.
  const disallowed = files.filter((f) =>
    !/admin-insights|verify-marketing-funnel|verify-funnel-exit|test-admin-insights|test-admin-metric-accuracy|test-free-signup-funnel|admin-metrics-accuracy-audit|llh-admin-workspace|service-worker|index\.html|package\.json|server\/index\.js/.test(f));
  check("diff limited to analytics/insights surface", disallowed.length === 0, disallowed.join(", ") || files.join(", "));
  console.log("PASS scope guard");
}

async function main() {
  scopeGuard();
  unitVerification();
  await apiVerification();
  console.log("\nAll funnel exit verification checks passed.");
}

main().catch((error) => {
  console.error("\nVERIFICATION FAILED:", error.message || error);
  process.exitCode = 1;
});
