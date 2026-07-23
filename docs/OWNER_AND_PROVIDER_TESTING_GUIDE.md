# Owner and Provider Testing Guide — Little Learner Hub (Testing Site)

**Who this is for:** Leah (the owner) and any childcare-provider tester trying the testing site before real families and staff ever touch it.

**In plain language:** Everything on the testing site is pretend. Pretend children, pretend parents, pretend money, pretend messages. Nothing here ever reaches a real family, a real bank account, or a real inbox. You cannot break the real (production) site from here, and nothing you type here will accidentally email or text a real person.

---

## 1. Why we're testing this way

Before real providers and families use new features, we build a complete pretend daycare — a pretend home daycare and a pretend childcare center — with pretend staff, pretend children, and pretend parents. You (or a tester) can then click through the whole day exactly like a real provider would, without any risk to a real child's information.

**No real child information should ever be typed into the testing site.** Every name you'll see already has "(Fixture)" or "(Preview)" after it, and every test account's email ends in `@example.invalid` — a domain that can never send or receive real email, on purpose.

## 2. Which fake account to use

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

Every one of these accounts already has a realistic pretend daycare behind it — children, classrooms, schedules, messages, forms, and more — so you can start testing immediately without setting anything up.

## 3. How to sign in as a fake account (one-time password)

Fake accounts don't have a fixed password anyone can look up or guess — this is intentional, so a real person could never accidentally sign in as one.

1. Sign in to the site as the **Platform Admin** (the real owner login).
2. Open **Testing and Preview Lab** (or **Director Center → Family** for guardian-style accounts) from the sidebar.
3. Find the fake account kind you want (see the table above) and choose **Issue Password**.
4. A one-time password appears **once, on screen only**. Copy it now — it is never shown again, never emailed, and never written to any log or report.
5. Sign out of the Admin account, then sign in on the normal login screen using the fake account's email (ending in `@example.invalid`) and the password you just copied.
6. You will land on the correct home screen automatically: providers and staff land on **Today**; guardians land in **Family Hub**.

**If the password stops working:** issue a new one the same way — this never affects any real account.

## 4. What to test

Try acting out a full day, start to finish, as different roles:

1. Sign in as a **Director or Solo Provider**. Check **Today** — does it show what needs attention?
2. Check who's scheduled to work and which classrooms are set up.
3. Check a pretend child in for the day.
4. Sign in as a **Lead Teacher or Assistant** and use **Classroom Assistant** to record the day in plain language — meals, naps, diapers, activities — the way you'd actually talk, not by filling out forms.
5. Record something a child noticed or was interested in, and see if an activity idea is suggested.
6. Add an activity to today without needing a full lesson plan.
7. Optionally assign a lesson plan for the week.
8. Write a short update for families and submit it — it should **not** go out immediately; a Director has to approve it first.
9. Sign in as the **Director** again and approve the update.
10. Sign in as a **Guardian** and confirm you only see your own pretend child's information — never anyone else's.
11. Try filling out a form as the guardian, then switch back to the provider account and review it.
12. Check a pretend invoice and confirm the guardian can only see her own bill, not another family's.
13. Check a child out at pickup time.
14. Confirm the day's history is still there afterward — nothing pretend disappears.

## 5. What results to expect

- Every screen should load without a blank page, a frozen spinner, or a browser error.
- Every role should land somewhere that makes sense for that role immediately after signing in.
- Guardians should never see staff tools, other families, or center-management screens.
- Assistants and teachers should never see billing, staff management, or director-only tools.
- Nothing should send automatically — messages, approvals, invoices, and publishing all require you to explicitly confirm.
- Phone-sized screens should never require sideways scrolling and should never hide the menu.

If something looks wrong, that's exactly what we want you to notice and report — see below.

## 6. How to report something confusing

If a screen doesn't make sense, or you're not sure what a button does, write down:
- What screen you were on (the page title is enough)
- What you expected to happen
- What actually happened (or didn't happen)

Send this to Leah in whatever way you normally communicate — there is no special reporting tool needed for "this is confusing."

## 7. How to report a bug

If something visibly breaks (a blank page, an error message, a button that does nothing, data that disappears), write down:
- Which fake account you were using
- What screen and what you clicked
- What you expected vs. what happened
- A screenshot, if easy to take

Send this the same way — directly to Leah.

## 8. How to suggest a change

If you think something should work differently (not broken, just could be better), just describe the idea in plain language and send it along. No special format needed.

## 9. How to reset the fake daycare

If the pretend data gets messy from testing (children checked in and out repeatedly, lots of test messages, etc.), an admin can reset it:

1. Sign in as **Platform Admin**.
2. Open **Testing and Preview Lab**.
3. Choose **Reset** for the scenario you want to start over (Home Daycare, Small Center, etc.) and confirm.

This only affects the pretend testing data — it can never touch a real family's information, and it cannot be run at all on the real (production) site.

## 10. How to exit Quick Role Preview

If an admin uses "Quick Role Preview" to temporarily see the site as a Director/Teacher/Assistant/Guardian without actually logging out:

1. Look for the **Exit Preview** control (shown while a preview is active).
2. Select it.

This immediately restores your real, original admin session exactly as it was — it never changes your real account, and it automatically expires on its own after a short time even if you forget to exit manually.

## 11. Why no real child information should be used yet

This testing site exists so that new features can be tried safely, by people who are not real families, using data that could never be mistaken for a real child's private information. Real names, real photos, real medical details, real payment information — none of that belongs here. If you're ever unsure whether something is "real" or "pretend," look for the **"Testing Account — Fake Data Only"** banner, or check that the email ends in `@example.invalid` — if you see either, it's safe pretend data.

---

*This guide covers the testing site only. It does not describe the real, live Little Learner Hub site that real families and providers use.*
