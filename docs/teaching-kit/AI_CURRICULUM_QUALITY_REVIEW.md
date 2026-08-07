# AI Curriculum Quality Review

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-curriculum-quality-review-9ad1`  
**Flag:** `featureFlags.teachingKitQualityReview` (**default `false`**)  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

Focus on **curriculum quality**, not more generation. Every Teaching Kit should feel like it was reviewed by an experienced curriculum specialist before it can be published.

AI generates a **report** — it does not automatically rewrite or publish.

**Content upgrade policy:** follow [CONTENT_UPGRADE_RULES.md](./CONTENT_UPGRADE_RULES.md). Thorough **Printable Needed** notes and **Image Needed** briefs satisfy content-upgrade media slots. Real printables/images/covers remain **owner media pending** and are not hard blockers when placeholders exist. Never require AI-generated artwork.

---

## Specialist Quality Review

Before publish (when the flag is on), AI evaluates:

- Developmental appropriateness for the age group  
- Learning objective quality  
- Balance across developmental domains  
- Play-based learning, fine/gross motor, sensory, literacy, math, science, art, SEL, dramatic play  
- Outdoor learning + indoor backups  
- Family connections, teacher preparation, observations  
- Vocabulary quality, books, songs, printables, example images  
- Teacher toolkit completeness, activity variety  
- Safety concerns, realistic classroom implementation  
- Duplicate / repetitive activities  

---

## Readiness Report

Each review returns:

- Overall readiness score + label  
- Section-by-section scores  
- Strengths  
- Missing items  
- Suggested improvements  
- Warnings  
- Blocking issues before publish  

---

## Per-issue actions

For every issue:

1. **Improve with AI** — draft suggestion for side-by-side accept (not auto-applied)  
2. **Ignore** — stored on `enrichmentDraft.week.qualityReviewIgnored`  
3. **Edit manually** — closes publish modal and points you to the right editor mode  

Nothing publishes automatically.

---

## Publish gate

When `teachingKitQualityReview` is enabled:

- Opening **Publish…** runs / refreshes the specialist report  
- Confirm is disabled while unresolved **blocking** issues remain  
- Server `publish_enrichment` returns **409** `quality_review_blocked` if blockers remain  

Ignored blockers are respected. Admin remains final publisher.

---

## Library Health Dashboard

Admin Curriculum Lesson Plans host `#adminLibraryHealthHost`:

- Highest / lowest quality lessons  
- Lessons needing review  
- Missing books / songs / printables / example images / toolkit items  
- Duplicate or repetitive resources  
- Most viewed / assigned / downloaded  
- Lessons driving Pro upgrades  
- Searched-but-not-found  

Uses real analytics when available and clearly labels estimated/unavailable data.

---

## API

`POST /api/admin/curriculum/quality-review`

Actions: `library_health`, `review_lesson`, `quality_report`, `decide_issue`, `improve_issue`.

Requires admin token + `teachingKitQualityReview === true`. Always `autoPublished: false` / `autoChanged: false`.

---

## Tests

```bash
npm run test:teaching-kit-quality-review
```

---

## Guarantees

- Feature flags default **false**  
- No merge / no deploy in this phase  
- No auto-publish  
- No automatic content rewrites — only optional draft suggestions  
- Final goal: continuously improve library quality over time  
