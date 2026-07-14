# Pro Lesson Plan Viewer Audit (July 14, 2026)

**Status:** Fixes implemented on branch `cursor/pro-lesson-preview-audit-69b5` — **do not merge until owner visual QA**  
**Related merged work:** PR #181 (duplicate action bar + mobile More menu)

## 1. What users see by account type

| Account | Pro lesson click | Full activities/directions | Notes |
|---------|------------------|----------------------------|-------|
| Logged out | Locked preview modal | No | Rich teaser only |
| Free | Locked preview modal | No | Same |
| Promo validated, checkout not completed | Locked preview modal | No | Promo alone does **not** grant Pro |
| Trial (active/trialing) | Full lesson workspace | Yes (after authorized hydrate) | Server membership required |
| Founding (active) | Full lesson workspace | Yes | Same as Pro access |
| Pro Monthly / Annual | Full lesson workspace | Yes | Same |
| Admin | Full lesson workspace | Yes | Uses in-memory full curriculum |

## 2. Did Pro preview exist?

**Yes, but it was too thin.** Free/logged-out users only saw age, theme, domains, and a short overview — **no activity names or materials**. That matches the user report.

## 3. Promo-code access

**Promo code validation does not unlock Pro content.** Access requires a paid/trialing membership on the account (`accountHasPaidBilling` / server `membershipHasProAccess`).

A free account that only entered a promo code still sees the locked preview. If checkout completed into a trial, they should get full Pro content.

## 4. Issues fixed in this audit branch

1. **Rich locked Pro preview** — overview, objectives, materials, vocabulary, books, songs, daily activity names with 🔒, activity count.
2. **Public Pro DTO** now includes safe teaser fields (`dailyActivityPreview`, materials, etc.) without steps/teacher language.
3. **Pro activity public DTO** now includes `lessonPlanId` so client previews can group activities.
4. **Entitled-user empty workspace** — if Pro hydration fails, show a sync/retry message instead of opening an empty overview-only workspace.
5. Mobile action bar cleanup already shipped in merged PR #181 (single bar + More menu).

## 5. Conversion recommendations

- Keep locked activity **names** visible (done).
- Consider adding “X activities · Y materials” on library cards for Pro plans.
- Clarify checkout promo UI copy: “Promo applies at checkout” vs “You now have Pro.”
- After promo checkout, force subscription sync before opening a Pro lesson.

## 6. Membership content confirmation

Automated matrix covers Free, promo-only, Trial, Founding, Pro Monthly, Pro Annual for `/api/curriculum/lesson-plans/:id` and locked preview rendering (`npm run test:pro-lesson-preview-audit`, `npm run test:curriculum-access-security`).
