#!/usr/bin/env node
/**
 * Childcare Professional Live Audit — production, seeded personas only.
 * Does not write durable customer data. Does not enable Teaching Kit flags.
 * Does not mutate curriculum.
 *
 * Run: node scripts/live-childcare-professional-audit.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { chromium } = require("playwright");
const {
  PERSONAS,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  dismissFreePlanNudgeIfPresent,
  openMobileNavIfNeeded,
  evaluateShell,
} = require("./test-helpers/llh-browser-nav");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const PLAN_ID = process.env.LLH_TK_PLAN_ID || "cur-lp-preschool-farm-animals";
const OUT = "/opt/cursor/artifacts/childcare-professional-live-audit";
const OWNER = "leahivie@icloud.com";

fs.mkdirSync(OUT, { recursive: true });

/** @type {Array<{persona:string,device:string,area:string,status:'working'|'issue'|'gap'|'blocked',severity:'P0'|'P1'|'P2'|'P3'|'info',title:string,detail:string,option:'fix_now'|'fix_later'|'dont_change'|'monitor',evidence?:string}>} */
const findings = [];

function finding(row) {
  findings.push({ at: new Date().toISOString(), ...row });
  const mark = row.status === "working" ? "✓" : row.status === "blocked" ? "■" : "!";
  console.log(`  ${mark} [${row.severity}] ${row.persona}/${row.device} · ${row.area}: ${row.title}${row.detail ? ` — ${row.detail}` : ""}`);
}

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...(opts.headers || {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(raw || "null"); } catch { json = { raw: raw.slice(0, 400) }; }
        resolve({ status: res.statusCode, json, text: raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const AUDIT_PERSONAS = {
  free: {
    ...PERSONAS.free,
    label: "Free",
    childcareLens: "Home provider on Free — needs clear free library, fair locks, low friction planning.",
  },
  trial: {
    ...PERSONAS.trial,
    label: "Trial",
    childcareLens: "Trying Pro before paying — needs full planning tools + clear trial status.",
  },
  founding: {
    ...PERSONAS.founding,
    label: "Founding Member",
    childcareLens: "Paid founding member — full access, trusted billing clarity.",
  },
  pro: {
    ...PERSONAS.pro,
    label: "Pro",
    childcareLens: "Paid Pro home daycare — full classroom week workflow.",
  },
  "home-daycare": {
    email: "audit-home-daycare@test.local",
    firstName: "Home",
    lastName: "Provider",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
    label: "Home Daycare",
    childcareLens: "Solo/home provider — mobile-first daily logs + quick lesson assign.",
  },
  "center-owner": {
    email: "audit-center-owner@test.local",
    firstName: "Center",
    lastName: "Owner",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "center",
    centerRole: "owner",
    label: "Center Owner",
    childcareLens: "Program owner — staff + classrooms + curriculum oversight.",
  },
  director: {
    email: "audit-director@test.local",
    firstName: "Dir",
    lastName: "Ector",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "director",
    accountType: "center",
    centerRole: "director",
    label: "Director",
    childcareLens: "Director — oversight of rooms, families, curriculum quality.",
  },
  teacher: {
    email: "audit-teacher@test.local",
    firstName: "Tea",
    lastName: "Cher",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "teacher",
    accountType: "center",
    centerRole: "teacher",
    label: "Teacher",
    childcareLens: "Classroom teacher — today board, logs, lessons on the floor.",
  },
  assistant: {
    email: "audit-assistant@test.local",
    firstName: "As",
    lastName: "Sistant",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "assistant",
    accountType: "center",
    centerRole: "assistant",
    label: "Assistant",
    childcareLens: "Assistant — quick care logging, limited admin surface.",
  },
};

const SURFACES = [
  { key: "lessons", nav: "lessons", view: "lessons", area: "Lesson Plans", must: true },
  { key: "activities", nav: "activities", view: "activities", area: "Activities", must: true },
  { key: "calendar", nav: "calendar", view: "calendar", area: "Calendar", must: true },
  { key: "children", nav: "children", view: "children", area: "Child Profiles", must: true },
  { key: "daily-logs", nav: "child-tools-daily-logs", view: "children", area: "Daily Logs", must: true },
  { key: "docs", nav: "ai", view: "ai", area: "Documentation Helpers", must: true },
  { key: "behavior", nav: "behavior-support", view: "support-center", area: "Behavior & Support", must: true },
  { key: "messages", nav: "messages", view: "messages", area: "Messages", must: true },
  { key: "settings", nav: "settings", view: "settings", area: "Settings", must: true },
  { key: "billing", nav: "billing", view: "billing", area: "Billing", must: false },
  { key: "favorites", nav: "favorites", view: "favorites", area: "Favorites", must: false },
];

async function gotoApp(page) {
  await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitBootReady(page, { timeout: 60000 });
  await dismissFreePlanNudgeIfPresent(page);
}

async function navVisible(page, nav) {
  return page.evaluate((view) => {
    const nodes = [...document.querySelectorAll(`.sidebar .nav-link[data-view="${view}"]`)];
    return nodes.some((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.offsetParent !== null);
  }, nav);
}

async function safeNav(page, surface) {
  const visible = await navVisible(page, surface.nav);
  if (!visible) return { ok: false, reason: "nav_absent" };
  await clickSidebarNav(page, surface.nav, surface.view);
  const active = await page.locator(`#view-${surface.view}.active-view`).count();
  return { ok: active === 1, reason: active === 1 ? "ok" : "view_not_active" };
}

async function auditLessonWorkflow(page, personaKey, device, isFree) {
  const area = "Lesson Plans";
  await clickSidebarNav(page, "lessons", "lessons").catch(() => {});
  await page.waitForTimeout(900);

  const library = await page.evaluate(() => {
    const root = document.querySelector("#view-lessons.active-view") || document;
    const text = root.innerText || "";
    const cards = [...root.querySelectorAll("[data-lesson-id], .lesson-card, .resource-card, article, .library-card")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 30;
      });
    return {
      cardCount: cards.length,
      hasSearch: Boolean(document.querySelector("#view-lessons input[type='search'], #searchInput, input[type='search']")),
      hasFilter: /age|filter|preschool|infant|toddler|theme/i.test(text),
      hasFreeLabel: /\bfree\b/i.test(text),
      hasProLabel: /\bpro\b/i.test(text),
      hasLock: /locked|upgrade|members only|pro only|start free|unlock/i.test(text)
        || Boolean(document.querySelector("[data-locked], .locked, .lock-badge, .pro-lock")),
      empty: /no lesson|nothing here|empty library/i.test(text) && cards.length === 0,
      sample: cards.slice(0, 3).map((c) => (c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)),
    };
  });

  if (library.cardCount > 0 && !library.empty) {
    finding({
      persona: personaKey, device, area, status: "working", severity: "info",
      title: "Lesson library shows plans",
      detail: `${library.cardCount} visible cards`,
      option: "dont_change",
    });
  } else {
    finding({
      persona: personaKey, device, area, status: "issue", severity: "P0",
      title: "Lesson library looks empty or broken",
      detail: JSON.stringify(library),
      option: "fix_now",
    });
  }

  if (library.hasSearch) {
    finding({
      persona: personaKey, device, area, status: "working", severity: "info",
      title: "Search control present", detail: "", option: "dont_change",
    });
    try {
      const search = page.locator("#view-lessons input[type='search']:visible, #searchInput:visible, input[type='search']:visible").first();
      if (await search.count()) {
        await search.fill("farm");
        await page.waitForTimeout(700);
        const after = await page.evaluate(() => (document.querySelector("#view-lessons")?.innerText || "").slice(0, 400));
        finding({
          persona: personaKey, device, area,
          status: /farm|animal|no result|0 lesson|match/i.test(after) ? "working" : "gap",
          severity: /farm|animal/i.test(after) ? "info" : "P2",
          title: "Search for 'farm' behaves",
          detail: after.replace(/\s+/g, " ").slice(0, 120),
          option: /farm|animal/i.test(after) ? "dont_change" : "fix_later",
        });
        await search.fill("");
      }
    } catch (error) {
      finding({
        persona: personaKey, device, area, status: "gap", severity: "P2",
        title: "Search interaction failed", detail: error.message, option: "fix_later",
      });
    }
  } else {
    finding({
      persona: personaKey, device, area, status: "gap", severity: "P2",
      title: "No obvious lesson search on this surface",
      detail: "Providers often hunt by theme on the floor",
      option: "fix_later",
    });
  }

  if (isFree) {
    if (library.hasLock || library.hasProLabel) {
      finding({
        persona: personaKey, device, area, status: "working", severity: "info",
        title: "Free user sees paid/lock boundaries",
        detail: `lock=${library.hasLock} proLabel=${library.hasProLabel}`,
        option: "dont_change",
      });
    } else {
      finding({
        persona: personaKey, device, area, status: "issue", severity: "P1",
        title: "Free user may not see clear Pro boundaries",
        detail: "Risk: confusion about what they can use this week",
        option: "fix_now",
      });
    }
  }

  // Open a lesson (classic provider view — TK must stay off for non-owner)
  const opened = await page.evaluate(() => {
    const root = document.querySelector("#view-lessons.active-view") || document;
    const candidates = [...root.querySelectorAll("[data-lesson-id], .lesson-card, .resource-card, button, a")]
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width < 8 || rect.height < 8) return false;
        return /lesson|open|view|preschool|farm|toddler|infant/i.test(`${el.getAttribute("data-lesson-id") || ""} ${el.textContent || ""}`);
      });
    const target = candidates[0];
    if (!target) return { ok: false, reason: "no target" };
    target.click();
    return { ok: true, label: (target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) };
  });

  if (opened.ok) {
    await page.waitForTimeout(1400);
    const detail = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return {
        classic: /objective|material|overview|activity|family|print|download|assign|week|monday/i.test(text),
        tkOwnerBanner: Boolean(document.querySelector("[data-tk-owner-preview-banner]")),
        tkWorkspace: Boolean(document.querySelector("[data-teaching-kit-workspace]")),
        hasFavorite: Boolean(document.querySelector("[data-favorite], [data-action*='favorite'], button, [aria-label*='favorite' i]"))
          || /favorite|save/i.test(text),
        hasAssign: /assign|add to calendar|schedule|week/i.test(text)
          || Boolean(document.querySelector("[data-assign], [data-action*='assign']")),
        hasPrint: /print|pdf|download/i.test(text),
        clipped: (() => {
          const modal = document.querySelector("#resourceViewer, .resource-viewer, [data-lesson-workspace], .lesson-workspace");
          if (!modal) return false;
          const r = modal.getBoundingClientRect();
          return r.bottom > window.innerHeight + 40 && r.top < 0;
        })(),
      };
    });

    finding({
      persona: personaKey, device, area,
      status: detail.classic ? "working" : "issue",
      severity: detail.classic ? "info" : "P1",
      title: "Classic lesson opens with provider content",
      detail: opened.label,
      option: detail.classic ? "dont_change" : "fix_now",
    });

    if (detail.tkOwnerBanner || detail.tkWorkspace) {
      finding({
        persona: personaKey, device, area: "Teaching Kit",
        status: "issue", severity: "P0",
        title: "Teaching Kit leaked to non-owner account",
        detail: `banner=${detail.tkOwnerBanner} workspace=${detail.tkWorkspace}`,
        option: "fix_now",
      });
    } else {
      finding({
        persona: personaKey, device, area: "Teaching Kit",
        status: "working", severity: "info",
        title: "Teaching Kit stays hidden (classic experience)",
        detail: "",
        option: "dont_change",
      });
    }

    finding({
      persona: personaKey, device, area,
      status: detail.hasAssign ? "working" : "gap",
      severity: detail.hasAssign ? "info" : "P2",
      title: "Assign/calendar action discoverable from lesson",
      detail: "",
      option: detail.hasAssign ? "dont_change" : "fix_later",
    });
    finding({
      persona: personaKey, device, area,
      status: detail.hasPrint ? "working" : "gap",
      severity: detail.hasPrint ? "info" : "P2",
      title: "Print/download path discoverable",
      detail: "",
      option: detail.hasPrint ? "dont_change" : "fix_later",
    });
  } else {
    finding({
      persona: personaKey, device, area, status: "issue", severity: "P0",
      title: "Could not open a lesson from the library",
      detail: opened.reason,
      option: "fix_now",
    });
  }
}

