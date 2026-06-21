const http = require("node:http");

const port = Number(process.env.PORT || 4242);
const url = `http://localhost:${port}/api/billing-readiness`;

const checkLabels = {
  stripeKeysConnected: "Stripe keys connected",
  webhookConfigured: "Webhook configured",
  subscriptionPermissions: "Subscriptions update permissions",
  freeTrialPaidFlow: "Free → Trial → Paid flow",
  cancellationsWork: "Cancellations",
  upgradePrompts: "Upgrade prompts at limits",
  dataRetention: "User data kept after cancel",
};

function requestJson(target) {
  return new Promise((resolve, reject) => {
    const request = http.get(target, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({
            statusCode: response.statusCode,
            data: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          });
        } catch (error) {
          reject(new Error(`Billing readiness endpoint did not return JSON: ${error.message}`));
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(5000, () => {
      request.destroy(new Error("Timed out waiting for the Little Learner Hub server."));
    });
  });
}

(async () => {
  try {
    const { statusCode, data } = await requestJson(url);
    if (statusCode !== 200) {
      console.error(`Billing readiness check failed with HTTP ${statusCode}.`);
      process.exit(1);
    }
    console.log("Little Learner Hub Billing Verification");
    console.log(`Server: ${url}`);
    console.log("");
    for (const [key, label] of Object.entries(checkLabels)) {
      const check = data.checks?.[key];
      const status = check?.ready ? "PASS" : "FAIL";
      console.log(`[${status}] ${label}`);
      if (check?.note) console.log(`       ${check.note}`);
    }
    console.log("");
    if (data.ready) {
      console.log("Status: ALL CHECKS PASSED");
      console.log("Next: run a live test checkout and confirm the webhook updates account status.");
    } else {
      console.log(`Status: NOT READY — fix: ${data.notReady.join(", ")}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Could not reach the Little Learner Hub server.");
    console.error("Start it first with: node server/index.js");
    console.error(error.message);
    process.exit(1);
  }
})();
