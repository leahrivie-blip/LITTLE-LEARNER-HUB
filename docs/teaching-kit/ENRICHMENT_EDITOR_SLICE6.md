# Teaching Kit Enrichment Editor — Slice 6

**Status:** Owner-approved (Slice 7 QA in progress; flag remains off)  
**Flag:** `featureFlags.teachingKitEnrichmentEditor` (**default `false`**)  
**Depends on:** Slice 1–5 (approved)  
**Scope:** AI-assisted enrichment suggestions with mandatory approval tray  

---

## What Slice 6 delivers

| Area | Behavior |
| --- | --- |
| **Suggest with AI** | Activity + Week entry points open an approval tray |
| **No auto-save** | Accepting/inserting suggestions only updates the in-memory draft |
| **No overwrite** | Suggestions append / union — existing tips, family text, tags stay |
| **Approval tray** | Per suggestion: field label, current value, proposed text, Accept / Edit / Discard + multi-select Insert |
| **Allowed fields** | Teacher tips · observation prompts · vocabulary · substitutions · indoor/outdoor adaptations · group ideas · setting tags · family connection · milestone language |
| **Never** | Publish · create/upload images · change other lessons · modify linked activities outside this lesson |
| **Failure safety** | Timeout / malformed / error → empty suggestions, curriculum untouched |
| **Logging** | Suggest + insert events log requestId, planId, activityKey, fields, counts — no child/PII payloads |
| **UX states** | Loading · retry · error/timeout · cancel |

## Explicitly out of Slice 6

- Print integration  
- Enabling the feature flag in production  
- Auto-publish or bulk AI across lessons  

---

## API

### `POST /api/admin/curriculum/enrichment-ai-suggest`

Admin token + enrichment editor flag required.  
**Never writes curriculum.** Returns suggestion objects for the tray.

Body highlights: `planId`, `activityKey`, `scope` (`activity`|`week`), optional `simulate` (`timeout`|`malformed`|`error`) for tests.

### `POST /api/admin/curriculum/enrichment-ai-insert-log`

Log-only audit of insertion actions (`autoSaved: false`, `autoPublished: false`).

Local/test runs use deterministic fixture suggestions (`NODE_ENV=test` or `LLH_ENRICHMENT_AI_FIXTURE=1`) so OpenAI is not required.

---

## Real-lesson demo

Farm Animals (`cur-lp-preschool-farm-animals`) — Discovery Basket AI tray.

Screenshots from `npm run test:teaching-kit-enrichment-slice-6`:

| File | Viewport |
| --- | --- |
| `tk-enrich-slice6-ai-tray-desktop-farm-animals.png` | Desktop approval tray |
| `tk-enrich-slice6-ai-tray-tablet-farm-animals.png` | Tablet |
| `tk-enrich-slice6-ai-tray-mobile-farm-animals.png` | Mobile |

---

## Tests

```bash
npm run test:teaching-kit-enrichment-slice-6
npm run test:teaching-kit-enrichment-slice-5
npm run test:teaching-kit-enrichment-slice-1
npm run check
```

Slice 6 asserts:

- Valid suggestion generation  
- Partial approval / edit-before-insert / discard  
- Timeout + malformed output leave content untouched  
- Duplicate request short-circuit  
- No overwrite of existing tips  
- No automatic save / publish  
- No unrelated lesson changes  
- Free / Trial / Pro access unchanged  
- Desktop / tablet / mobile tray layout  

---

## Files changed

| Path | Change |
| --- | --- |
| `server/enrichment-ai.js` | **New** — parse/fixture/apply/log helpers |
| `server/index.js` | Suggest + insert-log admin routes |
| `scripts/teaching-kit-enrichment-editor.js` | `aiSuggest: true`; approval tray UX |
| `styles.css` | Tray layout |
| `scripts/test-teaching-kit-enrichment-slice-6.js` | **New** suite |
| `scripts/test-teaching-kit-enrichment-slice-1.js` … `5.js` | Expect `aiSuggest: true` |
| `package.json` / `index.html` / docs | Scripts, cache bust, slice docs |

---

## Approval gate

Owner approved Slice 6. Slice 7 (integration polish + QA) proceeds next. Do **not** merge, deploy, or enable flags without separate approval.
