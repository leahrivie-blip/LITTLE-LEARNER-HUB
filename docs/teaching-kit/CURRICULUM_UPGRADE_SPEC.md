# Automated Curriculum-Upgrade Specification (Proposed)

**Status:** Proposal for owner review — **not implemented in this pass**  
**Model lesson:** Preschool Farm Animals (`cur-lp-preschool-farm-animals`) — structure and quality bar only; **never copy Farm Animals text into other lessons**  
**Companion audit:** [FARM_ANIMALS_GOLD_STANDARD_AUDIT.md](./FARM_ANIMALS_GOLD_STANDARD_AUDIT.md)  
**Safety companions:** [UPGRADE_SAFETY.md](./UPGRADE_SAFETY.md), [CURRICULUM_PRODUCTION.md](./CURRICULUM_PRODUCTION.md), [ARCHITECTURE_FREEZE.md](./ARCHITECTURE_FREEZE.md)

---

## 1. Purpose

Define a safe, repeatable system that upgrades every Little Learner Hub lesson into a premium Complete Teaching Kit that a childcare provider would willingly pay for — without redesigning Teaching Kit software, without auto-publishing, and without generic AI lesson spam.

This specification covers:

1. Access control and production safety  
2. Phased rollout (gold standard → 2-lesson pilot → batches of ≤10)  
3. Per-lesson upgrade algorithm  
4. Research and originality rules  
5. Content schemas (week, day, activity, book, song, printable, image, toolkit)  
6. Scoring model (four separate scores)  
7. Validation checklist / publish gates  
8. Admin evidence (baselines, research notes, verification)

---

## 2. Non-goals

- Teaching Kit viewer/print software redesign  
- Feature-flag enablement or production deploy (requires separate owner approval)  
- Bulk publish or any automatic publish  
- Overwriting published lesson bodies on failed save  
- Deleting legacy content  
- Touching children, users, programs, subscriptions, billing, Family Hub, messages, daily logs, forms, calendars, or unrelated data  
- Copying Pinterest/blog/product wording, images, printables, or songs  

---

## 3. Access control

| Rule | Requirement |
| --- | --- |
| Operator | Only `leahivie@icloud.com` may run or approve the curriculum-upgrade process |
| Surfaces | Owner/admin curriculum workflow only |
| Hidden from | Customers, testers, teachers, directors, other admins |
| AI actions | Suggest → human review → insert into **enrichment draft** only |
| Publish | Manual, one lesson at a time, owner-confirmed |

Implementation note (when built): gate upgrade runner + research note APIs + batch console on exact owner email match; default all related flags `false`.

---

## 4. Phased rollout (hard gates)

```
Phase 0  Inspect Farm Animals (this audit)          ✅ requested
Phase 1  Manually complete Farm Animals gold kit    ⏳ owner
Phase 2  Owner approves Farm Animals as gold bar    ⏳ owner
Phase 3  Pilot drafts: All About Me + Colors        ⏳ after Phase 2
Phase 4  Owner reviews pilot; request changes       ⏳ owner
Phase 5  Batches of ≤10, one lesson at a time       ⏳ after Phase 4
```

**Stop conditions:**

- Do not begin Phase 3 until Phase 2 approval is explicit in conversation.  
- Do not begin Phase 5 until Phase 4 approval is explicit.  
- Do not continue to the next lesson if the current lesson loses data, duplicates linked activities incorrectly, overwrites published enrichment, or fails refresh verification.

---

## 5. Per-lesson algorithm (never template-stamp)

For **each** lesson individually:

1. **Capture read-only baseline** (see §6)  
2. **Research theme** (see §7); write private research notes  
3. **Lesson-specific improvement plan** (gaps vs gold-standard structure; no shared activity text)  
4. **Upgrade weekly foundation** (overview, objectives, materials, vocab, family, toolkit shell)  
5. **Upgrade Monday–Friday** (unique daily focus + full daily fields)  
6. **Review every activity** (improve or replace; if N activities exist, address all N — do not silently drop)  
7. **Books + songs** (verified; complete records)  
8. **Printable + image plan** (briefs + required asset list; assets created/uploaded in later owner-approved steps)  
9. **Quality checks** (four scores + checklist §11)  
10. **Save as enrichment draft only**  
11. **Refresh + verify** draft fields survived; published unchanged  
12. **Move to next lesson** only if verification passes  

Forbidden: generate one generic week template and apply it across a batch.

---

## 6. Baseline capture (before edit)

Store an immutable baseline JSON per lesson (admin-only):

- Lesson ID, title, age group, theme, status  
- Current cover  
- Weekly fields  
- Daily fields (all five)  
- Activities (full records + linked Activity Library IDs)  
- Books, songs, resources, printables, images  
- Published enrichment version  
- Existing enrichment draft  
- Version history pointers  
- Linked Activity Library records  

After save, verify:

