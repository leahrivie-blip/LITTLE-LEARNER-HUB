#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const calls = [];
const session = new Map();
const window = {
  gtag: (...args) => calls.push(args),
  sessionStorage: { getItem: (key) => session.get(key) || null, setItem: (key, value) => session.set(key, value) },
};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "scripts/google-ads-conversions.js"), "utf8"), { window });

const ads = window.LLHGoogleAdsConversions;
assert.equal(ads.emit("free_signup", { dedupeKey: "free-1" }), true);
assert.equal(calls[0][2].send_to, "AW-18405245658/fkIMCOi6xO0cENqFp8hE");
assert.equal(ads.emit("trial_start", { dedupeKey: "trial-1" }), true);
assert.equal(calls[1][2].send_to, "AW-18405245658/yNEYCOu6xO0cENqFp8hE");
assert.equal(ads.emit("paid_subscription", { dedupeKey: "paid-1", transactionId: "cs_123", value: 19.99, currency: "usd" }), true);
assert.equal(calls[2][2].send_to, "AW-18405245658/uUk_CO66xO0cENqFp8hE");
assert.equal(calls[2][2].transaction_id, "cs_123");
assert.equal(calls[2][2].value, 19.99);
assert.equal(calls[2][2].currency, "USD");
assert.equal(ads.emit("paid_subscription", { dedupeKey: "paid-1", transactionId: "cs_123", value: 19.99, currency: "USD" }), false);
assert.equal(ads.emit("paid_subscription", { dedupeKey: "bad", value: 19.99, currency: "USD" }), false);

const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const server = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
assert.ok(app.indexOf("googleAdsFreeSignupComplete: true") > app.indexOf('if (planChoice === "free")'));
assert.ok(app.includes("session.googleAdsConversion"));
assert.ok(server.includes('session?.payment_status === "paid"'));
assert.ok(server.includes("googleAdsPaidSubscriptionTransactionId"));
assert.ok(server.includes('subscription?.status === "trialing"'));
console.log("PASS: Google Ads conversion helper and guarded hooks");
