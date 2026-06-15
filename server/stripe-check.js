const http = require("node:http");

const port = Number(process.env.PORT || 4242);
const url = `http://localhost:${port}/api/stripe-readiness`;

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
          reject(new Error(`Readiness endpoint did not return JSON: ${error.message}`));
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
      console.error(`Stripe readiness check failed with HTTP ${statusCode}.`);
      process.exit(1);
    }
    console.log("Little Learner Hub Stripe Readiness");
    console.log(`Server: ${url}`);
    console.log(`Stripe mode: ${data.stripe.mode}`);
    console.log(`Webhook configured: ${data.stripe.webhookConfigured ? "yes" : "no"}`);
    console.log(`Founding spots remaining: ${data.founding.remaining} of ${data.founding.limit}`);
    if (data.stripe.ready) {
      console.log("Status: LAUNCH READY");
      console.log("Next: open the website, click Upgrade, and complete a Stripe checkout.");
      return;
    }
    if (data.stripe.checkoutReady) {
      console.log("Status: CHECKOUT READY");
      console.log("Launch blocker: Stripe webhook secret is not configured yet.");
      console.log("Next: add STRIPE_WEBHOOK_SECRET after creating the webhook endpoint.");
      return;
    }
    console.log("Status: NOT READY");
    console.log(`Missing: ${data.stripe.missing.join(", ")}`);
    console.log("Next: paste real Stripe test keys and price IDs into .env, restart the server, then run this again.");
    process.exit(1);
  } catch (error) {
    console.error("Could not reach the Little Learner Hub server.");
    console.error(`Start it first with: node server/index.js`);
    console.error(error.message);
    process.exit(1);
  }
})();
