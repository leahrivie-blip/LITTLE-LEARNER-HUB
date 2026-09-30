#!/usr/bin/env node
/**
 * Read-only production smoke: Admin → Insights → Marketing Funnel → Free Activation Funnel.
 *
 * Requires runtime env (never commit credentials):
 *   LLH_SMOKE_ADMIN_EMAIL
 *   LLH_SMOKE_ADMIN_PASSWORD
 *   LLH_SMOKE_ADMIN_ACCESS_CODE
 * Optional:
 *   LLH_SMOKE_BASE_URL (default https://littlelearnershubbyleah.com)
 *
 * Run: npm run test:production-admin-funnel
 */
"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const {
  resolveSmokeAdminConfig,
  attachAdminInsightsMonitors,
  unlockAdminSession,
  openMarketingFunnelHub,
  runFreeActivationFunnelChecks,
  captureFailureArtifacts,
} = require("./test-helpers/production-admin-funnel-smoke");

const ARTIFACT_DIR = path.join("/opt/cursor/artifacts", "production-admin-funnel-smoke");

async function main() {
  const config = resolveSmokeAdminConfig();
  if (!config.ok) {
    console.error(config.message);
    process.exit(2);
  }

  console.log(`Production Admin Free Activation Funnel smoke (read-only)\nBase URL: ${config.baseUrl}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const monitors = attachAdminInsightsMonitors(page);

  try {
    await unlockAdminSession(page, config);
    await openMarketingFunnelHub(page);
    await runFreeActivationFunnelChecks(page);
    monitors.assertNoCriticalErrors();
    console.log("PASS production Admin Free Activation Funnel smoke");
  } catch (error) {
    await captureFailureArtifacts(page, ARTIFACT_DIR);
    console.error(`FAIL production Admin Free Activation Funnel smoke: ${error.message || error}`);
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
