/**
 * Provider-agnostic custom-domain DNS checks for Little Learner Hub.
 * Only cares whether records point at Render — never assumes a DNS host/provider.
 */

const dns = require("node:dns").promises;

const RENDER_SERVICE_HOST = "little-learner-hub.onrender.com";
const RENDER_LOAD_BALANCER_IPV4 = "216.24.57.1";
const RENDER_LOAD_BALANCER_PREFIX = "216.24.57.";
const BRAND_APEX_HOST = "littlelearnerhub.com";
const BRAND_WWW_HOST = "www.littlelearnerhub.com";
const WORKING_APEX_HOST = "littlelearnershubbyleah.com";
const WORKING_WWW_HOST = "www.littlelearnershubbyleah.com";
const CUSTOM_BRAND_DOMAINS = [BRAND_APEX_HOST, BRAND_WWW_HOST];
const WORKING_BRAND_DOMAINS = [WORKING_APEX_HOST, WORKING_WWW_HOST];

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

/**
 * Classify one hostname's DNS records against Render targets.
 * @param {{ a?: string[], aaaa?: string[], cname?: string[], ns?: string[], error?: string, host?: string }} records
 */
function classifyBrandDomainDns(records = {}) {
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
    ...classifyBrandDomainDns(lookup),
  };
}

function buildRecommendedDns() {
  return [
    { type: "CNAME", host: "www", value: RENDER_SERVICE_HOST, note: "Preferred for www" },
    { type: "A", host: "@", value: RENDER_LOAD_BALANCER_IPV4, note: "Apex / root domain" },
  ];
}

function buildNextSteps({ ready, brand, nameservers }) {
  if (ready) {
    return [
      "DNS points at Render. Confirm both hosts show verified certificates in Render → Custom Domains.",
      "Optionally set SITE_URL=https://www.littlelearnerhub.com after HTTPS is live everywhere.",
    ];
  }
  const nsList = (nameservers || []).join(", ") || "unknown";
  return [
    `Edit DNS where the domain's nameservers are authoritative (currently: ${nsList}).`,
    "If you changed records at a registrar/host whose nameservers are not listed above, those edits are not live yet — either update the authoritative DNS zone, or point nameservers to the provider where you made the changes.",
    `Set www CNAME → ${RENDER_SERVICE_HOST}`,
    `Set apex (@) A → ${RENDER_LOAD_BALANCER_IPV4}`,
    "Remove A/AAAA records that do not point at Render.",
    "In Render → Settings → Custom Domains, add www.littlelearnerhub.com and littlelearnerhub.com if missing.",
    "Wait for DNS propagation, then Refresh Safety / GET /api/domain-dns-check.",
    `Keep sharing https://${WORKING_APEX_HOST} until the brand domain is ready.`,
    brand?.www?.issue ? `www: ${brand.www.issue}` : "",
    brand?.apex?.issue ? `apex: ${brand.apex.issue}` : "",
  ].filter(Boolean);
}

async function buildDomainDnsReport({ siteUrl = "" } = {}) {
  const targets = [...new Set([...CUSTOM_BRAND_DOMAINS, ...WORKING_BRAND_DOMAINS])];
  const lookups = {};
  await Promise.all(targets.map(async (host) => {
    lookups[host] = await resolveDnsRecords(host);
  }));

  const brand = {
    apex: buildHostReport(lookups[BRAND_APEX_HOST]),
    www: buildHostReport(lookups[BRAND_WWW_HOST]),
  };
  const working = {
    apex: buildHostReport(lookups[WORKING_APEX_HOST]),
    www: buildHostReport(lookups[WORKING_WWW_HOST]),
  };
  const ready = brand.apex.ready && brand.www.ready;
  const nameservers = [...new Set([...(brand.apex.ns || []), ...(brand.www.ns || [])])];

  return {
    checkedAt: new Date().toISOString(),
    ready,
    render: {
      serviceHost: RENDER_SERVICE_HOST,
      apexARecord: RENDER_LOAD_BALANCER_IPV4,
      docs: "https://render.com/docs/configure-other-dns",
    },
    recommendedDns: buildRecommendedDns(),
    nameservers,
    nameserverNote:
      "Authoritative nameservers decide which DNS zone is live. Your registrar login can differ from the DNS host when custom nameservers are set.",
    brandDomain: brand,
    workingDomain: working,
    siteUrl,
    nextSteps: buildNextSteps({ ready, brand, nameservers }),
  };
}

module.exports = {
  RENDER_SERVICE_HOST,
  RENDER_LOAD_BALANCER_IPV4,
  CUSTOM_BRAND_DOMAINS,
  WORKING_BRAND_DOMAINS,
  BRAND_APEX_HOST,
  BRAND_WWW_HOST,
  normalizeDnsHost,
  isRenderServiceHost,
  isRenderLoadBalancerIp,
  classifyBrandDomainDns,
  resolveDnsRecords,
  buildDomainDnsReport,
};
