# AI Guide — Complete Audit & Implementation Plan (Testing Only)

**Status:** Planning / draft PR for review — **do not merge or deploy**  
**Branch:** `cursor/ai-guide-plan-1987`  
**Scope:** Testing site only (`AI_GUIDE_ENABLED` + `AI_GUIDE_TESTING_ONLY`). No production data, real families, real children, real billing, or real messages.  
**Owner review gate:** Approve this plan before any coding of the AI Guide product surface.

---

## 0. How to read this plan

This document covers **the full AI Guide system** (Phases 1–3) plus writing-style requirements so everything can be reviewed at once. Implementation still ships in phases for safety and cost control:

| Phase | When |
|-------|------|
| **Phase 1** | Build first after plan approval |
| **Phase 2** | After Phase 1 is reviewed and tested on the testing site |
| **Phase 3** | After Phase 2 is reviewed and tested |

**Hard product rule:** AI never auto-sends, publishes, signs, approves, files, charges, diagnoses, or permanently saves without explicit provider review and action.

---

## 1. Current AI-related features (testing / codebase audit)

### 1.1 What exists today

| Surface | Location | What it does |
|---------|----------|--------------|
| **Documentation Helpers** | `#view-ai` / nav “Documentation Helpers” | Primary AI hub: Observation, Parent Message, Incident, Daily Report, Behavior Note, Lesson Plan, Activity Idea |
| **Generators workspace** | `#view-generators` | Broader `aiTools` form generators (newsletter, handbook, form, etc.) |
| **Local template generators** | `app.js` `generate*` | Offline/local fallbacks when OpenAI unavailable |
| **Home Daycare Hub AI form draft** | `#hdhAiDraftPanel` (testing fence) | Form pack drafts → review → save to child / print; “Send later” → Family Hub invite only |
| **Daily Logs AI assist** | Daily Logs compose | Heuristic + OpenAI assist for notes |
| **Child AI quick entry** | Child profiles | Shortcuts into Documentation Helpers |
| **Admin AI workspace** | Admin: Generate Content, Health, Usage, Safety/Limits, Prompts, Testing | Owner controls |
| **Legal copy** | Terms / Privacy | AI must be reviewed before family/business use |

There is **no** product surface named “AI Guide” today.

### 1.2 Existing AI routes

| Method | Path | Role |
|--------|------|------|
| `POST` | `/api/ai-generate` | Member generate (OpenAI Responses API) |
| `GET` | `/api/user/ai-usage` | Usage for current user |
| `GET`/`POST` | `/api/admin/ai-settings` | Master + per-tool enable/limits |
| `GET`/`POST` | `/api/admin/ai-prompts` (+ restore) | 4-layer prompt editor |
| `GET` | `/api/admin/ai-usage` | Aggregated logs / cost estimate |
| `GET`/`POST` | `/api/admin/ai-health` (+ test) | Connectivity |
| `POST` | `/api/admin/ai-test` | Admin prompt sandbox |
| `POST` | `/api/admin/ai-generate-content` | Marketing/content types |
| `POST` | `/api/admin/generate-lesson-plan` | Compat lesson wrapper |

**Provider:** OpenAI via `https://api.openai.com/v1/responses`  
**Core server functions:** `generateOpenAiContent`, `callOpenAiOnce`, `getToolSystemPromptResolved`, `buildOpenAiUserPrompt`, `canUseServerAi`, `recordServerAiUse`, `aiLimitForPlan`

### 1.3 Tools, prompts, providers, models, limits

**Admin-gated tools (`AI_VALID_TOOLS`):**  
`observation`, `lesson`, `daily`, `parentMessage`, `activity`, `behaviorNote`, `incidentReport`

**Also prompted in code but outside admin gate (examples):**  
`form`, `newsletter`, `handbook`, `contract`, `menu`, `assessment`, `progress`, `portfolio`, `curriculum`, `learningStory`, `schedule`, `classroomSetup`, `emergency`, `substitute`, `grant`

