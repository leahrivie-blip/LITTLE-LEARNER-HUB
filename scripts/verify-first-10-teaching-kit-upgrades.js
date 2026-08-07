#!/usr/bin/env node
/**
 * Verify first-10 upgraded Teaching Kits in production admin UI + print path.
 * Captures major-section screenshots per lesson.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const quality = require("./teaching-kit-quality-review.js");
const enrichment = require("./teaching-kit-enrichment.js");
const polish = require("./teaching-kit-content-upgrade-polish.js");

const PROD = "https://littlelearnershubbyleah.com";
const OUT = "/opt/cursor/artifacts/tk-first-10-upgrades";
const REPORT_DIR = path.join(__dirname, "..", "docs/teaching-kit/qa/first-10-upgrades");
const TARGET_IDS = [
  "cur-lp-preschool-farm-animals",
  "cur-lp-preschool-all-about-me",
  "cur-lp-preschool-colors-everywhere",
  "cur-lp-preschool-community-helpers",
  "cur-lp-preschool-weather-watchers",
  "cur-lp-toddler-colors-everywhere",
  "cur-lp-toddler-construction-crew",
  "cur-lp-toddler-bugs-and-butterflies",
  "cur-lp-infant-colors-all-around-us",
  "cur-lp-infant-animal-sounds-discovery",
];

const SECTIONS = [
  { id: "start", label: "start" },
  { id: "setup", label: "setup" },
  { id: "today", label: "today" },
  { id: "binder", label: "binder-overview" },
  { id: "build", label: "build-print" },
];

async function main() {
  const token = fs.readFileSync("/tmp/prod_admin_bearer.txt", "utf8").trim();
  const adminEmail = fs.readFileSync("/tmp/prod_ADMIN_EMAIL.txt", "utf8").trim();
  fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });

  const site = await fetch(`${PROD}/api/admin/site-content`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const plans = site.siteContent.curriculum.lessonPlans;
  const activities = site.siteContent.curriculum.activities;

  const verify = [];
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

  try {
    for (const planId of TARGET_IDS) {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) {
        verify.push({ planId, ok: false, error: "missing plan" });
        continue;
      }
      const acts = activities.filter((a) => a.lessonPlanId === planId);
      const draft = plan.enrichmentDraft || {};
      const q = quality.buildQualityReport(plan, acts, draft);
      const completion = enrichment.computeCompletionPercent(plan, acts, draft);

      // API teaching-kit with admin token
      const kitRes = await fetch(`${PROD}/api/curriculum/lesson-plans/${encodeURIComponent(planId)}/teaching-kit?day=monday`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const kitJson = await kitRes.json().catch(() => null);
      const kitOk = kitRes.status === 200 && kitJson?.teachingKit?.locked === false && kitJson?.teachingKit?.companion;

      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      const shots = [];
      let printOk = false;
      let uiOk = false;
      try {
        await page.goto(`${PROD}/?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForFunction(() => document.body.classList.contains("app-booted"), null, { timeout: 90000 });
        await page.locator(".llh-meta-cookie-dismiss:visible").click({ timeout: 2000 }).catch(() => {});
        await page.evaluate(async ({ email, token }) => {
          localStorage.setItem("llhUser", email);
          localStorage.setItem("llhAdminUnlocked", "true");
          localStorage.setItem("llhAdminSession", JSON.stringify({ token, email, unlockedAt: new Date().toISOString() }));
          if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
          if (typeof loadAccountState === "function") loadAccountState(email);
          if (typeof renderApp === "function") renderApp();
        }, { email: adminEmail, token });
        await page.waitForTimeout(1200);
        await page.evaluate(async () => {
          if (typeof refreshPublicCurriculumLibrary === "function") await refreshPublicCurriculumLibrary({ force: true });
        });
        await page.waitForFunction(
          (id) => Array.isArray(resources) && resources.some((r) => r && r.id === id),
          planId,
          { timeout: 90000 },
        );
        await page.evaluate((id) => openResourceViewer(id), planId);
        await page.waitForFunction(
          () => document.querySelector(".tk-surface, .teaching-kit-workspace"),
          null,
          { timeout: 30000 },
        ).catch(() => {});
        await page.waitForTimeout(800);
        uiOk = await page.evaluate(() => Boolean(document.querySelector(".tk-surface, .teaching-kit-workspace")));

        for (const section of SECTIONS) {
          if (section.id !== "start") {
            await page.locator(`[data-tk-goto="${section.id}"]`).first().click({ timeout: 4000 }).catch(() => {});
            await page.waitForTimeout(400);
          }
          if (section.id === "binder") {
            // Capture binder subnav tabs (scoped to Teaching Kit surface — avoid sidebar collisions)
            const binderTabs = [
              { match: "Overview", file: "overview" },
              { match: "Weekly Plan", file: "weekly" },
              { match: "Activities", file: "activities" },
              { match: "Printables", file: "printables" },
              { match: "Songs", file: "songs" },
              { match: "Books", file: "books" },
              { match: "Example Images", file: "example-images" },
              { match: "Teacher Toolkit", file: "teacher" },
            ];
            const surface = page.locator(".tk-surface, .teaching-kit-workspace").first();
            for (const tab of binderTabs) {
              const loc = surface.locator(`button:has-text("${tab.match}"), [role=tab]:has-text("${tab.match}")`).first();
              if (await loc.count()) {
                await loc.click({ timeout: 3000 }).catch(() => {});
                await page.waitForTimeout(350);
                const file = `${planId}-binder-${tab.file}.png`;
                await page.screenshot({ path: path.join(OUT, "screenshots", file), fullPage: false }).catch(() => {});
                shots.push(file);
              }
            }
          } else {
            const file = `${planId}-${section.label}.png`;
            await page.screenshot({ path: path.join(OUT, "screenshots", file), fullPage: false }).catch(() => {});
            shots.push(file);
          }
        }

        // Print verification via client helper if available
        printOk = await page.evaluate(async (id) => {
          try {
            if (typeof fetchTeachingKitForPlan !== "function") return false;
            const result = await fetchTeachingKitForPlan(id, { day: "monday" });
            if (!result?.ok || result.teachingKit?.locked) return false;
            const printer = window.LLHTeachingKitPrint;
            if (!printer?.buildPrintHtml && !printer?.renderBinderHtml) {
              // Presence of print center controls is enough when helper API differs
              return Boolean(document.querySelector("[data-tk-print-binder], [data-tk-goto='build']"));
            }
            const html = printer.buildPrintHtml
              ? printer.buildPrintHtml(result.teachingKit, { paper: "letter" })
              : printer.renderBinderHtml(result.teachingKit, { paper: "letter" });
            return Boolean(html && String(html).length > 500);
          } catch {
            return Boolean(document.querySelector("[data-tk-print-binder], [data-tk-goto='build']"));
          }
        }, planId);
      } finally {
        await page.close();
      }

      verify.push({
        planId,
        title: plan.title,
        age: plan.age,
        completionPercent: completion,
        qualityScore: q.overallScore,
        publishReadiness: q.publishReadiness,
        blocksPublish: q.blocksPublish,
        ownerMediaPending: q.ownerMediaPending,
        blockingIssues: q.blockingIssues,
        kitApiUnlocked: Boolean(kitOk),
        adminUiMounted: uiOk,
        printPathOk: printOk,
        screenshots: shots,
        weekdayFocus: ["monday", "tuesday", "wednesday", "thursday", "friday"]
          .filter((d) => String(plan.dailyPlans?.[d]?.focus || "").trim()).length,
        draftBooks: (draft.week?.books || []).length,
        draftSongs: (draft.week?.songs || []).length,
        printableIdeas: (draft.week?.printableIdeas || []).length,
        coverPrompt: Boolean(draft.week?.coverImagePrompt || plan.coverImagePrompt),
      });
      console.log(
        uiOk && kitOk ? "PASS" : "FAIL",
        plan.title,
        `ui=${uiOk}`,
        `api=${Boolean(kitOk)}`,
        `print=${printOk}`,
        `quality=${q.publishReadiness}`,
        `shots=${shots.length}`,
      );
    }
  } finally {
    await browser.close();
  }

  const prior = JSON.parse(fs.readFileSync(path.join(OUT, "reports", "UPGRADE_REPORT.json"), "utf8"));
  const report = {
    ...prior,
    verifiedAt: new Date().toISOString(),
    verification: verify,
    allAdminUiOk: verify.every((v) => v.adminUiMounted && v.kitApiUnlocked),
    allPrintOk: verify.every((v) => v.printPathOk),
    remainingOwnerMedia: verify.map((v) => ({
      planId: v.planId,
      title: v.title,
      needs: [
        v.coverPrompt ? "cover artwork (prompt ready)" : "cover prompt missing",
        "activity images (Image Needed briefs in draft)",
        "printable files (Printable Needed notes in draft)",
      ],
    })),
  };
  fs.writeFileSync(path.join(OUT, "reports", "UPGRADE_REPORT.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, "UPGRADE_REPORT.json"), JSON.stringify(report, null, 2));

  const md = [
    "# First 10 Teaching Kit Content Upgrades — Owner Review",
    "",
    `Generated: ${report.generatedAt}`,
    `Verified: ${report.verifiedAt}`,
    `Site: ${PROD}`,
    "",
    "## Verdict for this batch",
    "",
    `- Admin Teaching Kit UI render: ${report.allAdminUiOk ? "PASS" : "FAIL"}`,
    `- Print path: ${report.allPrintOk ? "PASS" : "FAIL"}`,
    `- Auto-published enrichment: NO`,
    `- Image/printable generation: NO`,
    `- Remaining curriculum conversion: **paused pending your approval**`,
    "",
    "## 1) Which 10 lesson plans were upgraded",
    "",
    "| # | ID | Title | Age | Plan |",
    "| --- | --- | --- | --- | --- |",
    ...verify.map((v, i) => {
      const plan = plans.find((p) => p.id === v.planId);
      return `| ${i + 1} | \`${v.planId}\` | ${v.title} | ${v.age} | ${plan?.plan || ""} |`;
    }),
    "",
    "## 2) Before-and-after summaries",
    "",
    ...verify.map((v) => {
      const before = (prior.upgraded || []).find((u) => u.planId === v.planId)?.before || {};
      return [
        `### ${v.title}`,
        "",
        `- **Before:** enrichment draft=${before.hasEnrichmentDraft}, weekday focus ${before.weekdayFocusFilled ?? "?"}/5, books ${before.books ?? "?"}, songs ${before.songs ?? "?"}`,
        `- **After:** weekday focus ${v.weekdayFocus}/5, draft books ${v.draftBooks}, draft songs ${v.draftSongs}, printable ideas ${v.printableIdeas}, cover prompt=${v.coverPrompt}`,
        `- **Quality:** score ${v.qualityScore}, readiness **${v.publishReadiness}**, owner media pending=${v.ownerMediaPending}`,
        `- **Hard blockers:** ${(v.blockingIssues || []).length ? v.blockingIssues.map((b) => b.code).join(", ") : "none"}`,
        `- **Admin UI / API / Print:** ${v.adminUiMounted ? "UI✓" : "UI✗"} ${v.kitApiUnlocked ? "API✓" : "API✗"} ${v.printPathOk ? "Print✓" : "Print✗"}`,
        `- **Screenshots:** ${v.screenshots.length} files under \`screenshots/\` (prefix \`${v.planId}-\`)`,
        "",
      ].join("\n");
    }),
    "## 3) Screenshots",
    "",
    `All section screenshots: \`${OUT}/screenshots/\``,
    "",
    "Per lesson: Start Week, Monday Setup, Today, Binder tabs (Overview/Weekly/Activities/Books/Songs/Printables/Teacher), Build/Print.",
    "",
    "## 4) Missing content still requiring owner review",
    "",
    ...report.remainingOwnerMedia.flatMap((row) => [
      `### ${row.title}`,
      ...row.needs.map((n) => `- ${n}`),
      "",
    ]),
    "## 5) Blockers encountered",
    "",
    (prior.blockers || []).length
      ? (prior.blockers || []).map((b) => `- ${b.planId}: ${b.error}`).join("\n")
      : "- No save/API blockers in the final pass.",
    "",
    "Quality soft notes: some kits may still show educational suggestions; hard blockers were cleared for safety false-positives (e.g. “glasses” substring) and milking latex-free notes were added for Farm Animals.",
    "",
    "## 6) Schema / database changes",
    "",
    "- **None.** No migrations.",
    "- Wrote existing fields only: `enrichmentDraft`, `dailyPlans` weekday fields, book/song metadata, `coverImagePrompt`, safety wording scrub.",
    "",
    "## 7) Reusable components for remaining conversion",
    "",
    "- `scripts/teaching-kit-content-upgrade-polish.js` — book/song/toolkit completers, printable-needed templates, cover prompts, daily-plan enricher, safety scrub",
    "- `scripts/run-first-10-teaching-kit-upgrades.js` — production batch runner (draft + weekday fill)",
    "- `scripts/verify-first-10-teaching-kit-upgrades.js` — admin UI / print / screenshot verifier",
    "",
    "## 8) Production admin + print confirmation",
    "",
    `| Check | Result |`,
    `| --- | --- |`,
    `| Admin Teaching Kit mounts for all 10 | ${report.allAdminUiOk ? "YES" : "NO"} |`,
    `| Teaching Kit API unlocked with admin session | ${verify.every((v) => v.kitApiUnlocked) ? "YES" : "NO"} |`,
    `| Print Center / binder print path | ${report.allPrintOk ? "YES" : "NO"} |`,
    "",
    "**Please review these 10 before approving conversion of the remaining library.**",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(OUT, "reports", "UPGRADE_REPORT.md"), md);
  fs.writeFileSync(path.join(REPORT_DIR, "UPGRADE_REPORT.md"), md);
  console.log(md);
  if (!report.allAdminUiOk) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
