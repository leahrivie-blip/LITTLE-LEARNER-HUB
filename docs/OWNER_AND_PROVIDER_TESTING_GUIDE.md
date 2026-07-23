# Owner and Provider Testing Guide — Little Learner Hub (Testing Site)

**Who this is for:** Leah (the owner) and any childcare-provider tester trying the testing site before real families and staff ever touch it.

**In plain language:** Everything on the testing site is pretend. Pretend children, pretend parents, pretend money, pretend messages. Nothing here ever reaches a real family, a real bank account, or a real inbox. You cannot break the real (production) site from here, and nothing you type here will accidentally email or text a real person.

---

## 1. Why we're testing this way

Before real providers and families use new features, we build a complete pretend daycare — a pretend home daycare and a pretend childcare center — with pretend staff, pretend children, and pretend parents. You (or a tester) can then click through the whole day exactly like a real provider would, without any risk to a real child's information.

**No real child information should ever be typed into the testing site.** Every name you'll see already has "(Fixture)" or "(Preview)" after it, and every test account's email ends in `@example.invalid` — a domain that can never send or receive real email, on purpose.

## 2. Get everything ready in one click

1. Sign in to the testing site as the **Platform Admin** (the real owner login).
2. In **Settings → Testing and Advanced Tools** (or the Admin dashboard's feature flags panel), turn on the **Testing Lab** flag. This one toggle only needs to happen once.
3. Open **Testing Lab** from the sidebar.
4. Select **"Get the testing site ready (seed both programs + all logins)."**
5. A table appears with one row per role: the fake email, a fresh one-time password, and which fake program it belongs to. **Copy every password now** — none are stored anywhere and none are shown again. This also turns on Director Center, Forms Center, and Family Hub testing preview automatically.

That's it — both fake programs (a solo home daycare and a multi-classroom center) and all 10 role logins are ready.

You can select this again any time (e.g., if you lose the passwords) — it issues fresh passwords each time without duplicating the fake programs.

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

---

*This guide covers the testing site only. It does not describe the real, live Little Learner Hub site that real families and providers use.*
