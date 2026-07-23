# Owner and Provider Testing Guide — Little Learner Hub (Testing Site)

**Who this is for:** Leah (the owner) and any childcare-provider tester trying the testing site before real families and staff ever touch it.

**In plain language:** Everything on the testing site is pretend. Pretend children, pretend parents, pretend money, pretend messages. Nothing here ever reaches a real family, a real bank account, or a real inbox. You cannot break the real (production) site from here, and nothing you type here will accidentally email or text a real person.

---

## 1. Why we're testing this way

Before real providers and families use new features, we build a complete pretend daycare — a pretend home daycare and a pretend childcare center — with pretend staff, pretend children, and pretend parents. You (or a tester) can then click through the whole day exactly like a real provider would, without any risk to a real child's information.

**No real child information should ever be typed into the testing site.** Every name you'll see already has "(Fixture)" or "(Preview)" after it, and every test account's email ends in `@example.invalid` — a domain that can never send or receive real email, on purpose.

**A note for the owner before inviting testers:** the testing site's data only survives server restarts/redeploys if durable storage is set up first — see `docs/TESTING_DEPLOYMENT_RENDER_STEPS.md` Section 0. Without it, everything below still works for a single session, but a restart resets it.

## 2. Get everything ready in one click

1. Sign in to the testing site as the **Platform Admin** (the real owner login).
2. In **Settings → Testing and Advanced Tools** (or the Admin dashboard's feature flags panel), turn on the **Testing Lab** flag. This one toggle only needs to happen once.
3. Open **Testing Lab** from the sidebar.
4. Select **"Get the testing site ready (seed both programs + all logins)."**
5. A table appears with one row per role: the fake email, a fresh one-time password, and which fake program it belongs to. **Copy every password now** — the plain password is shown to you exactly once here and is never shown again, never logged, and never stored anywhere in plain form (only a securely-scrambled version is kept, the same strong method used for every password in this app, so it can be checked at login without ever being readable). This also turns on Director Center, Forms Center, and Family Hub testing preview automatically.

That's it — both fake programs (a solo home daycare and a multi-classroom center) and all 10 role logins are ready.

You can select this again any time (e.g., if you lose the passwords) — it issues fresh passwords each time without duplicating the fake programs.

**A note on the newer "real AI" testing feature (optional, separate from the above):** the one-click setup above does **not** turn on real AI. A separate feature flag called **AI Testing** exists purely for trying out a real OpenAI connection on fake data. It is off by default, and everything else on the testing site works exactly the same with or without it. See Section 8-K and Section 13 below if you want to try it — it needs one more thing (a testing OpenAI key) that only the owner can add.

## 3. Which fake account to use

| If you want to test... | Use this account kind |
|---|---|
| Running a childcare **center** as the owner | Center Owner |
| Running a center day-to-day as the **director** | Director |
| Running your **own home daycare**, solo | Solo Home Daycare Provider |
| Being a **lead teacher** in a classroom | Lead Teacher |
| Being an **assistant** with fewer permissions | Assistant |
| Only wanting **lesson plans and activities**, no center-management tools | Curriculum Only Provider |
| A **parent with more than one child** enrolled | Guardian (multiple children) |
| A parent who is **responsible for paying the bill** | Financially Responsible Guardian |
| A guardian who is **only allowed to pick up**, nothing else | Pickup-Only Guardian |
| A guardian whose access has been **limited or paused** | Restricted/Suspended Guardian |
| Seeing everything, including the internal Testing Lab | Platform Admin |

Every one of these accounts already has a realistic pretend daycare behind it — children, classrooms, schedules, messages, forms, and more.

## 4. Signing in, logging out, and switching roles

- **Sign in:** use a fake account's email (ending in `@example.invalid`) and its one-time password on the normal login screen. You land automatically on the correct home screen — providers/staff land on **Today**, guardians land in **Family Hub**.
- **Log out:** use the normal "Log out" / "Sign out" control. This clears your session and any unsynced device notes for that account.
- **Switch roles:** log out of one fake account, then log back in as a different one. Each fake account is fully separate.
- **If a password stops working:** go back to Testing Lab and select **"Get the testing site ready"** again (or issue a fresh password for that one account) — this never affects any real account.

## 5. How to reset the fake daycare

If the pretend data gets messy from testing (lots of test messages, children checked in/out repeatedly, etc.):

1. Sign in as **Platform Admin**.
2. Open **Testing Lab**.
3. Choose **Reset** for the scenario you want to start over and confirm.

This only ever touches the pretend testing data — it cannot touch a real family's information, and it cannot run at all on the real (production) site.

## 6. How to use Quick Role Preview (and exit it)

Quick Role Preview lets an admin briefly see the site as a Director/Teacher/Assistant/Guardian **without logging out of Admin**:

1. In Testing Lab, open **Role Preview** and choose the role you want to preview.
2. Look around — this shows you what that role would see.
3. To leave: select **Exit Preview** (or **"Return to administrator account"**).

This never changes your real signed-in account, and it automatically expires on its own after about an hour even if you forget to exit.

## 7. What results to expect

- Every screen should load without a blank page, a frozen spinner, or a browser error.
- Every role should land somewhere that makes sense for that role immediately after signing in.
- Guardians should never see staff tools, other families, or center-management screens.
- Assistants and teachers should never see billing, staff management, or director-only tools.
- Nothing should send automatically — messages, approvals, invoices, and publishing all require an explicit confirm step.
- Phone-sized screens should never require sideways scrolling and should never hide the menu.
- A **"💬 Testing Feedback"** button should be visible near the bottom-left corner of every screen, the entire time you're signed in — see Section 14.

## 8. The walkthrough, section by section

Work through these in any order — each is self-contained.

### A. Solo home daycare
Sign in as **Solo Home Daycare Provider**. Check **Today**, look at her children/schedule, try Classroom Assistant for a meal or nap entry, check Settings.

### B. Director / center
Sign in as **Center Owner**, then **Director**. Check **Today**, classrooms, staff, enrollment, records, licensing, reports. Confirm the Director cannot see Billing (owner-only).

### C. Teacher
Sign in as **Lead Teacher**. Confirm she sees only her assigned classroom's children, daily logs, activities, and messages — not staff/billing/enrollment tools.

### D. Assistant
Sign in as **Assistant**. Confirm an even narrower view than the teacher — no director-only tools anywhere in the sidebar, not just hidden behind a click.

### E. Parent / guardian
Sign in as each of the four guardian accounts (multiple children, financially responsible, pickup-only, restricted). Confirm each lands in **Family Hub**, sees only her own child(ren), and the pickup-only/restricted accounts see noticeably less than the full guardian.

### F. Curriculum Only
Sign in as **Curriculum Only Provider**. Confirm she sees Lesson Plans, Activities, Calendar, and her own billing/settings — and nothing center-management-related (no Forms, Staff, Classrooms, Families, Enrollment, Reports).

### G. Forms and documents
As a provider, check Forms & Enrollment. As a guardian, check her form list (an empty list is expected and fine — it just means no form is currently assigned to that fixture). Confirm a submitted form has to be explicitly reviewed by the provider, not auto-approved.

### H. Classroom Assistant
As a Lead Teacher or Assistant, describe a group meal/nap/activity in plain language, including one child's exception (e.g., "everyone had lunch except Timmy, who wasn't hungry"). Confirm it asks for confirmation before saving, and that the group entry plus the individual exception both show up correctly.

### I. Billing simulator
As a Director/Owner, check the billing overview and try generating an invoice simulation. As the financially-responsible guardian, confirm she sees only her own family's invoice — never another family's.

### J. Phone / tablet / computer layouts
Try a few screens (Today, Settings, Classroom Assistant, Director Center) at a phone width (~390px), a tablet width (~768–1024px), and a normal computer width. Look for sideways scrolling, cut-off menus, or buttons hidden behind other elements.

### K. Trying real AI (optional — Classroom Assistant)
This step only does anything if the owner has turned on the **AI Testing** flag and added a testing OpenAI key (see Section 13). If it isn't on yet, everything below simply won't appear, and Classroom Assistant works exactly as described in Section H.

1. Sign in as a **Lead Teacher** or **Assistant** and open **Classroom Assistant**.
2. Describe a note as usual (Section H), but before submitting, check the box labeled **"Try AI interpretation (testing only — the local review is always kept as a fallback)."**
3. Submit the note. You'll see your normal local review **and**, underneath it, an AI interpretation of the same note side by side.
4. Choose **"Use the local review (above)"** or **"Use the AI interpretation instead"** — either one goes through the same confirm step before anything is saved, and one is not "more official" than the other.
5. Rate the AI's attempt — **Helpful**, **Needs changes**, or **Not usable** — with one click. This helps tune the AI over time; it is never required and never blocks you from saving your entry.
6. If the AI is temporarily unavailable, you'll see a plain message saying so and a **"Try AI again"** button — your note is never lost, and the local review is always ready to confirm on its own.

## 9. How to report something confusing

If a screen doesn't make sense, or you're not sure what a button does, write down:
- What screen you were on (the page title is enough)
- What you expected to happen
- What actually happened (or didn't happen)

Send this to Leah in whatever way you normally communicate — no special reporting tool is needed for "this is confusing."

## 10. How to report a bug

If something visibly breaks (a blank page, an error message, a button that does nothing, data that disappears), write down:
- Which fake account you were using
- What screen and what you clicked
- What you expected vs. what happened
- A screenshot, if easy to take

Send this the same way — directly to Leah.

## 11. How to suggest a layout or feature change

If you think something should work differently (not broken, just could be better), just describe the idea in plain language and send it along. No special format needed.

## 12. Why no real child information should be used yet

This testing site exists so that new features can be tried safely, by people who are not real families, using data that could never be mistaken for a real child's private information. Real names, real photos, real medical details, real payment information — none of that belongs here. If you're ever unsure whether something is "real" or "pretend," look for the **"Testing Account — Fake Data Only"** banner, or check that the email ends in `@example.invalid` — if you see either, it's safe pretend data.

## 13. AI Testing and "AI Outcomes" (owner/admin only)

This section is for **Leah (the owner/admin)**, not a regular tester. It covers a newer, separate, optional feature: trying a real OpenAI connection on fake data only, and reviewing how it did.

### Turning it on
1. In an environment variable (only the owner sets this, never a tester), add a real OpenAI key as `OPENAI_API_KEY`, plus `ALLOW_OPENAI_TESTING=true`. This can only ever be set on the **testing** site, never on the real (production) site — the code refuses to use it there even if it were somehow set by mistake.
2. Sign in to the testing site as **Platform Admin** and turn on the **"AI Testing"** feature flag the same way you turned on Testing Lab (Section 2 / Settings → feature flags).
3. That's it — the model, the spending limits, and everything else are already configured; see below.

### What model is used, and how much it can spend
- The model is set once, by the owner, as `OPENAI_MODEL` (defaults to a small, inexpensive model, `gpt-4o-mini`, if not set). No tester can change which model is used for real requests, and the app never overrides or hardcodes a different model than whatever you set here — this has been directly audited and confirmed.
- **Spending/rate controls, on by default, need no setup:**
  - Each tester (fake account) can make at most **5 AI requests per minute**.
  - Each fake organization (all its testers combined) can make at most **20 AI requests per minute**.
  - Each fake organization also has a **200-per-day** limit — a second, independent cap so many small bursts across a whole day still can't add up to a surprise.
  - Past any of these, requests are automatically declined with a clear, specific message (different wording for "you personally" vs. "this organization" vs. "today's limit for this organization") — never a crash, and the tester's entry is never lost (the local review is used instead).
  - There is no way to remove these limits from the testing UI. They start deliberately conservative and can be raised later once real usage is understood.
- Every AI request's token usage and an estimated cost (in fractions of a cent, for a small model) accumulate in a running total, visible at the top of the **AI Outcomes** panel (see below) — this is an estimate for your own awareness, not a bill; check your OpenAI account for the real, authoritative amount.
- A separate **"Usage limits, by organization"** table in the same panel shows, per fake organization, how close it is to its per-minute and per-day limits right now — sanitized counts only, never the actual text of any tester's request or the AI's response.
- If you ever want to stop all real AI calls immediately, turning the **"AI Testing"** flag back off (or removing `OPENAI_API_KEY`) takes effect immediately — nothing else on the testing site is affected, and every AI-assisted screen simply goes back to using only the local, non-AI review it always had.

### Production always refuses AI, guaranteed
The real, live site (`littlelearnershubbyleah.com`) can never make a real AI call, no matter what is set — this is checked the same way as every other testing-only feature (Director Center, Forms Center, Family Hub, Testing Lab), and is covered by an automated test that intentionally tries it and confirms it's blocked every time. If AI Testing is ever accidentally left on and this code somehow reached production, every request would just silently use the same trusted local review it always used — a provider's entry is never lost and no real AI call is ever attempted.

### How to open "AI Outcomes"
1. Sign in as **Platform Admin** on the testing site.
2. Open **Testing Lab** from the sidebar.
3. Click the **"AI Outcomes"** tab in the row of tabs across the top (alongside Home, Health, Release Readiness, etc.).

You'll see: whether AI testing is currently enabled, which model is configured, whether a testing key is present, the running request/cost totals, a list of ready-made fake scenarios you can run, and prompt-version history with the ability to roll back to an earlier version.

### The first 5 scenarios you'll see
The scenario list currently includes 13 realistic, entirely fake situations. The first five are:
1. **Scraped knee on the playground** — a minor first-aid note.
2. **Biting incident** — a same-day incident between two fixture children.
3. **Difficult drop-off** — a hard-morning note that needs a calm, professional parent update.
4. **Child refusing lunch** — a meal note with one child's exception.
5. **Potty accident** — a routine care note.

Click **"Run this scenario"** on any of them to send that exact fake note through both the local review and the real AI side by side, right there in the panel.

### How to rate a result
After running a scenario (or after trying AI directly in Classroom Assistant — Section 8-K), you'll see three one-click buttons: **Helpful**, **Needs changes**, and **Not usable**. Click whichever matches. That's the entire rating flow — there's no form to fill out, and rating is never required before you can move on or save your own entry.

## 14. Sending feedback (for testers)

There is no separate "reporting tool" to learn — a single **"💬 Testing Feedback"** button sits near the bottom-left corner of every screen the entire time you're signed in as any fake account. It replaces (but doesn't require you to stop using) the plain-language reporting described in Sections 9–11.

1. Click **"💬 Testing Feedback"** anywhere, any time.
2. Under **"New Feedback"**, choose the kind of thing you're sharing: **Bug**, **Confusing screen**, **Missing feature**, **Layout problem**, **AI result**, or **Suggestion** (there's also "Other").
3. Type what happened, in plain language — the same way you would in Sections 9–11 (what screen, what you expected, what actually happened).
4. Click **Send feedback**. You do not need to say which screen, which device, or which role you are — that's captured automatically.
5. Click **"My Threads"** any time to see everything you've sent, and Leah's replies. A red dot means there's a reply you haven't seen yet.
6. Open any thread to read the full back-and-forth and reply again — it stays open as a conversation, not a one-time form.
7. If Leah asks you to **retest something**, you'll see a clear "Please retest and reply" banner at the top of that thread.
8. You will only ever see your own threads — never anyone else's, and never Leah's private admin tools.

## 15. Reading and replying to feedback (owner/admin only)

1. Sign in as **Platform Admin** and open **Testing Lab**.
2. Click the **"Testing Feedback"** tab (next to "AI Outcomes").
3. You'll see every tester's thread, across both fake programs — who sent it, what kind of feedback it is, its status, and whether it needs your attention (unread) or a retest.
4. Click **"Open thread"** to read the full conversation and reply — your reply appears in that tester's own "My Threads" immediately, with an unread indicator for her.
5. Use **status** (Open / In progress / Resolved / Closed) to track your own progress — testers can see the status, but replying to a Resolved/Closed thread automatically reopens it for you.
6. Use **"Request a retest"** when you've made a fix and want that specific tester to confirm it — she'll see a clear banner on her end.
7. Use the **private note** box for anything you want to remember about a thread that the tester should never see (e.g., "same root cause as ticket #12, low priority") — private notes are never sent to, or visible to, any tester, ever.
8. Filter by status, category, "unread only," or "retest requested" to triage a busy inbox quickly.

---

*This guide covers the testing site only. It does not describe the real, live Little Learner Hub site that real families and providers use.*
