/**
 * Owner-only Social Media Performance Tracker — isolated store slice + admin API helpers.
 * Manual entry today; structured for future TikTok/Meta/GA/Stripe attribution hooks.
 */

/** @typedef {"tiktok"|"instagram"|"facebook"|"youtube"} SocialPlatform */
/** @typedef {"7d"|"30d"|"90d"|"all"} SocialDateRange */
/** @typedef {"views"|"followers"|"followConversion"|"websiteClicks"|"freeSignups"|"paidSignups"|"newest"|"oldest"} SocialSortKey */

/** @type {readonly SocialPlatform[]} */
const PLATFORMS = Object.freeze(["tiktok", "instagram", "facebook", "youtube"]);

/** @type {readonly string[]} */
const BACKGROUND_LOCATIONS = Object.freeze([
  "real-classroom",
  "classroom-backdrop",
  "office",
  "home",
  "screen-recording",
  "other",
]);

/** @type {readonly SocialDateRange[]} */
const DATE_RANGES = Object.freeze(["7d", "30d", "90d", "all"]);

/** @type {readonly SocialSortKey[]} */
const SORT_KEYS = Object.freeze([
  "views",
  "followers",
  "followConversion",
  "websiteClicks",
  "freeSignups",
  "paidSignups",
  "newest",
  "oldest",
]);

const PLATFORM_LABELS = Object.freeze({
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
});

const BACKGROUND_LABELS = Object.freeze({
  "real-classroom": "Real classroom",
  "classroom-backdrop": "Classroom backdrop",
  office: "Office",
  home: "Home",
  "screen-recording": "Screen recording",
  other: "Other",
});

/**
 * @returns {{ posts: [], updatedAt: string }}
 */
function defaultSocialMediaPerformanceStore() {
  return {
    posts: [],
    updatedAt: "",
  };
}

/**
 * @param {Record<string, unknown>} store
 * @returns {Record<string, unknown>}
 */
function ensureSocialMediaPerformanceStore(store) {
  if (!store.socialMediaPerformance || typeof store.socialMediaPerformance !== "object") {
    store.socialMediaPerformance = defaultSocialMediaPerformanceStore();
  }
  if (!Array.isArray(store.socialMediaPerformance.posts)) {
    store.socialMediaPerformance.posts = [];
  }
  return store;
}

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
function safeRate(numerator, denominator) {
  const num = Number(numerator);
  const den = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  const value = (num / den) * 100;
  return Number.isFinite(value) ? value : 0;
}

/**
 * @param {number} value
 * @returns {number}
 */
function safeNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, number>}
 */
function computePostMetrics(raw) {
  const views = safeNonNegativeInt(raw.views);
  const newFollowers = safeNonNegativeInt(raw.newFollowers);
  const likes = safeNonNegativeInt(raw.likes);
  const comments = safeNonNegativeInt(raw.comments);
  const shares = safeNonNegativeInt(raw.shares);
  const saves = safeNonNegativeInt(raw.saves);
  const profileVisits = safeNonNegativeInt(raw.profileVisits);
  const websiteClicks = safeNonNegativeInt(raw.websiteClicks);
  const freeSignups = safeNonNegativeInt(raw.freeSignups);
  const paidSignups = safeNonNegativeInt(raw.paidSignups);
  const engagementTotal = likes + comments + shares + saves;

  return {
    followConversionRate: safeRate(newFollowers, views),
    engagementRate: safeRate(engagementTotal, views),
    profileVisitRate: safeRate(profileVisits, views),
    websiteClickRate: safeRate(websiteClicks, profileVisits),
    visitorToFreeSignupRate: safeRate(freeSignups, websiteClicks),
    visitorToPaidSignupRate: safeRate(paidSignups, websiteClicks),
    freeToPaidConversion: safeRate(paidSignups, freeSignups),
  };
}

/**
 * @param {string} value
 * @returns {SocialPlatform}
 */
