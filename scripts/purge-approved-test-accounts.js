#!/usr/bin/env node
/**
 * One-shot production cleanup: remove approved test/example accounts.
 * KEEP: typoole04@gmail.com
 *
 * Requires: PRODUCTION_DATABASE_URL or DATABASE_URL (external Postgres URL)
 * Usage: PRODUCTION_DATABASE_URL=... node scripts/purge-approved-test-accounts.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const testAccountGuard = require("../server/test-account-guard.js");

const KEEP = new Set(["typoole04@gmail.com"]);
const OUT_DIR = "/opt/cursor/artifacts";
const STORE_ID = "launch-store";

function normalizeEmail(value) {
  return testAccountGuard.normalizeEmail(value);
}

function classifyReason(email, user = {}) {
  const e = normalizeEmail(email);
  if (KEEP.has(e)) return null;
  const name = String(user.name || "");
  const first = String(user.firstName || "");
  const last = String(user.lastName || "");
  if (testAccountGuard.isEphemeralTestAccountEmail(e)) {
    if (e.endsWith("@example.com")) return "example.com domain";
    if (e.endsWith("@example.org")) return "example.org domain";
    if (e.endsWith("@llh-qa.example")) return "llh-qa.example domain";
    if (e.endsWith("@test.com")) return "test.com domain";
    if (e.endsWith("@test.local") || e.endsWith(".local")) return "test.local domain";
    if (e.endsWith("@localhost")) return "localhost domain";
    return "ephemeral test email pattern";
  }
  if (/(^|[^a-z])(test|demo|audit|qa|fake|sample|dummy|probe|verify)([^a-z]|$)/i.test(name)) return "name keyword";
  if (/^(test|demo|audit|qa|fake|sample|dummy)$/i.test(first)) return "firstName keyword";
  if (/^(test|demo|audit|qa|fake|sample|dummy|verify|probe)$/i.test(last)) return "lastName keyword";
  return null;
}

function isOrphanFakeFeatureEmail(email) {
  const e = normalizeEmail(email);
  if (KEEP.has(e)) return false;
  return testAccountGuard.isEphemeralTestAccountEmail(e);
}

function filterEmailArray(list, deleteSet) {
  if (!Array.isArray(list)) return { next: list, removed: 0 };
  const next = list.filter((value) => !deleteSet.has(normalizeEmail(value)));
  return { next, removed: list.length - next.length };
}

function filterByEmailField(list, deleteSet, fields = ["email"]) {
  if (!Array.isArray(list)) return { next: list, removed: 0 };
  const next = list.filter((item) => {
    const emails = fields.map((f) => normalizeEmail(item?.[f])).filter(Boolean);
    if (!emails.length) return true;
    return !emails.some((email) => deleteSet.has(email));
  });
  return { next, removed: list.length - next.length };
}

function filterObjectByEmailKeys(obj, deleteSet) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { next: obj, removed: 0 };
  const next = {};
  let removed = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (deleteSet.has(normalizeEmail(key)) || deleteSet.has(normalizeEmail(value?.email))) {
      removed += 1;
      continue;
    }
    next[key] = value;
  }
  return { next, removed };
}

function filterTimeline(timeline, deleteSet) {
  if (!timeline || typeof timeline !== "object") return { next: timeline, removed: 0 };
  const next = {};
  let removed = 0;
  for (const [key, value] of Object.entries(timeline)) {
    if (deleteSet.has(normalizeEmail(key))) {
      removed += 1;
      continue;
    }
    next[key] = value;
  }
  return { next, removed };
}

function planBucket(user) {
  const plan = String(user?.plan || "").toLowerCase();
  const status = String(user?.subscriptionStatus || "").toLowerCase();
  if (plan.includes("found")) return "Founding";
  if (plan.includes("trial") || status.includes("trial")) return "Trial";
  if (plan.includes("pro")) return "Pro";
  if (status.includes("cancel")) return "Canceled";
  if (!plan || plan.includes("free")) return "Free";
  return plan || "Other";
}

async function main() {
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL is required");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT data FROM llh_store WHERE id = $1 FOR UPDATE",
      [STORE_ID],
    );
    if (!rows.length) throw new Error("launch-store row missing");
    const store = rows[0].data || {};
    const users = store.users && typeof store.users === "object" ? store.users : {};

    const beforeCounts = {
      total: Object.keys(users).length,
      byPlan: {},
    };
    for (const user of Object.values(users)) {
      const bucket = planBucket(user);
      beforeCounts.byPlan[bucket] = (beforeCounts.byPlan[bucket] || 0) + 1;
    }

    const deleteList = [];
    for (const [rawEmail, user] of Object.entries(users)) {
      const email = normalizeEmail(rawEmail);
      if (KEEP.has(email)) continue;
      const reason = classifyReason(email, user || {});
      if (!reason) continue;
      deleteList.push({
        email,
        reason,
        plan: user?.plan || "",
        status: user?.subscriptionStatus || "",
        name: user?.name || "",
        stripeCustomerId: user?.stripeCustomerId || user?.stripe_customer_id || "",
      });
    }
    deleteList.sort((a, b) => a.email.localeCompare(b.email));
    const deleteSet = new Set(deleteList.map((item) => item.email));
    if (deleteSet.has("typoole04@gmail.com")) {
      throw new Error("Safety check failed: typoole04 was marked for delete");
    }

    const backupPath = path.join(OUT_DIR, `llh-store-backup-before-test-purge-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(store));
    console.log("Backup written:", backupPath);

    // Prefer native backup table if present.
    try {
      await client.query(
        `INSERT INTO llh_store_backups (id, data, user_count, message_count, founding_count, created_at, verified)
         VALUES ($1, $2::jsonb, $3, $4, $5, NOW(), FALSE)`,
        [
          `test-purge-${Date.now()}`,
          JSON.stringify(store),
          beforeCounts.total,
          Array.isArray(store.messages) ? store.messages.length : 0,
          Array.isArray(store.foundingMembers) ? store.foundingMembers.length : 0,
        ],
      );
    } catch (error) {
      console.warn("llh_store_backups insert skipped:", error.message);
    }

    const removedUsers = {};
    const nextUsers = {};
    for (const [rawEmail, user] of Object.entries(users)) {
      const email = normalizeEmail(rawEmail);
      if (deleteSet.has(email)) {
        removedUsers[email] = {
          plan: user?.plan || "",
          status: user?.subscriptionStatus || "",
          stripeCustomerId: user?.stripeCustomerId || "",
        };
        continue;
      }
      nextUsers[rawEmail] = user;
    }
    store.users = nextUsers;

    const scrub = {};
    const apply = (label, result) => {
      scrub[label] = result.removed;
      return result.next;
    };

    store.foundingMembers = apply("foundingMembers", filterEmailArray(store.foundingMembers, deleteSet));
    store.leads = apply("leads", filterByEmailField(store.leads, deleteSet, ["email"]));

    const remainingEmails = new Set(Object.keys(nextUsers).map(normalizeEmail));
    const beforeFr = Array.isArray(store.featureRequests) ? store.featureRequests.length : 0;
    store.featureRequests = (Array.isArray(store.featureRequests) ? store.featureRequests : []).filter((item) => {
      const email = normalizeEmail(item?.email);
      if (!email) return true;
      if (deleteSet.has(email)) return false;
      // Remove orphan fake idea-request rows with no remaining user account.
      if (isOrphanFakeFeatureEmail(email) && !remainingEmails.has(email)) return false;
      return true;
    });
    scrub.featureRequests = beforeFr - store.featureRequests.length;

    store.feedbackItems = apply("feedbackItems", filterByEmailField(store.feedbackItems, deleteSet, ["email"]));
    store.supportTickets = apply("supportTickets", filterByEmailField(store.supportTickets, deleteSet, ["email"]));
    store.bugReports = apply("bugReports", filterByEmailField(store.bugReports, deleteSet, ["email"]));
    store.lessonPlanRequests = apply("lessonPlanRequests", filterByEmailField(store.lessonPlanRequests, deleteSet, ["email"]));
    store.messages = apply("messages", filterByEmailField(store.messages, deleteSet, ["email", "fromEmail", "toEmail", "userEmail"]));
    store.notifications = apply("notifications", filterByEmailField(store.notifications, deleteSet, ["email", "userEmail"]));
    store.billingEvents = apply("billingEvents", filterByEmailField(store.billingEvents, deleteSet, ["email", "userEmail"]));
    store.promoRedemptions = apply("promoRedemptions", filterByEmailField(store.promoRedemptions, deleteSet, ["email", "userEmail"]));
    store.staffInvites = apply("staffInvites", filterByEmailField(store.staffInvites, deleteSet, ["email"]));
    store.memberSessions = apply("memberSessions", filterByEmailField(store.memberSessions, deleteSet, ["email", "userEmail"]));
    store.pushSubscriptions = apply("pushSubscriptions", filterByEmailField(store.pushSubscriptions, deleteSet, ["email", "userEmail"]));
    store.programMembers = apply("programMembers", filterByEmailField(store.programMembers, deleteSet, ["email", "userEmail"]));
    store.universalDrafts = apply("universalDrafts", filterByEmailField(store.universalDrafts, deleteSet, ["email", "userEmail"]));
    store.messageDrafts = apply("messageDrafts", filterByEmailField(store.messageDrafts, deleteSet, ["email", "userEmail"]));
    store.archivedConversations = apply("archivedConversations", filterByEmailField(store.archivedConversations, deleteSet, ["email", "userEmail"]));
    store.userTags = apply("userTags", filterObjectByEmailKeys(store.userTags, deleteSet));
    store.userTimeline = apply("userTimeline", filterTimeline(store.userTimeline, deleteSet));
    store.childData = apply("childData", filterObjectByEmailKeys(store.childData, deleteSet));
    store.scheduleByUser = apply("scheduleByUser", filterObjectByEmailKeys(store.scheduleByUser, deleteSet));
    store.programData = apply("programData", filterObjectByEmailKeys(store.programData, deleteSet));
    store.emailAuth = apply("emailAuth", filterObjectByEmailKeys(store.emailAuth, deleteSet));
    store.notificationPreferences = apply("notificationPreferences", filterObjectByEmailKeys(store.notificationPreferences, deleteSet));

    if (Array.isArray(store.analyticsEvents)) {
      const before = store.analyticsEvents.length;
      store.analyticsEvents = store.analyticsEvents.filter((event) => {
        const email = normalizeEmail(event?.email || event?.userEmail || event?.detail?.email);
        return !email || !deleteSet.has(email);
      });
      scrub.analyticsEvents = before - store.analyticsEvents.length;
    }

    // Safety: keep typoole04
    if (!store.users["typoole04@gmail.com"] && !Object.keys(store.users).some((k) => normalizeEmail(k) === "typoole04@gmail.com")) {
      throw new Error("Safety check failed: typoole04@gmail.com missing after purge");
    }

    const afterCounts = { total: Object.keys(store.users).length, byPlan: {} };
    for (const user of Object.values(store.users)) {
      const bucket = planBucket(user);
      afterCounts.byPlan[bucket] = (afterCounts.byPlan[bucket] || 0) + 1;
    }

    await client.query(
      "UPDATE llh_store SET data = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [STORE_ID, JSON.stringify(store)],
    );
    await client.query("COMMIT");

    const report = {
      ok: true,
      kept: ["typoole04@gmail.com"],
      deletedCount: deleteList.length,
      deletedEmails: deleteList,
      scrub,
      beforeCounts,
      afterCounts,
      backupPath,
      at: new Date().toISOString(),
    };
    const reportPath = path.join(OUT_DIR, "test-account-purge-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: true,
      deletedCount: report.deletedCount,
      beforeTotal: beforeCounts.total,
      afterTotal: afterCounts.total,
      beforeByPlan: beforeCounts.byPlan,
      afterByPlan: afterCounts.byPlan,
      keptPresent: Boolean(store.users["typoole04@gmail.com"]),
      reportPath,
    }, null, 2));
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("PURGE FAIL:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
