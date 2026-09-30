"use strict";

const path = require("node:path");
const {
  FREE_ACTIVATION_FUNNEL_STAGE_DEFS,
} = require(path.join(__dirname, "..", "..", "server", "admin-insights.js"));

const EXPECTED_STAGE_KEYS = FREE_ACTIVATION_FUNNEL_STAGE_DEFS.map((def) => def.id);
const EXPECTED_STAGE_LABELS = FREE_ACTIVATION_FUNNEL_STAGE_DEFS.map((def) => def.label);

const CELL_VALUE_RE = /^(Unavailable|Context only|—|\d+(\.\d+)?%|\d+)$/;

function resolveSmokeAdminConfig() {
  const baseUrl = String(
    process.env.LLH_SMOKE_BASE_URL
    || process.env.LLH_PROD_URL
    || "https://littlelearnershubbyleah.com",
  ).replace(/\/+$/, "");
  const email = String(
    process.env.LLH_SMOKE_ADMIN_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.LLH_ADMIN_EMAIL
    || "",
  ).trim();
  const password = String(
    process.env.LLH_SMOKE_ADMIN_PASSWORD
    || process.env.ADMIN_PASSWORD
    || process.env.LLH_ADMIN_PASSWORD
    || "",
  ).trim();
  const accessCode = String(
    process.env.LLH_SMOKE_ADMIN_ACCESS_CODE
    || process.env.ADMIN_ACCESS_CODE
    || process.env.LLH_ADMIN_ACCESS_CODE
    || "",
  ).trim();
  if (!email || !password || !accessCode) {
    return {
      ok: false,
      message:
        "Admin production smoke test skipped: set LLH_SMOKE_ADMIN_EMAIL, LLH_SMOKE_ADMIN_PASSWORD, "
        + "and LLH_SMOKE_ADMIN_ACCESS_CODE (optional LLH_SMOKE_BASE_URL).",
    };
  }
  return { ok: true, baseUrl, email, password, accessCode };
}

function attachAdminInsightsMonitors(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  return {
    assertNoCriticalErrors() {
      const critical = [...consoleErrors, ...pageErrors].filter((entry) =>
        !/favicon|Failed to load resource|net::ERR|ResizeObserver|admin-analytics|third-party|chrome-extension/i.test(entry));
      if (critical.length) {
        throw new Error(`Browser errors on Admin Insights: ${critical.slice(0, 3).join(" | ")}`);
      }
    },
  };
}

async function gotoRetry(page, url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch((e) => ({ error: e }));
    if (!last?.error) return;
    await page.waitForTimeout(1000 * (i + 1));
  }
  throw last.error || new Error(`navigation failed: ${url}`);
}

async function unlockAdminSession(page, config) {
  await gotoRetry(page, `${config.baseUrl}/admin`);
  await page.waitForSelector("#adminUnlockForm", { state: "visible", timeout: 60000 });
  await page.waitForFunction(
    () => typeof window.adminLogin === "function"
      || document.body?.classList?.contains("app-boot-ready"),
    null,
    { timeout: 60000 },
  ).catch(() => {});

  let unlocked = false;
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 3 && !unlocked; attempt += 1) {
    if (attempt > 1) {
      await gotoRetry(page, `${config.baseUrl}/admin`);
      await page.waitForSelector("#adminUnlockForm", { state: "visible", timeout: 60000 });
    }
    const direct = await page.evaluate(async ({ email, password, code }) => {
      try {
        if (typeof adminLogin !== "function" || typeof setAdminSession !== "function") {
          return { ok: false, reason: "helpers-missing" };
        }
        const session = await adminLogin(email, password, code);
        setAdminSession({ ...session, trustedDevice: true });
        if (typeof renderAdminDashboard === "function") renderAdminDashboard();
        if (typeof renderAdminSectionNav === "function") renderAdminSectionNav();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: String(error?.message || error) };
      }
    }, {
      email: config.email,
      password: config.password,
      code: config.accessCode,
    }).catch((error) => ({ ok: false, reason: String(error.message || error) }));

    if (direct.ok) {
      unlocked = true;
      break;
    }
    lastError = direct.reason || "direct-login-failed";
    await page.fill('input[name="adminEmail"]', config.email);
    await page.fill('input[name="adminPassword"]', config.password);
    await page.fill('input[name="adminCode"]', config.accessCode);
    const loginRespPromise = page.waitForResponse(
      (r) => r.url().includes("/api/admin/login"),
      { timeout: 30000 },
    );
    await page.locator("#adminUnlockForm").evaluate((form) => {
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const loginRes = await loginRespPromise.catch(() => null);
    const unlockedAfterSubmit = await page.evaluate(() => {
      let session = {};
      try { session = JSON.parse(localStorage.getItem("llhAdminSession") || "{}"); } catch { /* ignore */ }
      return localStorage.getItem("llhAdminUnlocked") === "true" && Boolean(session.token);
    }).catch(() => false);
    if ((loginRes && loginRes.status() === 200) || unlockedAfterSubmit) {
      unlocked = true;
      break;
    }
    lastError = loginRes ? `HTTP ${loginRes.status()}` : "no response";
    await page.waitForTimeout(1000 * attempt);
  }
  if (!unlocked) {
    throw new Error(`Admin login failed (${lastError})`);
  }

  const insightsSelector = '#adminSectionNav [data-admin-group="insights"]';
  await page.waitForSelector(insightsSelector, { state: "visible", timeout: 60000 });
}

