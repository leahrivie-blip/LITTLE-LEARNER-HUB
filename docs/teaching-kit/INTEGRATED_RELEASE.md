# Teaching Kit — Integrated Release Review

**Branch:** `cursor/tk-integrated-release-9ad1`  
**Stack tip (contains all phases):** `cursor/tk-curriculum-production-9ad1` → this release branch  

**Critical:** Do **not** enable Teaching Kit for regular customers until the owner personally reviews admin editor, AI workflow, teacher binder, print, mobile, publishing, and rollback.

---

## Merge strategy

The full stacked implementation lives on a single linear tip. Intermediate draft PRs (#443–#460) are historical review checkpoints; their commits are ancestors of the tip.

**Approved merge:** merge **one** tip PR (this integrated release branch, or #461 tip) into `main`.  
Close superseded intermediate draft PRs after merge — do not merge them separately.

**Do not deploy partial phases.**

---

## Feature flags after production deploy

Code / new-environment defaults stay fail-closed (`false`). Production site-content may enable customer Viewer/Print after owner approval — see [CUSTOMER_LAUNCH.md](./CUSTOMER_LAUNCH.md).

| Flag | Code default | Production (2026-08-07) | Notes |
| --- | --- | --- | --- |
| `teachingKitViewer` | `false` | **true** | Customer Teaching Kit workspace |
| `teachingKitPrintCenter` | `false` | **true** | Binder / print controls |
| `teachingKitAttachments` | `false` | **false** | Keep off until Slice 1G |
| `teachingKitEnrichmentEditor` | `false` | **true** | Admin-only Upgrade Lesson |
| `teachingKitAuthoring` | `false` | **true** | Admin-only |
| `teachingKitCurriculumDirector` | `false` | **true** | Admin-only |
| `teachingKitQualityReview` | `false` | **true** | Admin-only |

There is **no per-account Teaching Kit flag**. Admin tools require an admin session **and** their flags. Rollback customer visibility by setting Viewer/Print back to `false` via Admin Settings (flags-only save).

---

## Admin path (after admin-only enablement)

1. Sign in as owner/admin  
2. Open **Admin → Curriculum → Lesson Plans**  
3. Open a priority lesson (e.g. Farm Animals)  
4. Use **Enrichment / Upgrade Lesson** workspace (flag-gated)  
5. Review AI draft → Save draft → Quality report → Publish only when ready  
6. Keep **Viewer / Print Center** flags off so providers still see legacy lesson plans  

---

## Tests

```bash
# Full Teaching Kit matrix + release suites (Postgres required for RC media suites)
export TEST_DATABASE_URL='postgresql://…'   # local or CI test DB
npm run test:teaching-kit-integrated-release

# Teaching Kit suites only (skip long platform RC)
TK_RELEASE_INCLUDE_PLATFORM=0 npm run test:teaching-kit-integrated-release

# Platform release gates alone
npm run test:release
npm run test:release-candidate-regression

# After production deploy (flags still off)
SITE_URL=https://littlelearnershubbyleah.com TK_SMOKE_MODE=baseline npm run test:teaching-kit-production-smoke
LLH_PROD_URL=https://littlelearnershubbyleah.com npm run test:production-post-merge-smoke
```

---

## Rollback

1. Set all `teachingKit*` flags back to `false` in Admin → Site Content → feature flags  
2. If needed, redeploy previous production deploy from Render Events  
3. Enrichment drafts remain admin-only and are not on public lesson DTOs  

---

## Family Hub / testing site note

Merging to `main` may auto-update `little-learner-hub-testing` if that service tracks `main`. Teaching Kit code will be present with flags default **false**. Family Hub continues to use `HOME_DAYCARE_HUB_TESTING` and is unaffected unless those flags are turned on.
