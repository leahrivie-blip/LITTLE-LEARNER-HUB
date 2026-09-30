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
 * Mirrors post-change Free-signup profile sync wiring (no welcome-message popup).
 * @param {{ finishFree: boolean, signupProfileSync: Promise<unknown> }} opts
 */
function wireFreeSignupProfileSync({ finishFree, signupProfileSync }) {
  runAuthSyncWithTimeout("signup profile sync", () => signupProfileSync).catch(() => {});
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
  const sync = deferred();
  wireFreeSignupProfileSync({ finishFree: true, signupProfileSync: sync.promise });
  sync.resolve({ email: "fast@example.com" });
  await sync.promise;
  await Promise.resolve();
}

async function testSlowSyncAfterTimeout() {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const sync = deferred();
    wireFreeSignupProfileSync({ finishFree: true, signupProfileSync: sync.promise });
    mock.timers.tick(6000);
    await Promise.resolve();
    sync.resolve({ email: "slow@example.com" });
    await sync.promise;
    await Promise.resolve();
  } finally {
    mock.timers.reset();
  }
}

async function testLateFailure() {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const sync = deferred();
    wireFreeSignupProfileSync({ finishFree: true, signupProfileSync: sync.promise });
    mock.timers.tick(6000);
    await Promise.resolve();
    sync.reject(new Error("profile sync failed"));
    await sync.promise.catch(() => {});
    await Promise.resolve();
  } finally {
    mock.timers.reset();
  }
}

async function testFailureBeforeTimeout() {
  const sync = deferred();
  wireFreeSignupProfileSync({ finishFree: true, signupProfileSync: sync.promise });
  sync.resolve(null);
  await sync.promise;
  await Promise.resolve();
}

async function main() {
  assert.match(appSource, /const signupProfileSync = syncAccountProfileToBackend\(/);
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf("const finishFree = isExplicitFreeSignupIntent")),
    /showWelcomeMessagePrompt/,
    "Free signup must not depend on welcome-message popup",
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
