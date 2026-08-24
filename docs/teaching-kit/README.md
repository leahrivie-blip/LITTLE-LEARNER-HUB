# Teaching Kit — Product Design & Architecture

**Status**

- Slice 1A–1F **done**
- Phase 1 final QA **complete** — see [PHASE1_QA_READINESS_REPORT.md](./PHASE1_QA_READINESS_REPORT.md)
- **Customer launch enabled (2026-08-07)** — `teachingKitViewer` + `teachingKitPrintCenter` **true** in production; see [CUSTOMER_LAUNCH.md](./CUSTOMER_LAUNCH.md)
- Code defaults remain **fail-closed** (`false`) until the production site-content flags are set
- Slice 1G (attachments) **optional / not started** — keep `teachingKitAttachments` **false**
- **Enrichment Editor Slice 1–7** approved; owner authoring flags may be enabled independently for Upgrade Lesson work
- **Preservation remediation** approved
- **Complete Teaching Kit binder authoring** — see [COMPLETE_TEACHING_KIT_AUTHORING.md](./COMPLETE_TEACHING_KIT_AUTHORING.md)
- **AI Teacher Assistant** — see [AI_TEACHER_ASSISTANT.md](./AI_TEACHER_ASSISTANT.md)
- **AI Curriculum Director** — see [AI_CURRICULUM_DIRECTOR.md](./AI_CURRICULUM_DIRECTOR.md)
- **AI Curriculum Quality Review** — see [AI_CURRICULUM_QUALITY_REVIEW.md](./AI_CURRICULUM_QUALITY_REVIEW.md)
- **Curriculum Production** — see [CURRICULUM_PRODUCTION.md](./CURRICULUM_PRODUCTION.md)
- **Integrated Release Review** — see [INTEGRATED_RELEASE.md](./INTEGRATED_RELEASE.md) (`npm run test:teaching-kit-integrated-release`)
- **Customer enablement record** — [CUSTOMER_LAUNCH.md](./CUSTOMER_LAUNCH.md)

## Start here

| Deliverable | Path |
| --- | --- |
| Product specification (v4) | [GOLD_STANDARD_PRODUCT_SPEC.md](./GOLD_STANDARD_PRODUCT_SPEC.md) |
| **Enrichment Editor UI spec** | [ENRICHMENT_EDITOR_UI_SPEC.md](./ENRICHMENT_EDITOR_UI_SPEC.md) |
| **Enrichment Editor Slice 1** | [ENRICHMENT_EDITOR_SLICE1.md](./ENRICHMENT_EDITOR_SLICE1.md) |
| **Enrichment Editor Slice 2** | [ENRICHMENT_EDITOR_SLICE2.md](./ENRICHMENT_EDITOR_SLICE2.md) |
| **Enrichment Editor Slice 3** | [ENRICHMENT_EDITOR_SLICE3.md](./ENRICHMENT_EDITOR_SLICE3.md) |
| **Enrichment Editor Slice 4** | [ENRICHMENT_EDITOR_SLICE4.md](./ENRICHMENT_EDITOR_SLICE4.md) |
| **Enrichment Editor Slice 5** | [ENRICHMENT_EDITOR_SLICE5.md](./ENRICHMENT_EDITOR_SLICE5.md) |
| **Enrichment Editor Slice 6** | [ENRICHMENT_EDITOR_SLICE6.md](./ENRICHMENT_EDITOR_SLICE6.md) |
| **Enrichment Editor Slice 7** | [ENRICHMENT_EDITOR_SLICE7.md](./ENRICHMENT_EDITOR_SLICE7.md) |
| **Enrichment preservation remediation** | [ENRICHMENT_EDITOR_PRESERVE_REMEDIATION.md](./ENRICHMENT_EDITOR_PRESERVE_REMEDIATION.md) |
| **Complete Teaching Kit authoring** | [COMPLETE_TEACHING_KIT_AUTHORING.md](./COMPLETE_TEACHING_KIT_AUTHORING.md) |
| **AI Teacher Assistant** | [AI_TEACHER_ASSISTANT.md](./AI_TEACHER_ASSISTANT.md) |
| **AI Curriculum Director** | [AI_CURRICULUM_DIRECTOR.md](./AI_CURRICULUM_DIRECTOR.md) |
| **AI Curriculum Quality Review** | [AI_CURRICULUM_QUALITY_REVIEW.md](./AI_CURRICULUM_QUALITY_REVIEW.md) |
| **Curriculum Production** | [CURRICULUM_PRODUCTION.md](./CURRICULUM_PRODUCTION.md) |
| **Integrated Release Review** | [INTEGRATED_RELEASE.md](./INTEGRATED_RELEASE.md) |
| **Phase 1 QA readiness report** | [PHASE1_QA_READINESS_REPORT.md](./PHASE1_QA_READINESS_REPORT.md) |
| **Customer launch record** | [CUSTOMER_LAUNCH.md](./CUSTOMER_LAUNCH.md) |
| Clickable companion mockup | [mockups/gold-standard.html](./mockups/gold-standard.html) |
| Technical architecture | [../TEACHING_KIT_PHASE1_ARCHITECTURE.md](../TEACHING_KIT_PHASE1_ARCHITECTURE.md) |
| Print Center (Slice 1E/1F) | `scripts/teaching-kit-print.js` |
| Viewer UI (Slice 1D/1F) | `scripts/teaching-kit-viewer.js` |
| Tests | `npm run test:teaching-kit-enrichment-preserve` · `test:teaching-kit-enrichment-qa` (slices 1–7 + preserve + curated regressions) |

### Slice 1F exit criteria

- Empty lesson plans do not break the Teaching Kit UI
- Large lesson plans map / render / print quickly
- Print keeps blocks together; footers/page numbers do not collide with content
- Binder supports **US Letter** and **A4**
- Images scale with `object-fit: contain` (not blurry crop / oversized stretch)
- Trial/Pro print authorization gate hardened (flag-off never consumes trial exports)
- Loading hint + smoother panel navigation; flags remain false

### Local preview only (not production)

1. Admin site-content: `teachingKitViewer: true` and `teachingKitPrintCenter: true`
2. Open an unlocked lesson → Build / Print → choose Letter or A4 → Print Teaching Kit binder
3. Also open an empty draft and a large plan to confirm polish
4. Reset both flags to `false`

## Hold

No merge, deploy, or flag enablement until the owner approves the [Phase 1 QA readiness report](./PHASE1_QA_READINESS_REPORT.md).
