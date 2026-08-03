# Teaching Kit Vision Alignment

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-vision-alignment-9ad1`  
**Critical:** Do **not** merge, deploy, or enable feature flags until explicit approval.

---

## Product goal

The goal is **not** to add more fields to lesson plans.

The goal is to transform every lesson into a **complete digital teacher binder** that a childcare provider can use all week without searching Pinterest, Google, YouTube, or Teachers Pay Teachers.

When a provider opens a lesson plan, they should think:

> “Everything I need for this week is already here.”

The experience must feel premium, organized, easy to navigate, and printable.

---

## This slice (what shipped, still flagged off)

| Area | Change |
| --- | --- |
| Provider binder IA | Canonical **8 binder tabs**: Overview · Weekly Plan · Activities · Printables · Songs · Books · Example Images · Teacher Toolkit |
| Mapper | `teacher_toolkit` section content; binder tabs + `providerBinder` companion; empty sections hidden for normal users |
| Viewer | **Binder** surface with cover, sticky section nav, large sections, lazy-loaded images, richer activity fields |
| Curriculum dashboard | Stages: **Legacy · In Progress · Needs Review · Ready · Complete** + gap chips + % |
| AI CTA | Library button renamed **Upgrade Lesson** (still Enrichment Editor–gated; draft → review → approve; never auto-publish) |
| Visual examples | Style guide for classroom-achievable, non-AI-glossy imagery |
| Flags | All Teaching Kit flags remain **default `false`** |

---

## Flag policy (unchanged)

| Flag | Default | This PR |
| --- | --- | --- |
| `teachingKitViewer` | `false` | Unchanged — binder UI only when explicitly on |
| `teachingKitPrintCenter` | `false` | Unchanged |
| `teachingKitAttachments` | `false` | Unchanged |
| `teachingKitEnrichmentEditor` | `false` | **Not enabled** |
| `teachingKitAuthoring` | `false` | **Not enabled** |

---

## Section model (provider binder)

| Tab | Source |
| --- | --- |
| Overview | Weekly overview, theme, age, objectives peek |
| Weekly Plan | Mon–Fri focus + activity counts |
| Activities | Full reusable activity cards |
| Printables | Linked printables / resources |
| Songs | Song list with lyrics/motions when present |
| Books | Book list with read-aloud questions when present |
| Example Images | Setup + finished example gallery (lazy) |
| Teacher Toolkit | Prep checklist, observation focus, notes, teacher preparation |

Empty tabs are **hidden** for normal users (`includeEmptySections` remains admin/preview only).

---

## Companion vs binder

Operational companion surfaces remain: **Start Week · Monday Setup · Today · Build / Print**.  
**Binder** is the digital-teacher-binder reading experience aligned to the eight tabs above. Prep/teach day surfaces are not removed.

---

## Dashboard stages

| Stage | Meaning |
| --- | --- |
| Legacy | Little/no upgrade work |
| In Progress | Upgrade started (draft or partial %) |
| Needs Review | Pending draft / review before treating as ready |
| Ready | Enrichment ≥90%, no pending draft — ready to publish or use |
| Complete | Published + ≥90% + no pending enrichment draft |

Quality band labels (**Legacy / Enriched / Complete**) remain for % bands; dashboard triage prefers **stages**.

---

## Still deferred (known limitations)

| Item | Notes |
| --- | --- |
| Shared activity masters | Activities stay plan-linked; cross-plan reuse library not built |
| PDF on demand only | Print Center still generates when requested (flagged) |
| API payload trimming | Companion payload not yet split into lazy section fetches |
| Production flag enable | Owner must opt in after review |

---

## Data safety

- Legacy lesson bodies preserved (preserve remediation from prior PR).
- Enrichment draft never auto-publishes.
- Publishing remains reversible via enrichment history when Enrichment Editor is used.
- This slice does not overwrite or delete enrichment.

---

## Tests & artifacts

```bash
npm run test:teaching-kit-vision-alignment
npm run check
```

Screenshots from the vision suite land under `/opt/cursor/artifacts/` (desktop, mobile, admin, teacher binder, AI upgrade labeling).

---

## Production readiness (this phase)

| Criterion | Score |
| --- | --- |
| Vision IA reflected in binder tabs | Strong |
| Empty sections hidden | Strong |
| Lazy images in viewer | Strong |
| Dashboard stages + Upgrade Lesson CTA | Strong (flagged) |
| Flags default off | Safe |
| Shared activity masters | Deferred |
| Lazy API section fetches | Deferred |
| Overall readiness for flag enable | **6.5 / 10** — UX alignment ready for review; not ready for production enable |

**Do not merge. Do not deploy. Do not enable flags. Stop for review.**
