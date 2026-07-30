/**
 * Preload mock `pg` Pool for store-write / pool-hardening regression tests.
 * Usage: node -r ./scripts/mock-pg-preload.js server/index.js
 *
 * Optional env:
 *   MOCK_PG_CONTROL_PATH — JSON file { failNextConflictUpserts, failAllConflictUpserts, emitIdleError }
 *   MOCK_PG_STATUS_PATH  — written after each query with attempt/success counters
 */
const fs = require("fs");
const Module = require("module");
const originalRequire = Module.prototype.require;

const controlPath = String(process.env.MOCK_PG_CONTROL_PATH || "").trim();
const statusPath = String(process.env.MOCK_PG_STATUS_PATH || "").trim();

const state = {
  store: null,
  analyticsEvents: [],
  writes: [],
  analyticsInserts: 0,
  queryDelayMs: Number(process.env.MOCK_PG_QUERY_DELAY_MS || 40),
  selectCount: 0,
  conflictUpsertAttempts: 0,
  conflictUpsertSuccesses: 0,
  conflictUpsertFailures: 0,
  bootstrapInserts: 0,
  idleErrorsEmitted: 0,
  poolErrorHandlers: 0,
};

global.__LLH_MOCK_PG__ = state;

function readControl() {
  if (!controlPath) return {};
  try {
    return JSON.parse(fs.readFileSync(controlPath, "utf8"));
  } catch {
    return {};
  }
}

function writeControl(ctrl) {
  if (!controlPath) return;
  try {
    fs.writeFileSync(controlPath, JSON.stringify(ctrl, null, 2));
  } catch {
    /* ignore */
  }
}

function writeStatus() {
  if (!statusPath) return;
  try {
    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          ...state,
          // Avoid dumping the full store blob into status files.
          storeLessonCount: state.store?.siteContent?.curriculum?.lessonPlans?.length || 0,
          storeUpdatedAt: state.store?.siteContent?.updatedAt || "",
          storeUserCount: Object.keys(state.store?.users || {}).length,
        },
        null,
        2,
      ),
    );
  } catch {
    /* ignore */
  }
}

function shouldFailConflictUpsert() {
  const ctrl = readControl();
  if (ctrl.failAllConflictUpserts) return true;
  const remaining = Number(ctrl.failNextConflictUpserts || 0);
  if (remaining > 0) {
    ctrl.failNextConflictUpserts = remaining - 1;
    writeControl(ctrl);
    return true;
  }
  return false;
}

function maybeEmitIdleError(pool) {
  const ctrl = readControl();
  if (!ctrl.emitIdleError) return;
  ctrl.emitIdleError = false;
  writeControl(ctrl);
  state.idleErrorsEmitted += 1;
  const err = new Error("Connection terminated unexpectedly");
  err.code = "ECONNRESET";
  for (const handler of pool._errorHandlers || []) {
    try {
      handler(err);
    } catch {
      /* ignore handler errors */
    }
  }
  writeStatus();
}

Module.prototype.require = function mockPgRequire(id) {
  if (id === "pg") {
    return {
      Pool: class MockPool {
        constructor(options = {}) {
          this.options = options;
          this._errorHandlers = [];
          this.ended = false;
        }

        on(event, handler) {
          if (event === "error" && typeof handler === "function") {
            this._errorHandlers.push(handler);
            state.poolErrorHandlers += 1;
            writeStatus();
          }
          return this;
        }

        connect() {
          const pool = this;
          return {
            async query(sql, params = []) {
              return pool.query(sql, params);
            },
            release() {},
          };
        }

        async query(sql, params = []) {
          if (this.ended) {
            const err = new Error("Cannot use a pool after calling end on the pool");
            err.code = "ECONNRESET";
            throw err;
          }
          maybeEmitIdleError(this);
          const text = String(sql || "");
          if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX")) {
            writeStatus();
            return { rows: [] };
          }
          if (text.includes("FROM llh_analytics_events")) {
            writeStatus();
            return { rows: state.analyticsEvents.slice().reverse() };
          }
          if (text.includes("DELETE FROM llh_analytics_events")) {
            writeStatus();
            return { rowCount: 0, rows: [] };
          }
          if (text.includes("INSERT INTO llh_analytics_events")) {
            state.analyticsInserts += 1;
            state.analyticsEvents.push({
              id: params[0],
              name: params[1],
              user_email: params[2],
              visitor_id: params[3],
              session_id: params[4],
              path: params[5],
              plan: params[6],
              detail: JSON.parse(params[7] || "{}"),
              attribution: JSON.parse(params[8] || "{}"),
              referrer: params[9],
              user_agent: params[10],
              ip_hash: params[11],
              created_at: params[12],
            });
            writeStatus();
            return { rows: [] };
          }
          if (text.includes("SELECT 1") || text.includes("SELECT data FROM llh_store")) {
            const ctrl = readControl();
            if (ctrl.failAllSelects || ctrl.failAllQueries) {
              writeStatus();
              const err = new Error("Connection terminated unexpectedly");
              err.code = "ECONNRESET";
              throw err;
            }
            if (text.includes("SELECT 1")) {
              writeStatus();
              return { rows: [{ ok: 1 }] };
            }
            state.selectCount += 1;
            writeStatus();
            if (state.store) return { rows: [{ data: state.store }] };
            return { rows: [] };
          }
          if (text.includes("INSERT INTO llh_store")) {
            const isConflictUpsert = text.includes("ON CONFLICT");
            if (isConflictUpsert) {
              state.conflictUpsertAttempts += 1;
              if (shouldFailConflictUpsert()) {
                state.conflictUpsertFailures += 1;
                writeStatus();
                const err = new Error("Connection terminated unexpectedly");
                err.code = "ECONNRESET";
                throw err;
              }
            } else {
              state.bootstrapInserts += 1;
            }
            await new Promise((resolve) => setTimeout(resolve, state.queryDelayMs));
            const data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
            state.store = data;
            state.writes.push({
              at: Date.now(),
              conflictUpsert: isConflictUpsert,
              hasCurriculum: Boolean(data?.siteContent?.curriculum?.lessonPlans?.length),
              lessonCount: data?.siteContent?.curriculum?.lessonPlans?.length || 0,
              updatedAt: data?.siteContent?.updatedAt || "",
              analyticsCount: (data?.analyticsEvents || []).length,
            });
            if (isConflictUpsert) state.conflictUpsertSuccesses += 1;
            writeStatus();
            return { rows: [] };
          }
          writeStatus();
          return { rows: [] };
        }

        async end() {
          this.ended = true;
        }
      },
    };
  }
  return originalRequire.apply(this, arguments);
};
