/**
 * Phase 8 Family / Household / Guardian management UI (Director Center tab)
 * + guardian-session placeholder (Family Hub remains OFF).
 * Fake data only. No Family Hub navigation.
 */
(function initFamilyFoundationUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only.";

  const familyState = {
    overview: null,
    selectedHouseholdId: "",
    householdDetail: null,
    issuedPassword: "",
    issuedPasswordAccountId: "",
    invitationToken: "",
    invitationId: "",
    preview: null,
    panel: "households", // households | invitations | fake-accounts | history
    loading: false,
    error: "",
    notice: "",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function authHeaders() {
    const token = typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    if (!token || typeof hasAdminFullAccess !== "function" || !hasAdminFullAccess()) {
      throw new Error("Verified admin unlock is required.");
    }
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async function api(method, path, body) {
    const headers = await authHeaders();
    const response = await fetch(path, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function refreshFamilyOverview() {
    familyState.loading = true;
    familyState.error = "";
    try {
      familyState.overview = await api("GET", "/api/director-center/family/overview");
      if (familyState.selectedHouseholdId) {
        familyState.householdDetail = await api("GET", `/api/director-center/family/households/${familyState.selectedHouseholdId}`);
      }
    } catch (error) {
      familyState.error = error.message || "Could not load family foundation.";
    } finally {
      familyState.loading = false;
    }
  }

  function accessBadge(level) {
    const label = familyState.overview?.accessLevels?.[level] || level || "";
    return `<span class="ff-access-badge">${escapeHtml(label)}</span>`;
  }

  function householdsPanel() {
    const data = familyState.overview;
    if (!data) return `<p class="muted-copy">Loading households…</p>`;
    const households = data.households || [];
    const detail = familyState.householdDetail;
    return `
      <div class="ff-layout">
        <div class="ff-list-pane">
          <div class="ff-toolbar">
            <h3>Households</h3>
            <button type="button" class="ghost-button" data-ff-seed>Reset / seed fixtures</button>
          </div>
          <ul class="dc-list ff-household-list">
            ${households.map((hh) => `
              <li>
                <button type="button" class="ff-household-btn${familyState.selectedHouseholdId === hh.id ? " active" : ""}" data-ff-open-hh="${escapeHtml(hh.id)}">
                  <strong>${escapeHtml(hh.displayName)}</strong>
                  <span>${escapeHtml(hh.childCount)} children · ${escapeHtml(hh.contactCount)} contacts</span>
                </button>
              </li>
            `).join("")}
          </ul>
          <form class="dc-form ff-create-hh" data-ff-create-hh>
            <h4>Create household</h4>
            <label>Name <input name="displayName" required placeholder="New household name" /></label>
            <label>Notes <input name="notes" placeholder="Optional provider note" /></label>
            <button type="submit" class="primary-button">Create household</button>
          </form>
        </div>
        <div class="ff-detail-pane">
          ${detail ? householdDetailHtml(detail) : `<p class="muted-copy">Select a household to manage guardians, access, and children.</p>`}
        </div>
      </div>
    `;
  }

  function householdDetailHtml(detail) {
    const hh = detail.household || {};
    const children = detail.children || [];
    const members = detail.members || [];
    const rules = detail.accessRules || [];
    const childOptions = (familyState.overview?.children || []).map((child) => (
      `<option value="${escapeHtml(child.id)}">${escapeHtml(child.displayName)}</option>`
    )).join("");
    return `
      <article class="ff-detail" data-ff-household-id="${escapeHtml(hh.id)}">
        <header class="ff-detail-header">
          <div>
            <p class="ff-kicker">${escapeHtml(TESTING_BANNER)}</p>
            <h3>${escapeHtml(hh.displayName)}</h3>
            <p class="muted-copy">${escapeHtml(hh.notes || "Provider-entered household. Not a legal custody determination.")}</p>
          </div>
        </header>
        <section class="ff-section">
          <h4>Children in household</h4>
          <ul class="dc-list compact">
            ${children.length ? children.map((row) => `
              <li><strong>${escapeHtml(row.displayName || row.childId)}</strong>
              ${row.sharedCustodyNote ? `<span class="muted-copy"> — ${escapeHtml(row.sharedCustodyNote)}</span>` : ""}</li>
            `).join("") : "<li>No children linked yet.</li>"}
          </ul>
          <form class="dc-form inline" data-ff-link-child>
            <label>Connect child
              <select name="childId" required>${childOptions}</select>
            </label>
            <label>Shared-custody note <input name="sharedCustodyNote" placeholder="Optional provider note" /></label>
            <button type="submit" class="ghost-button">Connect child</button>
          </form>
        </section>
        <section class="ff-section">
          <h4>Guardians & contacts</h4>
          <ul class="dc-list">
            ${members.map((row) => {
              const c = row.contact || {};
              return `<li>
                <strong>${escapeHtml(c.displayName || "")}</strong>
                <span class="muted-copy">${escapeHtml(c.email || "")}</span>
                <button type="button" class="ghost-button" data-ff-preview="${escapeHtml(c.id)}">Preview access</button>
              </li>`;
            }).join("")}
          </ul>
          <form class="dc-form" data-ff-add-contact>
            <h5>Add guardian / contact</h5>
            <div class="ff-form-grid">
              <label>Name <input name="displayName" required /></label>
              <label>Email <input name="email" type="email" placeholder="name@example.invalid" required /></label>
              <label>Phone <input name="phone" /></label>
              <label>Child
                <select name="childId">${childOptions}</select>
              </label>
              <label>Access level
                <select name="accessLevel">
                  ${Object.entries(familyState.overview?.accessLevels || {}).map(([key, label]) => (
                    `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`
                  )).join("")}
                </select>
              </label>
              <label class="ff-check"><input type="checkbox" name="isEmergencyContact" /> Emergency contact</label>
              <label class="ff-check"><input type="checkbox" name="isAuthorizedPickup" /> Authorized pickup</label>
              <label class="ff-check"><input type="checkbox" name="isFinanciallyResponsible" /> Financially responsible</label>
              <label class="ff-check"><input type="checkbox" name="isLegalGuardianAsEntered" /> Legal guardian (as entered)</label>
            </div>
            <button type="submit" class="primary-button">Add contact</button>
          </form>
        </section>
        <section class="ff-section">
          <h4>Child-specific access</h4>
          <ul class="dc-list">
            ${rules.map((rule) => `
              <li class="ff-rule-row">
                <div>
                  <strong>${escapeHtml(rule.contactName)}</strong> → ${escapeHtml(rule.childName)}
                  ${accessBadge(rule.accessLevel)}
                  <span class="muted-copy">${escapeHtml(rule.status)}</span>
                </div>
                <div class="ff-rule-actions">
                  <button type="button" class="ghost-button" data-ff-access-action="suspend" data-ff-rule="${escapeHtml(rule.id)}">Suspend</button>
                  <button type="button" class="ghost-button" data-ff-access-action="restore" data-ff-rule="${escapeHtml(rule.id)}">Restore</button>
                  <button type="button" class="ghost-button" data-ff-access-action="end" data-ff-rule="${escapeHtml(rule.id)}">End</button>
                </div>
              </li>
            `).join("")}
          </ul>
        </section>
        ${familyState.preview ? `
          <section class="ff-section ff-preview-box">
            <h4>Access preview</h4>
            <p class="muted-copy">${escapeHtml(familyState.preview.placeholderMessage || "")}</p>
            <ul class="dc-list compact">
              ${(familyState.preview.children || []).map((row) => `
                <li>${escapeHtml(row.childDisplayName)} — ${escapeHtml(row.accessLevelLabel)}
                  · forms: ${row.wouldSeeForms ? "yes" : "no"}
                  · Family Hub: OFF</li>
              `).join("")}
            </ul>
          </section>
        ` : ""}
      </article>
    `;
  }

  function invitationsPanel() {
    const invitations = familyState.overview?.invitations || [];
    const contacts = familyState.overview?.contacts || [];
    return `
      <section class="dc-panel">
        <h3>Account invitations (no email/SMS)</h3>
        <p class="muted-copy">Generate expiring invitations. Tokens are shown once. Family Hub remains OFF.</p>
        <form class="dc-form" data-ff-invite>
          <label>Guardian contact
            <select name="contactId" required>
              ${contacts.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.displayName)} (${escapeHtml(c.email)})</option>`).join("")}
            </select>
          </label>
          <button type="submit" class="primary-button">Create invitation</button>
        </form>
        ${familyState.invitationToken ? `
          <div class="ff-once-secret" role="status">
            <strong>Testing token (shown once):</strong>
            <code>${escapeHtml(familyState.invitationToken)}</code>
            <p class="muted-copy">Invitation id: ${escapeHtml(familyState.invitationId)}</p>
          </div>
        ` : ""}
        <ul class="dc-list">
          ${invitations.map((inv) => `
            <li>
              <strong>${escapeHtml(inv.status)}</strong>
              · contact ${escapeHtml(inv.contactId)}
              · expires ${escapeHtml(inv.expiresAt || "—")}
              <button type="button" class="ghost-button" data-ff-revoke-inv="${escapeHtml(inv.id)}">Revoke</button>
              <button type="button" class="ghost-button" data-ff-regen-inv="${escapeHtml(inv.id)}">Regenerate</button>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function fakeAccountsPanel() {
    const accounts = familyState.overview?.fakeAccounts || [];
    return `
      <section class="dc-panel">
        <h3>Safe fake accounts</h3>
        <p class="ff-banner">${escapeHtml(TESTING_BANNER)}</p>
        <p class="muted-copy">Passwords are never stored in source. Issue a temporary password once, then use normal login. Admin role is not changed.</p>
        ${familyState.issuedPassword ? `
          <div class="ff-once-secret" role="status">
            <strong>Temporary password (shown once):</strong>
            <code data-ff-issued-password>${escapeHtml(familyState.issuedPassword)}</code>
            <p class="muted-copy">Account: ${escapeHtml(familyState.issuedPasswordAccountId)}</p>
          </div>
        ` : ""}
        <ul class="dc-list">
          ${accounts.map((acct) => `
            <li class="ff-fake-row">
              <div>
                <strong>${escapeHtml(acct.displayName)}</strong>
                <span class="muted-copy">${escapeHtml(acct.kind)} · ${escapeHtml(acct.email)}</span>
                <span class="ff-access-badge">${escapeHtml(acct.label)}</span>
              </div>
              <button type="button" class="primary-button" data-ff-issue-pw="${escapeHtml(acct.id)}">Issue / reset password</button>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function renderFamiliesTabHtml() {
    return `
      <div class="ff-shell" data-ff-shell>
        <div class="ff-banner">${escapeHtml(TESTING_BANNER)} · Family Hub is OFF · No email/SMS</div>
        <nav class="dc-subnav ff-subnav" aria-label="Family foundation sections">
          <button type="button" class="dc-subnav-btn${familyState.panel === "households" ? " active" : ""}" data-ff-panel="households">Households & guardians</button>
          <button type="button" class="dc-subnav-btn${familyState.panel === "invitations" ? " active" : ""}" data-ff-panel="invitations">Invitations</button>
          <button type="button" class="dc-subnav-btn${familyState.panel === "fake-accounts" ? " active" : ""}" data-ff-panel="fake-accounts">Fake accounts</button>
        </nav>
        ${familyState.error ? `<p class="dc-error" role="alert">${escapeHtml(familyState.error)}</p>` : ""}
        ${familyState.notice ? `<p class="ff-notice" role="status">${escapeHtml(familyState.notice)}</p>` : ""}
        ${familyState.loading ? `<p class="muted-copy">Loading…</p>` : ""}
        ${familyState.panel === "households" ? householdsPanel() : ""}
        ${familyState.panel === "invitations" ? invitationsPanel() : ""}
        ${familyState.panel === "fake-accounts" ? fakeAccountsPanel() : ""}
      </div>
    `;
  }

  function bindFamiliesTab(root) {
    if (!root) return;
    root.querySelectorAll("[data-ff-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        familyState.panel = button.getAttribute("data-ff-panel");
        familyState.notice = "";
        if (typeof global.renderDirectorCenterPreviewUI === "function") {
          global.renderDirectorCenterPreviewUI();
        }
      });
    });
    root.querySelector("[data-ff-seed]")?.addEventListener("click", async () => {
      try {
        await api("POST", "/api/director-center/family/seed", { reset: true });
        familyState.notice = "Phase 8 fixtures reset and reseeded.";
        familyState.selectedHouseholdId = "";
        familyState.householdDetail = null;
        await refreshFamilyOverview();
        global.renderDirectorCenterPreviewUI();
      } catch (error) {
        familyState.error = error.message;
        global.renderDirectorCenterPreviewUI();
      }
    });
    root.querySelectorAll("[data-ff-open-hh]").forEach((button) => {
      button.addEventListener("click", async () => {
        familyState.selectedHouseholdId = button.getAttribute("data-ff-open-hh");
        familyState.preview = null;
        try {
          familyState.householdDetail = await api("GET", `/api/director-center/family/households/${familyState.selectedHouseholdId}`);
        } catch (error) {
          familyState.error = error.message;
        }
        global.renderDirectorCenterPreviewUI();
      });
    });
    root.querySelector("[data-ff-create-hh]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const displayName = form.displayName.value.trim();
      const notes = form.notes.value.trim();
      try {
        const created = await api("POST", "/api/director-center/family/households", { displayName, notes });
        familyState.selectedHouseholdId = created.household.id;
        familyState.notice = "Household created.";
        await refreshFamilyOverview();
        global.renderDirectorCenterPreviewUI();
      } catch (error) {
        familyState.error = error.message;
        global.renderDirectorCenterPreviewUI();
      }
    });
    root.querySelector("[data-ff-link-child]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("POST", "/api/director-center/family/link-child", {
          householdId: familyState.selectedHouseholdId,
          childId: form.childId.value,
          sharedCustodyNote: form.sharedCustodyNote.value,
        });
        familyState.notice = "Child connected to household.";
        await refreshFamilyOverview();
        global.renderDirectorCenterPreviewUI();
      } catch (error) {
        familyState.error = error.message;
        global.renderDirectorCenterPreviewUI();
      }
    });
    root.querySelector("[data-ff-add-contact]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("POST", "/api/director-center/family/contacts", {
          householdId: familyState.selectedHouseholdId,
          displayName: form.displayName.value,
          email: form.email.value,
          phone: form.phone.value,
          childId: form.childId.value,
          accessLevel: form.accessLevel.value,
          isEmergencyContact: form.isEmergencyContact.checked,
          isAuthorizedPickup: form.isAuthorizedPickup.checked,
          isFinanciallyResponsible: form.isFinanciallyResponsible.checked,
          isLegalGuardianAsEntered: form.isLegalGuardianAsEntered.checked,
          verificationStatus: "verified",
        });
        familyState.notice = "Contact added with child-specific access.";
        await refreshFamilyOverview();
        global.renderDirectorCenterPreviewUI();
      } catch (error) {
        familyState.error = error.message;
        global.renderDirectorCenterPreviewUI();
      }
    });
    root.querySelectorAll("[data-ff-access-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("PATCH", `/api/director-center/family/access/${button.getAttribute("data-ff-rule")}`, {
            action: button.getAttribute("data-ff-access-action"),
            reason: "Updated from Director Center Families tab.",
          });
          familyState.notice = "Access updated. History preserved.";
          await refreshFamilyOverview();
          global.renderDirectorCenterPreviewUI();
        } catch (error) {
          familyState.error = error.message;
          global.renderDirectorCenterPreviewUI();
        }
      });
    });
    root.querySelectorAll("[data-ff-preview]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const data = await api("GET", `/api/director-center/family/preview/${button.getAttribute("data-ff-preview")}`);
          familyState.preview = data.preview;
          global.renderDirectorCenterPreviewUI();
        } catch (error) {
          familyState.error = error.message;
          global.renderDirectorCenterPreviewUI();
        }
      });
    });
    root.querySelector("[data-ff-invite]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const data = await api("POST", "/api/director-center/family/invitations", {
          contactId: form.contactId.value,
        });
        familyState.invitationToken = data.testingToken || "";
        familyState.invitationId = data.invitation?.id || "";
        familyState.notice = "Invitation created. Token shown once — no email sent.";
        await refreshFamilyOverview();
        global.renderDirectorCenterPreviewUI();
      } catch (error) {
        familyState.error = error.message;
        global.renderDirectorCenterPreviewUI();
      }
    });
    root.querySelectorAll("[data-ff-revoke-inv]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await api("POST", `/api/director-center/family/invitations/${button.getAttribute("data-ff-revoke-inv")}/revoke`, {});
          familyState.notice = "Invitation revoked.";
          await refreshFamilyOverview();
          global.renderDirectorCenterPreviewUI();
        } catch (error) {
          familyState.error = error.message;
          global.renderDirectorCenterPreviewUI();
        }
      });
    });
    root.querySelectorAll("[data-ff-regen-inv]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const data = await api("POST", `/api/director-center/family/invitations/${button.getAttribute("data-ff-regen-inv")}/regenerate`, {});
          familyState.invitationToken = data.testingToken || "";
          familyState.invitationId = data.invitation?.id || "";
          familyState.notice = "Invitation regenerated. Previous token invalidated.";
          await refreshFamilyOverview();
          global.renderDirectorCenterPreviewUI();
        } catch (error) {
          familyState.error = error.message;
          global.renderDirectorCenterPreviewUI();
        }
      });
    });
    root.querySelectorAll("[data-ff-issue-pw]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const data = await api("POST", `/api/director-center/family/fake-accounts/${button.getAttribute("data-ff-issue-pw")}/issue-password`, {});
          familyState.issuedPassword = data.temporaryPassword || "";
          familyState.issuedPasswordAccountId = data.fakeAccount?.email || "";
          familyState.notice = "Temporary password issued once. Use normal login for testing.";
          await refreshFamilyOverview();
          global.renderDirectorCenterPreviewUI();
        } catch (error) {
          familyState.error = error.message;
          global.renderDirectorCenterPreviewUI();
        }
      });
    });
  }

  async function ensureFamiliesLoaded() {
    if (!familyState.overview) await refreshFamilyOverview();
  }

  // ─── Guardian session placeholder (not Family Hub) ───────────────────────

  async function renderGuardianSessionPlaceholder() {
    const section = document.querySelector("#view-guardian-session");
    if (!section) return;
    const memberToken = global.localStorage?.getItem("llhMemberSessionToken") || "";
    const email = global.localStorage?.getItem("llhUser") || "";
    let payload = null;
    let error = "";
    try {
      const headers = { Accept: "application/json" };
      if (memberToken) headers.Authorization = `Bearer ${memberToken}`;
      else if (email) headers.Authorization = `Bearer test:${email}`;
      const response = await fetch("/api/family-foundation/guardian-session", { headers, cache: "no-store" });
      payload = await response.json().catch(() => ({}));
      if (!response.ok) error = payload.error || "Could not load guardian session.";
    } catch (err) {
      error = err.message || "Could not load guardian session.";
    }
    section.innerHTML = `
      <section class="ff-guardian-placeholder">
        <p class="ff-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h1>Account connected</h1>
        <p class="ff-hero-copy">${escapeHtml(payload?.placeholderMessage || "Your account is connected. The Family Hub experience will be added in the next phase.")}</p>
        ${error ? `<p class="dc-error" role="alert">${escapeHtml(error)}</p>` : ""}
        ${payload?.allowedFormChildren?.length ? `
          <div class="ff-forms-note">
            <h2>Permitted forms</h2>
            <p class="muted-copy">${escapeHtml(payload.formsNote || "")}</p>
            <ul>
              ${payload.allowedFormChildren.map((row) => `
                <li>${escapeHtml(row.childDisplayName)} · ${escapeHtml(row.accessLevel)}</li>
              `).join("")}
            </ul>
          </div>
        ` : `<p class="muted-copy">${escapeHtml(payload?.formsNote || "Family Hub navigation is hidden until a later phase.")}</p>`}
        <p class="muted-copy">Family Hub remains OFF. Unfinished family navigation is not shown.</p>
      </section>
    `;
  }

  global.renderFamilyFoundationTabHtml = renderFamiliesTabHtml;
  global.bindFamilyFoundationTab = bindFamiliesTab;
  global.refreshFamilyFoundationTab = refreshFamilyOverview;
  global.ensureFamilyFoundationLoaded = ensureFamiliesLoaded;
  global.renderGuardianSessionPlaceholder = renderGuardianSessionPlaceholder;
  global.familyFoundationUiState = familyState;
})(typeof window !== "undefined" ? window : globalThis);