async function auditSurfaceQuality(page, personaKey, device, surface) {
  const shot = path.join(OUT, `${personaKey}-${device}-${surface.key}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

  const ux = await page.evaluate((viewId) => {
    const view = document.querySelector(`#view-${viewId}.active-view`) || document.querySelector(`#view-${viewId}`);
    const text = (view?.innerText || "").trim();
    const buttons = [...(view || document).querySelectorAll("button, a.button, .primary-button, .ghost-button")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
    const disabledPrimary = buttons.filter((b) => b.disabled && /primary|save|add|print|send|check/i.test(`${b.className} ${b.textContent}`));
    const emptyCopy = /coming soon|not available|nothing here|no children yet|get started|add your first/i.test(text);
    const errorCopy = /error|failed|something went wrong|try again|unavailable/i.test(text);
    const overflow = buttons.some((b) => {
      const r = b.getBoundingClientRect();
      return r.right > window.innerWidth + 4 || r.left < -4;
    });
    // Large empty regions with almost no copy feel unfinished to providers.
    const thin = text.length < 40;
    return {
      textLen: text.length,
      buttonCount: buttons.length,
      disabledPrimary: disabledPrimary.length,
      emptyCopy,
      errorCopy,
      overflow,
      thin,
      headline: text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4),
    };
  }, surface.view);

  if (ux.errorCopy) {
    finding({
      persona: personaKey, device, area: surface.area, status: "issue", severity: "P1",
      title: "Error / failure copy visible",
      detail: ux.headline.join(" | ").slice(0, 160),
      option: "fix_now",
      evidence: shot,
    });
  } else if (ux.thin && !ux.emptyCopy) {
    finding({
      persona: personaKey, device, area: surface.area, status: "gap", severity: "P2",
      title: "Surface feels thin / unfinished for classroom use",
      detail: `textLen=${ux.textLen} buttons=${ux.buttonCount}`,
      option: "fix_later",
      evidence: shot,
    });
  } else if (ux.emptyCopy) {
    finding({
      persona: personaKey, device, area: surface.area, status: "gap", severity: "P2",
      title: "Empty-state onboarding shown (expected for seeded account)",
      detail: ux.headline.join(" | ").slice(0, 160),
      option: "monitor",
      evidence: shot,
    });
  } else {
    finding({
      persona: personaKey, device, area: surface.area, status: "working", severity: "info",
      title: "Surface usable with provider content/actions",
      detail: `buttons=${ux.buttonCount}`,
      option: "dont_change",
      evidence: shot,
    });
  }

  if (ux.overflow) {
    finding({
      persona: personaKey, device, area: surface.area, status: "issue", severity: "P1",
      title: "Controls clipped/overflow viewport",
      detail: "Hard on phone during care routines",
      option: "fix_now",
      evidence: shot,
    });
  }
}

