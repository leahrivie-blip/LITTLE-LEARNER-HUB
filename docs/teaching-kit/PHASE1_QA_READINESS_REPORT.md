# Teaching Kit Phase 1 — Final QA Readiness Report

**Date:** 2026-08-03  
**PR:** [#436](https://github.com/leahrivie-blip/LITTLE-LEARNER-HUB/pull/436) (draft)  
**Branch:** `cursor/teaching-kit-architecture-9ad1`  
**Status:** Phase 1 foundation **QA complete** — **not** approved for merge / deploy / flag enablement until owner sign-off

---

## Verdict

Teaching Kit Phase 1 (Slices **1A–1F** + final E2E QA harness) is **ready for owner production-enablement review**.

All automated slice tests and the Phase 1 QA suite pass. Feature flags remain **`false` by default**. Public `/api/site-content` still **omits** `featureFlags`. No production enablement was performed during QA.

**Do not merge, deploy, or turn flags on until you explicitly approve the items in “Still needs attention before production.”**

---

## What was QA’d

| Area | Result |
| --- | --- |
| Flag defaults / fail-closed | Pass — API `404 teaching_kit_disabled` when flags false; locked kits do not replace legacy workspace |
| Free access | Pass — curated Free starter unlocks; Pro plans stay locked for Free/guest |
| Trial access | Pass — kit unlocks; print authorize returns Trial watermark + counted export |
| Pro access | Pass — kit unlocks; print authorize unlimited / no watermark |
| Provider workflow | Pass — Start → Setup → Today → Open Everything → Activity/Substitute → Build/Print → Binder |
| Desktop / tablet / mobile | Pass — no horizontal overflow; workflow &lt; 8s each; screenshots captured |
| Print (Letter + A4) | Pass — cover/tabs/footers/page numbers; keep-together blocks; injected `@page` |
| Empty lesson plans | Pass — empty banner; Build/Print still usable; no junk tokens |
| Large lesson plans | Pass — map + binder build under 750ms budgets |
| Accessibility basics | Pass — tablist/tabs/`aria-selected`, image alts, keyboard arrow nav on ops/day tabs, disabled print `aria-disabled` |
| Entitlement order | Pass — flag check → trial authorize → watermark → build → print |
| Public site-content | Pass — no `featureFlags`, no companion payloads on library cards |

---

## Test evidence

| Suite | Result |
| --- | --- |
| `npm run test:teaching-kit-slice-1a` … `1f` | All green |
| `npm run test:teaching-kit-phase1-qa` | **88 assertions OK** |

Artifacts (local QA run):

- `/opt/cursor/artifacts/teaching-kit-qa/workflow-desktop.png`
- `/opt/cursor/artifacts/teaching-kit-qa/workflow-tablet.png`
- `/opt/cursor/artifacts/teaching-kit-qa/workflow-mobile.png`
- `/opt/cursor/artifacts/teaching-kit-qa/empty-mobile.png`
- `/opt/cursor/artifacts/teaching-kit-qa/print-binder-desktop.png`
- `/opt/cursor/artifacts/teaching-kit-qa/qa-summary.json`
- `docs/teaching-kit/qa/qa-summary.json`

Viewport timings from latest QA run (info-level):

- Desktop ~2.1s · Tablet ~1.7s · Mobile ~2.2s for the full companion workflow

---

## Fixes applied during this QA pass

1. **Today activity rows** — stopped using the 3-column `tk-kit-item` grid (misaligned Open button); added `.tk-activity-row`
2. **Day strip a11y** — `role="tab"` + `aria-selected` on weekday buttons
3. **Keyboard nav** — Left/Right/Home/End on ops tabs and day strip
4. **Activity back target** — returns to Build / Print when opened from Print Center
5. **Substitute control** — `aria-expanded` reflects panel state
6. **Disabled print CTA** — clearer label + `aria-disabled` when Print Center flag is off

---

## Still needs attention before production

These are **not blockers for code completeness**, but should be decided/handled before wider enablement:

1. **Owner flag enablement decision** — set `teachingKitViewer` / `teachingKitPrintCenter` only after you approve; keep `teachingKitAttachments` false until 1G (optional)
2. **Optional Slice 1G** — attachment types / admin attach hook still deferred
3. **Real-device smoke (recommended)** — run one Live Preview with flags on temporarily: Pro print Letter + A4, Trial watermarked print (confirm one export decrements), Free starter vs locked Pro, then **reset flags to false**
4. **Checklist interactivity** — Monday Setup checkboxes are visual (not persisted); acceptable for Phase 1; product may want persisted prep state later
5. **PWA / cache bump** — ensure service-worker / asset `?v=` bump ships with the enablement deploy (`teaching-kit-1f` / QA bump)
6. **No Stripe/billing/auth changes** — confirm release notes do not imply pricing or entitlement changes beyond Teaching Kit surfaces

---

## Production enablement checklist (when you say go)

1. Merge draft PR #436 only after explicit approval  
2. Deploy  
3. Enable `teachingKitViewer: true` (companion UI)  
4. Enable `teachingKitPrintCenter: true` only when Print Center should be live  
5. Leave `teachingKitAttachments: false` until 1G  
6. Smoke: Free starter · Pro week · Trial print watermark · Letter/A4 · mobile Today board  
7. Keep a one-click rollback: set both flags back to `false`

---

## Explicit non-goals still deferred

Reusable activity masters, song/book libraries, quality dashboard, legacy conversion tool, bulk enrichment, Family Hub, server-side PDF generation.
