#!/usr/bin/env node
/**
 * Static + lightweight schedule persistence guards for production priority fixes.
 * Run: node scripts/test-prod-priority-fixes.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parsePreschoolLessonImport, PRESCHOOL_PRO_IMPORT_TARGETS } = require("./curriculum-preschool-import-targets.js");

let failed = false;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const scheduleJs = fs.readFileSync(path.join(root, "scripts/llh-schedule.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

async function main() {
  await test("calendar Add Lesson Plan uses dedicated picker hook", () => {
    assert.match(appJs, /data-calendar-add-lesson-plan/);
    assert.match(appJs, /function openCalendarLessonPlanPicker/);
    assert.match(appJs, /function finishCalendarLessonAssignSuccess/);
    assert.match(appJs, /calendarLessonAssignContext/);
  });

  await test("schedule sync retry UI and requireCloud note saves exist", () => {
    assert.match(appJs, /data-calendar-retry-sync/);
    assert.match(appJs, /calendarScheduleStatusHtml/);
    assert.match(appJs, /requireCloud:\s*true/);
    assert.match(appJs, /Notes saved to your account/);
  });

  await test("llh-schedule retries and does not mark migrate on local fallback", () => {
    assert.match(scheduleJs, /function fetchWithRetry/);
    assert.match(scheduleJs, /Do NOT set the migrated flag/);
    assert.match(scheduleJs, /requireCloud/);
    assert.doesNotMatch(
      scheduleJs.slice(scheduleJs.indexOf("Local fallback migration")),
      /setItem\(migrateFlagKey\(email\),\s*"1"\)/,
    );
  });

  await test("lesson viewer close button remains available in workspace mode", () => {
    assert.match(appJs, /closeBtn\.hidden = false/);
    assert.match(appJs, /resource-viewer-open/);
    assert.match(css, /\.resource-viewer-modal\.lesson-workspace-mode \.close-button \{\s*display:\s*inline-flex/);
  });

  await test("account name fields exist and greetings use safe fallback", () => {
    assert.match(html, /accountFirstNameInput/);
    assert.match(html, /accountLastNameInput/);
    assert.match(appJs, /function accountDisplayFirstName/);
    assert.match(appJs, /accountDisplayFirstName\(currentAccount\(\)\)/);
  });

  await test("Space Adventure source includes Wed–Fri activities", () => {
    const target = PRESCHOOL_PRO_IMPORT_TARGETS.find((item) => item.stableId === "cur-lp-preschool-space-adventure");
    assert.ok(target);
    const text = fs.readFileSync(path.join(target.importDir, target.file), "utf8");
    const parsed = parsePreschoolLessonImport(text, { itemIdPrefix: "item-preschool-space-adventure" });
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const counts = Object.fromEntries(days.map((day) => [day, parsed.dailyPlans?.[day]?.items?.length || 0]));
    days.forEach((day) => assert.ok(counts[day] > 0, `${day} should have activities`));
    assert.ok(parsed._activityCount >= 15, `expected full week, got ${parsed._activityCount}`);
  });

  await test("schedule migrate local fallback preserves day notes (node sandbox)", async () => {
    const store = new Map();
    const sandbox = {
      window: {},
      globalThis: {},
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
      },
      fetch: async () => {
        throw new Error("aborted");
      },
      crypto: {
        getRandomValues: (arr) => {
          for (let i = 0; i < arr.length; i += 1) arr[i] = i + 1;
          return arr;
        },
      },
      console,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(scheduleJs, sandbox);
    const api = sandbox.LLHSchedule;
    assert.ok(api);
    const email = "note-persist@example.com";
    api.writeCache(email, {
      classrooms: [{ id: "classroom-main", name: "Main Classroom" }],
      items: [{
        id: "sch-note-1",
        type: "day_note",
        title: "Day Note",
        startDate: "2026-07-14",
        endDate: "2026-07-14",
        weekStartDate: "2026-07-13",
        notes: "Keep this note",
        classroomId: "classroom-main",
      }],
      updatedAt: "2026-07-14T00:00:00.000Z",
    });
    const migrated = await api.migrateFromLegacy(async () => ({
      Authorization: "Bearer test",
      "Content-Type": "application/json",
    }), email, { curriculumAssignments: [] });
    assert.notEqual(
      store.get(`llhScheduleMigrated:${email}`),
      "1",
      "migrate flag must stay unset after failed server migrate",
    );
    assert.ok((migrated.items || []).some((item) => item.type === "day_note" && item.notes === "Keep this note"));
  });

  if (failed) process.exitCode = 1;
  else console.log("\nAll production priority fix tests passed.");
}

main();