function normalizePlatform(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "youtube-shorts" || key === "youtube_shorts") return "youtube";
  return /** @type {SocialPlatform} */ (PLATFORMS.includes(/** @type {SocialPlatform} */ (key)) ? key : "tiktok");
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeBackground(value) {
  const key = String(value || "").trim().toLowerCase();
  return BACKGROUND_LOCATIONS.includes(key) ? key : "";
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeDatePosted(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ id?: string, createdAt?: string, updatedAt?: string }} [existing]
 * @returns {Record<string, unknown>}
 */
function normalizePostRecord(raw, existing = {}) {
  const now = new Date().toISOString();
  const id = String(existing.id || raw.id || "").trim()
    || `smp-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  const record = {
    id,
    platform: normalizePlatform(raw.platform),
    datePosted: normalizeDatePosted(raw.datePosted),
    title: String(raw.title || "").trim().slice(0, 500),
    contentType: String(raw.contentType || "").trim().slice(0, 200),
    hook: String(raw.hook || "").trim().slice(0, 500),
    views: safeNonNegativeInt(raw.views),
    newFollowers: safeNonNegativeInt(raw.newFollowers),
    likes: safeNonNegativeInt(raw.likes),
    comments: safeNonNegativeInt(raw.comments),
    shares: safeNonNegativeInt(raw.shares),
    saves: safeNonNegativeInt(raw.saves),
    profileVisits: safeNonNegativeInt(raw.profileVisits),
    websiteClicks: safeNonNegativeInt(raw.websiteClicks),
    freeSignups: safeNonNegativeInt(raw.freeSignups),
    paidSignups: safeNonNegativeInt(raw.paidSignups),
    videoUrl: String(raw.videoUrl || "").trim().slice(0, 2000),
    notes: String(raw.notes || "").trim().slice(0, 5000),
    classroomStyleVideo: Boolean(raw.classroomStyleVideo),
    showsProduct: Boolean(raw.showsProduct),
    freeResourcePromotion: Boolean(raw.freeResourcePromotion),
    ctaUsed: String(raw.ctaUsed || "").trim().slice(0, 300),
    themeTopic: String(raw.themeTopic || "").trim().slice(0, 300),
    backgroundLocation: normalizeBackground(raw.backgroundLocation),
    createdAt: String(existing.createdAt || raw.createdAt || now),
    updatedAt: now,
  };

  return {
    ...record,
    ...computePostMetrics(record),
    platformLabel: PLATFORM_LABELS[/** @type {SocialPlatform} */ (record.platform)],
    backgroundLabel: record.backgroundLocation
      ? (BACKGROUND_LABELS[record.backgroundLocation] || record.backgroundLocation)
      : "",
  };
}

/**
 * @param {Record<string, unknown>[]} posts
 * @param {SocialDateRange} range
 * @param {number} [nowMs]
 * @returns {Record<string, unknown>[]}
 */
function filterPostsByDateRange(posts, range, nowMs = Date.now()) {
  if (range === "all") return posts.slice();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = nowMs - days * 86400000;
  return posts.filter((post) => {
    const posted = Date.parse(String(post.datePosted || ""));
    return Number.isFinite(posted) && posted >= cutoff;
  });
}

/**
 * @param {Record<string, unknown>[]} posts
 * @param {string} platformFilter
 * @returns {Record<string, unknown>[]}
 */
function filterPostsByPlatform(posts, platformFilter) {
  const filter = String(platformFilter || "all").trim().toLowerCase();
  if (!filter || filter === "all") return posts.slice();
  return posts.filter((post) => normalizePlatform(post.platform) === normalizePlatform(filter));
}

/**
 * @param {Record<string, unknown>[]} posts
 * @param {SocialSortKey} sortKey
 * @returns {Record<string, unknown>[]}
 */
function sortPosts(posts, sortKey) {
  const key = SORT_KEYS.includes(sortKey) ? sortKey : "newest";
  const sorted = posts.slice();
  sorted.sort((a, b) => {
    switch (key) {
      case "views":
        return safeNonNegativeInt(b.views) - safeNonNegativeInt(a.views);
      case "followers":
        return safeNonNegativeInt(b.newFollowers) - safeNonNegativeInt(a.newFollowers);
      case "followConversion":
        return computePostMetrics(b).followConversionRate - computePostMetrics(a).followConversionRate;
      case "websiteClicks":
        return safeNonNegativeInt(b.websiteClicks) - safeNonNegativeInt(a.websiteClicks);
      case "freeSignups":
        return safeNonNegativeInt(b.freeSignups) - safeNonNegativeInt(a.freeSignups);
      case "paidSignups":
        return safeNonNegativeInt(b.paidSignups) - safeNonNegativeInt(a.paidSignups);
      case "oldest":
        return Date.parse(String(a.datePosted || "")) - Date.parse(String(b.datePosted || ""));
      case "newest":
      default:
        return Date.parse(String(b.datePosted || "")) - Date.parse(String(a.datePosted || ""));
    }
  });
  return sorted;
}

/**
 * @param {Record<string, unknown>[]} posts
 * @returns {Record<string, unknown>}
 */
function buildSummary(posts) {
  const totals = posts.reduce((acc, post) => {
    acc.views += safeNonNegativeInt(post.views);
    acc.newFollowers += safeNonNegativeInt(post.newFollowers);
    acc.websiteClicks += safeNonNegativeInt(post.websiteClicks);
    acc.freeSignups += safeNonNegativeInt(post.freeSignups);
    acc.paidSignups += safeNonNegativeInt(post.paidSignups);
    acc.followConversionRateSum += computePostMetrics(post).followConversionRate;
    acc.engagementRateSum += computePostMetrics(post).engagementRate;
    return acc;
  }, {
    views: 0,
    newFollowers: 0,
    websiteClicks: 0,
    freeSignups: 0,
    paidSignups: 0,
    followConversionRateSum: 0,
    engagementRateSum: 0,
  });

  const count = posts.length;
  return {
    totalViews: totals.views,
    totalFollowersGained: totals.newFollowers,
    totalWebsiteClicks: totals.websiteClicks,
    totalFreeSignups: totals.freeSignups,
    totalPaidSignups: totals.paidSignups,
    averageFollowConversionRate: count ? totals.followConversionRateSum / count : 0,
    averageEngagementRate: count ? totals.engagementRateSum / count : 0,
    postCount: count,
  };
}

/**
 * @param {Record<string, unknown>[]} posts
 * @returns {Record<string, unknown>}
 */
function buildWhatsWorking(posts) {
  if (!posts.length) {
    return { hasEnoughData: false, items: [], message: "Not enough data yet." };
  }

  /** @type {Record<string, { platform: SocialPlatform, totalFollowers: number, totalViews: number, count: number }>} */
  const byPlatform = {};
  /** @type {Record<string, { label: string, totalFollowers: number, totalViews: number, count: number }>} */
  const byBackground = {};
  /** @type {{ free: { followers: number, views: number, count: number }, nonFree: { followers: number, views: number, count: number } }} */
  const freeResourceCompare = {
    free: { followers: 0, views: 0, count: 0 },
    nonFree: { followers: 0, views: 0, count: 0 },
  };

  let bestFollowersPost = null;
  let bestFollowConversionPost = null;
  let bestWebsiteClicksPost = null;
  let bestFreeSignupsPost = null;
  let bestPaidSignupsPost = null;

  posts.forEach((post) => {
    const metrics = computePostMetrics(post);
    const platform = normalizePlatform(post.platform);
    const followers = safeNonNegativeInt(post.newFollowers);
    const views = safeNonNegativeInt(post.views);
    const websiteClicks = safeNonNegativeInt(post.websiteClicks);
    const freeSignups = safeNonNegativeInt(post.freeSignups);
    const paidSignups = safeNonNegativeInt(post.paidSignups);

    if (!byPlatform[platform]) {
      byPlatform[platform] = { platform, totalFollowers: 0, totalViews: 0, count: 0 };
    }
    byPlatform[platform].totalFollowers += followers;
    byPlatform[platform].totalViews += views;
    byPlatform[platform].count += 1;

    const bg = normalizeBackground(post.backgroundLocation);
    if (bg) {
      if (!byBackground[bg]) {
        byBackground[bg] = { label: BACKGROUND_LABELS[bg] || bg, totalFollowers: 0, totalViews: 0, count: 0 };
      }
      byBackground[bg].totalFollowers += followers;
      byBackground[bg].totalViews += views;
      byBackground[bg].count += 1;
    }

    const freeBucket = post.freeResourcePromotion ? freeResourceCompare.free : freeResourceCompare.nonFree;
    freeBucket.followers += followers;
    freeBucket.views += views;
    freeBucket.count += 1;

    const pickBest = (current, candidate, score) => {
      if (!candidate) return current;
      if (!current || score > current.score) return { post: candidate, score };
      return current;
    };

    bestFollowersPost = pickBest(bestFollowersPost, post, followers);
    bestFollowConversionPost = pickBest(bestFollowConversionPost, post, metrics.followConversionRate);
    bestWebsiteClicksPost = pickBest(bestWebsiteClicksPost, post, websiteClicks);
    bestFreeSignupsPost = pickBest(bestFreeSignupsPost, post, freeSignups);
    bestPaidSignupsPost = pickBest(bestPaidSignupsPost, post, paidSignups);
  });

  /** @type {Array<Record<string, unknown>>} */
  const items = [];

  const platformRates = Object.values(byPlatform)
    .filter((row) => row.count >= 1 && row.totalViews > 0)
    .map((row) => ({
      platform: row.platform,
      label: PLATFORM_LABELS[row.platform],
      rate: safeRate(row.totalFollowers, row.totalViews),
      count: row.count,
    }))
    .sort((a, b) => b.rate - a.rate);

  if (platformRates.length >= 2) {
    items.push({
      id: "best-platform-follow-conversion",
      label: "Best platform by follower conversion",
      value: `${platformRates[0].label} (${platformRates[0].rate.toFixed(2)}%)`,
    });
  }

  const postLabel = (post) => String(post?.title || post?.hook || post?.id || "Untitled");

  if (bestFollowersPost?.post && bestFollowersPost.score > 0) {
    items.push({
      id: "best-video-followers",
      label: "Best-performing video by followers gained",
      value: `${postLabel(bestFollowersPost.post)} (${bestFollowersPost.score})`,
    });
  }

  if (bestFollowConversionPost?.post && bestFollowConversionPost.score > 0) {
    items.push({
      id: "best-video-follow-conversion",
      label: "Best video by follower conversion",
      value: `${postLabel(bestFollowConversionPost.post)} (${bestFollowConversionPost.score.toFixed(2)}%)`,
    });
  }

  if (bestWebsiteClicksPost?.post && bestWebsiteClicksPost.score > 0) {
    items.push({
      id: "best-video-website-clicks",
      label: "Best video by website clicks",
      value: `${postLabel(bestWebsiteClicksPost.post)} (${bestWebsiteClicksPost.score})`,
    });
  }

  if (bestFreeSignupsPost?.post && bestFreeSignupsPost.score > 0) {
    items.push({
      id: "best-video-free-signups",
      label: "Best video by free signups",
      value: `${postLabel(bestFreeSignupsPost.post)} (${bestFreeSignupsPost.score})`,
    });
  }

  if (bestPaidSignupsPost?.post && bestPaidSignupsPost.score > 0) {
    items.push({
      id: "best-video-paid-signups",
      label: "Best video by paid signups",
      value: `${postLabel(bestPaidSignupsPost.post)} (${bestPaidSignupsPost.score})`,
    });
  }

  const realClassroom = byBackground["real-classroom"];
  const otherBackgrounds = Object.entries(byBackground)
    .filter(([key]) => key !== "real-classroom")
    .map(([, row]) => row);
  if (realClassroom && realClassroom.count >= 1 && otherBackgrounds.some((row) => row.count >= 1)) {
    const realRate = safeRate(realClassroom.totalFollowers, realClassroom.totalViews);
    const otherFollowers = otherBackgrounds.reduce((sum, row) => sum + row.totalFollowers, 0);
    const otherViews = otherBackgrounds.reduce((sum, row) => sum + row.totalViews, 0);
    const otherRate = safeRate(otherFollowers, otherViews);
    const winner = realRate > otherRate ? "Real classroom videos outperform other backgrounds"
      : realRate < otherRate ? "Other backgrounds outperform real classroom videos"
        : "Real classroom and other backgrounds perform similarly";
    items.push({
      id: "background-real-classroom",
      label: "Real classroom vs other backgrounds",
      value: `${winner} (${realRate.toFixed(2)}% vs ${otherRate.toFixed(2)}% follower conversion)`,
    });
  }

  if (freeResourceCompare.free.count >= 1 && freeResourceCompare.nonFree.count >= 1) {
    const freeRate = safeRate(freeResourceCompare.free.followers, freeResourceCompare.free.views);
    const nonFreeRate = safeRate(freeResourceCompare.nonFree.followers, freeResourceCompare.nonFree.views);
    const winner = freeRate > nonFreeRate ? "Free-resource videos outperform non-free-resource videos"
      : freeRate < nonFreeRate ? "Non-free-resource videos outperform free-resource videos"
        : "Free-resource and non-free-resource videos perform similarly";
    items.push({
      id: "free-resource-comparison",
      label: "Free-resource promotion comparison",
      value: `${winner} (${freeRate.toFixed(2)}% vs ${nonFreeRate.toFixed(2)}% follower conversion)`,
    });
  }

  return {
    hasEnoughData: items.length > 0,
    items,
    message: items.length ? "" : "Not enough data yet.",
  };
}

/**
 * @param {Record<string, unknown>} store
 * @param {{ range?: SocialDateRange, platform?: string, sort?: SocialSortKey }} [options]
 * @returns {Record<string, unknown>}
 */
function buildSocialMediaPerformancePayload(store, options = {}) {
  ensureSocialMediaPerformanceStore(store);
  const range = DATE_RANGES.includes(/** @type {SocialDateRange} */ (options.range))
    ? /** @type {SocialDateRange} */ (options.range)
    : "30d";
  const sort = SORT_KEYS.includes(/** @type {SocialSortKey} */ (options.sort))
    ? /** @type {SocialSortKey} */ (options.sort)
    : "newest";
  const platform = String(options.platform || "all");

  const allPosts = (store.socialMediaPerformance.posts || [])
    .map((post) => normalizePostRecord(post, post));

  const filtered = filterPostsByPlatform(filterPostsByDateRange(allPosts, range), platform);
  const sorted = sortPosts(filtered, sort);

  return {
    range,
    platform,
    sort,
    summary: buildSummary(filtered),
    whatsWorking: buildWhatsWorking(filtered),
    posts: sorted,
    meta: {
      platforms: PLATFORMS.map((id) => ({ id, label: PLATFORM_LABELS[id] })),
      backgrounds: BACKGROUND_LOCATIONS.map((id) => ({ id, label: BACKGROUND_LABELS[id] })),
      dateRanges: DATE_RANGES.slice(),
      sortKeys: SORT_KEYS.slice(),
    },
  };
}

/**
 * @param {object} deps
 * @returns {{ handleList: Function, handleCreate: Function, handleUpdate: Function, handleDelete: Function }}
 */
function createSocialMediaPerformanceApi(deps) {
  const {
    readStore,
    readJson,
    jsonResponse,
    respondAfterPersist,
    extractAdminToken,
    extractAdminTokenFromBody,
    validAdminToken,
    crypto,
  } = deps;

  /**
   * @param {import("http").IncomingMessage} request
   * @param {import("http").ServerResponse} response
   * @param {URL} url
   */
  async function handleList(request, response, url) {
    const adminToken = extractAdminToken(request, url) || "";
    if (!validAdminToken(adminToken)) {
      jsonResponse(response, 401, { error: "Admin access is required." });
      return;
    }
    const range = String(url.searchParams.get("range") || "30d").trim();
    const platform = String(url.searchParams.get("platform") || "all").trim();
    const sort = String(url.searchParams.get("sort") || "newest").trim();
    const store = readStore();
    const payload = buildSocialMediaPerformancePayload(store, { range, platform, sort });
    jsonResponse(response, 200, { ok: true, socialMediaPerformance: payload });
  }

  /**
   * @param {import("http").IncomingMessage} request
   * @param {import("http").ServerResponse} response
   */
  async function handleCreate(request, response) {
    const body = await readJson(request);
    if (!validAdminToken(extractAdminTokenFromBody(request, body))) {
      jsonResponse(response, 401, { error: "Admin access is required to create social media posts." });
      return;
    }
    const title = String(body.title || "").trim();
    if (!title) {
      jsonResponse(response, 400, { error: "A video/post title or description is required." });
      return;
    }
    const store = readStore();
    ensureSocialMediaPerformanceStore(store);
    const now = new Date().toISOString();
    const id = `smp-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const record = normalizePostRecord({ ...body, id }, { id, createdAt: now, updatedAt: now });
    store.socialMediaPerformance.posts.unshift(record);
    store.socialMediaPerformance.posts = store.socialMediaPerformance.posts.slice(0, 5000);
    store.socialMediaPerformance.updatedAt = now;
    await respondAfterPersist(
      store,
      response,
      200,
      { post: record },
      "Could not save social media post.",
    );
  }

  /**
   * @param {import("http").IncomingMessage} request
   * @param {import("http").ServerResponse} response
   */
  async function handleUpdate(request, response) {
    const body = await readJson(request);
    if (!validAdminToken(extractAdminTokenFromBody(request, body))) {
      jsonResponse(response, 401, { error: "Admin access is required to update social media posts." });
      return;
    }
    const id = String(body.id || "").trim();
    if (!id) {
      jsonResponse(response, 400, { error: "Post id is required." });
      return;
    }
    const store = readStore();
    ensureSocialMediaPerformanceStore(store);
    const posts = store.socialMediaPerformance.posts;
    const index = posts.findIndex((row) => String(row.id) === id);
    if (index < 0) {
      jsonResponse(response, 404, { error: "Social media post was not found." });
      return;
    }
    const existing = posts[index];
    const record = normalizePostRecord({ ...existing, ...body, id }, existing);
    posts[index] = record;
    store.socialMediaPerformance.updatedAt = new Date().toISOString();
    await respondAfterPersist(
      store,
      response,
      200,
      { post: record },
      "Could not update social media post.",
    );
  }

  /**
   * @param {import("http").IncomingMessage} request
   * @param {import("http").ServerResponse} response
   */
  async function handleDelete(request, response) {
    const body = await readJson(request);
    if (!validAdminToken(extractAdminTokenFromBody(request, body))) {
      jsonResponse(response, 401, { error: "Admin access is required to delete social media posts." });
      return;
    }
    const id = String(body.id || "").trim();
    if (!id) {
      jsonResponse(response, 400, { error: "Post id is required." });
      return;
    }
    const store = readStore();
    ensureSocialMediaPerformanceStore(store);
    const posts = store.socialMediaPerformance.posts;
    const index = posts.findIndex((row) => String(row.id) === id);
    if (index < 0) {
      jsonResponse(response, 404, { error: "Social media post was not found." });
      return;
    }
    const removed = posts[index];
    posts.splice(index, 1);
    store.socialMediaPerformance.updatedAt = new Date().toISOString();
    await respondAfterPersist(
      store,
      response,
      200,
      { ok: true, deletedId: id, post: removed },
      "Could not delete social media post.",
    );
  }

  return {
    handleList,
    handleCreate,
    handleUpdate,
    handleDelete,
  };
}

module.exports = {
  PLATFORMS,
  BACKGROUND_LOCATIONS,
  DATE_RANGES,
  SORT_KEYS,
  PLATFORM_LABELS,
  BACKGROUND_LABELS,
  defaultSocialMediaPerformanceStore,
  ensureSocialMediaPerformanceStore,
  safeRate,
  safeNonNegativeInt,
  computePostMetrics,
  normalizePostRecord,
  filterPostsByDateRange,
  filterPostsByPlatform,
  sortPosts,
  buildSummary,
  buildWhatsWorking,
  buildSocialMediaPerformancePayload,
  createSocialMediaPerformanceApi,
};
