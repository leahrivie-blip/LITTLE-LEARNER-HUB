/**
 * Reliable Admin unlock for Playwright browser tests.
 * Uses the login API directly to avoid form-handler race conditions during boot.
 */
async function unlockAdminInBrowser(page, base, {
  email = "admin@test.local",
  password = "test-password",
  code = "test-code",
  openMessages = false,
} = {}) {
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("body.app-boot-ready", { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(
    () => typeof window.setView === "function" && typeof window.renderAdminDashboard === "function",
    null,
    { timeout: 30000 },
  );

  const loginError = await page.evaluate(async ({ apiBase, ownerEmail, ownerPassword, ownerCode }) => {
    try {
      const res = await fetch(`${apiBase}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword, code: ownerCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || `Login failed (${res.status})`;
      localStorage.setItem("llhAdminUnlocked", "true");
      localStorage.setItem("llhAdminSession", JSON.stringify({
        token: data.token,
        email: data.email || ownerEmail,
        mode: data.mode || "server",
        trustedDevice: true,
      }));
      if (typeof window.setView === "function") window.setView("admin");
      if (typeof window.renderAdminDashboard === "function") window.renderAdminDashboard();
      return "";
    } catch (error) {
      return error?.message || "Admin login failed.";
    }
  }, { apiBase: base, ownerEmail: email, ownerPassword: password, ownerCode: code });

  if (loginError) {
    throw new Error(loginError);
  }

  await page.waitForSelector("#adminProtectedContent:not([hidden])", { timeout: 20000 });

  if (openMessages) {
    await page.locator('[data-admin-group="messages"]').click();
    await page.waitForSelector(".admin-messages-workspace-nav, #adminWorkspaceLandingApp", { timeout: 20000 });
  }
}

module.exports = { unlockAdminInBrowser };
