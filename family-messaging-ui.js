/**
 * Phase 11 — Provider Family Messaging inbox (Director Center tab).
 * Improves family/provider messaging alongside the existing Messaging Center.
 */
(function initFamilyMessagingUI(global) {
  const TESTING_BANNER = "Testing Account — Fake Data Only.";
  const state = {
    inbox: null,
    filter: "inbox",
    thread: null,
    loading: false,
    error: "",
    notice: "",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function adminHeaders() {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    const token = global.localStorage?.getItem("llhAdminToken") || global.sessionStorage?.getItem("llhAdminToken") || "";
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function api(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: adminHeaders(),
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function panelHtml() {
    if (state.thread) {
      const conv = state.thread.conversation || {};
      return `
        <section class="fu-panel" data-fm-root>
          <button type="button" class="ghost-button" data-fm-back>← Inbox</button>
          <h2>${escapeHtml(conv.subject || "Conversation")}</h2>
          <p class="muted-copy">${escapeHtml(conv.type || "")} · Recipients: ${escapeHtml(String(state.thread.recipientCount ?? 0))}</p>
          ${conv.internalStaffOnly ? `<p class="fh-banner">Internal staff only — never sent to families.</p>` : ""}
          <ul class="fh-card-list">
            ${(state.thread.messages || []).map((msg) => `
              <li class="fh-card static ${msg.isInternalNote ? "fm-internal" : ""} ${msg.withdrawn ? "fh-withdrawn" : ""}">
                <strong>${escapeHtml(msg.isInternalNote ? "Internal note" : (msg.senderRole || "Message"))}</strong>
                <span>${escapeHtml((msg.sentAt || "").slice(0, 16).replace("T", " "))}${msg.edited ? " · Edited" : ""}</span>
                <p>${escapeHtml(msg.withdrawn ? (msg.withdrawnNotice || "Withdrawn") : (msg.body || ""))}</p>
                ${msg.withdrawn || msg.isInternalNote ? "" : `
                  <button type="button" class="ghost-button" data-fm-withdraw="${escapeHtml(msg.id)}">Withdraw</button>
                `}
              </li>
            `).join("")}
          </ul>
          <form class="fh-form" data-fm-reply>
            <label><input type="checkbox" name="internal" /> Internal staff note (never to families)</label>
            <label>Reply <textarea name="body" rows="3" required></textarea></label>
            <button type="submit" class="primary-button">Send</button>
          </form>
          <div class="fu-actions">
            <button type="button" class="ghost-button" data-fm-archive>Archive</button>
            <button type="button" class="ghost-button" data-fm-export>Export history</button>
          </div>
        </section>
      `;
    }
    const inbox = state.inbox || {};
    const filters = [
      ["inbox", "Inbox"],
      ["unread", "Unread"],
      ["families", "Families"],
      ["staff", "Staff"],
      ["announcements", "Announcements"],
      ["archived", "Archived"],
    ];
    return `
      <section class="fu-panel" data-fm-root>
        <p class="fh-banner">${escapeHtml(TESTING_BANNER)}</p>
        <h2>Family Messaging</h2>
        <p class="muted-copy">Org-scoped provider inbox. Platform Messaging Center is unchanged. Outbound email/SMS/push disabled.</p>
        <p>Unread: <strong>${escapeHtml(String(inbox.unreadCount || 0))}</strong></p>
        <div class="fh-filters">
          ${filters.map(([id, label]) => `
            <button type="button" class="fh-filter${state.filter === id ? " active" : ""}" data-fm-filter="${id}">${label}</button>
          `).join("")}
        </div>
        <form class="fh-form" data-fm-announce-preview>
          <h3>Announcement recipient confirmation</h3>
          <label>Classroom ID <input name="classroomId" placeholder="Optional classroom id" /></label>
          <button type="submit" class="ghost-button">Preview recipient count</button>
        </form>
        <ul class="fh-card-list">
          ${(inbox.conversations || []).map((row) => `
            <li>
              <button type="button" class="fh-card" data-fm-open="${escapeHtml(row.id)}">
                <strong>${escapeHtml(row.subject)}</strong>
                <span>${escapeHtml(row.type)}${row.internalStaffOnly ? " · internal" : ""} · ${escapeHtml(String(row.recipientCount || 0))} families</span>
              </button>
            </li>
          `).join("") || "<li class=\"muted-copy\">No conversations</li>"}
        </ul>
      </section>
    `;
  }

  async function refresh() {
    state.loading = true;
    state.error = "";
    try {
      await api("POST", "/api/director-center/family-messaging/seed", {});
      state.inbox = await api("GET", `/api/director-center/family-messaging/inbox?filter=${encodeURIComponent(state.filter)}`);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
    }
  }

  function bind(root) {
    root.querySelectorAll("[data-fm-filter]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.filter = button.getAttribute("data-fm-filter");
        state.thread = null;
        await refresh();
        global.renderDirectorCenterPreviewUI?.();
      });
    });
    root.querySelectorAll("[data-fm-open]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.thread = await api("GET", `/api/director-center/family-messaging/conversations/${encodeURIComponent(button.getAttribute("data-fm-open"))}`);
        global.renderDirectorCenterPreviewUI?.();
      });
    });
    root.querySelector("[data-fm-back]")?.addEventListener("click", async () => {
      state.thread = null;
      await refresh();
      global.renderDirectorCenterPreviewUI?.();
    });
    root.querySelector("[data-fm-reply]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      await api("POST", `/api/director-center/family-messaging/conversations/${encodeURIComponent(state.thread.conversation.id)}/reply`, {
        body: fd.get("body"),
        isInternalNote: event.target.internal?.checked === true,
      });
      state.thread = await api("GET", `/api/director-center/family-messaging/conversations/${encodeURIComponent(state.thread.conversation.id)}`);
      state.notice = "Sent to in-app inbox only.";
      global.renderDirectorCenterPreviewUI?.();
    });
    root.querySelectorAll("[data-fm-withdraw]").forEach((button) => {
      button.addEventListener("click", async () => {
        await api("POST", `/api/director-center/family-messaging/messages/${encodeURIComponent(button.getAttribute("data-fm-withdraw"))}/withdraw`, {});
        state.thread = await api("GET", `/api/director-center/family-messaging/conversations/${encodeURIComponent(state.thread.conversation.id)}`);
        global.renderDirectorCenterPreviewUI?.();
      });
    });
    root.querySelector("[data-fm-archive]")?.addEventListener("click", async () => {
      await api("POST", `/api/director-center/family-messaging/conversations/${encodeURIComponent(state.thread.conversation.id)}/archive`, {});
      state.thread = null;
      await refresh();
      global.renderDirectorCenterPreviewUI?.();
    });
    root.querySelector("[data-fm-export]")?.addEventListener("click", async () => {
      const exported = await api("POST", `/api/director-center/family-messaging/conversations/${encodeURIComponent(state.thread.conversation.id)}/export`, {});
      state.notice = `Export saved (${exported.export?.id || "ok"}).`;
      global.renderDirectorCenterPreviewUI?.();
    });
    root.querySelector("[data-fm-announce-preview]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const classroomId = new FormData(event.target).get("classroomId");
      const preview = await api("POST", "/api/director-center/family-messaging/announcements/preview", { classroomId });
      state.notice = preview.confirmation || `Intended recipients: ${preview.intendedRecipientCount}`;
      global.renderDirectorCenterPreviewUI?.();
    });
  }

  global.renderFamilyMessagingTab = async function renderFamilyMessagingTab(container) {
    if (!container) return;
    if (!state.inbox && !state.loading) await refresh();
    container.innerHTML = `
      ${state.error ? `<p class="fh-error">${escapeHtml(state.error)}</p>` : ""}
      ${state.notice ? `<p class="fh-notice">${escapeHtml(state.notice)}</p>` : ""}
      ${state.loading ? `<p class="muted-copy">Loading…</p>` : panelHtml()}
    `;
    const root = container.querySelector("[data-fm-root]");
    if (root) bind(root);
  };

  global.refreshFamilyMessagingTab = refresh;
})(typeof window !== "undefined" ? window : globalThis);
