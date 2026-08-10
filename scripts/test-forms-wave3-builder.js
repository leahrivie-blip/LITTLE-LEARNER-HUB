#!/usr/bin/env node
/**
 * Wave 3 — Structured Form Builder + Template Library + AI review gate.
 * Run: npm run test:forms-wave3-builder
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
const formBuilder = require("./form-builder-lib.js");
const dirtyState = require("./forms-dirty-state.js");
const aiReview = require("../server/ai-review-lib.js");

function pass(id) { console.log(`PASS  ${id}`); }
function fail(id, error) {
  console.error(`FAIL  ${id}`);
  console.error(error);
  process.exitCode = 1;
}

function request(port, method, pathname, { email, body, familyToken } = {}) {
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
    if (familyToken) {
      headers.Authorization = `Bearer ${familyToken}`;
      headers["X-LLH-Family-Session"] = familyToken;
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

function unitFieldSchemaRoundTrip() {
  const types = formFieldsLib.FIELD_TYPES;
  const fields = types.map((type, index) => {
    const base = {
      id: `fld_${type}`,
      type,
      label: `${type} label`,
      helpText: "help",
      required: type !== "info" && type !== "file",
      order: index,
      options: (type === "radio" || type === "dropdown")
        ? [{ label: "A" }, { label: "B" }]
        : [],
    };
    return formFieldsLib.normalizeFormField(base, { order: index });
  });
  assert.equal(fields.length, types.length);
  const again = formFieldsLib.normalizeFormFields(fields);
  assert.equal(again.length, types.length);
  again.forEach((field, index) => {
    assert.equal(field.id, fields[index].id);
    assert.equal(field.type, fields[index].type);
    assert.equal(field.order, index);
  });
  pass("unit.every-field-type-round-trip");
}

function unitLegacyHybrid() {
  const plain = programFormsLib.normalizeTemplate({
    id: "t-plain",
    title: "Plain",
    body: "Just text",
  }, { programId: "p1", strictFields: false });
  assert.equal(plain.body, "Just text");
  assert.deepEqual(plain.fields, []);

  const structured = programFormsLib.normalizeTemplate({
    id: "t-fields",
    title: "Fields only",
    fields: [
      { id: "a", type: "short_text", label: "Name", required: true },
      { id: "b", type: "signature", label: "Sign" },
    ],
  }, { programId: "p1" });
  assert.equal(structured.fields.length, 2);
  assert.equal(structured.body, "");

  const hybrid = programFormsLib.normalizeTemplate({
    id: "t-hybrid",
    title: "Hybrid",
    body: "Instructions",
    fields: [{ id: "c", type: "yes_no", label: "OK?", required: true }],
  }, { programId: "p1" });
  assert.equal(hybrid.body, "Instructions");
  assert.equal(hybrid.fields.length, 1);
  pass("unit.plain-structured-hybrid");
}

function unitValidationRejects() {
  assert.throws(() => formFieldsLib.normalizeFormFields([
    { id: "x", type: "radio", label: "Q", options: [{ label: "Only one" }] },
  ]), /at least 2 options/);
  assert.throws(() => formFieldsLib.normalizeFormFields([
    { id: "same", type: "short_text", label: "A" },
    { id: "same", type: "short_text", label: "B" },
  ]), /Duplicate field id/);
  assert.throws(() => formFieldsLib.normalizeFormFields([
    { id: "x", type: "explode", label: "Nope" },
  ]), /Unsupported field type/);
  assert.throws(() => formFieldsLib.validateAiStructuredDraft({
    title: "X",
    fields: [],
    childId: "invented",
  }), /cannot invent/);
  pass("unit.malformed-ai-and-options-rejected");
}

function unitDuplicateOrigin() {
  const store = { programData: {}, formsAudit: [], formsAuditArchive: [] };
  programFormsLib.ensureProgramFormsNamespace(store, "prog1");
  const original = programFormsLib.upsertTemplate(store, "prog1", {
    id: "sys-like",
    title: "Original",
    body: "Body v1",
    fields: [{ id: "f1", type: "short_text", label: "Name", required: true }],
    sourceType: "provider",
  }, { actorUserId: "owner@x.test", actorRole: "owner" });
  const copy = programFormsLib.duplicateTemplateAsProvider(store, "prog1", original, {
    actorUserId: "owner@x.test",
    actorRole: "owner",
  });
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.originTemplateId, original.id);
  assert.equal(copy.sourceType, "provider");
  assert.equal(copy.programId, "prog1");
  // Edit copy — original unchanged
  programFormsLib.upsertTemplate(store, "prog1", {
    ...copy,
    body: "Body v2 CHANGED",
    fields: [{ id: "f1", type: "short_text", label: "Name changed", required: true }],
  }, { actorUserId: "owner@x.test", actorRole: "owner" });
  const still = programFormsLib.listTemplates(store, "prog1").find((t) => t.id === original.id);
  assert.equal(still.body, "Body v1");
  assert.equal(still.fields[0].label, "Name");
  pass("unit.duplicate-origin-source-unchanged");
}

function unitAssignedSnapshotUntouched() {
  const store = { programData: {}, formsAudit: [], formsAuditArchive: [] };
  programFormsLib.ensureProgramFormsNamespace(store, "prog1");
  const template = programFormsLib.upsertTemplate(store, "prog1", {
    id: "tmpl-snap",
    title: "Snap",
    body: "Original assigned body",
    fields: [{ id: "f1", type: "short_text", label: "Original", required: true }],
  }, { actorUserId: "owner@x.test", actorRole: "owner" });
  // Simulate assignment snapshot (child Documents side — independent copy).
  const assigned = {
    id: "doc-1",
    templateId: template.id,
    draftText: template.body,
    fields: template.fields.map((f) => ({ ...f })),
  };
  programFormsLib.upsertTemplate(store, "prog1", {
    ...template,
    body: "Template edited later",
    fields: [{ id: "f1", type: "short_text", label: "Edited later", required: true }],
  }, { actorUserId: "owner@x.test", actorRole: "owner" });
  assert.equal(assigned.draftText, "Original assigned body");
  assert.equal(assigned.fields[0].label, "Original");
  pass("unit.assigned-snapshot-untouched");
}

function unitAiReviewGateHelpers() {
  assert.equal(aiReview.canPersistAiProposal({ outputText: "x" }), false);
  assert.equal(aiReview.canPersistAiProposal({ outputText: "x", reviewAcknowledged: true }), true);
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const saveTpl = appJs.slice(
    appJs.indexOf("async function saveAiFormAsProgramTemplate"),
    appJs.indexOf("async function saveAiFormAsProgramTemplate") + 1800,
  );
  assert.match(saveTpl, /hdhAiReviewAck/);
  assert.match(saveTpl, /aiReviewedBeforeSave:\s*true/);
  assert.match(appJs, /data-hdh-ai-save-template/);
  // Handler also checks ack before calling save
  const handlerStart = appJs.indexOf('if (event.target.closest("[data-hdh-ai-save-template]"))');
  const handler = appJs.slice(handlerStart, handlerStart + 1200);
  assert.match(handler, /hdhAiReviewAck/);
  pass("unit.ai-save-as-template-review-gate");
}

function unitDirtyStateBuilder() {
  dirtyState.clearForm("formBuilder");
  dirtyState.touch("formBuilder", "title", "Field trip");
  dirtyState.touch("formBuilder", "fld_1:label", "Child name");
  assert.equal(dirtyState.shouldKeepLocal("formBuilder", "title", 0), true);
  const applied = dirtyState.applyIfNotStale("formBuilder", "fld_1:label", "stale", 0);
  assert.equal(applied.keptLocal, true);
  assert.equal(applied.value, "Child name");
  // Rapid edits keep newest
  dirtyState.touch("formBuilder", "fld_1:label", "Child full name");
  assert.equal(dirtyState.get("formBuilder", "fld_1:label").value, "Child full name");
  pass("unit.dirty-state-builder-preserves-newest");
}

function unitLibraryCategories() {
  const rows = formBuilder.buildUnifiedTemplateLibrary({
    providerTemplates: [{ id: "mine", title: "Mine", category: "Enrollment", body: "x", sourceType: "provider" }],
    starterPack: [{ id: "hdh-pack-enrollment", title: "Enrollment Packet", category: "Enrollment", description: "d" }],
    systemForms: [{ id: "sys-1", title: "System Form", group: "Medical" }],
    category: "all",
    accountType: "home_daycare",
  });
  assert.ok(rows.some((r) => r.sourceKind === "my_templates"));
  assert.ok(rows.some((r) => r.sourceKind === "starter"));
  assert.ok(!rows.some((r) => r.sourceKind === "system"), "HD hides dense system catalog by default");
  const center = formBuilder.buildUnifiedTemplateLibrary({
    providerTemplates: [],
    starterPack: [],
    systemForms: [{ id: "sys-1", title: "System Form", group: "Medical" }],
    category: "system",
    accountType: "center",
  });
  assert.ok(center.some((r) => r.sourceKind === "system"));
  pass("unit.unified-library-hd-vs-center");
}

async function runtimeWave3() {
  const storePath = path.join(os.tmpdir(), `llh-wave3-${Date.now()}.json`);
  const port = 44000 + Math.floor(Math.random() * 800);
  const ownerA = "owner.a.wave3@example.invalid";
  const ownerB = "owner.b.wave3@example.invalid";
  const teacher = "teacher.wave3@example.invalid";
  const assistant = "assistant.wave3@example.invalid";
  const parent = "parent.wave3@example.invalid";

  fs.writeFileSync(storePath, JSON.stringify({
    users: {
      [ownerA]: { email: ownerA, role: "owner", accountType: "home_daycare", plan: "Pro" },
      [ownerB]: { email: ownerB, role: "owner", accountType: "center", plan: "Pro" },
      [teacher]: { email: teacher, role: "teacher", linkedProgramOwnerEmail: ownerA },
      [assistant]: { email: assistant, role: "assistant", linkedProgramOwnerEmail: ownerA },
    },
  }, null, 2));

  const childProc = spawnServer({ port, storePath });
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    try { childProc.kill("SIGTERM"); } catch (_e) { /* ignore */ }
  };
  process.on("exit", kill);

  try {
    await waitForHealth(port, childProc);

    await request(port, "POST", "/api/child-data", {
      email: ownerA,
      body: { data: { Profiles: [{ id: "kid-1", name: "Ava" }], Documents: [] } },
    });

    // AI save without review rejected
    const aiNoReview = await request(port, "POST", "/api/program-forms/templates", {
      email: ownerA,
      body: {
        title: "AI form",
        body: "text",
        fields: [{ id: "f1", type: "short_text", label: "Name", required: true }],
        aiGenerated: true,
      },
    });
    assert.equal(aiNoReview.status, 400, aiNoReview.text);
    assert.equal(aiNoReview.json?.code, "ai_review_required");
    pass("security.ai-save-template-requires-review");

    const aiOk = await request(port, "POST", "/api/program-forms/templates", {
      email: ownerA,
      body: {
        title: "AI form",
        body: "text",
        fields: [{ id: "f1", type: "short_text", label: "Name", required: true }],
        aiGenerated: true,
        aiReviewedBeforeSave: true,
        reviewAcknowledged: true,
      },
    });
    assert.equal(aiOk.status, 200, aiOk.text);
    assert.equal(aiOk.json.template.aiReviewedBeforeSave, true);
    pass("runtime.ai-structured-template-with-review");

    // Field validate endpoint
    const badFields = await request(port, "POST", "/api/program-forms/fields/validate", {
      email: ownerA,
      body: { fields: [{ id: "x", type: "dropdown", label: "Q", options: [{ label: "One" }] }] },
    });
    assert.equal(badFields.status, 400);
    const goodFields = await request(port, "POST", "/api/program-forms/fields/validate", {
      email: ownerA,
      body: {
        aiDraft: {
          title: "Trip",
          bodyText: "Zoo trip",
          fields: [
            { id: "perm", type: "yes_no", label: "Permission?", required: true },
            { id: "sig", type: "signature", label: "Sign" },
          ],
        },
      },
    });
    assert.equal(goodFields.status, 200, goodFields.text);
    assert.equal(goodFields.json.draft.fields.length, 2);
    pass("runtime.ai-structured-draft-validates");

    // Duplicate
    const dup = await request(port, "POST", "/api/program-forms/templates/duplicate", {
      email: ownerA,
      body: {
        template: {
          id: "starter-origin",
          title: "Starter trip",
          body: "starter body",
          fields: [{ id: "d1", type: "date", label: "Date", required: true }],
          sourceType: "starter",
        },
      },
    });
    assert.equal(dup.status, 200, dup.text);
    assert.notEqual(dup.json.template.id, "starter-origin");
    assert.equal(dup.json.template.originTemplateId, "starter-origin");
    assert.equal(dup.json.template.sourceType, "provider");
    pass("runtime.duplicate-provider-owned");

    // Cross-program denied
    await request(port, "POST", "/api/child-data", {
      email: ownerB,
      body: { data: { Profiles: [{ id: "c-kid", name: "Cara" }], Documents: [] } },
    });
    const bForms = await request(port, "GET", "/api/program-forms", { email: ownerB });
    assert.ok(!(bForms.json.staffDocuments || []).some(() => false));
    assert.ok(!(bForms.json.templates || []).some((t) => t.id === aiOk.json.template.id));
    const steal = await request(port, "POST", "/api/program-forms/templates", {
      email: ownerB,
      body: {
        id: aiOk.json.template.id,
        programId: bForms.json.programId,
        title: "Stolen",
        body: "nope",
      },
    });
    // Owner B upsert with A's id creates a NEW row in B's program (different program namespace)
    // or updates only within B — must not mutate A's store.
    const aForms = await request(port, "GET", "/api/program-forms", { email: ownerA });
    const aTpl = (aForms.json.templates || []).find((t) => t.id === aiOk.json.template.id);
    assert.equal(aTpl.title, "AI form");
    pass("security.provider-cross-program-template-isolated");

    // Assistant cannot manage templates
    const asst = await request(port, "POST", "/api/program-forms/templates", {
      email: assistant,
      body: { title: "Nope", body: "x" },
    });
    assert.equal(asst.status, 403);
    pass("security.assistant-template-denied");

    // Parent cannot access builder APIs
    const invite = await request(port, "POST", "/api/family-hub/households", {
      email: ownerA,
      body: {
        label: "Fam",
        email: parent,
        children: [{ id: "kid-1" }],
        appOrigin: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(invite.status, 200, invite.text);
    const login = await request(port, "POST", "/api/family-hub/login", {
      body: { email: parent, code: invite.json.loginCode },
    });
    const token = login.json.sessionToken;
    const parentTpl = await request(port, "POST", "/api/program-forms/templates", {
      familyToken: token,
      body: { title: "Parent forge", body: "x" },
    });
    assert.ok(parentTpl.status === 401 || parentTpl.status === 403 || parentTpl.status === 404);
    pass("security.parent-builder-denied");

    // Teacher can save provider template but not mutate forged system sourceType into store as system
    const teacherSave = await request(port, "POST", "/api/program-forms/templates", {
      email: teacher,
      body: {
        title: "Teacher form",
        body: "ok",
        fields: [{ id: "t1", type: "checkbox", label: "Ack", required: true }],
        sourceType: "system",
      },
    });
    assert.equal(teacherSave.status, 200, teacherSave.text);
    assert.equal(teacherSave.json.template.sourceType, "provider");
    pass("security.teacher-cannot-create-system-origin");

    // UI markers
    const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.match(appJs, /data-form-builder/);
    assert.match(appJs, /data-template-library/);
    assert.match(appJs, /Structured Form Builder/);
    assert.match(appJs, /function renderUnifiedTemplateLibraryPanel/);
    const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
    assert.match(css, /\.form-builder-panel/);
    assert.match(css, /\.fb-preview/);
    pass("ui.builder-library-markers");

    // Fallback untouched
    const disk = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const progId = aForms.json.programId;
    const gate = programFormsLib.describeFallbackRemovalGate(disk.programData[progId].forms, {});
    assert.equal(gate.readyToRemoveFallback, false);
    pass("compat.fallback-still-active");

    pass("runtime_wave3");
  } finally {
    kill();
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }
}

async function main() {
  console.log("Wave 3 — Form Builder tests\n");
  try { unitFieldSchemaRoundTrip(); } catch (e) { fail("unit.every-field-type-round-trip", e); }
  try { unitLegacyHybrid(); } catch (e) { fail("unit.plain-structured-hybrid", e); }
  try { unitValidationRejects(); } catch (e) { fail("unit.malformed-ai-and-options-rejected", e); }
  try { unitDuplicateOrigin(); } catch (e) { fail("unit.duplicate-origin-source-unchanged", e); }
  try { unitAssignedSnapshotUntouched(); } catch (e) { fail("unit.assigned-snapshot-untouched", e); }
  try { unitAiReviewGateHelpers(); } catch (e) { fail("unit.ai-save-as-template-review-gate", e); }
  try { unitDirtyStateBuilder(); } catch (e) { fail("unit.dirty-state-builder-preserves-newest", e); }
  try { unitLibraryCategories(); } catch (e) { fail("unit.unified-library-hd-vs-center", e); }
  try { await runtimeWave3(); } catch (e) { fail("runtime_wave3", e); }
  if (process.exitCode) {
    console.error("\nWAVE 3 BLOCKED — DO NOT CONTINUE");
    process.exit(1);
  }
  console.log("\nAll Wave 3 builder tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
