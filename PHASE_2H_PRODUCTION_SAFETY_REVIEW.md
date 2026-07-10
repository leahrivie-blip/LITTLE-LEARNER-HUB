# Phase 2H Production Safety Review (PR #134)

**Status:** NOT approved for merge until you download and save live production backups.  
**Agent actions:** No merge. No production wipe. No bulk import.

---

## 1. Production backup safety

### Important correction
`backups/phase-2h/` files in the agent workspace are **local test-store backups only**. They do **not** prove live Render production is backed up.

### What exists on live production TODAY (before PR #134)

| Endpoint | On production now? | Contents |
|----------|--------------------|----------|
| `GET /api/admin/curriculum/backup` | **Yes** | Legacy only: `lessonPlans` overrides, `customLessonPlans`, `activities`, matching uploads |
| `GET /api/admin/curriculum/backup/new` | **No** (ships in #134) | New curriculum only |
| `GET /api/admin/curriculum/backup/full` | **No** (ships in #134) | Combined |
| `GET /api/admin/site-content` | **Yes** | Full admin blob including `siteContent.curriculum` |

Public probe (no admin auth) on 2026-07-10 showed production currently has:
- `playBasedCurriculum: false`
- no public `curriculumLibrary`
- **5** public legacy lesson override keys
- **0** public custom lesson plans / CMS activities

New curriculum records (Phase 2F test plans) live in the **admin store**, not the public API, while the flag is OFF. You must export them via admin before merge.

### Exact admin steps — download backups BEFORE merging #134

Base URL: `https://little-learner-hub.onrender.com`

#### A) Get an admin token
1. Open the live site → Admin login with owner email / password / access code.
2. Or POST login:

```bash
curl -sS -X POST 'https://little-learner-hub.onrender.com/api/admin/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_ADMIN_PASSWORD","code":"YOUR_ADMIN_CODE"}'
```

Save the returned `token` as `ADMIN_TOKEN`.

#### B) Full legacy curriculum backup (available NOW)

**UI (current production):** Admin → Content → **Lesson Plans** → use the curriculum/legacy backup button if shown.

**API:**

```bash
curl -sS "https://little-learner-hub.onrender.com/api/admin/curriculum/backup?adminToken=ADMIN_TOKEN" \
  -o "prod-legacy-curriculum-backup-$(date -u +%Y%m%dT%H%M%SZ).json"
```

Verify the file opens as JSON and includes `counts` + `siteContent.lessonPlans` / `customLessonPlans` / `activities` + `checksum`.

#### C) Full new curriculum backup (available NOW via admin site-content)

Dedicated `/backup/new` is **not** on production until #134 deploys. Export curriculum from admin site-content:

```bash
curl -sS "https://little-learner-hub.onrender.com/api/admin/site-content?adminToken=ADMIN_TOKEN" \
  -o "prod-admin-site-content-$(date -u +%Y%m%dT%H%M%SZ).json"
```

Then extract/save curriculum only (example with Node):

```bash
node -e '
const fs=require("fs");
const src=process.argv[1];
const j=JSON.parse(fs.readFileSync(src,"utf8"));
const curriculum=j.siteContent?.curriculum || {};
const out={
  exportedAt:new Date().toISOString(),
  purpose:"production-new-curriculum-backup-before-phase-2h",
  counts:{
    curriculumLessonPlans:(curriculum.lessonPlans||[]).length,
    curriculumActivities:(curriculum.activities||[]).length,
    curriculumResources:(curriculum.resources||[]).length,
  },
  siteContent:{ curriculum },
};
fs.writeFileSync(process.argv[2], JSON.stringify(out,null,2));
console.log(out.counts);
' prod-admin-site-content-TIMESTAMP.json prod-new-curriculum-backup-TIMESTAMP.json
```

Record the three counts. Keep both the full admin dump and the curriculum-only file offline.

#### D) Combined/full backup

**Before merge:** keep both files from B + C (legacy endpoint file + admin/curriculum extract). That is your combined pre-merge backup set.

**After #134 deploys (optional second snapshot, still before wipe):**

```bash
curl -sS "https://little-learner-hub.onrender.com/api/admin/curriculum/backup/full?adminToken=ADMIN_TOKEN" \
  -o "prod-full-curriculum-backup-$(date -u +%Y%m%dT%H%M%SZ).json"
```

Also available after deploy:
- `/api/admin/curriculum/backup` — legacy slice
- `/api/admin/curriculum/backup/new` — new curriculum only

### Production is NOT backed up until you say so
Do not treat this review as confirmation that production files are saved. Only your downloaded files count.

---

## 2. PR scope and destructive behavior

### What users see immediately after #134 deploys (before any wipe)

| Surface | Immediate post-deploy behavior |
|---------|--------------------------------|
| Lesson Plan Library | Switches to **curriculum adapters only**. Shows **published/featured** `siteContent.curriculum.lessonPlans` if any exist in production. |
| Activity Center | Same — published curriculum activities linked to public lessons. |
| Legacy 900 shells | **Gone** from the client bundle. |
| Current 5 public legacy overrides | **No longer appear** in libraries (overrides are not merged anymore). |
| Empty states | Only if production curriculum has **zero** published plans/activities. |

### Will libraries be empty before the production wipe?
**Not necessarily.**

- If production still contains Phase 2F / Tiny Save Test / other published curriculum, users will see that test content right after deploy until wipe.
- If production curriculum is already empty, libraries show the new empty-state copy immediately.
- Legacy generated shells will not appear either way.

**Recommended order:** download backups → merge/deploy #134 → immediately run wipe (or wipe in the same maintenance window) → verify 0/0/0 → then import real batches.

### Unchanged systems (not modified by #134 for these domains)
Observations, forms, printables, menus, users, memberships, billing, child profiles, login, and admin auth paths are outside the wipe scope and were not redesigned. Wipe only clears:
- `siteContent.curriculum.{lessonPlans,activities,resources}`
- `siteContent.lessonPlans`
- `siteContent.customLessonPlans`
- `siteContent.activities`

### Removed-function call check
Repo search on `app.js` / `server/index.js`:
- No calls to `buildLessonPlans(`, `buildActivityLibrary(`, `CURRICULUM_LIBRARY_FALLBACK`, `loadAdminManagedLessonPlans(`, `loadAdminManagedActivities(`
- No remaining function definitions for the two generators

Note: `allLessonPlansForAdmin()` remains as a **stub returning `[]`** so leftover legacy admin helpers do not throw. Those helpers are not reachable from admin nav (tabs removed).

---

## 3. Wipe endpoint security

| Check | Result |
|-------|--------|
| Requires valid admin token | **Yes** — `validAdminToken(body.adminToken)`; otherwise 401 |
| Exact phrase required | **Yes** — `body.confirm === "WIPE_CURRICULUM"`; otherwise 400 |
| GET cannot trigger wipe | **Yes** — route is `POST` only; GET routes are backup endpoints |
| Deletes forms/printables/users/billing/observations? | **No** — only curriculum + legacy lesson/activity CMS fields listed above |
| Audit logging | **Added** in this safety pass: `[curriculum-wipe]` logs unauthorized attempts, confirm failures, before/after counts, duration |

### Recommendation after production cleanup
**Disable or remove the wipe endpoint promptly after the one-time production wipe.** Options:
1. Prefer: remove route + handler in a tiny follow-up PR the same day.
2. Or: gate behind `ALLOW_CURRICULUM_WIPE=true` env (default off) if you want a temporary kill switch without another code delete.

Leaving an authenticated wipe endpoint indefinitely increases blast radius if an admin token leaks.

---

## 4. Recovery plan

### A) Revert PR #134 on GitHub
1. Open PR #134 → **Revert** (or create revert PR from `main` after merge).
2. Merge the revert → wait for Render deploy.
3. Confirm site loads; lesson libraries return to pre-#134 legacy+flag behavior from the reverted code.

### B) Restore legacy production data from downloaded backup
From the legacy backup JSON (`purpose` contains legacy / `siteContent.lessonPlans`):

1. Admin login → get token.
2. `GET /api/admin/site-content?adminToken=…` and keep current `updatedAt`.
3. Merge backup fields into a site-content save payload:
   - `siteContent.lessonPlans` ← backup.siteContent.lessonPlans
   - `siteContent.customLessonPlans` ← backup.siteContent.customLessonPlans
   - `siteContent.activities` ← backup.siteContent.activities
4. `POST /api/admin/site-content` with `{ adminToken, siteContent }` using the **current** `updatedAt` (409 means reload and retry).
5. If backup included `uploadedResources`, restore those via upload admin APIs separately.

**Note:** After #134, restored legacy overrides will **not** reappear in public libraries unless you also revert the code (generators are gone). Legacy restore is mainly for data preservation / code-revert scenarios.

### C) Restore new curriculum from downloaded backup
From curriculum backup / admin extract (`siteContent.curriculum`):

1. `GET /api/admin/site-content` for current stamp.
2. Set `siteContent.curriculum` to the backed-up curriculum object (plans/activities/resources).
3. `POST /api/admin/site-content` with matching `updatedAt`.
4. Verify Play-Based Lessons / Curriculum Activities / Resources counts match backup counts.
5. Prefer restoring via admin site-content rather than wipe+reimport when recovering test/real batches you already exported.

### D) Deploy succeeded but admin curriculum pages fail
1. Hard-refresh / cache-bust (`app.js?v=20260710-phase-2h`).
2. Confirm admin login still works (`/api/admin/login`, `/api/admin/site-content`).
3. Open browser console on Play-Based Lessons; note any JS errors.
4. If UI is broken but API works: use curriculum lesson-plan POST/GET APIs and/or revert #134.
5. If API 500s: check Render logs for `[curriculum-wipe]`, `[curriculum-lesson-save]`, store write errors; restore from backup if curriculum was wiped unexpectedly.

---

## 5. Final checks (this review)

| Check | Result |
|-------|--------|
| `npm run check` | Passed |
| `scripts/phase-2h-verify.js` | Passed |
| `test-curriculum-lesson-plan-save.js` | Passed |
| `test-curriculum-activities-browser.js` | Passed |
| `test-store-write-race.js` | Passed |
| Removed generator references | None in runtime JS |
| PR merge | **Not performed** |
| Production wipe | **Not performed** |
| Bulk import | **Not performed** |
| Real curriculum content in PR | None added |
| Local `backups/phase-2h/` | Test-only; not production proof |

### PR cleanliness
Branch `cursor/phase-2h-curriculum-cleanup-6400` is 1 commit ahead of `main` for the cleanup, plus this safety logging follow-up. Scope is Phase 2H only (app/server/scripts/docs). No unrelated redesigns.

---

## Go / no-go

**Do not merge #134 until you have downloaded and saved:**
1. Production legacy backup (`/api/admin/curriculum/backup`)
2. Production new curriculum backup (from `/api/admin/site-content` → `curriculum`)
3. Optionally keep the full admin site-content dump as a third safety copy

After those files are confirmed on your machine, merge/deploy, then wipe in a controlled window, then disable/remove the wipe endpoint.