async function auditDailyCareFlow(page, personaKey, device) {
  const area = "Daily Logs";
  const nav = await safeNav(page, { nav: "child-tools-daily-logs", view: "children" });
  if (!nav.ok) {
    finding({
      persona: personaKey, device, area, status: "gap", severity: "P1",
      title: "Daily Logs nav not available for this role",
      detail: nav.reason,
      option: personaKey === "assistant" || personaKey === "teacher" ? "fix_now" : "fix_later",
    });
    return;
  }

  const care = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    return {
      hasCheckIn: /check[- ]?in|attendance/i.test(text),
      hasMeal: /meal|breakfast|lunch|snack/i.test(text),
      hasNap: /nap|sleep/i.test(text),
      hasDiaper: /diaper|toilet|potty/i.test(text),
      hasPhoto: /photo|camera/i.test(text),
      hasEod: /end[- ]of[- ]day|daily report|send to famil/i.test(text),
      hasChildList: /child|profile|roster|classroom/i.test(text),
    };
  });

  const careScore = ["hasCheckIn", "hasMeal", "hasNap", "hasDiaper", "hasChildList"]
    .filter((k) => care[k]).length;

  finding({
    persona: personaKey, device, area,
    status: careScore >= 2 ? "working" : "gap",
    severity: careScore >= 2 ? "info" : "P1",
    title: "Daily care actions discoverable",
    detail: JSON.stringify(care),
    option: careScore >= 2 ? "dont_change" : "fix_now",
  });
}