async function openMarketingFunnelHub(page) {
  await page.locator('#adminSectionNav [data-admin-group="insights"]').click({ timeout: 15000 });
  await page.waitForSelector("#adminInsightsApp", { state: "visible", timeout: 20000 });
  await page.evaluate(() => {
    if (typeof window.setAdminSectionTab === "function") {
      window.setAdminSectionTab("marketing-funnel");
    } else {
      document.querySelector('#adminInsightsApp [data-insights-hub="marketing-funnel"]')?.click();
    }
  });
  await page.waitForFunction(
    () => {
      const text = document.querySelector("#adminInsightsApp")?.innerText || "";
      return /Conversion chart/i.test(text)
        && /FREE SIGNUP FUNNEL|Free signup/i.test(text)
        && !/Loading insights/i.test(text);
    },
    null,
    { timeout: 60000 },
  );
  await page.waitForSelector(".admin-insights-free-activation-funnel", { state: "visible", timeout: 60000 });
}

function assertNoPiiInFunnelPayload(funnel) {
  const blob = JSON.stringify(funnel || {});
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(blob)) {
    throw new Error("freeActivationFunnel payload appears to contain an email address");
  }
}

function normalizeStageLabel(cellText) {
  return String(cellText || "")
    .replace(/\s*\(Unavailable for this cohort\)\s*$/i, "")
    .replace(/\s*\(Cohort-linked context only\)\s*$/i, "")
    .trim();
}

async function readActivationTableRows(page) {
  return page.locator(".admin-insights-free-activation-funnel table.admin-insights-table tbody tr").evaluateAll((rows) =>
    rows.map((row) => {
      const cells = [...row.querySelectorAll("td")].map((td) => td.textContent.trim());
      return { cells };
    }));
}

async function verifySectionPlacement(page) {
  const ok = await page.evaluate(() => {
    const app = document.querySelector("#adminInsightsApp");
    if (!app) return false;
    const signup = app.querySelector(".admin-insights-free-signup-funnel");
    const activation = app.querySelector(".admin-insights-free-activation-funnel");
    const chart = app.querySelector(".admin-insights-funnel-vertical");
    if (!signup || !activation || !chart) return false;
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return follows(signup, activation) && follows(activation, chart);
  });
  if (!ok) {
    throw new Error("Free Activation Funnel is not between Free signup funnel and Conversion chart");
  }
}

async function verifyActivationStructure(page) {
  await verifySectionPlacement(page);
  const rows = await readActivationTableRows(page);
  if (rows.length !== EXPECTED_STAGE_KEYS.length) {
    throw new Error(`Expected ${EXPECTED_STAGE_KEYS.length} activation stage rows, saw ${rows.length}`);
  }
  rows.forEach((row, index) => {
    if (row.cells.length !== 4) {
      throw new Error(`Stage row ${index + 1} expected 4 cells, saw ${row.cells.length}`);
    }
    const label = normalizeStageLabel(row.cells[0]);
    const expectedLabel = EXPECTED_STAGE_LABELS[index];
    if (label !== expectedLabel) {
      throw new Error(`Stage ${index + 1} label mismatch: expected "${expectedLabel}", saw "${label}"`);
    }
    for (let c = 1; c < 4; c += 1) {
      if (!CELL_VALUE_RE.test(row.cells[c])) {
        throw new Error(`Unexpected cell value at row ${index + 1} col ${c + 1}: ${row.cells[c]}`);
      }
    }
  });
  const signupVisible = await page.locator(".admin-insights-free-signup-funnel").isVisible();
  const chartVisible = await page.locator(".admin-insights-funnel-vertical").isVisible();
  if (!signupVisible || !chartVisible) {
    throw new Error("Free signup funnel or Conversion chart missing while verifying activation funnel");
  }
}

