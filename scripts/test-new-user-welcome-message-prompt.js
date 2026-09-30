#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "scripts", "new-user-onboarding.js"), "utf8");
const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const values = new Map();
const listeners = {};

function classList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    contains: (item) => values.has(item),
    toggle: (item, force) => {
      if (force) values.add(item);
      else values.delete(item);
    },
  };
}

const modal = { classList: classList(), setAttribute() {} };
const body = { innerHTML: "" };
const document = {
  readyState: "complete",
  body: { classList: classList() },
  querySelector(selector) {
    if (selector === "#newUserOnboardingModal") return modal;
    if (selector === "#newUserOnboardingBody") return body;
    return null;
  },
  addEventListener(type, callback) {
    listeners[type] = callback;
  },
};
const sandbox = {
  console,
  document,
  localStorage: {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  },
  sessionStorage: { getItem: () => null, setItem() {} },
  setTimeout: (callback) => callback(),
  currentUser: "new-provider@example.com",
  setView(view, options) {
    sandbox.lastView = { view, options };
  },
};
sandbox.trackEvent = (name, detail) => {
  sandbox.events = sandbox.events || [];
  sandbox.events.push({ name, detail });
};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: "new-user-onboarding.js" });

const onboarding = sandbox.NewUserOnboarding;
onboarding.beginAfterFreeSignup();
assert.equal(onboarding.getState().step, "free-signup-success", "Free signup uses single success step");
assert.equal(modal.classList.contains("open"), true, "success surface opens after Free signup");
assert.match(body.innerHTML, /Explore Lesson Plans/);
assert.doesNotMatch(body.innerHTML, /Read My Message/);
assert.equal(onboarding.showWelcomeMessagePrompt(), false, "welcome-message prompt never blocks Free signup");

listeners.click({
  preventDefault() {},
  target: { closest: () => ({ getAttribute: () => "explore-lesson-plans" }) },
});
assert.equal(modal.classList.contains("open"), false, "Explore Lesson Plans dismisses onboarding");
assert.equal(onboarding.getState().step, "done");
assert.ok(
  (sandbox.events || []).some((e) => e.name === "explore_lesson_plans_clicked"),
  "explore_lesson_plans_clicked tracked",
);

onboarding.beginAfterFreeSignup();
assert.equal(modal.classList.contains("open"), false, "completed onboarding does not reopen on repeat begin");

onboarding.clearOnLogout();
sandbox.currentUser = "legacy-welcome@example.com";
values.set("llhNewUserOnboardingV1", JSON.stringify({
  active: true,
  step: "welcome",
  accountEmail: "legacy-welcome@example.com",
  freeChosenAtSignup: true,
  freeSelectedAt: new Date().toISOString(),
  completedAt: "",
  firstTimeUser: true,
  experiment: "A",
  milestones: {},
  checklist: {},
  lessonOpenCount: 0,
}));
modal.classList.remove("open");
onboarding.maybeResumeOnBoot();
assert.equal(onboarding.getState().step, "free-signup-success", "legacy welcome step migrates to single surface");
assert.equal(modal.classList.contains("open"), true, "incomplete Free onboarding resumes on boot");

assert.match(appSource, /const signupProfileSync = syncAccountProfileToBackend\(/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf("const finishFree = isExplicitFreeSignupIntent")),
  /showWelcomeMessagePrompt/,
  "Free fast signup does not open welcome-message prompt",
);
assert.match(appSource, /trackEvent\("signup_landed_free"/);
assert.match(appSource, /beginNewUserOnboardingAfterFreeSignup\(\)/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf('finishSignupWithPlan("free")')),
  /signup_landed_free[\s\S]{0,120}finishSignupWithPlan/,
  "signup_landed_free is not duplicated on fast path after finishSignupWithPlan",
);

console.log("PASS new-user welcome message prompt");