async function auditAiAndSupport(page, personaKey, device) {
  const docs = await safeNav(page, { nav: "ai", view: "ai" });
  if (docs.ok) {
    const ai = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const cards = document.querySelectorAll("[data-quick-doc-type], .doc-helper-card, .ai-card").length;
      return {
        cards,
        hasObservation: /observation/i.test(text),
        hasParent: /parent message|family/i.test(text),
        hasIncident: /incident/i.test(text),
        gated: /upgrade|pro|members|trial|unlock/i.test(text),
      };
    });
    finding({
      persona: personaKey, device, area: "Documentation Helpers",
      status: ai.cards > 0 || ai.hasObservation ? "working" : "gap",
      severity: ai.cards > 0 ? "info" : "P2",
      title: "Documentation helpers visible",
      detail: JSON.stringify(ai),
      option: ai.cards > 0 ? "dont_change" : "fix_later",
    });
  }

  const beh = await safeNav(page, { nav: "behavior-support", view: "support-center" });
  if (beh.ok) {
    const text = await page.evaluate(() => document.body?.innerText || "");
    finding({
      persona: personaKey, device, area: "Behavior & Support",
      status: /behavior|support|guidance|calm|strategy/i.test(text) ? "working" : "gap",
      severity: "info",
      title: "Behavior & Support content loads",
      detail: text.replace(/\s+/g, " ").slice(0, 100),
      option: "dont_change",
    });
  }
}