async function waitForCohortInsightsResponse(page, cohort) {
  const predicate = (response) => {
    const url = response.url();
    if (!url.includes("/api/admin/insights") || !url.includes("hub=marketing-funnel")) return false;
    if (cohort === "all") return !url.includes("cohort=");
    return url.includes(`cohort=${cohort}`);
  };
  return page.waitForResponse(predicate, { timeout: 60000 });
}

async function selectActivationCohort(page, cohort) {
  const responsePromise = waitForCohortInsightsResponse(page, cohort);
  await page.selectOption("#insightsActivationCohort", cohort);
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Insights request failed for cohort=${cohort} (HTTP ${response.status()})`);
  }
  const body = await response.json();
  await page.waitForSelector(".admin-insights-free-activation-funnel table.admin-insights-table tbody tr", {
    state: "visible",
    timeout: 60000,
  });
  return body?.insights?.data?.freeActivationFunnel || null;
}

async function verifyCohortApiAndUi(page, cohort) {
  const funnel = await selectActivationCohort(page, cohort);
  if (!funnel || !Array.isArray(funnel.stages)) {
    throw new Error(`Missing freeActivationFunnel in API response for cohort=${cohort}`);
  }
  assertNoPiiInFunnelPayload(funnel);
  if (funnel.stages.length !== EXPECTED_STAGE_KEYS.length) {
    throw new Error(`API returned ${funnel.stages.length} stages for cohort=${cohort}`);
  }
  funnel.stages.forEach((stage, index) => {
    if (stage.key !== EXPECTED_STAGE_KEYS[index]) {
      throw new Error(`API stage order mismatch at index ${index} for cohort=${cohort}`);
    }
  });

  const selected = await page.locator("#insightsActivationCohort").inputValue();
  if (selected !== cohort) {
    throw new Error(`Cohort selector shows "${selected}" after selecting "${cohort}"`);
  }

  await verifyActivationStructure(page);

  if (cohort === "pre_pr853") {
    const explore = funnel.stages.find((s) => s.key === "exploreLessonPlansClicked");
    if (explore && explore.dataAvailable === false) {
      const exploreRow = page.locator(".admin-insights-free-activation-funnel tr", {
        hasText: "Explore Lesson Plans clicked",
      });
      const rowText = await exploreRow.innerText();
      if (!/Unavailable/.test(rowText) || /\b0%\b/.test(rowText)) {
        throw new Error("pre_pr853 explore stage should render Unavailable, not 0%");
      }
    }
  }

  if (cohort !== "all") {
    const home = funnel.stages.find((s) => s.key === "homepageVisitors");
    if (home?.cohortContextOnly) {
      const homeRow = page.locator(".admin-insights-free-activation-funnel tr", {
        hasText: "Homepage visitors",
      });
      const rowText = await homeRow.innerText();
      if (!/Context only/.test(rowText)) {
        throw new Error(`cohort=${cohort} homepage row should show Context only conversions`);
      }
    }
  }
}

async function runFreeActivationFunnelChecks(page, { saveFailureArtifacts } = {}) {
  await verifyActivationStructure(page);
  for (const cohort of ["all", "pre_pr853", "post_pr853"]) {
    await verifyCohortApiAndUi(page, cohort);
  }
}

async function captureFailureArtifacts(page, artifactDir) {
  const fs = require("node:fs");
  fs.mkdirSync(artifactDir, { recursive: true });
  const target = page.locator(".admin-insights-free-activation-funnel");
  if (await target.count()) {
    await target.screenshot({ path: path.join(artifactDir, "free-activation-funnel.png") }).catch(() => {});
    const tableText = await target.innerText().catch(() => "");
    fs.writeFileSync(path.join(artifactDir, "free-activation-funnel.txt"), tableText.slice(0, 12000));
  }
}

module.exports = {
  EXPECTED_STAGE_KEYS,
  EXPECTED_STAGE_LABELS,
  resolveSmokeAdminConfig,
  attachAdminInsightsMonitors,
  unlockAdminSession,
  openMarketingFunnelHub,
  runFreeActivationFunnelChecks,
  captureFailureArtifacts,
  verifyActivationStructure,
  assertNoPiiInFunnelPayload,
};
