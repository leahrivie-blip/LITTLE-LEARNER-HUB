#!/usr/bin/env node
/**
 * Phase 7.5 live architect smoke — skipped unless LLH_OPERATOR_LIVE_CREATE=1.
 */
"use strict";

if (!["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_LIVE_CREATE || "").trim().toLowerCase())) {
  console.log("SKIP: set LLH_OPERATOR_LIVE_CREATE=1 to run live Phase 7.5 architect smoke.");
  process.exit(0);
}

console.error("Live Phase 7.5 architect smoke is reserved for owner-supervised runs.");
process.exit(1);
