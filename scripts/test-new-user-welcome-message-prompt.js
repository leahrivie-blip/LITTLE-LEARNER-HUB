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
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: "new-user-onboarding.js" });

const onboarding = sandbox.NewUserOnboarding;
onboarding.beginAfterFreeSignup({ deferWelcomeMessagePrompt: true });
assert.equal(onboarding.getState().step, "welcome-message");
assert.equal(modal.classList.contains("open"), false, "prompt waits for authenticated profile sync");
assert.equal(onboarding.showWelcomeMessagePrompt(), true);
assert.equal(modal.classList.contains("open"), true, "new signup opens the welcome-message prompt");
assert.match(body.innerHTML, /Start by choosing a lesson plan for your age group/i);
assert.match(body.innerHTML, /Leah is here to help with lesson plans, activities, or classroom ideas/i);
assert.match(body.innerHTML, /Explore Lesson Plans/);
assert.doesNotMatch(body.innerHTML, /I sent you a welcome message|Read My Message|Maybe Later|11 complete/i);
assert.ok(onboarding.getState().welcomeMessagePromptShownAt, "prompt stores its own one-time display stamp");
assert.equal(onboarding.showWelcomeMessagePrompt(), false, "duplicate signup completion cannot reopen the prompt");

listeners.click({
  preventDefault() {},
  target: { closest: () => ({ getAttribute: () => "choose-free" }) },
});
assert.equal(modal.classList.contains("open"), false, "lesson-library action closes the welcome prompt");
assert.equal(sandbox.lastView.view, "lessons", "welcome action opens the lesson library");
assert.equal(onboarding.getState().step, "done", "lesson-library action completes the focused Free welcome");

onboarding.clearOnLogout();
sandbox.currentUser = "resume-welcome@example.com";
onboarding.beginAfterFreeSignup();
modal.classList.remove("open");
onboarding.maybeResumeOnBoot();
assert.equal(modal.classList.contains("open"), true, "other onboarding steps still resume on boot");

onboarding.clearOnLogout();
sandbox.currentUser = "sync-failure@example.com";
onboarding.beginAfterFreeSignup({ deferWelcomeMessagePrompt: true });
onboarding.cancelWelcomeMessagePrompt();
assert.equal(onboarding.getState().step, "welcome", "profile-sync failure clears only the deferred prompt state");
assert.equal(onboarding.showWelcomeMessagePrompt(), false, "a failed profile sync cannot show the welcome-message prompt later");

onboarding.beginAfterFreeSignup({ deferWelcomeMessagePrompt: true });
onboarding.showWelcomeMessagePrompt();
listeners.click({
  preventDefault() {},
  target: { closest: () => ({ getAttribute: () => "choose-free" }) },
});
assert.equal(sandbox.lastView.view, "lessons");
assert.equal(sandbox.lastView.options.fromAuthLanding, true, "welcome action uses the lesson-library onboarding destination");

assert.match(source, /state\.step !== "welcome-message"/, "welcome-message is excluded from boot resume");
const membershipCopy = appSource.slice(appSource.indexOf("const MEMBERSHIP_COPY"), appSource.indexOf("const freePlanAgeGroups"));
assert.match(membershipCopy, /freeStarterSection: "Your Included Free Plans"/);
assert.match(membershipCopy, /freeStarterProgress: "Your included Free lesson plans are ready to explore\."/);
assert.match(membershipCopy, /freePolicyNotice: "Your Free account includes lesson plans across Infant, Toddler, and Preschool\./);
const relatedFreeLibraryCopy = membershipCopy.match(/freeStarterProgress:.*|freePolicyNotice:.*/g)?.join("\n") || "";
assert.doesNotMatch(relatedFreeLibraryCopy, /11 complete starter lesson plans/);
assert.match(appSource, /const signupProfileSync = syncAccountProfileToBackend\(/);
assert.match(appSource, /signupProfileSync[\s\S]{0,500}showWelcomeMessagePrompt/);
assert.match(appSource, /deferWelcomeMessagePrompt: true/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf("finishSignupWithPlan")),
  /showWelcomeMessagePrompt[\s\S]{0,400}finishSignupWithPlan\("pro"/,
  "Pro signup does not trigger the Free signup-only popup",
);
assert.match(appSource, /NewUserOnboarding\?\.showWelcomeMessagePrompt\?\.\(\)/);
assert.match(appSource, /NewUserOnboarding\?\.cancelWelcomeMessagePrompt\?\.\(\)/);
assert.match(appSource, /Welcome message prompt failed/);
assert.doesNotMatch(
  appSource.slice(appSource.indexOf("const result = await loginWithProvider")),
  /showWelcomeMessagePrompt/,
  "normal login does not trigger the signup-only popup",
);

console.log("PASS new-user welcome message prompt");
