/**
 * @param {import('@playwright/test').Page} page
 * @param {'logged-out'|'free'|'trial'|'pro'|'founding'} persona
 */
async function setUserPersona(page, persona) {
  const url = page.url();
  if (!url || url === "about:blank" || !url.includes("index.html")) {
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  }
  await page.evaluate((mode) => {
    const accounts = {};
    if (mode === "logged-out") {
      localStorage.removeItem("llhUser");
      localStorage.removeItem("llhPlan");
      localStorage.setItem("llhAccounts", JSON.stringify({}));
      return;
    }
    const email = `${mode}-user@e2e.test`;
    if (mode === "free") {
      accounts[email] = {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      };
    } else if (mode === "trial") {
      accounts[email] = {
        email,
        plan: "Pro",
        subscriptionStatus: "Trial",
        trialStatus: "active",
      };
    } else if (mode === "pro") {
      accounts[email] = {
        email,
        plan: "Pro",
        subscriptionStatus: "Active",
        subscriptionStartedAt: new Date().toISOString(),
      };
    } else if (mode === "founding") {
      accounts[email] = {
        email,
        plan: "Founding",
        subscriptionStatus: "Active",
        foundingMember: true,
        subscriptionStartedAt: new Date().toISOString(),
      };
    }
    localStorage.setItem("llhUser", email);
    localStorage.setItem("llhAccounts", JSON.stringify(accounts));
    localStorage.setItem("llhPlan", accounts[email].plan);
    localStorage.removeItem("llhAdminUnlocked");
    localStorage.removeItem("llhAdminSession");
    localStorage.removeItem("llhAdminPreviewMode");
  }, persona);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function clearAdminSession(page) {
  await page.evaluate(() => {
    localStorage.removeItem("llhAdminUnlocked");
    localStorage.removeItem("llhAdminSession");
    localStorage.removeItem("llhAdminPreviewMode");
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function loginAsAdmin(page) {
  const email = process.env.E2E_ADMIN_EMAIL || "e2e-admin@test.local";
  const password = process.env.E2E_ADMIN_PASSWORD || "e2e-admin-pass-1b07";
  const code = process.env.E2E_ADMIN_ACCESS_CODE || "e2e-admin-code-1b07";

  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    if (typeof setView === "function") setView("admin");
  });
  await page.waitForSelector("#adminUnlockForm", { timeout: 30000 });
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/api/admin/login") && response.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.fill('input[name="adminEmail"]', email);
  await page.fill('input[name="adminPassword"]', password);
  await page.fill('input[name="adminCode"]', code);
  await page.click('#adminUnlockForm button[type="submit"]');
  const response = await loginResponse;
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Admin login failed (${response.status()}): ${body}`);
  }
  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 30000 });
  await page.waitForResponse(
    (resp) => resp.url().includes("/api/admin/site-content") && resp.status() === 200,
    { timeout: 30000 },
  ).catch(() => {});
}

module.exports = {
  setUserPersona,
  clearAdminSession,
  loginAsAdmin,
};