**Prompt layers (admin):** `masterPrompt`, `toolSpecificPrompt`, `writingIntelligence`, `outputFormatting`

**Env vars today:**

| Var | Role |
|-----|------|
| `OPENAI_API_KEY` | Required for live AI |
| `OPENAI_MODEL` | Code default `gpt-4o`; testing Render often `gpt-4o-mini` |
| `ALLOW_OPENAI_TESTING` | CI toggles |

**Limits today (hardcoded):** Free **10**/month, Pro/Founding **250**/month (UTC month key `{email}:{YYYY-MM}`). Over limit → HTTP **429**. Lesson tools also require Pro → **403**.  
**Gap:** Per-tool `generationLimit` is stored in admin UI but **not enforced** on generate. HDH `form` is outside `AI_VALID_TOOLS`.

### 1.4 Store / database keys (existing)

| Key | Purpose |
|-----|---------|
| `aiUsage` | Monthly counters |
| `aiOutputs` | Recent raw outputs (capped) |
| `aiSettings` | `masterEnabled` + per-tool settings |
| `aiPrompts` / `aiPromptVersions` | Prompt overrides + history |
| `aiUsageLogs` | Success/fail logs (tokens, timing) |

Client: `llhAiUsage-*`, `llhAiDebugMode`, `llhGeneratedOutputs`.

### 1.5 Safety language already present

- Terms: review/edit/approve before family use  
- HDH form disclaimer: not state-specific licensing advice  
- Doc Helpers: “you stay in control”  
- Server prompts: don’t invent injuries/diagnoses; leave blanks for missing facts  
- Incident/medication client warnings for fact gaps  

---

## 2. Features that can be reused

1. **`POST /api/ai-generate` pipeline** — auth, OpenAI call, retries, token logging, 429 limits  
2. **Documentation Helpers UX patterns** — generate → edit → copy → save to child  
3. **Admin AI control plane** — master kill switch, prompts, usage, health  
4. **HDH draft review pattern** — edit / regenerate / save / print / never auto-send  
5. **Local template fallbacks** — only as **explicit** “AI unavailable” paths (never silent fabrication)  
6. **Curriculum standards helper** — `scripts/curriculum-standards.js` (never claim standards without verified source)  
7. **Testing fence pattern** — same approach as `HOME_DAYCARE_HUB_TESTING`  

---

## 3. Features that should be replaced or not rebuilt

| Item | Decision |
|------|----------|
| Parallel “AI Guide” with a second OpenAI stack | **Do not** — extend one shared guide shell on top of `/api/ai-generate` |
| Orphan chat UI (`renderChatWindow` / `#aiChatForm` with no DOM) | **Do not revive** unless Phase 3 “Ask About My Program” needs a new designed shell |
| Silent dual local/OpenAI paths | **Replace** with: try AI → clear error OR labeled local template fallback |
| FAQ vs live helper list mismatch | **Fix** as part of AI Guide IA |
| Building new AI store collections from scratch | **Extend** existing `ai*` collections + add guide-specific draft/feedback tables |
| Claiming forms/policies are legally compliant | **Never** — keep draft warnings |

---

## 4. Proposed database schema (testing store / Postgres)

Extend launch store (JSON locally; Postgres in hosted testing). New collections:

### 4.1 `aiGuideDrafts[]`

```text
id, ownerEmail, programId?,
category, featureId,               // e.g. observation | lesson | form
childId?, classroomId?, ageGroup?,
inputSummary,                      // redacted/short; not full secrets
outputText, editedOutputText?,
tone?, length: quick|standard|detailed,
sourceRecordIds: [],               // observations/docs used
status: draft|used|discarded,
generatedByAi: true,
generatedAt, requestedByEmail,
editedAfterGeneration: bool,
regenerateCount: number,
revisionActions: [],               // make_shorter, warmer, ...
reviewAcknowledgedAt?,
usedIn: { type, targetId }?,
feedback?: { rating, comment, at },
deletedAt?
```

