#!/usr/bin/env node
/**
 * Import Preschool Family Connections Pro weeks 2–4 + save the Curriculum Collection.
 *
 * 1) Builds V3 import files
 * 2) Bulk-imports weeks via the validate-first pipeline
 * 3) Saves the Preschool age-track series under collectionKey=family-connections
 *
 * Local (default): ephemeral server
 * Production: SITE_URL + ADMIN_EMAIL + ADMIN_PASSWORD + ADMIN_ACCESS_CODE
 *
 * Run:
 *   node scripts/import-preschool-family-connections.js
 *   node scripts/import-preschool-family-connections.js --validate-only
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const VALIDATE_ONLY = process.argv.includes("--validate-only");
const REPORT_PATH = path.join(__dirname, "data/preschool-family-connections-import-report.json");
const COLLECTION_KEY = "family-connections";
const SERIES_ID = "cur-series-preschool-family-connections";
const ID_PREFIX = "cur-lp-preschool-family-connections";

const WEEK_META = [
  { weekNumber: 2, title: "My Home & My Family", file: "02-preschool-my-home-and-my-family-pro.txt" },
  { weekNumber: 3, title: "Caring Hearts", file: "03-preschool-caring-hearts-pro.txt" },
  { weekNumber: 4, title: "We Belong Together", file: "04-preschool-we-belong-together-pro.txt" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert(result.status === 0, `Command failed: node ${args.join(" ")}`);
  return result;
}

const remoteUrl = String(process.env.SITE_URL || "").trim();
const useRemote = Boolean(remoteUrl && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_ACCESS_CODE);
const LOCAL_PORT = 4810 + Math.floor(Math.random() * 80);
const BASE = useRemote ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${LOCAL_PORT}`;
const ADMIN = useRemote
  ? {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      code: process.env.ADMIN_ACCESS_CODE,
    }
  : {
      email: "preschool-family-connections@import.local",
      password: "preschool-family-connections-pass",
      code: "preschool-family-connections-code",
    };
const STORE_PATH = path.join(os.tmpdir(), `llh-preschool-family-connections-${crypto.randomBytes(4).toString("hex")}.json`);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const target = new URL(urlPath, BASE);
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
        timeout: 120000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function startLocalServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      SITE_URL: BASE,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Preschool Family Connections Import",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } resolve(); }, 4000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stablePlanId(title, age = "Preschool") {
  return `${ID_PREFIX}-${slugify(age)}-${slugify(title)}`.replace(/-+/g, "-");
}

function buildSeries(planIdsByWeek) {
  return {
    id: SERIES_ID,
    collectionKey: COLLECTION_KEY,
    collectionTitle: "Family Connections",
    title: "Family Connections — Preschool",
    description:
      "A four-week Preschool Family Connections unit building from loving relationships to home routines, kindness, and classroom belonging for children ages 3–5. Weeks 2–4 are available; Week 1 is coming soon.",
    theme: "Family Connections",
    age: "Preschool",
    season: "Back to School",
    weekCount: 4,
    plan: "Pro",
    status: "published",
    featured: true,
    displayOrder: 12,
    coverImageUrl: "/images/lesson-covers/all-about-me.jpg",
    coverImageAlt: "Illustrated cover for the Family Connections curriculum collection",
    coverImageSource: "mapped",
    coverImagePosition: "center",
    learningDomains: ["Social Emotional", "Language & Literacy", "Math", "Science", "Physical Development", "Creative Arts"],
    overallGoals:
      "Strengthen family connections, early literacy, cooperative play, empathy, and a sense of belonging across four connected preschool weeks.",
    familyConnection:
      "Invite families to share traditions, home routines, kindness moments, and friendship stories that connect home and classroom.",
    weeks: [
      {
        weekNumber: 1,
        lessonPlanId: "",
        displayOrder: 1,
        label: "Week 1: The People Who Love Me (coming soon)",
      },
      ...WEEK_META.map((week) => ({
        weekNumber: week.weekNumber,
        lessonPlanId: planIdsByWeek[week.weekNumber],
        displayOrder: week.weekNumber,
        label: `Week ${week.weekNumber}: ${week.title}`,
      })),
    ],
  };
}

async function main() {
  console.log("Building Preschool Family Connections import files…");
  runNode(["scripts/build-preschool-family-connections-imports.js"]);

  const pipelineArgs = [
    "scripts/curriculum-bulk-import-pipeline.js",
    "--dir", "scripts/curriculum-preschool-family-connections-imports",
    "--id-prefix", ID_PREFIX,
    "--report", REPORT_PATH,
  ];
  if (VALIDATE_ONLY) pipelineArgs.push("--validate-only");
  else pipelineArgs.push("--import");

  const pipelineEnv = useRemote
    ? {
        SITE_URL: remoteUrl,
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_ACCESS_CODE: ADMIN.code,
      }
    : {};

  let child = null;
  try {
    if (!useRemote && !VALIDATE_ONLY) {
      child = startLocalServer();
      await waitForBoot(child);
      pipelineEnv.SITE_URL = BASE;
      pipelineEnv.ADMIN_EMAIL = ADMIN.email;
      pipelineEnv.ADMIN_PASSWORD = ADMIN.password;
      pipelineEnv.ADMIN_ACCESS_CODE = ADMIN.code;
      console.log(`Shared local server ${BASE}`);
    }

    console.log(VALIDATE_ONLY ? "Validating weeks…" : "Importing weeks…");
    runNode(pipelineArgs, pipelineEnv);

    if (VALIDATE_ONLY) {
      console.log("Preschool Family Connections validation ready. No series written.");
      return;
    }

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200 && login.json?.token, `Admin login failed: ${login.status}`);
    const token = login.json.token;
    const site = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(site.status === 200, "site-content read failed");
    const plans = site.json.siteContent?.curriculum?.lessonPlans || [];
    const planIdsByWeek = {};
    for (const week of WEEK_META) {
      const expectedId = stablePlanId(week.title);
      const found = plans.find((plan) => plan.id === expectedId)
        || plans.find((plan) => String(plan.title || "").trim().toLowerCase() === week.title.toLowerCase()
          && /preschool/i.test(plan.age || ""));
      assert(found, `Missing imported week plan: ${week.title}`);
      planIdsByWeek[week.weekNumber] = found.id;
    }

    const series = buildSeries(planIdsByWeek);
    let stamp = site.json.siteContent?.updatedAt || "";
    let save = await requestJson("POST", "/api/admin/curriculum/series", {
      adminToken: token,
      expectedUpdatedAt: stamp,
      series,
    });
    if (save.status === 409 && save.json?.siteContentUpdatedAt) {
      stamp = save.json.siteContentUpdatedAt;
      save = await requestJson("POST", "/api/admin/curriculum/series", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        series,
      });
    }
    // Older production builds reject empty Week 1 while status=published. Stage as
    // needs_review until progressive-publish validation is deployed, then re-run.
    const missingWeekPublishBlock =
      save.status === 400
      && Array.isArray(save.json?.validationErrors)
      && save.json.validationErrors.some((err) => /Week \d+ is missing/i.test(String(err || "")));
    if (missingWeekPublishBlock) {
      console.warn("Published series blocked by missing Week 1 on this server; staging as needs_review.");
      series.status = "needs_review";
      stamp = save.json?.siteContentUpdatedAt || stamp;
      save = await requestJson("POST", "/api/admin/curriculum/series", {
        adminToken: token,
        expectedUpdatedAt: stamp,
        series,
      });
      if (save.status === 409 && save.json?.siteContentUpdatedAt) {
        save = await requestJson("POST", "/api/admin/curriculum/series", {
          adminToken: token,
          expectedUpdatedAt: save.json.siteContentUpdatedAt,
          series,
        });
      }
    }
    assert(save.status === 200, `Series save failed: ${save.status} ${save.text?.slice(0, 300)}`);

    const adminContent = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const savedSeries = (adminContent.json?.siteContent?.curriculum?.series || []).find((entry) => entry.id === SERIES_ID);
    assert(savedSeries, "Preschool Family Connections series missing from admin curriculum");
    assert(savedSeries.collectionKey === COLLECTION_KEY, "collectionKey missing on saved series");
    const linkedWeeks = (savedSeries.weeks || []).filter((week) => week.lessonPlanId);
    assert(linkedWeeks.length >= 3, "expected at least 3 linked weeks");

    const published = ["published", "featured"].includes(String(savedSeries.status || "").toLowerCase());
    console.log(
      published
        ? "Preschool Family Connections collection published (Week 1 slot reserved until content arrives):"
        : "Preschool Family Connections collection staged as needs_review (merge progressive-publish + re-run to publish):",
    );
    console.log(`  collectionKey=${COLLECTION_KEY}`);
    console.log(`  series=${SERIES_ID}`);
    console.log(`  status=${savedSeries.status}`);
    console.log(`  weeks=${WEEK_META.map((w) => `${w.weekNumber}:${planIdsByWeek[w.weekNumber]}`).join(", ")}`);
    console.log(`  cover=${series.coverImageUrl}`);
  } finally {
    await stopServer(child);
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
