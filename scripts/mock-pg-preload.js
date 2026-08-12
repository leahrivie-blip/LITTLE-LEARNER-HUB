/**
 * Preload mock `pg` Pool for store-write / pool-hardening regression tests.
 * Usage: node -r ./scripts/mock-pg-preload.js server/index.js
 *
 * Optional env:
 *   MOCK_PG_CONTROL_PATH — JSON file control flags (see readControl)
 *   MOCK_PG_STATUS_PATH  — written after each query with attempt/success counters
 */
const fs = require("fs");
const { EventEmitter } = require("events");
const Module = require("module");
const originalRequire = Module.prototype.require;

const controlPath = String(process.env.MOCK_PG_CONTROL_PATH || "").trim();
const statusPath = String(process.env.MOCK_PG_STATUS_PATH || "").trim();
const storeDumpPath = String(process.env.MOCK_PG_STORE_DUMP_PATH || "").trim();
const seedPayloadBytes = Math.max(0, Number(process.env.MOCK_PG_SEED_PAYLOAD_BYTES || 0));

function buildSeedStore() {
  const padLen = Math.max(0, seedPayloadBytes);
  return {
    users: {},
    foundingMembers: [],
    messages: [],
    notifications: [],
    supportTickets: [],
    siteContent: {
      updatedAt: "2026-08-12T16:00:00.000Z",
      curriculum: { lessonPlans: [], activities: [], series: [] },
      // Approximate production llh_store bulk (siteContent-dominated) without real PII.
      _prodSizePad: padLen ? "x".repeat(padLen) : "",
    },
  };
}

