#!/usr/bin/env node
/**
 * Disposable Owner Admin UI gate: Doctor's Office Dramatic Play
 * → My Community Helper Vest (Replace With New Activity).
 *
 * Local JSON store only. Never publishes. Never touches production.
 * Run: npm run test:teaching-kit-activity-replace-ui
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port");
const { hideCookieConsentChrome, ensureEnrichmentEditorOpen } = require("./test-helpers/tk-enrich-playwright");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(7800, 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-replace-ui-${crypto.randomBytes(4).toString("hex")}.json`);
const OUT = "/opt/cursor/artifacts/screenshots";
const OWNER = {
  email: "leahivie@icloud.com",
  password: "owner-replace-ui-pass",
  code: "owner-replace-ui-code",
};
const FIXTURE = "cur-lp-disp-community-helpers-replace";
const ACT_DOCTOR = "act-doctors-office-disp";
const ACT_SIBLING = "act-helper-hats-disp";
const RES_ID = "cur-res-helper-place-signs-disp";
const SETUP_IMAGE = "https://cdn.example.test/uploaded-setup.jpg";
const SETUP_MEDIA = "media-setup-uploaded-disp";

const DOCTOR_ABSENT = [
  "Doctor kit",
  "stethoscope",
  "bandages",
  "clipboards",
  "dolls",
  "Patients wait with books",
  "Doctors check heartbeat and bandage",
  "Use kind words to comfort patients",
  "Write notes on clipboard",
  "Switch roles",
  "How can the doctor help today?",
  "What does a nurse check?",
  "How do we wait kindly in the waiting room?",
  "Model gentle care language — checkups are not scary play",
  "No Doctor kit",
  "Clipboard + cotton balls + empty bottle labeled PLAY",
  "Uses doctor tools safely",
  "Shows care language",
  "Switches roles",
  "Activity-specific setup for Doctor's Office Dramatic Play",
];

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function vestPaste({ includeLargeGroup = true, includeCleanup = true } = {}) {
  const lines = [
    "Activity name:",
    "My Community Helper Vest",
    "",
    "Weekday:",
    "Mon",
    "",
    "Category / developmental domain:",
    "Creative Arts / Fine Motor",
    "",
    "Recommended age:",
    "Preschool 3–5 years",
    "",
    "Estimated duration:",
    "20–30 minutes",
    "",
    "Activity objective:",
    "Encourage creativity, fine-motor development, self-expression, and understanding of helping roles as children design a unique wearable vest representing how they would like to help their community.",
    "",
    "What children will do:",
    "Children create an open-ended helper vest and decide how their imagined helper contributes to the community.",
    "",
    "Materials:",
    "Paper grocery bags or large heavyweight paper",
    "Washable markers or crayons",
    "Dot markers",
    "Large stickers",
    "Large paper shapes",
    "Painter's tape or masking tape",
    "Glue sticks",
    "Optional blank Helper Badge printable",
    "",
    "Teacher preparation:",
    "Prepare blank vest bases and arrange open-ended art materials without providing a finished model for children to copy.",
    "",
    "Setup:",
    "Place blank vests and art materials at the classroom art table.",
    "",
    "Step-by-step directions:",
    "1. Revisit the class conversation about helping.",
    "2. Invite each child to imagine how they would like to help.",
    "3. Give each child a blank vest.",
    "4. Let children independently choose art materials.",
    "5. Invite children to design the vest in their own way.",
    "6. Talk with children about their choices and ideas.",
    "7. Offer a blank badge if desired.",
    "8. Write dictated words exactly as children say them.",
    "9. Invite children to share or wear their finished vest.",
    "10. Save the vests for dramatic play during the week.",
    "",
    "Suggested questions to ask:",
    "What kind of helper would you like to be?",
    "Who would you like to help?",
    "What could your helper do?",
    "What are you adding to your vest?",
    "Why did you choose that?",
    "What would you call your helper?",
    "",
    "Learning and observation focus:",
    "Notice children's creative choices, fine-motor use of materials, ability to represent ideas, and understanding that children can help others in many ways.",
    "",
    "Safety and supervision:",
    "Use washable, non-toxic, age-appropriate materials. Teachers prepare the paper-bag cuts. Avoid small choking hazards and unsafe cords around the neck.",
    "",
  ];
  if (includeCleanup) {
    lines.push(
      "Cleanup:",
      "Return reusable materials, discard scraps, wipe the table, and store finished vests for dramatic play.",
      "",
    );
  }
  lines.push(
    "Small group:",
    "Two to four children at the vest table.",
    "",
  );
  if (includeLargeGroup) {
    lines.push("Large group:", "Share finished vests at circle.", "");
  }
  lines.push(
    "Indoor:",
    "Set up an open-ended helper design studio in the classroom art area.",
    "",
    "Outdoor:",
    "Offer large paper vest shapes and chunky materials at an outdoor art table.",
    "",
    "Teacher tips:",
    "Do not provide a finished vest for children to copy.",
    "Avoid assigning children a specific occupation.",
    "Write down children's explanations of their designs.",
    "Keep the vests for dramatic play during the week.",
    "",
    "Supply substitutions:",
    "If missing: Paper grocery bags",
    "Use instead: Large cardstock, bulletin-board paper, or kraft paper",
    "",
    "If missing: Stickers or collage pieces",
    "Use instead: Crayons, washable markers, dot markers, torn paper, or painter's tape",
    "",
    "Support adaptations:",
    "Provide chunky tools, large stickers, pre-torn paper, and stabilized work surfaces.",
    "",
    "Added challenge:",
    "Invite children to invent a completely new type of community helper and design a symbol representing that role.",
    "",
    "Mixed-age adaptations:",
    "For younger children, focus on choosing colors, making marks, and naming simple ways to help. For older preschoolers, invite children to invent a helper role, dictate or write its name, and explain the problem that helper solves.",
    "",
    "Observation prompts:",
    "Makes independent choices about art materials",
    "Uses fine-motor skills to draw, stick, press, or attach materials",
    "Creates marks or symbols to represent an idea",
    "Describes a way they can help",
    "Invents or identifies a community helper role",
    "",
    "Vocabulary:",
    "helper",
    "design",
    "create",
    "vest",
    "badge",
    "kindness",
    "care",
    "idea",
    "symbol",
  );
  return lines.join("\n");
}

function doctorItem() {
  return {
    itemId: ACT_DOCTOR,
    id: ACT_DOCTOR,
    activityId: ACT_DOCTOR,
    title: "Doctor's Office Dramatic Play",
    dayOfWeek: "monday",
    activityCategory: "Dramatic Play",
    ageModifications: "Preschool 3–5 years",
    durationMinutes: "20-30 minutes",
    objective: "Children practice caregiver roles in a doctor's office.",
    description: "Children take turns as doctors, nurses, and patients.",
    materials: "Doctor kit\nstethoscope\nbandages\nclipboards\ndolls",
    preparation: "Set out the doctor kit and waiting-room books.",
    setup: "Arrange a waiting room and exam area.",
    steps: "1. Patients wait with books.\n2. Doctors check heartbeat and bandage.\n3. Use kind words to comfort patients.\n4. Write notes on clipboard.\n5. Switch roles.",
    teacherLanguage: "How can the doctor help today?\nWhat does a nurse check?\nHow do we wait kindly in the waiting room?",
    observationOpportunities: "Uses doctor tools safely\nShows care language\nSwitches roles",
    safetyNotes: "Keep small doctor-kit pieces out of mouths.",
    cleanupTips: "Return doctor tools to the kit.",
    teacherTips: ["Model gentle care language — checkups are not scary play."],
    substitutions: [{ need: "Doctor kit", use: "Clipboard + cotton balls + empty bottle labeled PLAY" }],
    observationPrompts: ["Uses doctor tools safely", "Shows care language", "Switches roles"],
    vocabulary: ["helper", "community", "job", "tool"],
    indoorAlternatives: "Keep the doctor's office in the dramatic-play corner.",
    outdoorAlternatives: "Move the clinic to the patio with clipboards.",
    adaptations: "Offer a quieter waiting chair.",
    extensions: "Add a receptionist phone.",
    mixedAgeAdaptations: "Toddlers hold dolls while older children write notes.",
    settingTags: ["indoor", "small_group", "large_group"],
    setupImageUrl: SETUP_IMAGE,
    setupMediaAssetId: SETUP_MEDIA,
    imageRequirement: "setup_only",
    imageBriefSetup: "Activity-specific setup for Doctor's Office Dramatic Play",
    imageRequirementAiSuggestion: "setup_only",
  };
}

function siblingItem() {
  return {
    itemId: ACT_SIBLING,
    id: ACT_SIBLING,
    activityId: ACT_SIBLING,
    title: "Community Helper Hats",
    dayOfWeek: "tuesday",
    activityCategory: "Creative Arts",
    objective: "SIBLING_KEEP_hats_objective",
    description: "SIBLING_KEEP_hats_description",
    materials: "SIBLING_KEEP_paper plates",
    steps: "SIBLING_KEEP_decorate hats",
    teacherTips: ["SIBLING_KEEP_offer two hat shapes"],
  };
}

function filler(day, id, title) {
  return {
    itemId: id,
    title,
    dayOfWeek: day,
    objective: `Filler ${day}`,
    description: `Filler ${day} body`,
    materials: "filler",
    steps: "1. Play",
  };
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

async function waitForHealth(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function planFromStore() {
  return (readStore()?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === FIXTURE) || null;
}

function doctorHaystack(value) {
  return JSON.stringify(value || "").toLowerCase();
}

function assertDoctorAbsent(obj, label) {
  const blob = doctorHaystack(obj);
  DOCTOR_ABSENT.forEach((needle) => {
    ok(!blob.includes(needle.toLowerCase()), `${label} must not contain: ${needle}`);
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const doctor = doctorItem();
  const sibling = siblingItem();
  const storeSeed = {
    users: {},
    adminSessions: {},
    siteContent: {
      updatedAt: "2026-01-03T00:00:00.000Z",
      featureFlags: {
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitEnrichmentEditor: true,
        playBasedCurriculum: true,
      },
      curriculum: {
        updatedAt: "2026-01-03T00:00:00.000Z",
        lessonPlans: [{
          id: FIXTURE,
          title: "Community Helpers",
          age: "Preschool",
          theme: "Community Helpers",
          plan: "Pro",
          status: "published",
          weeklyOverview: "WEEK_KEEP_Community helpers overview",
          objectives: "WEEK_KEEP_Name helpers",
          weeklyMaterials: "WEEK_KEEP_Bags and markers",
          teacherPreparation: "WEEK_KEEP_Stage the clinic",
          familyConnection: "WEEK_KEEP_Ask about helpers at home",
          publishedAt: "2026-01-01T00:00:00.000Z",
          resourceIds: [RES_ID],
          dailyPlans: {
            monday: { items: [doctor] },
            tuesday: { items: [sibling] },
            wednesday: { items: [filler("wednesday", "act-wed-disp", "Wed filler")] },
            thursday: { items: [filler("thursday", "act-thu-disp", "Thu filler")] },
            friday: { items: [filler("friday", "act-fri-disp", "Fri filler")] },
          },
          enrichmentDraft: {
            week: {
              weeklyOverview: "WEEK_KEEP_Community helpers overview",
              objectives: "WEEK_KEEP_Name helpers",
              weeklyMaterials: "WEEK_KEEP_Bags and markers",
              teacherPreparation: "WEEK_KEEP_Stage the clinic",
              familyConnection: "WEEK_KEEP_Ask about helpers at home",
              milestones: ["Fine motor", "Language"],
              printableIds: [RES_ID],
              teacherToolkit: {
                prepChecklist: ["WEEK_KEEP_Print helper cards"],
                observationFocus: ["WEEK_KEEP_Helper language"],
                notes: "",
                teacherPreparation: "WEEK_KEEP_Stage the clinic",
              },
            },
            activities: {
              [ACT_DOCTOR]: {
                id: ACT_DOCTOR,
                itemId: ACT_DOCTOR,
                title: doctor.title,
                materials: doctor.materials,
                steps: doctor.steps,
                teacherLanguage: doctor.teacherLanguage,
                teacherTips: doctor.teacherTips.slice(),
                substitutions: doctor.substitutions.map((s) => ({ ...s })),
                observationPrompts: doctor.observationPrompts.slice(),
                observationOpportunities: doctor.observationOpportunities,
                vocabulary: doctor.vocabulary.slice(),
                indoorAlternatives: doctor.indoorAlternatives,
                outdoorAlternatives: doctor.outdoorAlternatives,
                adaptations: doctor.adaptations,
                extensions: doctor.extensions,
                mixedAgeAdaptations: doctor.mixedAgeAdaptations,
                settingTags: doctor.settingTags.slice(),
                imageBriefSetup: doctor.imageBriefSetup,
                setupImageUrl: SETUP_IMAGE,
                setupMediaAssetId: SETUP_MEDIA,
                imageRequirement: "setup_only",
                imageRequirementAiSuggestion: "setup_only",
              },
              [ACT_SIBLING]: {
                title: sibling.title,
                materials: sibling.materials,
                steps: sibling.steps,
                teacherTips: sibling.teacherTips.slice(),
                objective: sibling.objective,
              },
            },
          },
        }],
        activities: [],
        resources: [{
          id: RES_ID,
          title: "Helper Place Signs",
          type: "printable",
          status: "published",
          lessonPlanIds: [FIXTURE],
        }],
      },
    },
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(storeSeed, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      NODE_ENV: "test",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  let publishClicked = false;
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: OWNER.email,
      password: OWNER.password,
      code: OWNER.code,
    });
    ok(login.status === 200 && login.json?.token, "owner login against disposable store");
    const token = login.json.token;

    const beforePlan = planFromStore();
    const weekBefore = JSON.stringify(beforePlan.enrichmentDraft.week);
    const siblingBefore = JSON.stringify(beforePlan.enrichmentDraft.activities[ACT_SIBLING]);
    const resourceIdsBefore = JSON.stringify(beforePlan.resourceIds);
    const publishedDoctorTitle = beforePlan.dailyPlans.monday.items[0].title;
    const publishedDoctorMaterials = beforePlan.dailyPlans.monday.items[0].materials;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("dialog", async (dialog) => {
      const message = dialog.message() || "";
      if (/publish/i.test(message)) {
        publishClicked = true;
        await dialog.dismiss();
        return;
      }
      try { await dialog.accept(); } catch { /* ignore */ }
    });

    await page.goto(`http://127.0.0.1:${PORT}/?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof setAdminSession === "function" && typeof openOwnerTeachingKitEditor === "function",
      null,
      { timeout: 30000 },
    );
    await hideCookieConsentChrome(page);
    await page.evaluate(({ owner, ownerToken }) => {
      setAdminSession({
        email: owner.email,
        name: "Owner",
        token: ownerToken,
        mode: "server",
        trustedDevice: true,
      });
      localStorage.setItem("llhAdminPreviewMode", "Admin");
      localStorage.setItem("llhAdminActiveSection", "curriculum-lesson-plans");
    }, { owner: OWNER, ownerToken: token });
    await page.evaluate(async () => {
      if (typeof setView === "function") setView("admin");
      if (typeof loadAdminSiteContent === "function") await loadAdminSiteContent();
    });
    await page.evaluate(async (id) => {
      await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
    }, FIXTURE);
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 20000 });
    await ensureEnrichmentEditorOpen(page);

    async function clickActivity(itemId) {
      await page.evaluate(({ fixtureId, id }) => {
        const planObj = curriculumLessonPlanById(fixtureId);
        const acts = window.LLHTeachingKitEnrichment.flattenLessonActivities(planObj, [], planObj?.enrichmentDraft) || [];
        const idx = acts.findIndex((a) => String(a.itemId || a.id || a.activityId) === id);
        document.querySelector(`[data-activity-index="${idx}"]`)?.click();
      }, { fixtureId: FIXTURE, id: itemId });
    }
    async function openPaste() {
      await page.click("[data-paste-activity-update]");
      await page.waitForSelector("[data-paste-import-modal]", { timeout: 10000 });
    }
    async function cancelPaste() {
      const modal = page.locator("[data-paste-import-modal]");
      if (await modal.count()) {
        await page.locator(".tk-enrich-modal-actions [data-paste-import-cancel]").click({ timeout: 8000 });
        await page.waitForSelector("[data-paste-import-modal]", { state: "detached", timeout: 8000 }).catch(() => {});
      }
    }
    async function selectReplaceMode() {
      await page.check('[data-paste-import-mode="replace"]');
      await page.waitForFunction(() => {
        const btn = document.querySelector("[data-paste-import-parse]");
        return /Preview Replacement/i.test(btn?.textContent || "");
      }, null, { timeout: 8000 });
    }
    async function previewPaste(text) {
      await page.fill("[data-paste-import-text]", text);
      await page.click("[data-paste-import-parse]");
      await page.waitForSelector(".tk-paste-replace-hero, .tk-paste-preview-list", { timeout: 10000 });
    }
    async function applyReplace() {
      const disabled = await page.locator("[data-paste-import-replace-apply]").isDisabled();
      ok(disabled, "REPLACE ACTIVITY disabled before confirmation");
      await page.check("[data-paste-replace-confirm]");
      await page.waitForFunction(() => {
        const btn = document.querySelector("[data-paste-import-replace-apply]");
        return btn && !btn.disabled;
      }, null, { timeout: 8000 });
      await page.click("[data-paste-import-replace-apply]");
      await page.waitForSelector("[data-paste-import-modal]", { state: "detached", timeout: 10000 });
    }
    async function titles() {
      return page.evaluate(() => ({
        sidebar: document.querySelector(".tk-enrich-queue-item.is-active strong")?.textContent?.trim() || "",
        header: document.querySelector("[data-enrich-title]")?.textContent?.trim() || "",
        field: document.querySelector('[data-core-field="title"]')?.value || "",
        completion: document.querySelector("[data-core-completion]")?.textContent || "",
      }));
    }
    async function draftAct(key) {
      return page.evaluate((k) => {
        const draft = window.LLHTeachingKitEnrichmentEditor.getDraft();
        return draft?.activities?.[k] || null;
      }, key);
    }

    await clickActivity(ACT_DOCTOR);
    await page.waitForFunction(() => {
      const title = document.querySelector("[data-enrich-title]")?.textContent || "";
      return /Doctor's Office Dramatic Play/i.test(title);
    }, null, { timeout: 10000 });
    const liveStart = await page.evaluate(() => {
      const draft = window.LLHTeachingKitEnrichmentEditor.getDraft();
      return {
        week: JSON.stringify(draft.week || {}),
        sibling: JSON.stringify(draft.activities?.["act-helper-hats-disp"] || {}),
      };
    });

    await openPaste();
    const modes = await page.evaluate(() => {
      const update = document.querySelector('[data-paste-import-mode="update"]');
      const replace = document.querySelector('[data-paste-import-mode="replace"]');
      return {
        hasUpdate: Boolean(update),
        hasReplace: Boolean(replace),
        updateChecked: Boolean(update?.checked),
        replaceChecked: Boolean(replace?.checked),
        updateLabel: document.querySelector('[data-paste-import-mode="update"]')?.closest("label")?.innerText || "",
        replaceLabel: document.querySelector('[data-paste-import-mode="replace"]')?.closest("label")?.innerText || "",
      };
    });
    ok(modes.hasUpdate && modes.hasReplace, "Paste modal shows Update and Replace modes");
    ok(modes.updateChecked && !modes.replaceChecked, "Update Existing Activity is the default");
    ok(/Fill blank fields/i.test(modes.updateLabel), "Update mode description is clear");
    ok(/Replace the current activity/i.test(modes.replaceLabel), "Replace mode description is clear");
    await page.screenshot({ path: path.join(OUT, "replace-ui-modes.png") });

    await page.fill("[data-paste-import-text]", "Teacher tips:\nA merge-only extra tip\n");
    await page.click("[data-paste-import-parse]");
    await page.waitForSelector("[data-paste-select]", { timeout: 8000 });
    ok(true, "Update mode still shows per-field select checkboxes");
    await cancelPaste();
    const afterUpdateCancel = await draftAct(ACT_DOCTOR);
    ok(/Doctor kit/i.test(afterUpdateCancel.materials), "Update preview/cancel left Doctor draft unchanged");

    await openPaste();
    await selectReplaceMode();
    await previewPaste(vestPaste({ includeLargeGroup: false, includeCleanup: true }));
    const omitPreview = await page.evaluate(() => {
      const modal = document.querySelector("[data-paste-import-modal]");
      const text = modal?.innerText || "";
      return {
        text,
        perField: modal.querySelectorAll("[data-paste-select]").length,
        confirms: modal.querySelectorAll("[data-paste-replace-confirm]").length,
        applyDisabled: Boolean(modal.querySelector("[data-paste-import-replace-apply]")?.disabled),
      };
    });
    ok(/CURRENT ACTIVITY/i.test(omitPreview.text) && /Doctor's Office Dramatic Play/i.test(omitPreview.text), "Preview shows current Doctor title");
    ok(/WILL BECOME/i.test(omitPreview.text) && /My Community Helper Vest/i.test(omitPreview.text), "Preview shows new Vest title");
    ok(/MISSING FROM NEW ACTIVITY/i.test(omitPreview.text), "Preview has missing section");
    ok(/Large group/i.test(omitPreview.text) && /blank after replacement/i.test(omitPreview.text), "Omitted Large group will become blank");
    ok(!/retain|keep the old|merge with old/i.test(omitPreview.text), "Omitted field does not propose retaining old value");
    ok(omitPreview.perField === 0, "Replace preview has no per-field replace checkboxes");
    ok(omitPreview.confirms === 1, "Replace preview has exactly one confirmation checkbox");
    ok(omitPreview.applyDisabled, "REPLACE ACTIVITY disabled before the one confirmation");
    ok(/Activity-specific setup for Doctor's Office Dramatic Play/i.test(omitPreview.text), "Stale Doctor image brief is shown as cleared/stale");
    ok(/EXISTING IMAGE MAY NO LONGER MATCH/i.test(omitPreview.text), "Preview warns existing image may no longer match");
    ok(/PROTECTED LINKED RESOURCES/i.test(omitPreview.text), "Preview shows protected linked resources");
    await cancelPaste();
    const afterOmitCancel = await draftAct(ACT_DOCTOR);
    ok(afterOmitCancel.title === "Doctor's Office Dramatic Play", "Cancel omitted-field preview made zero changes");
    ok(/Doctor kit/i.test(afterOmitCancel.materials), "Cancel left Doctor materials intact");

    await openPaste();
    await selectReplaceMode();
    await previewPaste(vestPaste());
    await page.screenshot({ path: path.join(OUT, "replace-ui-preview.png") });
    await clickActivity(ACT_SIBLING);
    await page.waitForTimeout(300);
    const stale = await page.evaluate(() => ({
      modal: Boolean(document.querySelector("[data-paste-import-modal]")),
      apply: Boolean(document.querySelector("[data-paste-import-replace-apply]")),
      header: document.querySelector("[data-enrich-title]")?.textContent || "",
      siblingDraft: window.LLHTeachingKitEnrichmentEditor.getDraft()?.activities?.["act-helper-hats-disp"] || null,
    }));
    ok(!stale.modal && !stale.apply, "Switching activities invalidates/closes the replacement preview");
    ok(/Community Helper Hats/i.test(stale.header), "Editor is now on sibling activity");
    ok(stale.siblingDraft?.title === "Community Helper Hats", "No Vest content landed on Activity B");
    ok(/SIBLING_KEEP_paper plates/.test(stale.siblingDraft?.materials || ""), "Sibling materials unchanged after stale preview");

    await clickActivity(ACT_DOCTOR);
    await page.waitForFunction(() => /Doctor's Office Dramatic Play/i.test(document.querySelector("[data-enrich-title]")?.textContent || ""));

    await openPaste();
    await selectReplaceMode();
    await previewPaste(vestPaste({ includeCleanup: false }));
    const missingRequired = await page.evaluate(() => document.querySelector("[data-paste-import-modal]")?.innerText || "");
    ok(/MISSING FROM NEW ACTIVITY/i.test(missingRequired) && /Cleanup/i.test(missingRequired), "Missing required Cleanup listed before apply");
    await applyReplace();
    const incompleteUi = await titles();
    ok(/Cleanup/i.test(incompleteUi.completion), "Completion/Missing lists required Cleanup from new draft");
    ok(!/100%/.test(incompleteUi.completion) || /Missing:.*Cleanup/i.test(incompleteUi.completion), "Hidden Doctor data does not keep Completion at 100%");

    await openPaste();
    await selectReplaceMode();
    await previewPaste(vestPaste());
    const fullPreview = await page.evaluate(() => {
      const modal = document.querySelector("[data-paste-import-modal]");
      const text = modal?.innerText || "";
      return {
        text,
        perField: modal.querySelectorAll("[data-paste-select]").length,
        confirms: modal.querySelectorAll("[data-paste-replace-confirm]").length,
        confirmLabel: modal.querySelector("[data-paste-replace-confirm]")?.closest("label")?.innerText || "",
      };
    });
    ok(fullPreview.perField === 0, "Complete Replace preview has no per-field checkboxes");
    ok(fullPreview.confirms === 1, "Complete Replace preview has one confirmation");
    ok(/I understand this will replace the current draft activity content/i.test(fullPreview.confirmLabel), "Confirmation copy matches owner requirement");
    ok(/PROTECTED LINKED RESOURCES/i.test(fullPreview.text), "Complete preview still lists protected linked resources");
    ok(/Helper Place Signs|cur-res-helper-place-signs/i.test(fullPreview.text), "Linked resource relationship is listed as protected");
    ok(/EXISTING IMAGE MAY NO LONGER MATCH/i.test(fullPreview.text), "Complete preview still warns existing image may no longer match");
    ok(/Paper grocery bags/i.test(fullPreview.text), "Preview recognizes new vest materials");
    ok(/Makes independent choices about art materials/i.test(fullPreview.text), "Preview recognizes new observations");
    await applyReplace();

    const after = await titles();
    ok(after.sidebar === "My Community Helper Vest", "Sidebar updates immediately to Vest");
    ok(after.header === "My Community Helper Vest", "Editor header updates immediately to Vest");
    ok(after.field === "My Community Helper Vest", "Activity name field updates immediately to Vest");
    await page.screenshot({ path: path.join(OUT, "replace-ui-after-apply.png") });

    const replaced = await draftAct(ACT_DOCTOR);
    ok(replaced.id === ACT_DOCTOR || replaced.itemId === ACT_DOCTOR, "Stable activity ID preserved");
    const keys = await page.evaluate(() => Object.keys(window.LLHTeachingKitEnrichmentEditor.getDraft().activities || {}));
    ok(keys.includes(ACT_DOCTOR) && keys.includes(ACT_SIBLING) && keys.length >= 2, "No duplicate activity created");
    ok(replaced.title === "My Community Helper Vest", "Draft title is Vest");
    ok(/Paper grocery bags/i.test(replaced.materials), "New vest materials present");
    ok(/Give each child a blank vest/i.test(replaced.steps), "New vest steps present");
    ok(/What kind of helper would you like to be/i.test(replaced.teacherLanguage), "New vest questions present");
    ok(replaced.teacherTips?.length === 4, "Teacher tips are 4 separate items");
    ok(replaced.substitutions?.length === 2, "Substitutions are 2 separate items");
    ok(replaced.observationPrompts?.length === 5, "Observation prompts are 5 separate chips");
    ok(replaced.vocabulary?.length === 9, "Vocabulary is 9 separate chips");
    ok(replaced.setupImageUrl === SETUP_IMAGE, "Uploaded setup image URL preserved");
    ok(replaced.setupMediaAssetId === SETUP_MEDIA, "Uploaded media asset id preserved");
    ok(replaced.imageRequirement === "setup_only", "Owner imageRequirement unchanged");
    ok(!replaced.imageBriefSetup, "Doctor image brief cleared");
    assertDoctorAbsent(replaced, "in-memory draft activity");

    await page.evaluate(() => {
      ["core", "teaching", "safety", "enrichment"].forEach((id) => {
        const el = document.querySelector(`[data-core-section="${id}"]`);
        if (el) el.open = true;
      });
    });
    const rendered = await page.evaluate(() => ({
      materials: document.querySelector('[data-core-field="materials"]')?.value || "",
      steps: document.querySelector('[data-core-field="steps"]')?.value || "",
      questions: document.querySelector('[data-core-field="teacherLanguage"]')?.value || "",
      tips: [...document.querySelectorAll('[data-import-field="teacherTips"] .tk-enrich-tip-card span')].map((n) => n.textContent.trim()),
      obs: [...document.querySelectorAll('[data-import-field="observationPrompts"] .tk-enrich-tip-card span')].map((n) => n.textContent.trim()),
      vocab: [...document.querySelectorAll('[data-import-field="vocabulary"] .tk-enrich-vocab-chip')].map((n) => n.innerText.replace("×", "").trim()),
      body: document.querySelector(".tk-enrich-stage")?.innerText || "",
    }));
    assertDoctorAbsent({ ...rendered, body: rendered.body.replace(/Doctor's Office Dramatic Play/g, "") }, "rendered editor");
    ok(rendered.tips.length === 4 && rendered.tips.every((t) => t), "Rendered tips are separate, not one giant string");
    ok(rendered.obs.length === 5, "Rendered observations are separate chips");
    ok(rendered.vocab.length === 9, "Rendered vocabulary chips match paste");
    ok(!rendered.vocab.includes("tool") && !rendered.vocab.includes("job"), "Old doctor-only vocabulary chips are gone");
    ok(new Set(rendered.tips).size === rendered.tips.length, "No duplicate tip chips");

    const isolation = await page.evaluate(() => {
      const draft = window.LLHTeachingKitEnrichmentEditor.getDraft();
      return {
        week: draft.week,
        sibling: draft.activities["act-helper-hats-disp"],
        count: Object.keys(draft.activities || {}).length,
      };
    });
    ok(JSON.stringify(isolation.week) === liveStart.week, "Week draft snapshot unchanged");
    ok(JSON.stringify(isolation.sibling) === liveStart.sibling, "Other activity draft unchanged");

    const storeMid = planFromStore();
    ok(storeMid.dailyPlans.monday.items[0].title === publishedDoctorTitle, "Published/customer Doctor title unchanged before Save Draft");
    ok(storeMid.dailyPlans.monday.items[0].materials === publishedDoctorMaterials, "Published Doctor materials unchanged before Save Draft");
    ok(JSON.stringify(storeMid.resourceIds) === resourceIdsBefore, "Lesson resource IDs unchanged");

    await page.click("[data-enrich-save-draft]");
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-enrich-status")?.textContent || "";
      return /Draft saved|saved/i.test(text) && !/failed/i.test(text);
    }, null, { timeout: 20000 });

    await page.evaluate(async () => {
      await window.LLHTeachingKitEnrichmentEditor.close({ force: true, abandonUnsaved: true, skipReturnNavigation: true });
    });
    await page.evaluate(async (id) => {
      await window.openOwnerTeachingKitEditor(id, { source: "edit", ownerWorkspace: true });
    }, FIXTURE);
    await page.waitForFunction(() => window.LLHTeachingKitEnrichmentEditor?.isOpen?.() === true, null, { timeout: 20000 });
    await clickActivity(ACT_DOCTOR);
    await page.waitForFunction(() => /My Community Helper Vest/i.test(document.querySelector("[data-enrich-title]")?.textContent || ""), null, { timeout: 10000 });
    const reloaded = await titles();
    ok(reloaded.sidebar === "My Community Helper Vest", "After reload, sidebar still says Vest");
    ok(reloaded.header === "My Community Helper Vest", "After reload, editor still says Vest");
    const reloadedDraft = await draftAct(ACT_DOCTOR);
    assertDoctorAbsent(reloadedDraft, "reloaded draft activity");
    ok(reloadedDraft.teacherTips?.length === 4, "Reload keeps vest tips as owned arrays");
    ok(reloadedDraft.setupImageUrl === SETUP_IMAGE, "Reload keeps uploaded image");
    ok(reloadedDraft.imageRequirement === "setup_only", "Reload keeps image requirement");
    await page.screenshot({ path: path.join(OUT, "replace-ui-after-reload.png") });

    const afterStore = planFromStore();
    ok(afterStore.status === "published", "Save Draft did not publish");
    ok(afterStore.dailyPlans.monday.items[0].title === "Doctor's Office Dramatic Play", "Customer/published activity still Doctor's Office");
    ok(/Doctor kit/i.test(afterStore.dailyPlans.monday.items[0].materials), "Customer still has Doctor materials");
    ok(afterStore.enrichmentDraft.activities[ACT_DOCTOR].title === "My Community Helper Vest", "Owner draft overlay is Vest");
    ok(JSON.stringify(afterStore.resourceIds) === resourceIdsBefore, "Linked resource IDs remain after Save Draft");
    ok(JSON.stringify(afterStore.enrichmentDraft.week) === weekBefore, "Week unchanged after Save Draft");
    ok(!publishClicked, "Publish was not clicked");
    const publishOpen = await page.evaluate(() => Boolean(document.querySelector("[data-publish-modal]")));
    ok(!publishOpen, "Publish modal is not open");

    console.log(`OK teaching-kit-activity-replace-ui (${passed} assertions)`);
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
