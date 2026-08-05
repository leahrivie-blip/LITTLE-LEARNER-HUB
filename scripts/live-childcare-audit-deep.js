#!/usr/bin/env node
/**
 * Deep childcare audit follow-up — real lesson opens, Free locks, care UX.
 * Seeded personas only; no durable writes; no TK flag changes.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const {
  PERSONAS,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  dismissFreePlanNudgeIfPresent,
  openMobileNavIfNeeded,
} = require("./test-helpers/llh-browser-nav");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const OUT = "/opt/cursor/artifacts/childcare-professional-live-audit";
fs.mkdirSync(OUT, { recursive: true });

const notes = [];
function note(persona, area, severity, title, detail, option) {
  const row = { persona, area, severity, title, detail, option };
  notes.push(row);
  console.log(`  [${severity}] ${persona} · ${area}: ${title}${detail ? ` — ${detail}` : ""}`);
}

async function boot(page, persona) {
  await seedSession(page, persona, { lastView: "lessons", blockServerPersistence: true });
  await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitBootReady(page);
  await dismissFreePlanNudgeIfPresent(page);
}

async function openFirstRealLesson(page) {
  await clickSidebarNav(page, "lessons", "lessons");
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const root = document.querySelector("#view-lessons.active-view") || document;
    // Prefer explicit lesson cards with data-lesson-id, skip about/info controls.
    const cards = [...root.querySelectorAll("[data-lesson-id]")]
      .filter((el) => {
        const id = el.getAttribute("data-lesson-id") || "";
        if (!id || /about/i.test(id)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 20 && r.height > 20;
      });
    let target = cards[0];
    if (!target) {
      const fallback = [...root.querySelectorAll(".lesson-card, .resource-card, [data-open-lesson]")]
        .filter((el) => {
          const t = (el.textContent || "").trim();
          if (/about lesson plans/i.test(t)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 40 && r.height > 30;
        });
      target = fallback[0];
    }
    if (!target) return { ok: false, reason: "no lesson card" };
    const label = (target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const id = target.getAttribute("data-lesson-id") || "";
    target.click();
    return { ok: true, label, id };
  });
}

async function lessonChrome(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const workspace = document.querySelector("#resourceViewer, .resource-viewer, [data-lesson-workspace], .lesson-workspace, #resourceViewerBody");
    return {
      hasWorkspace: Boolean(workspace),
      tk: Boolean(document.querySelector("[data-teaching-kit-workspace], [data-tk-owner-preview-banner]")),
      title: (document.querySelector(".lesson-workspace-title, .resource-title, h2, h1")?.textContent || "").trim().slice(0, 80),
      hasOverview: /overview|objective|goal|this week/i.test(text),
      hasMaterials: /material|supply|you'll need|you will need/i.test(text),
      hasActivities: /activit/i.test(text),
      hasFamily: /family|parent|home connect/i.test(text),
      hasAssign: /assign|add to calendar|schedule/i.test(text),
      hasPrint: /print|pdf|download/i.test(text),
      hasFavorite: /favorite|heart|save lesson/i.test(text),
      lockWall: /upgrade|unlock|members only|pro only|start trial|start free/i.test(text),
      textSample: text.replace(/\s+/g, " ").slice(0, 220),
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    // FREE desktop + mobile
    for (const device of [
      { label: "desktop", width: 1366, height: 900 },
      { label: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: device.width, height: device.height } });
      await boot(page, PERSONAS.free);
      if (device.label === "mobile") await openMobileNavIfNeeded(page);

      await clickSidebarNav(page, "lessons", "lessons");
      await page.waitForTimeout(1000);
      const freeLib = await page.evaluate(() => {
        const text = document.querySelector("#view-lessons")?.innerText || "";
        return {
          freeCountMention: (text.match(/(\d+)\s*Free Lesson/i) || [])[1] || "",
          proLockMention: /117|additional pro|🔒|locked|upgrade/i.test(text),
          text: text.replace(/\s+/g, " ").slice(0, 260),
        };
      });
      note("free", "Lesson Plans", freeLib.proLockMention ? "working" : "P1",
        "Free library shows Free vs Pro boundary", freeLib.text, freeLib.proLockMention ? "dont_change" : "fix_now");

      // Search farm
      const search = page.locator("#view-lessons input[type='search']:visible, #searchInput:visible, input[type='search']:visible").first();
      if (await search.count()) {
        await search.fill("Farm Animals");
        await page.waitForTimeout(900);
        const searchUi = await page.evaluate(() => {
          const root = document.querySelector("#view-lessons");
          const text = root?.innerText || "";
          const ids = [...root.querySelectorAll("[data-lesson-id]")].map((e) => e.getAttribute("data-lesson-id"));
          return { text: text.replace(/\s+/g, " ").slice(0, 200), ids: ids.slice(0, 8), count: ids.length };
        });
        await page.screenshot({ path: path.join(OUT, `deep-free-${device.label}-search-farm.png`) });
        note("free", "Search", /farm/i.test(searchUi.text) || searchUi.ids.some((id) => /farm/i.test(id || "")) ? "P2" : "P2",
          "Search 'Farm Animals' clarity",
          `visibleIds=${searchUi.ids.join(",") || "none"} sample=${searchUi.text}`,
          "fix_later");
        await search.fill("");
      }

      const opened = await openFirstRealLesson(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `deep-free-${device.label}-lesson.png`) });
      const chrome = await lessonChrome(page);
      if (!opened.ok) {
        note("free", "Lesson Plans", "P0", "Could not open a real lesson card", opened.reason, "fix_now");
      } else if (/about lesson/i.test(opened.label)) {
        note("free", "Lesson Plans", "P1", "First click still hits About lesson plans, not a lesson", opened.label, "fix_now");
      } else {
        note("free", "Lesson Plans", chrome.hasOverview || chrome.hasMaterials || chrome.hasActivities ? "working" : "P1",
          "Opened real classic lesson", `${opened.id || opened.label} · ${chrome.title}`, "dont_change");
      }
      note("free", "Teaching Kit", chrome.tk ? "P0" : "working",
        chrome.tk ? "TK leaked to Free" : "TK hidden for Free", "", chrome.tk ? "fix_now" : "dont_change");
      note("free", "Print", chrome.hasPrint ? "working" : "P2",
        "Print/download from opened lesson", chrome.hasPrint ? "visible" : "not obvious",
        chrome.hasPrint ? "dont_change" : "fix_later");
      note("free", "Assign", chrome.hasAssign ? "working" : "P2",
        "Assign to calendar from opened lesson", "", chrome.hasAssign ? "dont_change" : "fix_later");

      // Daily logs empty-state quality
      await clickSidebarNav(page, "child-tools-daily-logs", "children").catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `deep-free-${device.label}-daily-logs.png`) });
      const logs = await page.evaluate(() => (document.querySelector("#view-children")?.innerText || "").replace(/\s+/g, " ").slice(0, 240));
      note("free", "Daily Logs", /add your first child|no child|get started|check/i.test(logs) ? "working" : "P2",
        "Daily Logs empty-state guidance", logs, "monitor");

      // Docs helpers
      await clickSidebarNav(page, "ai", "ai").catch(() => {});
      await page.waitForTimeout(500);
      const docs = await page.evaluate(() => ({
        cards: document.querySelectorAll("[data-quick-doc-type], .doc-helper-card").length,
        text: (document.querySelector("#view-ai")?.innerText || "").replace(/\s+/g, " ").slice(0, 180),
      }));
      note("free", "Documentation Helpers", docs.cards >= 3 ? "working" : "P2",
        "Helper cards available", `${docs.cards} cards`, docs.cards >= 3 ? "dont_change" : "fix_later");

      await page.close();
    }

    // PRO desktop — full provider day
    {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
      await boot(page, PERSONAS.pro);
      const opened = await openFirstRealLesson(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, "deep-pro-desktop-lesson.png") });
      const chrome = await lessonChrome(page);
      note("pro", "Lesson Plans", opened.ok && !/about lesson/i.test(opened.label || "") ? "working" : "P1",
        "Pro opens a real lesson", `${opened.label} / ${chrome.title}`, opened.ok ? "dont_change" : "fix_now");
      note("pro", "Teaching Kit", chrome.tk ? "P0" : "working",
        chrome.tk ? "TK leaked to Pro" : "TK hidden for Pro (classic only)", "", chrome.tk ? "fix_now" : "dont_change");

      // Calendar assignability
      await clickSidebarNav(page, "calendar", "calendar");
      await page.waitForTimeout(800);
      const cal = await page.evaluate(() => {
        const text = document.querySelector("#view-calendar")?.innerText || "";
        return {
          hasWeek: /week|monday|tuesday|add lesson|assign|plan/i.test(text),
          sample: text.replace(/\s+/g, " ").slice(0, 200),
        };
      });
      await page.screenshot({ path: path.join(OUT, "deep-pro-desktop-calendar.png") });
      note("pro", "Calendar", cal.hasWeek ? "working" : "P1", "Calendar usable for weekly planning", cal.sample, cal.hasWeek ? "dont_change" : "fix_now");

      // Activities density
      await clickSidebarNav(page, "activities", "activities");
      await page.waitForTimeout(1000);
      const acts = await page.evaluate(() => {
        const root = document.querySelector("#view-activities");
        const cards = root ? root.querySelectorAll("[data-activity-id], .activity-card, .resource-card, article").length : 0;
        return { cards, sample: (root?.innerText || "").replace(/\s+/g, " ").slice(0, 180) };
      });
      note("pro", "Activities", acts.cards > 5 ? "working" : "P2", "Activity Center populated", `${acts.cards} cards`, acts.cards > 5 ? "dont_change" : "fix_later");

      await page.close();
    }

    // TRIAL — trial clarity
    {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
      await boot(page, PERSONAS.trial);
      await clickSidebarNav(page, "settings", "settings");
      await page.waitForTimeout(600);
      const trialUi = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return {
          trialMention: /trial|days left|trialing|trial ends/i.test(text),
          sample: text.replace(/\s+/g, " ").slice(0, 220),
        };
      });
      await page.screenshot({ path: path.join(OUT, "deep-trial-settings.png") });
      note("trial", "Billing/Settings", trialUi.trialMention ? "working" : "P2",
        "Trial status visible in account area", trialUi.sample, trialUi.trialMention ? "dont_change" : "fix_later");
      const opened = await openFirstRealLesson(page);
      await page.waitForTimeout(1200);
      const chrome = await lessonChrome(page);
      note("trial", "Teaching Kit", chrome.tk ? "P0" : "working",
        chrome.tk ? "TK leaked to Trial" : "TK hidden for Trial", "", chrome.tk ? "fix_now" : "dont_change");
      note("trial", "Lesson Plans", opened.ok ? "working" : "P1", "Trial can open lessons", opened.label || opened.reason, "dont_change");
      await page.close();
    }

    // FOUNDING
    {
      const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
      await boot(page, PERSONAS.founding);
      await clickSidebarNav(page, "settings", "settings");
      const founding = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return { hasFounding: /founding/i.test(text), hasPlan: /plan|pro|membership|billing/i.test(text), sample: text.replace(/\s+/g, " ").slice(0, 200) };
      });
      note("founding", "Settings", founding.hasPlan ? "working" : "P2",
        "Founding member sees plan/account context", founding.sample, "dont_change");
      const chrome = await (async () => {
        await openFirstRealLesson(page);
        await page.waitForTimeout(1000);
        return lessonChrome(page);
      })();
      note("founding", "Teaching Kit", chrome.tk ? "P0" : "working",
        chrome.tk ? "TK leaked to Founding" : "TK hidden for Founding", "", chrome.tk ? "fix_now" : "dont_change");
      await page.close();
    }

    // TEACHER mobile — floor use
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await boot(page, {
        email: "audit-teacher@test.local",
        firstName: "Tea", lastName: "Cher", plan: "Pro", subscriptionStatus: "active",
        role: "teacher", accountType: "center", centerRole: "teacher",
      });
      await openMobileNavIfNeeded(page);
      await page.screenshot({ path: path.join(OUT, "deep-teacher-mobile-nav.png") });
      const nav = await page.evaluate(() => [...document.querySelectorAll(".sidebar .nav-link")]
        .filter((n) => !n.hidden && n.offsetParent)
        .map((n) => ({ view: n.getAttribute("data-view"), label: (n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) })));
      note("teacher", "Navigation", nav.length >= 5 ? "working" : "P1",
        "Teacher mobile nav density", nav.map((n) => n.label || n.view).join(", "), "monitor");

      await clickSidebarNav(page, "child-tools-daily-logs", "children").catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, "deep-teacher-mobile-logs.png") });
      const care = await page.evaluate(() => (document.querySelector("#view-children")?.innerText || "").replace(/\s+/g, " ").slice(0, 240));
      note("teacher", "Daily Logs", /child|log|attendance|meal|add/i.test(care) ? "working" : "P1",
        "Teacher reaches care logging surface", care, "dont_change");

      const opened = await openFirstRealLesson(page);
      await page.waitForTimeout(1000);
      const chrome = await lessonChrome(page);
      await page.screenshot({ path: path.join(OUT, "deep-teacher-mobile-lesson.png") });
      note("teacher", "Teaching Kit", chrome.tk ? "P0" : "working",
        chrome.tk ? "TK leaked to Teacher" : "TK hidden for Teacher", "", chrome.tk ? "fix_now" : "dont_change");
      note("teacher", "Lesson Plans", opened.ok ? "working" : "P1", "Teacher can open lesson on phone", opened.label || opened.reason, "dont_change");
      await page.close();
    }

    // ASSISTANT — limited surface
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await boot(page, {
        email: "audit-assistant@test.local",
        firstName: "As", lastName: "Sistant", plan: "Pro", subscriptionStatus: "active",
        role: "assistant", accountType: "center", centerRole: "assistant",
      });
      await openMobileNavIfNeeded(page);
      const nav = await page.evaluate(() => [...document.querySelectorAll(".sidebar .nav-link")]
        .filter((n) => !n.hidden && n.offsetParent)
        .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()));
      note("assistant", "Permissions", nav.some((t) => /billing|staff|admin/i.test(t)) ? "P1" : "working",
        "Assistant nav avoids owner-only admin/billing", nav.join(" | ").slice(0, 200), "dont_change");
      const chrome = await (async () => {
        await openFirstRealLesson(page);
        await page.waitForTimeout(1000);
        return lessonChrome(page);
      })();
      note("assistant", "Teaching Kit", chrome.tk ? "P0" : "working",
        chrome.tk ? "TK leaked to Assistant" : "TK hidden for Assistant", "", chrome.tk ? "fix_now" : "dont_change");
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const report = [];
  report.push("# Childcare Professional Deep Audit (follow-up)");
  report.push("");
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push("");
  report.push("## Findings with options");
  for (const n of notes) {
    report.push(`### ${n.title}`);
    report.push(`- Account: **${n.persona}** · ${n.area}`);
    report.push(`- Severity: ${n.severity}`);
    report.push(`- Detail: ${n.detail || "—"}`);
    report.push(`- Option: **${n.option}**`);
    report.push("");
  }
  const p = path.join(OUT, "DEEP_AUDIT.md");
  fs.writeFileSync(p, report.join("\n"));
  fs.writeFileSync(path.join(OUT, "deep-notes.json"), JSON.stringify(notes, null, 2));
  console.log("\nWrote", p);
  console.log(JSON.stringify(Object.fromEntries([
    ["total", notes.length],
    ["p0", notes.filter((n) => n.severity === "P0").length],
    ["p1", notes.filter((n) => n.severity === "P1").length],
    ["p2", notes.filter((n) => n.severity === "P2").length],
    ["working", notes.filter((n) => n.severity === "working").length],
  ]), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
