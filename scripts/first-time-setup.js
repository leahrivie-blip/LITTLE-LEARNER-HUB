/**
 * First-Time Setup — guided provider program onboarding (testing site only).
 * Progress checklist · demo mode · quiet first-week tips · one-time completion.
 * Relies on globals from app.js (setView, childStore, getProgramSettings, etc.).
 */
(function initFirstTimeSetup(global) {
  const STORAGE_KEY = "llhFirstTimeSetupV1";
  const TIPS_KEY = "llhFirstTimeSetupTipsV1";

  const STEPS = Object.freeze([
    {
      id: "program",
      title: "Create your program",
      detail: "Add your program name so reports and Family Hub feel like yours.",
      cta: "Open program details",
      view: "program-settings",
      tip: "Add your program name so families know who’s caring for their child.",
    },
    {
      id: "classroom",
      title: "Add your first classroom",
      detail: "Rooms help you group children for attendance and Daily Logs.",
      cta: "Add a classroom",
      view: "classrooms",
      tip: "Create a classroom so check-in and lessons stay organized.",
    },
    {
      id: "child",
      title: "Add your first child",
      detail: "Name and age group are enough — you can fill the rest later.",
      cta: "Add a child",
      view: "children",
      attrs: 'data-child-view="add"',
      tip: "Add your first child to bring Home and Daily Logs to life.",
    },
    {
      id: "family",
      title: "Invite your first family",
      detail: "Send a family invite link so parents can follow today’s updates.",
      cta: "Invite a family",
      view: "home-daycare-hub",
      tip: "You haven’t invited a parent yet — Family Hub is ready when you are.",
    },
    {
      id: "lesson",
      title: "Assign your first lesson plan",
      detail: "Put a plan on the classroom calendar so Today knows what to teach.",
      cta: "Open lesson plans",
      view: "lessons",
      tip: "Your first lesson plan is ready — assign one to this week’s calendar.",
    },
    {
      id: "attendance",
      title: "Record attendance",
      detail: "Check a child in so the care day has a clear starting point.",
      cta: "Start check-in",
      view: "child-tools-daily-logs",
      tip: "Try checking children in — it takes one tap in Daily Logs.",
    },
    {
      id: "daily-log",
      title: "Complete one Daily Log",
      detail: "Log a meal, nap, diaper, or activity so families see the day unfold.",
      cta: "Open Daily Logs",
      view: "child-tools-daily-logs",
      attrs: 'data-dlc-open-section="meals"',
      tip: "Try recording lunch for today’s children.",
    },
    {
      id: "parent-message",
      title: "Send your first parent message",
      detail: "A short update builds trust — even one sentence is enough.",
      cta: "Write a parent message",
      view: "child-tools-daily-logs",
      attrs: 'data-dlc-open-section="notes"',
      tip: "Send a quick parent message from today’s care notes.",
    },
    {
      id: "form",
      title: "Assign a form",
      detail: "Put one enrollment or care form on a child’s file for parents to complete.",
      cta: "Open forms",
      view: "forms",
      tip: "Assign one form so parents can complete paperwork in Family Hub.",
    },
    {
      id: "parent-view",
      title: "View Family Hub as the parent",
      detail: "See what families see — warm, simple, and focused on their child.",
      cta: "See what parents see",
      action: "preview-parent",
      tip: "Peek at the parent view so you know what families experience.",
    },
    {
      id: "complete",
      title: "Complete setup",
      detail: "Finish the steps above — then your program is ready for a real care day.",
      cta: "Review remaining steps",
      action: "focus-next",
      tip: "",
    },
  ]);

  const WEEK_TIPS = Object.freeze([
    { id: "tip-lunch", text: "Try recording lunch for today’s children.", stepId: "daily-log" },
    { id: "tip-invite", text: "You haven’t invited a parent yet.", stepId: "family" },
    { id: "tip-observation", text: "Your first observation takes less than a minute.", detect: "observation" },
    { id: "tip-lesson", text: "Your first lesson plan is ready.", stepId: "lesson" },
    { id: "tip-checkin", text: "Start the morning with a quick check-in.", stepId: "attendance" },
    { id: "tip-form", text: "Assign one form when you have a quiet moment.", stepId: "form" },
  ]);

  function esc(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
  }

  function accountEmail() {
    try {
      return String(global.currentUser || localStorage.getItem("llhUser") || "").trim().toLowerCase();
    } catch {
      return "";
    }
  }

  function defaultState() {
    return {
      email: "",
      startedAt: "",
      completedAt: "",
      dismissedAt: "",
      celebratedAt: "",
      demoLoadedAt: "",
      flags: {
        viewedParentHub: false,
        skippedToDemo: false,
      },
      completedIds: [],
      lastCelebratedStep: "",
    };
  }

  function getState() {
    const stored = readJson(STORAGE_KEY, {});
    const email = accountEmail();
    if (stored.email && email && stored.email !== email) {
      return { ...defaultState(), email };
    }
    return { ...defaultState(), ...stored, email: stored.email || email };
  }

  function saveState(next) {
    writeJson(STORAGE_KEY, next);
    return next;
  }

  function updateState(patch) {
    const current = getState();
    const next = {
      ...current,
      ...patch,
      flags: { ...(current.flags || {}), ...(patch.flags || {}) },
      completedIds: Array.isArray(patch.completedIds) ? patch.completedIds : (current.completedIds || []),
    };
    return saveState(next);
  }

  function isTestingProviderSetupEnabled() {
    try {
      return Boolean(
        typeof global.isHomeDaycareHubTestingEnabled === "function"
        && global.isHomeDaycareHubTestingEnabled()
        && typeof global.isLoggedIn === "function"
        && global.isLoggedIn()
        && !(typeof global.isFamilyHubParentMode === "function" && global.isFamilyHubParentMode())
      );
    } catch {
      return false;
    }
  }

  function detectStepDone(stepId, state = getState()) {
    const records = typeof global.childRecords === "function" ? global.childRecords() : { children: [] };
    const children = records.children || [];
    const today = typeof global.dlcActiveDate === "function"
      ? global.dlcActiveDate()
      : new Date().toISOString().slice(0, 10);

    switch (stepId) {
      case "program": {
        const settings = typeof global.getProgramSettings === "function" ? global.getProgramSettings() : {};
        return String(settings.programName || settings.businessName || "").trim().length > 2;
      }
      case "classroom": {
        const rooms = typeof global.activeScheduleClassrooms === "function" ? global.activeScheduleClassrooms() : [];
        return rooms.length > 0;
      }
      case "child":
        return children.length > 0;
      case "family": {
        const households = (global.familyHubHouseholdCache && Array.isArray(global.familyHubHouseholdCache.households))
          ? global.familyHubHouseholdCache.households
          : [];
        const invite = global.familyHubInviteResult;
        return households.length > 0 || Boolean(invite?.magicUrl) || Boolean(state.flags?.invitedFamily);
      }
      case "lesson": {
        try {
          if (typeof global.weekLessonForChild === "function") {
            if (children.some((child) => global.weekLessonForChild(child))) return true;
          }
          const api = typeof global.getScheduleApi === "function" ? global.getScheduleApi() : null;
          const doc = global.scheduleDocCache || (api ? api.readCache(global.scheduleApiEmail?.() || "") : null);
          const items = Array.isArray(doc?.items) ? doc.items : [];
          return items.some((item) => item && item.type === "lesson_plan");
        } catch {
          return Boolean(state.flags?.assignedLesson);
        }
      }
      case "attendance":
        return (records.attendance || []).length > 0
          || (typeof global.childStore === "function" && (global.childStore("Attendance") || []).length > 0);
      case "daily-log": {
        const has = (key) => (records[key] || []).some((item) => item && item.date === today)
          || (records[key] || []).length > 0;
        return has("meals") || has("naps") || has("diapers") || has("activityLogs") || has("activities");
      }
      case "parent-message": {
        const communications = records.communications
          || (typeof global.childStore === "function" ? global.childStore("Communications") : [])
          || [];
        return communications.some((item) => {
          const type = String(item.type || "").toLowerCase();
          return type.includes("parent") && (item.shareWithFamily === true || String(item.message || item.summary || "").trim());
        });
      }
      case "form": {
        const docs = records.documents
          || (typeof global.childStore === "function" ? global.childStore("Documents") : [])
          || [];
        return docs.length > 0 || Boolean(state.flags?.assignedForm);
      }
      case "parent-view":
        return Boolean(state.flags?.viewedParentHub);
      case "complete": {
        const core = STEPS.filter((s) => s.id !== "complete");
        return core.every((s) => detectStepDone(s.id, state));
      }
      default:
        return false;
    }
  }

  function syncProgress(state = getState()) {
    if (!isTestingProviderSetupEnabled()) return state;
    if (state.completedAt) return state;
    const doneIds = STEPS.filter((step) => detectStepDone(step.id, state)).map((step) => step.id);
    const newlyDone = doneIds.filter((id) => !(state.completedIds || []).includes(id));
    let next = updateState({
      startedAt: state.startedAt || new Date().toISOString(),
      completedIds: doneIds,
      email: accountEmail() || state.email,
    });
    if (newlyDone.length) {
      next = updateState({ lastCelebratedStep: newlyDone[newlyDone.length - 1] });
      if (typeof global.showActionFeedback === "function") {
        const step = STEPS.find((s) => s.id === newlyDone[newlyDone.length - 1]);
        if (step && step.id !== "complete") {
          global.showActionFeedback(`Nice — “${step.title}” is done!`);
        }
      }
    }
    if (detectStepDone("complete", next) && !next.completedAt) {
      next = markComplete(next);
    }
    return next;
  }

  function progressPercent(state = getState()) {
    const core = STEPS.filter((s) => s.id !== "complete");
    const done = core.filter((s) => detectStepDone(s.id, state)).length;
    return Math.round((done / Math.max(core.length, 1)) * 100);
  }

  function currentStep(state = getState()) {
    return STEPS.find((step) => !detectStepDone(step.id, state)) || STEPS[STEPS.length - 1];
  }

  function isSetupComplete(state = getState()) {
    // Only an explicit completion timestamp hides setup forever (unless reset).
    return Boolean(state.completedAt);
  }

  function shouldShowSetup(state = getState()) {
    if (!isTestingProviderSetupEnabled()) return false;
    if (state.completedAt || state.dismissedAt) return false;
    // Show until the provider finishes (or dismisses celebration after 100%).
    return true;
  }

  function markComplete(state = getState()) {
    const next = updateState({
      completedAt: state.completedAt || new Date().toISOString(),
      celebratedAt: state.celebratedAt || new Date().toISOString(),
      completedIds: STEPS.map((s) => s.id),
      lastCelebratedStep: "complete",
    });
    if (typeof global.trackEvent === "function") {
      global.trackEvent("first_time_setup_complete", { percent: 100 });
    }
    return next;
  }

  function resetSetup() {
    saveState({ ...defaultState(), email: accountEmail(), startedAt: new Date().toISOString() });
    writeJson(TIPS_KEY, {});
    if (typeof global.showActionFeedback === "function") {
      global.showActionFeedback("First-time setup reset — let’s walk through it again.");
    }
    refreshSurfaces();
  }

  function markFlag(flag, value = true) {
    const state = getState();
    updateState({ flags: { ...(state.flags || {}), [flag]: value } });
    syncProgress();
    refreshSurfaces();
  }

  function tipState() {
    const raw = readJson(TIPS_KEY, {});
    return {
      dismissed: raw && typeof raw.dismissed === "object" ? raw.dismissed : {},
      completed: raw && typeof raw.completed === "object" ? raw.completed : {},
    };
  }

  function saveTipState(next) {
    writeJson(TIPS_KEY, next);
  }

  function activeTip() {
    if (!isTestingProviderSetupEnabled()) return null;
    const state = syncProgress();
    // Tips during first week after start, or until setup complete + 7 days.
    const started = Date.parse(state.startedAt || state.completedAt || "") || Date.now();
    const ageDays = (Date.now() - started) / 86400000;
    if (ageDays > 7 && isSetupComplete(state)) return null;
    const tips = tipState();
    const records = typeof global.childRecords === "function" ? global.childRecords() : { children: [], observations: [] };
    for (const tip of WEEK_TIPS) {
      if (tips.dismissed?.[tip.id] || tips.completed?.[tip.id]) continue;
      if (tip.stepId && detectStepDone(tip.stepId, state)) {
        tips.completed[tip.id] = new Date().toISOString();
        saveTipState(tips);
        continue;
      }
      if (tip.detect === "observation") {
        const hasObs = (records.observations || []).length > 0;
        if (hasObs) {
          tips.completed[tip.id] = new Date().toISOString();
          saveTipState(tips);
          continue;
        }
      }
      return tip;
    }
    return null;
  }

  function dismissTip(tipId) {
    const tips = tipState();
    tips.dismissed = { ...(tips.dismissed || {}), [tipId]: new Date().toISOString() };
    saveTipState(tips);
    refreshSurfaces();
  }

  function tipHtml() {
    const tip = activeTip();
    if (!tip) return "";
    return `
      <aside class="fts-tip" role="status" data-fts-tip="${esc(tip.id)}">
        <p><strong>Tip</strong> ${esc(tip.text)}</p>
        <button class="ghost-button" type="button" data-fts-dismiss-tip="${esc(tip.id)}">Got it</button>
      </aside>
    `;
  }

  function celebrationHtml(state = getState()) {
    if (!isSetupComplete(state)) return "";
    // Show celebration panel once until dismissed via continue, or when just completed.
    if (state.dismissedAt && state.celebratedAt) return "";
    return `
      <section class="fts-celebrate" role="status" data-fts-celebrate>
        <p class="eyebrow">You’re set</p>
        <h3>🎉 Your childcare program is ready!</h3>
        <p>Everything you need for a real care day is in place. Jump into today’s work whenever you’re ready.</p>
        <div class="fts-celebrate-actions">
          <button class="primary-button" type="button" data-view="classroom">Today’s Classroom</button>
          <button class="ghost-button" type="button" data-view="children">Children</button>
          <button class="ghost-button" type="button" data-view="lessons">Lesson Plans</button>
          <button class="ghost-button" type="button" data-view="home-daycare-hub">Family Hub</button>
          <button class="ghost-button" type="button" data-view="forms">Forms</button>
        </div>
        <button class="ghost-button fts-continue" type="button" data-fts-finish>Continue to Home</button>
      </section>
    `;
  }

  function panelHtml() {
    if (!isTestingProviderSetupEnabled()) return "";
    let state = syncProgress();
    if (state.completedAt && state.dismissedAt) return tipHtml();
    if (state.completedAt && !state.dismissedAt) return celebrationHtml(state) + tipHtml();
    if (!shouldShowSetup(state)) return tipHtml();
    const percent = progressPercent(state);
    // If every core step is done, promote to celebration instead of an empty checklist.
    if (percent >= 100 && detectStepDone("complete", state)) {
      state = markComplete(state);
      return celebrationHtml(state) + tipHtml();
    }
    const current = currentStep(state);
    const justDone = state.lastCelebratedStep && state.lastCelebratedStep !== "complete"
      ? STEPS.find((s) => s.id === state.lastCelebratedStep)
      : null;

    return `
      <section class="fts-panel" data-fts-panel aria-label="First-time setup">
        <div class="fts-panel-head">
          <div>
            <p class="eyebrow">First-time setup</p>
            <h3>Let’s get your program ready</h3>
            <p class="muted-copy">One clear step at a time — you’ll always know what to do next.</p>
          </div>
          <div class="fts-progress-ring" aria-label="${percent} percent complete">
            <strong>${percent}%</strong>
            <span>complete</span>
          </div>
        </div>
        <div class="fts-progress-bar" aria-hidden="true"><span style="width:${percent}%"></span></div>
        ${justDone ? `<p class="fts-step-celebrate" role="status">✓ ${esc(justDone.title)} — nice work!</p>` : ""}
        <ol class="fts-steps">
          ${STEPS.map((step) => {
            const done = detectStepDone(step.id, state);
            const active = step.id === current.id;
            return `
              <li class="fts-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}" data-fts-step="${esc(step.id)}">
                <span class="fts-step-mark" aria-hidden="true">${done ? "✓" : (active ? "→" : "○")}</span>
                <div class="fts-step-body">
                  <strong>${esc(step.title)}</strong>
                  ${active && !done ? `<p>${esc(step.detail)}</p>
                    <div class="fts-step-actions">
                      <button class="primary-button" type="button" data-fts-action="${esc(step.action || "goto")}" data-fts-step-id="${esc(step.id)}" ${step.view ? `data-view="${esc(step.view)}"` : ""} ${step.attrs || ""}>${esc(step.cta)}</button>
                    </div>` : ""}
                </div>
              </li>
            `;
          }).join("")}
        </ol>
        <div class="fts-demo-row">
          <div>
            <strong>Prefer to explore first?</strong>
            <p class="muted-copy">Load a realistic demo childcare program instantly — no typing required.</p>
          </div>
          <button class="ghost-button" type="button" data-fts-load-demo>Try demo mode</button>
        </div>
        <p class="fts-skip-note muted-copy">You can leave and come back anytime. Setup stays until you finish or load demo mode.</p>
      </section>
      ${tipHtml()}
    `;
  }

  async function loadDemoProgram() {
    if (!isTestingProviderSetupEnabled()) return;
    const today = typeof global.dlcActiveDate === "function"
      ? global.dlcActiveDate()
      : new Date().toISOString().slice(0, 10);

    // 1) Program
    if (typeof global.getProgramSettings === "function" && typeof global.saveProgramSettings === "function") {
      const settings = global.getProgramSettings() || {};
      global.saveProgramSettings({
        ...settings,
        programName: settings.programName || "Sunshine Little Learners",
        providerName: settings.providerName || "Alex Provider",
        programType: settings.programType || "Home Daycare",
        hoursOpen: settings.hoursOpen || "07:30",
        hoursClose: settings.hoursClose || "17:30",
      });
    }

    // 2) Classroom
    let room = { id: "demo-room-sunshine", name: "Sunshine Room", ageGroupDefault: "Toddler" };
    try {
      const rooms = typeof global.activeScheduleClassrooms === "function" ? global.activeScheduleClassrooms() : [];
      if (rooms.length) {
        room = rooms[0];
      } else if (typeof global.persistScheduleClassrooms === "function") {
        await global.persistScheduleClassrooms([room]);
      }
    } catch { /* continue */ }

    // 3) Children
    let childA;
    let childB;
    const existing = (typeof global.childRecords === "function" ? global.childRecords().children : []) || [];
    if (existing.length >= 2) {
      childA = existing[0];
      childB = existing[1];
    } else if (typeof global.appendChildRecord === "function") {
      childA = global.appendChildRecord("Profiles", {
        name: "Mia Rivera",
        ageGroup: "Toddler",
        dob: "2023-04-12",
        classroomId: room.id,
        classroom: room.name,
        allergies: "Peanuts",
        parentInfo: "Jordan Rivera",
        emergencyContact: "Jordan Rivera 555-0100",
        enrollmentDate: today,
      }, { skipRender: true });
      childB = global.appendChildRecord("Profiles", {
        name: "Noah Chen",
        ageGroup: "Toddler",
        dob: "2023-01-08",
        classroomId: room.id,
        classroom: room.name,
        parentInfo: "Sam Chen",
        enrollmentDate: today,
      }, { skipRender: true });
    }

    // 6–8) Attendance, daily log, parent message
    if (childA && typeof global.appendChildRecord === "function") {
      const hasAtt = ((typeof global.childStore === "function" ? global.childStore("Attendance") : []) || [])
        .some((a) => a.childId === childA.id && a.date === today);
      if (!hasAtt) {
        global.appendChildRecord("Attendance", {
          childId: childA.id,
          date: today,
          status: "Present",
          dropoff: "08:15",
          summary: "Present at 08:15",
          shareWithFamily: true,
        }, { skipRender: true });
      }
      const hasMeal = ((typeof global.childStore === "function" ? global.childStore("Meals") : []) || [])
        .some((m) => m.childId === childA.id && m.date === today);
      if (!hasMeal) {
        global.appendChildRecord("Meals", {
          childId: childA.id,
          date: today,
          lunch: "Ate most",
          summary: "Lunch: Ate most",
          shareWithFamily: true,
        }, { skipRender: true });
      }
      const hasMsg = ((typeof global.childStore === "function" ? global.childStore("Communications") : []) || [])
        .some((c) => String(c.type || "").toLowerCase().includes("parent"));
      if (!hasMsg) {
        global.appendChildRecord("Communications", {
          childId: childA.id,
          date: today,
          type: "Parent Message",
          title: `Parent Message | ${today}`,
          summary: "Mia had a great morning building with blocks!",
          message: "Mia had a great morning building with blocks and sharing with friends.",
          shareWithFamily: true,
        }, { skipRender: true });
      }
      const docs = (typeof global.childStore === "function" ? global.childStore("Documents") : []) || [];
      if (!docs.length) {
        global.appendChildRecord("Documents", {
          childId: childA.id,
          date: today,
          title: "Emergency Contact Form",
          category: "Enrollment",
          status: "needs_parent",
          statusLabel: "Needs parent action",
          shareWithFamily: true,
        }, { skipRender: true });
      }
    }

    // 5) Lesson — best effort via schedule cache
    try {
      const api = typeof global.getScheduleApi === "function" ? global.getScheduleApi() : null;
      if (api && typeof api.readCache === "function") {
        const email = typeof global.scheduleApiEmail === "function" ? global.scheduleApiEmail() : accountEmail();
        const doc = global.scheduleDocCache || api.readCache(email) || { items: [], classrooms: [] };
        const week = api.weekStartMonday?.(today) || today;
        const hasLesson = (doc.items || []).some((item) => item.type === "lesson_plan");
        if (!hasLesson) {
          const lessonItem = {
            id: `demo-lesson-${Date.now().toString(36)}`,
            type: "lesson_plan",
            title: "All About Me",
            lessonPlanTitle: "All About Me",
            lessonPlanId: "cur-lp-preschool-all-about-me",
            classroomId: room.id,
            weekStartDate: week,
            childIds: [childA?.id, childB?.id].filter(Boolean),
          };
          const nextDoc = {
            ...doc,
            classrooms: (doc.classrooms || []).length ? doc.classrooms : [room],
            items: [...(doc.items || []), lessonItem],
          };
          global.scheduleDocCache = nextDoc;
          if (typeof api.writeCache === "function") api.writeCache(email, nextDoc);
          markFlag("assignedLesson", true);
        }
      } else {
        markFlag("assignedLesson", true);
      }
    } catch {
      markFlag("assignedLesson", true);
    }

    // 4) Family invite — try API seed, else local flag
    try {
      if (typeof global.staffAuthHeaders === "function" && typeof global.canUseLaunchBackend === "function" && global.canUseLaunchBackend()) {
        const headers = await global.staffAuthHeaders();
        if (headers) {
          const response = await fetch("/api/family-hub/seed-demo", {
            method: "POST",
            headers,
            body: JSON.stringify({
              appOrigin: window.location.origin,
              programName: (typeof global.getProgramSettings === "function" && global.getProgramSettings().programName) || "Sunshine Little Learners",
            }),
          });
          const result = await response.json().catch(() => ({}));
          if (response.ok) {
            global.familyHubInviteResult = {
              label: result.demo?.household?.label || "Rivera Family",
              magicUrl: result.demo?.magicUrl || "",
              loginCode: result.demo?.loginCode || "",
            };
            if (typeof global.refreshFamilyHubHouseholds === "function") {
              await global.refreshFamilyHubHouseholds().catch(() => {});
            }
            markFlag("invitedFamily", true);
          } else {
            markFlag("invitedFamily", true);
          }
        } else {
          markFlag("invitedFamily", true);
        }
      } else {
        markFlag("invitedFamily", true);
      }
    } catch {
      markFlag("invitedFamily", true);
    }

    // 10) Parent view marked so demo feels complete; user can still preview
    markFlag("viewedParentHub", true);

    updateState({
      demoLoadedAt: new Date().toISOString(),
      flags: { ...(getState().flags || {}), skippedToDemo: true, invitedFamily: true, viewedParentHub: true, assignedLesson: true },
    });
    const next = syncProgress();
    if (detectStepDone("complete", next)) markComplete(next);

    if (typeof global.showActionFeedback === "function") {
      global.showActionFeedback("Demo program loaded — explore freely.");
    }
    refreshSurfaces();
    if (typeof global.setView === "function") {
      global.setView("home", { allowDashboard: true, skipAccessRedirect: true });
    }
  }

  function runStepAction(stepId, action) {
    const step = STEPS.find((s) => s.id === stepId) || currentStep();
    if (action === "preview-parent" || step.action === "preview-parent") {
      markFlag("viewedParentHub", true);
      if (typeof global.setView === "function") {
        global.setView("home-daycare-hub", { allowDuringBootVerification: true });
      }
      window.setTimeout(() => {
        const previewBtn = document.querySelector("[data-hdh-role-switch='parent']");
        if (previewBtn) previewBtn.click();
        else if (typeof global.showActionFeedback === "function") {
          global.showActionFeedback("Open Family Hub → See what parents see anytime.");
        }
      }, 350);
      return;
    }
    if (action === "focus-next" || step.action === "focus-next") {
      const panel = document.querySelector("[data-fts-panel]");
      panel?.querySelector(".fts-step.is-active")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (step.view && typeof global.setView === "function") {
      const options = { allowDuringBootVerification: true };
      if (step.id === "child") {
        try {
          global.childManagementMode = "add";
        } catch { /* ignore */ }
      }
      global.setView(step.view, options);
      if (step.id === "child" && typeof global.renderChildManagement === "function") {
        window.setTimeout(() => {
          try {
            global.childManagementMode = "add";
            global.renderChildManagement();
          } catch { /* ignore */ }
        }, 200);
      }
    }
  }

  function refreshSurfaces() {
    try {
      const view = document.body.getAttribute("data-view") || "";
      if ((view === "home" || !view) && typeof global.renderOwnerHomeDashboard === "function") {
        global.renderOwnerHomeDashboard();
      }
      if (view === "today" && typeof global.renderTeacherTodayPage === "function") {
        global.renderTeacherTodayPage();
      }
    } catch { /* ignore */ }
  }

  function onDocumentClick(event) {
    const finish = event.target.closest("[data-fts-finish]");
    if (finish) {
      event.preventDefault();
      updateState({ dismissedAt: new Date().toISOString(), celebratedAt: getState().celebratedAt || new Date().toISOString() });
      refreshSurfaces();
      return;
    }
    const reset = event.target.closest("[data-fts-reset]");
    if (reset) {
      event.preventDefault();
      resetSetup();
      return;
    }
    const dismissTipBtn = event.target.closest("[data-fts-dismiss-tip]");
    if (dismissTipBtn) {
      event.preventDefault();
      dismissTip(dismissTipBtn.getAttribute("data-fts-dismiss-tip") || "");
      return;
    }
    const demoBtn = event.target.closest("[data-fts-load-demo]");
    if (demoBtn) {
      event.preventDefault();
      demoBtn.disabled = true;
      loadDemoProgram().finally(() => { demoBtn.disabled = false; });
      return;
    }
    const actionBtn = event.target.closest("[data-fts-action]");
    if (actionBtn) {
      const action = actionBtn.getAttribute("data-fts-action") || "goto";
      const stepId = actionBtn.getAttribute("data-fts-step-id") || "";
      // Let data-view handlers run too; still route custom actions.
      if (action === "preview-parent" || action === "focus-next") {
        event.preventDefault();
        runStepAction(stepId, action);
      } else if (stepId === "child") {
        window.setTimeout(() => runStepAction(stepId, action), 0);
      }
      return;
    }
    // Detect parent preview from existing Family Hub control
    const parentPreview = event.target.closest("[data-hdh-role-switch='parent']");
    if (parentPreview && isTestingProviderSetupEnabled()) {
      window.setTimeout(() => markFlag("viewedParentHub", true), 0);
    }
  }

  function maybeStartOnBoot() {
    if (!isTestingProviderSetupEnabled()) return;
    const state = getState();
    if (!state.startedAt && !state.completedAt) {
      updateState({ startedAt: new Date().toISOString(), email: accountEmail() });
    }
    syncProgress();
    // Re-render Home once so the checklist appears after this module loads (app.js boots first).
    window.setTimeout(() => {
      try {
        const view = document.body.getAttribute("data-view") || "";
        if ((view === "home" || view === "") && typeof global.renderOwnerHomeDashboard === "function") {
          if (shouldShowSetup() || (getState().completedAt && !getState().dismissedAt)) {
            global.renderOwnerHomeDashboard();
          }
        }
      } catch (_e) { /* ignore */ }
    }, 120);
  }

  // Patch-friendly hooks used by app.js dashboards
  global.FirstTimeSetup = {
    STEPS,
    getState,
    syncProgress,
    progressPercent,
    shouldShowSetup,
    isSetupComplete,
    panelHtml,
    tipHtml,
    celebrationHtml,
    loadDemoProgram,
    resetSetup,
    markFlag,
    refreshSurfaces,
    detectStepDone,
    currentStep,
  };

  document.addEventListener("click", onDocumentClick, true);
  // Re-sync when child data changes via storage-ish custom events if present
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncProgress();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeStartOnBoot);
  } else {
    maybeStartOnBoot();
  }
})(typeof window !== "undefined" ? window : globalThis);
