#!/usr/bin/env node
/**
 * After deploy: re-assign unique covers on live for plans that were sharing art.
 *
 *   LLH_TEST_EMAIL=... LLH_TEST_PASSWORD=... LLH_ADMIN_CODE=... \
 *     node scripts/live-assign-unique-covers.js
 */
const BASE = (process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com").replace(/\/$/, "");
const EMAIL = String(process.env.LLH_TEST_EMAIL || "").trim().toLowerCase();
const PASSWORD = String(process.env.LLH_TEST_PASSWORD || "");
const CODE = String(process.env.LLH_ADMIN_CODE || "");

const TITLE_TARGETS = [
  "Christmas Celebration",
  "Hibernation and Winter Sleep",
  "Rainforest Adventure",
  "We Belong Together",
  "Caring Hearts",
  "My Home & My Family",
  "The People Who Love Me",
  "Colors All Around Us",
  "My Senses",
  "My Five Senses",
  "Friendship & Feelings",
  "Farm Friends",
  "Weather Wonders",
  "Under the Sea",
  "Growing Gardens",
  "Black & White Discovery",
  "Sensory Discovery",
  "Baby's First Conversations",
  "Smiles & Expressions",
  // Family/grandfriends weeks that were stuck on animal-sounds.jpg / generic family.svg
  "Grandfriends and Loving Faces",
  "Family Faces and Loving People",
  "My Family and Familiar Faces",
  "Grandfriends, Photos and Little Keepsakes",
  "Friendship Problem Solvers",
  "Hello Fall, Little One",
  "Family Songs and Loving Rhythms",
  "Healthy Me",
  "Preschool Classroom Explorers",
];

async function main() {
  if (!EMAIL || !PASSWORD || !CODE) {
    throw new Error("LLH_TEST_EMAIL, LLH_TEST_PASSWORD, and LLH_ADMIN_CODE are required");
  }
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, code: CODE }),
  });
  const loginJson = await login.json().catch(() => ({}));
  if (!login.ok || !loginJson.token) {
    throw new Error(`Admin login failed: ${login.status} ${loginJson.error || ""}`);
  }
  const token = loginJson.token;

  // Confirm new assets are live before writing URLs into the store.
  for (const slug of [
    "christmas-celebration",
    "we-belong-together",
    "rainforest-adventure",
    "hibernation-winter-sleep",
  ]) {
    const asset = await fetch(`${BASE}/images/lesson-covers/${slug}.svg`);
    if (!asset.ok) {
      throw new Error(`Cover asset not deployed yet: /images/lesson-covers/${slug}.svg (${asset.status})`);
    }
  }

  const site = await fetch(`${BASE}/api/site-content`, { headers: { Accept: "application/json" } });
  const siteJson = await site.json();
  const plans = siteJson.siteContent?.curriculumLibrary?.lessonPlans || [];
  const assignments = [];
  for (const title of TITLE_TARGETS) {
    const matches = plans.filter((p) => String(p.title || "").trim().toLowerCase() === title.toLowerCase());
    if (!matches.length) {
      console.warn(`SKIP  no live plan titled "${title}"`);
      continue;
    }
    for (const plan of matches) {
      assignments.push({ id: plan.id, title: plan.title });
    }
  }
  if (!assignments.length) throw new Error("No matching live plans to update");

  const res = await fetch(`${BASE}/api/admin/curriculum/lesson-covers/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assignments }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Assign failed: ${res.status} ${JSON.stringify(json)}`);
  }
  console.log(`Updated ${json.updatedCount} plan cover(s).`);
  for (const row of json.updated || []) {
    console.log(`  ${row.title} -> ${row.coverImageUrl}`);
  }
  if (json.missing?.length) console.warn("Missing:", json.missing);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