const state = {
  store: seedPayloadBytes > 0 ? buildSeedStore() : null,
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
  checkedOutClientErrorsEmitted: 0,
  clientsReleasedWithError: 0,
  maxSimultaneousCheckedOut: 0,
  activeCheckedOut: 0,
  overlappingUpserts: 0,
  activeConflictUpserts: 0,
  maxActiveConflictUpserts: 0,
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

function dumpStoreIfConfigured() {
  if (!storeDumpPath || !state.store) return;
  try {
    fs.writeFileSync(storeDumpPath, JSON.stringify(state.store));
  } catch {
    /* ignore */
  }
}

function writeStatus() {
  if (!statusPath) return;
  try {
    const lessonPlans = state.store?.siteContent?.curriculum?.lessonPlans || [];
    fs.writeFileSync(
      statusPath,
      JSON.stringify(
        {
          ...state,
          // Avoid dumping the full store blob into status files.
          store: undefined,
          storeLessonCount: lessonPlans.length,
          storeLessonIds: lessonPlans.map((p) => p.id).filter(Boolean).slice(-20),
          storeUpdatedAt: state.store?.siteContent?.updatedAt || "",
          storeUserCount: Object.keys(state.store?.users || {}).length,
          storePayloadChars: state.store ? JSON.stringify(state.store).length : 0,
          lastWritePayloadBytes: state.writes.length
            ? state.writes[state.writes.length - 1].payloadBytes || 0
            : 0,
        },
        null,
        2,
      ),
    );
    dumpStoreIfConfigured();
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

function createMockClient(pool) {
  const client = new EventEmitter();
  client._queryable = true;
  client._ending = false;
  client._released = false;

  client.query = async (sql, params = []) => {
    const ctrl = readControl();
    // Simulate SIGKILL of an in-flight checked-out backend: emit Client 'error'
    // AND reject the query — mirrors production pg behavior that crashed Node.
    if (ctrl.killNextCheckedOutQuery) {
      ctrl.killNextCheckedOutQuery = false;
      writeControl(ctrl);
      state.checkedOutClientErrorsEmitted += 1;
      const err = new Error("Connection terminated unexpectedly");
      err.code = "ECONNRESET";
      writeStatus();
      queueMicrotask(() => {
        client.emit("error", err);
      });
      await new Promise((resolve) => setImmediate(resolve));
      throw err;
    }
    return pool._runQuery(sql, params);
  };

  client.release = (err) => {
    if (client._released) return;
    client._released = true;
    state.activeCheckedOut = Math.max(0, state.activeCheckedOut - 1);
    if (err) state.clientsReleasedWithError += 1;
    writeStatus();
  };

  return client;
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

        async connect() {
          const client = createMockClient(this);
          state.activeCheckedOut += 1;
          if (state.activeCheckedOut > state.maxSimultaneousCheckedOut) {
            state.maxSimultaneousCheckedOut = state.activeCheckedOut;
          }
          writeStatus();
          return client;
        }

        async _runQuery(sql, params = []) {
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
              const err = new Error(
                ctrl.failWithNotAccepting
                  ? "the database system is not yet accepting connections"
                  : "Connection terminated unexpectedly",
              );
              err.code = ctrl.failWithNotAccepting ? "57P03" : "ECONNRESET";
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
          if (text.includes("INSERT INTO llh_store") || text.includes("UPDATE llh_store")) {
            const isConflictUpsert = text.includes("ON CONFLICT") || text.includes("jsonb_set");
            const isConflict = text.includes("INSERT INTO llh_store") && text.includes("ON CONFLICT");
            if (isConflict) {
              state.conflictUpsertAttempts += 1;
              state.activeConflictUpserts += 1;
              if (state.activeConflictUpserts > 1) state.overlappingUpserts += 1;
              if (state.activeConflictUpserts > state.maxActiveConflictUpserts) {
                state.maxActiveConflictUpserts = state.activeConflictUpserts;
              }
              // Publish in-flight state before any artificial delay so tests can observe overlap.
              writeStatus();
              if (shouldFailConflictUpsert()) {
                state.conflictUpsertFailures += 1;
                state.activeConflictUpserts = Math.max(0, state.activeConflictUpserts - 1);
                writeStatus();
                const err = new Error("Connection terminated unexpectedly");
                err.code = "ECONNRESET";
                throw err;
              }
            } else if (text.includes("INSERT INTO llh_store")) {
              state.bootstrapInserts += 1;
            }
            const ctrl = readControl();
            const delayMs = Number(ctrl.delayConflictUpsertMs || state.queryDelayMs) || 0;
            if (isConflict && delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            } else {
              await new Promise((resolve) => setTimeout(resolve, state.queryDelayMs));
            }
            let data = state.store;
            let payloadBytes = 0;
            if (text.includes("INSERT INTO llh_store")) {
              data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
              payloadBytes = typeof params[1] === "string"
                ? Buffer.byteLength(params[1], "utf8")
                : Buffer.byteLength(JSON.stringify(params[1] || {}), "utf8");
              state.store = data;
            }
            state.writes.push({
              at: Date.now(),
              conflictUpsert: Boolean(text.includes("ON CONFLICT")),
              hasCurriculum: Boolean(data?.siteContent?.curriculum?.lessonPlans?.length),
              lessonCount: data?.siteContent?.curriculum?.lessonPlans?.length || 0,
              lessonIds: (data?.siteContent?.curriculum?.lessonPlans || []).map((p) => p.id).filter(Boolean).slice(-12),
              teachingKitTitles: (data?.siteContent?.curriculum?.lessonPlans || [])
                .map((p) => p.teachingKit?.title || p.teachingKit?.kitTitle || "")
                .filter(Boolean)
                .slice(-8),
              updatedAt: data?.siteContent?.updatedAt || "",
              analyticsCount: (data?.analyticsEvents || []).length,
              payloadBytes,
            });
            if (isConflict) {
              state.conflictUpsertSuccesses += 1;
              state.activeConflictUpserts = Math.max(0, state.activeConflictUpserts - 1);
            }
            writeStatus();
            return { rows: [] };
          }
          writeStatus();
          return { rows: [] };
        }

        async query(sql, params = []) {
          // Mirror pg-pool: attach a temporary error listener on the checked-out client.
          const client = await this.connect();
          return new Promise((resolve, reject) => {
            let settled = false;
            const onError = (err) => {
              if (settled) return;
              settled = true;
              client.release(err);
              reject(err);
            };
            client.once("error", onError);
            client.query(sql, params).then(
              (res) => {
                if (settled) return;
                settled = true;
                client.removeListener("error", onError);
                client.release();
                resolve(res);
              },
              (err) => {
                if (settled) return;
                settled = true;
                client.removeListener("error", onError);
                client.release(err);
                reject(err);
              },
            );
          });
        }

        async end() {
          this.ended = true;
        }
      },
    };
  }
  return originalRequire.apply(this, arguments);
};