### 4.2 `aiGuideFeedback[]` (denormalized optional)

```text
id, draftId, featureId, rating,    // helpful | needs_improvement | incorrect | unsafe | missing_info
comment?, userEmail, createdAt
```

### 4.3 `aiGuideUsage[]` / extend `aiUsageLogs`

```text
featureId, category, userEmail, programId?,
ok, latencyMs, regenerateCount,
inputChars, outputTokens?,
errorCode?, createdAt
// Never store full sensitive prompts when AI_LOG_PROMPT_CONTENT=false
```

### 4.4 `aiGuideSettings` (admin)

```text
masterEnabled, testingOnly: true,
features: { [featureId]: { enabled, dailyLimit?, monthlyLimit? } },
dailyUserLimit, monthlyProgramLimit,
maxInputChars, maxOutputTokens,
modelOverride?, emergencyKillSwitch,
promptTemplateVersion
```

### 4.5 Fake testing seed (no real PII)

`aiGuideDemoFixtures` — infant observation, toddler behavior, preschool learning story, daily report, incident, parent message, one-week lesson, activity, enrollment form, handbook policy, staff announcement. **Synthetic names only.**

---

## 5. Proposed API routes (testing-fenced)

All routes require `AI_GUIDE_ENABLED && AI_GUIDE_TESTING_ONLY` (or equivalent). When off → **404**.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ai-guide/config` | Categories, features enabled, limits remaining, writing defaults |
| `POST` | `/api/ai-guide/generate` | Create draft (category + feature + inputs + length) |
| `POST` | `/api/ai-guide/revise` | Shorter / warmer / more direct / family-friendly / professional / simpler / facts-only / missing-info prompts |
| `GET` | `/api/ai-guide/drafts` | List user’s drafts |
| `GET` | `/api/ai-guide/drafts/:id` | Fetch one |
| `PATCH` | `/api/ai-guide/drafts/:id` | Edit text, acknowledge review, mark used |
| `DELETE` | `/api/ai-guide/drafts/:id` | Soft-delete |
| `POST` | `/api/ai-guide/drafts/:id/feedback` | Helpful / Needs Improvement / … |
| `POST` | `/api/ai-guide/use` | Attach draft into selected area (still no auto-send) |
| `GET` | `/api/admin/ai-guide/overview` | Usage, cost estimate, failures, feedback, flags |
| `GET`/`POST` | `/api/admin/ai-guide/settings` | Kill switch, per-feature enable, limits |
| Phase 3 | `/api/ai-guide/ask` | **Read-only** Q&A over authorized records + citations |

Reuse internally: existing `generateOpenAiContent` with expanded tool/feature IDs and shared writing-style system preamble.

---

## 6. Permission matrix

| Actor | AI Guide Home | Generate | Save draft | Use in form/child | Send/publish | Admin controls | Ask About Program (P3) |
|-------|---------------|----------|------------|-------------------|--------------|----------------|------------------------|
| Logged out | No | No | No | No | No | No | No |
| Free (testing) | Yes (limited features) | Yes (daily/monthly caps) | Yes | Yes (own children) | **Never automatic** | No | Read-only own scope |
| Pro / Founding | Yes | Yes | Yes | Yes | Manual only | No | Read-only own scope |
| Staff (linked) | Per role + classroom | Per capability | Own drafts | Assigned children only | Manual only | No | Assigned scope only |
| Owner / Director | Full program testing | Yes | Yes | Program children | Manual only | No | Program scope |
| Platform Admin | Yes | Yes | Yes | N/A | No | Yes | Yes (testing) |

**Isolation rules:** Never cross program. Never cross classroom without permission. Never expose another family’s children. Never allow chat/commands to mutate billing, enrollment, custody, or pickup permissions.

---

## 7. Screen-by-screen UX plan

### 7.1 Shared AI Guide experience (every generator)

1. **What would you like help creating?** (category → feature)  
2. Short plain-language input (+ example placeholder)  
3. Optional: child, classroom, age group, date, context  
4. Tone / detail **only when relevant**  
5. Length: **Quick / Standard (default) / Detailed**  
6. **Generate Draft**  
7. Draft panel with: Edit · Regenerate · Make Shorter · Add More Detail · Make More Professional · Make More Family-Friendly · Make warmer · Make more direct · Remove educational wording · Use simpler words · Keep only the facts · Add missing-information prompts  
8. **Save as Draft**  
9. **Use in selected form/area** (explicit)  
10. Clear **AI-generated** label  
11. Required review acknowledgement checkbox before final use  
12. Feedback: Helpful / Needs Improvement / Incorrect / Unsafe or Inappropriate / Missing Information  

Banner on every draft:

> **AI-generated draft. Review for accuracy before saving, sharing, signing, or using.**

### 7.2 AI Guide Home

Nav (testing only): **AI Guide** (or Documentation Helpers → AI Guide home).

Categories (one sentence each):

| Category | One-line help |
|----------|----------------|
| Lesson Planning | Draft play-based days and weeks that match your room. |
| Activities | Turn interests and materials into ready-to-run invitations. |
| Observations | Turn rough notes into clear, respectful observation drafts. |
| Daily Reports | Summarize the day from facts you enter — nothing invented. |
| Parent Communication | Warm, clear family messages you review before sending. |
| Incident and Injury Documentation | Organize facts into a careful draft — never assigns blame. |
| Behavior and Support | Objective notes and support ideas — no labels or diagnoses. |
| Child Development | Summaries from observations you select — educational only. |
| Forms | Suggest sections and fields for enrollment and program forms. |
| Policies and Handbooks | Draft policy language labeled for review against your state. |
| Staff and Classroom Communication | Announcements, agendas, and substitute notes. |
| Enrollment and Family Communication | Inquiry, tour, waitlist, and welcome message drafts. |
| Administrative Writing | Short practical admin notes and reminders. |

First screen shows **categories only** — then step-by-step. Large buttons, mobile-friendly, Back/Cancel, progress indicator. No wall of settings.

### 7.3 Feature flows (high level)

- **Lesson Plan:** full week / one day / one section; never blank weekdays; confirm before overwrite; starts as draft  
- **Activity:** title → purpose → materials → setup → steps → teacher role → questions → adaptations → safety → cleanup  
- **Observation:** fact vs interpretation separation; optional developmental connection marked for review  
- **Daily Report:** only entered facts; blanks for missing; multi-child adapt + per-child review  
- **Parent Message:** tone controls; never auto-send  
- **Incident:** missing critical fields highlighted; emergency warning; AI cannot sign/close  
- **Behavior:** ABR-style; no punishment/restraint/diagnosis  
- **Forms:** describe → suggest fields → edit → preview family view → draft → manual publish  
- **Policies:** state selector required for state-related guidance; draft disclaimer always  
- **Phase 3 Ask:** read-only answers with source records listed  

---

## 8. Prompt-template structure (every generator)

### 8.1 Required system preamble (all features)

```text
Write like an experienced childcare professional. Use natural, clear language.
Keep the response practical and concise. Do not use robotic, academic, legal,
or overly formal wording. Do not invent facts. Use only information provided
by the user or approved source records.

