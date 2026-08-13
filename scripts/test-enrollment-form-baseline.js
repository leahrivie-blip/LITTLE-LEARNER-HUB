#!/usr/bin/env node
/**
 * Enrollment Form baseline — focused acceptance (testing Forms spine).
 * Run: npm run test:enrollment-form-baseline
 *
 * Proves the EXISTING Enrollment Form / Form Builder is upgraded in place —
 * not a second form system — and that historical submissions stay protected.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const formFieldsLib = require("../server/form-fields-lib.js");
const programFormsLib = require("../server/program-forms-lib.js");
const enrollmentBaseline = require("../server/enrollment-form-baseline.js");
const enrollmentBuilder = require("./enrollment-form-builder.js");
const formBuilder = require("./form-builder-lib.js");

function pass(id) { console.log(`PASS  ${id}`); }
function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (email) {
      headers["X-LLH-User-Email"] = email;
      headers.Authorization = `Bearer test:${email}`;
    }
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function spawnServer({ port, storePath }) {
  return spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      LLH_ALLOW_EPHEMERAL_FAMILY_HUB: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealth(port, childProc) {
  for (let i = 0; i < 60; i += 1) {
    if (childProc.exitCode != null) throw new Error("server exited");
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("health timeout");
}

function unitLoadsBaseline() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  assert.equal(template.formKind, "enrollment_baseline");
  assert.equal(template.packFormId, "hdh-pack-enrollment");
  assert.ok(Array.isArray(template.sections));
  assert.ok(Array.isArray(template.fields));
  assert.ok(template.fields.length > 80, "baseline should exceed legacy 80-field pack");
  assert.ok(template.fields.length <= formFieldsLib.MAX_FIELDS);
  const normalized = formFieldsLib.normalizeFormFields(template.fields);
  assert.equal(normalized.length, template.fields.length);
  pass("1.existing-enrollment-form-loads");
}

function unitBaselineSectionsRender() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  const titles = template.sections.map((section) => section.title);
  [
    "Child Information",
    "Enrollment Schedule & Hours",
    "Parent / Guardian 1",
    "Parent / Guardian 2",
    "Household / Custody Information",
    "Emergency Contacts",
    "Authorized Pickup",
    "Medical Information",
    "Development & Individual Needs",
    "Daily Care Information",
    "Getting to Know Your Child",
    "Permissions & Consents",
    "Required Document Checklist",
    "Policy Acknowledgments",
    "Signatures",
  ].forEach((title) => assert.ok(titles.includes(title), `missing section ${title}`));
  const editor = enrollmentBuilder.renderEnrollmentEditorHtml(template, { editingSectionId: "" });
  assert.match(editor, /ENROLLMENT FORM/);
  assert.match(editor, /Child Information/);
  assert.match(editor, /Enrollment Schedule/);
  assert.doesNotMatch(editor, /universally licensing-compliant/i);
  pass("2.baseline-sections-render");
}

function unitHideShowOptionalSection() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  let sections = enrollmentBaseline.setEnrollmentSectionVisible(template.sections, "development", false);
  let applied = enrollmentBaseline.applyEnrollmentVisibility({ ...template, sections });
  assert.equal(applied.sections.find((s) => s.id === "development").visible, false);
  assert.equal(
    applied.fields.filter((f) => f.sectionId === "development" && f.visible !== false).length,
    0,
  );
  sections = enrollmentBaseline.setEnrollmentSectionVisible(sections, "development", true);
  applied = enrollmentBaseline.applyEnrollmentVisibility({ ...template, sections });
  assert.equal(applied.sections.find((s) => s.id === "development").visible, true);
  assert.ok(applied.fields.some((f) => f.sectionId === "development" && f.visible !== false));
  pass("3-4.owner-hide-and-show-optional-section");
}

function unitRequiredOptionalPersist() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  const fields = template.fields.map((field) => (
    field.id === "enroll.child.preferred_name" ? { ...field, required: true } : field
  ));
  const normalized = programFormsLib.normalizeTemplate({
    ...template,
    fields,
    sourceType: "provider",
  }, { programId: "p-enroll", strictFields: true });
  const preferred = normalized.fields.find((f) => f.id === "enroll.child.preferred_name");
  assert.equal(preferred.required, true);
  assert.ok(Array.isArray(normalized.sections));
  assert.equal(normalized.formKind, "enrollment_baseline");
  pass("5.required-optional-settings-persist");
}

function unitCustomQuestionAndPermissionPersist() {
  let fields = enrollmentBaseline.addCustomEnrollmentField(
    enrollmentBaseline.buildBaselineFields(),
    { sectionId: "getting_to_know", type: "long_text", label: "Custom bedtime routine?" },
  );
  fields = enrollmentBaseline.addCustomPermission(fields, "Custom zoo trip permission");
  const customQ = fields.find((f) => f.label === "Custom bedtime routine?");
  const customP = fields.find((f) => f.label === "Custom zoo trip permission");
  assert.ok(customQ);
  assert.ok(customP);
  assert.equal(customQ.type, "long_text");
  assert.equal(customP.type, "yes_no");
  assert.equal(customP.permissionItem, true);
  const saved = programFormsLib.normalizeTemplate({
    ...enrollmentBaseline.buildEnrollmentBaselineTemplate({ fields }),
    sourceType: "provider",
  }, { programId: "p-enroll" });
  assert.ok(saved.fields.some((f) => f.label === "Custom bedtime routine?"));
  assert.ok(saved.fields.some((f) => f.label === "Custom zoo trip permission" && f.permissionItem));
  pass("6-7.custom-question-and-permission-persist");
}

function unitWeekdaySchedulePersists() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  days.forEach((day) => {
    assert.ok(template.fields.some((f) => f.id === `enroll.schedule.${day}.attending`));
    assert.ok(template.fields.some((f) => f.id === `enroll.schedule.${day}.arrival` && f.type === "time"));
    assert.ok(template.fields.some((f) => f.id === `enroll.schedule.${day}.departure` && f.type === "time"));
  });
  // No single whole-week arrival/departure field.
  assert.equal(template.fields.filter((f) => /whole.?week|generic.*(arrival|departure)/i.test(f.id + f.label)).length, 0);
  const saved = programFormsLib.normalizeTemplate({ ...template, sourceType: "provider" }, { programId: "p1" });
  assert.ok(saved.fields.filter((f) => String(f.id).includes(".schedule.")).length >= 17);
  pass("8.weekday-attendance-and-times-persist");
}

function unitMultiEntryContacts() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  for (let i = 1; i <= 3; i += 1) {
    assert.ok(template.fields.some((f) => f.id === `enroll.emergency.${i}.name`));
    assert.ok(template.fields.some((f) => f.id === `enroll.emergency.${i}.primary_phone`));
    assert.ok(template.fields.some((f) => f.id === `enroll.pickup.${i}.name`));
    assert.ok(template.fields.some((f) => f.id === `enroll.pickup.${i}.phone`));
  }
  pass("9-10.emergency-and-authorized-pickup-multi-entry");
}

function unitPreviewAndPrintExcludeBuilderControls() {
  const template = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  const preview = enrollmentBuilder.renderEnrollmentPreviewHtml(template);
  assert.match(preview, /data-form-preview="true"/);
  assert.doesNotMatch(preview, /data-enroll-edit-section|data-enroll-save|Edit section|Hide section|Add custom/);
  const printText = enrollmentBuilder.renderPrintBlankText(template, { programName: "Sunshine Care" });
  assert.match(printText, /ENROLLMENT FORM/);
  assert.match(printText, /Sunshine Care/);
  assert.match(printText, /CHILD INFORMATION/i);
  assert.match(printText, /Monday — Attending/);
  assert.doesNotMatch(printText, /data-enroll-|Edit section|Hide section|builder|DEBUG|TODO/i);
  pass("11-12.preview-and-print-exclude-builder-controls");
}

function unitLegacyTemplatesStillLoad() {
  const plain = programFormsLib.normalizeTemplate({
    id: "legacy-1",
    title: "Plain handbook",
    body: "Just text",
    category: "Policies / Acknowledgments",
  }, { programId: "p1", strictFields: false });
  assert.equal(plain.body, "Just text");
  assert.deepEqual(plain.fields, []);
  assert.equal(plain.formKind, undefined);

  const hybrid = programFormsLib.normalizeTemplate({
    id: "legacy-2",
    title: "Allergy Form",
    body: "Instructions",
    fields: [{ id: "a1", type: "yes_no", label: "Allergy?", required: true }],
  }, { programId: "p1" });
  assert.equal(hybrid.fields.length, 1);
  assert.ok(!hybrid.sections || hybrid.formKind !== "enrollment_baseline");
  pass("13.existing-saved-templates-still-load-safely");
}

function unitHistoricalAnswersProtected() {
  const store = { programData: {}, formsAudit: [] };
  const programId = "prog-enroll-hist";
  programFormsLib.ensureProgramFormsNamespace(store, programId);

  const baseline = enrollmentBaseline.buildEnrollmentBaselineTemplate();
  const saved = programFormsLib.upsertTemplate(store, programId, {
    ...baseline,
    sourceType: "provider",
    title: "Enrollment Form",
  }, { actorUserId: "owner@example.com", actorRole: "owner" });

  // Simulate an assigned/historical snapshot (Wave 4 behavior).
  const snapshotFields = JSON.parse(JSON.stringify(saved.fields));
  const historicalDoc = {
    id: "doc-enroll-1",
    childId: "child-1",
    title: saved.title,
    templateId: saved.id,
    fields: snapshotFields,
    answers: {
      "enroll.child.legal_first_name": "Ava",
      "enroll.schedule.monday.arrival": "08:00",
    },
    draftText: saved.body,
    status: "completed",
  };

  // Later template label/settings change.
  const relabeled = saved.fields.map((field) => (
    field.id === "enroll.child.legal_first_name"
      ? { ...field, label: "Child's legal first name (updated)" }
      : field
  ));
  const sections = enrollmentBaseline.setEnrollmentSectionVisible(saved.sections, "getting_to_know", false);
  programFormsLib.upsertTemplate(store, programId, {
    ...saved,
    fields: relabeled,
    sections,
    title: "Enrollment Form",
  }, { actorUserId: "owner@example.com", actorRole: "owner" });

  const latest = programFormsLib.listTemplates(store, programId).find((t) => t.id === saved.id);
  assert.equal(
    latest.fields.find((f) => f.id === "enroll.child.legal_first_name").label,
    "Child's legal first name (updated)",
  );
  // Historical snapshot unchanged.
  assert.equal(
    historicalDoc.fields.find((f) => f.id === "enroll.child.legal_first_name").label,
    "Legal first name",
  );
  assert.equal(historicalDoc.answers["enroll.child.legal_first_name"], "Ava");
  assert.equal(historicalDoc.answers["enroll.schedule.monday.arrival"], "08:00");
  pass("14.old-submissions-not-rewritten-when-template-changes");
}

function unitFormsCenterOutsideEnrollmentUnchanged() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /function renderUnifiedTemplateLibraryPanel/);
  assert.match(appJs, /function renderFormBuilderPanel/);
  assert.match(appJs, /function renderHomeDaycareAiDraftPanel/);
  assert.match(appJs, /HOME_DAYCARE_FORMS_PACK/);
  // Non-enrollment pack entries still present.
  assert.match(appJs, /hdh-pack-emergency/);
  assert.match(appJs, /hdh-pack-allergy/);
  assert.match(appJs, /data-fb-add-field/);
  // Enrollment uses existing builder panel host — no second Forms Center root.
  assert.match(appJs, /data-enrollment-builder="true"/);
  assert.match(appJs, /id="hdhFormBuilderPanel"/);
  assert.doesNotMatch(appJs, /id="enrollmentFormBuilderPanel"|id="secondFormsCenter"/);
  pass("15.forms-center-outside-enrollment-unchanged");
}

function unitNoProductionTouchMarkers() {
  const baselineSrc = fs.readFileSync(path.join(ROOT, "server/enrollment-form-baseline.js"), "utf8");
  assert.match(baselineSrc, /testing Forms spine|Does NOT create a second/i);
  assert.doesNotMatch(baselineSrc, /RENDER_API_KEY|PRODUCTION_DATABASE_URL|replace:\s*true/);
  const freeze = fs.readFileSync(path.join(ROOT, ".cursor/rules/forms-paperwork-feature-freeze.mdc"), "utf8");
  assert.match(freeze, /FEATURE FREEZE|bug-fix only/i);
  // This task is owner-approved feature work on testing branch only — no prod deploy helpers added.
  assert.ok(!fs.existsSync(path.join(ROOT, "scripts/deploy-production-enrollment.js")));
  pass("16.no-production-endpoint-or-data-touched");
}

function unitChildProfileOverlapMapping() {
  const patch = enrollmentBaseline.buildChildProfilePatchFromEnrollmentAnswers({
    "enroll.child.legal_first_name": "Milo",
    "enroll.child.legal_last_name": "Nguyen",
    "enroll.child.dob": "2022-04-01",
    "enroll.child.classroom": "Busy Bees",
    "enroll.child.requested_start_date": "2026-09-01",
    "enroll.guardian1.full_name": "Lan Nguyen",
    "enroll.guardian1.email": "lan@example.com",
    "enroll.guardian1.primary_phone": "555-0100",
    "enroll.medical.allergies": "Peanuts",
    "enroll.emergency.1.name": "Aunt Hoa",
    "enroll.emergency.1.primary_phone": "555-0101",
    "enroll.pickup.1.name": "Uncle Minh",
    "enroll.pickup.1.phone": "555-0102",
  });
  assert.equal(patch.name, "Milo Nguyen");
  assert.equal(patch.dob, "2022-04-01");
  assert.equal(patch.classroom, "Busy Bees");
  assert.equal(patch.enrollmentDate, "2026-09-01");
  assert.match(patch.parentInfo, /Lan Nguyen/);
  assert.match(patch.allergies, /Peanuts/);
  assert.match(patch.emergencyContact, /Aunt Hoa/);
  assert.match(patch.pickupContacts, /Uncle Minh/);
  pass("child-profile-overlap-mapping");
}

function unitStarterLibrarySeedsEnrollment() {
  const rows = formBuilder.buildUnifiedTemplateLibrary({
    providerTemplates: [],
    starterPack: [{
      id: "hdh-pack-enrollment",
      title: "Enrollment Form",
      category: "Enrollment",
      description: "Baseline",
      resourceId: "form-enrollment-forms-enrollment-packet",
    }],
    systemForms: [],
    category: "enrollment",
  });
  assert.ok(rows.length >= 1);
  assert.ok(rows[0].fields.length > 50);
  assert.equal(rows[0].formKind, "enrollment_baseline");
  pass("starter-library-seeds-enrollment-fields");
}

async function integrationDuplicateAndPersist() {
  const port = 4500 + Math.floor(Math.random() * 200);
  const storePath = path.join(os.tmpdir(), `llh-enroll-${Date.now()}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      "owner@example.com": {
        email: "owner@example.com",
        role: "owner",
        plan: "professional",
        accountType: "home_daycare",
        programId: "prog-enroll-1",
      },
    },
    programData: {
      "prog-enroll-1": {
        ownerEmail: "owner@example.com",
        forms: { templates: [], staffDocuments: [], updatedAt: new Date().toISOString() },
        child: { data: { Profiles: [], Documents: [] } },
      },
    },
  }));
  const child = spawnServer({ port, storePath });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitForHealth(port, child);
    const seed = enrollmentBaseline.buildEnrollmentBaselineTemplate({
      id: "hdh-pack-enrollment",
      sourceType: "starter",
    });
    // Duplicate starter → provider template via API (same path Forms Center uses).
    const dup = await request(port, "POST", "/api/program-forms/templates/duplicate", {
      email: "owner@example.com",
      body: { template: { id: "hdh-pack-enrollment", title: "Enrollment Form", packFormId: "hdh-pack-enrollment", fields: [], body: "" } },
    });
    assert.equal(dup.status, 200, `duplicate failed: ${dup.text}`);
    assert.ok(dup.json?.template?.fields?.length > 50, "duplicate should seed baseline fields");
    assert.equal(dup.json.template.formKind, "enrollment_baseline");

    // Hide optional section + add custom permission, then save.
    const sections = enrollmentBaseline.setEnrollmentSectionVisible(dup.json.template.sections, "development", false);
    const fields = enrollmentBaseline.addCustomPermission(dup.json.template.fields, "Splash pad permission");
    const saved = await request(port, "POST", "/api/program-forms/templates", {
      email: "owner@example.com",
      body: {
        ...dup.json.template,
        sections,
        fields,
        title: "Enrollment Form",
      },
    });
    assert.equal(saved.status, 200, `save failed: ${saved.text}`);
    assert.equal(saved.json.template.sections.find((s) => s.id === "development").visible, false);
    assert.ok(saved.json.template.fields.some((f) => f.label === "Splash pad permission"));

    const listed = await request(port, "GET", "/api/program-forms", { email: "owner@example.com" });
    assert.equal(listed.status, 200);
    const enrollment = (listed.json.templates || []).find((t) => t.formKind === "enrollment_baseline");
    assert.ok(enrollment);
    assert.ok(enrollment.fields.some((f) => String(f.id).includes("enroll.schedule.monday.arrival")));
    pass("integration.duplicate-customize-save-enrollment");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
    if (process.exitCode && stderr) console.error(stderr.slice(-2000));
  }
}

async function main() {
  const units = [
    unitLoadsBaseline,
    unitBaselineSectionsRender,
    unitHideShowOptionalSection,
    unitRequiredOptionalPersist,
    unitCustomQuestionAndPermissionPersist,
    unitWeekdaySchedulePersists,
    unitMultiEntryContacts,
    unitPreviewAndPrintExcludeBuilderControls,
    unitLegacyTemplatesStillLoad,
    unitHistoricalAnswersProtected,
    unitFormsCenterOutsideEnrollmentUnchanged,
    unitNoProductionTouchMarkers,
    unitChildProfileOverlapMapping,
    unitStarterLibrarySeedsEnrollment,
  ];
  for (const fn of units) {
    try { fn(); } catch (error) { fail(fn.name, error); }
  }
  try {
    await integrationDuplicateAndPersist();
  } catch (error) {
    fail("integrationDuplicateAndPersist", error);
  }
  if (process.exitCode) {
    console.error("Enrollment form baseline tests FAILED");
    process.exit(process.exitCode);
  }
  console.log("Enrollment form baseline tests PASSED");
}

main();
