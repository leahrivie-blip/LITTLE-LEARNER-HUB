# Production Priority Fixes — Interim Audit

**Date:** 2026-07-14  
**Branch:** `cursor/prod-priority-fixes-70a5`  
**Live site:** https://little-learner-hub.onrender.com  

## Verdict

**Not production-ready yet.** Critical/High items are partially fixed in code; Space Adventure live re-import and full multi-account permission E2E still need credentials/ops steps after deploy.

## What was fixed in this pass

| Priority | Fix |
| --- | --- |
| 1. Calendar → Add Lesson Plan | Calendar CTAs open a picker with week context, banner in Lesson Library, **Use This Plan**, prefilled week, and auto-return to calendar week with success notice |
| 2. Calendar note persistence | Schedule upsert/delete can require cloud sync; clear success/error messaging; migrate no longer marks complete on failed 503 local fallback; day notes preserved across failed migrate |
| 3. Space Adventure | Source verified complete (19 activities Mon–Fri). Repair script added: `scripts/repair-incomplete-curriculum-plans.js`. **Live store still needs admin re-import** |
| 4. Duplicate titles | Careful review only — age-group pairs kept. See `docs/audits/DUPLICATE_LESSON_PLAN_REVIEW.md` |
| 5. Schedule 503s | Client retries with backoff; calendar loading + error banner with **Retry**; avoid locking failed sync as “ready” |
| 7. Name fields | First/last required on account Settings; safe greeting fallbacks; signup already required names |
| 8. Lesson viewer modal | Close (×) restored in workspace mode; `resource-viewer-open` cleaned on close |
| 11–12. Homepage / library UX | Hero **Start Free** / **Create Your Account**, founding spots line, mobile sticky CTA; larger mobile lesson cards + **Use This Plan** primary |

## What was tested

- `node scripts/test-prod-priority-fixes.js` — 7/7 PASS  
- `node scripts/test-homepage-signup-cta.js` — PASS  
- `node scripts/test-calendar-day-notes.js` — 14/14 PASS  
- `node scripts/test-calendar-add-to-calendar.js` — 12/12 PASS  
- Live public catalog probe: Space Adventure still `activityCount: 8` (Mon/Tue only) until admin repair runs  

## Remaining blockers

1. **Custom domain** (`littlelearnerhub.com`) still not serving LLH (separate DNS/ops issue).  
2. **Live Space Adventure** (and any other incomplete published plans) need admin credentials to run the repair script against production.  
3. **Full subscription/role matrix** needs dedicated safe test accounts + Stripe test mode.  
4. Signup/password-reset email E2E and admin unlock E2E still pending in a safe environment.  
5. Post-deploy verification on Render cold start for `/api/schedule` retry UX.

## Production-ready?

**No.** Do not mark production-ready until Space Adventure is re-imported on live, schedule note persistence is verified after logout/login on production, and Critical/High items above are closed.