- Published enrichment byte-equivalent (or explicitly unchanged hash)  
- New work exists only in `enrichmentDraft`  
- No sibling lesson IDs modified  
- Refresh returns the same draft content  

---

## 7. Online research rules

Before upgrading a theme, research current preschool/childcare ideas from Pinterest, teacher blogs, preschool sites, ECE orgs, curriculum resources, library/publisher book info, developmental guidance, seasonal trends, and provider interests.

For each accepted concept, store a **private research note**:

| Field | Required |
| --- | --- |
| General concept | Yes |
| Why it fits the theme | Yes |
| Source URL | Yes |
| Date reviewed | Yes |
| Age group considered | Yes |
| How LLH version differs | Yes |
| Copyright / licensing concern | Yes (or “none noted”) |

Research notes are administrative evidence only — never shown to customers, never embed source images.

Reject concepts that are expensive, unsafe, unrealistic, developmentally weak, overly adult-directed, or hard to clean up — even if they “photograph well.”

---

## 8. Content schemas (gold-standard structure)

Use Farm Animals’ **intended** Teaching Kit organization as the structural model once manually completed. Required sections:

### 8.1 Week

Overview · Weekly Plan · Materials · Learning Objectives · Teacher Preparation · Teacher Notes · Teacher Tips · Vocabulary · Observation/documentation ideas · Small/large group · Indoor/outdoor · Mixed-age · Family connection · Books · Songs · Printables · Example Images · Teacher Toolkit · Easy setup/cleanup · Supply substitutions · Safety & inclusion · Extensions · Milestone documentation prompts

### 8.2 Each weekday

Unique daily focus · Meaningful daily objectives · Domains · Day-specific materials (not a copy of the weekly paragraph) · Daily vocabulary · Daily preparation · Circle/discussion invitation · Indoor · Outdoor · Small-group · Large-group · Observation focus · Adaptations · Safety · Family connection · One appropriately placed book · One appropriately placed song · Activities that support that day’s focus

**Default progression** (override when the theme needs better):

- Mon: introduce, notice, explore, vocabulary  
- Tue: investigate, sort, compare, construct, experiment  
- Wed: people, jobs, stories, real life  
- Thu: deepen via counting, care, creativity, problem-solving  
- Fri: synthesize, design, tell, perform, reflect, share  

### 8.3 Each activity

Original title · Specific observable objective · Short description · Exact inexpensive materials · Realistic prep time · Setup · Numbered directions · Teacher role · Questions/language · Domains (honest tags only) · Vocabulary · Observation opportunities · Documentation prompt · Support / challenge / mixed-age adaptations · Indoor alternative · Outdoor extension when appropriate · Substitutions · Safety · Cleanup · Setup image brief · Play/example image brief · Printable links when genuinely used  

Balanced week mix: low-prep + 5–10 min prep + 1–2 deeper centers; reusable multi-day options; independent + teacher-led; active + quiet; creative + collaborative. Not all paper crafts / worksheets / sensory bins / songs / circle talks.

### 8.4 Books

Verified title + author · Weekday placement · Why it supports that day · Vocabulary connection · Before question · 2–3 during prompts · After question · Simple extension · Substitute if unavailable  

### 8.5 Songs

Title · Weekday placement · Teaching purpose · Motions · How to introduce · How to adapt · Rights status (`original` | `traditional_public_domain` | `copyrighted_title_only`) · Lyrics **only** when legally allowed · Printable song sheet when permitted  

### 8.6 Printables & images

Printables must be real downloadable US Letter files (original LLH), print-tested, ink-conscious, accessible — not placeholders.  
Images must be uploaded and linked; briefs alone never clear image gates.

### 8.7 Age-group rules

Enforce infant / toddler / preschool / mixed-age rules from the owner curriculum brief (responsive caregiving for infants; short attention + mouthing safety for toddlers; play-based inquiry for preschool; explicit mixed-age supervision guidance — never “adapt for younger children”).

---

## 9. Scoring model (four separate scores)

Never award a high score because fields merely contain text. Separate:

| Score | Meaning | Publish use |
| --- | --- | --- |
| **Structural completion** | Required fields present with non-placeholder substance | Dashboard progress |
| **Curriculum quality** | Developmental fit, play-based strength, progression, originality, realism | Specialist review |
| **Premium readiness** | Real images, linked printables, complete books/songs, toolkit depth | Subscription-bar feel |
| **Publication readiness** | All hard blockers clear + owner approval | Only gate that allows Publish |

Existing helpers in `teaching-kit-enrichment.js` already separate structural vs premium percentages; extend with an explicit **curriculum quality** report (Quality Review module) and a **publication readiness** blocker list.

Suggested initial thresholds (tunable after Farm Animals approval):

| Score | Needs work | Reviewable | Gold-bar candidate |
| --- | --- | --- | --- |
| Structural | &lt; 70 | 70–89 | ≥ 90 |
| Curriculum quality | &lt; 75 | 75–89 | ≥ 90 |
| Premium | &lt; 80 | 80–89 | ≥ 90 |
| Publication | any blocker | warnings only | no blockers + owner confirm |

