#!/usr/bin/env node
/**
 * Disposable-only screenshots for Draft Review owner live-fix verification.
 * Does not touch Amazing Apples / All About Me / Farm Animals.
 * Run: NODE_ENV=test node scripts/test-draft-review-owner-live-fix-shots.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = path.join(__dirname, "..");
const PORT = 6700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-owner-live-fix-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/owner-live-fix";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-live-fix-pass",
  code: "owner-live-fix-code",
};
const PLAN_ID = "cur-lp-zz-owner-live-fix";
const RES_ID = "cur-res-zz-owner-live-fix";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Disposable page ${i}`, { x: 72, y: 720, size: 22, font, color: rgb(0.1, 0.2, 0.1) });
  }
  const bytes = await doc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

function enrichmentDraft() {
  const mk = (day, title, extra = {}) => ({
    itemId: `item-${day}-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    activityCategory: "Sensory Play",
    objective: "Explore safely.",
    materials: extra.materials || "Paper\nCrayons\nTray",
    setup: "Set materials on a low table.",
    steps: "1. Invite.\n2. Explore.\n3. Clean up.",
    imageRequirement: "required",
    exampleImageUrl: "https://example.com/ex.jpg",
    setupImageUrl: "https://example.com/setup.jpg",
    teacherTips: ["Narrate gently."],
    observationOpportunities: "Does the child explore?",
    vocabulary: "soft, press",
  });
  const days = {
    monday: { items: [mk("monday", "Keep Activity A"), mk("monday", "Keep Activity B"), mk("monday", "Remove Me Collage")] },
    tuesday: { items: [mk("tuesday", "Keep Activity C"), mk("tuesday", "Glass Safety Probe", { materials: "Glass jar\nWater" }), mk("tuesday", "Keep Activity D")] },
    wednesday: { items: [mk("wednesday", "Keep Activity E"), mk("wednesday", "Keep Activity F"), mk("wednesday", "Remove Me Relay")] },
    thursday: { items: [mk("thursday", "Keep Activity G"), mk("thursday", "Keep Activity H"), mk("thursday", "Keep Activity I")] },
    friday: { items: [mk("friday", "Keep Activity J"), mk("friday", "Keep Activity K"), mk("friday", "Keep Activity L")] },
  };
  // Proposed plan already excludes removals (17-15 style): 13 keepers after removing 2 from proposed.
  const proposed = JSON.parse(JSON.stringify(days));
  proposed.monday.items = proposed.monday.items.filter((i) => i.title !== "Remove Me Collage");
  proposed.wednesday.items = proposed.wednesday.items.filter((i) => i.title !== "Remove Me Relay");
  return {
    activities: {},
    week: {
      proposedDailyPlans: proposed,
      removedActivityTitles: ["Remove Me Collage", "Remove Me Relay"],
      activityDecisions: [
        { title: "Remove Me Collage", decision: "remove", note: "Duplicate collage." },
        { title: "Remove Me Relay", decision: "remove", note: "Duplicate locomotion." },
        { title: "Keep Activity A", decision: "rewrite", note: "Improved tips." },
      ],
      books: [{ title: "Color Farm", author: "QA", whyThisBook: "Theme fit", beforeReadingQuestions: ["Q?"], duringReadingPrompts: ["P?"], afterReadingQuestions: ["A?"] }],
      songs: [{ title: "Color Song", rightsStatus: "traditional", motions: "Tap", teacherDirections: "Sing" }],
      teacherToolkit: { prepChecklist: ["Set table"], materialsAlternatives: ["Use cups"], classroomManagementTips: ["Small groups"], transitions: ["Clean-up song"] },
      vocabularyWords: ["soft", "press", "pour"],
      learningObjectives: ["Explore textures", "Practice pouring", "Use gentle hands"],
      familyConnection: "Talk about colors at home.",
      weeklyMaterials: "Paper\nCrayons\nTray\nCups\nTowels\nWater\nPaint\nGlue",
      printableIds: [RES_ID],
    },
    previewReady: true,
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    siteContent: {
      updatedAt: new Date().toISOString(),
      featureFlags: {
        teachingKitEnrichmentEditor: false,
        teachingKitQualityReview: true,
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
      },
      curriculum: { lessonPlans: [], activities: [], resources: [] },
      curriculumDraftReviewQueue: [],
    },
  }));
  const child = spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LOCAL_JSON_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const waitHealth = async () => {
    for (let i = 0; i < 80; i += 1) {
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200) return;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("server health timeout");
  };
  try {
    await waitHealth();
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email, password: OWNER.password, code: OWNER.code,
    });
    ok(login.status === 200, "owner login");
    const token = login.json.token || login.json.adminToken;
    const auth = { Authorization: `Bearer ${token}` };
    const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const site = boot.json.siteContent;
    const pdf = await makePdf();
    // 15 linked store activities including 2 removed titles (card would show 15; overlay → 13)
    const storeActs = [];
    const draft = enrichmentDraft();
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      (enrichmentDraft().week.proposedDailyPlans[day].items
        .concat(day === "monday" ? [{ title: "Remove Me Collage", itemId: "rm1" }] : [])
        .concat(day === "wednesday" ? [{ title: "Remove Me Relay", itemId: "rm2" }] : [])
      ).forEach((item, idx) => {
        storeActs.push({
          id: `act-${day}-${idx}`,
          lessonPlanId: PLAN_ID,
          dayOfWeek: day,
          title: item.title,
          status: "published",
          activityCategory: "Sensory Play",
        });
      });
    });
    // rebuild clean proposed-only store + extras
    const linked = [];
    Object.entries(draft.week.proposedDailyPlans).forEach(([day, bucket]) => {
      (bucket.items || []).forEach((item, idx) => {
        linked.push({
          id: `act-${day}-${idx}`,
          lessonPlanId: PLAN_ID,
          dayOfWeek: day,
          title: item.title,
          status: "published",
          activityCategory: "Sensory Play",
        });
      });
    });
    linked.push(
      { id: "act-rm-1", lessonPlanId: PLAN_ID, dayOfWeek: "monday", title: "Remove Me Collage", status: "published", activityCategory: "Art" },
      { id: "act-rm-2", lessonPlanId: PLAN_ID, dayOfWeek: "wednesday", title: "Remove Me Relay", status: "published", activityCategory: "Movement" },
    );
    const plan = {
      id: PLAN_ID,
      title: "ZZ Owner Live Fix Disposable",
      age: "Toddler",
      theme: "QA",
      status: "published",
      plan: "Pro",
      resourceIds: [],
    };
    const seed = await requestJson("POST", "/api/admin/site-content", {
      expectedUpdatedAt: site.updatedAt,
      siteContent: {
        ...site,
        featureFlags: {
          ...(site.featureFlags || {}),
          teachingKitEnrichmentEditor: false,
          teachingKitQualityReview: true,
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
        curriculum: {
          ...site.curriculum,
          lessonPlans: [...(site.curriculum.lessonPlans || []).filter((p) => p.id !== PLAN_ID), plan],
          activities: [
            ...(site.curriculum.activities || []).filter((a) => a.lessonPlanId !== PLAN_ID),
            ...linked,
          ],
        },
      },
    }, auth);
    ok(seed.status === 200, "seed disposable lesson + 15 linked activities");
    const submit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: PLAN_ID,
      title: plan.title,
      age: plan.age,
      theme: plan.theme,
      batchName: "Owner live fix shots",
      source: "cursor-agent",
      enrichmentDraft: draft,
      printables: [{
        id: RES_ID,
        title: "Disposable Picture Cards",
        fileName: "disposable.pdf",
        fileData: pdf,
        pageCount: 4,
        printingInstructions: "Print US Letter.",
      }],
      expectedUpdatedAt: seed.json.siteContent.updatedAt,
    }, auth);
    ok(submit.status === 200, "submit disposable draft");
    const draftId = submit.json.detail?.id || submit.json.entry?.id;
    const get = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "get", id: draftId }, auth);
    ok(Number(get.json.activityCount) === 13, `queue/get activity count 13 (got ${get.json.activityCount})`);
    ok(get.json.activities.every((a) => !/Remove Me/i.test(a.title)), "removed titles absent from get activities");

    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      page.on("dialog", async (d) => { await d.accept().catch(() => {}); });
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof setAdminSession === "function" && typeof setView === "function");
      await page.evaluate(({ owner, token: t }) => {
        setAdminSession({ email: owner.email, name: "Owner", token: t, mode: "server", trustedDevice: true });
        localStorage.setItem("llhAdminPreviewMode", "Admin");
      }, { owner: OWNER, token });
      await page.evaluate(async () => {
        setView("admin");
        await loadAdminSiteContent();
        setAdminSectionTab("curriculum-draft-review");
        applyAdminSectionVisibility?.();
      });
      await page.waitForFunction(
        () => document.querySelectorAll("[data-draft-review-open-kit]").length > 0,
        null,
        { timeout: 30000 },
      );
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `queue-open-review-buttons-${viewport.name}.png`), fullPage: true });

      // Click first visible/enabled Open Review (table or mobile card).
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("[data-draft-review-open-kit]")];
        const btn = buttons.find((el) => el.offsetParent !== null) || buttons[0];
        if (!btn) throw new Error("Open Review button missing");
        btn.scrollIntoView({ block: "center" });
        btn.click();
      });
      await page.waitForFunction(() => document.body.classList.contains("tk-enrich-open"), null, { timeout: 20000 });
      const probe = await page.evaluate(() => {
        const step = document.querySelector("[data-publish-ready-step]")?.textContent || "";
        const workflow = document.querySelector("[data-workflow-status-chrome]")?.textContent || "";
        const nav = document.querySelector(".tk-enrich-chrome")?.textContent || "";
        const of = nav.match(/Activity\s+\d+\s+of\s+(\d+)/i);
        const blockers = [...document.querySelectorAll("[data-blocker-navigate], .tk-enrich-blockers li, [data-publish-blocker-list] li")]
          .map((el) => ({ text: el.textContent.trim(), nav: el.getAttribute("data-blocker-navigate") || "" }));
        const listTitles = [...document.querySelectorAll("[data-enrich-activity-jump], .tk-enrich-jump-list button")]
          .map((el) => el.textContent.trim());
        return { step, workflow, total: of ? Number(of[1]) : null, blockers, listTitles };
      });
      ok(probe.total === 13, `editor shows 13 activities (${viewport.name}: ${probe.total})`);
      ok(!/Publish Ready/i.test(probe.step), `no Publish Ready stepper (${viewport.name}: ${probe.step})`);
      ok(!/Publish Ready/i.test(probe.workflow), `no Publish Ready badge (${viewport.name}: ${probe.workflow})`);
      ok(probe.listTitles.every((t) => !/Remove Me/i.test(t)), `removed activities hidden in editor (${viewport.name})`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `editor-readiness-${viewport.name}.png`), fullPage: true });

      // Open Publish dialog to surface hard blockers (same eligibility model as chrome).
      await page.locator("[data-enrich-publish]").first().click({ force: true });
      await page.waitForTimeout(500);
      const publishProbe = await page.evaluate(() => {
        const items = [...document.querySelectorAll("[data-publish-blocker-list] li")].map((li) => {
          const btn = li.querySelector("[data-blocker-navigate]");
          return {
            text: li.textContent.trim(),
            nav: btn?.getAttribute("data-blocker-navigate") || "",
          };
        });
        return {
          readiness: document.querySelector("[data-publish-readiness-label]")?.textContent || "",
          items,
        };
      });
      const safety = publishProbe.items.find((b) => /Safety concern|glass/i.test(b.text));
      ok(Boolean(safety), `safety blocker visible in publish dialog (${viewport.name})`);
      if (safety) {
        ok(/Glass Safety Probe/i.test(safety.text), `safety names activity (${viewport.name})`);
        ok(/glass/i.test(safety.text), `safety names condition (${viewport.name})`);
        ok(/Required fix/i.test(safety.text), `safety names required fix (${viewport.name})`);
        ok(/^activity:/i.test(safety.nav), `safety has activity navigate link (${viewport.name}: ${safety.nav})`);
      }
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `editor-readiness-safety-${viewport.name}.png`), fullPage: true });
      if (safety?.nav) {
        const jumped = await page.evaluate((nav) => {
          const btn = [...document.querySelectorAll("[data-blocker-navigate]")]
            .find((el) => el.getAttribute("data-blocker-navigate") === nav);
          if (!btn) return { ok: false, reason: "button missing", active: "" };
          btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          const active = document.querySelector(".tk-enrich-queue-item.is-active")?.textContent?.trim() || "";
          const heading = document.querySelector(".tk-enrich-activity-head, .tk-enrich-activity h2, .tk-enrich-activity h3")?.textContent?.trim() || "";
          return { ok: true, reason: "", active, heading, shell: (document.querySelector(".tk-enrich-shell")?.textContent || "").slice(0, 2500) };
        }, safety.nav);
        ok(jumped.ok, `safety navigate clicked (${viewport.name}: ${jumped.reason || "ok"})`);
        await page.waitForTimeout(700);
        const after = await page.evaluate(() => ({
          active: document.querySelector(".tk-enrich-queue-item.is-active")?.textContent?.trim() || "",
          shell: (document.querySelector(".tk-enrich-shell")?.textContent || "").slice(0, 2500),
        }));
        ok(
          /Glass Safety Probe/i.test(after.active || after.shell || jumped.active || jumped.shell || ""),
          `safety link opens activity (${viewport.name})`,
        );
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `safety-activity-jump-${viewport.name}.png`), fullPage: true });
      }

      // Exit to queue detail for compare / images / printables
      await page.evaluate(() => LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true }));
      await page.waitForTimeout(900);
      await page.waitForFunction(() => !document.body.classList.contains("tk-enrich-open"));

      // Ensure detail open
      await page.evaluate(async (id) => {
        if (window.LLHDraftReviewQueue?.openDetail) await window.LLHDraftReviewQueue.openDetail(id);
      }, draftId);
      await page.waitForTimeout(500);

      await page.click("[data-draft-review-compare]").catch(() => {});
      await page.waitForTimeout(600);
      const compareText = await page.evaluate(() => (
        document.querySelector(".tk-draft-compare-panel, [data-draft-compare]")?.innerText
        || document.querySelector("#adminDraftReviewQueueApp")?.innerText
        || ""
      ));
      ok(/Remove Me Collage|Remove Me Relay|Removed/i.test(compareText), `compare lists removed (${viewport.name})`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `compare-removed-${viewport.name}.png`), fullPage: true });

      await page.click("[data-draft-review-images]").catch(() => {});
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `image-review-${viewport.name}.png`), fullPage: true });

      await page.click("[data-draft-review-printables]").catch(() => {});
      await page.waitForTimeout(1200);
      await page.evaluate(async () => {
        const api = window.LLHDraftReviewQueue;
        const pdfApi = window.LLHCurriculumDraftPrintableReview;
        if (!api?.state?.selectedId || !pdfApi) return;
        if (!api.state.printableReview) {
          const token = adminSession()?.token || "";
          const res = await fetch("/api/admin/curriculum/draft-review", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: "printable-review", id: api.state.selectedId }),
          });
          api.state.printableReview = await res.json();
          api.state.printableViewers = {};
        }
        for (const row of api.state.printableReview?.printables || []) {
          if (!api.state.printableViewers[row.id]) api.state.printableViewers[row.id] = pdfApi.createViewerState(row);
          const viewer = api.state.printableViewers[row.id];
          if (!viewer.pdfDoc && !viewer.error) await pdfApi.loadDocument(viewer);
        }
        api.render();
      });
      await page.waitForSelector(".tk-draft-pdf-thumb", { timeout: 60000 });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `printable-thumbs-${viewport.name}.png`), fullPage: true });
      await page.locator(".tk-draft-pdf-thumb").first().click({ force: true });
      await page.waitForSelector(".tk-draft-pdf-lightbox canvas", { timeout: 20000 });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `printable-page-preview-${viewport.name}.png`), fullPage: true });
      await page.locator("[data-pdf-close]").first().click({ force: true }).catch(() => {});
    }
    await browser.close();
    console.log(`\nPASS owner-live-fix shots (${passed} asserts)`);
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
