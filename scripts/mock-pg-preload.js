/**
 * Preload mock `pg` Pool for write-race regression tests.
 * Usage: node -r ./scripts/mock-pg-preload.js server/index.js
 */
const Module = require("module");
const originalRequire = Module.prototype.require;

const state = {
  store: null,
  writes: [],
  queryDelayMs: 40,
  selectCount: 0,
};

global.__LLH_MOCK_PG__ = state;

Module.prototype.require = function mockPgRequire(id) {
  if (id === "pg") {
    return {
      Pool: class MockPool {
        async query(sql, params = []) {
          const text = String(sql || "");
          if (text.includes("CREATE TABLE")) return { rows: [] };
          if (text.includes("SELECT data FROM llh_store")) {
            state.selectCount += 1;
            if (state.store) return { rows: [{ data: state.store }] };
            return { rows: [] };
          }
          if (text.includes("INSERT INTO llh_store")) {
            await new Promise((resolve) => setTimeout(resolve, state.queryDelayMs));
            const data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
            state.store = data;
            state.writes.push({
              at: Date.now(),
              hasCurriculum: Boolean(data?.siteContent?.curriculum?.lessonPlans?.length),
              lessonCount: data?.siteContent?.curriculum?.lessonPlans?.length || 0,
              updatedAt: data?.siteContent?.updatedAt || "",
              analyticsCount: (data?.analyticsEvents || []).length,
            });
            return { rows: [] };
          }
          return { rows: [] };
        }

        async end() {}
      },
    };
  }
  return originalRequire.apply(this, arguments);
};
