# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A **done** — flags + schema passthrough
- Slice 1B **done** — `mapLessonPlanToTeachingKit` read-model
- Slice 1C **done — awaiting review** — flagged `GET …/teaching-kit` API
- Teaching Kit flags remain **disabled** (`false`) by default
- Product design **v4 approved** as the build target
- Slice 1D (binder UI) **not started**

## Start here

| Deliverable | Path |
| --- | --- |
| Product specification (v4) | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| Clickable companion mockup | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Technical architecture | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Canonical module | `scripts/teaching-kit.js` |
| Mapper (Slice 1B) | `scripts/teaching-kit-mapper.js` |
| API (Slice 1C) | `GET /api/curriculum/lesson-plans/:id/teaching-kit` |
| Tests | `npm run test:teaching-kit-slice-1a` · `1b` · `1c` |

### Slice 1C exit criteria

- Flagged API returns mapped Teaching Kit view model
- Flag off → 404 (`teaching_kit_disabled`)
- Auth parity with lesson-plan detail (Pro/Trial/free-starter vs locked preview)
- Public `/api/site-content` unchanged (no `featureFlags`, no kit payloads)
- Flags reset/disabled after tests; no production enablement

### Optional query params

- `day=monday|tuesday|…`
- `readyMaterials=paint,paper` (comma-separated)

## Hold

No Slice 1D, merge, deploy, or flag enablement until Slice 1C review is approved.
