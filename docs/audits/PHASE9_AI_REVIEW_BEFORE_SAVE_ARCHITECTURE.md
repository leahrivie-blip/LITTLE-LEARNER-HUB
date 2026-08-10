# Phase 9 — AI Review-Before-Save Architecture

**Date:** 2026-08-08  
**Spine:** HDH / `main` testing  
**Production:** 🔒 Completely read-only

---

## Invariant

> **AI may only propose.** Persist, share, assign, publish, charge, delete, or overwrite requires an explicit human action **after** review.

Canonical data (Program → Child → Household), Forms, Family Hub, Daily Operations, and Billing architecture are unchanged — Phase 9 only adds review gates around AI apply paths.

---

## Two layers

| Layer | Role |
|---|---|
| **Propose** | `/api/ai-generate`, AI Guide generate/ask/revise, Teaching Kit suggest endpoints, client generators |
| **Apply** | Explicit Save / Share / Accept after review ack — never from the generate call alone |

SaaS Stripe / tuition billing are **never** triggered by AI.

---

## Surfaces & gates

| Surface | Generate | Persist | Share / publish |
|---|---|---|---|
| **AI Guide** | Draft only | Requires `#aiGuideReviewAck` → Save as Draft | No send/publish buttons |
| **Documentation Helpers** | Editable draft | Requires `#docHelperReviewAck` + confirm | `#docHelperShareFamily` **off by default** |
| **HDH AI Form Builder** | Editable draft (+ optional structured fields) | Requires `#hdhAiReviewAck` for **Save to child** and **Save as template** | Private draft (`shareWithFamily: false`); Share is separate. Server also rejects `aiGenerated` template upserts without review ack (Wave 3). |
| **Daily Logs end-of-day AI** | Stages `dlcAiReviewState` | Requires review ack + Save draft | Share checkbox opt-in |
| **Generate daily report** | Same review panel | Same | Same |
| **Observation → goal** | Pending suggestion | Accept via `data-ai-accept-suggestion` | Goals stay private |
| **Behavior note → support plan** | Pending suggestion | Accept explicitly | Private |
| **Teaching Kit enrichment / director** | Suggest / draft patch | Existing accept/publish gates | `autoPublished: false` |

---

## Forbidden auto-actions

AI must never automatically:

- publish curriculum or forms  
- send Family Hub messages / share flags  
- assign forms or roster items  
- charge Stripe / tuition  
- delete records  
- overwrite production data or production env  

Library: `server/ai-review-lib.js` (`INVARIANT`, `assertProposalOnly`, `canPersistAiProposal`).

---

## Production fence

- AI Guide: testing flags only (`AI_GUIDE_ENABLED` / testing-only) — leave unset on production  
- Teaching Kit AI flags default **false**  
- Agents remain read-only for production env vars  
- No Phase 10 Live→Testing sync until Phase 9 is approved  

---

## Tests

`npm run test:ai-review-before-save-phase9`
