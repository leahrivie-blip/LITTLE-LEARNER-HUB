const { chromium, devices } = require("playwright");
const path = require("path");
const fs = require("fs");

const outDir = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("/workspace/artifacts/screenshots", { recursive: true });

async function capture(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  fs.copyFileSync(file, path.join("/workspace/artifacts/screenshots", name));
  console.log("saved", name);
}

async function runViewport(label, viewport, deviceName) {
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext(
    deviceName
      ? { ...devices[deviceName] }
      : { viewport, deviceScaleFactor: 1 },
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4179/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });

  // Step 1
  await page.click("#signupButton");
  await page.waitForSelector("#authModal.open");
  await page.waitForTimeout(400);
  await capture(page, `signup-step1-account-${label}.png`);

  // Complete step 1 with local demo auth
  const email = `signup.demo.${label}.${Date.now()}@example.com`;
  await page.fill("#fullNameInput", "Jordan Provider");
  await page.fill("#emailInput", email);
  await page.fill("#passwordInput", "password123");
  await page.click("#authSubmitButton");
  await page.waitForSelector('#signupStepProgram:not(.hidden-field)', { timeout: 15000 });
  await page.waitForTimeout(400);
  await capture(page, `signup-step2-program-${label}.png`);

  await page.click('[data-signup-persona="home_daycare"]');
  await page.fill("#signupProgramNameInput", "Sunshine Home Daycare");
  await page.click("#authSubmitButton");
  await page.waitForSelector('#signupStepPlan:not(.hidden-field)', { timeout: 15000 });
  await page.waitForSelector(".signup-plan-card--founding", { timeout: 15000 });
  await page.waitForTimeout(500);
  await capture(page, `signup-step3-plans-${label}.png`);

  await browser.close();
}

(async () => {
  await runViewport("desktop", { width: 1280, height: 900 });
  await runViewport("mobile", null, "iPhone 13");
  console.log("screenshots complete");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