async function auditSettingsBilling(page, personaKey, device, persona) {
  const settings = await safeNav(page, { nav: "settings", view: "settings" });
  if (settings.ok) {
    const s = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return {
        hasPlan: /plan|membership|free|pro|founding|trial/i.test(text),
        hasBillingLink: /billing|payment|subscription|invoice/i.test(text),
        hasAccount: /account|email|password|profile|sign out|log out/i.test(text),
      };
    });
    finding({
      persona: personaKey, device, area: "Settings",
      status: s.hasAccount ? "working" : "issue",
      severity: s.hasAccount ? "info" : "P1",
      title: "Settings shows account controls",
      detail: JSON.stringify(s),
      option: s.hasAccount ? "dont_change" : "fix_now",
    });

    if (/free|trial/i.test(persona.plan + persona.subscriptionStatus) && !s.hasPlan) {
      finding({
        persona: personaKey, device, area: "Billing",
        status: "gap", severity: "P2",
        title: "Plan status not obvious in Settings",
        detail: "Providers need to know what they are on before parents arrive",
        option: "fix_later",
      });
    }
  }

  const billingVisible = await navVisible(page, "billing");
  if (billingVisible) {
    await safeNav(page, { nav: "billing", view: "billing" });
    const b = await page.evaluate(() => (document.body?.innerText || "").slice(0, 500));
    finding({
      persona: personaKey, device, area: "Billing",
      status: /billing|plan|subscription|payment|manage/i.test(b) ? "working" : "gap",
      severity: "info",
      title: "Billing surface opens",
      detail: b.replace(/\s+/g, " ").slice(0, 120),
      option: "dont_change",
    });
  } else {
    finding({
      persona: personaKey, device, area: "Billing",
      status: "gap", severity: "P3",
      title: "Billing not in primary nav (may live under Settings)",
      detail: "",
      option: "monitor",
    });
  }
}

