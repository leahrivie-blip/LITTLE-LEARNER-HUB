/**
 * Shared shell version manifest for cache-bust alignment tests.
 */
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.join(__dirname, "..", "llh-shell-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

module.exports = {
  version: manifest.version,
  cacheName: manifest.cacheName,
  manifestPath,
};
