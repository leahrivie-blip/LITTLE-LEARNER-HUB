# Day Assistant Pass — Testing Site Only

**Shell:** `20260804-day-assistant`  
**Branch:** `cursor/day-assistant-d3df`  
**Scope:** Testing site only. No merge. No production deployment.

## Goal

Make Little Learner Hub feel like a real assistant that guides providers through the day — not just a place that stores information.

## What shipped

### Morning brief (`buildDayAssistantSnapshot` + `dayAssistantBriefHtml`)
On Home and Teacher Today, providers immediately see today’s personalized brief:

- Children expected today / here now  
- Who is absent / not marked yet  
- Forms needing attention  
- Parent messages needing replies  
- Birthdays (today + next 2 days)  
- Allergies  
- Medications on file (+ logged today count)  
- Ratio warnings when rooms get heavy  
- Today’s lesson plan  
- **Suggested first task**

### Quiet mid-day helpers (ops cards, not pop-ups)
- Meal logged → soft reminder if another checked-in child was skipped  
- Observation added → suggest linking a learning goal  
- Incident saved → parent message draft + attention card  
- Child checked out → remind about unfinished daily report  
- Parent signs a form → matching form reminders clear automatically  
- Missing attendance highlighted before the day ends (afternoon)

### End of day (`dayAssistantEndOfDayHtml`)
Afternoon wrap-up checklist:

- Attendance complete  
- Reports drafted / ready  
- Parent messages  
- Photos shared  
- Forms waiting  
- Tomorrow’s lesson  

Copy aims for “leave feeling organized,” not a software status page.

### Family Hub warmth
Parent-facing language rewritten, e.g.:

- “See what your child enjoyed today.”  
- “New memories from today.”  
- “A form is ready when you have a moment.”  
- “Your child’s teacher shared an update.”

Provider invite copy uses **family invite link** / **See what parents see** (not “magic link” / tester phrasing).

### Testing language removed from normal users
- Provider Hub guide → “Invite families & staff” (no Testing Pro / View As / testers)  
- Sample household seed → Admin only  
- Practice-account invite nested & renamed  
- Business tiles no longer say “Testing helpers” / “testing placeholder”  
- Admin Testing Center remains the only place for View As, seed helpers, Testing Pro, QA tools  

### Dashboard intelligence
- Attention sections titled **What deserves attention today**  
- Empty attention → useful all-clear guidance (not empty cards)  
- Pulse cards prioritize real signals (forms, messages, allergies, meal gaps)

## Role audit (Owner / Director / Teacher / Assistant / Parent)

| Role | Landing | Understands what to do? | Notes |
|------|---------|-------------------------|-------|
| Owner | Home | Yes — brief + first task + attention | Strongest assistant surface |
| Director | Home | Yes — same Home assistant | Business hub for staff/enrollment |
| Teacher | Today | Yes — brief + care-day actions | Needs View As / real teacher account to land on Today in audit harness without Admin unlock |
| Assistant | Today (intended) | Yes when on Today | Same preview-role friction as Teacher in automated View As without Admin |
| Parent | Family Hub | Yes — warm Today story | Invite/session errors now say “family invite link” |

## Remaining friction (documented, not mocked)

1. **View As / role preview** still requires Admin unlock — without it, Teacher/Assistant may still land on Owner Home in automated audits.  
2. **Medication due times** are awareness-only (notes on file + logged today) — no full dose scheduler yet.  
3. **Email/SMS delivery** for invites still copy-link based.  
4. **Legal e-sign certificates** still testing acknowledgment.  
5. **Batch end-of-day for all children** is a checklist + per-child drafts, not one-click close-all.  
6. **Parent unread message counts** depend on ops/bell data; sparse when messaging backend is quiet.  
7. **Ratio warnings** use simple thresholds — not state-specific licensed ratios.

## Acceptance

`npm run test:day-assistant`  
Artifacts: `/opt/cursor/artifacts/day-assistant/`

Also green: `test:smart-automation`, `test:ux-polish-complete`, `test:nav-role-experience`, `test:provider-day-walkthrough`.

## Updated readiness score

**90 / 100** testing-site “real assistant” readiness  

(+4 from provider-day walkthrough 86) — morning brief + quiet helpers + EOD wrap + FH warmth + tester chrome removed. Remaining points held back by delivery/e-sign/medication scheduler/batch EOD.

## Top improvements still worth building

1. State-aware classroom ratio rules  
2. True medication schedule with due reminders  
3. One-tap end-of-day batch for all checked-out children  
4. Real email delivery for family invite links  
5. Teacher/Assistant landing without requiring Admin View As in every session  
6. Richer parent unread/reply queue on Families  
7. Photo share prompt after checkout when none shared  
8. Tomorrow lesson prep from today’s assigned plan  
9. Allergy alert on meal log for that child  
10. Director digest of incidents + forms at 4pm  

**Do not merge. Do not deploy production.**
