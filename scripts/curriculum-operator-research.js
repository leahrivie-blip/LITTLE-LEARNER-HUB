"use strict";

const UNAVAILABLE_MESSAGE = "Live research is not connected yet. I can continue without current web research, or you can add an approved research provider.";

function researchUnavailable(query = "") {
  return {
    ok: false,
    available: false,
    code: "research_provider_unavailable",
    query: String(query || "").slice(0, 800),
    sources: [],
    message: UNAVAILABLE_MESSAGE,
  };
}

function requestResearch({ query = "", provider = null } = {}) {
  if (typeof provider !== "function") return researchUnavailable(query);
  return researchUnavailable(query);
}

module.exports = { UNAVAILABLE_MESSAGE, researchUnavailable, requestResearch };
