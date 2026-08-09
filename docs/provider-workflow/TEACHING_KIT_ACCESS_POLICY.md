# Teaching Kit access policy (confirm — flags unchanged)

**Status:** Confirmed for draft PR `cursor/provider-workflow-safety-ux-3d7e`  
**Do not enable or change customer Teaching Kit flags in this PR.**

## Intended policy (current code)

| Role | Store flags OFF (`teachingKitViewer` / `teachingKitPrintCenter` false) | Store flags ON |
|---|---|---|
| Logged-out / anonymous | 404 `teaching_kit_disabled` | Public/free unlock rules still apply |
| Ordinary Free / Pro / Founding / Trial provider | 404 unless curriculum unlock + flags | Customer Teaching Kit when plan unlocks the lesson |
| Program owner / director / teacher / assistant | Same as ordinary provider (email identity) — **not** elevated by program role | Same |
| Leah owner allowlist **with** admin session (Owner Preview) | Elevated viewer + print for preview only; store flags stay false | Same + ownerPreview labeling |
| Other admin emails | 403 `teaching_kit_owner_required` for owner tools; no customer elevation | N/A |

## Why a Director/Owner “provider-like” account may see Teaching Kit

If the live account can open customer Teaching Kit + Build/Print while flags are reported off elsewhere, likely causes:

1. **Owner Preview** — allowlisted owner email + active admin session elevates flags for that request only (`effectiveCustomerTeachingKitFlags`).
2. **Store flags actually ON** in production site-content (customer enablement) — verify via admin site-content, do not flip in this PR.
3. **Client cache** of an older elevated session — hard refresh / new session.

## Enforcement locations

- `scripts/teaching-kit.js` — defaults, owner preview elevation, public flag DTO
- `server/index.js` `handleCurriculumLessonPlanTeachingKit` — 404 when disabled and not ownerPreview
- Client viewer mount checks `teachingKitViewer` / print center flag

## This PR

- Documents policy only
- Adds permission/regression tests that flags remain unchanged by fixtures
- Does **not** enable customer Teaching Kit flags
