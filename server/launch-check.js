const http = require("node:http");

const port = Number(process.env.PORT || 4242);
const url = `http://localhost:${port}/api/launch-readiness`;

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
          reject(new Error(`Launch readiness endpoint did not return JSON: ${error.message}`));
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(5000, () => request.destroy(new Error("Timed out waiting for the Little Learner Hub server.")));
  });
}

(async () => {
  try {
    const { statusCode, data } = await requestJson(url);
    if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
    console.log("Little Learner Hub Website Launch Check");
    console.log(`Status: ${data.ready ? "READY" : "NOT READY"}`);
    console.log(data.message);
    for (const [key, value] of Object.entries(data.required)) {
      console.log(`${key}: ${value.ready ? "ready" : "needed"}`);
    }
    if (!data.ready) process.exit(1);
  } catch (error) {
    console.error("Could not run launch check.");
    console.error("Start the website backend first with: node server/index.js");
    console.error(error.message);
    process.exit(1);
  }
})();