Sound like a teacher or director wrote it: warm, professional, specific to
childcare, and short enough to actually use.

Avoid: “It is important to note,” “Furthermore,” “Moreover,” “This comprehensive…,”
“holistic,” “multifaceted,” “exceptional ability,” “facilitate,” “strategically designed,”
long introductions, repeated summaries, exaggerated claims.

Length mode:
- Quick: 1–3 sentences
- Standard (default): one short useful paragraph or a concise form section
- Detailed: only when the user asks for more

If required facts are missing: do not guess. Return a partial draft and list
short missing-information prompts (e.g. “What time did this happen?”).
```

### 8.2 Phase 1 feature templates (summary)

| Feature ID | Extra rules |
|------------|-------------|
| `lesson` | Play-based LLH structure; no blank days; no worksheet-first; no unsafe infant/sensory/sleep/water; no unverified standards claims; supervision called out |
| `activity` | Practical setup/steps; short teacher role; safety + cleanup; age-appropriate categories |
| `observation` | Facts vs interpretation; no diagnosis/labels; optional family-facing vs teacher-only |
| `parentMessage` | Tone controls; no threats; no legal admissions; no invented policy |
| `incidentReport` | Facts only; no “child is fine”; no blame; emergency procedure warning; list missing fields |
| `form` | Suggest sections/fields; never claim legal/licensing compliance; no unnecessary SSN/financial asks |

### 8.3 Phase 2 templates (planned)

`daily`, `behaviorNote`, `developmentSummary`, `policyHandbook`, `enrollmentMessage`, `staffMessage`, saved prompt templates, source-record selection.

### 8.4 Phase 3

`askProgram` — retrieval over authorized records only; cite sources; refuse mutations.

### 8.5 Canonical good/bad examples (must live in prompts + QA)

**Observation — good:**  
“During block play, Maya worked carefully to build a tower. When the blocks fell, she tried again several times and successfully stacked five blocks. She showed persistence, focus, and growing problem-solving skills.”

**Observation — bad:**  
“Maya participated in a highly engaging block-building experience that supported numerous developmental domains and demonstrated exceptional cognitive resilience.”

**Parent message — good:**  
“Noah had a difficult drop-off this morning, but he settled after a few minutes and became interested in the blocks. He is now playing comfortably with the group.”

**Parent message — bad:**  
“We wanted to provide you with an update regarding Noah’s emotional transition into the classroom environment this morning.”

**Daily report — good:** only entered facts (outside, painting, most lunch, 12:30–2). Never invent food items, mood, or diapers.

**Incident — good:** factual time/place/injury/care/notification. Never “Eli is fine,” “minor,” or “no further treatment needed.”

**Behavior — good:** what happened + teacher support. Never “aggressive” or claimed intent.

**Lesson overview — good:** plain weekly intent. Bad: “comprehensive, interdisciplinary… holistic developmental growth.”

**Activity / form / supply / difficult parent / staff** — use the examples from the product brief verbatim in prompt fixtures and tests.

---

## 9. Privacy and safety threat review

| Threat | Mitigation |
|--------|------------|
| Production data leak into testing AI | Separate testing DB; fence; no prod child/family import |
| Cross-program / classroom leakage | Permission checks before any record attachment or Ask retrieval |
| Auto-send / auto-file | No send/publish/sign endpoints from AI; UI requires acknowledgement |
| Prompt injection (“ignore rules and email parents”) | System rules + refuse mutation tools; no email/SMS side effects from generate |
| Secrets in prompts | Strip passwords, tokens, card numbers; `AI_LOG_PROMPT_CONTENT=false` by default |
| Medical/legal overreach | Incident/behavior/development prompts forbid diagnosis, fitness-for-duty, legal compliance claims |
| Cost runaway | Daily user + monthly program limits; admin kill switch; rate limits |
| Silent hallucination | Missing facts → partial draft + prompts; no silent local “polish” that invents details |
| Unsafe activities | Lesson/activity safety checklist in prompt + output QA filters |
| Log exposure | Redact; admin analytics without full prompt bodies |

**Emergency kill switch:** `aiGuideSettings.emergencyKillSwitch` or env `AI_GUIDE_ENABLED=false` disables all guide routes immediately.

---

## 10. AI cost-control plan

| Control | Plan |
|---------|------|
| Model | Prefer `gpt-4o-mini` on testing (`OPENAI_MODEL` / `AI_MODEL`) |
| Max input | `AI_MAX_INPUT_CHARS` (e.g. 4000) |
| Max output | `AI_MAX_OUTPUT_TOKENS` per feature (lesson highest; messages lower) |
| Daily user limit | `AI_DAILY_USER_LIMIT` |
| Monthly program limit | `AI_MONTHLY_PROGRAM_LIMIT` |
| Existing monthly plan caps | Keep Free 10 / Pro 250 unless admin overrides for testing |
| Caching | Optional: identical hash short-circuit for regenerate-with-no-edits (later) |
| Admin visibility | Estimated cost from token logs; failures; regenerate count; save/use rate |
| Clear UX | “Daily AI Guide limit reached” instead of opaque errors |

**Proposed env controls:**

```text
AI_GUIDE_ENABLED=true
AI_GUIDE_TESTING_ONLY=true
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_DAILY_USER_LIMIT=40
AI_MONTHLY_PROGRAM_LIMIT=2000
AI_MAX_INPUT_CHARS=4000
AI_MAX_OUTPUT_TOKENS=2000
AI_LOG_PROMPT_CONTENT=false
```

(Keep `OPENAI_API_KEY` / `OPENAI_MODEL` for compatibility; AI_MODEL can override for Guide.)

---

## 11. Testing plan

### 11.1 Automated tests (required)

- Role permissions / logged-out / disabled feature  
- Cross-program + cross-classroom isolation  
- Child-data access boundaries  
- AI unavailable (clear error; no fabricated silent success)  
- Rate-limit / daily limit reached  
- Unsafe prompt refusal  
- Missing required facts → partial draft + prompts  
- Hallucination safeguards / invented-fact checks  
- Draft-only behavior  
- No automatic sending / publishing / form approval / incident filing  
- Prompt/log redaction  
- Mobile layout smoke  
- Regenerate + edit flow  
- Feedback submission  
- Usage + cost accounting  
- Lesson-plan completeness (no blank weekdays)  
- Objective observation wording  
- Incident missing-fields warning  
- Form legal-draft warning  
- **Writing-style reject list** (`It is important to note`, `Furthermore`, `Moreover`, `This comprehensive activity`, `holistic development`, `multifaceted`, `exceptional ability`, `facilitate`, `strategically designed`)  
- **Output-length tests** (Quick / Standard / Detailed bounds)  
- Good/bad fixture comparisons for observation, parent message, incident, behavior  

### 11.2 Manual testing script (testing site)

1. Open AI Guide home → categories only  
2. Observation from rough note → review → save draft → use on child  
3. Parent message → confirm no send button without explicit Messages flow  
4. Incident with missing time → see prompts, not polished fake completeness  
5. Lesson week → all days present; overwrite confirm  
6. Form draft → legal disclaimer visible  
7. Hit daily limit → clear message  
8. Kill switch in Admin → Guide 404/disabled  
9. Staff helper cannot see other classroom children in selectors  
10. Feedback buttons write to admin overview  

### 11.3 Fake fixtures

Seed synthetic examples listed in §4.5 — never real PII.

---

## 12. Exact files expected to change (implementation later)

| Area | Files |
|------|-------|
| Plan (this PR) | `docs/AI_GUIDE_PLAN.md` |
| Client shell | `app.js`, `index.html`, `styles.css` (AI Guide nav + home + shared draft chrome) |
| Server | `server/index.js` (routes, settings, fences, prompt preamble); possibly `server/ai-guide.js` if extracted |
| Admin | `admin-workspace.js`, admin mounts in `index.html` |
| Config | `render.yaml` (testing comments only; **no prod enable**), `.env.example` if present |
| Tests | `scripts/test-ai-guide-*.js`, extend `package.json` |
| Fixtures | `server/data` seed or in-code demo fixtures |
| SW / shell version | `index.html`, `service-worker.js`, `llh-shell-manifest.json` when UI ships |

**Out of scope for this planning PR:** production Render env, real Twilio/email, live handbook publish, Stripe.

---

## 13. Phase implementation order

### Phase 1 — Shared shell + core generators (build first)

1. Env fence + `/api/ai-guide/config`  
2. Shared AI Guide shell UI + home categories  
3. Draft store + generate/revise/save/feedback APIs  
4. Writing-style preamble + length modes + revision buttons  
5. Generators: **lesson**, **activity**, **observation**, **parentMessage**, **incident**, **form**  
6. Review acknowledgement + AI label + no auto-send/publish  
7. Testing limits + admin kill switch / usage overview  
8. Feedback tools  
9. Safety/permissions foundation + tests + fixtures  

### Phase 2 — After Phase 1 review on testing

1. Daily reports  
2. Developmental summaries (selected observations only)  
3. Behavior support drafts  
4. Policy/handbook drafts (state selector + draft disclaimer)  
5. Enrollment communications  
6. Staff communications  
7. Saved prompt templates  
8. Source-record selection UI  

### Phase 3 — After Phase 2 review

1. Read-only **Ask About My Program**  
2. Cross-record summaries with citations  
3. Missing-form / documentation insights  
4. Personalized suggestions from authorized records only  
5. Still **no** mutations from chat  

---

## 14. Admin controls (testing Admin → AI Guide)

- Master enable/disable + emergency kill switch  
- Enable by feature  
- Testing-only status badge  
- Usage totals, estimated cost, failures  
- Feedback + flagged unsafe  
- Per-feature limits  
- Prompt-template version  
- Model configuration display (**never show API keys**)  

---

## 15. Writing-style requirements (applies to every feature)

### 15.1 Voice

Clear, warm, professional, natural, practical, childcare-specific, short enough to use.

### 15.2 Avoid

Robotic wording, long intros, jargon, repetition, generic AI phrases, exaggerated claims, unnecessary headings, overly formal tone.

### 15.3 Prefer

“Today we noticed…”, “The children explored…”, “She showed interest in…”, “Please send…”, “We wanted to let you know…”

### 15.4 Length default

**Standard.** Quick = 1–3 sentences. Detailed only on request.

### 15.5 Missing information

Never guess. Show short prompts. Partial drafts for incidents when critical fields missing.

### 15.6 Revision buttons (shared)

Make shorter · warmer · more direct · family-friendly · more professional (clarity only, not longer/robotic) · Remove educational wording · Use simpler words · Keep only the facts · Add missing-information prompts  

---

## 16. Human review rule (non-negotiable)

AI must **never** automatically: send, publish, sign, approve, charge, diagnose, report to licensing, contact emergency services, change enrollment, change custody/pickup, modify billing, or delete records.

Explicit provider action required before: save to child, add to lesson, publish form, send message, file incident, share with family, add policy language, update program records.

---

## 17. Relationship to Home Daycare Hub AI drafts

HDH Step C form drafts stay behind `HOME_DAYCARE_HUB_TESTING`. Phase 1 AI Guide **Forms** category should share the same draft/review chrome and writing preamble so providers get one mental model. Do not create a third conflicting form-AI UI.

---

## 18. Deliverables checklist (this planning PR)

| # | Deliverable | Section |
|---|-------------|---------|
| 1 | Current AI features | §1 |
| 2 | Routes, prompts, providers, models, limits, env | §1.2–1.3 |
| 3 | Reuse | §2 |
| 4 | Replace | §3 |
| 5 | Schema | §4 |
| 6 | API routes | §5 |
| 7 | Permission matrix | §6 |
| 8 | Screen UX | §7 |
| 9 | Prompt templates (Phase 1 + later) | §8 |
| 10 | Privacy/safety | §9 |
| 11 | Cost control | §10 |
| 12 | Testing plan | §11 |
| 13 | Files to change | §12 |
| 14 | Phase order (all phases planned) | §13 |
| + | Writing style + examples + quality tests | §8.5, §15, §11.1 |
| + | Admin controls | §14 |

---

## 19. Explicit non-goals for this PR

- No application code for AI Guide UI/API yet  
- No merge to `main`  
- No Render deploy  
- No production env changes  
- No real family/child/billing/message connections  

**Next step after owner approval:** open an implementation PR for **Phase 1 only**, still testing-fenced, with the tests in §11.1.
