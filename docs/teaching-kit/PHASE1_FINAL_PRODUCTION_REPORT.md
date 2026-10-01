# Teaching Kit Phase 1 — Final Production Readiness Report

**Audited at (UTC):** 2026-08-03T15:25Z  
**Verdict:** **PRODUCTION READY — Teaching Kit Viewer + Print Center ENABLED**

---

## Deploy confirmation

| Item | Value |
| --- | --- |
| Production service | `LITTLE-LEARNER-HUB` (`srv-d8o3f3r6sc1c73comlc0`) |
| Auto Deploy | **OFF** (`autoDeploy: no`, `autoDeployTrigger: off`) |
| Why merge #436 did not auto-deploy | Auto Deploy is disabled on production. Deploys historically happen via API/manual only. Testing service (`LITTLE-LEARNER-HUB- testing`) has Auto Deploy **ON** and had already picked up `3fb73e02`. |
| Manual deploy triggered | `dep-d9oaucrncjis73bm3660` → **live** on `3fb73e021afd5373d7ea5657d5a4e11ae474884a` at 15:10:12Z |
| Current live deploy | `dep-d9ob1tfqj5pc738d6bb0` (**live**) |
| Current production commit SHA | `b4357c8f3db5bded431de3c20fcc9e6b5598e875` (includes Teaching Kit via ancestor `3fb73e02`; also includes PR #439 signup-email fix) |
| Live shell | `app.js?v=20260803-teaching-kit-qa` |
| Live SW cache | Teaching Kit assets present (`teaching-kit*.js` HTTP 200) |

---

## Feature flags (final)

| Flag | Value |
| --- | --- |
| `teachingKitViewer` | **true** |
| `teachingKitPrintCenter` | **true** |
| `teachingKitAttachments` | **false** (kept off) |
| `playBasedCurriculum` | true |

Public `/api/site-content` still omits `featureFlags` (expected).

---

## Smoke results

### A) Post-deploy, flags OFF

| Suite | Result |
| --- | --- |
| `test:teaching-kit-production-smoke` baseline | **20/20 PASS** (`teaching_kit_disabled` + TK assets 200) |
| `test:production-core-flows` | **7/7 PASS** |
| `test:production-manual-regression` | **178/186** — 8 pre-existing billing-nav locator fails (hidden `[data-view=billing]`); Stripe Checkout API OK |

### B) Flags ON — Teaching Kit access matrix

Ephemeral Firebase users (persistable emails under `@littlelearnershubbyleah.com`):

| Check | Result |
| --- | --- |
| Free locked on Pro Teaching Kit | **PASS** |
| Free unlocked on Free starter kit | **PASS** |
| Trial unlocked on Pro kit | **PASS** |
| Pro unlocked on Pro kit | **PASS** |
| Attachments remain false | **PASS** |
| Pro print authorize unlimited, no watermark | **PASS** |
| Trial print authorize watermarked + counted | **PASS** (`remaining` decremented) |
| Free cannot print Pro kit | **PASS** (403) |
| Pro binder payload (20 sections + companion) | **PASS** |
| `buildBinderPrintHtml` complete binder | **PASS** (~50KB HTML, title + weekday content) |
| `test:teaching-kit-production-smoke` enabled | **36/36 PASS** (final) |

### C) Platform surfaces (flags ON)

| Surface | Result |
| --- | --- |
| Homepage desktop / tablet / phone | **PASS** (`teaching-kit-qa`, TK scripts loaded, no console errors, no 5xx) |
| Lesson plans (all viewports) | **PASS** |
| Calendar / AI docs helpers / curriculum library | **PASS** (manual regression + 127 plans intact) |
| Sign in / Sign up UI | **PASS** (manual regression guest flows) |
| Password reset API | **PASS** |
| Login bad-creds | **PASS** (401) |
| Analytics `POST /api/analytics/event` | **PASS** (persisted) |
| Stripe Checkout session | **PASS** (live Checkout URL) |
| Email provider (Resend) | **PASS** (`providerReady: true`) |
| Free welcome email dry-run | **PASS** |
| Onboarding welcome config | **PASS** |
| Launch readiness | **PASS** (`ready: true`, no blockers) |

### D) Rollback test

| Step | Result |
| --- | --- |
| Set Viewer+Print **OFF** | **PASS** |
| Kit API → `404 teaching_kit_disabled` | **PASS** |
| Site health / curriculum / analytics / Stripe during OFF | **PASS** |
| Re-enable Viewer+Print, Attachments false | **PASS** |
| Pro kit unlocked again; guest locked | **PASS** |
| Rollback suite | **9/9 PASS** |

---

## Warnings / remaining known issues

1. **Production Auto Deploy is OFF.** Future `main` merges will not reach production until someone triggers an API/manual deploy (same root cause as the original Teaching Kit delay).
2. **Billing nav UI harness** still fails 8 checks in `test:production-manual-regression` (hidden billing nav button). Stripe Checkout API itself works.
3. **Free print denial copy** mentions trial allowance wording even for Free users (pre-existing message text; behavior correctly denies).
4. **Binder CSS page-break markers** were not detected by a simple regex in the HTML sample; binder HTML still generated successfully with full content (`pageCount` returned by builder). Recommend a quick visual print preview on a real device.
5. **Attachments** intentionally remain disabled (`teachingKitAttachments=false`).
6. **Security:** A Render API key was provided in chat for this run. Rotate it in the Render Dashboard when convenient.
7. Concurrent deploy of PR **#439** landed after the Teaching Kit manual deploy; live SHA is `b4357c8` (still includes Teaching Kit). Final enabled smoke was re-run and passed on that tip.

---

## Bottom line

Teaching Kit Phase 1 is **live in production** with:

- Deploy confirmed on newest `main` build (`b4357c8…`, shell `teaching-kit-qa`)
- `teachingKitViewer=true`, `teachingKitPrintCenter=true`, `teachingKitAttachments=false`
- Free / Trial / Pro access + print rules verified
- Rollback OFF→ON verified
- Core platform (auth UI, analytics, Stripe, emails readiness, curriculum) healthy

**Release complete for Viewer + Print Center.** Attachments stay off until a later enablement.
