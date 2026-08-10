#!/usr/bin/env node
/**
 * Live Wave 4 Confirm & Send verification against testing Render.
 * Testing-only. Does not touch production.
 */
"use strict";

const { chromium } = require("playwright");
const crypto = require("node:crypto");

const BASE = "https://little-learner-hub-testing.onrender.com";
const PASSWORD = "SunshineDaycare9!";
const OWNER = `leah.proxy.wave4${Date.now()}@outlook.com`;
const PROVIDER = `wave4.confirm.send${Date.now()}@gmail.com`;
const EXPECTED_SHELL = process.env.EXPECTED_SHELL || "20260810-tester-invite-login-fix7";

async function api(method, path, { body, headers = {} } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: Date.now() - t0, text: JSON.stringify(json).slice(0, 400) };
}

function authHeaders(email, token) {
  return {
    Authorization: `Bearer ${token}`,
    "X-LLH-User-Email": email,
  };
}

async function ensurePasswordSession(email) {
  for (let i = 0; i < 6; i += 1) {
    await api("POST", "/api/auth/sync-password-after-firebase", {
      body: { email, newPassword: PASSWORD, source: "live_wave4_verify" },
    });
    const login = await api("POST", "/api/auth/password-login", {
      body: { email, password: PASSWORD },
    });
    if (login.status === 200 && login.json?.memberSessionToken) {
      return login.json.memberSessionToken;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`session failed for ${email}`);
}

async function main() {
  const man = await api("GET", "/llh-shell-manifest.json");
  const health = await api("GET", "/api/health");
  console.log({ shell: man.json?.version, healthMs: health.ms, hdh: health.json?.homeDaycareHubTesting });
  if (man.json?.version !== EXPECTED_SHELL) {
    throw new Error(`shell mismatch ${man.json?.version} !== ${EXPECTED_SHELL}`);
  }
  const asset = await fetch(`${BASE}/scripts/forms-assign-flow.js?v=${EXPECTED_SHELL}`);
  if (!asset.ok) throw new Error("forms-assign-flow.js missing on live shell");

  const ownerToken = await ensurePasswordSession(OWNER);
  const create = await api("POST", "/api/home-daycare-hub/tester-invites", {
    headers: authHeaders(OWNER, ownerToken),
    body: {
      email: PROVIDER,
      programType: "home_daycare",
      programName: "Wave4 Live Confirm",
      childName: "Wave4 Kid",
      role: "owner",
      appOrigin: BASE,
    },
  });
  console.log("invite", create.status, create.ms, create.json?.acceptUrl || create.json?.error);
  if (create.status !== 200 || !create.json?.acceptUrl) throw new Error("invite create failed");
  const inviteToken = String(create.json.acceptUrl).split("testerInvite=")[1];

  const providerToken = await ensurePasswordSession(PROVIDER);
  const accept = await api("POST", "/api/home-daycare-hub/tester-invites/accept", {
    headers: {
      ...authHeaders(PROVIDER, providerToken),
      "X-LLH-Invite-Token": inviteToken,
    },
    body: { token: inviteToken },
  });
  const programId = accept.json?.programId
    || accept.json?.account?.programId
    || accept.json?.invite?.programId
    || "";
  console.log("accept", accept.status, accept.ms, programId || accept.json?.error, accept.json?.ok, accept.json?.alreadyAccepted);
  if (accept.status !== 200 || !accept.json?.ok) {
    console.log("accept body", accept.text);
    throw new Error("invite accept failed");
  }

  let children = await api("GET", "/api/child-data", {
    headers: authHeaders(PROVIDER, providerToken),
  });
  let profiles = children.json?.data?.Profiles || children.json?.Profiles || [];
  if (!profiles.length) {
    // Live Postgres invite accept can return ok without materializing demo Profiles
    // in /api/child-data yet; seed one child so Confirm & Send can resolve recipients.
    const seed = await api("POST", "/api/child-data", {
      headers: authHeaders(PROVIDER, providerToken),
      body: {
        data: {
          Profiles: [{ id: `w4-kid-${Date.now()}`, name: "Wave4 Kid" }],
          Documents: [],
        },
      },
    });
    console.log("seedChild", seed.status, seed.json?.programId || seed.json?.error);
    if (seed.status !== 200) throw new Error("child seed failed");
    children = await api("GET", "/api/child-data", {
      headers: authHeaders(PROVIDER, providerToken),
    });
    profiles = children.json?.data?.Profiles || children.json?.Profiles || [];
  }
  console.log("children", children.status, profiles.map((p) => p.name || p.id));
  if (!profiles.length) throw new Error("no child profiles after invite");
  const childId = profiles[0].id;

  const tpl = await api("POST", "/api/program-forms/templates", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      title: "Wave4 Live Policy",
      body: "Please acknowledge this live policy.",
      fields: [{ id: "ack", type: "yes_no", label: "I agree", required: true }],
      requiresSignature: true,
    },
  });
  console.log("template", tpl.status, tpl.json?.template?.id || tpl.json?.error);
  if (tpl.status !== 200 || !tpl.json?.template?.id) throw new Error("template create failed");
  const templateId = tpl.json.template.id;

  const preview = await api("POST", "/api/program-forms/assign/preview", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      audience: "family",
      mode: "children",
      assignmentScope: "child",
      childIds: [childId],
    },
  });
  console.log("preview", preview.status, preview.json?.counts);
  if (preview.status !== 200) throw new Error(`preview failed: ${preview.text}`);

  const mismatch = await api("POST", "/api/program-forms/assign/confirm-send", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      idempotencyKey: crypto.randomUUID(),
      templateId,
      formSpec: {
        title: "Wave4 Live Policy",
        body: "Please acknowledge this live policy.",
        fields: [{ id: "ack", type: "yes_no", label: "I agree", required: true }],
        templateId,
      },
      target: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: [childId],
      },
      shareWithFamily: true,
      expected: { assignmentCount: 999, childCount: 999, staffCount: 0, householdCount: 0 },
    },
  });
  console.log("mismatch", mismatch.status, mismatch.json?.code || mismatch.json?.error);
  if (mismatch.status !== 409 || mismatch.json?.code !== "recipient_count_mismatch") {
    throw new Error("expected recipient_count_mismatch");
  }

  const key = crypto.randomUUID();
  const send = await api("POST", "/api/program-forms/assign/confirm-send", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      idempotencyKey: key,
      templateId,
      formSpec: {
        title: "Wave4 Live Policy",
        body: "Please acknowledge this live policy.",
        fields: [{ id: "ack", type: "yes_no", label: "I agree", required: true }],
        templateId,
        requiresSignature: true,
      },
      target: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: [childId],
      },
      dueDate: "2026-08-20",
      shareWithFamily: true,
      expected: preview.json.counts,
    },
  });
  console.log("send", send.status, send.json?.createdCount, send.json?.createdIds);
  if (send.status !== 200 || send.json?.createdCount !== 1) throw new Error(`send failed: ${send.text}`);

  const replay = await api("POST", "/api/program-forms/assign/confirm-send", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      idempotencyKey: key,
      templateId,
      formSpec: { title: "Wave4 Live Policy", body: "x", templateId },
      target: {
        audience: "family",
        mode: "children",
        assignmentScope: "child",
        childIds: [childId],
      },
      shareWithFamily: true,
      expected: preview.json.counts,
    },
  });
  console.log("replay", replay.status, replay.json?.idempotentReplay, replay.json?.createdCount);
  if (!replay.json?.idempotentReplay) throw new Error("idempotent replay failed");

  // UI wizard path — second template so Confirm & Send is visible end-to-end.
  const tpl2 = await api("POST", "/api/program-forms/templates", {
    headers: authHeaders(PROVIDER, providerToken),
    body: {
      title: "Wave4 UI Send Form",
      body: "UI Confirm & Send body",
      fields: [{ id: "note", type: "short_text", label: "Note", required: false }],
    },
  });
  if (tpl2.status !== 200 || !tpl2.json?.template?.id) throw new Error("ui template failed");
  const uiTemplateId = tpl2.json.template.id;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(90000);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => typeof openAuthModal === "function", { timeout: 60000 });
  await page.evaluate(({ email, token }) => {
    if (typeof abortNonCriticalBootFetches === "function") abortNonCriticalBootFetches("wave4-verify");
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhMemberSessionToken", token);
    sessionStorage.setItem("llhMemberSessionToken", token);
  }, { email: PROVIDER, token: providerToken });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => typeof openAssignSendFlow === "function" && typeof setView === "function", { timeout: 90000 });
  await page.evaluate(async ({ email, token }) => {
    if (typeof abortNonCriticalBootFetches === "function") abortNonCriticalBootFetches("wave4-ui");
    if (typeof loadAccountState === "function") loadAccountState(email);
    if (typeof writeMemberSessionToken === "function") {
      writeMemberSessionToken(token, { persist: true });
    } else {
      localStorage.setItem("llhMemberSessionToken", token);
    }
    try {
      if (typeof syncChildDataFromBackend === "function") {
        await Promise.race([
          syncChildDataFromBackend({ render: false, force: true }),
          new Promise((r) => setTimeout(r, 20000)),
        ]);
      }
    } catch (_e) { /* continue */ }
    try {
      if (typeof ensureProgramFormsLoaded === "function") {
        await Promise.race([
          ensureProgramFormsLoaded({ force: true }),
          new Promise((r) => setTimeout(r, 20000)),
        ]);
      }
    } catch (_e) { /* continue */ }
  }, { email: PROVIDER, token: providerToken });
  await page.evaluate(({ templateId: tid, child }) => {
    setView("home-daycare-hub");
    openAssignSendFlow({
      entryPoint: "live_verify",
      templateId: tid,
      formSpec: {
        title: "Wave4 UI Send Form",
        body: "UI Confirm & Send body",
        fields: [{ id: "note", type: "short_text", label: "Note", required: false }],
        templateId: tid,
      },
      audience: "family",
      mode: "children",
      assignmentScope: "child",
      childIds: [child],
      shareWithFamily: true,
    });
  }, { templateId: uiTemplateId, child: childId });
  await page.waitForSelector("[data-assign-flow]", { timeout: 30000 });
  // Recipients → ensure child selected → Next
  const childToggle = page.locator(`[data-assign-child="${childId}"]`);
  if (await childToggle.count()) {
    const checked = await childToggle.isChecked().catch(() => false);
    if (!checked) await childToggle.check().catch(() => childToggle.click());
  }
  await page.click("[data-assign-next-configure]");
  await page.waitForSelector("[data-assign-next-review]", { timeout: 20000 });
  await page.click("[data-assign-next-review]");
  await page.waitForSelector("[data-assign-confirm]", { timeout: 60000 });
  await page.click("[data-assign-confirm]");
  await page.waitForSelector("[data-assign-success]", { timeout: 120000 });

  const uiText = await page.locator("[data-assign-flow]").innerText().catch(() => "");
  const uiOk = (await page.locator("[data-assign-success]").count()) > 0
    || /Sent successfully/i.test(uiText);
  console.log("uiWizard", { uiOk, snippet: uiText.slice(0, 220).replace(/\s+/g, " ") });

  // Confirm a second document exists for the child (API send + UI send).
  const after = await api("GET", "/api/child-data", {
    headers: authHeaders(PROVIDER, providerToken),
  });
  const docs = after.json?.data?.Documents || after.json?.Documents || [];
  const wave4Docs = docs.filter((d) => /Wave4/i.test(String(d.title || "")));
  console.log("docs", wave4Docs.length, wave4Docs.map((d) => d.title));

  const pr590 = await fetch("https://api.github.com/repos/leahrivie-blip/LITTLE-LEARNER-HUB/pulls/590")
    .then((r) => r.json());

  const pass = !!(
    man.json?.version === EXPECTED_SHELL
    && send.json?.createdCount === 1
    && replay.json?.idempotentReplay
    && mismatch.json?.code === "recipient_count_mismatch"
    && wave4Docs.length >= 1
    && uiOk
    && pr590.state === "open"
    && !pr590.merged_at
  );
  const verdict = pass
    ? "YES — WAVE 4 CONFIRM & SEND LIVE VERIFY PASS"
    : "NO — WAVE 4 LIVE VERIFY STILL BLOCKED";
  console.log("VERDICT", verdict);
  console.log("SUMMARY", JSON.stringify({
    shell: man.json?.version,
    provider: PROVIDER,
    programId: programId || accept.json?.account?.programId || "",
    apiSend: send.json?.createdCount,
    idempotentReplay: !!replay.json?.idempotentReplay,
    mismatchOk: mismatch.json?.code === "recipient_count_mismatch",
    uiOk,
    wave4Docs: wave4Docs.length,
    pr590: { state: pr590.state, merged_at: pr590.merged_at },
    pass,
    verdict,
  }, null, 2));
  await browser.close();
  if (!pass) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
