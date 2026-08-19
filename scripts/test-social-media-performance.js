#!/usr/bin/env node
/**
 * Social Media Performance Tracker — unit + admin API tests.
 * Run: npm run test:social-media-performance
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const smp = require("../server/social-media-performance.js");

const ROOT = path.join(__dirname, "..");

function request(port, method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
        resolve({ status: res.statusCode, text: raw, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, child, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      if (child.exitCode != null) {
        reject(new Error(`server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch { /* retry */ }
      if (n >= attempts) {
        reject(new Error("server health timeout"));
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

function unitTests() {
  assert.equal(smp.safeRate(10, 100), 10);
  assert.equal(smp.safeRate(5, 0), 0);
  assert.equal(smp.safeRate(5, -1), 0);
  assert.equal(smp.safeRate(NaN, 10), 0);
  assert.equal(smp.safeRate(1, Infinity), 0);

  const zeroViews = smp.computePostMetrics({
    views: 0,
    newFollowers: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    profileVisits: 0,
    websiteClicks: 0,
    freeSignups: 0,
    paidSignups: 0,
  });
  assert.equal(zeroViews.followConversionRate, 0);
  assert.equal(zeroViews.engagementRate, 0);
  assert.equal(zeroViews.profileVisitRate, 0);
  assert.equal(zeroViews.websiteClickRate, 0);
  assert.equal(zeroViews.visitorToFreeSignupRate, 0);
  assert.equal(zeroViews.visitorToPaidSignupRate, 0);
  assert.equal(zeroViews.freeToPaidConversion, 0);

  const metrics = smp.computePostMetrics({
    views: 1000,
    newFollowers: 20,
    likes: 50,
    comments: 10,
    shares: 5,
    saves: 5,
    profileVisits: 100,
    websiteClicks: 40,
    freeSignups: 8,
    paidSignups: 2,
  });
  assert.equal(metrics.followConversionRate, 2);
  assert.ok(Math.abs(metrics.engagementRate - 7) < 0.001);
  assert.equal(metrics.profileVisitRate, 10);
  assert.equal(metrics.websiteClickRate, 40);
  assert.equal(metrics.visitorToFreeSignupRate, 20);
  assert.equal(metrics.visitorToPaidSignupRate, 5);
  assert.equal(metrics.freeToPaidConversion, 25);

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString().slice(0, 10);
  const posts = [
    smp.normalizePostRecord({
      id: "p1",
      platform: "tiktok",
      datePosted: iso(2 * 86400000),
      title: "TikTok classroom tip",
      views: 1000,
      newFollowers: 30,
      websiteClicks: 20,
      freeSignups: 4,
      paidSignups: 1,
      backgroundLocation: "real-classroom",
      freeResourcePromotion: true,
    }, { id: "p1", createdAt: new Date(now - 2 * 86400000).toISOString() }),
    smp.normalizePostRecord({
      id: "p2",
      platform: "instagram",
      datePosted: iso(10 * 86400000),
      title: "Instagram office reel",
      views: 500,
      newFollowers: 5,
      websiteClicks: 10,
      freeSignups: 1,
      paidSignups: 0,
      backgroundLocation: "office",
      freeResourcePromotion: false,
    }, { id: "p2", createdAt: new Date(now - 10 * 86400000).toISOString() }),
    smp.normalizePostRecord({
      id: "p3",
      platform: "facebook",
      datePosted: iso(40 * 86400000),
      title: "Older Facebook post",
      views: 200,
      newFollowers: 2,
      websiteClicks: 1,
      freeSignups: 0,
      paidSignups: 0,
    }, { id: "p3", createdAt: new Date(now - 40 * 86400000).toISOString() }),
  ];

  const filtered7d = smp.filterPostsByDateRange(posts, "7d", now);
  assert.equal(filtered7d.length, 1);
  assert.equal(filtered7d[0].id, "p1");

  const filtered30d = smp.filterPostsByDateRange(posts, "30d", now);
  assert.equal(filtered30d.length, 2);

  const tiktokOnly = smp.filterPostsByPlatform(posts, "tiktok");
  assert.equal(tiktokOnly.length, 1);

  const sortedViews = smp.sortPosts(posts, "views");
  assert.equal(sortedViews[0].id, "p1");

  const sortedFollowConversion = smp.sortPosts(posts, "followConversion");
  assert.equal(sortedFollowConversion[0].id, "p1");

  const summary = smp.buildSummary(filtered30d);
  assert.equal(summary.totalViews, 1500);
  assert.equal(summary.totalFollowersGained, 35);
  assert.equal(summary.totalWebsiteClicks, 30);
  assert.equal(summary.totalFreeSignups, 5);
  assert.equal(summary.totalPaidSignups, 1);
  assert.ok(summary.averageFollowConversionRate > 0);
  assert.ok(summary.averageEngagementRate >= 0);

  const insights = smp.buildWhatsWorking(filtered30d);
  assert.equal(insights.hasEnoughData, true);
  assert.ok(insights.items.some((item) => item.id === "best-video-followers"));
  assert.ok(insights.items.some((item) => item.id === "best-platform-follow-conversion"));
  assert.ok(insights.items.some((item) => item.id === "background-real-classroom"));
  assert.ok(insights.items.some((item) => item.id === "free-resource-comparison"));

  const emptyInsights = smp.buildWhatsWorking([]);
  assert.equal(emptyInsights.hasEnoughData, false);
  assert.match(emptyInsights.message, /Not enough data yet/i);

  const store = {
    socialMediaPerformance: {
      posts: posts.map((post) => ({ ...post })),
      updatedAt: "",
    },
  };
  const payload = smp.buildSocialMediaPerformancePayload(store, {
    range: "30d",
    platform: "all",
    sort: "views",
  });
  assert.equal(payload.posts.length, 2);
  assert.equal(payload.summary.totalViews, 1500);
  assert.ok(payload.whatsWorking.hasEnoughData);

  console.log("PASS social media performance unit tests");
}

async function apiTests() {
  const port = 43000 + Math.floor(Math.random() * 1000);
  const storePath = path.join(os.tmpdir(), `llh-smp-test-${crypto.randomBytes(6).toString("hex")}.json`);
  fs.writeFileSync(storePath, JSON.stringify({
    users: {},
    socialMediaPerformance: smp.defaultSocialMediaPerformanceStore(),
  }, null, 2));

  const child = spawn(process.execPath, [path.join(ROOT, "server/index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      LLH_STORE_PATH: storePath,
      DATABASE_PROVIDER: "local-json",
      NODE_ENV: "test",
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "test-admin-pass",
      ADMIN_ACCESS_CODE: "12345",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    await waitForHealth(port, child);

    const unauthorized = await request(port, "GET", "/api/admin/social-media-performance");
    assert.equal(unauthorized.status, 401, "unauthorized list should 401");

    const login = await request(port, "POST", "/api/admin/login", {
      body: {
        email: "owner@example.com",
        password: "test-admin-pass",
        code: "12345",
      },
    });
    assert.equal(login.status, 200, `admin login failed: ${login.text}`);
    const token = login.json?.token || login.json?.adminToken;
    assert.ok(token, "admin token missing");

    const authHeaders = { Authorization: `Bearer ${token}` };

    const create = await request(port, "POST", "/api/admin/social-media-performance", {
      headers: authHeaders,
      body: {
        platform: "youtube",
        datePosted: "2026-08-18",
        title: "YouTube Shorts classroom demo",
        contentType: "short",
        hook: "Try this circle time idea",
        views: 2000,
        newFollowers: 40,
        likes: 120,
        comments: 15,
        shares: 8,
        saves: 12,
        profileVisits: 180,
        websiteClicks: 60,
        freeSignups: 6,
        paidSignups: 1,
        classroomStyleVideo: true,
        showsProduct: true,
        freeResourcePromotion: false,
        backgroundLocation: "real-classroom",
      },
    });
    assert.equal(create.status, 200, `create failed: ${create.text}`);
    const created = create.json?.post;
    assert.ok(created?.id, "created post id missing");
    assert.equal(created.followConversionRate, 2);
    assert.equal(created.engagementRate, 7.75);
    assert.equal(created.websiteClickRate, (60 / 180) * 100);

    const create2 = await request(port, "POST", "/api/admin/social-media-performance", {
      headers: authHeaders,
      body: {
        platform: "instagram",
        datePosted: "2026-08-17",
        title: "Instagram free printable promo",
        views: 800,
        newFollowers: 8,
        websiteClicks: 20,
        freeSignups: 2,
        paidSignups: 0,
        freeResourcePromotion: true,
        backgroundLocation: "home",
      },
    });
    assert.equal(create2.status, 200, `create2 failed: ${create2.text}`);

    const list = await request(port, "GET", "/api/admin/social-media-performance?range=30d&platform=all&sort=views", {
      headers: authHeaders,
    });
    assert.equal(list.status, 200, `list failed: ${list.text}`);
    const payload = list.json?.socialMediaPerformance;
    assert.ok(payload, "payload missing");
    assert.equal(payload.posts.length, 2);
    assert.equal(payload.summary.totalViews, 2800);
    assert.equal(payload.summary.totalFollowersGained, 48);
    assert.equal(payload.summary.totalWebsiteClicks, 80);
    assert.equal(payload.summary.totalFreeSignups, 8);
    assert.equal(payload.summary.totalPaidSignups, 1);
    assert.ok(payload.whatsWorking.hasEnoughData);

    const platformFilter = await request(port, "GET", "/api/admin/social-media-performance?range=all&platform=instagram&sort=newest", {
      headers: authHeaders,
    });
    assert.equal(platformFilter.status, 200);
    assert.equal(platformFilter.json.socialMediaPerformance.posts.length, 1);
    assert.equal(platformFilter.json.socialMediaPerformance.posts[0].platform, "instagram");

    const update = await request(port, "POST", "/api/admin/social-media-performance-update", {
      headers: authHeaders,
      body: {
        id: created.id,
        views: 2500,
        newFollowers: 55,
        websiteClicks: 75,
      },
    });
    assert.equal(update.status, 200, `update failed: ${update.text}`);
    assert.equal(update.json.post.views, 2500);
    assert.equal(update.json.post.newFollowers, 55);
    assert.ok(Math.abs(update.json.post.followConversionRate - 2.2) < 0.001);

    const deleteRes = await request(port, "POST", "/api/admin/social-media-performance-delete", {
      headers: authHeaders,
      body: { id: create2.json.post.id },
    });
    assert.equal(deleteRes.status, 200, `delete failed: ${deleteRes.text}`);
    assert.equal(deleteRes.json.deletedId, create2.json.post.id);

    const afterDelete = await request(port, "GET", "/api/admin/social-media-performance?range=all", {
      headers: authHeaders,
    });
    assert.equal(afterDelete.json.socialMediaPerformance.posts.length, 1);
    assert.equal(afterDelete.json.socialMediaPerformance.posts[0].id, created.id);

    console.log("PASS social media performance admin API tests");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    if (child.exitCode != null && child.exitCode !== 0 && child.signalCode !== "SIGTERM") {
      throw new Error(`server stderr:\n${stderr}`);
    }
  }
}

function wiringTests() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(appJs, /social-media-performance/);
  assert.match(indexHtml, /adminSocialMediaPerformanceApp/);
  assert.match(indexHtml, /admin-social-media-performance\.js/);
  assert.match(serverJs, /social-media-performance\.js/);
  assert.match(serverJs, /socialMediaPerformance: socialMediaPerformance\.defaultSocialMediaPerformanceStore\(\)/);
  console.log("PASS social media performance wiring");
}

async function main() {
  wiringTests();
  unitTests();
  await apiTests();
  console.log("All social media performance tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
