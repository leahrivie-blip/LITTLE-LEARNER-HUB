/**
 * Preload mock `pg` Pool for admin-session-storage regression tests.
 *
 * Unlike scripts/mock-pg-preload.js (which only understands llh_store queries),
 * this mock distinguishes llh_store (the shared application document) from
 * llh_admin_sessions (the new dedicated session table) so tests can prove:
 *   - login no longer writes llh_store at all
 *   - session create/touch/revoke only ever write llh_admin_sessions, and each
 *     write is small (a single row), not the whole store
 *   - a simulated llh_admin_sessions write failure degrades gracefully
 *
 * Controlled entirely via environment variables read once at load time (the
 * mock lives in the spawned server process, not the test process):
 *   MOCK_PG_QUERY_DELAY_MS       - artificial delay before an llh_store INSERT resolves
 *   MOCK_PG_FAIL_SESSION_WRITES  - "1" to make every llh_admin_sessions write throw
 *   MOCK_PG_WRITE_LOG_PATH       - file path this mock appends one JSON line to per
 *                                  write, so the TEST PROCESS (a different process)
 *                                  can inspect exactly what was written and how big.
 *
 * Usage: node -r ./scripts/mock-pg-admin-sessions-preload.js server/index.js
 */
const fs = require("node:fs");
const Module = require("module");

const originalRequire = Module.prototype.require;
const queryDelayMs = Number(process.env.MOCK_PG_QUERY_DELAY_MS || 0);
const failSessionWrites = process.env.MOCK_PG_FAIL_SESSION_WRITES === "1";
const writeLogPath = process.env.MOCK_PG_WRITE_LOG_PATH || "";

const state = {
  store: null,
  sessions: new Map(), // token -> row
};
global.__LLH_MOCK_PG_ADMIN_SESSIONS__ = state;

function appendWriteLog(entry) {
  if (!writeLogPath) return;
  try {
    fs.appendFileSync(writeLogPath, `${JSON.stringify(entry)}\n`);
  } catch {
    // best-effort only
  }
}

Module.prototype.require = function mockPgRequire(id) {
  if (id !== "pg") return originalRequire.apply(this, arguments);
  return {
    Pool: class MockPool {
      async query(sql, params = []) {
        const text = String(sql || "");

        if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX")) {
          return { rows: [] };
        }

        // ─── llh_store (the shared application document) ──────────────────
        if (text.includes("SELECT data FROM llh_store")) {
          if (state.store) return { rows: [{ data: state.store }] };
          return { rows: [] };
        }
        if (text.includes("INSERT INTO llh_store")) {
          if (queryDelayMs) await new Promise((resolve) => setTimeout(resolve, queryDelayMs));
          const payload = typeof params[1] === "string" ? params[1] : JSON.stringify(params[1]);
          state.store = JSON.parse(payload);
          appendWriteLog({ table: "llh_store", bytes: Buffer.byteLength(payload, "utf8"), at: Date.now() });
          return { rows: [] };
        }

        // ─── llh_admin_sessions (the new dedicated session table) ─────────
        if (text.includes("llh_admin_sessions")) {
          if (text.startsWith("INSERT INTO llh_admin_sessions")) {
            if (failSessionWrites) throw new Error("mock Postgres failure: llh_admin_sessions insert");
            const [token, email] = params;
            state.sessions.set(token, { token, email });
            const approxBytes = Buffer.byteLength(JSON.stringify({ sql: text, params }), "utf8");
            appendWriteLog({ table: "llh_admin_sessions", op: "insert", bytes: approxBytes, at: Date.now() });
            return { rows: [] };
          }
          if (text.startsWith("UPDATE llh_admin_sessions")) {
            if (failSessionWrites) throw new Error("mock Postgres failure: llh_admin_sessions update");
            const approxBytes = Buffer.byteLength(JSON.stringify({ sql: text, params }), "utf8");
            appendWriteLog({ table: "llh_admin_sessions", op: "update", bytes: approxBytes, at: Date.now() });
            return { rows: [] };
          }
          if (text.startsWith("DELETE FROM llh_admin_sessions")) {
            if (failSessionWrites) throw new Error("mock Postgres failure: llh_admin_sessions delete");
            const [token] = params;
            if (token) state.sessions.delete(token);
            appendWriteLog({ table: "llh_admin_sessions", op: "delete", bytes: 0, at: Date.now() });
            return { rows: [] };
          }
          if (text.startsWith("SELECT")) {
            return { rows: Array.from(state.sessions.values()).map((row) => ({
              token: row.token,
              email: row.email,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              last_validated_at: new Date().toISOString(),
              revoked_at: null,
            })) };
          }
        }

        return { rows: [] };
      }

      async end() {}
    },
  };
};
