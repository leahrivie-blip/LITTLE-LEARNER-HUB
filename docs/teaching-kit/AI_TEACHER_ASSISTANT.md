# AI Teacher Assistant

**Status:** Ready for owner review (draft PR)  
**Branch:** `cursor/tk-ai-teacher-assistant-9ad1`  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**) — AI assist also available when `teachingKitAuthoring` is on  
**Critical:** Do **not** merge, deploy, or enable flags until explicit approval.

---

## Goal

Make AI behave like an experienced preschool teacher / curriculum specialist — not only a full-kit text generator.

Admins keep final review and publish control. Everything stays in **draft** until accepted. Published lessons are never overwritten by assistant actions.

---

## Highest-value capability: Reusable Library (#8) + Lesson Connections (#9)

When upgrading many lessons, AI must prefer what Leah already built:

- “We already have Farm Animal Vocabulary — link it.”
- “This song already exists — reuse it.”
- “A similar activity exists — adapt it.”

Toolkit builders call `recommendReusable` and rewrite suggestions as `REUSE: …` when a strong match exists (score ≥ 0.35). Connections scan curriculum resources, songs, books, vocabulary, and similar activities across plans.

Save tips / printables / observations / family notes into `siteContent.teachingKitAssistant.reusableLibrary`. Near-duplicates are blocked.

---

## Capabilities

| # | Feature | Behavior |
| --- | --- | --- |
| 1 | **Make This Better** | Per-section transforms (Improve, Shorten, Expand, play-based, easier/harder, younger/older, STEM/sensory/literacy/math/motor/outdoor/messy/loose parts/process art). Not a full regenerate. |
| 2 | **Teacher Chat** | In-lesson chat (“no pom poms”, “10 minutes”, age changes, extensions). Draft suggestions until accept. |
| 3 | **Toolkit builders** | One-click: vocab cards, parent note, family activity, bulletin board, setup, small group, circle script, observations, documentation, assessment. Prefers reusable library. |
| 4 | **Example images** | Draft SVG preview + brief for finished craft / setup / invitation / sensory bin / classroom. **Approval required** before publish. |
| 5 | **Printable packs** | Matching, memory, letter, number, pattern, cutting, tracing, posters, labels, signs — editable draft cards. |
| 6 | **Quality Review** | Pre-publish readiness score (materials, repeats, domains, indoor/outdoor, obs, vocab, books, songs, printables, family, prep). Guidance only — does not block publish. |
| 7 | **Learn From Me** | Accepted assistant edits update style preference samples. Never mutates old lessons. |
| 8 | **Reusable Library** | Save + recommend before inventing. |
| 9 | **Lesson Connections** | Detect existing printables / activities / vocab / songs / books. |

---

## API

`POST /api/admin/curriculum/ai-teacher-assistant`

Actions: `make_better`, `teacher_chat`, `toolkit_builder`, `printable_pack`, `example_image`, `quality_review`, `save_reusable`, `recommend_reusable`, `connections`, `learn_from_me`.

Requires admin token + Enrichment Editor or Authoring flag. Returns `autoPublished: false`. Does not write lesson enrichment drafts itself (except persisting assistant library / style prefs on `siteContent.teachingKitAssistant`).

---

## UI

Enrichment Editor panel tabs:

1. Make This Better  
2. Teacher Chat  
3. Toolkit Builders  
4. Reusable Library  
5. Example Images  
6. Quality Review  

Suggestions open the existing side-by-side AI tray. Accept applies to draft only; Learn From Me runs best-effort after accept.

---

## Tests

```bash
npm run test:teaching-kit-ai-teacher-assistant
```

Unit + API + Playwright screenshots. Suite enables Enrichment Editor only for the test run, then resets flags to `false`.

---

## Guarantees

- Feature flags default **false**
- No merge / no deploy in this phase
- No auto-publish
- No overwrite of published lessons from assistant actions
- Reusable library grows only from explicit Save / Learn From Me accepts
