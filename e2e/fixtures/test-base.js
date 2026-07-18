const { test: pwTest, expect } = require("@playwright/test");

const test = pwTest.extend({
  page: async ({ page }, use, testInfo) => {
    /** @type {string[]} */
    const consoleErrors = [];
    /** @type {Array<{url: string, method: string, failure: string}>} */
    const networkFailures = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("requestfailed", (request) => {
      networkFailures.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText || "unknown failure",
      });
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = testInfo.outputPath("failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      await testInfo.attach("failure-screenshot", {
        path: screenshotPath,
        contentType: "image/png",
      }).catch(() => {});

      const detail = {
        failedStep: testInfo.title,
        expected: "Test expectations to pass",
        actual: `Test failed with status ${testInfo.status}`,
        consoleErrors,
        networkFailures,
      };
      await testInfo.attach("failure-details", {
        body: JSON.stringify(detail, null, 2),
        contentType: "application/json",
      });
    }
  },
});

module.exports = { test, expect };
