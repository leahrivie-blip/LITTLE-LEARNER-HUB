/**
 * Prevent ephemeral QA / Playwright / example accounts from persisting in Postgres.
 *
 * Local-json (and ALLOW_TEST_ACCOUNT_EMAILS=true) still allow test emails so unit/browser
 * suites can seed personas. Postgres deployments reject + prune them on write.
 */

const TEST_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.local",
  "localhost",
  "llh-qa.example",
  "e2e.test",
  "web-library.net",
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function allowlistedTestEmails(env = process.env) {
  return new Set(
    String(env.TEST_ACCOUNT_EMAIL_ALLOWLIST || "")
      .split(",")
      .map((part) => normalizeEmail(part))
      .filter(Boolean),
  );
}

/**
 * True when this email looks like a disposable QA / automation account.
 * Does not treat malformed addresses as test accounts (other validators handle that).
 */
function isEphemeralTestAccountEmail(email, env = process.env) {
  const value = normalizeEmail(email);
  if (!value || !value.includes("@")) return false;
  if (allowlistedTestEmails(env).has(value)) return false;
  const [local, domain] = value.split("@");
  if (!local || !domain) return false;
  if (TEST_EMAIL_DOMAINS.has(domain)) return true;
  if (domain.endsWith(".local") || domain.endsWith(".test") || domain.endsWith(".example")) return true;
  // Prefix tokens must end at a separator (or end of local-part) so real names like
  // "testimony@" are not treated as QA accounts.
  if (/^(?:test|prod-up|regression-probe|e2e|smoke|llh-signup|signup-ui|ui-test|matrix)(?:[._+-]|$)/i.test(local)) {
    return true;
  }
  if (
    /(^|[._+-])(test|demo|audit|qa|fake|sample|dummy|playwright|selenium|smoke|probe|verify|e2e|matrix)([._+-]|$)/i
      .test(local)
  ) {
    return true;
  }
  return false;
}

/**
 * When false, Postgres must not create/keep ephemeral test accounts.
 */
function shouldPersistEphemeralTestAccounts(env = process.env) {
  if (String(env.ALLOW_TEST_ACCOUNT_EMAILS || "").toLowerCase() === "true") return true;
  const provider = String(env.DATABASE_PROVIDER || "local-json").toLowerCase();
  return provider !== "postgres";
}

function shouldRejectTestAccountPersistence(email, env = process.env) {
  if (shouldPersistEphemeralTestAccounts(env)) return false;
  return isEphemeralTestAccountEmail(email, env);
}

/**
 * Invited Home Daycare Hub testers must persist on the testing Postgres store even when
 * their email local-part contains QA-like tokens (e.g. "test.provider@…"). Without this,
 * invite accept / password sync can return ok while the account is pruned before write,
 * so login after a fresh browser fails.
 */
function isProtectedTesterAccount(user = {}) {
  if (!user || typeof user !== "object") return false;
  return Boolean(
    user.hdhIndependentTester
    || user.hdhTesterInvitedByEmail
    || user.testingInviteAcceptedAt
    || user.multiRoleTester,
  );
}

function invitedTesterEmailsFromStore(store = {}) {
  const out = new Set();
  const invites = store?.hdhTesterInvites;
  if (!invites || typeof invites !== "object") return out;
  for (const invite of Object.values(invites)) {
    const email = normalizeEmail(invite?.email);
    if (!email) continue;
    const status = String(invite?.status || "").toLowerCase();
    if (status && status !== "pending" && status !== "accepted") continue;
    out.add(email);
  }
  return out;
}

/**
 * Remove ephemeral test users (and their fake feature requests) from a store object.
 * Safe no-op when persistence of test accounts is allowed.
 */
function pruneEphemeralTestAccountsFromStore(store, env = process.env) {
  const result = {
    removedUsers: 0,
    removedFeatureRequests: 0,
    removedEmails: [],
    keptProtectedTesters: 0,
  };
  if (!store || typeof store !== "object") return result;
  if (shouldPersistEphemeralTestAccounts(env)) return result;

  const invitedEmails = invitedTesterEmailsFromStore(store);
  const users = store.users;
  if (users && typeof users === "object" && !Array.isArray(users)) {
    for (const key of Object.keys(users)) {
      const row = users[key];
      const email = normalizeEmail(row?.email || key);
      if (!shouldRejectTestAccountPersistence(email, env)) continue;
      if (isProtectedTesterAccount(row) || invitedEmails.has(email)) {
        result.keptProtectedTesters += 1;
        continue;
      }
      delete users[key];
      result.removedUsers += 1;
      result.removedEmails.push(email);
    }
  }

  if (Array.isArray(store.featureRequests)) {
    const before = store.featureRequests.length;
    store.featureRequests = store.featureRequests.filter((item) => {
      const email = normalizeEmail(item?.email);
      return !email || !shouldRejectTestAccountPersistence(email, env);
    });
    result.removedFeatureRequests = before - store.featureRequests.length;
  }

  return result;
}

/**
 * Exclude QA / demo / test emails from customer-facing analytics totals.
 * Independent of Postgres persistence rules so leftover stubs never inflate KPIs.
 * Set ANALYTICS_INCLUDE_TEST_ACCOUNTS=true only for local fixture suites.
 */
function shouldExcludeFromCustomerAnalytics(email, env = process.env) {
  if (String(env.ANALYTICS_INCLUDE_TEST_ACCOUNTS || "").toLowerCase() === "true") return false;
  return isEphemeralTestAccountEmail(email, env);
}

function filterUsersForCustomerAnalytics(users, env = process.env) {
  const list = Array.isArray(users) ? users : [];
  const kept = [];
  const excluded = [];
  for (const user of list) {
    if (shouldExcludeFromCustomerAnalytics(user?.email || user, env)) excluded.push(user);
    else kept.push(user);
  }
  return { users: kept, excluded, excludedCount: excluded.length };
}

module.exports = {
  TEST_EMAIL_DOMAINS,
  normalizeEmail,
  isEphemeralTestAccountEmail,
  isProtectedTesterAccount,
  invitedTesterEmailsFromStore,
  shouldPersistEphemeralTestAccounts,
  shouldRejectTestAccountPersistence,
  pruneEphemeralTestAccountsFromStore,
  shouldExcludeFromCustomerAnalytics,
  filterUsersForCustomerAnalytics,
};
