# Little Learner Hub — Master Project Tracker

**Last updated:** 2026-08-08  
**Owner:** Leah  
**Live site:** https://littlelearnershubbyleah.com  
**Repo `main` tip:** `eb4e1be` (includes PR #573)  
**Live production commit:** `eb4e1be` (deploy `dep-d9r849n10e5c73fg1kmg`)

Status key: ✅ done · 🟡 in progress · 🔴 blocked · ⏸ parked (needs approval)

---

## Production deploy status (critical)

| Item | Status | Notes |
|------|--------|-------|
| PR #573 merged to `main` | ✅ | Merged 2026-08-08 · https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/573 |
| GitHub CI `test:release` | ✅ | Passed on PR before merge |
| Render production running | ✅ | `/api/health` ok · `launchReady` · Postgres ready |
| Production running **#573 commit** | ✅ | Live `/api/build-version` = `eb4e1be` after API deploy (auto-deploy was off) |
| Post-#573 production feature smoke | ✅ | Health/DB/homepage OK; inventory fingerprint unchanged (127 published); cover upload/assign admin-gated; live `app.js` has Preview as User, Quick Cover, sticky bar, cover filters |

Also now live with this deploy: PR #566, #567, #568 (Teaching Kit UI/print fixes that were on `main` but not previously deployed).

---

## Recently completed

| Item | Status | Evidence |
|------|--------|----------|
| Lesson Plan Admin — covers, draft/publish, Preview as User | ✅ merged · ✅ live | PR #573 (`eb4e1be`) |
| Teaching Kit print/download shared printable model | ✅ merged · ✅ live | PR #568 |
| Teaching Kit UI + print polish | ✅ merged · ✅ live | PR #567 |
| Early User Pro pricing ($13.99), flag-gated | ✅ merged · ✅ live | PR #565 |

---

## Active / next roadmap (approved direction)

### A. Curriculum — Gold Standard Holidays First (Issue #320)

**Approved direction:** Build reusable Pro Gold Standard monthly collections, holidays first.

| Collection / week | Status |
|-------------------|--------|
| Fall Celebrations · Week 1 Apples (Preschool) | 🟡 Draft exists (`curriculum-drafts/…/week-01-…`); import file present; **not found on live catalog** under stable id `cur-lp-preschool-apple-orchard-investigators` |
| Fall Celebrations · Week 2 Pumpkins and Harvest (Preschool) | 🟡 **Next milestone** — draft in progress on branch `cursor/project-tracker-fall-gold-week2-b968` |
| Fall Celebrations · Weeks 3–4 | ⏸ After Week 2 owner approval |
| Toddler / Infant Fall parallels | ⏸ After Preschool Fall Weeks 1–4 approved |
| Thanksgiving · Winter · Valentine’s · Spring collections | ⏸ Per Issue #320 order |

**Rules for this phase:** draft-only until Leah approves import/publish; no auto-publish; no Teaching Kit customer flag enablement.

### B. Teaching Kit (platform)

| Item | Status |
|------|--------|
| Admin enrichment / authoring / director / quality tools | ✅ in codebase; flags default **false** |
| Customer Viewer / Print Center | ⏸ Keep **false** until owner personal review ([INTEGRATED_RELEASE.md](./teaching-kit/INTEGRATED_RELEASE.md)) |
| Curriculum Production runner (priority queue) | ⏸ Ready for review — do not enable flags / auto-publish ([CURRICULUM_PRODUCTION.md](./teaching-kit/CURRICULUM_PRODUCTION.md)) |

### C. Feature completeness (ops / Family Hub) — parked

See [FEATURE_COMPLETENESS_ROADMAP.md](./audits/FEATURE_COMPLETENESS_ROADMAP.md). Horizon A (tuition, parent delivery, forms e-sign, sync) is **not** started in this track.

---

## Stop-for-approval gates

1. ~~Render Manual Deploy of `main`~~ ✅ completed 2026-08-08 (`eb4e1be` live).  
2. **Fall Celebrations Week 2** draft complete → Leah review before import/publish.  
3. Any Teaching Kit **customer** flag enablement.  
4. Any production curriculum publish of new Gold Standard weeks.

---

## Quick commands

```bash
# Live identity
curl -sS https://littlelearnershubbyleah.com/api/build-version | jq .
curl -sS https://littlelearnershubbyleah.com/api/health | jq '{ok,launchReady}'
curl -sS https://littlelearnershubbyleah.com/api/launch-readiness | jq '.ready,.required.database'

# After deploy — local verification suites for Lesson Plan Admin
npm run test:lesson-plan-admin-final-verification
npm run test:lesson-plan-admin-role-tk-verification
```