async function auditTkBlocked(page, personaKey, device) {
  const result = await page.evaluate(async (planId) => {
    const preview = typeof isOwnerTeachingKitPreviewActive === "function"
      ? isOwnerTeachingKitPreviewActive()
      : false;
    const flags = typeof effectiveTeachingKitCustomerFlags === "function"
      ? effectiveTeachingKitCustomerFlags()
      : null;
    let kit = null;
    if (typeof fetchTeachingKitForPlan === "function") {
      kit = await fetchTeachingKitForPlan(planId, { day: "monday" });
    }
    return { preview, flags, kit };
  }, PLAN_ID);

  if (result.preview === true || result.flags?.teachingKitViewer === true) {
    finding({
      persona: personaKey, device, area: "Teaching Kit",
      status: "issue", severity: "P0",
      title: "Owner Preview / TK flags active for non-owner",
      detail: JSON.stringify(result.flags),
      option: "fix_now",
    });
  } else {
    finding({
      persona: personaKey, device, area: "Teaching Kit",
      status: "working", severity: "info",
      title: "TK client elevation off",
      detail: "",
      option: "dont_change",
    });
  }

  if (result.kit?.ok) {
    finding({
      persona: personaKey, device, area: "Teaching Kit",
      status: "issue", severity: "P0",
      title: "TK API returned kit for non-owner",
      detail: JSON.stringify(result.kit.featureFlags || result.kit.reason),
      option: "fix_now",
    });
  } else {
    finding({
      persona: personaKey, device, area: "Teaching Kit",
      status: "working", severity: "info",
      title: "TK fetch blocked",
      detail: result.kit?.reason || result.kit?.code || "blocked",
      option: "dont_change",
    });
  }
}

