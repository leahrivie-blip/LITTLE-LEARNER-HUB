/**
 * Custom-domain DNS checks for Little Learner Hub.
 * Official site: https://littlelearnershubbyleah.com
 */

const dns = require("node:dns").promises;

const RENDER_SERVICE_HOST = "little-learner-hub.onrender.com";
const RENDER_LOAD_BALANCER_IPV4 = "216.24.57.1";
const RENDER_LOAD_BALANCER_PREFIX = "216.24.57.";
const OFFICIAL_APEX_HOST = "littlelearnershubbyleah.com";
const OFFICIAL_WWW_HOST = "www.littlelearnershubbyleah.com";
const OFFICIAL_DOMAINS = [OFFICIAL_APEX_HOST, OFFICIAL_WWW_HOST];
const WORKING_APEX_HOST = OFFICIAL_APEX_HOST;
const WORKING_WWW_HOST = OFFICIAL_WWW_HOST;
const WORKING_BRAND_DOMAINS = OFFICIAL_DOMAINS;

function normalizeDnsHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function isRenderServiceHost(value) {
  const host = normalizeDnsHost(value);
  return host === RENDER_SERVICE_HOST || host.endsWith(".onrender.com");
}

function isRenderLoadBalancerIp(value) {
  const ip = String(value || "").trim();
  return ip === RENDER_LOAD_BALANCER_IPV4 || ip.startsWith(RENDER_LOAD_BALANCER_PREFIX);
}

function classifyDomainDns(records = {}) {
  const host = normalizeDnsHost(records.host);
  const a = (records.a || []).map((value) => String(value || "").trim()).filter(Boolean);
  const aaaa = (records.aaaa || []).map((value) => String(value || "").trim()).filter(Boolean);
  const cname = (records.cname || []).map(normalizeDnsHost).filter(Boolean);
  const ns = (records.ns || []).map(normalizeDnsHost).filter(Boolean);
  const pointsToRenderCname = cname.some(isRenderServiceHost);
  const pointsToRenderIp = a.some(isRenderLoadBalancerIp);
  const ready = pointsToRenderCname || pointsToRenderIp;

  let status = "unknown";
  let issue = "";
  let fix = "";

  if (ready) {
    status = "ready";
    fix = "DNS points at Render.";
  } else if (records.error) {
    status = "error";
    issue = records.error;
    fix = "DNS lookup failed. Retry in a few minutes.";
  } else if (!a.length && !cname.length) {
    status = "missing";
    issue = "No A or CNAME records found.";
    fix = host.startsWith("www.")
      ? `Add a CNAME for www → ${RENDER_SERVICE_HOST}.`
      : `Add an A record for @ → ${RENDER_LOAD_BALANCER_IPV4}.`;
  } else {
    status = "misconfigured";
    const observed = [
      ...cname.map((value) => `CNAME ${value}`),
      ...a.map((value) => `A ${value}`),
    ].join(", ") || "none";
    issue = `Does not point at Render yet (observed: ${observed}).`;
    fix = host.startsWith("www.")
      ? `Set www CNAME → ${RENDER_SERVICE_HOST} (or an A record to ${RENDER_LOAD_BALANCER_IPV4}).`
      : `Set apex (@) A → ${RENDER_LOAD_BALANCER_IPV4}. Remove any A record that is not Render.`;
  }

  return {
    status,
    ready,
    pointsToRender: ready,
    pointsToRenderCname,
    pointsToRenderIp,
    observed: { a, aaaa, cname, ns },
    issue,
    fix,
  };
}

async function resolveDnsRecords(hostname) {
  const host = normalizeDnsHost(hostname);
  const empty = { host, a: [], aaaa: [], cname: [], ns: [], error: "" };
  if (!host) return empty;
  try {
    const [a, aaaa, cname, ns] = await Promise.all([
      dns.resolve4(host).catch((error) => (error.code === "ENODATA" || error.code === "ENOTFOUND" ? [] : Promise.reject(error))),
      dns.resolve6(host).catch((error) => (error.code === "ENODATA" || error.code === "ENOTFOUND" ? [] : Promise.reject(error))),
      dns.resolveCname(host).catch((error) => (error.code === "ENODATA" || error.code === "ENOTFOUND" ? [] : Promise.reject(error))),
      dns.resolveNs(host.replace(/^www\./, "")).catch((error) => (error.code === "ENODATA" || error.code === "ENOTFOUND" ? [] : Promise.reject(error))),
    ]);
    return {
      host,
      a: Array.isArray(a) ? a : [],
      aaaa: Array.isArray(aaaa) ? aaaa : [],
      cname: Array.isArray(cname) ? cname.map(normalizeDnsHost) : [],
      ns: Array.isArray(ns) ? ns.map(normalizeDnsHost) : [],
      error: "",
    };
  } catch (error) {
    return { ...empty, error: error.message || "DNS lookup failed" };
  }
}

