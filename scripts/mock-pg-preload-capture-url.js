/**
 * Preload mock `pg` Pool that captures which connection string was actually
 * used to construct a Pool, writing it to MOCK_PG_CAPTURE_PATH so a separate
 * test process can read it after the server exits. Used by
 * scripts/test-testing-database-isolation.js to prove activeDatabaseUrl()
 * picks TESTING_DATABASE_URL on non-production hosts and PRODUCTION_DATABASE_URL
 * on a live production host, never the other one, even when both are set.
 *
 * Usage: node -r ./scripts/mock-pg-preload-capture-url.js server/index.js
 */
const fs = require("fs");
const Module = require("module");
const originalRequire = Module.prototype.require;

const capturePath = process.env.MOCK_PG_CAPTURE_PATH || "";

Module.prototype.require = function mockPgRequire(id) {
  if (id === "pg") {
    return {
      Pool: class MockPool {
        constructor(options = {}) {
          if (capturePath) {
            try {
              fs.writeFileSync(capturePath, String(options.connectionString || ""));
            } catch { /* ignore */ }
          }
        }

        async query(sql) {
          const text = String(sql || "");
          if (text.includes("CREATE TABLE")) return { rows: [] };
          if (text.includes("SELECT data FROM llh_store")) return { rows: [] };
          if (text.includes("SELECT 1 AS ok")) return { rows: [{ ok: 1 }] };
          return { rows: [] };
        }

        async end() {}
      },
    };
  }
  return originalRequire.apply(this, arguments);
};
