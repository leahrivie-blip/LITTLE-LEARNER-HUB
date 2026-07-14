# Production Priority Fixes — Audit

**Date:** 2026-07-14  
**Branch:** `cursor/prod-priority-fixes-70a5`  
**PR:** #200  
**Live site:** https://little-learner-hub.onrender.com  

## Verdict

**Code ready to merge.** After Render redeploy, startup seed/repair will restore incomplete preschool Pro weeks (including Space Adventure Wed–Fri) automatically.

Still **not fully production-ready** until post-deploy verification and custom-domain DNS are complete.

## Fixed in this PR

| Priority | Fix |
| --- | --- |
| 1. Calendar → Add Lesson Plan | Week-aware picker, Use This Plan, return to week + success notice |
| 2. Day note persistence | Cloud requireCloud saves, migrate no longer wipes notes on 503 |
| 3. Space Adventure / incomplete weeks | Startup repair in `server/curriculum-preschool-seed.js` + repair script |
| 4. Duplicate titles | Careful review only — age variants kept |
| 5. Schedule 503s | Retries, loading state, Retry banner |
| 7. Name fields | Settings first/last + safe greetings |
| 8. Lesson viewer modal | Close control restored; overlay cleaned on close |
| 11–12. Homepage / library UX | Start Free / Create Your Account, founding note, sticky mobile CTA, Use This Plan |

## Tests

- `node scripts/test-prod-priority-fixes.js`
- `node scripts/test-curriculum-preschool-seed-repair.js`
- `node scripts/test-homepage-signup-cta.js`
- `node scripts/test-calendar-day-notes.js` (14/14)
- `node scripts/test-calendar-add-to-calendar.js` (12/12)

## After deploy

1. Confirm Space Adventure public preview shows Wed–Fri / ~19 activities
2. Logout/login day-note persistence on production
3. Cold-start calendar Retry UX
4. Custom domain DNS (Cloudflare → Render) — ops outside this PR
5. Full subscription/role matrix when dedicated test accounts exist
