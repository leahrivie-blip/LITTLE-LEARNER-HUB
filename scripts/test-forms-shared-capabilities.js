/**
 * Shared Forms Center capabilities (post-enrollment baseline).
 * Run: npm run test:forms-shared-capabilities
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const brandingLib = require("../server/forms-branding-lib.js");
const questionBank = require("../server/forms-question-bank.js");
const repeatGroups = require("../server/forms-repeat-groups.js");
const starterLib = require("../server/forms-starter-lib.js");
const sharedBuilder = require("./forms-shared-builder.js");
const formFieldsLib = require("../server/form-fields-lib.js");
const formsAssignLib = require("../server/forms-assign-lib.js");
const formsSignatureLib = require("../server/forms-signature-lib.js");
const formsRecordLib = require("../server/forms-record-lib.js");
const programFormsLib = require("../server/program-forms-lib.js");
const enrollmentBaseline = require("../server/enrollment-form-baseline.js");
const enrollmentBuilder = require("./enrollment-form-builder.js");

function section(title, fn) {
  process.stdout.write(`\n• ${title}\n`);
  fn();
  process.stdout.write("  ok\n");
}

section("1. Blank form creation works", () => {
  const seed = sharedBuilder.createBlankFormSeed({
    title: "Nap Room Notes",
    description: "Optional instructions for families.",
  });
  assert.equal(seed.title, "Nap Room Notes");
  assert.equal(seed.fields.length, 0, "blank form must not ship preset fields");
  assert.ok(Array.isArray(seed.sections) && seed.sections.length === 1);
  assert.equal(seed.sections[0].title, "Section 1");
  const saved = programFormsLib.normalizeTemplate({
    ...seed,
    body: seed.description || "Instructions",
  }, { programId: "p1", strictFields: false });
  assert.equal(saved.title, "Nap Room Notes");
  assert.ok(saved.sections?.length >= 1);
});

section("2. Custom section creation works", () => {
  const tpl = programFormsLib.normalizeTemplate({
    title: "Custom sections form",
    body: "Hello",
    fields: [
      { id: "q1", type: "short_text", label: "Name", sectionId: "sec.a" },
    ],
    sections: [
      { id: "sec.a", title: "About the child", visible: true },
      { id: "sec.b", title: "Permissions", visible: true },
    ],
  }, { programId: "p1", strictFields: false });
  assert.equal(tpl.sections.length, 2);
  assert.equal(tpl.sections[0].title, "About the child");
});

section("3. Custom question creation works", () => {
  const field = formFieldsLib.normalizeFormField({
    id: "custom.q",
    type: "yes_no",
    label: "May we apply sunscreen?",
    required: true,
  }, { order: 0, strict: false });
  assert.equal(field.type, "yes_no");
  assert.equal(field.label, "May we apply sunscreen?");
  assert.equal(field.required, true);
});

section("4. Existing field types remain functional", () => {
  for (const type of formFieldsLib.FIELD_TYPES) {
    const normalized = formFieldsLib.normalizeFormField({
      id: `t.${type}`,
      type,
      label: `Label ${type}`,
      options: type === "radio" || type === "dropdown"
        ? [{ id: "a", label: "A", value: "A" }, { id: "b", label: "B", value: "B" }]
        : [],
    }, { order: 0, strict: false });
    assert.equal(normalized.type, type);
  }
});

section("5. Question Bank selection creates an independent copy", () => {
  const first = questionBank.copyQuestionBankItem("qb.child.full-name", { existingIds: [] });
  assert.equal(first.ok, true);
  assert.equal(first.fields.length, 1);
  const idA = first.fields[0].id;
  const second = questionBank.copyQuestionBankItem("qb.child.full-name", { existingIds: [idA] });
  assert.equal(second.ok, true);
  assert.notEqual(second.fields[0].id, idA);
  assert.equal(second.fields[0].label, first.fields[0].label);
});

section("6. Editing Question Bank source does not mutate existing forms", () => {
  const copied = questionBank.copyQuestionBankItem("qb.allergies.yesno", { existingIds: [] });
  assert.equal(copied.ok, true);
  const originalLabel = copied.fields[0].label;
  // Mutating the returned bank catalog item must not affect prior copies.
  const listed = questionBank.listQuestionBank().find((item) => item.id === "qb.allergies.yesno");
  listed.fields[0].label = "CHANGED BANK LABEL";
  assert.equal(copied.fields[0].label, originalLabel);
  const fresh = questionBank.copyQuestionBankItem("qb.allergies.yesno", { existingIds: [] });
  // Source catalog is module-const; list returns copies. Fresh copy still uses source wording.
  assert.match(fresh.fields[0].label, /allerg/i);
});

section("7. Program branding displays in Preview", () => {
  const branding = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Sunshine Childcare Center",
      address: "123 Main Street",
      contactPhone: "(555) 555-5555",
      contactEmail: "hello@sunshinechildcare.com",
      logoDataUrl: "data:image/png;base64,AAAA",
      formsBranding: { showLogo: true, showProgramName: true, showContact: true },
    },
  });
  const html = sharedBuilder.renderBrandingHeaderHtml(branding, {
    formTitle: "Enrollment Form",
  });
  assert.match(html, /Sunshine Childcare Center/);
  assert.match(html, /Enrollment Form/);
  assert.match(html, /123 Main Street/);
  assert.match(html, /forms-brand-logo/);
  assert.doesNotMatch(html, /data-fb-move-up|field ID|schema/i);
});

section("8. Program branding displays in Print Blank", () => {
  const branding = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Sunshine Childcare Center",
      address: "123 Main Street",
      contactPhone: "(555) 555-5555",
      contactEmail: "hello@sunshinechildcare.com",
      logoDataUrl: "data:image/png;base64,AAAA",
    },
  });
  const text = sharedBuilder.renderPrintBlankText({
    title: "Allergy Form",
    body: "Please complete.",
    fields: [
      { id: "a", type: "yes_no", label: "Does your child have any allergies?", order: 0 },
      { id: "b", type: "long_text", label: "Please describe allergies.", order: 1, printLines: 3 },
    ],
  }, branding);
  assert.match(text, /Sunshine Childcare Center/);
  assert.match(text, /Allergy Form/);
  assert.match(text, /☐ Yes/);
  assert.match(text, /____/);
  assert.doesNotMatch(text, /data-fb-|Move up|schema|field ID/i);
});

section("9. Branding can be hidden per form", () => {
  const branding = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Sunshine Childcare Center",
      logoDataUrl: "data:image/png;base64,AAAA",
      formsBranding: { showLogo: true, showProgramName: true, showContact: true },
    },
    formOverride: { hideAll: true },
  });
  assert.equal(branding.showLogo, false);
  assert.equal(branding.showProgramName, false);
  const html = sharedBuilder.renderBrandingHeaderHtml(branding, { formTitle: "Hidden brand form" });
  // Form title may still show via helper when passed, but program identity is hidden.
  assert.doesNotMatch(html, /Sunshine Childcare Center/);
  assert.doesNotMatch(html, /forms-brand-logo/);
});

section("10. Existing program information is reused rather than duplicated", () => {
  const src = fs.readFileSync(path.join(ROOT, "server/forms-branding-lib.js"), "utf8");
  assert.match(src, /logoDataUrl/);
  assert.match(src, /programName/);
  assert.match(src, /contactPhone|contactEmail/);
  assert.doesNotMatch(src, /formsUpload|uploadFormLogo/i);
  assert.match(src, /does not invent a second logo store/i);
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(app, /formsBranding/);
  assert.match(app, /getProgramSettings\(\)/);
});

section("11. Logo handling is safe", () => {
  const bad = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Safe",
      logoDataUrl: "javascript:alert(1)",
    },
  });
  assert.equal(bad.logoDataUrl, "");
  assert.equal(bad.showLogo, false);
  const ok = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Safe",
      logoDataUrl: "data:image/png;base64,AAAA",
    },
  });
  assert.equal(ok.showLogo, true);
});

section("12. Fixed repeat groups serialize correctly", () => {
  const expanded = repeatGroups.expandFixedRepeatGroup("emergency_contact", 3, { idPrefix: "em" });
  assert.equal(expanded.ok, true);
  assert.equal(expanded.count, 3);
  const normalized = formFieldsLib.normalizeFormFields(expanded.fields, { strict: false });
  assert.ok(normalized.length >= 9);
  assert.ok(normalized.some((f) => /Emergency Contact 1/i.test(f.label)));
  assert.equal(repeatGroups.MAX_DYNAMIC_REPEATERS_SUPPORTED, false);
});

section("13. Repeatable groups print correctly", () => {
  const expanded = repeatGroups.expandFixedRepeatGroup("authorized_pickup", 2, { idPrefix: "pu" });
  const text = sharedBuilder.renderPrintBlankText({
    title: "Pickup Form",
    fields: expanded.fields.map((f, i) => ({ ...f, order: i })),
  }, { showLlhFooter: false });
  assert.match(text, /Authorized Pickup Person 1/i);
  assert.match(text, /Authorized Pickup Person 2/i);
  assert.match(text, /Name: _{10,}/);
  assert.match(text, /Notes/);
});

section("14. Starter template creates an independent editable form", () => {
  const a = starterLib.createEditableStarterCopy("emergency_contact");
  const b = starterLib.createEditableStarterCopy("emergency_contact");
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.template.id, b.template.id);
  assert.ok(a.template.fields.length > 0);
  a.template.title = "My daycare emergency form";
  assert.notEqual(b.template.title, "My daycare emergency form");
});

section("15. Editing one program’s form does not alter the master template", () => {
  const copy = starterLib.createEditableStarterCopy("child_info_update");
  assert.equal(copy.ok, true);
  const masterAgain = starterLib.buildStarterDefinition("child_info_update");
  copy.template.fields[0].label = "MUTATED COPY";
  assert.notEqual(masterAgain.fields[0].label, "MUTATED COPY");
});

section("16. Builder controls do not appear in Preview", () => {
  const html = sharedBuilder.renderBrandingHeaderHtml({
    programName: "Demo",
    showProgramName: true,
    showContact: false,
    showLogo: false,
    showLlhFooter: true,
    llhFooterText: "Created with Little Learner Hub",
  }, { formTitle: "Demo Form" });
  const preview = require("./form-builder-lib.js").renderPreviewHtml({
    title: "Demo Form",
    fields: [{ id: "x", type: "short_text", label: "Name", order: 0, required: true }],
  }, { brandingHeaderHtml: html, llhFooterHtml: sharedBuilder.renderLlhFooterHtml({ showLlhFooter: true }) });
  assert.match(preview, /data-form-preview="true"/);
  assert.doesNotMatch(preview, /data-fb-move-up|data-fb-delete-field|Choose From Question Bank|Write My Own/);
});

section("17. Builder controls/internal IDs do not appear in Print Blank", () => {
  const text = sharedBuilder.renderPrintBlankText({
    title: "Print Test",
    fields: [{ id: "internal.secret.id", type: "short_text", label: "Child name", order: 0 }],
  }, { programName: "Demo", showProgramName: true, showLlhFooter: false });
  assert.match(text, /Child name/);
  assert.doesNotMatch(text, /internal\.secret\.id/);
  assert.doesNotMatch(text, /Move up|Delete|Required toggle|schema/i);
});

section("18. Historical assigned/completed/signed documents remain unchanged", () => {
  const resolved = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Original Daycare",
      logoDataUrl: "data:image/png;base64,AAAA",
    },
  });
  const snap = brandingLib.snapshotFormsBranding(resolved);
  const formSpec = formsAssignLib.snapshotFormSpec({
    title: "Historical Form",
    body: "Body text",
    fields: [{ id: "n", type: "short_text", label: "Name", required: true }],
    formsBranding: snap,
  });
  assert.ok(formSpec.formsBranding);
  assert.equal(formSpec.formsBranding.programName, "Original Daycare");
  const row = formsAssignLib.buildChildAssignmentRow(
    { kind: "child", childId: "c1", householdId: "h1" },
    formSpec,
    { shareWithFamily: true }
  );
  assert.equal(row.formsBranding.programName, "Original Daycare");
  // Later program rename must not rewrite the document snapshot.
  const later = brandingLib.brandingForDocument(row, brandingLib.resolveFormsBranding({
    programSettings: { programName: "Renamed Daycare", logoDataUrl: "data:image/png;base64,BBBB" },
  }));
  assert.equal(later.programName, "Original Daycare");
  assert.equal(later.fromSnapshot, true);
});

section("legacy-branding.1 new assigned document snapshots program branding", () => {
  const snap = brandingLib.snapshotFormsBranding(brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Snapshot Daycare",
      address: "1 Oak St",
      contactPhone: "555-0100",
      contactEmail: "hi@snapshot.test",
      logoDataUrl: "data:image/png;base64,AAAA",
    },
  }));
  const formSpec = formsAssignLib.snapshotFormSpec({
    title: "Permission",
    body: "Please sign",
    formsBranding: snap,
  });
  assert.equal(formSpec.formsBranding.programName, "Snapshot Daycare");
  assert.equal(formSpec.formsBranding.logoDataUrl, "data:image/png;base64,AAAA");
});

section("legacy-branding.2 changing Program Settings does not change new assigned document", () => {
  const row = formsAssignLib.buildChildAssignmentRow(
    { kind: "child", childId: "c1", householdId: "h1" },
    formsAssignLib.snapshotFormSpec({
      title: "Permission",
      body: "Please sign",
      formsBranding: brandingLib.snapshotFormsBranding(brandingLib.resolveFormsBranding({
        programSettings: {
          programName: "Frozen Name",
          logoDataUrl: "data:image/png;base64,AAAA",
          contactPhone: "555-0100",
        },
      })),
    }),
    { shareWithFamily: true }
  );
  const before = JSON.stringify(row.formsBranding);
  const rendered = brandingLib.brandingForDocument(row, brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Brand New Name",
      logoDataUrl: "data:image/png;base64,ZZZZ",
      contactPhone: "999-9999",
    },
  }));
  assert.equal(rendered.programName, "Frozen Name");
  assert.equal(rendered.logoDataUrl, "data:image/png;base64,AAAA");
  assert.equal(rendered.phone, "555-0100");
  assert.equal(JSON.stringify(row.formsBranding), before, "document branding must not mutate on render");
});

section("legacy-branding.3–4 legacy doc without formsBranding is deterministic and ignores live settings", () => {
  const legacyDoc = {
    id: "doc_legacy_1",
    title: "Old Permission",
    draftText: "Body",
    answers: { a1: "unchanged-answer" },
    signedAt: "2026-01-01T00:00:00.000Z",
    signedBy: "Parent Legacy",
    signedSnapshot: "Body\nSigned by Parent Legacy",
    // no formsBranding / brandingSnapshot / programName
  };
  const frozen = JSON.stringify(legacyDoc);
  const liveA = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Live Name A",
      logoDataUrl: "data:image/png;base64,AAAA",
      address: "A Street",
      contactPhone: "111",
      contactEmail: "a@test",
      website: "https://a.test",
    },
  });
  const liveB = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Live Name B",
      logoDataUrl: "data:image/png;base64,BBBB",
      address: "B Street",
      contactPhone: "222",
      contactEmail: "b@test",
      website: "https://b.test",
    },
  });
  const renderA = brandingLib.brandingForDocument(legacyDoc, liveA);
  const renderB = brandingLib.brandingForDocument(legacyDoc, liveB);
  assert.equal(renderA.legacySafeFallback, true);
  assert.equal(renderA.fromSnapshot, false);
  assert.equal(renderA.showLogo, false);
  assert.equal(renderA.logoDataUrl, "");
  assert.equal(renderA.showContact, false);
  assert.equal(renderA.programName, "");
  assert.deepEqual(renderA, renderB, "legacy rendering must be identical across Program Settings changes");
  assert.equal(JSON.stringify(legacyDoc), frozen, "view/print must not mutate stored legacy Document");

  const dtoA = formsRecordLib.buildCompletedRecordDto({
    located: { document: legacyDoc, assigneeType: "child" },
    auth: { level: "director", canPrint: true },
    programName: "Live Name A",
  });
  const dtoB = formsRecordLib.buildCompletedRecordDto({
    located: { document: legacyDoc, assigneeType: "child" },
    auth: { level: "director", canPrint: true },
    programName: "Live Name B",
  });
  assert.equal(dtoA.record.programName, "");
  assert.equal(dtoB.record.programName, "");
  assert.equal(dtoA.record.programName, dtoB.record.programName);
  assert.equal(JSON.stringify(legacyDoc), frozen);
});

section("legacy-branding.5–6 legacy answers and signatures remain unchanged", () => {
  const legacyDoc = {
    id: "doc_legacy_sig",
    title: "Signed Form",
    draftText: "Content",
    answers: { childName: "Ava", allergy: "Peanuts" },
    signedAt: "2026-02-02T12:00:00.000Z",
    signedBy: "Parent One",
    signedRole: "guardian",
    signedSnapshot: "Content\nSignature: Parent One",
    signatureMethod: "typed",
  };
  const answersBefore = JSON.stringify(legacyDoc.answers);
  const sigBefore = JSON.stringify({
    signedAt: legacyDoc.signedAt,
    signedBy: legacyDoc.signedBy,
    signedSnapshot: legacyDoc.signedSnapshot,
  });
  brandingLib.brandingForDocument(legacyDoc, brandingLib.resolveFormsBranding({
    programSettings: { programName: "Should Not Appear", logoDataUrl: "data:image/png;base64,AAAA" },
  }));
  const dto = formsRecordLib.buildCompletedRecordDto({
    located: { document: formsSignatureLib.ensureDocumentVersions(legacyDoc), assigneeType: "child" },
    auth: { level: "director", canPrint: true },
    programName: "Should Not Appear",
  });
  assert.equal(JSON.stringify(legacyDoc.answers), answersBefore);
  assert.equal(JSON.stringify({
    signedAt: legacyDoc.signedAt,
    signedBy: legacyDoc.signedBy,
    signedSnapshot: legacyDoc.signedSnapshot,
  }), sigBefore);
  assert.equal(dto.record.signature.signerDisplayName, "Parent One");
  assert.match(dto.record.bodyText, /Content/);
});

section("legacy-branding.7–8 live branding still available for unsent templates / preview", () => {
  const live = brandingLib.resolveFormsBranding({
    programSettings: {
      programName: "Current Daycare",
      logoDataUrl: "data:image/png;base64,AAAA",
      address: "9 Pine",
      contactPhone: "555-1212",
    },
    formOverride: { inherit: true },
  });
  assert.equal(live.programName, "Current Daycare");
  assert.equal(live.showLogo, true);
  const previewHtml = sharedBuilder.renderBrandingHeaderHtml(live, { formTitle: "Draft Template" });
  assert.match(previewHtml, /Current Daycare/);
  assert.match(previewHtml, /Draft Template/);
  // Template preview path does not go through brandingForDocument(legacy).
  assert.equal(typeof brandingLib.resolveFormsBranding, "function");
});

section("legacy-branding.trusted document programName reused when present", () => {
  const legacyWithName = {
    id: "doc_legacy_named",
    title: "Old Form",
    draftText: "Body",
    programName: "Stored Historical Name",
  };
  const branding = brandingLib.brandingForDocument(legacyWithName, brandingLib.resolveFormsBranding({
    programSettings: { programName: "Live Override", logoDataUrl: "data:image/png;base64,AAAA" },
  }));
  assert.equal(branding.programName, "Stored Historical Name");
  assert.equal(branding.showLogo, false);
  assert.equal(branding.legacySafeFallback, true);
});

section("19. Enrollment Form from PR #653 still builds", () => {
  const tpl = enrollmentBaseline.buildEnrollmentBaselineTemplate({ id: "enroll-test" });
  assert.ok(tpl.fields.length > 100);
  const preview = enrollmentBuilder.renderEnrollmentPreviewHtml(tpl, {
    programName: "Test Program",
    branding: brandingLib.resolveFormsBranding({
      programSettings: { programName: "Test Program" },
    }),
  });
  assert.match(preview, /data-form-preview="true"/);
  assert.doesNotMatch(preview, /data-enroll-section-card|Move up/);
});

section("20. Existing non-enrollment forms still normalize", () => {
  const tpl = programFormsLib.normalizeTemplate({
    title: "Photo Permission",
    body: "I give permission…",
    fields: [
      { id: "p1", type: "yes_no", label: "Photo permission", required: true },
      { id: "p2", type: "signature", label: "Parent signature", required: true },
    ],
  }, { programId: "p1", strictFields: true });
  assert.equal(tpl.fields.length, 2);
  assert.equal(tpl.sourceType, "provider");
});

section("21. Answer key capacity supports large enrollment packets", () => {
  const answers = {};
  for (let i = 0; i < 205; i += 1) answers[`enroll.field.${i}`] = `value-${i}`;
  const cleaned = formsSignatureLib.sanitizeAnswers(answers);
  assert.ok(Object.keys(cleaned).length >= 200);
});

section("Shell / wiring pins include shared Forms scripts", () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(indexHtml, /forms-shared-builder\.js\?v=20260813-forms-shared1/);
  assert.match(indexHtml, /forms-question-bank\.js/);
  assert.match(indexHtml, /Create Blank Form|formsBrandingShowLogo/);
  assert.match(sw, /llh-shell-v236-forms-shared1/);
  assert.match(sw, /forms-shared-builder\.js/);
});

section("Future starters can be added without architecture rewrite", () => {
  const future = starterLib.listStartersReadyForContentOnly();
  assert.ok(future.length >= 10);
  assert.ok(future.some((item) => item.key === "sunscreen_permission"));
});

console.log("\nAll shared Forms capability checks passed.");
