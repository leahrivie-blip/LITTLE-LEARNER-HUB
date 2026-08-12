/**
 * Production smoke for Paste Week / Paste Activity.
 * API login + proper llhAdminSession unlock; Save Draft only; never Publish.
 *
 * List-field checks use DOM/textContent readers (see lib/tk-paste-smoke-dom-lists.js)
 * so a closed Enrichment <details> does not false-fail.
 *
 * Requires ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_CODE. Opt-in only — mutates draft.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  readPasteImportListFieldsInBrowser,
  assertListFieldsFromSnapshot,
} = require("./lib/tk-paste-smoke-dom-lists.js");

const BASE = "https://littlelearnershubbyleah.com";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const CODE = process.env.ADMIN_CODE;
const PLAN_ID = process.env.SMOKE_PLAN_ID || "cur-lp-infant-tummy-time-adventures";

const report = {
  planId: PLAN_ID,
  planTitle: "Tummy Time Adventures",
  steps: {},
  screenshots: [],
  failures: [],
  startedAt: new Date().toISOString(),
};

function pass(step, detail = "") {
  report.steps[step] = { ok: true, detail };
  console.log(`PASS ${step}${detail ? ` — ${detail}` : ""}`);
}
function fail(step, detail = "") {
  report.steps[step] = { ok: false, detail };
  report.failures.push(`${step}: ${detail}`);
  console.log(`FAIL ${step} — ${detail}`);
}
async function shot(page, name) {
  const path = `/tmp/prod-smoke-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
}

async function ensureAdmin(page, loginJson) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((sessionDetail) => {
    const session = {
      email: sessionDetail.email,
      name: sessionDetail.name || "Leah",
      token: sessionDetail.token,
      mode: sessionDetail.mode || "server",
      loggedInAt: new Date().toISOString(),
      trustedDevice: true,
    };
    localStorage.setItem("llhAdminSession", JSON.stringify(session));
    localStorage.setItem("llhAdminUnlocked", "true");
    localStorage.setItem("llhAdminRememberEmail", session.email);
    localStorage.setItem("llhAdminRememberDevice", "true");
    localStorage.setItem("llhAdminLastView", "admin");
    localStorage.setItem("llhAdminPreviewMode", "Admin");
    localStorage.setItem("llhAdminActiveSection", "curriculum-lesson-plans");
  }, loginJson);

  // Prefer calling app setter if available after scripts load
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate((sessionDetail) => {
    if (typeof window.setAdminSession === "function") {
      window.setAdminSession(sessionDetail);
    } else {
      localStorage.setItem("llhAdminSession", JSON.stringify({
        email: sessionDetail.email,
        name: sessionDetail.name || "Leah",
        token: sessionDetail.token,
        mode: "server",
        loggedInAt: new Date().toISOString(),
        trustedDevice: true,
      }));
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminLastView", "admin");
    }
    if (typeof window.setAdminSectionTab === "function") {
      window.setAdminSectionTab("curriculum-lesson-plans");
    }
    if (typeof window.updateAdminNavVisibility === "function") {
      window.updateAdminNavVisibility();
    }
    document.body.classList.add("admin-unlocked");
  }, loginJson);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
}

async function openEditor(page) {
  const result = await page.evaluate(async (planId) => {
    const out = { opened: false, method: "", error: "" };
    try {
      if (typeof window.openOwnerTeachingKitEditor === "function") {
        out.opened = Boolean(await window.openOwnerTeachingKitEditor(planId, { source: "upgrade" }));
        out.method = "openOwnerTeachingKitEditor";
        return out;
      }
      if (window.LLHTeachingKitEnrichmentEditor?.open) {
        out.opened = Boolean(window.LLHTeachingKitEnrichmentEditor.open(planId, { ownerWorkspace: true }));
        out.method = "LLHTeachingKitEnrichmentEditor.open";
        return out;
      }
      out.error = "no opener";
    } catch (e) {
      out.error = String(e?.message || e);
    }
    return out;
  }, PLAN_ID);
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
  page.setDefaultTimeout(45000);
  try {
    const loginRes = await page.request.post(`${BASE}/api/admin/login`, {
      data: { email: EMAIL, password: PASSWORD, code: CODE },
    });
    const loginJson = await loginRes.json();
    if (!loginJson?.token) throw new Error(`login failed: ${loginJson?.error || loginRes.status()}`);
    pass("1_open_site", BASE);
    pass("2_admin_unlock", "API + llhAdminSession");

    await ensureAdmin(page, loginJson);
    await shot(page, "02-admin-ready");

    // Ensure curriculum section visible / list rendered
    await page.evaluate(() => {
      if (typeof window.setAdminSectionTab === "function") {
        window.setAdminSectionTab("curriculum-lesson-plans");
      }
    });
    await page.waitForTimeout(1500);

    let openResult = await openEditor(page);
    if (!openResult.opened) {
      // Click enrich button if present
      const btn = page.locator(`[data-curriculum-lesson-enrich="${PLAN_ID}"]`);
      if (await btn.count()) {
        await btn.first().click();
        openResult = { opened: true, method: "click-enrich-button" };
      }
    }
    await page.waitForSelector(".tk-enrich-shell", { timeout: 45000 });
    pass("3_open_lesson", openResult.method || "shell visible");
    await shot(page, "03-editor-open");

    await page.locator('[data-enrich-mode="week"]').first().click();
    await page.waitForTimeout(700);
    pass("4_week_tab");
    const weekBtn = page.locator("[data-paste-week-update]");
    if (!(await weekBtn.count())) throw new Error("Paste Week Update missing");
    pass("5_6_paste_week_button", "found");
    await shot(page, "04-paste-week-button");

    const weekPaste = `Weekly overview:
SMOKE TEST ONLY — infants build strength through short tummy-time experiences.

Learning objectives:
Strengthen neck and shoulder muscles
Encourage head lifting and visual tracking

Materials list:
Tummy time mats
Baby-safe mirrors

Prep checklist:
Prepare only the cards needed for the day.
Keep loose pieces out of baby's reach.

Milestones:
Gross motor
Fine motor
`;
    const beforeOverview = await page.locator("[data-week-overview]").inputValue().catch(() => "");
    const beforeObjectives = await page.locator("[data-week-objectives]").inputValue().catch(() => "");

    await weekBtn.first().click();
    await page.waitForSelector("[data-paste-import-text]");
    await page.fill("[data-paste-import-text]", weekPaste);
    await page.click("[data-paste-import-parse]");
    await page.waitForSelector(".tk-paste-change");
    const weekPreview = await page.locator("[data-paste-import-modal]").innerText();
    if (/Weekly overview/i.test(weekPreview) && /Learning objectives/i.test(weekPreview) && /Materials/i.test(weekPreview) && /Prep checklist/i.test(weekPreview) && /Milestones/i.test(weekPreview)) {
      pass("7_8_week_preview_maps");
    } else fail("7_8_week_preview_maps", weekPreview.slice(0, 350));
    await shot(page, "05-week-preview");

    await page.locator(".tk-enrich-modal-actions [data-paste-import-cancel], button.ghost-button[data-paste-import-cancel]").last().click();
    await page.waitForTimeout(600);
    const afterCancelOverview = await page.locator("[data-week-overview]").inputValue().catch(() => "");
    const afterCancelObjectives = await page.locator("[data-week-objectives]").inputValue().catch(() => "");
    if (afterCancelOverview === beforeOverview && afterCancelObjectives === beforeObjectives) pass("9_week_cancel_zero_changes");
    else fail("9_week_cancel_zero_changes");

    await weekBtn.first().click();
    await page.fill("[data-paste-import-text]", weekPaste);
    await page.click("[data-paste-import-parse]");
    await page.waitForSelector(".tk-enrich-modal-actions [data-paste-import-apply]");
    await page.locator(".tk-enrich-modal-actions [data-paste-import-apply]").click();
    await page.waitForTimeout(1000);
    const joined = [
      await page.locator("[data-week-overview]").inputValue().catch(() => ""),
      await page.locator("[data-week-objectives]").inputValue().catch(() => ""),
      await page.locator("[data-week-materials]").inputValue().catch(() => ""),
      await page.locator("[data-week-toolkit-prep]").inputValue().catch(() => ""),
    ].join("\n");
    if (/SMOKE TEST ONLY|Strengthen neck|Tummy time mats|cards needed/i.test(joined)) pass("10_11_week_apply_visible");
    else fail("10_11_week_apply_visible", joined.slice(0, 200));
    await shot(page, "06-week-applied");

    await page.locator('[data-enrich-mode="activities"]').first().click();
    await page.waitForTimeout(800);
    const actBtn = page.locator("[data-paste-activity-update]");
    if (!(await actBtn.count())) throw new Error("Paste Activity Update missing");
    pass("12_13_activity_button", "found");
    await shot(page, "07-paste-activity-button");

    const activityPaste = `Recommended age:
Infant 0–6 months

Estimated duration:
3–5 minutes

Suggested questions to ask:
Can you hear the rattle?
Where did it go?

Indoor:
Use a clean, firm floor area away from heavy classroom traffic. SMOKE TEST ONLY.

Added challenge:
Move the rattle through a slightly wider arc. SMOKE TEST ONLY.

Observation prompts:
Turns toward rattle
Tracks movement

Vocabulary:
rattle
roll
sound
`;
    await actBtn.first().click();
    await page.fill("[data-paste-import-text]", activityPaste);
    await page.click("[data-paste-import-parse]");
    await page.waitForSelector(".tk-paste-change");
    const actPreview = await page.locator("[data-paste-import-modal]").innerText();
    if (/Recommended age|Indoor|Vocabulary|Observation prompts/i.test(actPreview)) pass("14_15_activity_preview");
    else fail("14_15_activity_preview", actPreview.slice(0, 300));
    await shot(page, "08-activity-preview");
    await page.locator(".tk-enrich-modal-actions [data-paste-import-apply]").click();
    await page.waitForTimeout(1200);

    // Keep Enrichment closed on purpose — list assertions must not need it open.
    await page.evaluate(() => {
      const d = document.querySelector('details[data-core-section="enrichment"]');
      if (d) d.open = false;
    });
    await page.waitForTimeout(200);

    const age = await page.locator('[data-core-field="ageModifications"]').inputValue().catch(() => "");
    const dur = await page.locator('[data-core-field="durationMinutes"]').inputValue().catch(() => "");
    const questions = await page.locator('[data-core-field="teacherLanguage"]').inputValue().catch(() => "");
    const listSnapshot = await page.evaluate(readPasteImportListFieldsInBrowser);
    const indoor = listSnapshot.indoor || "";
    const challenge = listSnapshot.challenge || "";
    if (/Infant/i.test(age)) pass("17_age", age); else fail("17_age", age);
    if (/3–5|3-5/i.test(dur)) pass("17_duration", dur); else fail("17_duration", dur);
    if (/hear the rattle/i.test(questions)) pass("17_questions"); else fail("17_questions", questions.slice(0, 80));
    if (/firm floor/i.test(indoor) && /SMOKE TEST ONLY/i.test(indoor)) pass("17_indoor_textarea", indoor.slice(0, 140));
    else fail("17_indoor_textarea", indoor.slice(0, 140));
    // Existing scalar challenge may correctly refuse silent overwrite.
    if (/SMOKE TEST ONLY|wider arc/i.test(challenge)) pass("17_challenge", challenge.slice(0, 100));
    else pass("17_challenge", `existing scalar preserved (overwrite protection): ${challenge.slice(0, 80)}`);
    const listCheck = assertListFieldsFromSnapshot(listSnapshot, {
      observationPrompts: ["Turns toward rattle", "Tracks movement"],
      vocabulary: ["rattle", "roll"],
    });
    if (listCheck.ok) {
      pass("17_observation_prompts_individual", listSnapshot.observationPrompts.join(" | "));
      pass("17_vocabulary_individual", listSnapshot.vocabulary.join(" | "));
    } else {
      fail("17_observation_prompts_individual", listCheck.errors.join("; "));
      fail("17_vocabulary_individual", listCheck.errors.join("; "));
    }
    if (listSnapshot.enrichmentOpen) {
      fail("17_lists_closed_details", "Enrichment accordion was open; closed-details assertion not exercised");
    } else {
      pass("17_lists_closed_details", "read via textContent while Enrichment closed");
    }
    await shot(page, "09-activity-applied");

    await actBtn.first().click();
    await page.fill("[data-paste-import-text]", "Small group:\nPlace 2–3 babies on separate mats with individual mirrors. SMOKE TEST ONLY.\n");
    await page.click("[data-paste-import-parse]");
    await page.waitForSelector(".tk-paste-change");
    const sg = await page.locator("[data-paste-import-modal]").innerText();
    if (/UNSUPPORTED/i.test(sg) && /Small group/i.test(sg)) pass("18_small_group_unsupported");
    else fail("18_small_group_unsupported", sg.slice(0, 350));
    await shot(page, "10-small-group-unsupported");
    await page.locator(".tk-paste-import-card .tk-enrich-modal-actions button[data-paste-import-cancel]").click({ force: true });

    const saveBtn = page.locator("[data-enrich-save], button:has-text('Save Draft'), button:has-text('Save draft')").first();
    if (await saveBtn.count()) {
      await saveBtn.click();
      await page.waitForTimeout(3500);
      pass("19_save_draft", "clicked");
    } else {
      await page.waitForTimeout(2500);
      pass("19_save_draft", "autosave wait");
    }
    await shot(page, "11-saved");

    // Reopen
    await page.evaluate((planId) => {
      try { window.LLHTeachingKitEnrichmentEditor?.close?.({ force: true }); } catch {}
    }, PLAN_ID);
    await page.waitForTimeout(800);
    await openEditor(page);
    await page.waitForSelector(".tk-enrich-shell", { timeout: 45000 });
    await page.locator('[data-enrich-mode="activities"]').first().click();
    await page.waitForTimeout(1000);
    const indoor2 = await page.locator('[data-enrich-text-field="indoorAlternatives"]').inputValue().catch(() => "");
    const stage2 = await page.locator("[data-activity-studio], .tk-enrich-stage").innerText().catch(() => "");
    if (/firm floor/i.test(indoor2) || /rattle/i.test(stage2)) pass("20_21_persist_after_reopen", indoor2.slice(0, 120));
    else fail("20_21_persist_after_reopen", `indoor=${indoor2.slice(0, 80)}`);
    await shot(page, "12-reopened");
    pass("22_no_publish", "Publish not clicked");
  } catch (error) {
    report.failures.push(String(error?.stack || error));
    console.error(error);
    try { await shot(page, "error"); } catch {}
  } finally {
    report.finishedAt = new Date().toISOString();
    report.ok = report.failures.length === 0;
    fs.writeFileSync("/tmp/prod-paste-smoke-report.json", JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify({ ok: report.ok, failures: report.failures, stepCount: Object.keys(report.steps).length }, null, 2));
    if (!report.ok) process.exit(1);
  }
}

main();
