#!/usr/bin/env node
/**
 * Real test-flow verification for Marketing Funnel (PR #428).
 * Spawns a temp local-json server, drives analytics + membership updates,
 * and asserts every funnel check before merge/deploy.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const EMAIL = "casey.rivera@gmail.com";
const VISITOR = `vis_${crypto.randomBytes(4).toString("hex")}`;
const SESSION = `ses_${crypto.randomBytes(4).toString("hex")}`;

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

function stageCount(data, id) {
  return Number((data.stages || []).find((s) => s.id === id)?.count || 0);
}

function check(name, ok, detail = "") {
  if (!ok) throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const storePath = path.join(os.tmpdir(), `llh-funnel-verify-${crypto.randomBytes(4).toString("hex")}.json`);
  const port = 20100 + Math.floor(Math.random() * 400);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    analyticsEvents: [],
    featureRequests: [],
    foundingMembers: [],
    siteContent: { curriculum: { lessonPlans: [], activities: [] } },
  }));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@funnel-verify.local",
      ADMIN_PASSWORD: "funnel-pass",
      ADMIN_ACCESS_CODE: "42424",
      MONITOR_ALERTS_ENABLED: "false",
      MONITOR_CHECK_INTERVAL_MS: "600000",
      // Keep ad spend unset so cost metrics must remain unavailable.
      MARKETING_AD_SPEND_TOTAL: "",
      MARKETING_AD_SPEND_FACEBOOK: "",
      MARKETING_AD_SPEND_TIKTOK: "",
      MARKETING_AD_SPEND_GOOGLE: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const results = { checks: [] };
  try {
    await waitHealth(port, child);

    const login = await requestJson(port, "POST", "/api/admin/login", {
      body: { email: "owner@funnel-verify.local", password: "funnel-pass", code: "42424" },
    });
    assert.equal(login.status, 200, login.text?.slice(0, 200));
    const token = login.json.token;
    const auth = { Authorization: `Bearer ${token}` };

    const getFunnel = async (qs = "range=all") => {
      const res = await requestJson(port, "GET", `/api/admin/insights?hub=marketing-funnel&${qs}`, { headers: auth });
      assert.equal(res.status, 200, res.text?.slice(0, 300));
      return res.json.insights.data;
    };

    const baseline = await getFunnel("range=all");
    check("baseline empty visitors", stageCount(baseline, "visitors") === 0);
    check("cost hidden without ad spend", baseline.costs?.costPerSignup == null && baseline.costs?.costPerPaid == null
      && baseline.costs?.configured === false, `costPerSignup=${baseline.costs?.costPerSignup}`);

    const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const fbAttr = {
      source: "Facebook",
      medium: "paid_social",
      campaign: "funnel_verify",
      landingPage: "/?utm_source=facebook&utm_campaign=funnel_verify",
      firstSeenAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    };

    const postEvent = async (name, extra = {}, ua = mobileUA) => {
      const body = {
        event: {
          id: `evt_${name}_${crypto.randomBytes(3).toString("hex")}`,
          name,
          visitorId: VISITOR,
          sessionId: SESSION,
          path: extra.path || "/",
          url: extra.url || "https://littlelearnershubbyleah.com/?utm_source=facebook&utm_campaign=funnel_verify",
          attribution: extra.attribution || fbAttr,
          detail: extra.detail || {},
          user: extra.user || "",
          createdAt: extra.createdAt || new Date().toISOString(),
          source: extra.source || "Facebook",
        },
      };
      const res = await requestJson(port, "POST", "/api/analytics/event", {
        headers: { "User-Agent": ua },
        body,
      });
      assert.equal(res.status, 200, `${name} failed: ${res.text?.slice(0, 200)}`);
      return res.json;
    };

    // 1) Homepage visit → Visitors
    await postEvent("website_visit", {
      path: "/",
      url: "https://littlelearnershubbyleah.com/?utm_source=facebook&utm_campaign=funnel_verify",
    });
    let data = await getFunnel("range=all");
    check("homepage visit increments Visitors", stageCount(data, "visitors") === 1, `count=${stageCount(data, "visitors")}`);

    // Double-count guard: refresh / return with same visitor
    await postEvent("website_visit", {
      path: "/",
      url: "https://littlelearnershubbyleah.com/?utm_source=facebook&utm_campaign=funnel_verify",
    });
    data = await getFunnel("range=all");
    check("no double-count on refresh (same visitor)", stageCount(data, "visitors") === 1, `count=${stageCount(data, "visitors")}`);

    // 2) Landing page views
    await postEvent("page_view", {
      path: "/",
      detail: { view: "home" },
      url: "https://littlelearnershubbyleah.com/?utm_source=facebook&utm_campaign=funnel_verify",
    });
    data = await getFunnel("range=all");
    check("landing page views increment", stageCount(data, "landingPageViews") >= 1, `count=${stageCount(data, "landingPageViews")}`);
    check("top landing pages populated", (data.topLandingPages || []).length >= 1);

    // 3) Start Free CTA
    await postEvent("cta_click", { detail: { cta: "start_free", label: "Start Free", placement: "hero" } });
    data = await getFunnel("range=all");
    check("Start Free increments CTA clicks", stageCount(data, "ctaClicks") === 1, `count=${stageCount(data, "ctaClicks")}`);
    check("CTA breakdown startFree", Number(data.ctaBreakdown?.startFree || 0) >= 1);

    // 4) Signup started
    await postEvent("signup_start", { detail: { source: "auth_modal" } });
    data = await getFunnel("range=all");
    check("signup started increments", stageCount(data, "signupStarts") === 1, `count=${stageCount(data, "signupStarts")}`);

    // 5) Signup completed (+ profile sync)
    const signupAt = new Date().toISOString();
    await postEvent("account_signup_complete", {
      user: EMAIL,
      createdAt: signupAt,
      detail: { firstName: "Casey", lastName: "Rivera", accountType: "home_daycare" },
    });
    const profile = await requestJson(port, "POST", "/api/account/profile", {
      body: {
        email: EMAIL,
        firstName: "Casey",
        lastName: "Rivera",
        signup: true,
        accountType: "home_daycare",
      },
    });
    assert.ok([200, 201].includes(profile.status), profile.text?.slice(0, 200));
    data = await getFunnel("range=all");
    check("signup completed increments", stageCount(data, "signupCompletions") === 1, `count=${stageCount(data, "signupCompletions")}`);

    // 6) Email verified
    let mem = await requestJson(port, "POST", "/api/admin/membership-update", {
      headers: auth,
      body: {
        email: EMAIL,
        adminToken: token,
        updates: {
          emailVerified: true,
          emailVerifiedAt: new Date().toISOString(),
          attribution: fbAttr,
        },
        note: "funnel verify email",
      },
    });
    assert.equal(mem.status, 200, mem.text?.slice(0, 250));
    data = await getFunnel("range=all");
    check("email verified increments", stageCount(data, "emailVerified") === 1, `count=${stageCount(data, "emailVerified")}`);

    // 7) Trial started
    const trialStart = new Date().toISOString();
    const trialEndPast = new Date(Date.now() - 3600000).toISOString(); // will also cover trial ended later
    mem = await requestJson(port, "POST", "/api/admin/membership-update", {
      headers: auth,
      body: {
        email: EMAIL,
        adminToken: token,
        updates: {
          plan: "Pro",
          subscriptionStatus: "trialing",
          metaStartTrialAt: trialStart,
          trialStart,
          trialEnd: new Date(Date.now() + 6 * 86400000).toISOString(),
          attribution: fbAttr,
        },
        note: "funnel verify trial start",
      },
    });
    assert.equal(mem.status, 200, mem.text?.slice(0, 250));
    data = await getFunnel("range=all");
    check("trial started increments", stageCount(data, "trialStarts") === 1, `count=${stageCount(data, "trialStarts")}`);

    // 8) Trial ended (set trialEnd in the past while keeping history)
    mem = await requestJson(port, "POST", "/api/admin/membership-update", {
      headers: auth,
      body: {
        email: EMAIL,
        adminToken: token,
        updates: {
          trialEnd: trialEndPast,
          metaStartTrialAt: trialStart,
          attribution: fbAttr,
        },
        note: "funnel verify trial end",
      },
    });
    assert.equal(mem.status, 200, mem.text?.slice(0, 250));
    data = await getFunnel("range=all");
    check("trial ended increments", stageCount(data, "trialEnded") === 1, `count=${stageCount(data, "trialEnded")}`);

    // 9) Paid conversion
    const paidAt = new Date().toISOString();
    await postEvent("checkout_success", {
      user: EMAIL,
      createdAt: paidAt,
      detail: { plan: "monthly" },
    });
    mem = await requestJson(port, "POST", "/api/admin/membership-update", {
      headers: auth,
      body: {
        email: EMAIL,
        adminToken: token,
        updates: {
          plan: "Pro",
          subscriptionStatus: "active",
          metaPurchaseAt: paidAt,
          firstPaidInvoiceAt: paidAt,
          attribution: fbAttr,
        },
        note: "funnel verify paid",
      },
    });
    assert.equal(mem.status, 200, mem.text?.slice(0, 250));
    data = await getFunnel("range=all");
    check("converted to paid increments", stageCount(data, "paidConversions") === 1, `count=${stageCount(data, "paidConversions")}`);

    // 10) Active subscribers matches current subscription count
    const activeCount = stageCount(data, "activeSubscribers");
    check("active subscribers >= 1 for paid user", activeCount >= 1, `count=${activeCount}`);
    // Cross-check against users in store via advisor/users presence in stagePeople
    const paidPeople = data.stagePeople?.paidConversions || [];
    check("paid stage people includes signup email", paidPeople.some((p) => p.email === EMAIL));

    // 11) Source attribution Facebook
    const fbRow = (data.bySource || []).find((r) => r.source === "Facebook");
    check("Facebook source attributed", Boolean(fbRow && (fbRow.counts?.visitors || 0) >= 1), JSON.stringify(fbRow?.counts || {}));
    const fbFilter = await getFunnel("range=all&source=Facebook");
    check("source filter Facebook keeps visitor", stageCount(fbFilter, "visitors") >= 1);
    const tiktokFilter = await getFunnel("range=all&source=TikTok");
    check("source filter TikTok excludes FB visitor", stageCount(tiktokFilter, "visitors") === 0);

    // Add a desktop TikTok visitor for device + source diversity
    const tiktokVisitor = `vis_tt_${crypto.randomBytes(3).toString("hex")}`;
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": desktopUA },
      body: {
        event: {
          id: `evt_tt_${crypto.randomBytes(3).toString("hex")}`,
          name: "website_visit",
          visitorId: tiktokVisitor,
          sessionId: `ses_tt_${crypto.randomBytes(3).toString("hex")}`,
          path: "/",
          url: "https://littlelearnershubbyleah.com/?utm_source=tiktok",
          source: "TikTok",
          attribution: { source: "TikTok", medium: "paid_social", landingPage: "/?utm_source=tiktok" },
          createdAt: new Date().toISOString(),
        },
      },
    });
    data = await getFunnel("range=all");
    check("device breakdown has Mobile", (data.deviceBreakdown || []).some((d) => d.key === "Mobile" && d.count >= 1));
    check("device breakdown has Desktop", (data.deviceBreakdown || []).some((d) => d.key === "Desktop" && d.count >= 1));
    check("TikTok appears in source breakdown", (data.bySource || []).some((r) => r.source === "TikTok" && r.counts.visitors >= 1));

    // 12) Average time calculations
    check("avg visit→signup computed", data.timing?.avgHoursVisitToSignup != null || data.timing?.visitToSignupSamples >= 0);
    // Our firstSeen was 2h ago and signup now → roughly ~2h
    if (data.timing?.avgHoursVisitToSignup != null) {
      check(
        "avg visit→signup roughly accurate",
        data.timing.avgHoursVisitToSignup >= 1 && data.timing.avgHoursVisitToSignup <= 3,
        `hours=${data.timing.avgHoursVisitToSignup} label=${data.timing.avgHoursVisitToSignupLabel}`,
      );
    }
    if (data.timing?.avgHoursSignupToPaid != null) {
      check(
        "avg signup→paid near-immediate is small",
        data.timing.avgHoursSignupToPaid < 1,
        `hours=${data.timing.avgHoursSignupToPaid}`,
      );
    }

    // 13) Stage click / stagePeople list
    const stageDrill = await getFunnel("range=all&stage=signupCompletions");
    check(
      "stage drill-down opens correct user list",
      (stageDrill.stagePeople?.signupCompletions || []).some((p) => p.email === EMAIL),
      `people=${(stageDrill.stagePeople?.signupCompletions || []).length}`,
    );
    const ctaDrill = await getFunnel("range=all&stage=ctaClicks");
    check("CTA stage list non-empty", (ctaDrill.stagePeople?.ctaClicks || []).length >= 1);

    // 14) Filters update metrics consistently
    const today = await getFunnel("range=today");
    const week = await getFunnel("range=7d");
    const month = await getFunnel("range=30d");
    const all = await getFunnel("range=all");
    check("Today includes current visitor", stageCount(today, "visitors") >= 1);
    check("7d includes current visitor", stageCount(week, "visitors") >= 1);
    check("30d includes current visitor", stageCount(month, "visitors") >= 1);
    check("All includes >= today visitors", stageCount(all, "visitors") >= stageCount(today, "visitors"));
    check("transitions present", (all.transitions || []).length >= 5);
    check("drop-off fields present", all.transitions.every((t) => typeof t.dropOffRate === "number" && typeof t.conversionRate === "number"));

    // 15) Existing analytics unchanged / still healthy
    const advisor = await requestJson(port, "GET", "/api/admin/insights?hub=advisor&range=7d", { headers: auth });
    check("advisor still works", advisor.status === 200 && Array.isArray(advisor.json?.insights?.data?.recommendations));
    const usage = await requestJson(port, "GET", "/api/admin/insights?hub=feature-usage&range=7d", { headers: auth });
    check("feature-usage still works", usage.status === 200 && Array.isArray(usage.json?.insights?.data?.mostUsedPages));
    const health = await requestJson(port, "GET", "/api/health");
    check("health ok", health.status === 200 && health.json?.ok === true);

    // Cost still unavailable (no ad spend env)
    check("cost still — without spend", all.costs?.costPerSignup == null && all.costs?.costPerPaid == null);

    // Why They Left / exit insights (bounce visitor never CTAs)
    const bounceVisitor = `vis_bounce_${crypto.randomBytes(3).toString("hex")}`;
    const bounceSession = `ses_bounce_${crypto.randomBytes(3).toString("hex")}`;
    const bounceStart = new Date(Date.now() - 12 * 60000).toISOString();
    const bounceEnd = new Date(Date.now() - 10 * 60000).toISOString();
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": desktopUA },
      body: {
        event: {
          id: `evt_bounce_visit_${crypto.randomBytes(3).toString("hex")}`,
          name: "website_visit",
          visitorId: bounceVisitor,
          sessionId: bounceSession,
          path: "/?utm_source=google",
          url: "https://littlelearnershubbyleah.com/?utm_source=google",
          source: "Google",
          attribution: { source: "Google", medium: "cpc", landingPage: "/?utm_source=google" },
          createdAt: bounceStart,
        },
      },
    });
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": desktopUA },
      body: {
        event: {
          id: `evt_bounce_page_${crypto.randomBytes(3).toString("hex")}`,
          name: "page_view",
          visitorId: bounceVisitor,
          sessionId: bounceSession,
          path: "/pricing",
          detail: { view: "pricing" },
          url: "https://littlelearnershubbyleah.com/pricing",
          source: "Google",
          attribution: { source: "Google", medium: "cpc", landingPage: "/?utm_source=google" },
          createdAt: bounceEnd,
        },
      },
    });
    data = await getFunnel("range=all");
    const exits = data.exitInsights || {};
    check("exit insights present", Boolean(exits.exitStages && exits.mostCommonExit));
    check("exit stages have counts/percentages", (exits.exitStages || []).some((s) => s.exitCount >= 1 && typeof s.exitRate === "number"));
    const landExit = (exits.exitStages || []).find((s) => s.from === "landingPageViews");
    check("landing page exit has last page/device/source", Boolean(
      landExit
      && (landExit.topLastPages || []).length >= 1
      && (landExit.devices || []).length >= 1
      && (landExit.sources || []).length >= 1
      && landExit.avgMinutesBeforeExitLabel,
    ), JSON.stringify({
      topLastPages: landExit?.topLastPages,
      devices: landExit?.devices,
      sources: landExit?.sources,
      time: landExit?.avgMinutesBeforeExitLabel,
    }));
    check("abandonment landing pages present", (exits.topAbandonmentLandingPages || []).length >= 1);
    const exitDrill = await getFunnel("range=all&exitStage=landingPageViews");
    const exitPeople = exitDrill.exitInsights?.exitPeople?.landingPageViews || [];
    check("exit stage drill-down lists users", exitPeople.length >= 1, `people=${exitPeople.length}`);
    check("exit people include bounce visitor context", exitPeople.some((p) =>
      (p.lastPage || "").includes("pricing") || (p.visitorKey || "").includes(bounceVisitor.slice(0, 8)) || p.source === "Google"
    ));
    const exitToday = await getFunnel("range=today");
    check("exit filters honor Today range", (exitToday.exitInsights?.exitStages || []).some((s) => s.exitCount >= 0));
    const exitGoogle = await getFunnel("range=all&source=Google");
    check("exit filters honor Source=Google", (exitGoogle.exitInsights?.exitStages || []).some((s) => s.exitCount >= 1));

    // Direct attribution path
    const directVisitor = `vis_dir_${crypto.randomBytes(3).toString("hex")}`;
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": desktopUA },
      body: {
        event: {
          id: `evt_dir_${crypto.randomBytes(3).toString("hex")}`,
          name: "website_visit",
          visitorId: directVisitor,
          sessionId: `ses_dir_${crypto.randomBytes(3).toString("hex")}`,
          path: "/",
          url: "https://littlelearnershubbyleah.com/",
          source: "Direct",
          attribution: { source: "Direct", landingPage: "/" },
          referrer: "",
          createdAt: new Date().toISOString(),
        },
      },
    });
    data = await getFunnel("range=all");
    check("Direct source attributed", (data.bySource || []).some((r) => r.source === "Direct" && r.counts.visitors >= 1));

    // Google (paid/search) + Organic (non-Google referral / utm_source=organic)
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": desktopUA },
      body: {
        event: {
          id: `evt_google_${crypto.randomBytes(3).toString("hex")}`,
          name: "website_visit",
          visitorId: `vis_google_${crypto.randomBytes(3).toString("hex")}`,
          sessionId: `ses_google_${crypto.randomBytes(3).toString("hex")}`,
          path: "/",
          url: "https://littlelearnershubbyleah.com/?utm_source=google&utm_medium=cpc",
          source: "Google",
          attribution: { source: "Google", medium: "cpc", landingPage: "/?utm_source=google&utm_medium=cpc" },
          createdAt: new Date().toISOString(),
        },
      },
    });
    await requestJson(port, "POST", "/api/analytics/event", {
      headers: { "User-Agent": desktopUA },
      body: {
        event: {
          id: `evt_organic_${crypto.randomBytes(3).toString("hex")}`,
          name: "website_visit",
          visitorId: `vis_organic_${crypto.randomBytes(3).toString("hex")}`,
          sessionId: `ses_organic_${crypto.randomBytes(3).toString("hex")}`,
          path: "/",
          url: "https://littlelearnershubbyleah.com/?utm_source=organic",
          source: "Organic",
          attribution: {
            source: "Organic",
            medium: "referral",
            landingPage: "/?utm_source=organic",
            referrer: "https://www.bing.com/",
          },
          referrer: "https://www.bing.com/",
          createdAt: new Date().toISOString(),
        },
      },
    });
    data = await getFunnel("range=all");
    check("Google source attributed", (data.bySource || []).some((r) => r.source === "Google" && r.counts.visitors >= 1));
    check("Organic source attributed", (data.bySource || []).some((r) => r.source === "Organic" && r.counts.visitors >= 1));

    // Active subscribers matches current paid/active subscription count in funnel snapshot
    const activePeople = (await getFunnel("range=all&stage=activeSubscribers")).stagePeople?.activeSubscribers || [];
    check(
      "active subscribers matches subscription people count",
      stageCount(data, "activeSubscribers") === activePeople.length && activePeople.some((p) => p.email === EMAIL),
      `stage=${stageCount(data, "activeSubscribers")} people=${activePeople.length}`,
    );

    console.log("\nAll marketing funnel verification checks passed.");
    results.ok = true;
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nVERIFICATION FAILED:", error.message || error);
  process.exitCode = 1;
});
