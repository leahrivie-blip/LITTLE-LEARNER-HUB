#!/usr/bin/env node
/**
 * Tester-site Forms workflow: catalog archive, child-locked fill, injury-from-home, extra meals.
 * Run: npm run test:forms-workflow-tester
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const testerJs = fs.readFileSync(path.join(ROOT, "scripts", "forms-workflow-tester.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server", "index.js"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("syntax of tester module is valid", () => {
  const { execFileSync } = require("node:child_process");
  execFileSync(process.execPath, ["--check", path.join(ROOT, "scripts", "forms-workflow-tester.js")]);
});

test("isolated tester module is wired and fenced", () => {
  assert.match(html, /scripts\/forms-workflow-tester\.js/);
  assert.match(html, /styles\/forms-workflow-tester\.css/);
  assert.match(testerJs, /isHomeDaycareHubTestingEnabled/);
  assert.match(testerJs, /formCatalogArchive/);
  assert.match(testerJs, /archived: true/);
  assert.match(testerJs, /form-medical-forms-injury-or-mark-from-home/);
  assert.match(testerJs, /Add meal\/snack/);
  assert.match(testerJs, /careSettingNoun/);
  assert.match(testerJs, /formsCareSettingNoun/);
  assert.doesNotMatch(testerJs, /Do not merge/);
});

test("does not rewrite Documents source of truth or delete records on archive", () => {
  assert.match(testerJs, /appendChildRecord\("Documents"/);
  assert.match(testerJs, /saveProgramSettings/);
  assert.doesNotMatch(testerJs, /saveChildStore\("Documents", \[\]\)/);
  assert.match(appJs, /function appendChildRecord/);
  assert.match(appJs, /function renderChildFormsRecordsTab/);
  assert.match(appJs, /function renderFormsSettingsPage/);
});

test("catalog archive never writes Documents or doc.archived", () => {
  const setFn = testerJs.slice(testerJs.indexOf("function setFormTypeArchived"), testerJs.indexOf("function injuryFromHomeResource"));
  assert.match(setFn, /enabled\(\)/);
  assert.match(setFn, /formCatalogArchive/);
  assert.doesNotMatch(setFn, /saveChildStore/);
  assert.doesNotMatch(setFn, /doc\.archived/);
  assert.match(testerJs, /Hide from new forms/);
  assert.match(testerJs, /does not delete completed paperwork/);
});

test("no production env or deploy hooks in this change", () => {
  assert.doesNotMatch(testerJs, /RENDER_API_KEY|env:apply|replace:\s*true/);
  assert.doesNotMatch(serverJs.slice(0, 400), /this file was rewritten by forms workflow/);
});

function request(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth(port, child, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const res = await request(port, "GET", "/api/health");
      if (res.status === 200) return;
    } catch (_error) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

async function runBrowser() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (_error) {
    console.log("SKIP  playwright not installed — static checks only");
    return;
  }

  const port = 41000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-forms-wf-${crypto.randomBytes(6).toString("hex")}.json`);
  let browser;
  const childProc = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      HOME_DAYCARE_HUB_TESTING: "true",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    browser = await chromium.launch({ headless: true });
    await waitForHealth(port, childProc);
    const owner = "forms.wf.owner@example.com";
    const ownerB = "forms.wf.ownerb@example.com";
    const childId = "child-wf-luna";
    const childBId = "child-wf-milo";
    const oldMealId = "Documents-old-meal-1";
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(({ email, emailB, childId: id, childBId: idB, oldMealId: mealId }) => {
      if (localStorage.getItem("llhFormsWfSeeded") === "1") return;
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        [email]: {
          email,
          plan: "Pro",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "active",
          stripeSubscriptionStatus: "active",
          programSettings: { programName: "Workflow Tester Daycare", formTemplates: [] },
        },
        [emailB]: {
          email: emailB,
          plan: "Pro",
          role: "owner",
          accountType: "home_daycare",
          subscriptionStatus: "active",
          stripeSubscriptionStatus: "active",
          programSettings: { programName: "Program B Daycare", formTemplates: [] },
        },
      }));
      localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify([
        { id, name: "Luna", ageGroup: "Toddler", archived: false },
        { id: idB, name: "Milo", ageGroup: "Preschool", archived: false },
      ]));
      localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([
        {
          id: mealId,
          childId: id,
          title: "Meal Tracking Sheet",
          resourceId: "form-daily-forms-meal-tracking-sheet",
          status: "on_file",
          statusLabel: "On file",
          date: "2026-01-15",
          draftText: "Meal Tracking Sheet\nBreakfast offered: Oatmeal\nLunch offered: Pasta\nSnack offered: Apple",
          archived: false,
        },
      ]));
      localStorage.setItem(`llhChild:${emailB}:Profiles`, JSON.stringify([
        { id: "child-b-ada", name: "Ada", ageGroup: "Toddler", archived: false },
      ]));
      localStorage.setItem(`llhChild:${emailB}:Documents`, JSON.stringify([]));
      localStorage.setItem("llhSelectedChild", id);
      localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      localStorage.setItem("llhFormsWfSeeded", "1");
    }, { email: owner, emailB: ownerB, childId, childBId, oldMealId });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LLH_FORMS_WORKFLOW_TESTER && window.LLH_FORMS_WORKFLOW_TESTER.enabled());

    const injuryId = await page.evaluate(() => window.LLH_FORMS_WORKFLOW_TESTER.INJURY_FROM_HOME_ID);
    const mealId = await page.evaluate(() => window.LLH_FORMS_WORKFLOW_TESTER.MEAL_TRACKING_ID);
    assert.equal(injuryId, "form-medical-forms-injury-or-mark-from-home");

    await page.evaluate((id) => {
      selectedChildId = id;
      childManagementMode = "profile";
      childProfileTab = "forms-records";
      if (typeof setView === "function") setView("children");
      else renderChildManagement();
    }, childId);
    await page.waitForSelector("#formsWorkflowPickForm", { state: "attached", timeout: 20000 });
    assert.ok(await page.locator("#formsWorkflowPickForm").textContent());

    // Old meal record still listed
    const history = await page.locator("[data-hdh-forms-list]").innerText();
    assert.match(history, /Meal Tracking Sheet/);
    assert.match(history, /2026-01-15/);

    // Fill injury from home
    await page.selectOption("#formsWorkflowPickForm [name='resourceId']", injuryId);
    await page.click("#formsWorkflowPickForm button[type='submit']");
    await page.waitForSelector("#formsWorkflowFillForm");
    const lockedChild = await page.inputValue("#formsWorkflowFillForm [name='childName']");
    assert.equal(lockedChild, "Luna");
    await page.fill("#formsWorkflowFillForm [name='injuryType']", "Bruise");
    await page.fill("#formsWorkflowFillForm [name='bodyLocation']", "Left knee");
    await page.selectOption("#formsWorkflowFillForm [name='headInjury']", "No");
    await page.fill("#formsWorkflowFillForm [name='description']", "Small bruise noticed at arrival.");
    await page.click("#formsWorkflowFillForm button[type='submit']");
    await page.waitForTimeout(300);

    const afterInjury = await page.evaluate(() => JSON.parse(localStorage.getItem(`llhChild:${localStorage.getItem("llhUser")}:Documents`) || "[]"));
    const injuryDocs = afterInjury.filter((d) => d.resourceId === injuryId);
    assert.equal(injuryDocs.length, 1);
    assert.equal(injuryDocs[0].childId, childId);
    assert.match(String(injuryDocs[0].draftText || ""), /Left knee/);
    assert.match(String(injuryDocs[0].draftText || ""), /before the child entered care/);
    assert.doesNotMatch(String(injuryDocs[0].draftText || ""), /diagnos|guarantees licensing/i);
    assert.equal(afterInjury.filter((d) => d.id === oldMealId).length, 1, "historical meal record preserved");
    const injuryDocId = injuryDocs[0].id;

    await page.evaluate((idB) => {
      selectedChildId = idB;
      childManagementMode = "profile";
      childProfileTab = "forms-records";
      renderChildManagement();
    }, childBId);
    await page.waitForSelector("#formsWorkflowPickForm", { state: "attached" });
    const miloHistory = await page.locator("[data-hdh-forms-list]").innerText();
    assert.doesNotMatch(miloHistory, /Left knee/);
    const miloDocs = await page.evaluate(({ email, idB }) => {
      return JSON.parse(localStorage.getItem(`llhChild:${email}:Documents`) || "[]").filter((d) => d.childId === idB);
    }, { email: owner, idB: childBId });
    assert.equal(miloDocs.length, 0, "Child B must not receive Child A records");

    await page.evaluate((id) => {
      selectedChildId = id;
      childProfileTab = "forms-records";
      renderChildManagement();
    }, childId);

    // Custom meal/snack entries
    await page.evaluate((id) => {
      childProfileTab = "forms-records";
      renderChildManagement();
    }, childId);
    await page.selectOption("#formsWorkflowPickForm [name='resourceId']", mealId);
    await page.click("#formsWorkflowPickForm button[type='submit']");
    await page.waitForSelector("#formsWorkflowFillForm");
    await page.click("[data-forms-wf-add-meal]");
    await page.waitForSelector("[name='mealLabel-3']");
    await page.fill("[name='mealLabel-3']", "Bottle");
    await page.fill("[name='mealTime-3']", "10:30");
    await page.fill("[name='mealOffered-3']", "4 oz milk");
    await page.click("#formsWorkflowFillForm button[type='submit']");
    await page.waitForTimeout(300);
    const afterMeal = await page.evaluate(() => JSON.parse(localStorage.getItem(`llhChild:${localStorage.getItem("llhUser")}:Documents`) || "[]"));
    const newMeals = afterMeal.filter((d) => d.resourceId === mealId && d.id !== oldMealId);
    assert.equal(newMeals.length, 1);
    assert.ok(Array.isArray(newMeals[0].mealEntries));
    assert.equal(newMeals[0].mealEntries.some((row) => row.label === "Bottle"), true);
    assert.match(String(newMeals[0].draftText || ""), /Bottle/);
    assert.equal(afterMeal.filter((d) => d.id === oldMealId)[0].draftText.includes("Oatmeal"), true);
    assert.equal(afterMeal.filter((d) => d.id === oldMealId)[0].mealEntries == null, true, "old records are not migrated to mealEntries");
    const mealDocId = newMeals[0].id;
    assert.notEqual(mealDocId, injuryDocId);

    const printOk = await page.evaluate((id) => {
      const originalPrint = window.print;
      window.print = () => {};
      try {
        printChildDocumentRecord(id);
        return true;
      } catch (_error) {
        return false;
      } finally {
        window.print = originalPrint;
      }
    }, injuryDocId);
    assert.equal(printOk, true, "historical/new records still print after save");

    // Double-submit must not duplicate
    await page.evaluate((id) => {
      selectedChildId = id;
      childProfileTab = "forms-records";
      renderChildManagement();
    }, childId);
    await page.selectOption("#formsWorkflowPickForm [name='resourceId']", injuryId);
    await page.click("#formsWorkflowPickForm button[type='submit']");
    await page.waitForSelector("#formsWorkflowFillForm");
    await page.fill("#formsWorkflowFillForm [name='description']", "Minimal arrival mark.");
    await page.evaluate(() => {
      const form = document.querySelector("#formsWorkflowFillForm");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(400);
    const afterDouble = await page.evaluate(() => JSON.parse(localStorage.getItem(`llhChild:${localStorage.getItem("llhUser")}:Documents`) || "[]"));
    assert.equal(afterDouble.filter((d) => d.resourceId === injuryId).length, 2, "one extra save from double-submit, not two extras");

    // Record-level archive vs catalog archive
    await page.evaluate((id) => {
      const email = localStorage.getItem("llhUser");
      const docs = JSON.parse(localStorage.getItem(`llhChild:${email}:Documents`) || "[]").map((d) => (
        d.id === id ? { ...d, archived: true } : d
      ));
      localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify(docs));
    }, oldMealId);
    assert.equal(await page.evaluate((id) => window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id), mealId), false);

    // Archive form type
    await page.evaluate((id) => {
      window.LLH_FORMS_WORKFLOW_TESTER.setFormTypeArchived(id, true);
    }, mealId);
    assert.equal(await page.evaluate((id) => window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id), mealId), true);
    const docsAfterArchive = await page.evaluate(() => JSON.parse(localStorage.getItem(`llhChild:${localStorage.getItem("llhUser")}:Documents`) || "[]"));
    assert.ok(docsAfterArchive.some((d) => d.id === oldMealId));
    assert.equal(docsAfterArchive.filter((d) => d.resourceId === mealId && d.id !== oldMealId).every((d) => d.archived !== true), true);
    await page.evaluate((id) => {
      childProfileTab = "forms-records";
      renderChildManagement();
    }, childId);
    const pickerOptions = await page.locator("#formsWorkflowPickForm [name='resourceId'] option").allTextContents();
    assert.equal(pickerOptions.some((t) => /Meal Tracking/i.test(t)), false, "archived type hidden from staff picker");
    const historyAfterArchive = await page.locator("[data-hdh-forms-list]").innerText();
    assert.match(historyAfterArchive, /Meal Tracking Sheet/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    assert.equal(overflow, true, "no horizontal overflow at 390px");

    // Persistence across refresh
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.LLH_FORMS_WORKFLOW_TESTER && window.LLH_FORMS_WORKFLOW_TESTER.enabled());
    assert.equal(await page.evaluate((id) => window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id), mealId), true);
    const docsAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem(`llhChild:${localStorage.getItem("llhUser")}:Documents`) || "[]"));
    assert.ok(docsAfterReload.some((d) => d.id === mealDocId));
    assert.ok(docsAfterReload.some((d) => d.id === injuryDocId));

    await page.evaluate((id) => window.LLH_FORMS_WORKFLOW_TESTER.setFormTypeArchived(id, false), mealId);
    assert.equal(await page.evaluate((id) => window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id), mealId), false);

    // Program isolation
    await page.evaluate((emailB) => {
      if (typeof loadAccountState === "function") loadAccountState(emailB);
    }, ownerB);
    assert.equal(await page.evaluate((id) => window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id), mealId), false, "Program B must not inherit Program A catalog archive");
    await page.evaluate((email) => {
      if (typeof loadAccountState === "function") loadAccountState(email);
    }, owner);

    const nouns = await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts"));
      const read = (value) => {
        accounts[email].programSettings.careSettingNoun = value;
        localStorage.setItem("llhAccounts", JSON.stringify(accounts));
        if (typeof loadAccountState === "function") loadAccountState(email);
        return window.LLH_FORMS_WORKFLOW_TESTER.formsCareSettingNoun();
      };
      return {
        missing: (() => {
          delete accounts[email].programSettings.careSettingNoun;
          localStorage.setItem("llhAccounts", JSON.stringify(accounts));
          if (typeof loadAccountState === "function") loadAccountState(email);
          return window.LLH_FORMS_WORKFLOW_TESTER.formsCareSettingNoun();
        })(),
        blank: read(""),
        junk: read("classroom"),
        setting: read("setting"),
      };
    });
    assert.equal(nouns.missing, "Program");
    assert.equal(nouns.blank, "Program");
    assert.equal(nouns.junk, "Program");
    assert.equal(nouns.setting, "Setting");

    // Owner vs teacher / director catalog controls
    await page.goto(`http://127.0.0.1:${port}/#forms-settings`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      if (typeof setView === "function") setView("forms-settings");
      else renderFormsSettingsPage();
    });
    await page.waitForSelector("#formsWorkflowCatalogPanel");
    assert.ok(await page.locator("[data-forms-wf-archive]").count() > 0, "owner can archive");
    const settingsCopy = await page.locator("#formsWorkflowCatalogPanel").innerText();
    assert.match(settingsCopy, /does not delete completed paperwork/i);

    await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts"));
      accounts[email].role = "director";
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      if (typeof loadAccountState === "function") loadAccountState(email);
      renderFormsSettingsPage();
    });
    await page.waitForSelector("#formsWorkflowCatalogPanel");
    assert.ok(await page.locator("[data-forms-wf-archive]").count() > 0, "director can archive");

    await page.evaluate(() => {
      const email = localStorage.getItem("llhUser");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts"));
      accounts[email].role = "teacher";
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      if (typeof loadAccountState === "function") loadAccountState(email);
      renderFormsSettingsPage();
    });
    await page.waitForSelector("#formsWorkflowCatalogPanel");
    assert.equal(await page.locator("[data-forms-wf-archive]").count(), 0, "teacher cannot archive catalog");
    assert.equal(await page.evaluate((id) => {
      const before = JSON.stringify(window.LLH_FORMS_WORKFLOW_TESTER.setFormTypeArchived(id, true));
      return window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id) === false && before.indexOf(id) === -1 || !window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id);
    }, mealId), true, "teacher setFormTypeArchived is a no-op");

    // Fence off: new origin without testing flag
    const offPort = port + 1;
    const offStore = path.join(os.tmpdir(), `llh-forms-wf-off-${crypto.randomBytes(4).toString("hex")}.json`);
    const offProc = spawn(process.execPath, ["server/index.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(offPort),
        LLH_STORE_PATH: offStore,
        DATABASE_PROVIDER: "local-json",
        HOME_DAYCARE_HUB_TESTING: "false",
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await waitForHealth(offPort, offProc);
      const offPage = await browser.newPage();
      await offPage.addInitScript(({ email }) => {
        localStorage.setItem("llhUser", email);
        localStorage.setItem("llhPlan", "Pro");
        localStorage.setItem("llhAccounts", JSON.stringify({
          [email]: { email, plan: "Pro", role: "owner", accountType: "home_daycare", programSettings: {} },
        }));
        localStorage.setItem(`llhChild:${email}:Profiles`, JSON.stringify([{ id: "c1", name: "Luna", archived: false }]));
        localStorage.setItem(`llhChild:${email}:Documents`, JSON.stringify([]));
        localStorage.setItem("llhSelectedChild", "c1");
        localStorage.setItem("llhFreeWelcomeCardDismissed", "1");
      }, { email: owner });
      await offPage.goto(`http://127.0.0.1:${offPort}/`, { waitUntil: "domcontentloaded" });
      await offPage.waitForFunction(() => window.LLH_FORMS_WORKFLOW_TESTER);
      assert.equal(await offPage.evaluate(() => window.LLH_FORMS_WORKFLOW_TESTER.enabled()), false);
      await offPage.evaluate(() => {
        selectedChildId = "c1";
        childManagementMode = "profile";
        childProfileTab = "forms-records";
        if (typeof setView === "function") setView("children");
        else renderChildManagement();
      });
      assert.equal(await offPage.locator("#formsWorkflowPickForm").count(), 0);
      assert.equal(await offPage.locator("#formsWorkflowCatalogPanel").count(), 0);
      const hasInjury = await offPage.evaluate((id) => Array.isArray(resources) && resources.some((item) => item.id === id), injuryId);
      assert.equal(hasInjury, false, "injury form is not injected when fence is off");
      const mealText = await offPage.evaluate((id) => {
        const resource = (resources || []).find((item) => item.id === id) || { id, title: "Meal Tracking Sheet", category: "Forms Library" };
        return typeof formResourceContent === "function" ? formResourceContent(resource) : "";
      }, mealId);
      assert.doesNotMatch(mealText, /Additional meals \/ snacks/);
      assert.equal(await offPage.evaluate((id) => {
        window.LLH_FORMS_WORKFLOW_TESTER.setFormTypeArchived(id, true);
        return window.LLH_FORMS_WORKFLOW_TESTER.isFormTypeArchived(id);
      }, mealId), false, "catalog archive mutator no-ops when fence is off");
      await offPage.close();
    } finally {
      offProc.kill("SIGTERM");
    }

    console.log("PASS  playwright owner-safety audit (archive, children, fence, persistence, meals, injury)");
  } finally {
    if (browser) await browser.close().catch(() => {});
    childProc.kill("SIGTERM");
  }
}

runBrowser().catch((error) => {
  console.error("FAIL  playwright forms workflow");
  console.error(error);
  process.exitCode = 1;
}).then(() => {
  if (!process.exitCode) console.log("\nAll forms-workflow-tester checks passed.");
});
