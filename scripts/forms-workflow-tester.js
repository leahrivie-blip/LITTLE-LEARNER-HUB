/**
 * Tester-site Forms workflow (catalog archive, child-locked fill, injury-from-home, extra meals).
 * Fenced by isHomeDaycareHubTestingEnabled(). Does not replace Documents as source of truth.
 */
(function formsWorkflowTester() {
  "use strict";

  const INJURY_FROM_HOME_ID = "form-medical-forms-injury-or-mark-from-home";
  const MEAL_TRACKING_ID = "form-daily-forms-meal-tracking-sheet";
  const DEFAULT_MEAL_LABELS = Object.freeze(["Breakfast", "Lunch", "Snack"]);
  const MEAL_LABEL_SUGGESTIONS = Object.freeze([
    "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Tea", "Supper", "Bottle", "Custom",
  ]);

  const state = {
    showArchivedCatalog: false,
    fillResourceId: "",
    fillChildId: "",
    mealEntries: null,
    fillSaving: false,
    viewerSaving: false,
    addingMeal: false,
  };

  function enabled() {
    try {
      return typeof isHomeDaycareHubTestingEnabled === "function" && isHomeDaycareHubTestingEnabled();
    } catch (_error) {
      return false;
    }
  }

  function canManageFormCatalog() {
    try {
      return typeof canAccessPlatformFeature === "function" && canAccessPlatformFeature("forms");
    } catch (_error) {
      return false;
    }
  }

  /**
   * Future Program/Setting noun hook. Current US wording stays "Program".
   * A later preference can set programSettings.careSettingNoun = "setting" without rewriting forms.
   */
  function formsCareSettingNoun() {
    const settings = typeof getProgramSettings === "function" ? (getProgramSettings() || {}) : {};
    const pref = String(settings.careSettingNoun || "").trim().toLowerCase();
    if (pref === "setting") return "Setting";
    return "Program";
  }

  function formCatalogArchiveMap() {
    const settings = typeof getProgramSettings === "function" ? (getProgramSettings() || {}) : {};
    const raw = settings.formCatalogArchive;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function isFormTypeArchived(resourceId) {
    const entry = formCatalogArchiveMap()[String(resourceId || "")];
    return Boolean(entry && entry.archived === true);
  }

  function setFormTypeArchived(resourceId, archived) {
    if (!enabled() || !canManageFormCatalog() || !resourceId) return formCatalogArchiveMap();
    const settings = { ...(getProgramSettings() || {}) };
    const nextMap = { ...formCatalogArchiveMap() };
    if (archived) {
      nextMap[resourceId] = {
        archived: true,
        archivedAt: nextMap[resourceId]?.archivedAt || new Date().toISOString(),
      };
    } else if (nextMap[resourceId]) {
      nextMap[resourceId] = {
        ...nextMap[resourceId],
        archived: false,
        restoredAt: new Date().toISOString(),
      };
    }
    settings.formCatalogArchive = nextMap;
    saveProgramSettings(settings);
    return nextMap;
  }

  function injuryFromHomeResource() {
    return {
      id: INJURY_FROM_HOME_ID,
      category: "Forms Library",
      title: "Injury or Mark From Home",
      age: "All Ages",
      plan: "Free",
      month: "All Year",
      tags: ["Medical Forms", "Incident & Safety", "PDF", "Editable", "In-App"],
      format: "PDF + Editable",
      description: "Document an injury or significant mark observed at arrival that occurred before the child entered care. Neutral template — not a licensing determination.",
      visible: true,
      archived: false,
      testerWorkflowForm: true,
      formCategory: "Arrival / from home",
    };
  }

  function injuryFromHomePackEntry() {
    return {
      id: "hdh-pack-injury-from-home",
      title: "Injury or Mark From Home",
      category: "Arrival / from home",
      resourceId: INJURY_FROM_HOME_ID,
      description: "Arrival observation of an injury or mark reported as occurring before the child entered care — not an in-care incident.",
    };
  }

  function withTesterForms(list) {
    if (!Array.isArray(list) || !enabled()) return list;
    if (list.some((item) => item && item.id === INJURY_FROM_HOME_ID)) return list;
    return [...list, injuryFromHomeResource()];
  }

  function formsWorkflowCatalog() {
    const list = (typeof resources !== "undefined" && Array.isArray(resources)) ? resources : [];
    return list.filter((item) => item && item.category === "Forms Library" && item.visible !== false);
  }

  function activeCatalogForms() {
    return formsWorkflowCatalog().filter((item) => !isFormTypeArchived(item.id));
  }

  function packEntriesForDisplay() {
    const base = typeof HOME_DAYCARE_FORMS_PACK !== "undefined" ? [...HOME_DAYCARE_FORMS_PACK] : [];
    if (!base.some((item) => item.resourceId === INJURY_FROM_HOME_ID)) base.push(injuryFromHomePackEntry());
    return base;
  }

  function defaultMealEntries() {
    return DEFAULT_MEAL_LABELS.map((label) => ({ label, time: "", offered: "", amount: "" }));
  }

  function normalizeMealEntries(raw) {
    if (!Array.isArray(raw) || !raw.length) return defaultMealEntries();
    return raw.map((row) => ({
      label: String(row?.label || "").trim() || "Meal / snack",
      time: String(row?.time || "").trim(),
      offered: String(row?.offered || "").trim(),
      amount: String(row?.amount || "").trim(),
    }));
  }

  function mealEntriesPrintable(entries) {
    const rows = normalizeMealEntries(entries);
    return rows.map((row) => {
      const time = row.time ? `Time: ${row.time}` : "Time: ________";
      return `${row.label} offered: ${row.offered || "_______________________________________"}
${time}  Amount eaten: ${row.amount || "[ ] Most  [ ] Some  [ ] Little  [ ] None"}`;
    }).join("\n\n");
  }

  function injuryFromHomePrintable(resource, values = {}, child = null) {
    const v = values || {};
    const childName = v.childName || child?.name || "";
    const header = `${resource?.title || "Injury or Mark From Home"}

Child: ${childName || "______________________________________________"}
Date: ${v.date || "____________________________________________________"}
Time observed / arrival time: ${v.timeObserved || "________________________"}`;
    return `${header}

This form documents an injury or significant mark observed at arrival that the provider understands occurred before the child entered care. It is a program record, not a determination of licensing compliance.

Injury / mark type: ${v.injuryType || "_________________________________________"}
Body location: ${v.bodyLocation || "____________________________________________"}

Description:
${v.description || "________________________________________________________________________"}

Reported cause / parent explanation:
${v.reportedCause || "________________________________________________________________________"}

Was this a head injury? ${v.headInjury || "[ ] Yes  [ ] No"}
Observations (optional): area warm / swollen / bruised / bleeding:
${v.observations || "________________________________________________________________________"}

Actions taken by provider:
${v.actionsTaken || "________________________________________________________________________"}

Parent/guardian notified or acknowledged? ${v.parentNotified || "[ ] Yes  [ ] No"}
Staff / provider name: ${v.staffName || "_______________________________________"}

Notes:
${v.notes || "________________________________________________________________________"}

${typeof formSignatureBlock === "function" ? formSignatureBlock() : "Acknowledgment: ________________________________  Date: ________"}`;
  }

  function currentChildById(childId) {
    const kids = (typeof childStore === "function" ? childStore("Profiles") : []) || [];
    return kids.find((item) => String(item.id) === String(childId)) || null;
  }

  function accountDisplayName() {
    try {
      const account = typeof currentAccount === "function" ? currentAccount() : null;
      const name = [account?.firstName, account?.lastName].filter(Boolean).join(" ").trim();
      return name || String(account?.businessName || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function resolveLockedChildId(preferredId) {
    const fromAttr = String(preferredId || "").trim();
    let fromProfile = "";
    try {
      if (typeof selectedChildId !== "undefined") fromProfile = String(selectedChildId || "").trim();
    } catch (_error) { /* ignore */ }
    if (fromAttr && fromProfile && fromAttr !== fromProfile) return "";
    return fromAttr || fromProfile;
  }

  function saveCompletedFormRecord({ childId, resource, values, draftText, extra = {} }) {
    if (!enabled()) return null;
    const lockedId = resolveLockedChildId(childId);
    if (!lockedId || !resource || !resource.id) return null;
    const childIdSafe = lockedId;
    const today = new Date().toISOString().slice(0, 10);
    return appendChildRecord("Documents", {
      childId: childIdSafe,
      title: resource.title,
      category: resource.formCategory || resource.tags?.[0] || "Other",
      packFormId: extra.packFormId || "",
      resourceId: resource.id,
      status: "on_file",
      statusLabel: typeof homeDaycarePackDocumentStatusLabel === "function"
        ? homeDaycarePackDocumentStatusLabel("on_file")
        : "On file / complete",
      notes: String(values?.notes || extra.notes || "").trim(),
      draftText,
      mealEntries: extra.mealEntries || undefined,
      formValues: values || undefined,
      shareWithFamily: extra.shareWithFamily === true,
      providerReviewed: true,
      date: String(values?.date || today),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: extra.source || "child-profile",
    });
  }

  function wrapFunction(name, wrapper) {
    const root = typeof window !== "undefined" ? window : globalThis;
    const original = root[name];
    if (typeof original !== "function") return;
    root[name] = wrapper(original);
  }

  function catalogManagerHtml() {
    const items = formsWorkflowCatalog();
    const showArchived = state.showArchivedCatalog;
    const visible = items.filter((item) => showArchived || !isFormTypeArchived(item.id));
    return `
      <section class="section-block forms-wf-catalog" id="formsWorkflowCatalogPanel">
        <p class="eyebrow">Manage Forms</p>
        <h3>Forms your ${escapeHtml(formsCareSettingNoun().toLowerCase())} uses</h3>
        <p class="muted-copy">Archive hides a form type from <strong>new</strong> form pickers only. It does not delete the form definition, does not delete completed paperwork, and does not change a child’s existing Forms &amp; Records. That is different from removing one saved document on a child file.</p>
        <label class="settings-check-label"><input type="checkbox" data-forms-wf-show-archived ${showArchived ? "checked" : ""} /> Show archived form types</label>
        <div class="forms-wf-catalog-list" role="list">
          ${visible.map((item) => {
            const archived = isFormTypeArchived(item.id);
            return `
              <article class="hdh-forms-pack-item forms-wf-catalog-item" role="listitem" data-form-id="${escapeHtml(item.id)}">
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p class="muted-copy">${escapeHtml((item.tags && item.tags[0]) || "Forms Library")} · ${archived ? "Hidden from new forms" : "Active for new forms"}</p>
                </div>
                ${canManageFormCatalog() ? `
                  <div class="hdh-forms-pack-actions">
                    ${archived
                      ? `<button class="primary-button" type="button" data-forms-wf-restore="${escapeHtml(item.id)}">Restore to new-form list</button>`
                      : `<button class="ghost-button" type="button" data-forms-wf-archive="${escapeHtml(item.id)}">Hide from new forms</button>`}
                  </div>
                ` : `<p class="muted-copy">Staff can fill active forms. Catalog hide/restore is owner/director only.</p>`}
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function mealFillFieldsHtml(entries) {
    const rows = normalizeMealEntries(entries);
    return `
      <div class="forms-wf-meal-rows" data-forms-wf-meal-rows>
        ${rows.map((row, index) => `
          <fieldset class="forms-wf-meal-row">
            <legend class="visually-hidden">Meal or snack ${index + 1}</legend>
            <label>Name / label
              <input name="mealLabel-${index}" list="formsWfMealLabelSuggestions" value="${escapeHtml(row.label)}" />
            </label>
            <label>Time
              <input name="mealTime-${index}" type="time" value="${escapeHtml(row.time)}" />
            </label>
            <label>Offered
              <input name="mealOffered-${index}" value="${escapeHtml(row.offered)}" maxlength="200" />
            </label>
            <label>Amount eaten
              <input name="mealAmount-${index}" value="${escapeHtml(row.amount)}" placeholder="Most, some, little, none…" maxlength="80" />
            </label>
          </fieldset>
        `).join("")}
      </div>
      <datalist id="formsWfMealLabelSuggestions">
        ${MEAL_LABEL_SUGGESTIONS.map((label) => `<option value="${escapeHtml(label)}"></option>`).join("")}
      </datalist>
      <button class="ghost-button" type="button" data-forms-wf-add-meal>Add meal/snack</button>
    `;
  }

  function structuredFillHtml(child, resourceId) {
    const resource = formsWorkflowCatalog().find((item) => item.id === resourceId);
    if (!resource || !child) return "";
    const today = new Date().toISOString().slice(0, 10);
    const staffName = accountDisplayName();
    if (resourceId === MEAL_TRACKING_ID) {
      const entries = state.mealEntries || defaultMealEntries();
      return `
        <form id="formsWorkflowFillForm" class="panel-form forms-wf-fill-form" data-resource-id="${escapeHtml(resourceId)}" data-child-id="${escapeHtml(child.id)}">
          <p class="eyebrow">Fill for ${escapeHtml(child.name)}</p>
          <h3>${escapeHtml(resource.title)}</h3>
          <input type="hidden" name="childId" value="${escapeHtml(child.id)}" />
          <label>Date<input type="date" name="date" value="${escapeHtml(today)}" required /></label>
          <p class="muted-copy">Standard breakfast, lunch, and snack stay available. Add extra meals or snacks with your own labels.</p>
          ${mealFillFieldsHtml(entries)}
          <label>Notes<textarea name="notes" rows="2" maxlength="800"></textarea></label>
          <button class="primary-button" type="submit">Save to ${escapeHtml(child.name)}’s file</button>
        </form>
      `;
    }
    if (resourceId === INJURY_FROM_HOME_ID) {
      return `
        <form id="formsWorkflowFillForm" class="panel-form forms-wf-fill-form" data-resource-id="${escapeHtml(resourceId)}" data-child-id="${escapeHtml(child.id)}">
          <p class="eyebrow">Fill for ${escapeHtml(child.name)}</p>
          <h3>${escapeHtml(resource.title)}</h3>
          <p class="hdh-disclaimer" role="note">This is a program record of an injury or mark observed at arrival or reported as happening before care. It is not an in-care incident report and does not determine licensing compliance. Check your own rules before relying on this template.</p>
          <input type="hidden" name="childId" value="${escapeHtml(child.id)}" />
          <div class="form-grid-two">
            <label>Child<input name="childName" value="${escapeHtml(child.name)}" readonly /></label>
            <label>Date<input type="date" name="date" value="${escapeHtml(today)}" required /></label>
            <label>Time observed / arrival time<input type="time" name="timeObserved" /></label>
            <label>Injury / mark type<input name="injuryType" maxlength="120" /></label>
            <label>Body location<input name="bodyLocation" maxlength="120" /></label>
            <label>Was this a head injury?
              <select name="headInjury">
                <option value="">Not specified</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          </div>
          <label>Description<textarea name="description" rows="3" maxlength="2000"></textarea></label>
          <label>Reported cause / parent explanation<textarea name="reportedCause" rows="2" maxlength="1200"></textarea></label>
          <label>Optional observations (warm / swollen / bruised / bleeding)<textarea name="observations" rows="2" maxlength="800"></textarea></label>
          <label>Actions taken by provider<textarea name="actionsTaken" rows="2" maxlength="1200"></textarea></label>
          <label>Parent/guardian notified or acknowledged?
            <select name="parentNotified">
              <option value="">Not specified</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
          <label>Staff / provider name<input name="staffName" value="${escapeHtml(staffName)}" maxlength="120" /></label>
          <label>Notes<textarea name="notes" rows="2" maxlength="800"></textarea></label>
          <button class="primary-button" type="submit">Save to ${escapeHtml(child.name)}’s file</button>
        </form>
      `;
    }
    return "";
  }

  function childFillPickerHtml(child) {
    if (state.fillChildId && String(state.fillChildId) !== String(child.id)) {
      state.fillResourceId = "";
      state.fillChildId = "";
      state.mealEntries = null;
    }
    const active = activeCatalogForms();
    const selected = state.fillResourceId || "";
    return `
      <section class="section-block forms-wf-child-launch">
        <p class="eyebrow">Start a form</p>
        <h3>Forms &amp; Records for ${escapeHtml(child.name)}</h3>
        <p class="muted-copy">${escapeHtml(child.name)} is already selected. Choose a form and fill it — no extra child picker.</p>
        <form id="formsWorkflowPickForm" class="panel-form" data-child-id="${escapeHtml(child.id)}">
          <label>Form
            <select name="resourceId" required>
              <option value="">Choose a form</option>
              ${active.map((item) => `
                <option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title)}</option>
              `).join("")}
            </select>
          </label>
          <button class="primary-button" type="submit">Fill form</button>
        </form>
        ${selected ? structuredFillHtml(child, selected) : ""}
      </section>
    `;
  }

  function collectMealEntriesFromForm(form) {
    const entries = [];
    let index = 0;
    while (form.querySelector(`[name="mealLabel-${index}"]`)) {
      entries.push({
        label: String(form[`mealLabel-${index}`]?.value || "").trim() || "Meal / snack",
        time: String(form[`mealTime-${index}`]?.value || "").trim(),
        offered: String(form[`mealOffered-${index}`]?.value || "").trim(),
        amount: String(form[`mealAmount-${index}`]?.value || "").trim(),
      });
      index += 1;
    }
    return entries.length ? entries : defaultMealEntries();
  }

  function handleFillSubmit(form) {
    if (!enabled() || !form || form.dataset.formsWfSaved === "1" || state.fillSaving) return null;
    const childId = resolveLockedChildId(form.dataset.childId);
    const resourceId = String(form.dataset.resourceId || "").trim();
    const resource = formsWorkflowCatalog().find((item) => item.id === resourceId);
    if (!childId || !resource) return null;
    if (resourceId !== MEAL_TRACKING_ID && resourceId !== INJURY_FROM_HOME_ID) return null;
    const child = currentChildById(childId);
    if (!child) return null;
    form.dataset.formsWfSaved = "1";
    state.fillSaving = true;
    const submitBtn = form.querySelector("[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    try {
    const values = typeof collectFormData === "function" ? collectFormData(form) : {};
    values.childName = child.name;
    delete values.childId;
    let extra = { source: "child-profile" };
    let draftText = "";
    if (resourceId === MEAL_TRACKING_ID) {
      const mealEntries = collectMealEntriesFromForm(form);
      extra.mealEntries = mealEntries;
      draftText = `${resource.title}\n\nChild: ${child.name}\nDate: ${values.date || ""}\n\n${mealEntriesPrintable(mealEntries)}\n\nNotes:\n${values.notes || ""}`;
    } else {
      draftText = injuryFromHomePrintable(resource, values, child);
    }
    const saved = saveCompletedFormRecord({ childId, resource, values, draftText, extra });
    state.fillResourceId = "";
    state.fillChildId = "";
    state.mealEntries = null;
    if (typeof showActionFeedback === "function") showActionFeedback("Saved to child file.");
    if (typeof childProfileTab !== "undefined") childProfileTab = "forms-records";
    if (typeof renderChildManagement === "function") renderChildManagement();
    return saved;
    } finally {
      state.fillSaving = false;
    }
  }

  function launchFormForChild(childId, resourceId) {
    if (!enabled()) return;
    const lockedId = String(childId || "").trim();
    if (!lockedId || !resourceId) return;
    state.fillResourceId = resourceId;
    state.fillChildId = lockedId;
    if (typeof selectedChildId !== "undefined") selectedChildId = lockedId;
    try { localStorage.setItem("llhSelectedChild", childId); } catch (_error) { /* ignore */ }
    if (typeof hdhAiDraftState !== "undefined") {
      hdhAiDraftState.childId = childId;
      hdhAiDraftState.lockedChildId = childId;
    }
    if (resourceId === MEAL_TRACKING_ID || resourceId === INJURY_FROM_HOME_ID) {
      state.mealEntries = defaultMealEntries();
      if (typeof childProfileTab !== "undefined") childProfileTab = "forms-records";
      if (typeof childManagementMode !== "undefined") childManagementMode = "profile";
      if (typeof renderChildManagement === "function") renderChildManagement();
      queueMicrotask(() => document.querySelector("#formsWorkflowFillForm")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (typeof openResourceViewer === "function") {
      openResourceViewer(resourceId, { returnTo: "children", childId: lockedId, lockChild: true });
    }
  }

  function attachViewerChrome(resourceId, options = {}) {
    if (!enabled() || options.lockChild !== true) return;
    const childId = resolveLockedChildId(options.childId);
    if (!childId) return;
    const body = document.querySelector("#resourceViewerBody");
    if (!body || body.querySelector("[data-forms-wf-viewer-bar]")) return;
    const child = currentChildById(childId);
    const bar = document.createElement("div");
    bar.className = "forms-wf-viewer-bar";
    bar.setAttribute("data-forms-wf-viewer-bar", "true");
    bar.innerHTML = `
      <p><strong>Saving for ${escapeHtml(child?.name || "this child")}</strong> — child is locked from the profile.</p>
      <button class="primary-button" type="button" data-forms-wf-save-viewer="${escapeHtml(resourceId)}" data-child-id="${escapeHtml(childId)}">Save to child file</button>
    `;
    body.prepend(bar);
  }

  function saveViewerFormToChild(resourceId, childId) {
    if (!enabled() || state.viewerSaving) return null;
    const lockedId = resolveLockedChildId(childId);
    const resource = formsWorkflowCatalog().find((item) => item.id === resourceId)
      || (typeof resources !== "undefined" ? resources.find((item) => item.id === resourceId) : null);
    if (!lockedId || !resource) return null;
    const saveBtn = document.querySelector("[data-forms-wf-save-viewer]");
    if (saveBtn?.dataset.formsWfSaved === "1") return null;
    if (saveBtn) saveBtn.dataset.formsWfSaved = "1";
    state.viewerSaving = true;
    try {
      const body = document.querySelector("#resourceViewerBody");
      const draftText = String(body?.innerText || resource.title).trim();
      const child = currentChildById(lockedId);
      const saved = saveCompletedFormRecord({
        childId: lockedId,
        resource,
        values: { childName: child?.name || "", date: new Date().toISOString().slice(0, 10) },
        draftText,
        extra: { source: "forms-center" },
      });
      if (typeof showActionFeedback === "function") showActionFeedback("Saved to child file.");
      if (typeof closeResourceViewer === "function") closeResourceViewer();
      if (typeof childProfileTab !== "undefined") childProfileTab = "forms-records";
      if (typeof selectedChildId !== "undefined") selectedChildId = lockedId;
      if (typeof renderChildManagement === "function") renderChildManagement();
      return saved;
    } finally {
      state.viewerSaving = false;
    }
  }

  function installWrappers() {
    wrapFunction("loadResources", (original) => function loadResourcesWrapped() {
      return withTesterForms(original.apply(this, arguments));
    });

    wrapFunction("formResourceContent", (original) => function formResourceContentWrapped(resource) {
      if (enabled() && resource && (resource.id === INJURY_FROM_HOME_ID || /injury or mark from home/i.test(String(resource.title || "")))) {
        return injuryFromHomePrintable(resource);
      }
      const text = original.apply(this, arguments);
      if (enabled() && resource && (resource.id === MEAL_TRACKING_ID || /meal tracking/i.test(String(resource.title || "")))) {
        return `${text}

Additional meals / snacks
Add extra entries as needed. Use any label that matches your setting (for example a mid-morning snack, bottle, or evening meal).
Label: ________________  Time: ________  Offered: ________________
Label: ________________  Time: ________  Offered: ________________`;
      }
      return text;
    });

    wrapFunction("categoryResources", (original) => function categoryResourcesWrapped(category) {
      const items = original.apply(this, arguments);
      if (!enabled() || category !== "Forms Library" || !Array.isArray(items)) return items;
      return items.filter((item) => !isFormTypeArchived(item.id));
    });

    wrapFunction("renderFormsSettingsPage", (original) => function renderFormsSettingsPageWrapped() {
      original.apply(this, arguments);
      if (!enabled()) return;
      const section = document.querySelector("#view-forms-settings");
      const form = section?.querySelector("#formsSettingsForm");
      if (!section || !form || section.querySelector("#formsWorkflowCatalogPanel")) return;
      form.insertAdjacentHTML("afterend", catalogManagerHtml());
    });

    wrapFunction("renderChildFormsRecordsTab", (original) => function renderChildFormsRecordsTabWrapped(child, records) {
      const html = original.apply(this, arguments);
      if (!enabled() || !child) return html;
      return `${childFillPickerHtml(child)}${html}`;
    });

    wrapFunction("renderHomeDaycareFormsPackList", (original) => function renderHomeDaycareFormsPackListWrapped(options = {}) {
      if (!enabled()) return original.apply(this, arguments);
      const { childId = "", showAddToFile = false, showAiDraft = false } = options;
      const entries = packEntriesForDisplay().filter((form) => !isFormTypeArchived(form.resourceId));
      return `
    <div class="hdh-forms-pack-list" role="list">
      ${entries.map((form) => `
        <article class="hdh-forms-pack-item" role="listitem">
          <div>
            <strong>${escapeHtml(form.title)}</strong>
            <p class="muted-copy">${escapeHtml(form.category)} — ${escapeHtml(form.description)}</p>
          </div>
          <div class="hdh-forms-pack-actions">
            <button class="ghost-button" type="button" data-hdh-open-form="${escapeHtml(form.resourceId)}">Open form</button>
            ${childId ? `<button class="primary-button" type="button" data-forms-wf-fill="${escapeHtml(form.resourceId)}" data-child-id="${escapeHtml(childId)}">Fill now</button>` : ""}
            ${showAiDraft ? `<button class="ghost-button" type="button" data-hdh-ai-draft="${escapeHtml(form.id)}"${childId ? ` data-child-id="${escapeHtml(childId)}"` : ""}>AI draft</button>` : ""}
            ${showAddToFile && childId ? `<button class="ghost-button" type="button" data-hdh-add-pack-form="${escapeHtml(form.id)}" data-child-id="${escapeHtml(childId)}">Add to file</button>` : ""}
          </div>
        </article>
      `).join("")}
    </div>
  `;
    });

    wrapFunction("collectHomeDaycareAiDraftFormState", (original) => function collectHomeDaycareAiDraftFormStateWrapped() {
      const result = original.apply(this, arguments);
      try {
        if (enabled() && hdhAiDraftState && hdhAiDraftState.lockedChildId) {
          hdhAiDraftState.childId = hdhAiDraftState.lockedChildId;
        }
      } catch (_error) { /* ignore */ }
      return result;
    });

    wrapFunction("renderHomeDaycareAiDraftPanel", (original) => function renderHomeDaycareAiDraftPanelWrapped(options = {}) {
      if (enabled() && options.childId) {
        try {
          hdhAiDraftState.lockedChildId = options.childId;
          hdhAiDraftState.childId = options.childId;
        } catch (_error) { /* ignore */ }
      }
      let html = original.apply(this, arguments);
      if (enabled() && options.childId) {
        html = html.replace(/<select name="childId">/, '<select name="childId" disabled aria-label="Child locked from profile">');
      }
      return html;
    });

    wrapFunction("openResourceViewer", (original) => async function openResourceViewerWrapped(resourceId, options = {}) {
      const result = await original.apply(this, arguments);
      if (enabled()) attachViewerChrome(resourceId, options);
      return result;
    });

    wrapFunction("renderFormsAttentionPanel", (original) => function renderFormsAttentionPanelWrapped() {
      let html = original.apply(this, arguments);
      if (!enabled() || !canManageFormCatalog()) return html;
      return html.replace(
        '<button class="ghost-button" type="button" data-view="forms">Browse Forms Library</button>',
        '<button class="ghost-button" type="button" data-view="forms">Browse Forms Library</button>\n        <button class="ghost-button" type="button" data-view="forms-settings">Manage Forms</button>',
      );
    });
  }

  function onClick(event) {
    if (!enabled()) return;
    const archiveBtn = event.target.closest("[data-forms-wf-archive]");
    if (archiveBtn) {
      event.preventDefault();
      setFormTypeArchived(archiveBtn.dataset.formsWfArchive, true);
      if (typeof renderFormsSettingsPage === "function") renderFormsSettingsPage();
      return;
    }
    const restoreBtn = event.target.closest("[data-forms-wf-restore]");
    if (restoreBtn) {
      event.preventDefault();
      setFormTypeArchived(restoreBtn.dataset.formsWfRestore, false);
      if (typeof renderFormsSettingsPage === "function") renderFormsSettingsPage();
      return;
    }
    const fillBtn = event.target.closest("[data-forms-wf-fill]");
    if (fillBtn) {
      event.preventDefault();
      launchFormForChild(fillBtn.dataset.childId, fillBtn.dataset.formsWfFill);
      return;
    }
    const addMeal = event.target.closest("[data-forms-wf-add-meal]");
    if (addMeal) {
      event.preventDefault();
      if (state.addingMeal) return;
      state.addingMeal = true;
      try {
        const form = document.querySelector("#formsWorkflowFillForm");
        state.mealEntries = [...collectMealEntriesFromForm(form || { querySelector: () => null }), { label: "", time: "", offered: "", amount: "" }];
        const child = currentChildById(form?.dataset.childId);
        const mount = form?.parentElement;
        if (mount && child) mount.innerHTML = structuredFillHtml(child, MEAL_TRACKING_ID);
      } finally {
        state.addingMeal = false;
      }
      return;
    }
    const saveViewer = event.target.closest("[data-forms-wf-save-viewer]");
    if (saveViewer) {
      event.preventDefault();
      saveViewerFormToChild(saveViewer.dataset.formsWfSaveViewer, saveViewer.dataset.childId);
    }
  }

  function onChange(event) {
    if (!enabled()) return;
    if (event.target.matches("[data-forms-wf-show-archived]")) {
      state.showArchivedCatalog = Boolean(event.target.checked);
      if (typeof renderFormsSettingsPage === "function") renderFormsSettingsPage();
    }
  }

  function onSubmit(event) {
    if (!enabled()) return;
    if (event.target.matches("#formsWorkflowPickForm")) {
      event.preventDefault();
      const childId = event.target.dataset.childId;
      const resourceId = String(event.target.resourceId?.value || "").trim();
      if (resourceId) launchFormForChild(childId, resourceId);
      return;
    }
    if (event.target.matches("#formsWorkflowFillForm")) {
      event.preventDefault();
      handleFillSubmit(event.target);
    }
  }

  function boot() {
    if (!enabled()) return;
    installWrappers();
    if (typeof resources !== "undefined" && Array.isArray(resources)) {
      const next = withTesterForms(resources);
      if (next !== resources) {
        resources.splice(0, resources.length, ...next);
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("submit", onSubmit);
  }

  if (typeof window !== "undefined") {
    window.LLH_FORMS_WORKFLOW_TESTER = {
      INJURY_FROM_HOME_ID,
      MEAL_TRACKING_ID,
      formsCareSettingNoun,
      isFormTypeArchived,
      setFormTypeArchived,
      defaultMealEntries,
      normalizeMealEntries,
      enabled,
      resolveLockedChildId,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
