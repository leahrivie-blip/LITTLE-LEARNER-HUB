#!/usr/bin/env node
/**
 * Phase 2 Owner Testing Admin — API integration test (testing fence only).
 * Run: HOME_DAYCARE_HUB_TESTING=1 NODE_ENV=test node scripts/test-owner-testing-admin-phase2.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ADMIN_EMAIL = "leahivie@icloud.com";
const ADMIN_PASSWORD = "Phase2Admin!234";
const ADMIN_ACCESS_CODE = "phase2-99";
const results = [];

function record(id, ok, detail) {
  results.push({ id, ok: !!ok, detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
}

function requestJson(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode || 0, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port, child, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch (_e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("health timeout");
}

async function main() {
  const storePath = path.join(os.tmpdir(), `llh-ota-phase2-${Date.now()}.json`);
  const port = 4300 + Math.floor(Math.random() * 200);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      HOME_DAYCARE_HUB_TESTING: "1",
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE,
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  try {
    await waitForHealth(port, child);
    record("health", true, `port ${port}`);

    const denied = await requestJson(port, "GET", "/api/admin/testing/dashboard");
    record("requires_admin", denied.status === 401, `status=${denied.status}`);

    const login = await requestJson(port, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_ACCESS_CODE },
    });
    const token = login.json?.token || "";
    record("admin_login", login.status === 200 && Boolean(token), login.json?.error || "");
    const auth = { Authorization: `Bearer ${token}` };

    const dash = await requestJson(port, "GET", "/api/admin/testing/dashboard", { headers: auth });
    record(
      "dashboard",
      dash.status === 200
        && dash.json?.dashboard?.environment === "TESTING"
        && typeof dash.json?.dashboard?.totalPrograms === "number"
        && dash.json?.dashboard?.systemHealth,
      JSON.stringify({
        env: dash.json?.dashboard?.environment,
        programs: dash.json?.dashboard?.totalPrograms,
        health: dash.json?.dashboard?.systemHealth?.status,
      }),
    );

    const createProgram = await requestJson(port, "POST", "/api/admin/testing/programs", {
      headers: auth,
      body: {
        programName: "Standalone Center TEST",
        programType: "center",
        createSampleData: true,
        adminEmail: ADMIN_EMAIL,
      },
    });
    record(
      "create_program",
      createProgram.status === 200 && createProgram.json?.program?.accountType === "center",
      createProgram.json?.error || createProgram.json?.program?.name || "",
    );

    const createHome = await requestJson(port, "POST", "/api/admin/testing/testers", {
      headers: auth,
      body: {
        name: "Home Tester",
        email: "home.tester@example.invalid",
        programName: "Maple Grove TEST",
        programType: "home_daycare",
        role: "owner",
        activateNow: true,
        createSampleData: true,
        features: { familyHub: true, forms: true, fullPlatform: false },
        appOrigin: `http://127.0.0.1:${port}`,
        adminEmail: ADMIN_EMAIL,
      },
    });
    record(
      "create_home_daycare_tester",
      createHome.status === 200 && createHome.json?.activated && createHome.json?.temporaryPassword,
      createHome.json?.error || `program=${createHome.json?.tester?.programName}`,
    );

    const createCenter = await requestJson(port, "POST", "/api/admin/testing/testers", {
      headers: auth,
      body: {
        name: "Center Director",
        email: "center.director@example.invalid",
        programName: "ABC Center TEST",
        programType: "center",
        role: "director",
        activateNow: true,
        createSampleData: true,
        features: { familyHub: true, director: true, forms: true },
        appOrigin: `http://127.0.0.1:${port}`,
        adminEmail: ADMIN_EMAIL,
      },
    });
    record(
      "create_center_director",
      createCenter.status === 200 && createCenter.json?.tester?.accountType === "center" && createCenter.json?.tester?.role === "director",
      createCenter.json?.error || `type=${createCenter.json?.tester?.accountType} role=${createCenter.json?.tester?.role}`,
    );

    const list = await requestJson(port, "GET", "/api/admin/testing/testers?q=maple", { headers: auth });
    record("search_testers", list.status === 200 && (list.json?.testers || []).some((t) => t.email.includes("home.tester")), `count=${(list.json?.testers || []).length}`);

    const programs = await requestJson(port, "GET", "/api/admin/testing/programs", { headers: auth });
    record("list_programs", programs.status === 200 && (programs.json?.programs || []).length >= 1, `count=${(programs.json?.programs || []).length}`);

    const programId = createProgram.json?.program?.id || (programs.json?.programs || [])[0]?.id || "";
    const programDetail = await requestJson(port, "GET", `/api/admin/testing/programs/${encodeURIComponent(programId)}`, { headers: auth });
    record(
      "program_detail",
      programDetail.status === 200 && Array.isArray(programDetail.json?.children) && Array.isArray(programDetail.json?.users),
      `children=${(programDetail.json?.children || []).length} users=${(programDetail.json?.users || []).length}`,
    );

    const email = "home.tester@example.invalid";
    const patch = await requestJson(port, "PATCH", `/api/admin/testing/testers/${encodeURIComponent(email)}`, {
      headers: auth,
      body: { features: { familyHub: true, billing: true, multiRole: true }, multiRoleTester: true },
    });
    record("edit_features", patch.status === 200 && patch.json?.tester?.features?.billing === true, JSON.stringify(patch.json?.tester?.features || patch.json || {}).slice(0, 160));

    const resend = await requestJson(port, "PATCH", `/api/admin/testing/testers/${encodeURIComponent(email)}/resend`, {
      headers: auth,
      body: { appOrigin: `http://127.0.0.1:${port}` },
    });
    record("resend_invite", resend.status === 200 && Boolean(resend.json?.acceptUrl), resend.json?.error || resend.json?.acceptUrl || "");

    const resendProdOrigin = await requestJson(port, "PATCH", `/api/admin/testing/testers/${encodeURIComponent(email)}/resend`, {
      headers: auth,
      body: { appOrigin: "https://littlelearnershubbyleah.com" },
    });
    const accept = String(resendProdOrigin.json?.acceptUrl || "");
    record(
      "resend_invite_blocks_production_host",
      resendProdOrigin.status === 200
        && accept.includes("testerInvite=")
        && !/littlelearnershubbyleah\.com|little-learner-hub\.onrender\.com/.test(accept),
      accept || resendProdOrigin.json?.error || "",
    );

    const disable = await requestJson(port, "PATCH", `/api/admin/testing/testers/${encodeURIComponent(email)}`, {
      headers: auth,
      body: { disable: true },
    });
    record("disable_tester", disable.status === 200 && disable.json?.tester?.status === "disabled", disable.json?.tester?.status || disable.json?.error || "");

    const reactivate = await requestJson(port, "PATCH", `/api/admin/testing/testers/${encodeURIComponent(email)}`, {
      headers: auth,
      body: { reactivate: true },
    });
    record("reactivate_tester", reactivate.status === 200 && reactivate.json?.tester?.status !== "disabled", reactivate.json?.tester?.status || "");

    const reset = await requestJson(port, "PATCH", `/api/admin/testing/testers/${encodeURIComponent(email)}/reset-access`, {
      headers: auth,
      body: { mode: "password" },
    });
    record("reset_access", reset.status === 200 && Boolean(reset.json?.temporaryPassword), reset.json?.error || "temp password issued");

    const flagsPut = await requestJson(port, "PUT", "/api/admin/testing/flags", {
      headers: auth,
      body: { flags: { billing: true, aiFeatures: false }, adminEmail: ADMIN_EMAIL },
    });
    record("flags_update", flagsPut.status === 200 && flagsPut.json?.productionUnaffected === true && flagsPut.json?.global?.billing === true, JSON.stringify(flagsPut.json?.global || {}));

    const viewAs = await requestJson(port, "POST", "/api/admin/testing/view-as-log", {
      headers: auth,
      body: { action: "view_as_started", targetEmail: email, role: "Owner" },
    });
    record("view_as_audit", viewAs.status === 200 && viewAs.json?.entry?.action === "view_as_started", viewAs.json?.error || "");

    const audit = await requestJson(port, "GET", "/api/admin/testing/audit", { headers: auth });
    record("audit_log", audit.status === 200 && (audit.json?.audit || []).length >= 3, `count=${(audit.json?.audit || []).length}`);

    const feedbackList = await requestJson(port, "GET", "/api/admin/testing/feedback", { headers: auth });
    record("feedback_inbox", feedbackList.status === 200 && Array.isArray(feedbackList.json?.feedback), `count=${(feedbackList.json?.feedback || []).length}`);

    // Seed one feedback item via public API then update via Owner Admin.
    const feedbackPost = await requestJson(port, "POST", "/api/feedback", {
      body: {
        type: "Bug",
        name: "Tester",
        email: "home.tester@example.invalid",
        subject: "Owner Admin polish check",
        message: "Phase 2 feedback inbox regression",
        context: { testingSite: true, page: "testers", currentRole: "Owner" },
      },
    });
    const feedbackId = feedbackPost.json?.feedback?.id || feedbackPost.json?.item?.id || feedbackPost.json?.id || "";
    record("feedback_submit", feedbackPost.status === 200 || feedbackPost.status === 201, feedbackPost.json?.error || `id=${feedbackId}`);
    if (feedbackId) {
      const feedbackPatch = await requestJson(port, "PATCH", `/api/admin/testing/feedback/${encodeURIComponent(feedbackId)}`, {
        headers: auth,
        body: { status: "In Progress", adminEmail: ADMIN_EMAIL },
      });
      record("feedback_update", feedbackPatch.status === 200 && feedbackPatch.json?.feedback?.status === "In Progress", feedbackPatch.json?.error || "");
    } else {
      record("feedback_update", false, "no feedback id returned");
    }

    // Staff write ACL: assistant cannot overwrite Profiles wholesale when scoped.
    const programOwnership = require("../server/program-ownership.js");
    const store = { users: {}, programs: {}, programData: {}, childData: {}, scheduleByUser: {} };
    const ownerEmail = "acl.owner@example.invalid";
    const assistantEmail = "acl.assistant@example.invalid";
    const program = programOwnership.ensureProgramForOwner(store, ownerEmail, { name: "ACL Program" });
    store.users[ownerEmail] = { email: ownerEmail, role: "owner", programId: program.id };
    store.users[assistantEmail] = {
      email: assistantEmail,
      role: "assistant",
      programId: program.id,
      linkedProgramOwnerEmail: ownerEmail,
      classroomIds: ["classroom-1"],
    };
    const ownerCtx = programOwnership.resolveProgramContext(store, { email: ownerEmail, uid: "u1" });
    programOwnership.writeProgramChildData(store, ownerCtx, {
      ...programOwnership.emptyChildPayload(),
      Profiles: [
        { id: "c1", name: "In Room", classroomId: "classroom-1" },
        { id: "c2", name: "Other Room", classroomId: "classroom-2" },
      ],
      Meals: [{ id: "m1", childId: "c2", date: "2026-08-07" }],
    }, { mergeScoped: false });
    const asstCtx = programOwnership.resolveProgramContext(store, { email: assistantEmail, uid: "u2" });
    record("assistant_can_write", asstCtx.canWriteProgramData === true && asstCtx.writeScope === "assistant", asstCtx.writeScope);
    programOwnership.writeProgramChildData(store, asstCtx, {
      ...programOwnership.emptyChildPayload(),
      Profiles: [{ id: "c1", name: "Renamed", classroomId: "classroom-1" }],
      Meals: [{ id: "m2", childId: "c1", date: "2026-08-07" }],
    });
    const after = programOwnership.readProgramChildData(store, ownerCtx).data;
    const keptOther = (after.Profiles || []).some((p) => p.id === "c2" && p.name === "Other Room");
    const mealOtherKept = (after.Meals || []).some((m) => m.id === "m1");
    const mealNew = (after.Meals || []).some((m) => m.id === "m2");
    record("assistant_scope_preserves_other_room", keptOther && mealOtherKept && mealNew, `profiles=${(after.Profiles || []).length} meals=${(after.Meals || []).length}`);

    // Production fence: without HDH testing, dashboard should 404 — spawn quick check via env already on; verify requireTestingAdmin path by calling with wrong token only covered above.
    record("ui_script_present", fs.existsSync(path.join(ROOT, "scripts/owner-testing-admin-ui.js")), "");
    record("css_present", fs.existsSync(path.join(ROOT, "styles/owner-testing-admin.css")), "");
  } catch (error) {
    record("fatal", false, error.message || String(error));
    if (stderr) console.error(stderr.slice(-2000));
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(storePath); } catch (_e) { /* ignore */ }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach((f) => console.error(`FAIL ${f.id}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