function buildHostReport(lookup) {
  return {
    host: lookup.host,
    a: lookup.a,
    aaaa: lookup.aaaa,
    cname: lookup.cname,
    ns: lookup.ns,
    error: lookup.error || "",
    ...classifyDomainDns(lookup),
  };
}

function buildRecommendedDns() {
  return [
    { type: "CNAME", host: "www", value: RENDER_SERVICE_HOST, note: "Preferred for www" },
    { type: "A", host: "@", value: RENDER_LOAD_BALANCER_IPV4, note: "Apex / root domain" },
  ];
}

function buildNextSteps({ ready, official, nameservers }) {
  if (ready) {
    return [
      "DNS points at Render. Confirm both hosts show verified certificates in Render → Custom Domains.",
      `Set SITE_URL=https://${OFFICIAL_APEX_HOST} in Render environment variables.`,
    ];
  }
  const nsList = (nameservers || []).join(", ") || "unknown";
  return [
    `Edit DNS where ${OFFICIAL_APEX_HOST} nameservers are authoritative (currently: ${nsList}).`,
    `Set www CNAME → ${RENDER_SERVICE_HOST}`,
    `Set apex (@) A → ${RENDER_LOAD_BALANCER_IPV4}`,
    "Remove A/AAAA records that do not point at Render.",
    `In Render → Settings → Custom Domains, add ${OFFICIAL_WWW_HOST} and ${OFFICIAL_APEX_HOST} if missing.`,
    "Wait for DNS propagation, then Refresh Safety / GET /api/domain-dns-check.",
    official?.www?.issue ? `www: ${official.www.issue}` : "",
    official?.apex?.issue ? `apex: ${official.apex.issue}` : "",
  ].filter(Boolean);
}

async function buildDomainDnsReport({ siteUrl = "" } = {}) {
  const lookups = {};
  await Promise.all(OFFICIAL_DOMAINS.map(async (host) => {
    lookups[host] = await resolveDnsRecords(host);
  }));

  const official = {
    apex: buildHostReport(lookups[OFFICIAL_APEX_HOST]),
    www: buildHostReport(lookups[OFFICIAL_WWW_HOST]),
  };
  const ready = official.apex.ready && official.www.ready;
  const nameservers = [...new Set([...(official.apex.ns || []), ...(official.www.ns || [])])];

  return {
    checkedAt: new Date().toISOString(),
    ready,
    officialSiteUrl: `https://${OFFICIAL_APEX_HOST}`,
    render: {
      serviceHost: RENDER_SERVICE_HOST,
      apexARecord: RENDER_LOAD_BALANCER_IPV4,
      docs: "https://render.com/docs/configure-other-dns",
    },
    recommendedDns: buildRecommendedDns(),
    nameservers,
    nameserverNote:
      "Authoritative nameservers decide which DNS zone is live. Your registrar login can differ from the DNS host when custom nameservers are set.",
    officialDomain: official,
    siteUrl,
    nextSteps: buildNextSteps({ ready, official, nameservers }),
  };
}

module.exports = {
  RENDER_SERVICE_HOST,
  RENDER_LOAD_BALANCER_IPV4,
  OFFICIAL_APEX_HOST,
  OFFICIAL_WWW_HOST,
  OFFICIAL_DOMAINS,
  WORKING_APEX_HOST,
  WORKING_WWW_HOST,
  WORKING_BRAND_DOMAINS,
  normalizeDnsHost,
  isRenderServiceHost,
  isRenderLoadBalancerIp,
  classifyDomainDns,
  classifyBrandDomainDns: classifyDomainDns,
  resolveDnsRecords,
  buildDomainDnsReport,
};
