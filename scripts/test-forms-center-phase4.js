#!/usr/bin/env node
"use strict";

/**
 * Phase 4 Forms Center private admin-preview workflow tests.
 * Fake preview data only. No emails. No Stripe. No AI. No response collection.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const foundation = require("./foundation-data-model.js");
const entitlements = require("./entitlement-model.js");

const { EXPANSION_FEATURE_KEYS } = expansionFlags;
const ROOT = path.join(__dirname, "..");
const { resolveTestPort } = require("./test-port.js");
const ADMIN_EMAIL = "phase4-forms-admin@example.com";
const ADMIN_PASSWORD = "Phase4FormsPass!99";
const ADMIN_CODE = "phase4-forms-code";

function request(port, method, pathname, { headers = {}, body = null, query = "" } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname + query,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function baseStore(flags = {}) {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: flags.directorCenter === true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: flags.formsCenter === true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: flags.familyHub === true,
      },
    },
  };
}

async function startServer({
  env = {},
  flags = { directorCenter: true, formsCenter: true, familyHub: true },
  store = null,
} = {}) {
  const storePath = path.join(os.tmpdir(), `llh-fc-phase4-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(store || baseStore(flags), null, 2));
  let port = resolveTestPort(6100, 800);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW || "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: env.ALLOW_FORMS_CENTER_ADMIN_PREVIEW || "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "",
      SENDGRID_API_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return {
    port,
    storePath,
    readStore: () => JSON.parse(fs.readFileSync(storePath, "utf8")),
    stop: () => new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    }),
  };
}

async function adminLogin(port) {
  const login = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

function buildCurriculumOnlyStore() {
  const store = foundation.ensureFoundationStore(baseStore({ directorCenter: true, formsCenter: true, familyHub: true }));
  const org = foundation.createOrganizationRecord({
    id: "org_curriculum_only_forms_test",
    accountType: foundation.ACCOUNT_TYPES.CENTER,
    ownerEmail: ADMIN_EMAIL,
    name: "Curriculum Only Preview",
  });
  org.preview = true;
  store.organizations[org.id] = org;
  const entitlement = entitlements.createOrganizationEntitlementRecord({
    organizationId: org.id,
    basePlanKey: entitlements.PLAN_KEYS.CURRICULUM_ONLY,
  });
  entitlement.preview = true;
  store.organizationEntitlements[entitlement.id] = entitlement;
  return store;
}

async function run() {
  const check = spawnSync("npm", ["run", "check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(check.status, 0, `npm run check failed\n${check.stdout}\n${check.stderr}`);
  console.log("PASS nested npm run check");

  const failures = [];
  const pass = (name) => console.log(`PASS ${name}`);
  const fail = (name, error) => {
    failures.push(`${name}: ${error && error.message ? error.message : error}`);
    console.error(`FAIL ${name}: ${error && error.message ? error.message : error}`);
  };

  try {
    const env = expansionFlags.resolveExpansionEnvironment({
      siteUrl: "https://littlelearnershubbyleah.com",
      env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
    });
    const forms = expansionFlags.evaluateExpansionAccess({
      flagKey: EXPANSION_FEATURE_KEYS.FORMS_CENTER,
      storedFlags: { formsCenter: true },
      environment: env,
      isVerifiedAdmin: true,
    });
    assert.equal(forms.allowed, false);
    assert.equal(forms.reason, "production_locked");
    const family = expansionFlags.evaluateExpansionAccess({
      flagKey: EXPANSION_FEATURE_KEYS.FAMILY_HUB,
      storedFlags: { familyHub: true },
      environment: expansionFlags.resolveExpansionEnvironment({
        siteUrl: "http://127.0.0.1",
        env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true" },
      }),
      isVerifiedAdmin: true,
    });
    assert.equal(family.allowed, false);
    assert.equal(family.reason, "preview_env_disabled");
    const allowed = expansionFlags.evaluateExpansionAccess({
      flagKey: EXPANSION_FEATURE_KEYS.FORMS_CENTER,
      storedFlags: { formsCenter: true },
      environment: expansionFlags.resolveExpansionEnvironment({
        siteUrl: "http://127.0.0.1",
        env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true" },
      }),
      isVerifiedAdmin: true,
    });
    assert.equal(allowed.allowed, true);
    pass("unit policy: production locked, family off, forms preview allowed");
  } catch (error) {
    fail("unit policy checks", error);
  }

  for (const [name, config, expectedReason] of [
    ["production lock", { env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true" } }, "production_locked"],
    ["preview env required", { env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "false" } }, "preview_env_disabled"],
    ["stored flag required", { flags: { directorCenter: true, formsCenter: false, familyHub: true } }, "feature_unavailable"],
  ]) {
    const server = await startServer(config);
    try {
      const token = await adminLogin(server.port);
      const res = await request(server.port, "POST", "/api/forms-center/seed", {
        headers: { Authorization: `Bearer ${token}` },
        body: {},
      });
      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body.reason, expectedReason);
      pass(`${name} rejects Forms Center route`);
    } catch (error) {
      fail(`${name} rejects Forms Center route`, error);
    } finally {
      await server.stop();
    }
  }

  {
    const server = await startServer();
    try {
      const unauth = await request(server.port, "GET", "/api/forms-center/home");
      assert.equal(unauth.status, 403);
      assert.equal(unauth.body.code, "admin_required");
      const queryToken = await request(server.port, "GET", "/api/forms-center/home", { query: "?adminToken=fake" });
      assert.equal(queryToken.status, 403);
      assert.equal(queryToken.body.code, "query_admin_token_rejected");
      pass("admin required and query-string tokens rejected");
    } catch (error) {
      fail("admin required and query-string tokens rejected", error);
    } finally {
      await server.stop();
    }
  }

  {
    const server = await startServer({ store: buildCurriculumOnlyStore() });
    try {
      const token = await adminLogin(server.port);
      const res = await request(server.port, "GET", "/api/forms-center/home", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "forms_center_entitlement_required");
      pass("Curriculum Only entitlement blocks Forms Center");
    } catch (error) {
      fail("Curriculum Only entitlement blocks Forms Center", error);
    } finally {
      await server.stop();
    }
  }

  const server = await startServer();
  try {
    const token = await adminLogin(server.port);
    const auth = { Authorization: `Bearer ${token}` };

    const flags = await request(server.port, "GET", "/api/foundation/feature-flags", { headers: auth });
    assert.equal(flags.status, 200);
    assert.equal(flags.body.flags.directorCenter, true);
    assert.equal(flags.body.flags.formsCenter, true);
    assert.equal(flags.body.flags.familyHub, false);
    assert.equal(flags.body.viewer.canAccessFormsCenter, true);
    pass("viewer flags enable Director and Forms preview while Family Hub is off");

    const director = await request(server.port, "GET", "/api/director-center/overview", { headers: auth });
    assert.equal(director.status, 200, JSON.stringify(director.body));
    assert.equal(director.body.preview, true);
    pass("Director Center still works with Forms Center enabled");

    const seed = await request(server.port, "POST", "/api/forms-center/seed", { headers: auth, body: {} });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));
    assert.equal(seed.body.emailSent, false);
    assert.equal(seed.body.stripeTouched, false);
    assert.equal(seed.body.aiTouched, false);
    assert.equal(seed.body.responseCollection, false);
    assert.ok(seed.body.counts.forms >= 6);
    assert.ok(seed.body.counts.versions >= 4);
    const emergency = seed.body.forms.find((form) => form.title === "Emergency Contact Form");
    assert.ok(emergency);
    assert.equal(emergency.status, "published");
    pass("seed creates fake published/draft/archived/duplicated preview forms");

    const versions = await request(server.port, "GET", `/api/forms-center/forms/${emergency.id}/versions`, { headers: auth });
    assert.equal(versions.status, 200);
    assert.ok(versions.body.versions.length >= 2);
    pass("seed includes multiple versions on a published form");

    const fieldTypes = await request(server.port, "GET", "/api/forms-center/field-types", { headers: auth });
    assert.equal(fieldTypes.status, 200);
    assert.ok(fieldTypes.body.fieldTypes.some((field) => field.group === "childcare_smart"));
    assert.ok(fieldTypes.body.fieldTypes.some((field) => field.type === "signature_parent"));
    pass("field type catalog covers smart fields and signature placeholders");

    const invalid = await request(server.port, "POST", "/api/forms-center/forms", {
      headers: auth,
      body: { title: "", category: "custom" },
    });
    assert.equal(invalid.status, 201);
    const invalidPublish = await request(server.port, "POST", `/api/forms-center/forms/${invalid.body.form.id}/publish`, {
      headers: auth,
      body: {},
    });
    assert.equal(invalidPublish.status, 400);
    assert.equal(invalidPublish.body.code, "form_validation_failed");
    pass("publish validation requires title and at least one fillable field");

    const created = await request(server.port, "POST", "/api/forms-center/forms", {
      headers: auth,
      body: { title: "Phase 4 Workflow Form", category: "permissions", description: "Workflow test" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const formId = created.body.form.id;
    const sectionId = created.body.form.currentDraft.sections[0].id;
    const draft = await request(server.port, "POST", `/api/forms-center/forms/${formId}/save-draft`, {
      headers: auth,
      body: {
        title: "Phase 4 Workflow Form",
        category: "permissions",
        sections: [{ id: sectionId, title: "Permission", description: "Parent review", order: 0 }],
        fields: [
          { type: "short_text", label: "Child name", required: true, sectionId },
          { type: "checkboxes", label: "Permissions", required: true, sectionId, options: ["Walks", "Photos"] },
          { type: "signature_parent", label: "Parent signature placeholder", required: true, sectionId },
        ],
      },
    });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(draft.body.snapshot.fields.length, 3);
    const originalFieldIds = draft.body.snapshot.fields.map((field) => field.id);
    const publish1 = await request(server.port, "POST", `/api/forms-center/forms/${formId}/publish`, {
      headers: auth,
      body: {},
    });
    assert.equal(publish1.status, 200, JSON.stringify(publish1.body));
    assert.equal(publish1.body.version.versionNumber, 1);
    const v1Label = publish1.body.version.fields[0].label;

    const edit = await request(server.port, "POST", `/api/forms-center/forms/${formId}/edit-published`, {
      headers: auth,
      body: {},
    });
    assert.equal(edit.status, 200);
    const editFieldIds = edit.body.snapshot.fields.map((field) => field.id);
    assert.notDeepEqual(editFieldIds, originalFieldIds);
    const editSectionId = edit.body.snapshot.sections[0].id;
    const draft2 = await request(server.port, "POST", `/api/forms-center/forms/${formId}/save-draft`, {
      headers: auth,
      body: {
        title: "Phase 4 Workflow Form Updated",
        category: "permissions",
        sections: edit.body.snapshot.sections,
        fields: edit.body.snapshot.fields.map((field, index) => index === 0
          ? { ...field, label: "Updated child name", sectionId: editSectionId }
          : field),
      },
    });
    assert.equal(draft2.status, 200);
    const publish2 = await request(server.port, "POST", `/api/forms-center/forms/${formId}/publish`, {
      headers: auth,
      body: {},
    });
    assert.equal(publish2.status, 200);
    assert.equal(publish2.body.version.versionNumber, 2);
    const workflowVersions = await request(server.port, "GET", `/api/forms-center/forms/${formId}/versions`, { headers: auth });
    assert.equal(workflowVersions.body.versions.length, 2);
    assert.equal(workflowVersions.body.versions[0].fields[0].label, v1Label);
    assert.equal(workflowVersions.body.versions[1].fields[0].label, "Updated child name");
    pass("draft/publish workflow creates immutable published versions");

    const duplicate = await request(server.port, "POST", `/api/forms-center/forms/${formId}/duplicate`, {
      headers: auth,
      body: {},
    });
    assert.equal(duplicate.status, 201);
    assert.notEqual(duplicate.body.form.id, formId);
    assert.equal(duplicate.body.form.sourceFormId, formId);
    assert.ok(duplicate.body.newFieldIds.every((id) => !originalFieldIds.includes(id)));
    pass("duplicate creates new form and field IDs with sourceFormId");

    const archive = await request(server.port, "POST", `/api/forms-center/forms/${formId}/archive`, { headers: auth, body: {} });
    assert.equal(archive.status, 200);
    assert.equal(archive.body.form.status, "archived");
    const restore = await request(server.port, "POST", `/api/forms-center/forms/${formId}/restore`, { headers: auth, body: {} });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.form.status, "published");
    pass("archive and restore preserve form state");

    const crossOrg = await request(server.port, "POST", "/api/forms-center/forms", {
      headers: auth,
      body: { title: "Wrong Org", organizationId: "org_not_this_admin" },
    });
    assert.equal(crossOrg.status, 403);
    assert.equal(crossOrg.body.code, "organization_mismatch");
    pass("cross-org request is denied");

    const preview = await request(server.port, "GET", `/api/forms-center/forms/${formId}/preview`, { headers: auth });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.previewOnly, true);
    assert.equal(preview.body.responseCollection, false);
    assert.match(preview.body.message, /responses are not being collected/i);
    const responses = await request(server.port, "POST", `/api/forms-center/forms/${formId}/responses`, {
      headers: auth,
      body: { fieldValues: {} },
    });
    assert.equal(responses.status, 404);
    assert.equal(responses.body.code, "responses_not_implemented");
    pass("preview is response-free and no response submit endpoint exists");

    const finalStore = server.readStore();
    assert.ok(!finalStore.formsCenter.responses);
    assert.ok(!finalStore.formsCenter.submissions);
    pass("store has no response/submission collection");
  } catch (error) {
    fail("main Forms Center workflow", error);
  } finally {
    await server.stop();
  }

  if (failures.length) {
    console.error("\nForms Center Phase 4 failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log("\nAll Forms Center Phase 4 tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
