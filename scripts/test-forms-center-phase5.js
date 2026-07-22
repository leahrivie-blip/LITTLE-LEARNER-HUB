#!/usr/bin/env node
"use strict";

/**
 * Phase 5 Built-In Form Library private admin-preview tests.
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
const libraryModel = require("./built-in-form-library-data-model.js");
const importer = require("./built-in-form-library-importer.js");
const { STARTER_TEMPLATES } = require("./built-in-form-library-starter-templates.js");

const { EXPANSION_FEATURE_KEYS } = expansionFlags;
const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase5-library-admin@example.com";
const ADMIN_PASSWORD = "Phase5LibraryPass!99";
const ADMIN_CODE = "phase5-library-code";

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
  const storePath = path.join(os.tmpdir(), `llh-fc-phase5-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(store || baseStore(flags), null, 2));
  const port = 6900 + Math.floor(Math.random() * 800);
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
      ADMIN_EMAILS: "phase5-second-admin@example.com",
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

async function adminLogin(port, email = ADMIN_EMAIL) {
  const login = await request(port, "POST", "/api/admin/login", {
    body: { email, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

function buildCurriculumOnlyStore() {
  const store = foundation.ensureFoundationStore(baseStore({ directorCenter: true, formsCenter: true, familyHub: true }));
  const org = foundation.createOrganizationRecord({
    id: "org_curriculum_only_library_test",
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

  // ── Local unit tests (no server needed) ─────────────────────────────────

  try {
    assert.equal(STARTER_TEMPLATES.length, 29);
    const validation = importer.validateImportBatch(STARTER_TEMPLATES);
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    pass("all 29 starter templates pass structural validation");
  } catch (error) {
    fail("all 29 starter templates pass structural validation", error);
  }

  try {
    const duplicateFieldPayload = [{
      templateKey: "dupe-field-test",
      title: "Dupe Field Test",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 1,
      sections: [{ id: "s1", title: "Section", fields: [
        { id: "f1", type: "short_text", label: "A" },
        { id: "f1", type: "short_text", label: "B" },
      ] }],
    }];
    const result = importer.validateImportBatch(duplicateFieldPayload);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Duplicate field ID")));
    pass("importer rejects duplicate field IDs");
  } catch (error) {
    fail("importer rejects duplicate field IDs", error);
  }

  try {
    const duplicateTemplatePayload = [
      { templateKey: "same-key", title: "One", shortDescription: "d", category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION, version: 1, sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "short_text", label: "A" }] }] },
      { templateKey: "same-key", title: "Two", shortDescription: "d", category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION, version: 1, sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "short_text", label: "A" }] }] },
    ];
    const result = importer.validateImportBatch(duplicateTemplatePayload);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Duplicate template ID")));
    pass("importer rejects duplicate template IDs within one batch");
  } catch (error) {
    fail("importer rejects duplicate template IDs within one batch", error);
  }

  try {
    const unsupportedTypePayload = [{
      templateKey: "bad-type-test",
      title: "Bad Type Test",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 1,
      sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "not_a_real_field_type", label: "A" }] }],
    }];
    const result = importer.validateImportBatch(unsupportedTypePayload);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("unsupported field type")));
    pass("importer rejects unsupported field types");
  } catch (error) {
    fail("importer rejects unsupported field types", error);
  }

  try {
    const emptyTemplatePayload = [{
      templateKey: "empty-template-test",
      title: "Empty Template",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 1,
      sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "content_heading", label: "Just a heading" }] }],
    }];
    const result = importer.validateImportBatch(emptyTemplatePayload);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("at least one field")));
    pass("importer rejects a template with no fillable fields");
  } catch (error) {
    fail("importer rejects a template with no fillable fields", error);
  }

  try {
    const store = {};
    const first = importer.applyImportBatch(store, [{
      templateKey: "version-safety-test",
      title: "Version Safety Test",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 1,
      sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "short_text", label: "A" }] }],
    }], { actorEmail: "system" });
    assert.equal(first.ok, true);
    const sameVersion = importer.applyImportBatch(store, [{
      templateKey: "version-safety-test",
      title: "Version Safety Test",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 1,
      sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "short_text", label: "A changed" }] }],
    }], { actorEmail: "system" });
    assert.equal(sameVersion.ok, false);
    assert.ok(sameVersion.errors.some((e) => e.includes("not newer")));
    const noSummary = importer.applyImportBatch(store, [{
      templateKey: "version-safety-test",
      title: "Version Safety Test",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 2,
      sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "short_text", label: "A changed" }] }],
    }], { actorEmail: "system" });
    assert.equal(noSummary.ok, false);
    assert.ok(noSummary.errors.some((e) => e.includes("change summary")));
    const withSummary = importer.applyImportBatch(store, [{
      templateKey: "version-safety-test",
      title: "Version Safety Test",
      shortDescription: "desc",
      category: libraryModel.BUILT_IN_CATEGORIES.PROGRAM_EVENTS_COMMUNICATION,
      version: 2,
      changeSummary: "Updated the label wording.",
      sections: [{ id: "s1", title: "S", fields: [{ id: "f1", type: "short_text", label: "A changed" }] }],
    }], { actorEmail: "system" });
    assert.equal(withSummary.ok, true);
    assert.equal(withSummary.applied[0].version.versionNumber, 2);
    pass("importer never silently overwrites a published template and requires a new version + change summary");
  } catch (error) {
    fail("importer never silently overwrites a published template and requires a new version + change summary", error);
  }

  // ── Server-level gate tests ──────────────────────────────────────────────

  for (const [name, config, expectedReason] of [
    ["production lock", { env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true" } }, "production_locked"],
    ["preview env required", { env: { ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "false" } }, "preview_env_disabled"],
    ["stored flag required", { flags: { directorCenter: true, formsCenter: false, familyHub: true } }, "feature_unavailable"],
  ]) {
    const server = await startServer(config);
    try {
      const token = await adminLogin(server.port);
      const res = await request(server.port, "GET", "/api/forms-center/library/home", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body.reason, expectedReason);
      pass(`${name} rejects Built-In Library route (shares Forms Center gate)`);
    } catch (error) {
      fail(`${name} rejects Built-In Library route`, error);
    } finally {
      await server.stop();
    }
  }

  {
    const server = await startServer();
    try {
      const unauth = await request(server.port, "GET", "/api/forms-center/library/home");
      assert.equal(unauth.status, 403);
      assert.equal(unauth.body.code, "admin_required");
      const queryToken = await request(server.port, "GET", "/api/forms-center/library/home", { query: "?adminToken=fake" });
      assert.equal(queryToken.status, 403);
      assert.equal(queryToken.body.code, "query_admin_token_rejected");
      pass("admin required and query-string tokens rejected for the library");
    } catch (error) {
      fail("admin required and query-string tokens rejected for the library", error);
    } finally {
      await server.stop();
    }
  }

  {
    const server = await startServer({ store: buildCurriculumOnlyStore() });
    try {
      const token = await adminLogin(server.port);
      const res = await request(server.port, "GET", "/api/forms-center/library/home", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "forms_library_entitlement_required");
      pass("Curriculum Only entitlement blocks the built-in library");
    } catch (error) {
      fail("Curriculum Only entitlement blocks the built-in library", error);
    } finally {
      await server.stop();
    }
  }

  // ── Main workflow ─────────────────────────────────────────────────────────

  const server = await startServer();
  try {
    const token = await adminLogin(server.port);
    const auth = { Authorization: `Bearer ${token}` };

    const home = await request(server.port, "GET", "/api/forms-center/library/home", { headers: auth });
    assert.equal(home.status, 200, JSON.stringify(home.body));
    assert.equal(home.body.emailSent, false);
    assert.equal(home.body.stripeTouched, false);
    assert.equal(home.body.aiTouched, false);
    assert.equal(home.body.responseCollection, false);
    assert.equal(home.body.permission.role, "director_owner");
    assert.equal(home.body.permission.canBrowse, true);
    assert.equal(home.body.permission.canCreateDraftCopy, true);
    assert.ok(home.body.featured.length > 0);
    assert.ok(home.body.mostUsed.length > 0);
    assert.ok(home.body.categories.length === 7);
    assert.ok(home.body.favorites.length >= 3, "fixture favorites should be seeded");
    assert.ok(home.body.recentPreviews.length >= 1, "fixture recent previews should be seeded");
    assert.ok(home.body.recentCopies.length >= 1, "fixture recent copies should be seeded");
    pass("home payload includes featured/most-used/categories/favorites/recent activity with safety flags");

    const orgId = home.body.organizationId;
    const listAll = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth });
    assert.equal(listAll.status, 200);
    assert.equal(listAll.body.total, 29 - 1, "one starter template is retired by fixtures, so 28 remain active");
    pass("browsing lists all approved active built-in templates");

    const search = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth, query: "?q=sunscreen" });
    assert.equal(search.body.total, 1);
    assert.equal(search.body.templates[0].title, "Sunscreen and Insect Repellent Permission");
    pass("search matches by title/description/category/tags");

    const filterCategory = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth, query: "?category=health_medical" });
    assert.ok(filterCategory.body.templates.every((t) => t.category === "health_medical"));
    assert.equal(filterCategory.body.total, 4);
    pass("category filter narrows results correctly");

    const filterAge = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth, query: "?ageGroup=infant" });
    assert.ok(filterAge.body.templates.every((t) => t.ageGroups.includes("infant")));
    pass("age group filter narrows results correctly");

    const sortAlpha = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth, query: "?sort=alphabetical" });
    const titles = sortAlpha.body.templates.map((t) => t.title);
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
    pass("alphabetical sort orders templates by title");

    const retiredList = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth, query: "?status=retired" });
    assert.equal(retiredList.body.total, 1);
    const retiredTemplate = retiredList.body.templates[0];
    assert.equal(retiredTemplate.status, "retired");
    assert.ok(retiredTemplate.replacedByTemplateId);
    pass("exactly one retired template is present with a replaced-by reference");

    const emergencyTemplate = listAll.body.templates.find((t) => t.title === "Emergency Contact Form");
    assert.equal(emergencyTemplate.currentVersionNumber, 2, "Emergency Contact Form should have a newer published version from fixtures");
    pass("one template has a newer version available beyond version 1");

    const detail = await request(server.port, "GET", `/api/forms-center/library/templates/${emergencyTemplate.id}`, { headers: auth });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.version.versionNumber, 2);
    assert.ok(detail.body.olderVersions.length >= 1);
    pass("template detail exposes current version and older version history");

    const preview = await request(server.port, "GET", `/api/forms-center/library/templates/${emergencyTemplate.id}/preview`, { headers: auth });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.previewOnly, true);
    assert.equal(preview.body.responseCollection, false);
    assert.match(preview.body.message, /Create a program copy to customize it/i);
    const beforePreviewCount = emergencyTemplate.previewCount;
    const listAfterPreview = await request(server.port, "GET", "/api/forms-center/library/templates", { headers: auth });
    const emergencyAfterPreview = listAfterPreview.body.templates.find((t) => t.id === emergencyTemplate.id);
    assert.ok(emergencyAfterPreview.previewCount > beforePreviewCount);
    pass("preview is response-free, shows the required message, and increments a non-sensitive preview counter");

    const favoriteOn = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/favorite`, { headers: auth, body: { favorited: true } });
    assert.equal(favoriteOn.status, 200);
    assert.equal(favoriteOn.body.template.favorited, true);
    const favoritesList = await request(server.port, "GET", "/api/forms-center/library/favorites", { headers: auth });
    assert.ok(favoritesList.body.favorites.some((t) => t.id === emergencyTemplate.id));
    const favoriteOff = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/favorite`, { headers: auth, body: { favorited: false } });
    assert.equal(favoriteOff.body.template.favorited, false);
    pass("favorites can be added and removed and are organization/user scoped");

    const noConfirm = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/use`, { headers: auth, body: {} });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.code, "confirmation_required");
    pass("Use This Template requires explicit confirmation");

    const sourceSnapshotBefore = await request(server.port, "GET", `/api/forms-center/library/templates/${emergencyTemplate.id}`, { headers: auth });
    const useTemplate = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/use`, {
      headers: auth,
      body: { confirm: true, requestId: "test-req-1" },
    });
    assert.equal(useTemplate.status, 201, JSON.stringify(useTemplate.body));
    assert.equal(useTemplate.body.sourceUnchanged, true);
    assert.match(useTemplate.body.message, /ready/i);
    const copiedForm = useTemplate.body.form;
    assert.equal(copiedForm.organizationId, orgId);
    assert.equal(copiedForm.status, "draft");
    assert.equal(copiedForm.sourceTemplateId, emergencyTemplate.id);
    assert.equal(copiedForm.sourceTemplateVersionNumber, 2);
    assert.ok(copiedForm.id.startsWith("fcform_"));
    const copiedSectionIds = useTemplate.body.snapshot.sections.map((s) => s.id);
    const copiedFieldIds = useTemplate.body.snapshot.fields.map((f) => f.id);
    assert.ok(copiedSectionIds.every((id) => id.startsWith("fcsec_")), "copy must use brand-new fcsec_ section IDs, not template bftsec_ IDs");
    assert.ok(copiedFieldIds.every((id) => id.startsWith("fcfield_")), "copy must use brand-new fcfield_ field IDs, not template bftfield_ IDs");
    const sourceSnapshotAfter = await request(server.port, "GET", `/api/forms-center/library/templates/${emergencyTemplate.id}`, { headers: auth });
    assert.deepEqual(sourceSnapshotAfter.body.version, sourceSnapshotBefore.body.version, "the built-in master version must never change after a copy is made");
    pass("Use This Template creates a new organization-owned draft with fresh IDs, preserves source references, and never modifies the system master");

    const dedupeRetry = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/use`, {
      headers: auth,
      body: { confirm: true, requestId: "test-req-1" },
    });
    assert.equal(dedupeRetry.status, 200);
    assert.equal(dedupeRetry.body.deduped, true);
    assert.equal(dedupeRetry.body.form.id, copiedForm.id);
    pass("repeated clicks with the same request ID are deduped instead of creating a second copy");

    const secondCopy = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/use`, {
      headers: auth,
      body: { confirm: true, requestId: "test-req-2" },
    });
    assert.equal(secondCopy.status, 201);
    assert.notEqual(secondCopy.body.form.id, copiedForm.id);
    assert.match(secondCopy.body.form.title, /Copy/);
    pass('a second copy of the same template gets a distinguishing "Copy" title to avoid duplicates');

    const useRetired = await request(server.port, "POST", `/api/forms-center/library/templates/${retiredTemplate.id}/use`, {
      headers: auth,
      body: { confirm: true },
    });
    assert.equal(useRetired.status, 409);
    assert.equal(useRetired.body.code, "template_retired");
    assert.ok(useRetired.body.replacedByTemplateId);
    pass("a retired template cannot be used to create a new copy, and reports its replacement");

    const retiredDetail = await request(server.port, "GET", `/api/forms-center/library/templates/${retiredTemplate.id}`, { headers: auth });
    assert.equal(retiredDetail.status, 200);
    pass("a retired template remains fetchable as a historical source reference");

    const orgFormsAfterRetire = await request(server.port, "GET", "/api/forms-center/forms?status=active", { headers: auth });
    const survivingCopy = orgFormsAfterRetire.body.forms.find((f) => f.sourceTemplateId === retiredTemplate.id);
    assert.ok(survivingCopy, "the org copy created from the now-retired template by fixtures must still exist and work");
    pass("retiring a template never breaks an organization form already created from it");

    // ── Role access ────────────────────────────────────────────────────────

    const roleOptions = await request(server.port, "GET", "/api/forms-center/library/role-preview-options", { headers: auth });
    assert.equal(roleOptions.status, 200);
    const teacher = roleOptions.body.memberships.find((m) => m.role === "lead_teacher");
    const assistant = roleOptions.body.memberships.find((m) => m.role === "assistant_staff");
    assert.ok(teacher && assistant);

    const teacherHome = await request(server.port, "GET", "/api/forms-center/library/home", {
      headers: { ...auth, "x-llh-role-preview-membership-id": teacher.membershipId },
    });
    assert.equal(teacherHome.status, 200);
    assert.equal(teacherHome.body.permission.canBrowse, true);
    assert.equal(teacherHome.body.permission.canCreateDraftCopy, true);
    pass("a lead teacher with a director-granted override can browse and copy from the library");

    const assistantUse = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/use`, {
      headers: { ...auth, "x-llh-role-preview-membership-id": assistant.membershipId },
      body: { confirm: true, requestId: "assistant-req-1" },
    });
    assert.equal(assistantUse.status, 403);
    assert.equal(assistantUse.body.code, "form_library_copy_role_denied");
    pass("an assistant with view-only access can browse but cannot create a program copy");

    const assistantBrowse = await request(server.port, "GET", "/api/forms-center/library/home", {
      headers: { ...auth, "x-llh-role-preview-membership-id": assistant.membershipId },
    });
    assert.equal(assistantBrowse.status, 200);
    assert.equal(assistantBrowse.body.permission.canBrowse, true);
    pass("an assistant with a director-granted view-only override can still browse the library");

    // A teacher with no library permission override at all must be denied.
    const store = server.readStore();
    const unauthorizedTeacher = foundation.createStaffMembershipRecord({
      organizationId: orgId,
      userEmail: "no.override.teacher@example.test",
      displayName: "No Override Teacher",
      role: "lead_teacher",
    });
    store.staffMemberships[unauthorizedTeacher.id] = unauthorizedTeacher;
    fs.writeFileSync(server.storePath, JSON.stringify(store, null, 2));
    const unauthorizedTeacherHome = await request(server.port, "GET", "/api/forms-center/library/home", {
      headers: { ...auth, "x-llh-role-preview-membership-id": unauthorizedTeacher.id },
    });
    assert.equal(unauthorizedTeacherHome.status, 403);
    assert.equal(unauthorizedTeacherHome.body.code, "form_library_role_denied");
    pass("a lead teacher without a director-granted override is denied library access by default");

    const systemAdminBlocked = await request(server.port, "POST", "/api/forms-center/library/admin/import", {
      headers: { ...auth, "x-llh-role-preview-membership-id": teacher.membershipId },
      body: { templates: [] },
    });
    assert.equal(systemAdminBlocked.status, 403);
    assert.equal(systemAdminBlocked.body.code, "system_admin_required");
    const systemAdminBlockedRetire = await request(server.port, "POST", `/api/forms-center/library/admin/templates/${emergencyTemplate.id}/retire`, {
      headers: { ...auth, "x-llh-role-preview-membership-id": teacher.membershipId },
      body: {},
    });
    assert.equal(systemAdminBlockedRetire.status, 403);
    assert.equal(systemAdminBlockedRetire.body.code, "system_admin_required");
    pass("system-template administration is rejected for any previewed director/teacher/assistant role, even with a valid admin bearer");

    // ── System-admin structured import / retire / restore ──────────────────

    const dryRun = await request(server.port, "POST", "/api/forms-center/library/admin/import", {
      headers: auth,
      body: {
        dryRun: true,
        templates: [{
          templateKey: "phase5-test-new-template",
          title: "Phase 5 Test New Template",
          shortDescription: "A template added during automated testing.",
          category: "program_events_communication",
          version: 1,
          sections: [{ id: "s1", title: "Section", fields: [{ id: "f1", type: "short_text", label: "Name", required: true }] }],
        }],
      },
    });
    assert.equal(dryRun.status, 200);
    assert.equal(dryRun.body.dryRun, true);
    assert.equal(dryRun.body.preview[0].action, "create");
    const beforeImportList = await request(server.port, "GET", "/api/forms-center/library/admin/templates", { headers: auth });
    assert.ok(!beforeImportList.body.templates.some((t) => t.templateKey === "phase5-test-new-template"), "dry run must not persist anything");
    pass("structured import dry run previews changes without saving them");

    const applyImport = await request(server.port, "POST", "/api/forms-center/library/admin/import", {
      headers: auth,
      body: {
        templates: [{
          templateKey: "phase5-test-new-template",
          title: "Phase 5 Test New Template",
          shortDescription: "A template added during automated testing.",
          category: "program_events_communication",
          version: 1,
          sections: [{ id: "s1", title: "Section", fields: [{ id: "f1", type: "short_text", label: "Name", required: true }] }],
        }],
      },
    });
    assert.equal(applyImport.status, 200, JSON.stringify(applyImport.body));
    assert.equal(applyImport.body.applied[0].action, "create");
    const afterImportList = await request(server.port, "GET", "/api/forms-center/library/admin/templates", { headers: auth });
    const importedTemplate = afterImportList.body.templates.find((t) => t.templateKey === "phase5-test-new-template");
    assert.ok(importedTemplate);
    pass("structured import saves a validated new built-in template with a permanent system-template ID");

    const importAudit = await request(server.port, "GET", "/api/forms-center/library/admin/import/audit", { headers: auth });
    assert.equal(importAudit.status, 200);
    assert.ok(importAudit.body.audit.some((row) => row.templateKey === "phase5-test-new-template"));
    pass("import audit trail records the new template import");

    const retire = await request(server.port, "POST", `/api/forms-center/library/admin/templates/${importedTemplate.id}/retire`, {
      headers: auth,
      body: { replacedByTemplateId: emergencyTemplate.id },
    });
    assert.equal(retire.status, 200);
    assert.equal(retire.body.template.status, "retired");
    const restore = await request(server.port, "POST", `/api/forms-center/library/admin/templates/${importedTemplate.id}/restore`, { headers: auth, body: {} });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.template.status, "active");
    pass("system admin can retire and restore a built-in template");

    const invalidSourceReference = await request(server.port, "POST", `/api/forms-center/library/admin/templates/${importedTemplate.id}/retire`, {
      headers: auth,
      body: { replacedByTemplateId: "bftpl_not_a_real_template" },
    });
    assert.equal(invalidSourceReference.status, 400);
    assert.equal(invalidSourceReference.body.code, "invalid_source_template_reference");
    pass("retiring with an invalid replaced-by reference is rejected");

    // ── Cross-organization isolation ────────────────────────────────────────

    const otherAdminToken = await adminLogin(server.port, "phase5-second-admin@example.com");
    const otherHome = await request(server.port, "GET", "/api/forms-center/library/home", { headers: { Authorization: `Bearer ${otherAdminToken}` } });
    assert.equal(otherHome.status, 200);
    assert.notEqual(otherHome.body.organizationId, orgId);
    assert.ok(!otherHome.body.recentCopies.some((row) => row.formId === copiedForm.id), "a second admin's organization must not see the first organization's copies");
    pass("recent copies and favorites remain isolated per organization and are never shared globally");

    // ── No response collection anywhere in the library ──────────────────────

    const responses = await request(server.port, "POST", `/api/forms-center/library/templates/${emergencyTemplate.id}/responses`, {
      headers: auth,
      body: { fieldValues: {} },
    });
    assert.equal(responses.status, 404);
    assert.equal(responses.body.code, "responses_not_implemented");
    const finalStore = server.readStore();
    assert.ok(!finalStore.builtInFormLibrary.responses);
    assert.ok(!finalStore.builtInFormLibrary.submissions);
    assert.ok(!finalStore.formsCenter.responses);
    assert.ok(!finalStore.formsCenter.submissions);
    pass("the built-in library never collects responses or submissions");

    // ── Regression: Forms Center Phase 4 still works with the library enabled ─

    const stillWorks = await request(server.port, "GET", "/api/forms-center/home", { headers: auth });
    assert.equal(stillWorks.status, 200);
    pass("Phase 4 Forms Center home still works with the built-in library enabled");
  } catch (error) {
    fail("main Built-In Library workflow", error);
  } finally {
    await server.stop();
  }

  // ── HTML/script wiring checks ────────────────────────────────────────────

  try {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /platform-perf\.js\?v=/);
    const perf = fs.readFileSync(path.join(ROOT, "platform-perf.js"), "utf8");
    assert.match(perf, /forms-center-ui\.js\?v=/);
    const script = fs.readFileSync(path.join(ROOT, "forms-center-ui.js"), "utf8");
    assert.match(script, /Built-In Library/);
    assert.match(script, /Use This Template/);
    pass("index.html and forms-center-ui.js include the Built-In Library nav and actions");
  } catch (error) {
    fail("index.html and forms-center-ui.js include the Built-In Library nav and actions", error);
  }

  if (failures.length) {
    console.error("\nForms Center Phase 5 failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log("\nAll Forms Center Phase 5 (Built-In Form Library) tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
