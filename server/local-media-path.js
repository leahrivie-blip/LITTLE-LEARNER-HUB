"use strict";

const path = require("node:path");

function resolveLocalMediaAssetBase(directory, assetId) {
  const root = path.resolve(String(directory || ""));
  const id = String(assetId || "").trim();
  if (!root || !id || !/^[a-z0-9][a-z0-9._-]{0,191}$/i.test(id)) {
    throw new Error("Invalid local media asset path.");
  }
  const target = path.resolve(root, id);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Local media asset path escapes its storage root.");
  }
  return target;
}

module.exports = { resolveLocalMediaAssetBase };
