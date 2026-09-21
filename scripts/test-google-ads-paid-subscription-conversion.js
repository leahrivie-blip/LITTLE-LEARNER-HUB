#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "google-ads-paid-subscription-conversion.js"),
  "utf8",
);
const SEND_TO = "AW-18405245658/oFU5CM7VwYAdENqFp8hE";

function boot({ consent = true, gtag } = {}) {
  const session = new Map();
  const calls = [];
  const window = {
    LLHGoogleConsent: { hasConsent: () => consent },
    gtag: gtag || ((...args) => calls.push(args)),
    sessionStorage: {
      getItem: (key) => session.get(key) || null,
      setItem: (key, value) => session.set(key, value),
    },
  };
  vm.runInNewContext(source, { window });
  return { api: window.LLHGoogleAdsPaidSubscriptionConversion, calls, session };
}

function verifiedPayment(overrides = {}) {
  return {
    sessionId: "cs_paid_123",
    amountTotal: 1999,
    currency: "USD",
    trialDays: 0,
    ...overrides,
  };
}

{
  const app = boot();
  assert.equal(app.api.emitAfterPaidSubscriptionConfirmed(verifiedPayment()), true);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][0], "event");
  assert.equal(app.calls[0][1], "conversion");
  assert.equal(app.calls[0][2].send_to, SEND_TO);
  assert.equal(app.calls[0][2].value, 19.99);
  assert.equal(app.calls[0][2].currency, "USD");
  assert.equal(app.calls[0][2].transaction_id, "cs_paid_123");
  assert.equal(app.api.emitAfterPaidSubscriptionConfirmed(verifiedPayment()), false, "refreshes must not duplicate a paid conversion");
  assert.equal(app.calls.length, 1);
}

for (const details of [
  verifiedPayment({ trialDays: 7 }),
  verifiedPayment({ amountTotal: 0 }),
  verifiedPayment({ currency: "CAD" }),
  verifiedPayment({ sessionId: "" }),
]) {
  const app = boot();
  assert.equal(app.api.emitAfterPaidSubscriptionConfirmed(details), false, "trial, missing, zero-value, or non-USD sessions must not convert");
  assert.equal(app.calls.length, 0);
}

{
  const app = boot({ consent: false });
  assert.equal(app.api.emitAfterPaidSubscriptionConfirmed(verifiedPayment()), false, "consent must gate paid conversion");
  assert.equal(app.calls.length, 0);
}

{
  const app = boot({ gtag: () => { throw new Error("gtag unavailable"); } });
  assert.equal(app.api.emitAfterPaidSubscriptionConfirmed(verifiedPayment()), false);
  assert.equal(app.session.get("llhGoogleAdsPaidSubscriptionConversion:cs_paid_123"), undefined, "a failed gtag call must remain retryable");
}

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const serverJs = fs.readFileSync(path.join(__dirname, "..", "server/index.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(serverJs, /const paymentConfirmed = session\.payment_status === "paid";/);
assert.match(serverJs, /paymentConfirmed,/);
assert.match(serverJs, /amountTotal: Number\.isFinite\(Number\(session\.amount_total\)\)/);
assert.match(appJs, /if \(session\.paymentConfirmed === true\) \{[\s\S]*?emitAfterPaidSubscriptionConfirmed/);
assert.match(appJs, /sessionId: session\.sessionId,[\s\S]*?amountTotal: session\.amountTotal,[\s\S]*?currency: session\.currency/);
assert.match(indexHtml, /google-ads-paid-subscription-conversion\.js/);

console.log("PASS: guarded Google Ads paid subscription conversion");
