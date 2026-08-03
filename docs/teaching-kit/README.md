# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A **done** — flags + schema passthrough (not merged / not deployed)
- Slice 1B **done — awaiting review** — `mapLessonPlanToTeachingKit` read-model + fixtures
- Teaching Kit flags remain **disabled** (`false`)
- Product design **v4 approved** as the build target
- Slice 1C+ (API / UI / print) **not started**

## Start here

| Deliverable | Path |
| --- | --- |
| Product specification (v4) | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| Clickable companion mockup | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Technical architecture | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Canonical module | `scripts/teaching-kit.js` |
| Mapper (Slice 1B) | `scripts/teaching-kit-mapper.js` |
| Slice 1B tests | `npm run test:teaching-kit-slice-1b` |

### Slice 1B exit criteria

- Maps legacy lesson plans → Teaching Kit view model (sections + companion surfaces)
- Empty sections omitted for providers
- Fixtures: Bugs & Butterflies, enriched mini, empty plan
- Flags stay **false**; no UI, API route, or PDF yet

### Companion surfaces encoded in the mapper

1. Monday Morning Setup (prep time + missing materials)
2. Today’s Classroom (per weekday)
3. Open Everything I Need Today
4. Activity cards (example/setup photo fields, prompts, cleanup, observations)
5. Substitute This Activity (materials-aware)
6. Printables with Used in week
7. Build My Kit activity picker metadata
8. Binder cover + tab metadata

## Hold

No Slice 1C+, merge, deploy, or flag enablement until Slice 1B review is approved.
