/**
 * Shared port helpers for Playwright / server spawn tests.
 * Release gate sets LLH_TEST_PORT per suite to avoid random port collisions.
 */
const net = require("node:net");

function allocatePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const { port } = probe.address();
      probe.close((closeError) => {
        if (closeError) reject(closeError);
        else resolve(port);
      });
    });
  });
}

function resolveTestPort(fallbackBase = 27200, fallbackSpan = 200) {
  const fromEnv = Number(process.env.LLH_TEST_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  return fallbackBase + Math.floor(Math.random() * fallbackSpan);
}

module.exports = { allocatePort, resolveTestPort };