Farm Animals fixture today (reference): Structural **37**, Curriculum quality **~42** (manual), Premium **25**, Publication **Blocked**.

---

## 10. Duplication control

Before add/replace, compare against:

- Other activities in the same lesson  
- Same age group lessons  
- Other age versions of the same theme  
- Reusable master resources  
- Previously upgraded lessons  

Flag duplicate titles, near-identical directions, repeated sensory bins/crafts/movement games/questions/family blurbs/song lyrics/printable concepts, and theme-word-only swaps. Infant/toddler/preschool siblings may share a theme but must not be the same lesson with different age labels.

---

## 11. Validation checklist (publish blockers)

A lesson stays **blocked from Publish Ready** if any item fails.

### Week / days

- [ ] Weekly overview is specific, play-based, non-generic  
- [ ] Objectives are observable and age-fit (no mastery promises)  
- [ ] Weekly materials affordable + substitutions noted  
- [ ] Teacher Toolkit complete (lesson-specific, not boilerplate)  
- [ ] Each weekday has unique focus + day-specific materials  
- [ ] Each weekday has circle, indoor, outdoor, small-group, large-group, observation, adaptations, safety, family  
- [ ] Daily book + song placement present  
- [ ] No filler phrases (`Theme focus coming soon`, `Encourage creativity`, `Printable Needed`, etc.)  

### Activities

- [ ] Every existing activity improved or explicitly replaced (count preserved unless owner approves removal)  
- [ ] All activity required fields filled (§8.3)  
- [ ] Domains honestly tagged  
- [ ] Adaptations/safety/cleanup are activity-specific  
- [ ] Mix of domains across the week; not one modality spam  
- [ ] No duplicate/near-duplicate activities  

### Books / songs

- [ ] Books verified (real title/author) with full discussion prompts  
- [ ] Songs have rights status + motions/teaching directions  
- [ ] No illegal lyric reproduction  

### Printables / images

- [ ] Linked printables are real files; preview + download + US Letter print OK  
- [ ] Draft resources not visible to published members  
- [ ] Cover uploaded  
- [ ] Setup (+ example where required) images uploaded and linked — briefs alone fail  
- [ ] Alt text + captions present  

### Safety / age

- [ ] No unsafe materials without restrictions  
- [ ] Age rules satisfied (infant/toddler/preschool as applicable)  
- [ ] Mixed-age guidance concrete (baby-safe zone, small-parts separation, staffing)  

### Persistence / isolation

- [ ] Baseline captured before edit  
- [ ] Save wrote enrichment draft only  
- [ ] Refresh preserves draft fields  
- [ ] Published enrichment unchanged  
- [ ] No unrelated records modified  
- [ ] Version history snapshot exists for the draft save  

### Mobile / print

- [ ] No mobile overflow on kit surfaces used for this lesson  
- [ ] Print paths do not clip required binder sections  

---

## 12. Batch workflow (Phase 5 only)

Before each batch (≤10), provide owner:

- Exact titles, age groups  
- Current four scores + blockers  
- Why selected  
- Research plan  
- Estimated new activities / images / printables  

Then process **one lesson at a time** through §5. After each lesson: Quality Review, desktop + mobile screenshots, **stop without publishing**.

---

## 13. Pilot lesson IDs (Phase 3)

| Order | Title | ID |
| --- | --- | --- |
| Gold | Farm Animals | `cur-lp-preschool-farm-animals` |
| Pilot 1 | All About Me | `cur-lp-preschool-all-about-me` |
| Pilot 2 | Colors Everywhere | `cur-lp-preschool-colors-everywhere` |

Do not open pilots until Farm Animals is owner-approved as gold standard.

---

## 14. Implementation sketch (future PR; not this pass)

When owner approves building automation:

1. Owner-only Admin “Curriculum Upgrade Console” (hidden)  
2. Baseline + research-note storage on admin audit collections  
3. Per-lesson runner composing existing modules only (Lesson Teacher, Quality Review, Enrichment draft save) — no new major AI product surface without approval  
4. Checklist evaluator emitting the four scores + blocker list  
5. Hard refusal to call `publish_enrichment` from the runner  
6. Fixture tests on disposable stores only (`test:tk-upgrade-safety` pattern)  

**This document is the spec.** No Farm Animals overwrite, no pilot upgrades, no asset generation in the audit pass.

---

## 15. Owner decision checklist

Please reply with approval or changes on:

1. Does the Farm Animals audit match what you see in Admin?  
2. Accept proposed four-score model + blocker checklist?  
3. Any schema fields to add/remove before Farm Animals manual completion?  
4. Confirm: next agent work is **manual gold-standard completion support for Farm Animals only** (still no All About Me / Colors until you approve)?  
