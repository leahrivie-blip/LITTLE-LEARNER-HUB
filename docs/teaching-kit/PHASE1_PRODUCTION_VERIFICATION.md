# Teaching Kit Phase 1 — Production Go-Live Status

**Date:** 2026-08-03  
**PR:** [#436](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/436) — **MERGED** into `main` at `3fb73e02`  
**Release Tests:** green on merge tip (`npm run test:release`)

---

## Completed

| Step | Status |
| --- | --- |
| Phase 1 QA approved | Done |
| Release CI gate (static contracts + full-site audit) | Pass |
| Mark PR ready + merge #436 | Done |
| Pre-deploy live baseline smoke | Pass (`npm run test:teaching-kit-production-smoke`, mode=`baseline`) |
| Production health / launch-readiness (current live) | Healthy (`ready: true`, no blockers) |
| Curriculum library still serving lesson plans | Pass (127 plans on live site-content) |
| Public site-content still omits `featureFlags` | Pass |

### Pre-deploy baseline smoke (live)

Target: `https://littlelearnershubbyleah.com`  
Result: **14 assertions OK** while still on shell `20260803-nuo-onboarding-r4` (expected before deploy).

---

## Blocked / needs owner action

### 1) Production deploy has not shipped yet

After merge, live production still served:

- `app.js?v=20260803-nuo-onboarding-r4` (not `teaching-kit-qa`)
- `/teaching-kit` route still behaves as pre-Teaching-Kit (`Lesson plan not found`)

This agent **cannot** trigger Render deploys right now:

- Render MCP returns **unauthorized** / no workspace access from this environment

**Owner action required:**

1. Open Render Dashboard → service **`little-learner-hub`**
2. Deploy latest **`main`** (Manual Deploy if Auto-Deploy did not fire)
3. Confirm health check green
4. Confirm homepage references `app.js?v=20260803-teaching-kit-qa`
5. Confirm `GET /api/curriculum/lesson-plans/<id>/teaching-kit` returns  
   `404 { "code": "teaching_kit_disabled" }` while flags are still off

### 2) Feature flags not enabled yet (correct until deploy + smoke)

Do **not** enable flags until deploy is confirmed.

Then in **Admin → Site content → featureFlags** set:

- `teachingKitViewer`: **true**
- `teachingKitPrintCenter`: **true**
- `teachingKitAttachments`: **false** (leave disabled)

### 3) Post-enable live smoke still required

After flags are on, run:

```bash
SITE_URL=https://littlelearnershubbyleah.com \
TK_SMOKE_MODE=enabled \
TK_PRO_AUTH='Bearer <pro-test-or-real>' \
TK_TRIAL_AUTH='Bearer <trial>' \
TK_FREE_AUTH='Bearer <free>' \
npm run test:teaching-kit-production-smoke
```

Plus manual provider checks:

- Free starter unlock vs Pro lock
- Trial print authorize + watermark + remaining count
- Pro unlimited print (no watermark)
- Existing lesson workspace (non-kit) unchanged
- Print on desktop + mobile
- Large plan responsiveness
- Browser console + Render logs clean

---

## Rollback

If anything looks wrong after enablement:

1. Set `teachingKitViewer` and `teachingKitPrintCenter` back to `false`
2. No data migration to undo

---

## Bottom line

**Code is merged and CI-clean. Production deploy + flag enablement are waiting on Render/admin access outside this agent’s current credentials.**  
Live site remains healthy on the previous shell; Teaching Kit is not live for users until deploy + approved flags.
