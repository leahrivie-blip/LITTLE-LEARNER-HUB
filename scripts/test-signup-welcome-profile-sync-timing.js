#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mock } = require("node:test");

const ROOT = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

async function runAuthSyncWithTimeout(label, task, timeoutMs = 6000) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Mirrors the Free-signup welcome prompt wiring in app.js after the late-sync hotfix.
 * @param {{ finishFree: boolean, signupProfileSync: Promise<unknown>, hooks: { showWelcomeMessagePrompt: () => void, cancelWelcomeMessagePrompt: () => void } }} opts
 */
function wireFreeSignupWelcomePrompt({ finishFree, signupProfileSync, hooks }) {
  runAuthSyncWithTimeout("signup profile sync", () => signupProfileSync).catch(() => {
    if (finishFree) hooks.cancelWelcomeMessagePrompt();
  });
  if (!finishFree) return;
  signupProfileSync
    .then((syncedUser) => {
      if (!syncedUser) {
        hooks.cancelWelcomeMessagePrompt();
        return;
      }
      hooks.showWelcomeMessagePrompt();
    })
    .catch(() => {
      hooks.cancelWelcomeMessagePrompt();
    });
}

function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve;
  /** @type {(reason?: unknown) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function testFastSync() {
  const hooks = { showCount: 0, cancelCount: 0 };
  const sync = deferred();
  wireFreeSignupWelcomePrompt({
    finishFree: true,
    signupProfileSync: sync.promise,
    hooks: {
      showWelcomeMessagePrompt: () => { hooks.showCount += 1; },
      cancelWelcomeMessagePrompt: () => { hooks.cancelCount += 1; },
    },
  });
  sync.resolve({ email: "fast@example.com" });
  await sync.promise;
  await Promise.resolve();
  assert.equal(hooks.showCount, 1, "fast sync shows popup once");
  assert.equal(hooks.cancelCount, 0);
}

async function testSlowSyncAfterTimeout() {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const hooks = { showCount: 0, cancelCount: 0, shownAt: "" };
    const sync = deferred();
    wireFreeSignupWelcomePrompt({
      finishFree: true,
      signupProfileSync: sync.promise,
      hooks: {
        showWelcomeMessagePrompt: () => {
          if (hooks.shownAt) return false;
          hooks.shownAt = new Date().toISOString();
          hooks.showCount += 1;
          return true;
        },
        cancelWelcomeMessagePrompt: () => { hooks.cancelCount += 1; },
      },
    });

    mock.timers.tick(6000);
    await Promise.resolve();
    assert.equal(hooks.showCount, 0, "timeout must not show popup before real sync completes");
    assert.equal(hooks.shownAt, "", "welcomeMessagePromptShownAt must stay unset at timeout");

    sync.resolve({ email: "slow@example.com" });
    await sync.promise;
    await Promise.resolve();
    assert.equal(hooks.showCount, 1, "late successful sync shows popup once");
    assert.ok(hooks.shownAt, "prompt display stamp set only after real sync success");
    assert.equal(hooks.cancelCount, 0);
  } finally {
    mock.timers.reset();
  }
}

async function testLateFailure() {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const hooks = { showCount: 0, cancelCount: 0 };
    const sync = deferred();
    wireFreeSignupWelcomePrompt({
      finishFree: true,
      signupProfileSync: sync.promise,
      hooks: {
        showWelcomeMessagePrompt: () => { hooks.showCount += 1; },
        cancelWelcomeMessagePrompt: () => { hooks.cancelCount += 1; },
      },
    });

    mock.timers.tick(6000);
    await Promise.resolve();
    sync.reject(new Error("profile sync failed"));
    await sync.promise.catch(() => {});
    await Promise.resolve();
    assert.equal(hooks.showCount, 0);
    assert.ok(hooks.cancelCount >= 1, "late sync failure cancels deferred welcome prompt");
  } finally {
    mock.timers.reset();
  }
}

async function testFailureBeforeTimeout() {
  const hooks = { showCount: 0, cancelCount: 0 };
  const sync = deferred();
  wireFreeSignupWelcomePrompt({
    finishFree: true,
    signupProfileSync: sync.promise,
    hooks: {
      showWelcomeMessagePrompt: () => { hooks.showCount += 1; },
      cancelWelcomeMessagePrompt: () => { hooks.cancelCount += 1; },
    },
  });
  sync.resolve(null);
  await sync.promise;
  await Promise.resolve();
  assert.equal(hooks.showCount, 0);
  assert.equal(hooks.cancelCount, 1);
}

async function main() {
  assert.match(appSource, /const signupProfileSync = syncAccountProfileToBackend\(/);
  assert.match(appSource, /signupProfileSync[\s\S]{0,500}showWelcomeMessagePrompt/);
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf('runAuthSyncWithTimeout("signup profile sync"')),
    /if \(syncedUser\) \{[\s\S]{0,220}showWelcomeMessagePrompt/,
    "welcome popup must not depend only on timeout wrapper result",
  );
  assert.match(appSource, /async function runAuthSyncWithTimeout\(label, task, timeoutMs = 6000\)/);

  await testFastSync();
  await testSlowSyncAfterTimeout();
  await testLateFailure();
  await testFailureBeforeTimeout();

  console.log("PASS signup welcome profile sync timing");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
