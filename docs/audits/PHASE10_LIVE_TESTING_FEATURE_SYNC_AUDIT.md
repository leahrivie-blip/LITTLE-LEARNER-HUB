# Phase 10 — Live vs Testing Feature Sync Audit

**Date:** 2026-08-08  
**Branch:** `cursor/phase10-live-testing-feature-sync-9c23`  
**Method:** Read-only probes of live + testing Render sites + local HDH/`main` codebase  
**Production writes:** None  

**Live:** `https://little-learner-hub.onrender.com`  
**Testing:** `https://little-learner-hub-testing.onrender.com`  

---

## Policy

- `docs/audits/TESTING_IS_THE_FUTURE_POLICY.md` — locked  
- `docs/audits/LIVE_TO_TESTING_FEATURE_SYNC_PHASE.md` — sync brief  
- No July Testing Lab merge · no production-admin architecture merge · no deploy  

---

## Runtime snapshot (read-only)

| Signal | Live | Testing deploy | Local Phase 10 branch |
|---|---|---|---|
| Shell / manifest | `20260806-tk-editor-spacing-r3` / cookie-cta | `20260805-testing-stabilization-r32` / older | Matches live shell + Phases 8–9 merges |
| HDH testing | OFF | ON | Code present (fence) |
| AI Guide | OFF | ON | Code present (fence) |
| Early-user ($13.99) | ON in founding API | OFF / fields absent on deploy | **Code present** |
| Family tuition APIs | N/A | ON (HDH feature list) | **Merged from Phase 8** |
| Stripe checkout ready | true | false (expected testing) | Testing simulator |

---

## Area-by-area classification

| Area | Classification | Notes |
|---|---|---|
| Homepage / marketing | **Live has something testing deploy missing** → **synced in codebase** | Sticky Start Free `z-index: 45` above cookie; early-user offer cards when flag on. Local ≡ live CSS/HTML. |
| Signup / login / onboarding | **Testing is newer/better** | Testing boot/hub gate + local-password paths; early-user signup cards on codebase. |
| Customer dashboard | **Testing is newer/better** | HDH / work-mode / Owner Admin testers on testing spine. |
| Lesson Plans | **Identical** (+ live admin preview strengths in codebase) | Library parity; admin published/preview on live ≡ local. |
| Complete Teaching Kits | **Live has something testing deploy missing** → **synced in codebase** | TK quality-pass + binder print CSS on local/live; testing deploy older. |
| Lesson viewer | **Identical** | Shared resource viewer. |
| Activity Center | **Identical** | Same surface. |
| Calendar / Weekly Planner | **Identical** | Planner shared; testing surfaces calendar more in work-nav. |
| Child Profiles | **Testing is newer/better** | Canonical Profiles + staff classroom ACLs (Phases 4–5). |
| Daily Logs | **Testing is newer/better** | Conflict/undo/mutation queue / attendance sessions on testing spine. |
| Documentation Helpers | **Identical** (+ Phase 9 review gates) | Generate→review→save; share opt-in. |
| Behavior & Support | **Identical** | Shared generators; support-plan accept flow (Phase 9). |
| Family Hub | **Testing is newer/better** | HDH Family Hub complete (Phase 6); live flag off. |
| Forms | **Testing is newer/better** | Forms spine Phases 1/7; live HDH forms off. |
| Tuition Billing | **Testing is newer/better** | Provider→family tuition (Phase 8); separate from SaaS Stripe. |
| Messaging | **Identical** | Support / FH / Communications channels preserved. |
| Settings | **Identical** | Shared settings hubs. |
| AI tools | **Intentionally skipped (flags on live)** / **Testing newer (AI Guide + review-before-save)** | Never enable AI Guide on live without written approval. |
| Subscription access | **Live has something testing deploy missing** → **synced in codebase** | Early-user helpers + `$13.99` paths in client/server; enable `EARLY_USER_PRICING_ENABLED` on testing service when desired (env write needs owner approval). |
| Print / download | **Live has something testing deploy missing** → **synced in codebase** | `buildLessonPlanDownloadText`, TK binder print polish on local. |
| Lesson covers | **Live has something testing deploy missing** → **synced in codebase** | Quick Cover modal + cover quality status on local ≡ live. |
| Admin | **Needs redesign (pieces only)** | Owner Testing Admin retained; production Command Center not merged. Cover/preview pieces already on local. |
| Mobile | **Live has something testing deploy missing** → **synced in codebase** | Sticky CTA above cookie; testing SW intentionally disabled on testing host. |

