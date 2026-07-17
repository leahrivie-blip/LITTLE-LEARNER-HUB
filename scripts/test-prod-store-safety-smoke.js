#!/usr/bin/env node
/**
 * Live production smoke checks for post-recovery store safety deploy.
 * Read-only unless RUN_BACKUP_CREATE=1 is set.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_ACCESS_CODE=... \
 *   node scripts/test-prod-store-safety-smoke.js
 */
const assert = require("node:assert/strict");

const BASE = process.env.LLH_PROD_URL || "https://little-learner-hub.onrender.com";
const email = process.env.ADMIN_EMAIL || "";
const password = process.env.ADMIN_PASSWORD || "";
const code = process.env.ADMIN_ACCESS_CODE || "";

async function req(method, path, payload, token) {
  const headers = { "Cache-Control": "no-store" };
  let body;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }
  let url = `${BASE}${path}`;
  if (token && method === "GET" && !url.includes("adminToken=")) {
    url += `${url.includes("?") ? "&" : "?"}adminToken=${encodeURIComponent(token)}`;
  }
  const res = await fetch(url, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  assert.ok(email && password && code, "ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE required");

  const health = await req("GET", "/api/health");
  assert.equal(health.res.status, 200);
  assert.equal(health.data.ok, true);
  console.log("PASS  health ok");

  const login = await req("POST", "/api/admin/login", { email, password, code });
  assert.equal(login.res.status, 200, JSON.stringify(login.data));
  const token = login.data.token || login.data.adminToken;
  assert.ok(token);
  console.log("PASS  admin login");

  const storeHealth = await req("GET", "/api/admin/store-health", undefined, token);
  assert.equal(storeHealth.res.status, 200);
  const userCount = Number(storeHealth.data.health.counts.users || 0);
  // Directory grew after Firebase/Postgres recovery + new signups (was 52 at earlier checkpoint).
  assert.ok(userCount >= 52, `expected at least 52 users, got ${userCount}`);
  assert.equal(storeHealth.data.health.counts.foundingMembers, 13);
  console.log(`PASS  store health users=${userCount} founding=13`);

  const analytics = await req("GET", "/api/admin/analytics", undefined, token);
  assert.equal(analytics.res.status, 200);
  const users = analytics.data.analytics?.users || [];
  assert.equal(users.length, userCount);
  const paid = users.filter((u) => u.hasProAccess).length;
  assert.equal(paid, 10);
  console.log(`PASS  admin analytics shows ${users.length} users / ${paid} paid`);

  // Public site content still has recovery banner; curriculum lives in admin site-content.
  const site = await req("GET", "/api/site-content");
  assert.equal(site.res.status, 200);
  const publicContent = site.data.siteContent || site.data;
  assert.equal(publicContent.announcement?.visible, true);
  assert.match(String(publicContent.announcement?.text || ""), /Account recovery is in progress/i);
  const adminSite = await req("GET", "/api/admin/site-content", undefined, token);
  assert.equal(adminSite.res.status, 200);
  const content = adminSite.data.siteContent || adminSite.data;
  const lessonCount = (content.curriculum?.lessonPlans || []).length
    || Object.keys(content.lessonPlans || {}).length;
  assert.ok(lessonCount > 0, "curriculum/lesson content present");
  console.log("PASS  recovery banner still live; curriculum present", { lessonCount });

  // Backup endpoints (may 404 before deploy)
  const backups = await req("GET", "/api/admin/store-backups", undefined, token);
  if (backups.res.status === 404) {
    console.log("INFO  store-backups not deployed yet (expected pre-merge)");
  } else {
    assert.equal(backups.res.status, 200, JSON.stringify(backups.data));
    console.log("PASS  store-backups list endpoint live");
    if (process.env.RUN_BACKUP_CREATE === "1") {
      const created = await req("POST", "/api/admin/store-backups", { adminToken: token, source: "post-deploy-verify" });
      assert.equal(created.res.status, 200, JSON.stringify(created.data));
      assert.equal(created.data.result?.ok, true);
      assert.ok(Number(created.data.result?.counts?.users || 0) >= 52);
      const id = created.data.result.id;
      const download = await req("GET", `/api/admin/store-backups/download?id=${encodeURIComponent(id)}`, undefined, token);
      assert.equal(download.res.status, 200);
      const store = download.data.backup?.store || {};
      assert.ok(store.users && Object.keys(store.users).length >= 52);
      assert.ok(Array.isArray(store.messages));
      assert.ok(Array.isArray(store.foundingMembers));
      assert.ok(store.siteContent && typeof store.siteContent === "object");
      console.log("PASS  backup create/download validated", id);
    }
  }

  // Sparse recovery must not silently mutate the store.
  const recover = await req("POST", "/api/admin/recover-sparse-store", { adminToken: token, force: false });
  if (recover.res.status === 400) {
    assert.match(String(recover.data.error || ""), /Confirmation required/i);
    console.log("PASS  sparse recovery requires explicit confirm");
  } else if (recover.res.status === 200) {
    assert.equal(recover.data.result?.ran, false);
    assert.ok(["already_recovered", "not_sparse"].includes(recover.data.result?.reason));
    assert.ok(Number(recover.data.health?.counts?.users || 0) >= 52);
    console.log("PASS  sparse recovery no-op (pre-confirm-gate deploy or already recovered)", recover.data.result?.reason);
  } else if (recover.res.status === 404) {
    console.log("INFO  recover-sparse-store not deployed");
  } else {
    assert.fail(`Unexpected recover-sparse-store status ${recover.res.status}`);
  }

  console.log("\nAll production store-safety smoke checks passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
