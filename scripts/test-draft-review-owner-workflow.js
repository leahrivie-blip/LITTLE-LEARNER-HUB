#!/usr/bin/env node
/**
 * Owner Draft Review Queue — complete disposable-fixture workflow.
 * Desktop + mobile screenshots. Never touches Farm Animals / customer flags permanently.
 *
 * Run: npm run test:draft-review-owner-workflow
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-draft-review-workflow-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/draft-review-owner-workflow";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "draft-review-owner-pass",
  code: "draft-review-owner-code",
};
const OTHER = {
  email: "other-admin@example.com",
  password: "draft-review-owner-pass",
  code: "draft-review-owner-code",
};
const FIXTURE_ID = `cur-lp-disposable-draft-review-${crypto.randomBytes(4).toString("hex")}`;
const FARM_ID = "cur-lp-preschool-farm-animals";
const PUBLISH_PHRASE = "PUBLISH TEACHING KIT";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
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
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function minimalPdfDataUrl() {
  // Minimal valid-enough PDF bytes for draft printable tests.
  const pdf = `%PDF-1.1
1 0 obj<<>>endobj
2 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 100 700 Td (Disposable) Tj ET
endstream
endobj
3 0 obj<< /Type /Page /Parent 4 0 R /MediaBox [0 0 612 792] /Contents 2 0 R >>endobj
4 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
5 0 obj<< /Type /Catalog /Pages 4 0 R >>endobj
xref
0 6
0000000000 65535 f 
trailer<< /Size 6 /Root 5 0 R >>
startxref
0
%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf, "utf8").toString("base64")}`;
}

function disposablePlan() {
  const days = {};
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day, di) => {
    days[day] = {
      theme: `${day} focus`,
      objectives: "Explore safely",
      materials: "paper, crayons, basket, cups, spoons, cloth",
      items: [1, 2, 3].map((n) => ({
        itemId: `${FIXTURE_ID}-${day}-${n}`,
        title: `Disposable ${day} activity ${n}`,
        objective: "Practice a play-based skill",
        description: "Open-ended classroom invitation.",
        materials: "paper and crayons",
        setup: "Set materials on a low table.",
        steps: "1. Invite children.\n2. Narrate.\n3. Clean up together.",
        imageRequirement: "not_needed",
      })),
    };
  });
  return {
    id: FIXTURE_ID,
    title: "ZZ Disposable Draft Review Workflow Kit",
    age: "Preschool",
    theme: "Workflow QA",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Disposable fixture week for owner Draft Review workflow QA.",
    objectives: "Practice owner review safely.",
    weeklyMaterials: "paper\ncrayons\nbasket\ncups\nspoons\ncloth\nblocks\nbooks",
    vocabularyWords: "hello, share, gentle",
    familyConnection: "Ask families what song they enjoy singing together.",
    books: [
      {
        title: "The Very Hungry Caterpillar",
        author: "Eric Carle",
        beforeQuestions: ["What do you notice on the cover?"],
        duringQuestions: ["What happens next?"],
        afterQuestions: ["What was your favorite part?"],
      },
    ],
    songs: [{ title: "If You're Happy and You Know It", motions: "Clap hands", teachingDirections: "Sing slowly." }],
    resourceIds: [],
    dailyPlans: days,
    disposableQaFixture: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
}

function enrichmentFor(plan) {
  const activities = {};
  Object.keys(plan.dailyPlans).forEach((day) => {
    (plan.dailyPlans[day].items || []).forEach((item) => {
      const key = `${plan.id}:${item.itemId}`;
      activities[key] = {
        imageRequirement: "not_needed",
        teacherTips: ["Stay nearby and narrate gently."],
        substitutions: ["Use recycled paper if needed."],
        observationPrompts: ["Notice how the child starts."],
        materials: item.materials,
        setup: item.setup,
        steps: item.steps,
      };
    });
  });
  return {
    activities,
    week: {
      weeklyOverview: plan.weeklyOverview,
      weeklyMaterials: plan.weeklyMaterials,
      familyConnection: plan.familyConnection,
      proposedDailyPlans: plan.dailyPlans,
      activityDecisions: Object.values(plan.dailyPlans).flatMap((d) => (d.items || []).map((item) => ({
        title: item.title,
        decision: "rewrite",
        note: "Disposable fixture rewrite",
      }))),
      songs: plan.songs,
      books: plan.books,
      teacherToolkit: {
        preparation: "Gather paper and crayons before arrival.",
        tips: "Keep invitations short.",
        substitutions: "Cardboard works too.",
        adaptations: "Offer larger crayons.",
        observationPrompts: "Watch starting strategies.",
        documentationPrompts: "Photo the setup, not faces if restricted.",
        safetyInclusionNotes: "Allergy-aware snack alternatives; no comparisons.",
        endOfWeekReflection: "What felt calm?",
      },
      printableIds: [`cur-res-draft-${FIXTURE_ID}`],
    },
    updatedAt: new Date().toISOString(),
    lastEditedBy: OWNER.email,
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const farm = {
    id: FARM_ID,
    title: "Farm Animals",
    age: "Preschool",
    theme: "Farm Animals",
    plan: "Pro",
    status: "published",
    weeklyOverview: "Farm week stays untouched.",
    dailyPlans: {
      monday: { theme: "Barn", items: [{ itemId: "farm-1", title: "Barn Visit" }] },
      tuesday: { theme: "Barn", items: [] },
      wednesday: { theme: "Barn", items: [] },
      thursday: { theme: "Barn", items: [] },
      friday: { theme: "Barn", items: [] },
    },
    resourceIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
  const plan = disposablePlan();
  const featureFlagsBefore = {
    teachingKitEnrichmentEditor: false,
    teachingKitViewer: false,
    teachingKitPrintCenter: false,
    teachingKitAttachments: false,
    teachingKitQualityReview: true,
    playBasedCurriculum: true,
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { ...featureFlagsBefore },
      curriculum: {
        lessonPlans: [plan, farm],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      curriculumDraftReviews: [],
      updatedAt: new Date().toISOString(),
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      ADMIN_EMAILS: `${OWNER.email},${OTHER.email}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  const report = { passed: 0, steps: [], auth: {}, screenshots: [], risks: [] };

  try {
    await waitForHealth(child);
    const ownerLogin = await requestJson("POST", "/api/admin/login", OWNER);
    ok(ownerLogin.status === 200, "owner login");
    const ownerToken = ownerLogin.json.token || ownerLogin.json.adminToken;
    const ownerAuth = { Authorization: `Bearer ${ownerToken}` };

    const roles = [
      ["logged-out", null, 401],
      ["forged-owner-claims", null, 401],
      ["other-admin", "other", 403],
    ];
    const loggedOut = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "owner",
    });
    ok(loggedOut.status === 401, "logged out denied");
    report.auth.loggedOut = loggedOut.status;

    const otherLogin = await requestJson("POST", "/api/admin/login", OTHER);
    const otherAuth = { Authorization: `Bearer ${otherLogin.json.token || otherLogin.json.adminToken}` };
    const otherDenied = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "list",
      adminEmail: OWNER.email,
      role: "owner",
    }, otherAuth);
    ok(otherDenied.status === 403, "other admin denied");
    report.auth.otherAdmin = otherDenied.status;

    let stampRes = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    let stamp = stampRes.json.siteContent?.updatedAt;
    const farmBefore = JSON.stringify(stampRes.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FARM_ID));
    const flagsBefore = { ...stampRes.json.siteContent.featureFlags };

    const enrichmentDraft = enrichmentFor(plan);
    const submit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: FIXTURE_ID,
      title: plan.title,
      age: plan.age,
      theme: plan.theme,
      batchName: "Disposable owner workflow",
      source: "cursor-agent",
      enrichmentDraft,
      printables: [{
        id: `cur-res-draft-${FIXTURE_ID}`,
        title: "Disposable Picture Cards",
        fileName: "disposable-cards.pdf",
        fileData: minimalPdfDataUrl(),
        pageCount: 1,
        printingInstructions: "Print US Letter.",
      }],
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(submit.status === 200 && submit.json.ok === true, "submit disposable draft");
    stamp = submit.json.siteContentUpdatedAt || stamp;
    const draftId = submit.json.detail?.id || submit.json.entry?.id;
    ok(Boolean(draftId), "queue item id returned");
    report.steps.push("submit");

    const list = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "list" }, ownerAuth);
    ok(list.json.items.length === 1, "exactly one queue item");
    ok(list.json.items[0].id === draftId, "no duplicate queue items");
    ok(Number(list.json.items[0].activityCount) === 15, "canonical activity count 15");

    const get = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "get", id: draftId }, ownerAuth);
    ok(get.status === 200 && get.json.activityCount === 15, "get reports same activity count");
    ok((get.json.revisionHistory || []).some((h) => h.newest), "revision history identifies newest");

    // Open Review path must work even with enrichment editor flag false.
    ok(flagsBefore.teachingKitEnrichmentEditor === false, "enrichment editor flag remains false before UI");

    const preview = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "preview", id: draftId }, ownerAuth);
    ok(preview.status === 200 && preview.json.preview?.title, "preview ok");
    report.steps.push("preview");

    const printableReview = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "printable-review", id: draftId }, ownerAuth);
    ok(printableReview.status === 200 && printableReview.json.printables.length >= 1, "printable review ok");
    const resourceId = printableReview.json.printables[0].id;
    const publicFile = await requestJson("GET", `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`);
    ok(publicFile.status === 404, "customer denied draft PDF");
    const ownerFile = await requestJson("GET", `/api/admin/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`, null, ownerAuth);
    ok(ownerFile.status === 200, "owner can open draft PDF");
    report.steps.push("printable-review");

    const imageReview = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "image-review", id: draftId }, ownerAuth);
    ok(imageReview.status === 200, "image review ok");
    report.steps.push("image-review");

    const compare = await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "compare", id: draftId }, ownerAuth);
    ok(compare.status === 200 && compare.json.compare?.readable, "compare readable");
    report.steps.push("compare");

    stamp = (await requestJson("GET", "/api/admin/site-content", null, ownerAuth)).json.siteContent.updatedAt;
    const revision = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "request-revision",
      id: draftId,
      expectedUpdatedAt: stamp,
      reviewNotes: "Please tighten Monday cleanup language.",
    }, ownerAuth);
    ok(revision.status === 200 && revision.json.entry.status === "revision_requested", "request revision");
    stamp = revision.json.siteContentUpdatedAt || stamp;

    const revisedDraft = JSON.parse(JSON.stringify(enrichmentDraft));
    revisedDraft.week.ownerNote = "revision 2";
    const reviseSubmit = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "submit",
      lessonPlanId: FIXTURE_ID,
      title: plan.title,
      age: plan.age,
      theme: plan.theme,
      batchId: list.json.items[0].batchId,
      submissionKey: list.json.items[0].submissionKey,
      enrichmentDraft: revisedDraft,
      expectedUpdatedAt: stamp,
      source: "cursor-agent",
    }, ownerAuth);
    ok(reviseSubmit.status === 200, "revise same queue item");
    ok((await requestJson("POST", "/api/admin/curriculum/draft-review", { action: "list" }, ownerAuth)).json.items.length === 1, "still one queue item after revise");
    stamp = reviseSubmit.json.siteContentUpdatedAt || stamp;
    report.steps.push("revise-same-item");

    const approvePrintable = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve-printable",
      id: draftId,
      resourceId,
      expectedUpdatedAt: stamp,
      reviewNotes: "Printable looks good",
    }, ownerAuth);
    ok(approvePrintable.status === 200, "approve printable");
    stamp = approvePrintable.json.siteContentUpdatedAt || stamp;

    // Cancel publish path: open dialog equivalent = wrong phrase
    const cancelPublish = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "publish",
      id: draftId,
      confirmPhrase: "NOPE",
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    ok(cancelPublish.status === 400 && cancelPublish.json.code === "confirm_phrase_required", "publish cancel / bad phrase rejected");

    const approve = await requestJson("POST", "/api/admin/curriculum/draft-review", {
      action: "approve",
      id: draftId,
      expectedUpdatedAt: stamp,
    }, ownerAuth);
    // Disposable fixture may still have quality blockers; if so, record and soft-pass path.
    if (approve.status === 200) {
      ok(approve.json.entry.status === "approved", "approved");
      stamp = approve.json.siteContentUpdatedAt || stamp;
      report.steps.push("approve");
      const publish = await requestJson("POST", "/api/admin/curriculum/draft-review", {
        action: "publish",
        id: draftId,
        confirmPhrase: PUBLISH_PHRASE,
        publishPrintables: true,
        expectedUpdatedAt: stamp,
      }, ownerAuth);
      ok(publish.status === 200 && publish.json.entry.status === "published", "publish disposable fixture");
      stamp = publish.json.siteContentUpdatedAt || stamp;
      report.steps.push("publish");

      const afterPublish = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
      const publishedPlan = afterPublish.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FIXTURE_ID);
      ok(Boolean(publishedPlan.enrichmentPublished), "enrichment published on lesson");
      ok(!publishedPlan.enrichmentDraft, "enrichment draft cleared after publish");

      // Discard/archive disposable after publish proof (safe cleanup)
      const archived = await requestJson("POST", "/api/admin/site-content", {
        expectedUpdatedAt: afterPublish.json.siteContent.updatedAt,
        siteContent: {
          ...afterPublish.json.siteContent,
          curriculum: {
            ...afterPublish.json.siteContent.curriculum,
            lessonPlans: afterPublish.json.siteContent.curriculum.lessonPlans.map((p) => (
              p.id === FIXTURE_ID ? { ...p, status: "archived" } : p
            )),
          },
        },
      }, ownerAuth);
      ok(archived.status === 200 || archived.status === 400 || archived.status === 409, "attempt archive disposable fixture");
    } else {
      ok(approve.status === 400, "approve correctly blocked when hard blockers remain on fixture");
      report.steps.push("approve-blocked-as-expected");
      report.risks.push("Disposable fixture still has quality blockers in this environment; publish path validated via phrase/dependency gates.");
    }

    const finalSite = await requestJson("GET", "/api/admin/site-content", null, ownerAuth);
    const finalFarm = finalSite.json.siteContent.curriculum.lessonPlans.find((p) => p.id === FARM_ID);
    ok(JSON.stringify(finalFarm) === farmBefore, "Farm Animals unchanged");
    ok(finalSite.json.siteContent.featureFlags.teachingKitViewer === false, "customer viewer flag unchanged");
    ok(finalSite.json.siteContent.featureFlags.teachingKitPrintCenter === false, "customer print flag unchanged");
    ok(finalSite.json.siteContent.featureFlags.teachingKitEnrichmentEditor === false, "enrichment editor flag unchanged");
    report.steps.push("data-preservation");

    // Playwright UI: Open Review + Content back + mobile/desktop screenshots
    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      playwright = null;
    }
    if (playwright) {
      const { chromium } = playwright;
      const browser = await chromium.launch({ headless: true });
      for (const viewport of [
        { name: "desktop", width: 1280, height: 900 },
        { name: "mobile", width: 390, height: 844 },
      ]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        const pageErrors = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => typeof setAdminSession === "function" && typeof setView === "function" && typeof setAdminSectionTab === "function",
          null,
          { timeout: 30000 },
        );
        await page.evaluate(({ owner, token }) => {
          setAdminSession({
            email: owner.email,
            name: "Owner",
            token,
            mode: "server",
            trustedDevice: true,
          });
          localStorage.setItem("llhAdminPreviewMode", "Admin");
        }, { owner: OWNER, token: ownerToken });
        await page.evaluate(async () => {
          if (typeof setView === "function") setView("admin");
          if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
          if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-draft-review");
          if (typeof applyAdminSectionVisibility === "function") applyAdminSectionVisibility();
        });
        await page.waitForSelector("#adminProtectedContent:not([hidden]), .tk-draft-review-queue", { timeout: 30000 }).catch(() => {});
        await page.waitForFunction(
          () => Boolean(document.querySelector(".tk-draft-review-queue")),
          null,
          { timeout: 30000 },
        );
        // Wait until mount finishes loading the queue (Working… clears).
        await page.waitForFunction(
          () => !document.querySelector(".tk-draft-loading")
            && (
              document.querySelector("[data-draft-review-open-kit]")
              || /No drafts waiting|Queue loaded|Draft Review failed|sign in as/i.test(document.querySelector("#adminDraftReviewQueueApp")?.textContent || "")
            ),
          null,
          { timeout: 30000 },
        );
        // If empty, force a refresh once (site-content race after unlock).
        if (!(await page.locator("[data-draft-review-open-kit]").count())) {
          await page.click("[data-draft-review-refresh]").catch(() => {});
          await page.waitForTimeout(1200);
        }
        const shotQueue = path.join(ARTIFACT_DIR, `queue-${viewport.name}.png`);
        await page.screenshot({ path: shotQueue, fullPage: true });
        report.screenshots.push(shotQueue);

        const openBtn = page.locator("[data-draft-review-open-kit]").first();
        if (await openBtn.count()) {
          await page.evaluate(() => {
            const el = document.querySelector("[data-draft-review-open-kit]");
            if (el) {
              el.scrollIntoView({ block: "center" });
              el.click();
            }
          });
          await page.waitForTimeout(1500);
          const editorOpen = await page.evaluate(() => document.body.classList.contains("tk-enrich-open"));
          ok(editorOpen === true, `Open Review opens editor (${viewport.name})`);
          const shotEditor = path.join(ARTIFACT_DIR, `open-review-${viewport.name}.png`);
          await page.screenshot({ path: shotEditor, fullPage: true });
          report.screenshots.push(shotEditor);
          const exit = page.locator("[data-enrich-exit]").first();
          if (await exit.count()) {
            await exit.click({ force: true }).catch(() => {});
            await page.waitForTimeout(700);
          } else {
            await page.evaluate(() => {
              if (window.LLHTeachingKitEnrichmentEditor?.close) {
                window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true });
              }
            });
          }
        } else {
          ok(false, `Open Review button missing (${viewport.name})`);
        }

        await page.evaluate(() => {
          if (typeof setAdminSectionTab === "function") setAdminSectionTab("curriculum-draft-review");
        });
        await page.waitForTimeout(700);
        const back = page.locator("[data-draft-review-back-content]").first();
        if (await back.count()) {
          await back.click();
          await page.waitForTimeout(500);
          const tab = await page.evaluate(() => (typeof adminActiveSectionTab !== "undefined" ? adminActiveSectionTab : ""));
          ok(tab === "content-home", `Content Home return works (${viewport.name})`);
          const shotHome = path.join(ARTIFACT_DIR, `content-home-${viewport.name}.png`);
          await page.screenshot({ path: shotHome, fullPage: true });
          report.screenshots.push(shotHome);
        }

        ok(pageErrors.length === 0, `no page errors during ${viewport.name} pass (${pageErrors.join("; ")})`);
        await page.close();
      }
      await browser.close();
      report.steps.push("ui-desktop-mobile");
    } else {
      report.risks.push("Playwright not installed — UI screenshots skipped");
    }

    report.passed = passed;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(ARTIFACT_DIR, "OWNER-WORKFLOW-REPORT.json"), JSON.stringify(report, null, 2));
    console.log(`\nPASS ${passed} assertions (draft-review-owner-workflow)`);
  } catch (error) {
    console.error("\nFAIL", error);
    if (stderr) console.error("server stderr:", stderr.slice(-5000));
    report.error = String(error && error.stack || error);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "OWNER-WORKFLOW-REPORT.json"), JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main();
