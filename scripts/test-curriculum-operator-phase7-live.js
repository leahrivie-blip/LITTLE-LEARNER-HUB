#!/usr/bin/env node
/**
 * Phase 7 live create smoke — skipped unless LLH_OPERATOR_LIVE_CREATE=1.
 * CI must not enable this.
 */
"use strict";

if (!["1", "true", "yes"].includes(String(process.env.LLH_OPERATOR_LIVE_CREATE || "").trim().toLowerCase())) {
  console.log("SKIP: set LLH_OPERATOR_LIVE_CREATE=1 to run live Phase 7 create smoke.");
  process.exit(0);
}

console.error("Live Phase 7 create smoke is reserved for owner-supervised runs; not implemented as an automated live harness.");
process.exit(1);
