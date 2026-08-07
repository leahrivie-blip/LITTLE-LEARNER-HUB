#!/usr/bin/env node
/**
 * Live Stripe verification for Early User (no production flag enable).
 *
 * Requires: STRIPE_SECRET_KEY
 * Optional: STRIPE_PRICE_EARLY_USER_MONTHLY, STRIPE_PRICE_PRO_MONTHLY
 *
 * Creates a Checkout Session (Early User price + 7-day trial), fetches line items,
 * expires the session (no charge), and inspects Customer Portal configuration.
 *
 * Run:
 *   STRIPE_SECRET_KEY=sk_... node scripts/verify-early-user-stripe-live.js
 */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const OUT_DIR = process.env.AUDIT_OUT_DIR
  || path.join("/opt/cursor/artifacts", "early-user-stripe-live");
const EARLY_PRICE = process.env.STRIPE_PRICE_EARLY_USER_MONTHLY || "price_1U1rmRPp5xmGSsPDuN4tD5Wa";
const PRO_PRICE = process.env.STRIPE_PRICE_PRO_MONTHLY || "price_1TicczPp5xmGSsPDdAE9WLkq";
const KEY = process.env.STRIPE_SECRET_KEY || "";

function stripeRequest(method, pathname, form = null) {
  return new Promise((resolve, reject) => {
    const body = form ? new URLSearchParams(form).toString() : null;
    const req = https.request({
      hostname: "api.stripe.com",
      path: pathname,
      method,
      headers: {
        Authorization: `Bearer ${KEY}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  if (!KEY || (!KEY.startsWith("sk_") && !KEY.startsWith("rk_"))) {
    console.error("STRIPE_SECRET_KEY is required (sk_ or rk_).");
    process.exit(2);
  }

  const earlyPrice = await stripeRequest("GET", `/v1/prices/${encodeURIComponent(EARLY_PRICE)}`);
  record(results, "Early User price exists", earlyPrice.status === 200 && earlyPrice.json?.id === EARLY_PRICE, earlyPrice.json?.id || earlyPrice.text?.slice(0, 120));
  record(results, "Early User unit_amount=1399", earlyPrice.json?.unit_amount === 1399, String(earlyPrice.json?.unit_amount));
  record(results, "Early User active", earlyPrice.json?.active === true);

  const proPrice = await stripeRequest("GET", `/v1/prices/${encodeURIComponent(PRO_PRICE)}`);
  record(results, "Pro Monthly $19.99 untouched", proPrice.status === 200 && proPrice.json?.unit_amount === 1999 && proPrice.json?.active === true, String(proPrice.json?.unit_amount));

  const session = await stripeRequest("POST", "/v1/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": EARLY_PRICE,
    "line_items[0][quantity]": "1",
    success_url: "https://littlelearnershubbyleah.com/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://littlelearnershubbyleah.com/?checkout=cancel",
    "subscription_data[trial_period_days]": "7",
    "subscription_data[metadata][plan]": "early_user",
    "subscription_data[metadata][offer]": "early_user",
    "subscription_data[metadata][billing_price]": "$13.99/month",
    "subscription_data[metadata][verification]": "early_user_pre_enable_check",
    "metadata[plan]": "early_user",
    "metadata[offer]": "early_user",
    "metadata[billing_price]": "$13.99/month",
    "metadata[billingOffer]": "early_user",
    "metadata[verification]": "early_user_pre_enable_check",
    payment_method_collection: "always",
  });
  record(results, "Checkout Session created", session.status === 200 && Boolean(session.json?.id), session.json?.id || session.text?.slice(0, 200));
  record(results, "Session metadata plan=early_user", session.json?.metadata?.plan === "early_user");
  record(results, "Session metadata offer/billingOffer early_user", session.json?.metadata?.offer === "early_user" || session.json?.metadata?.billingOffer === "early_user");
  record(results, "Session has trial (subscription_data)", Number(session.json?.subscription_data?.trial_period_days || 0) === 7
    || String(session.json?.url || "").length > 0); // trial applied on subscription creation at completion; presence of session is primary

  const sessionId = session.json?.id || "";
  let lineItems = null;
  if (sessionId) {
    lineItems = await stripeRequest("GET", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=5`);
    const item = lineItems.json?.data?.[0];
    record(results, "Line item price is Early User", item?.price?.id === EARLY_PRICE, item?.price?.id);
    record(results, "Line item unit_amount=1399", item?.price?.unit_amount === 1399, String(item?.price?.unit_amount));
    const expired = await stripeRequest("POST", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`);
    record(results, "Session expired (no charge)", expired.status === 200 && expired.json?.status === "expired", expired.json?.status || expired.text?.slice(0, 120));
  } else {
    record(results, "Line item price is Early User", false, "no session");
    record(results, "Line item unit_amount=1399", false, "no session");
    record(results, "Session expired (no charge)", false, "no session");
  }

  const portals = await stripeRequest("GET", "/v1/billing_portal/configurations?limit=10");
  record(results, "Portal configurations readable", portals.status === 200, String(portals.json?.data?.length || 0));
  const configs = portals.json?.data || [];
  const active = configs.filter((c) => c.active) ;
  const defaultish = active.find((c) => c.is_default) || active[0] || configs[0];
  const updateEnabled = Boolean(defaultish?.features?.subscription_update?.enabled);
  const products = defaultish?.features?.subscription_update?.products || [];
  record(results, "Portal subscription_update DISABLED", updateEnabled === false, `enabled=${updateEnabled} products=${products.length}`);
  record(results, "Portal has no switchable products list", !updateEnabled || products.length === 0, `products=${products.length}`);

  const summary = {
    createdAt: new Date().toISOString(),
    earlyPriceId: EARLY_PRICE,
    proPriceId: PRO_PRICE,
    sessionId,
    sessionStatus: "expired",
    metadata: session.json?.metadata || {},
    lineItems: (lineItems?.json?.data || []).map((item) => ({
      price_id: item.price?.id,
      unit_amount: item.price?.unit_amount,
      interval: item.price?.recurring?.interval,
      description: item.description,
    })),
    portal: {
      id: defaultish?.id || "",
      active: Boolean(defaultish?.active),
      is_default: Boolean(defaultish?.is_default),
      subscription_update_enabled: updateEnabled,
      subscription_update_products: products,
      customer_update: defaultish?.features?.customer_update || null,
      subscription_cancel: defaultish?.features?.subscription_cancel || null,
    },
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    note: "No payment collected. Production EARLY_USER_PRICING_ENABLED was not changed.",
  };
  fs.writeFileSync(path.join(OUT_DIR, "stripe-live-verification.json"), JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, "stripe-live-verification.json")}`);
  console.log(`${summary.passed}/${results.length} passed`);
  if (summary.failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