async function auditPersona(browser, personaKey, persona, device) {
  const page = await browser.newPage({
    viewport: { width: device.width, height: device.height },
    userAgent: device.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  try {
    await seedSession(page, persona, { lastView: "calendar", blockServerPersistence: true });
    await gotoApp(page);

    const session = await page.evaluate(() => ({
      email: String(typeof currentUser !== "undefined" ? currentUser : localStorage.getItem("llhUser") || "").toLowerCase(),
      active: document.querySelector(".active-view")?.id || "",
    }));
    finding({
      persona: personaKey, device: device.label, area: "Session",
      status: session.email === String(persona.email).toLowerCase() ? "working" : "issue",
      severity: session.email === String(persona.email).toLowerCase() ? "info" : "P0",
      title: "Seeded session active",
      detail: `${session.email} view=${session.active}`,
      option: session.email === String(persona.email).toLowerCase() ? "dont_change" : "fix_now",
    });

    finding({
      persona: personaKey, device: device.label, area: "Role lens",
      status: "working", severity: "info",
      title: persona.childcareLens,
      detail: `plan=${persona.plan} role=${persona.role || "owner"} type=${persona.accountType || ""}`,
      option: "monitor",
    });

    if (device.mobile) await openMobileNavIfNeeded(page);

    for (const surface of SURFACES) {
      const result = await safeNav(page, surface).catch((e) => ({ ok: false, reason: e.message }));
      if (!result.ok) {
        finding({
          persona: personaKey, device: device.label, area: surface.area,
          status: surface.must ? "gap" : "gap",
          severity: surface.must ? "P1" : "P3",
          title: `Nav/surface not available: ${surface.area}`,
          detail: result.reason,
          option: surface.must ? "fix_later" : "monitor",
        });
        continue;
      }
      await auditSurfaceQuality(page, personaKey, device.label, surface);
    }

    await auditLessonWorkflow(page, personaKey, device.label, /free/i.test(persona.plan) && !/trial/i.test(persona.subscriptionStatus || ""));
    await auditDailyCareFlow(page, personaKey, device.label);
    await auditAiAndSupport(page, personaKey, device.label);
    await auditSettingsBilling(page, personaKey, device.label, persona);
    await auditTkBlocked(page, personaKey, device.label);

    // Messages quick check
    if ((await navVisible(page, "messages"))) {
      await clickSidebarNav(page, "messages", "messages").catch(() => {});
      const msg = await page.evaluate(() => document.body?.innerText || "");
      finding({
        persona: personaKey, device: device.label, area: "Messages",
        status: /message|inbox|support|conversation|family/i.test(msg) ? "working" : "gap",
        severity: "info",
        title: "Messages surface opens",
        detail: msg.replace(/\s+/g, " ").slice(0, 100),
        option: "dont_change",
      });
    }

    const serious = consoleErrors.filter((e) => !/favicon|fonts\.g|third-party|ResizeObserver|net::ERR|status of 401/i.test(e));
    finding({
      persona: personaKey, device: device.label, area: "Console",
      status: serious.length ? "issue" : "working",
      severity: serious.length ? "P1" : "info",
      title: serious.length ? "Serious console errors" : "No serious console errors",
      detail: serious.slice(0, 3).join(" | "),
      option: serious.length ? "fix_now" : "dont_change",
    });

    await page.screenshot({
      path: path.join(OUT, `${personaKey}-${device.label}-final.png`),
      fullPage: false,
    }).catch(() => {});
  } catch (error) {
    finding({
      persona: personaKey, device: device.label, area: "Audit",
      status: "issue", severity: "P0",
      title: "Persona walkthrough crashed",
      detail: error.message,
      option: "fix_now",
    });
  } finally {
    await page.close();
  }
}

function writeMarkdownReport(baseline) {
  const issues = findings.filter((f) => f.status === "issue" || (f.status === "gap" && ["P0", "P1"].includes(f.severity)));
  const gaps = findings.filter((f) => f.status === "gap" && ["P2", "P3"].includes(f.severity));
  const working = findings.filter((f) => f.status === "working");
  const byPersona = {};
  for (const f of findings) {
    byPersona[f.persona] = byPersona[f.persona] || { working: 0, issue: 0, gap: 0, blocked: 0 };
    byPersona[f.persona][f.status] = (byPersona[f.persona][f.status] || 0) + 1;
  }

  const fixNow = findings.filter((f) => f.option === "fix_now" && f.status !== "working");
  const fixLater = findings.filter((f) => f.option === "fix_later" && f.status !== "working");

  const md = [];
  md.push("# Childcare Professional Live Audit");
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Production: ${PROD}`);
  md.push(`Build: ${baseline.shortSha} / ${baseline.shellVersion}`);
  md.push(`Inventory: ${baseline.inventory}`);
  md.push("");
  md.push("## Scope");
  md.push("- Seeded ephemeral personas only (`blockServerPersistence`) — **not** real customer logins or private child data.");
  md.push("- Audited as a childcare professional: planning, daily care, docs, family messaging, billing clarity, mobile floor use.");
  md.push("- Teaching Kit customer flags must remain OFF; only `leahivie@icloud.com` may use Owner Preview.");
  md.push("");
  md.push("## Scoreboard");
  md.push(`- Working signals: **${working.length}**`);
  md.push(`- Issues: **${findings.filter((f) => f.status === "issue").length}**`);
  md.push(`- Gaps: **${gaps.length + findings.filter((f) => f.status === "gap" && ["P0", "P1"].includes(f.severity)).length}**`);
  md.push(`- Fix now candidates: **${fixNow.length}**`);
  md.push(`- Fix later candidates: **${fixLater.length}**`);
  md.push("");
  md.push("### By account type");
  for (const [k, v] of Object.entries(byPersona)) {
    md.push(`- **${k}**: working ${v.working || 0}, issues ${v.issue || 0}, gaps ${v.gap || 0}`);
  }
  md.push("");
  md.push("## Fix now (options)");
  if (!fixNow.length) md.push("_None — no P0/P1 fix-now defects found in this pass._");
  for (const f of fixNow) {
    md.push(`### ${f.title}`);
    md.push(`- Account: ${f.persona} · ${f.device} · ${f.area}`);
    md.push(`- Severity: ${f.severity}`);
    md.push(`- Detail: ${f.detail || "—"}`);
    md.push(`- Option: **Fix now** before public Teaching Kit launch / before more curriculum upgrades if it blocks classroom use.`);
    md.push("");
  }
  md.push("## Fix later (options)");
  if (!fixLater.length) md.push("_None notable._");
  const seen = new Set();
  for (const f of fixLater) {
    const key = `${f.area}|${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    md.push(`- **${f.area}: ${f.title}** (${f.severity}) — ${f.detail || "polish"} · _Option: fix later_`);
  }
  md.push("");
  md.push("## Don't change / keep");
  md.push("- Teaching Kit restricted to owner preview only.");
  md.push("- Classic lesson experience for all non-owner accounts.");
  md.push("- Inventory gate 127 / 2,110.");
  md.push("- Major nav surfaces (Lessons, Activities, Calendar, Children, Docs, Messages, Settings) for Pro-class accounts.");
  md.push("");
  md.push("## Full finding log");
  for (const f of findings) {
    if (f.severity === "info" && f.status === "working") continue;
    md.push(`- [${f.status}/${f.severity}/${f.option}] ${f.persona}/${f.device} · ${f.area}: ${f.title}${f.detail ? ` — ${f.detail}` : ""}`);
  }
  md.push("");
  const outPath = path.join(OUT, "CHILDCARE_PROFESSIONAL_LIVE_AUDIT.md");
  fs.writeFileSync(outPath, md.join("\n"));
  return outPath;
}

async function main() {
  console.log(`Childcare Professional Live Audit → ${PROD}`);
  const bv = await httpJson(`${PROD}/api/build-version`);
  const inv = await httpJson(`${PROD}/api/public/home-inventory`);
  const anon = await httpJson(`${PROD}/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`);
  const baseline = {
    shortSha: bv.json?.shortSha,
    shellVersion: bv.json?.shellVersion,
    inventory: `${inv.json?.lessonPlanCount}/${inv.json?.activityCount}`,
    anonTk: anon.json?.code,
  };
  finding({
    persona: "baseline", device: "api", area: "Inventory",
    status: inv.json?.lessonPlanCount === 127 && inv.json?.activityCount === 2110 ? "working" : "issue",
    severity: inv.json?.lessonPlanCount === 127 ? "info" : "P0",
    title: "Inventory 127/2110",
    detail: baseline.inventory,
    option: inv.json?.lessonPlanCount === 127 ? "dont_change" : "fix_now",
  });
  finding({
    persona: "baseline", device: "api", area: "Teaching Kit",
    status: anon.status === 404 && anon.json?.code === "teaching_kit_disabled" ? "working" : "issue",
    severity: "info",
    title: "Anonymous TK blocked",
    detail: anon.json?.code,
    option: "dont_change",
  });

  // Spoof matrix
  for (const [label, headers] of [
    ["free-spoof", { Authorization: "Bearer test:free@example.com", "x-llh-user-email": "free@example.com" }],
    ["pro-spoof", { Authorization: "Bearer test:pro@example.com", "x-llh-user-email": "pro@example.com" }],
    ["alias-spoof", { Authorization: "Bearer test:leahrivie@icloud.com", "x-llh-user-email": "leahrivie@icloud.com" }],
  ]) {
    const res = await httpJson(`${PROD}/api/curriculum/lesson-plans/${PLAN_ID}/teaching-kit`, { headers });
    finding({
      persona: label, device: "api", area: "Teaching Kit",
      status: res.status === 404 && res.json?.code === "teaching_kit_disabled" ? "working" : "issue",
      severity: res.status === 404 ? "info" : "P0",
      title: "Spoofed identity cannot unlock TK",
      detail: `${res.status} ${res.json?.code}`,
      option: res.status === 404 ? "dont_change" : "fix_now",
    });
  }

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const devices = [
      { label: "desktop", width: 1366, height: 900, mobile: false },
      { label: "mobile", width: 390, height: 844, mobile: true },
    ];
    for (const [key, persona] of Object.entries(AUDIT_PERSONAS)) {
      for (const device of devices) {
        console.log(`\n== ${persona.label} / ${device.label} ==`);
        await auditPersona(browser, key, persona, device);
      }
    }
  } finally {
    await browser.close();
  }

  const reportPath = writeMarkdownReport(baseline);
  const summary = {
    baseline,
    counts: {
      total: findings.length,
      working: findings.filter((f) => f.status === "working").length,
      issue: findings.filter((f) => f.status === "issue").length,
      gap: findings.filter((f) => f.status === "gap").length,
      fix_now: findings.filter((f) => f.option === "fix_now" && f.status !== "working").length,
      fix_later: findings.filter((f) => f.option === "fix_later" && f.status !== "working").length,
    },
    findings,
    reportPath,
  };
  fs.writeFileSync(path.join(OUT, "audit-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\nSUMMARY", JSON.stringify(summary.counts, null, 2));
  console.log("Report:", reportPath);
  if (summary.counts.fix_now > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