---

## Features already identical

- Lesson viewer, Activity Center, Calendar/Weekly Planner core, Doc Helpers core, Behavior generators, Messaging channels, Settings hubs, Resource/print entry points (base), Signup Start Free CTAs (structure)

---

## Features migrated / verified onto testing architecture

*(Live strengths already present on HDH/`main` local; confirmed by MD5/function inventory vs live)*

1. **Early-user pricing** — client helpers + server founding payload + plan key `early_user`  
2. **Lesson covers** — Quick Cover modal, cover quality status, compress-on-upload  
3. **Teaching Kit print / quality-pass** — binder print CSS + download helpers  
4. **Homepage sticky mobile CTA** — `z-index: 45` above cookie notice  
5. **Phases 8–9** — tuition billing + AI review-before-save merged onto this sync branch  

---

## Features intentionally redesigned (not literal ports)

- Owner Admin / Testers (testing) vs production Admin Command Center  
- Family Hub / Forms / Daily Ops HDH spine vs older live gated-off stubs  
- Provider→family tuition (simulated) vs live SaaS Stripe-only  

---

## Features intentionally skipped

- Production admin command-center architecture merge  
- July Testing Lab / foundation-org stack (`origin/testing/full-platform-integration-2026-07`)  
- Live production Stripe / production DB wiring into testing  
- Enabling HDH or AI Guide on **live**  
- Any production data, curriculum publish, env write, or deploy  

---

## Remaining differences (expected)

| Difference | Why it remains |
|---|---|
| Live HDH/AI Guide OFF | Production fence — intentional |
| Testing Stripe checkout `false` | Testing uses simulators / incomplete Stripe secrets — intentional |
| Testing deploy shell older than local | **Ops:** redeploy testing from this branch when Leah approves testing deploy (not production) |
| Early-user flag may be OFF on testing service | Code ready; turning on `EARLY_USER_PRICING_ENABLED` / price ID is an **owner-approved env** change on testing only |
| Founding claimed counts differ | Separate environments — intentional |

---

## Permissions / access

| Check | Result |
|---|---|
| Live vs local capability gates | Aligned (`canAccessCapability`, plan badges, early-user membership) |
| Testing HDH/Family Hub | Fenced to `HOME_DAYCARE_HUB_TESTING` |
| AI Guide | Fenced to `AI_GUIDE_ENABLED` + testing-only |
| Tuition APIs | Testing fence; `realChargesEnabled: false` |

---

## Print / download

| Check | Result |
|---|---|
| Lesson plan download text helper | Present on local ≡ live |
| TK binder / print CSS | Present on local; testing deploy lag |
| Resource viewer print | Identical |

---

## Subscription / access

| Check | Result |
|---|---|
| Early-user client helpers | Present on local ≡ live |
| Server founding early-user fields | Present when `EARLY_USER_PRICING_ENABLED` |
| Testing deploy founding API | Missing early-user fields today (flag/server lag) — **not a code gap on this branch** |
| SaaS vs tuition billing | Kept separate (Phase 8) |

---

## Mobile

| Check | Result |
|---|---|
| Sticky Start Free above cookie | Present (`z-index: 45`) |
| viewport-fit / safe-area | Present |
| FH / tuition / AI review mobile gates | Present (Phases 6–9) |

---

## Production confirmation

- Compared live via HTTPS GET only  
- No Render env writes, deploys, curriculum publishes, or DB writes  
- No production code modified on the live service  

---

## Sync verdict

**PASS** — Every valuable live product feature is present on the testing architecture codebase. Testing-deploy lag is operational (redeploy testing + optional early-user env), not a missing implementation. Testing-only HDH / Family Hub / Forms / Tuition / AI Guide remain correctly newer than live.
