const { parseCurriculumLessonPlanImport } = require("../../scripts/curriculum-lesson-import-parser.js");

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || "e2e-admin@test.local",
  password: process.env.E2E_ADMIN_PASSWORD || "e2e-admin-pass-1b07",
  code: process.env.E2E_ADMIN_ACCESS_CODE || "e2e-admin-code-1b07",
};

function getBaseURL(baseURL) {
  return baseURL || process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || 4180}`;
}

/**
 * @param {() => Promise<unknown>} fn
 * @param {number} [attempts]
 */
async function withRetry(fn, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * @param {string} baseURL
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 */
async function apiRequest(baseURL, method, path, body) {
  const root = getBaseURL(baseURL);
  return withRetry(async () => {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  });
}

/**
 * @param {string} [baseURL]
 */
async function adminLogin(baseURL) {
  const res = await apiRequest(baseURL, "POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`Admin login failed (${res.status}): ${res.text}`);
  }
  return res.json.token;
}

/**
 * @param {string} [baseURL]
 * @param {string} token
 */
async function getSiteContentUpdatedAt(baseURL, token) {
  const res = await apiRequest(baseURL, "GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  if (res.status !== 200) throw new Error(`Admin site-content read failed: ${res.status}`);
  return res.json?.siteContent?.updatedAt || "";
}

/**
 * @param {string} [baseURL]
 */
async function fetchPublicLibrary(baseURL) {
  const res = await apiRequest(baseURL, "GET", `/api/site-content?t=${Date.now()}`);
  if (res.status !== 200) throw new Error(`Public site-content failed: ${res.status}`);
  return res.json?.siteContent?.curriculumLibrary || { lessonPlans: [], activities: [], resources: [] };
}

/**
 * @param {string} importText
 * @param {object} [overrides]
 */
function parseImportLesson(importText, overrides = {}) {
  const parsed = parseCurriculumLessonPlanImport(importText, {
    generateItemId: () => `e2e-item-${Math.random().toString(16).slice(2, 10)}`,
  });
  if (!parsed.ok) {
    throw new Error(`Import parse failed: ${parsed.errors.join("; ")}`);
  }
  return { ...parsed.data, ...overrides };
}

/**
 * @param {string} [baseURL]
 * @param {string} token
 * @param {object} lessonPlan
 * @param {string} expectedUpdatedAt
 */
async function saveLessonPlan(baseURL, token, lessonPlan, expectedUpdatedAt) {
  return apiRequest(baseURL, "POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt,
    lessonPlan,
  });
}

/**
 * Seed a published lesson via API (safe isolated store only).
 * @param {string} [baseURL]
 * @param {string} importText
 * @param {object} [overrides]
 */
async function seedPublishedLesson(baseURL, importText, overrides = {}) {
  const token = await adminLogin(baseURL);
  let expectedUpdatedAt = await getSiteContentUpdatedAt(baseURL, token);
  const lessonPlan = parseImportLesson(importText, overrides);
  const save = await saveLessonPlan(baseURL, token, {
    ...lessonPlan,
    status: overrides.status || "published",
  }, expectedUpdatedAt);
  if (save.status !== 200) {
    throw new Error(`Seed lesson save failed (${save.status}): ${save.text}`);
  }
  return {
    token,
    lessonPlan: save.json.lessonPlan,
    activities: save.json.activities || [],
    expectedUpdatedAt: save.json.siteContentUpdatedAt,
  };
}

/**
 * Archive a lesson plan after tests.
 * @param {string} [baseURL]
 * @param {string} token
 * @param {object} lessonPlan
 * @param {string} expectedUpdatedAt
 */
async function archiveLessonPlan(baseURL, token, lessonPlan, expectedUpdatedAt) {
  return saveLessonPlan(baseURL, token, { ...lessonPlan, status: "archived" }, expectedUpdatedAt);
}

module.exports = {
  ADMIN,
  getBaseURL,
  apiRequest,
  adminLogin,
  getSiteContentUpdatedAt,
  fetchPublicLibrary,
  parseImportLesson,
  saveLessonPlan,
  seedPublishedLesson,
  archiveLessonPlan,
};
