#!/usr/bin/env node
/**
 * READ-ONLY CLI for the admin Stripe billing reconciliation check.
 *
 * Calls GET /api/admin/billing-reconciliation, which compares what's stored locally
 * (subscriptionStatus / stripeSubscriptionStatus / lastFailedPaymentAt / nextPaymentRetryAt)
 * against Stripe's *current* subscription status for the same account, using Stripe GET
 * requests only.
 *
 * This script — and the endpoint it calls — NEVER:
 *   - writes to the local store
 *   - writes to Stripe (no cancels, no charges, no retries)
 *   - sends emails
 * It only reports discrepancies for a human to review and decide what (if anything) to do.
 *
 * Usage:
 *   node scripts/stripe-billing-reconciliation-check.js \
 *     --base=https://your-app.example.com \
 *     --admin-token=<admin session token from Admin login> \
 *     [--email=user@example.com] \
 *     [--emails=a@example.com,b@example.com]
 *
 * With neither --email nor --emails, checks every account the app currently flags as
 * "needs_billing_review" (server bounds this to 25 accounts per call).
 *
 * Env var fallbacks: LLH_ADMIN_BASE_URL, LLH_ADMIN_TOKEN.
 */
"use strict";

function argValue(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

async function main() {
  const base = argValue("--base=") || process.env.LLH_ADMIN_BASE_URL || "";
  const adminToken = argValue("--admin-token=") || process.env.LLH_ADMIN_TOKEN || "";
  const email = argValue("--email=");
  const emails = argValue("--emails=");

  if (!base) {
    console.error("Missing --base=<https://your-app> (or set LLH_ADMIN_BASE_URL).");
    process.exit(1);
  }
  if (!adminToken) {
    console.error("Missing --admin-token=<token> (or set LLH_ADMIN_TOKEN). Get a token by logging into Admin.");
    process.exit(1);
  }

  const url = new URL("/api/admin/billing-reconciliation", base);
  url.searchParams.set("adminToken", adminToken);
  if (email) url.searchParams.set("email", email);
  if (emails) url.searchParams.set("emails", emails);

  console.error(`READ-ONLY check — GET ${url.origin}${url.pathname}${email || emails ? " (scoped)" : " (default: needs_billing_review bucket)"}`);

  let response;
  try {
    response = await fetch(url.toString());
  } catch (error) {
    console.error(`Request failed: ${error.message || error}`);
    process.exit(1);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    console.error(`Non-JSON response (status ${response.status}).`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`Request failed (status ${response.status}):`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(body, null, 2));

  const mismatches = (body.results || []).filter((r) => r && r.matches === false);
  if (mismatches.length) {
    console.error(`\n${mismatches.length} of ${body.count || 0} account(s) disagree with Stripe's current status — see "discrepancies" above. No changes were made.`);
  } else {
    console.error(`\nAll ${body.count || 0} checked account(s) match Stripe's current status (or none matched the filter). No changes were made.`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
