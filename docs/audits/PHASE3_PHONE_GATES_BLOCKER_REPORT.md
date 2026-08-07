# Phase 3 phone gates — production blocker report (testing only)

**Date:** 2026-08-07  
**Testing branch:** `cursor/family-hub-testing-readiness-d3df`  
**Production:** `ccd01fe` on `main` — **do not merge/deploy**  
**Status of gates:** Still open — awaiting Leah’s physical-phone sign-off  

These two items are the remaining **production gates** from Phase 3. They are **not** open code defects found by automation. They are **missing human verification** that Playwright cannot fully replace.

---

## Case 1 — Physical phone conflict panel taps / readability

### Exactly what it is

**Scenario:** Two staff members are editing the **same child** at the same time (classic floor reality: Teacher A logs lunch while Teacher B logs notes).

Automation already proved on testing (headless Chromium, including a **390×844 phone viewport** for Teacher B):

1. Teacher A saves a lunch edit.  
2. Teacher B saves a stale notes edit → server returns a conflict.  
3. A human-readable conflict panel appears (not raw JSON).  
4. **Keep latest** and **Apply my change** both resolve correctly.  
5. Final cloud data retains the expected meal with attribution.

What is still **MANUAL REQUIRED**:

> On a **real phone** (Safari/Chrome on iOS/Android), open testing, reproduce a conflict panel, and confirm with **your fingers** that Keep latest / Apply my change are **readable** and **tappable** (no tiny targets, no clipped text, no needing a mouse/precise cursor).

### Classification

| Question | Answer |
|---|---|
| Real customer-facing bug? | **Not confirmed.** No functional failure was found. |
| Missing manual verification? | **Yes — this is the primary classification.** |
| Flaky automated test? | **No.** Live automation passed Case 1 (6/6 overall). |
| Known limitation? | **Partial.** Automation can emulate phone *width*, not real finger hit-testing, OS browser chrome, or device zoom/safe-area quirks. |

### User impact if unresolved

If the panel is actually hard to use on a real phone (unknown until checked):

- Staff may not know how to resolve a same-child edit conflict.  
- They may force-refresh, re-enter data, or ask another teacher to “just overwrite,” causing confusion.  
- Worst practical outcome is **staff friction / delayed resolution**, not silent permission bypass.

If the panel is fine (likely, given phone-viewport PASS):

- Impact of leaving the gate unchecked is **release risk**, not a known broken workflow.

### Can it cause…?

| Risk | Assessment |
|---|---|
| Data loss | **Unlikely as a known defect.** Conflict path was automated and resolves without dropping the mutation silently (Phase 3 conflict ACK safety). Unresolved *usability* could cause *operator* mistakes (discarding the wrong side), not silent wipe. |
| Permission problems | **No.** This is UI usability of an already-authorized staff conflict. |
| Crashes | **No evidence.** |
| Broken workflows | **Not confirmed.** Logic works in automation; only physical tap/readability remains unverified. |

### Fix before production or wait?

**Verify before production; do not “code-fix” unless the phone check fails.**

- This gate should be **closed by your 5–10 minute phone test on testing**, not by more headless runs.  
- Only if Keep/Apply are hard to read or tap should engineering change CSS/touch targets before launch.  
- It is **not** safe to waive without that phone check if you want a clean production GO, because conflict UX is a real classroom moment.

---

## Case 5 — Physical phone Assistant care under real supervision load

### Exactly what it is

**Scenario:** An **Assistant** on a phone does rapid Daily Logs care actions while also confirming they still cannot reach Settings/billing.

Automation already proved on testing (headless Chromium **phone viewport 390×844**):

1. Assistant assigned to Oaks.  
2. Double check-in (duplicate controlled).  
3. Two diaper logs + one note.  
4. Care rows land in DB with assistant attribution.  
5. Settings hidden; billing APIs return `403 billing_owner_only`.

What is still **MANUAL REQUIRED**:

> On a **real phone**, as Assistant, do check-in + diaper + note **quickly under real one-handed / supervision-load conditions**, and confirm the UI stays usable and Settings/billing remain unreachable.

### Classification

| Question | Answer |
|---|---|
| Real customer-facing bug? | **Not confirmed.** Permissions and care logging passed automation. |
| Missing manual verification? | **Yes — this is the primary classification.** |
| Flaky automated test? | **No.** Case 5 automated PASS. |
| Known limitation? | **Partial.** Headless phone viewport cannot simulate real thumb reach, one-handed grip, glare, slow device, or “holding a toddler while tapping.” |

### User impact if unresolved

If real-phone usability is poor (unknown until checked):

- Assistants may miss care logs during busy moments.  
- They may abandon room-mode / quick actions and dig into deeper forms (slower).  
- Permission leak is **not** the open question — automation already blocked Settings/billing.

If the phone check passes (likely):

- Leaving it unchecked is again **release risk / confidence**, not a known broken permission model.

### Can it cause…?

| Risk | Assessment |
|---|---|
| Data loss | **Unlikely as a known defect.** Care mutations + queue behavior passed Phase 2/3 automation. Poor usability could cause *missed* logs (human skip), not silent deletion. |
| Permission problems | **No known open bug.** Assistant Settings/billing denial already verified. The manual check is to confirm that remains true *in real phone chrome* under rush. |
| Crashes | **No evidence.** |
| Broken workflows | **Not confirmed.** Logic/permissions OK; only real-device rush usability remains unverified. |

### Fix before production or wait?

**Verify before production; code-fix only if the phone check fails.**

- Close this gate with your Assistant phone walkthrough on testing.  
- If taps feel fine and Settings stay hidden, it can be signed off without a code change.  
- Do **not** skip if Assistants will be a primary phone role on day one — that is the whole point of the gate.

---

## Side-by-side summary

| Gate | What it really is | Known bug? | Blocks production why? | Pre-launch action |
|---|---|---|---|---|
| Case 1 | Real-phone readability/taps for conflict Keep/Apply | **No confirmed bug** | Missing human verification of a high-stakes classroom UX | You test on phone; fix CSS only if fail |
| Case 5 | Real-phone Assistant rush usability + Settings still denied | **No confirmed bug** | Missing human verification under real supervision load | You test on phone; fix UX only if fail |

---

## What this is *not*

- Not a failing Phase 3 automated suite (Phase 3 classroom = **10/10**, live manual automation = **6/6**).  
- Not a flaky test marked as a gate.  
- Not a Phase 4 regression.  
- Not something an agent can honestly “resolve” without your physical device.

---

## After you close both gates

When you mark Cases 1 & 5 done (pass or fail with notes):

1. Keep work on **testing only** unless you explicitly approve production.  
2. Re-run the complete regression suite on the testing tip.  
3. Issue one final **GO / NO-GO** for production based on: phone sign-off + regression green + your explicit approval.

Until then: **no production merge/deploy.**

---

## Suggested phone checklist (copy/paste)

### Case 1
1. Open https://little-learner-hub-testing.onrender.com on a real phone.  
2. Sign in as two staff (or use two browsers/devices) on the same child.  
3. Create a conflict (edit different fields / stale save).  
4. Confirm conflict panel text is readable without zoom.  
5. Tap **Keep latest** once — succeeds.  
6. Repeat / use **Apply my change** once — succeeds.  
7. Sign-off: Pass / Fail + notes.

### Case 5
1. On a real phone, sign in as Assistant.  
2. Quickly: check-in → diaper → note (one-handed if possible).  
3. Confirm Settings/billing are not available.  
4. Confirm UI stayed usable (no stuck overlays, no tiny unusable buttons).  
5. Sign-off: Pass / Fail + notes.
