# Phase 7 — AI-Assisted Form Builder Foundation

**Branch:** `cursor/director-family-foundation-bc66`  
**Status:** Complete (testing preview only)  
**Date:** 2026-07-22

## What changed

Authorized providers can open **AI Form Builder** inside Forms Center, describe or paste a childcare form, generate a structured editable draft, review warnings, edit suggested fields, and save a new program-owned draft. Publishing remains manual. Live AI is not called.

**Workflow:** Describe or paste → analyze → suggested sections/fields → review warnings → optional edits → save as new draft → edit further in the existing Form Builder → publish later by hand.

## Files changed

| Path | Role |
|------|------|
| `scripts/ai-form-builder-provider.js` | Clean provider interface + mode resolution + input sanitization/limits |
| `scripts/ai-form-builder-fixtures.js` | Deterministic mock suggestions (medication, photo, emergency, enrollment, policy, field trip, incident, generic) |
| `scripts/ai-form-builder-analyzer.js` | Review warnings (missing info, duplicates, sensitive content, state-specific language, signatures, legal reminder) |
| `scripts/ai-form-builder-data-model.js` | Session store: original prompt/paste, suggestion, edits, accepted form id, mode, audit |
| `server/ai-form-builder-api.js` | `GET/POST /api/forms-center/ai-builder/*` (status, generate, session, regenerate, accept) |
| `server/index.js` | Mount AI builder in the Forms Center route chain |
| `ai-form-builder-ui.js` | Forms Center UI for describe/paste → review → save draft |
| `forms-center-ui.js` | New **AI Form Builder** tab + handoff into Phase 4 Form Builder |
| `styles.css` | AI builder review layout (desktop + mobile) |
| `index.html` | Script include + cache-buster |
| `package.json` | `test:forms-center-phase7` + syntax-check entries |
| `scripts/test-forms-center-phase7.js` | Focused Phase 7 suite |
| `scripts/capture-forms-center-phase7-screens.js` | Two essential screenshots |

## Testing / mock AI behavior

- Live AI remains disabled (`DISABLE_AI_CALLS` + preview-safe mode).
- Approved testing preview uses deterministic fixtures labeled **“Testing Preview — AI Not Called.”**
- Production rejects mock/preview AI modes (`mock_ai_forbidden_in_production`).
- Outside approved preview with AI disabled: helpful unavailable message.
- No API keys in code, fixtures, logs, screenshots, or docs.
- Accept always creates a **new** `fcform_*` draft. Never publishes, sends, signs, approves, or overwrites an accepted draft.
- Regenerate after accept opens a **new session** and preserves the accepted form.

## Permissions and safety

- Server-enforced `FORM_CREATE` via `org-permissions.evaluateAccess`.
- Owner/director: allowed. Lead teacher: allowed by existing `FORM_CREATE`. Assistant: denied unless explicitly granted. Curriculum Only: denied. Cross-org: denied. Parents: denied.
- Prompt-injection style instructions are neutralized; they cannot publish, reveal secrets, or access another organization.
- Input limits: 4,000-char prompt, 20,000-char paste.
- Existing published versions and document snapshots are untouched by AI accept.
- Family Hub remains OFF. Email, SMS, Stripe, and live AI were not activated.

## Tests

```bash
npm run test:forms-center-phase7
```

Covers plain-language generation, pasted conversion, sections/field types, required/conditional/signature suggestions, review warnings, edit-before-save, new permanent IDs, no overwrite, no auto-publish/send, mock-only in testing, production mock rejection, AI-disabled behavior, prompt-injection resistance, input limits, permissions/cross-org denial, and existing version/snapshot protection.

Full regression (Phases 1–7 + platform/account) was run once before completion — all suites PASS.

## Screenshots

<img alt="AI Form Builder review desktop" src="/opt/cursor/artifacts/forms-center-phase7/1-ai-builder-review-desktop.png" />
<img alt="AI Form Builder review mobile" src="/opt/cursor/artifacts/forms-center-phase7/2-ai-builder-review-mobile.png" />

1. Desktop — generated suggestions + review warnings + save actions  
2. Phone — simplified review experience  

## Deferred

- Real approved AI provider connection (provider interface is ready)
- PDF / Word / image / scanned-form extraction (import foundation metadata only)
- Phase 8 parent accounts

## Handoff confirmations

- Branch: `cursor/director-family-foundation-bc66` (verify tip with `git log -1 --oneline`)  
- Pushed to `origin/cursor/director-family-foundation-bc66`  
- Working tree clean after push  
- Full regression: **223 PASS** across Phase 1–7 + platform/account suites, zero failures  
- Production and `main` untouched  
- Draft PR #324 updated; still draft — do not merge  
- Phase 8 not started — waiting for approval  
