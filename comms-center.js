/**
 * Little Learner Hub — Communication Center (browser module)
 * Classic script: no imports. Relies on globals from app.js when present.
 * Exposes: LLHDrafts, renderMyMessagesCenter, renderChangelogPage,
 * renderFoundingMemberExperience, and admin panel helpers.
 */
(function (window, document) {
  "use strict";

  // ─── Local fallbacks for app.js helpers ─────────────────────────────────────

  function _escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtml(value) {
    return typeof window.escapeHtml === "function" ? window.escapeHtml(value) : _escapeHtml(value);
  }

  function isLoggedIn() {
    return typeof window.isLoggedIn === "function" ? window.isLoggedIn() : Boolean(window.currentUser);
  }

  function currentUserEmail() {
    if (typeof window.currentUser === "string" && window.currentUser) return window.currentUser;
    if (typeof window.currentUser === "function") {
      const v = window.currentUser();
      if (typeof v === "string") return v;
    }
    try {
      const account = typeof window.currentAccount === "function" ? window.currentAccount() : null;
      return String(account?.email || "").toLowerCase();
    } catch {
      return "";
    }
  }

  function currentAccountSafe() {
    try {
      return typeof window.currentAccount === "function" ? window.currentAccount() : null;
    } catch {
      return null;
    }
  }

  function canUseLaunchBackend() {
    return typeof window.canUseLaunchBackend === "function" ? window.canUseLaunchBackend() : true;
  }

  async function staffAuthHeaders() {
    if (typeof window.staffAuthHeaders === "function") {
      return window.staffAuthHeaders();
    }
    const email = currentUserEmail();
    if (!email) return null;
    return {
      "Content-Type": "application/json",
      "X-LLH-User-Email": email,
      Authorization: `Bearer test:${email}`,
    };
  }

  function adminToken() {
    try {
      const session = typeof window.adminSession === "function" ? window.adminSession() : null;
      return session?.token || "";
    } catch {
      return "";
    }
  }

  function isAdminUnlocked() {
    return typeof window.isAdminUnlocked === "function"
      ? window.isAdminUnlocked()
      : localStorage.getItem("llhAdminUnlocked") === "true";
  }

  function hasAdminFullAccess() {
    return typeof window.hasAdminFullAccess === "function"
      ? window.hasAdminFullAccess()
      : isAdminUnlocked();
  }

  function setFormMessage(elOrSel, message, isSuccess = false) {
    if (typeof window.setFormMessage === "function") {
      window.setFormMessage(elOrSel, message, isSuccess);
      return;
    }
    const el = typeof elOrSel === "string" ? document.querySelector(elOrSel) : elOrSel;
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-success", Boolean(isSuccess));
    el.classList.toggle("is-error", Boolean(message) && !isSuccess);
  }

  function displayUserName(user) {
    if (typeof window.displayUserName === "function") return window.displayUserName(user);
    const first = String(user?.firstName || "").trim();
    const last = String(user?.lastName || "").trim();
    return [first, last].filter(Boolean).join(" ") || user?.name || user?.email || "Provider";
  }

  function messagingRelativeTime(iso) {
    if (typeof window.messagingRelativeTime === "function") return window.messagingRelativeTime(iso);
    const then = new Date(iso || "").getTime();
    if (!Number.isFinite(then)) return "";
    const diffMs = Date.now() - then;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diffMs < minute) return "Just now";
    if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`;
    if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
    if (diffMs < 7 * day) return `${Math.round(diffMs / day)}d ago`;
    return new Date(then).toLocaleDateString();
  }

  function trackEvent(name, detail) {
    if (typeof window.trackEvent === "function") window.trackEvent(name, detail);
  }

  async function confirmAction(options) {
    if (typeof window.confirmAction === "function") return window.confirmAction(options);
    return window.confirm(options?.message || options?.title || "Are you sure?");
  }

  function openFeedbackModal(type) {
    if (typeof window.openFeedbackModal === "function") {
      window.openFeedbackModal(type);
      return;
    }
    console.warn("openFeedbackModal unavailable", type);
  }

  function foundingSpotsRemainingSafe() {
    if (typeof window.foundingSpotsRemaining === "function") {
      try { return Number(window.foundingSpotsRemaining()) || 0; } catch { return 0; }
    }
    return 0;
  }

  function isProUserSafe() {
    return typeof window.isProUser === "function" ? window.isProUser() : false;
  }

  function refreshNotificationBellSafe() {
    if (typeof window.refreshNotificationBell === "function") window.refreshNotificationBell();
  }

  function setViewSafe(view, options) {
    if (typeof window.setView === "function") window.setView(view, options);
  }

  function debounce(fn, ms) {
    let t = null;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ─── Status vocab (aligned with server/comms-lib.js) ────────────────────────

  const FEATURE_REQUEST_STATUSES = Object.freeze([
    "New", "Under Review", "Planned", "In Progress", "Completed", "Declined",
  ]);

  const BUG_REPORT_STATUSES = Object.freeze([
    "New", "Investigating", "Fix In Progress", "Fixed", "Closed",
  ]);

  const USER_TAG_PRESETS = Object.freeze([
    "Founding Member", "Free User", "Trial User", "Pro User",
    "Home Daycare", "Center", "Director", "Staff",
    "Needs Follow-Up", "Highly Engaged",
  ]);

  const CHANGELOG_CATEGORY_MAP = Object.freeze([
    { key: "featuresAdded", label: "New Features" },
    { key: "improvements", label: "Improvements" },
    { key: "bugsFixed", label: "Bug Fixes" },
    { key: "lessonPlanAdditions", label: "Lesson Plan Additions" },
    { key: "activityAdditions", label: "Activity Additions" },
  ]);

  const DEFAULT_MESSAGE_TEMPLATES = Object.freeze([
    { id: "welcome", label: "Welcome Message", subject: "Welcome to Little Learner Hub!", body: "Hi! Welcome to Little Learner Hub. We're so glad you're here. Reply anytime if you need help getting started." },
    { id: "trial-welcome", label: "Trial Welcome", subject: "Your trial has started", body: "Welcome to your Little Learner Hub trial! Explore lesson plans, activities, and the calendar — we're here if you need anything." },
    { id: "founding-welcome", label: "Founding Member Welcome", subject: "Thank you, Founding Member!", body: "Thank you for joining as a Founding Member. You have $9.99/month locked while your membership remains continuously active and early access to new features as we grow." },
    { id: "billing", label: "Billing Response", subject: "About your billing question", body: "Thanks for reaching out about billing. I've looked into your account and wanted to follow up personally." },
    { id: "password-help", label: "Password Help", subject: "Password help", body: "Sorry you're having trouble signing in. Try resetting your password from the login screen — if that doesn't work, reply here and I'll help." },
    { id: "support-follow-up", label: "Support Follow-Up", subject: "Just checking in", body: "Hi! Just following up on your support request. Did that resolve things, or can I help with anything else?" },
    { id: "feature-thanks", label: "Feature Request Thank You", subject: "Thanks for your feature idea", body: "Thank you for the feature request! We've logged it and will review it as we plan upcoming updates." },
    { id: "bug-response", label: "Bug Report Response", subject: "Thanks for reporting this", body: "Thanks for reporting this issue. We're looking into it and will update you when it's fixed." },
    { id: "upgrade", label: "Subscription Upgrade Message", subject: "Ready to unlock more?", body: "If you're enjoying Little Learner Hub, upgrading unlocks the full lesson library, activities, and planning tools. Happy to answer any questions!" },
    { id: "check-in", label: "Check-In", subject: "Just checking in", body: "Hi! Just checking in to see how you're enjoying Little Learner Hub. We'd love your feedback." },
    { id: "new-features", label: "New Features", subject: "New features this week", body: "We've added new lesson plans and activities this week!" },
    { id: "bug-fixed", label: "Bug Fixed", subject: "Bug fixed", body: "Thanks for reporting this issue. It has now been fixed." },
  ]);

  // ─── 1. Universal Draft Engine (window.LLHDrafts) ────────────────────────────

  const DRAFT_INTERVAL_MS = 3000;
  const DRAFT_INPUT_DEBOUNCE_MS = 600;
  const attachedDraftForms = new WeakMap();
  const dirtyDraftForms = new Set();

  function draftOwnerKey() {
    return currentUserEmail() || "guest";
  }

  function draftStorageKey(form) {
    const scope = form.getAttribute("data-draft-scope") || "app";
    const formId = form.getAttribute("data-draft-form") || form.id || "form";
    return `llh-draft:${scope}:${formId}:${draftOwnerKey()}`;
  }

  function draftFormMeta(form) {
    return {
      scope: form.getAttribute("data-draft-scope") || "app",
      formId: form.getAttribute("data-draft-form") || form.id || "form",
      ownerEmail: draftOwnerKey(),
    };
  }

  function serializeFormDraft(form) {
    const data = {};
    const elements = form.querySelectorAll("input, textarea, select");
    elements.forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === "password" || el.type === "file") return;
      if (el.type === "checkbox") {
        data[el.name] = el.checked;
        return;
      }
      if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
        return;
      }
      data[el.name] = el.value;
    });
    return {
      ...draftFormMeta(form),
      fields: data,
      savedAt: new Date().toISOString(),
    };
  }

  function applyDraftFields(form, fields) {
    if (!fields || typeof fields !== "object") return false;
    let applied = false;
    Object.keys(fields).forEach((name) => {
      const nodes = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      if (!nodes.length) return;
      nodes.forEach((el) => {
        if (el.type === "checkbox") {
          el.checked = Boolean(fields[name]);
          applied = true;
          return;
        }
        if (el.type === "radio") {
          el.checked = el.value === fields[name];
          if (el.checked) applied = true;
          return;
        }
        if (el.value !== String(fields[name] ?? "")) {
          el.value = fields[name] == null ? "" : String(fields[name]);
        }
        applied = true;
      });
    });
    return applied;
  }

  function setDraftStatus(form, text) {
    const status = form.querySelector("[data-draft-status]")
      || form.parentElement?.querySelector(`[data-draft-status][data-draft-for="${form.getAttribute("data-draft-form") || ""}"]`);
    if (status) status.textContent = text || "";
  }

  function readLocalDraft(form) {
    try {
      const raw = localStorage.getItem(draftStorageKey(form));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeLocalDraft(form, payload) {
    try {
      localStorage.setItem(draftStorageKey(form), JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function clearLocalDraft(form) {
    try {
      localStorage.removeItem(draftStorageKey(form));
    } catch { /* ignore */ }
  }

  async function syncDraftToServer(localPayload) {
    if (!isLoggedIn() || !canUseLaunchBackend()) return null;
    const headers = await staffAuthHeaders();
    if (!headers) return null;
    // Server expects { scope, formId, payload } (see server/comms-api.js).
    const body = {
      scope: localPayload.scope,
      formId: localPayload.formId,
      payload: { fields: localPayload.fields || {}, savedAt: localPayload.savedAt },
    };
    if (localPayload.scope === "admin") {
      const token = adminToken();
      if (token) body.adminToken = token;
    }
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await res.json().catch(() => ({}));
    } catch {
      return null;
    }
  }

  function normalizeServerDraft(raw) {
    if (!raw) return null;
    const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
    const fields = payload.fields && typeof payload.fields === "object"
      ? payload.fields
      : (raw.fields && typeof raw.fields === "object" ? raw.fields : payload);
    return {
      scope: raw.scope || "",
      formId: raw.formId || "",
      fields,
      savedAt: payload.savedAt || raw.updatedAt || raw.createdAt || "",
    };
  }

  async function fetchServerDraft(form) {
    if (!isLoggedIn() || !canUseLaunchBackend()) return null;
    const headers = await staffAuthHeaders();
    if (!headers) return null;
    const meta = draftFormMeta(form);
    const params = new URLSearchParams({
      scope: meta.scope,
      formId: meta.formId,
    });
    if (meta.scope === "admin") {
      const token = adminToken();
      if (token) params.set("adminToken", token);
    }
    try {
      const res = await fetch(`/api/drafts?${params}`, { headers, cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.drafts) ? data.drafts : [];
      const first = data.draft || list[0] || null;
      return normalizeServerDraft(first);
    } catch {
      return null;
    }
  }

  async function clearServerDraft(form) {
    if (!isLoggedIn() || !canUseLaunchBackend()) return;
    const headers = await staffAuthHeaders();
    if (!headers) return;
    const meta = draftFormMeta(form);
    const body = { ...meta };
    if (meta.scope === "admin") {
      const token = adminToken();
      if (token) body.adminToken = token;
    }
    try {
      // Prefer POST — some proxies drop DELETE bodies.
      await fetch("/api/drafts/delete", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch { /* ignore */ }
  }

  function markDraftDirty(form) {
    dirtyDraftForms.add(form);
  }

  function markDraftClean(form) {
    dirtyDraftForms.delete(form);
  }

  const LLHDrafts = {
    detach(form) {
      if (!form || !attachedDraftForms.has(form)) return;
      const state = attachedDraftForms.get(form);
      if (state?.intervalId) clearInterval(state.intervalId);
      attachedDraftForms.delete(form);
      dirtyDraftForms.delete(form);
    },

    attach(form) {
      if (!form || !(form instanceof HTMLFormElement)) return;
      if (!form.hasAttribute("data-draft-form")) return;
      if (attachedDraftForms.has(form)) return;

      const state = {
        intervalId: null,
        saving: false,
        lastSavedAt: "",
        restoreToken: 0,
      };

      const saveDebounced = debounce(() => {
        markDraftDirty(form);
        LLHDrafts.save(form);
      }, DRAFT_INPUT_DEBOUNCE_MS);

      const onInput = () => {
        markDraftDirty(form);
        saveDebounced();
      };

      form.addEventListener("input", onInput);
      form.addEventListener("change", onInput);
      form.addEventListener("submit", () => {
        // Do not mark clean here — only clear after a successful send.
      });

      state.intervalId = setInterval(() => {
        if (!document.body.contains(form)) {
          LLHDrafts.detach(form);
          return;
        }
        if (dirtyDraftForms.has(form)) {
          LLHDrafts.save(form);
        }
      }, DRAFT_INTERVAL_MS);

      attachedDraftForms.set(form, state);
      LLHDrafts.restore(form);
    },

    async save(form) {
      if (!form || !attachedDraftForms.has(form) && !form.hasAttribute("data-draft-form")) return false;
      const state = attachedDraftForms.get(form);
      if (state?.saving) return false;
      if (state) state.saving = true;
      try {
        const payload = serializeFormDraft(form);
        const hasContent = Object.values(payload.fields || {}).some((v) => {
          if (typeof v === "boolean") return v;
          return String(v || "").trim().length > 0;
        });
        if (!hasContent) {
          // Empty form means the user cleared it — remove stale drafts so they do not revive.
          clearLocalDraft(form);
          await clearServerDraft(form);
          markDraftClean(form);
          setDraftStatus(form, "");
          return false;
        }
        writeLocalDraft(form, payload);
        await syncDraftToServer(payload);
        markDraftClean(form);
        if (state) state.lastSavedAt = payload.savedAt;
        setDraftStatus(form, "Draft saved");
        return true;
      } finally {
        if (state) state.saving = false;
      }
    },

    async clear(form) {
      if (!form) return;
      clearLocalDraft(form);
      await clearServerDraft(form);
      markDraftClean(form);
      setDraftStatus(form, "");
    },

    /** Synchronously persist the current form fields to localStorage (no server round-trip). */
    flushLocal(form) {
      if (!form || !(form instanceof HTMLFormElement)) return false;
      const payload = serializeFormDraft(form);
      const hasContent = Object.values(payload.fields || {}).some((v) => {
        if (typeof v === "boolean") return v;
        return String(v || "").trim().length > 0;
      });
      if (!hasContent) {
        clearLocalDraft(form);
        return false;
      }
      writeLocalDraft(form, payload);
      return true;
    },

    async restore(form) {
      if (!form) return false;
      const state = attachedDraftForms.get(form);
      const restoreToken = (state?.restoreToken || 0) + 1;
      if (state) state.restoreToken = restoreToken;

      // Never overwrite what the user is actively typing.
      const activeEl = document.activeElement;
      if (activeEl && form.contains(activeEl) && ["INPUT", "TEXTAREA"].includes(activeEl.tagName)) {
        const currentValue = String(activeEl.value || "").trim();
        if (currentValue) return false;
      }
      const liveFields = serializeFormDraft(form).fields || {};
      const liveHasContent = Object.values(liveFields).some((v) => {
        if (typeof v === "boolean") return v;
        return String(v || "").trim().length > 0;
      });
      if (liveHasContent && dirtyDraftForms.has(form)) return false;

      let draft = readLocalDraft(form);
      const serverDraft = await fetchServerDraft(form);
      if (state && state.restoreToken !== restoreToken) return false;
      if (serverDraft?.fields) {
        const localAt = new Date(draft?.savedAt || 0).getTime();
        const serverAt = new Date(serverDraft.savedAt || serverDraft.updatedAt || 0).getTime();
        if (!draft || serverAt >= localAt) draft = serverDraft;
      }
      if (!draft?.fields) return false;
      // Re-check after async fetch — typing may have started.
      if (state && state.restoreToken !== restoreToken) return false;
      if (dirtyDraftForms.has(form)) return false;
      const activeAfter = document.activeElement;
      if (activeAfter && form.contains(activeAfter) && String(activeAfter.value || "").trim()) return false;
      const applied = applyDraftFields(form, draft.fields);
      if (applied) {
        markDraftClean(form);
        setDraftStatus(form, "Restored draft");
      }
      return applied;
    },
  };

  window.LLHDrafts = LLHDrafts;

  window.addEventListener("beforeunload", (event) => {
    if (!dirtyDraftForms.size) return;
    // Persist dirty forms best-effort before leaving.
    dirtyDraftForms.forEach((form) => {
      try {
        const payload = serializeFormDraft(form);
        writeLocalDraft(form, payload);
      } catch { /* ignore */ }
    });
    event.preventDefault();
    event.returnValue = "";
  });

  // ─── 3. Notification icon labels ────────────────────────────────────────────

  const EXTRA_NOTIFICATION_ICONS = Object.freeze({
    feature_status: "✨",
    trial_ending: "⏳",
    subscription_change: "💳",
    lesson_plans_released: "📚",
    activities_added: "🎨",
    form_required: "📋",
    admin_new_message: "✉️",
    admin_new_support: "🛟",
    admin_new_feature: "💡",
    admin_new_bug: "🐛",
    feature_update: "🚀",
    support_reply: "🛟",
    bug_update: "🛠️",
    message: "💬",
    announcement: "📣",
  });

  const priorNotificationTypeIcon = typeof window.notificationTypeIcon === "function"
    ? window.notificationTypeIcon.bind(window)
    : null;

  window.notificationTypeIcon = function notificationTypeIcon(type) {
    const key = String(type || "");
    if (Object.prototype.hasOwnProperty.call(EXTRA_NOTIFICATION_ICONS, key)) {
      return EXTRA_NOTIFICATION_ICONS[key];
    }
    if (key.startsWith("admin_")) return "🛡️";
    if (priorNotificationTypeIcon) return priorNotificationTypeIcon(type);
    return "🔔";
  };

  // ─── Shared UI helpers ──────────────────────────────────────────────────────

  function statusBadgeHtml(status) {
    const label = String(status || "New");
    const slug = label.toLowerCase().replace(/\s+/g, "-");
    return `<span class="messages-status-badge status-${escapeHtml(slug)}">${escapeHtml(label)}</span>`;
  }

  function emptyStateHtml(title, detail) {
    return `
      <div class="messages-empty">
        <p><strong>${escapeHtml(title)}</strong></p>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
      </div>
    `;
  }

  function messageBubbleHtml(message) {
    const mine = message.senderType === "user";
    const automated = !mine && (
      message.isAutomation === true
      || String(message.channel || "").toLowerCase() === "onboarding_welcome"
      || Boolean(message.onboardingSequenceId)
    );
    const who = mine ? "You" : (message.senderName || "Leah");
    const label = automated ? `${who} · Automated welcome` : who;
    return `
      <div class="message-bubble ${mine ? "message-bubble-mine" : "message-bubble-admin"}${automated ? " message-bubble-automation" : ""}">
        <div class="message-bubble-meta">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(messagingRelativeTime(message.createdAt))}</span>
        </div>
        <div class="message-bubble-body">${escapeHtml(message.body || "").replace(/\n/g, "<br>")}</div>
      </div>
    `;
  }

  function listItemHtml({ id, title, preview, time, status, unread, meta, actionAttr }) {
    return `
      <article class="messages-center-item${unread ? " unread" : ""}" ${actionAttr || ""} data-item-id="${escapeHtml(id || "")}">
        <div class="messages-center-item-head">
          <strong>${escapeHtml(title || "Untitled")}</strong>
          <small>${escapeHtml(time || "")}</small>
        </div>
        ${preview ? `<p>${escapeHtml(preview)}</p>` : ""}
        <div class="messages-center-item-meta">
          ${status ? statusBadgeHtml(status) : ""}
          ${meta ? `<span class="muted-copy">${escapeHtml(meta)}</span>` : ""}
        </div>
      </article>
    `;
  }

  // ─── 2. My Messages & Requests page ─────────────────────────────────────────

  const MESSAGES_TABS = Object.freeze([
    { id: "conversation", label: "Direct Messages" },
    { id: "inbox", label: "Announcements" },
    { id: "unread", label: "Unread" },
    { id: "support", label: "Support" },
    { id: "sent", label: "Sent" },
    { id: "drafts", label: "Drafts" },
    { id: "features", label: "Features" },
    { id: "bugs", label: "Bugs" },
    { id: "archived", label: "Archived" },
    { id: "preferences", label: "Notification Settings" },
  ]);

  const myMessagesState = {
    tab: "conversation",
    loaded: false,
    loading: false,
    data: {
      inbox: [],
      conversation: [],
      sent: [],
      drafts: [],
      support: [],
      features: [],
      bugs: [],
      archived: [],
      unread: [],
    },
    error: "",
  };

  let memberMessagesPollTimer = null;
  let memberMessagesRefreshInFlight = false;
  const MEMBER_MESSAGES_POLL_MS = 12000;

  function stopMemberMessagesLiveRefresh() {
    if (memberMessagesPollTimer) {
      clearInterval(memberMessagesPollTimer);
      memberMessagesPollTimer = null;
    }
  }

  function startMemberMessagesLiveRefresh() {
    stopMemberMessagesLiveRefresh();
    memberMessagesPollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!isLoggedIn()) return;
      if (!document.querySelector("#view-messages.active-view")) return;
      refreshMyMessagesCenterLive().catch(() => {});
    }, MEMBER_MESSAGES_POLL_MS);
  }

  function messagesCenterDataSignature(data) {
    const payload = data || {};
    const conversation = (payload.conversation || []).map((m) => m.id).join(",");
    const inbox = (payload.inbox || []).map((n) => `${n.id}:${n.unread ? 1 : 0}`).join(",");
    const unread = (payload.unread || []).map((n) => n.id || n).join(",");
    const sent = (payload.sent || []).map((m) => m.id).join(",");
    return [conversation, inbox, unread, sent].join("||");
  }

  function captureMessagesReplyDraft() {
    const input = document.querySelector("#messagesReplyInput, #messagesCenterReplyInput, #messagesReplyForm textarea[name='body']");
    return input ? String(input.value || "") : "";
  }

  function restoreMessagesReplyDraft(draft) {
    if (!draft) return;
    const input = document.querySelector("#messagesReplyInput, #messagesCenterReplyInput, #messagesReplyForm textarea[name='body']");
    if (!input) return;
    input.value = draft;
    try {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    } catch {}
  }

  async function refreshMyMessagesCenterLive() {
    if (memberMessagesRefreshInFlight || myMessagesState.loading) return;
    if (!isLoggedIn() || !document.querySelector("#view-messages.active-view")) return;
    memberMessagesRefreshInFlight = true;
    try {
      const result = await fetchMessagesCenterData();
      if (!result.ok) {
        // Keep the current thread on transient auth/network failures — do not wipe to empty.
        return;
      }
      const prevSig = messagesCenterDataSignature(myMessagesState.data);
      const nextSig = messagesCenterDataSignature(result.data);
      myMessagesState.data = result.data;
      myMessagesState.loaded = true;
      myMessagesState.error = "";
      if (prevSig === nextSig) return;
      const draft = captureMessagesReplyDraft();
      const wasFocused = Boolean(document.activeElement?.closest?.("#messagesReplyForm"));
      paintMyMessagesCenter();
      restoreMessagesReplyDraft(draft);
      if (wasFocused) {
        document.querySelector("#messagesReplyInput")?.focus();
      }
      if (myMessagesState.tab === "conversation" && (myMessagesState.data.conversation || []).length) {
        if (typeof window.markNotificationRead === "function") {
          window.markNotificationRead({ conversationEmail: currentUserEmail() });
        }
      }
    } catch (error) {
      console.warn("Could not refresh messages center", error);
    } finally {
      memberMessagesRefreshInFlight = false;
    }
  }

  window.refreshMyMessagesCenterLive = refreshMyMessagesCenterLive;

  async function fetchMessagesCenterData() {
    const headers = await staffAuthHeaders();
    if (!headers || !canUseLaunchBackend()) {
      return { ok: false, error: "Please log in to load messages." };
    }

    try {
      const centerRes = await fetch("/api/messages/center", { headers, cache: "no-store" });
      if (centerRes.ok) {
        const data = await centerRes.json().catch(() => ({}));
        // Shape from server/comms-api.js handleMessageCenter.
        const inboxRaw = Array.isArray(data.inbox) ? data.inbox : [];
        const inbox = inboxRaw.map((n) => ({
          id: n.id,
          title: n.title || "Update",
          preview: n.preview || "",
          createdAt: n.createdAt,
          status: n.read ? "Read" : "Unread",
          unread: !n.read,
          kind: n.type || "announcement",
          raw: n,
        }));
        const conversation = Array.isArray(data.conversation) ? data.conversation : [];
        const sent = (Array.isArray(data.sent) ? data.sent : []).map((m) => ({
          id: m.id,
          title: "You",
          preview: m.body || m.subject || "",
          createdAt: m.createdAt,
          status: "Sent",
          body: m.body,
        }));
        const drafts = (Array.isArray(data.drafts) ? data.drafts : []).map((d) => {
          const payload = d.payload && typeof d.payload === "object" ? d.payload : {};
          const fields = payload.fields || payload;
          const preview = fields.body || fields.message || fields.subject || "";
          return {
            id: d.id || d.key,
            title: d.formId || d.scope || "Draft",
            preview: typeof preview === "string" ? preview : "",
            createdAt: d.updatedAt || d.createdAt,
            status: "Draft",
            raw: d,
          };
        });
        const support = Array.isArray(data.supportRequests)
          ? data.supportRequests
          : (Array.isArray(data.support) ? data.support : []);
        const features = Array.isArray(data.featureRequests)
          ? data.featureRequests
          : (Array.isArray(data.features) ? data.features : []);
        const bugs = Array.isArray(data.bugReports)
          ? data.bugReports
          : (Array.isArray(data.bugs) ? data.bugs : []);
        const archivedPayload = data.archived && typeof data.archived === "object" && !Array.isArray(data.archived)
          ? data.archived
          : null;
        const archived = archivedPayload
          ? (Array.isArray(archivedPayload.messages) ? archivedPayload.messages : []).map((m) => ({
            id: m.id,
            title: m.subject || (m.senderType === "user" ? "You" : (m.senderName || "Leah")),
            preview: m.body || "",
            createdAt: m.createdAt,
            updatedAt: m.createdAt,
            status: "Archived",
          }))
          : (Array.isArray(data.archived) ? data.archived : []);
        const unread = Array.isArray(data.unread)
          ? data.unread.map((item) => ({
            id: item.id,
            title: item.title || "Update",
            preview: item.preview || item.body || "",
            createdAt: item.createdAt,
            unread: true,
            kind: item.kind || item.type || "announcement",
            source: item.source || (item.kind === "message" ? "conversation" : "inbox"),
          }))
          : inbox.filter((i) => i.unread);
        const unreadCount = Number.isFinite(Number(data.unreadCount))
          ? Number(data.unreadCount)
          : unread.length;
        return {
          ok: true,
          data: {
            inbox,
            conversation,
            sent,
            drafts,
            support,
            features,
            bugs,
            archived,
            unread,
            unreadCount,
            feedback: Array.isArray(data.feedback) ? data.feedback : [],
          },
        };
      }
    } catch (error) {
      console.warn("messages/center unavailable, falling back", error);
    }

    // Fallback: assemble from existing member endpoints.
    const email = currentUserEmail();
    const [convoRes, inboxRes, featureRes, bugRes, ticketRes] = await Promise.all([
      fetch("/api/messages/conversation", { headers, cache: "no-store" }).catch(() => null),
      fetch("/api/messages/inbox", { headers, cache: "no-store" }).catch(() => null),
      fetch(`/api/feature-requests?email=${encodeURIComponent(email)}`, { headers, cache: "no-store" }).catch(() => null),
      fetch(`/api/bug-reports?email=${encodeURIComponent(email)}`, { headers, cache: "no-store" }).catch(() => null),
      fetch(`/api/support-tickets?email=${encodeURIComponent(email)}`, { headers, cache: "no-store" }).catch(() => null),
    ]);

    const convoData = convoRes?.ok ? await convoRes.json().catch(() => ({})) : {};
    const inboxData = inboxRes?.ok ? await inboxRes.json().catch(() => ({})) : {};
    const featureData = featureRes?.ok ? await featureRes.json().catch(() => ({})) : {};
    const bugData = bugRes?.ok ? await bugRes.json().catch(() => ({})) : {};
    const ticketData = ticketRes?.ok ? await ticketRes.json().catch(() => ({})) : {};

    const conversation = Array.isArray(convoData.messages) ? convoData.messages : [];
    const inboxItems = Array.isArray(inboxData.items) ? inboxData.items : [];
    const features = Array.isArray(featureData.featureRequests) ? featureData.featureRequests : [];
    const bugs = Array.isArray(bugData.bugReports) ? bugData.bugReports : [];
    const support = Array.isArray(ticketData.tickets) ? ticketData.tickets : (Array.isArray(ticketData.supportTickets) ? ticketData.supportTickets : []);

    const inbox = inboxItems.map((item) => ({
      id: item.notification?.id || item.message?.id || "",
      title: item.notification?.title || item.message?.subject || "Update",
      preview: item.message?.body || item.notification?.preview || "",
      createdAt: item.notification?.createdAt || item.message?.createdAt,
      status: item.notification?.read ? "Read" : "Unread",
      unread: !item.notification?.read,
      kind: item.notification?.type || "announcement",
      raw: item,
    }));

    // Fallback unread: announcements from inbox + unread DM notifications from the bell payload.
    // Do not use message.read — member publicMessage historically omitted that field.
    const bellUnread = (typeof window.notificationBellState === "object" && Array.isArray(window.notificationBellState?.items))
      ? window.notificationBellState.items.filter((item) => !item.read && (item.type === "message" || item.conversationEmail))
      : [];
    const unread = [
      ...inbox.filter((i) => i.unread),
      ...bellUnread.map((item) => ({
        id: item.id,
        title: item.title || "Message from Leah",
        preview: item.body || item.preview || "",
        createdAt: item.createdAt,
        unread: true,
        kind: "message",
        source: "conversation",
      })),
    ];

    const sent = conversation.filter((m) => m.senderType === "user").map((m) => ({
      id: m.id,
      title: "You",
      preview: m.body,
      createdAt: m.createdAt,
      status: "Sent",
    }));

    const archived = [
      ...features.filter((f) => /completed|declined|released/i.test(String(f.status || ""))),
      ...bugs.filter((b) => /fixed|closed/i.test(String(b.status || ""))),
      ...support.filter((t) => /complete|resolved|archived|closed/i.test(String(t.status || ""))),
    ];

    // Local drafts for reply form
    const drafts = [];
    try {
      const key = `llh-draft:message:member-reply:${email || "guest"}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.fields?.body || parsed?.fields?.message) {
          drafts.push({
            id: "local-reply",
            title: "Conversation reply draft",
            preview: parsed.fields.body || parsed.fields.message || "",
            createdAt: parsed.savedAt,
            status: "Draft",
          });
        }
      }
    } catch { /* ignore */ }

    return {
      ok: true,
      data: {
        inbox,
        conversation,
        sent,
        drafts,
        support,
        features,
        bugs,
        archived,
        unread,
      },
    };
  }

  function renderMessagesCenterTabs() {
    const tab = myMessagesState.tab;
    const unreadCount = (myMessagesState.data.unread || []).length;
    return `
      <div class="messages-tabs messages-center-tabs" role="tablist">
        ${MESSAGES_TABS.map((t) => {
          const badge = t.id === "unread" && unreadCount
            ? ` <span class="messages-tab-dot" aria-label="${unreadCount} unread"></span>`
            : "";
          return `
            <button type="button"
              class="messages-tab${tab === t.id ? " active" : ""}"
              data-messages-center-tab="${escapeHtml(t.id)}"
              role="tab"
              aria-selected="${tab === t.id}">${escapeHtml(t.label)}${badge}</button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderInboxTab() {
    const items = myMessagesState.data.inbox || [];
    if (!items.length) {
      return `
        <div class="messages-center-section-intro">
          <p class="muted-copy">Announcements and platform updates (separate from direct messages with Leah).</p>
        </div>
        ${emptyStateHtml("No announcements yet", "Announcements and updates from Little Learner Hub will appear here.")}
      `;
    }
    return `
      <div class="messages-center-section-intro">
        <p class="muted-copy">Announcements and platform updates (separate from direct messages with Leah).</p>
        <button type="button" class="ghost-button" data-messages-mark-all-read>Mark all read</button>
      </div>
      <div class="messages-center-list">${items.map((item) => listItemHtml({
      id: item.id,
      title: item.title,
      preview: item.preview,
      time: messagingRelativeTime(item.createdAt),
      status: item.status,
      unread: item.unread,
      meta: item.kind || "Announcement",
      actionAttr: item.id ? `data-messages-open-item="${escapeHtml(item.id)}"` : "",
    })).join("")}</div>`;
  }

  function renderConversationTab() {
    const messages = myMessagesState.data.conversation || [];
    const list = messages.length
      ? messages.map(messageBubbleHtml).join("")
      : emptyStateHtml("Message Support anytime", "Ask a question, report a bug, request a feature, or just say hello — Leah will reply here.");
    return `
      <div class="messages-conversation">
        <div class="messages-center-section-intro">
          <p class="muted-copy">Direct messages with Leah / support (separate from announcements).</p>
        </div>
        <div class="messages-thread" id="messagesThread">${list}</div>
        <form class="messages-reply-form" id="messagesReplyForm"
          data-draft-scope="message"
          data-draft-form="member-reply">
          <label class="visually-hidden" for="messagesReplyInput">Reply</label>
          <textarea id="messagesReplyInput" name="body" placeholder="Write a message to Leah…" maxlength="4000" rows="2"></textarea>
          <div class="messages-reply-actions">
            <span class="messages-draft-status" data-draft-status aria-live="polite"></span>
            <button type="submit" class="primary-button">Send</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderSentTab() {
    const items = myMessagesState.data.sent || [];
    if (!items.length) return emptyStateHtml("No sent messages", "Messages you send to Leah will show up here.");
    return `<div class="messages-center-list">${items.map((item) => listItemHtml({
      id: item.id,
      title: item.title || "You",
      preview: item.preview || item.body,
      time: messagingRelativeTime(item.createdAt),
      status: item.status || "Sent",
    })).join("")}</div>`;
  }

  function renderDraftsTab() {
    const items = myMessagesState.data.drafts || [];
    if (!items.length) return emptyStateHtml("No drafts", "Unsent replies and forms are auto-saved here.");
    return `<div class="messages-center-list">${items.map((item) => listItemHtml({
      id: item.id,
      title: item.title || "Draft",
      preview: item.preview || item.body,
      time: messagingRelativeTime(item.createdAt || item.savedAt),
      status: "Draft",
    })).join("")}</div>`;
  }

  function renderSupportTab() {
    const items = myMessagesState.data.support || [];
    if (!items.length) {
      return `
        ${emptyStateHtml("No support requests", "Need help? Start a conversation or open a support ticket.")}
        <div class="account-actions-row">
          <button type="button" class="primary-button" data-messages-center-action="open-support">Contact Support</button>
          <button type="button" class="ghost-button" data-messages-center-tab="conversation">Message Leah</button>
        </div>
      `;
    }
    return `<div class="messages-center-list">${items.map((item) => listItemHtml({
      id: item.id,
      title: item.topic || item.subject || item.kind || "Support",
      preview: item.message || item.preview || "",
      time: messagingRelativeTime(item.createdAt),
      status: item.status || "New",
      meta: item.kind || "Support",
    })).join("")}</div>`;
  }

  function renderFeaturesTab() {
    const items = myMessagesState.data.features || [];
    return `
      <div class="messages-center-actions account-actions-row">
        <button type="button" class="primary-button" data-messages-center-action="open-feature">Request a Feature</button>
      </div>
      ${items.length
        ? `<div class="messages-center-list">${items.map((item) => listItemHtml({
          id: item.id,
          title: item.title,
          preview: item.description,
          time: messagingRelativeTime(item.createdAt),
          status: item.status || "New",
          meta: item.votes ? `${item.votes} votes` : "",
        })).join("")}</div>`
        : emptyStateHtml("No feature requests yet", "Share an idea and we'll track status updates here.")}
    `;
  }

  function renderBugsTab() {
    const items = myMessagesState.data.bugs || [];
    return `
      <div class="messages-center-actions account-actions-row">
        <button type="button" class="primary-button" data-messages-center-action="open-bug">Report a Bug</button>
      </div>
      ${items.length
        ? `<div class="messages-center-list">${items.map((item) => listItemHtml({
          id: item.id,
          title: item.title,
          preview: item.description,
          time: messagingRelativeTime(item.createdAt),
          status: item.status || "New",
          meta: item.category || "",
        })).join("")}</div>`
        : emptyStateHtml("No bug reports yet", "If something breaks, report it and track the fix status here.")}
    `;
  }

  function renderArchivedTab() {
    const items = myMessagesState.data.archived || [];
    if (!items.length) return emptyStateHtml("Nothing archived", "Completed features, fixed bugs, and closed tickets land here.");
    return `<div class="messages-center-list">${items.map((item) => listItemHtml({
      id: item.id,
      title: item.title || item.topic || item.subject || "Archived",
      preview: item.description || item.message || item.preview || "",
      time: messagingRelativeTime(item.updatedAt || item.createdAt),
      status: item.status || "Archived",
    })).join("")}</div>`;
  }

  function renderUnreadTab() {
    const items = myMessagesState.data.unread || [];
    if (!items.length) {
      return `
        <div class="messages-center-section-intro">
          <p class="muted-copy">Unread direct messages and announcements. Opening or marking read updates counts — history is never deleted.</p>
        </div>
        ${emptyStateHtml("You're all caught up", "No unread messages right now.")}
      `;
    }
    return `
      <div class="messages-center-section-intro">
        <p class="muted-copy">Unread direct messages and announcements. Opening or marking read updates counts — history is never deleted.</p>
        <button type="button" class="ghost-button" data-messages-mark-all-read>Mark all read</button>
      </div>
      <div class="messages-center-list">${items.map((item) => listItemHtml({
        id: item.id,
        title: item.title,
        preview: item.preview || item.body,
        time: messagingRelativeTime(item.createdAt),
        status: "Unread",
        unread: true,
        meta: item.kind || (item.source === "conversation" ? "Direct Message" : "Announcement"),
        actionAttr: item.id ? `data-messages-open-item="${escapeHtml(item.id)}"` : "",
      })).join("")}</div>`;
  }

  function renderNotificationSettingsSubSection() {
    // Prefer existing preference tab renderer when available.
    if (typeof window.renderMessagesPreferencesTab === "function") {
      return `
        <section class="messages-center-prefs" id="messagesCenterPrefs">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Preferences</p>
              <h3>Notification Settings</h3>
            </div>
          </div>
          ${window.renderMessagesPreferencesTab()}
        </section>
      `;
    }
    return `
      <section class="messages-center-prefs">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Preferences</p>
            <h3>Notification Settings</h3>
          </div>
        </div>
        <p class="muted-copy">Manage push notifications here in Messages → Notification Settings. Email reminders live under Settings → Notifications.</p>
        <button type="button" class="ghost-button" data-messages-center-action="prefs-link">Open notification preferences</button>
      </section>
    `;
  }

  function renderMessagesCenterPanel() {
    switch (myMessagesState.tab) {
      case "conversation": return renderConversationTab();
      case "sent": return renderSentTab();
      case "drafts": return renderDraftsTab();
      case "support": return renderSupportTab();
      case "features": return renderFeaturesTab();
      case "bugs": return renderBugsTab();
      case "archived": return renderArchivedTab();
      case "unread": return renderUnreadTab();
      case "preferences": return renderNotificationSettingsSubSection();
      case "inbox":
      default: return renderInboxTab();
    }
  }

  function paintMyMessagesCenter() {
    const section = document.querySelector("#view-messages");
    if (!section) return;
    const foundingCard = typeof window.renderFoundingMemberExperience === "function"
      ? window.renderFoundingMemberExperience({ inject: false }) || ""
      : "";

    section.innerHTML = `
      <div class="messages-page-shell messages-center-shell">
        <div class="page-title">
          <p class="eyebrow">Help &amp; Support</p>
          <h2>My Messages &amp; Requests</h2>
          <p>Start with <strong>Message Leah</strong> to chat directly. Use Inbox for announcements, and Support / Features / Bugs for tracked requests.</p>
        </div>
        ${foundingCard}
        ${renderMessagesCenterTabs()}
        <div class="messages-tab-panel" id="messagesCenterPanel">
          ${myMessagesState.loading
            ? `<p class="messages-loading">Loading your messages…</p>`
            : myMessagesState.error
              ? `<p class="messages-empty">${escapeHtml(myMessagesState.error)}</p>`
              : renderMessagesCenterPanel()}
        </div>
      </div>
    `;

    const thread = document.querySelector("#messagesThread");
    if (thread) thread.scrollTop = thread.scrollHeight;

    const replyForm = document.querySelector("#messagesReplyForm");
    if (replyForm) LLHDrafts.attach(replyForm);
  }

  async function renderMyMessagesCenter(options = {}) {
    const section = document.querySelector("#view-messages");
    if (!section) return;

    if (!isLoggedIn()) {
      stopMemberMessagesLiveRefresh();
      if (typeof window.renderManageSurfaceShell === "function") {
        section.innerHTML = window.renderManageSurfaceShell({
          eyebrow: "Messages",
          title: "Log in to view your messages",
          detail: "Create a free account or log in to message Leah, read announcements, and manage notification settings.",
          bodyHtml: `<button class="primary-button" type="button" data-action="open-login">Log In</button>`,
        });
      } else {
        section.innerHTML = `
          <div class="messages-page-shell">
            <h2>Log in to view your messages</h2>
            <p>Create a free account or log in to continue.</p>
            <button class="primary-button" type="button" data-action="open-login">Log In</button>
          </div>
        `;
      }
      return;
    }

    if (options.silent) {
      await refreshMyMessagesCenterLive();
      startMemberMessagesLiveRefresh();
      return;
    }

    if (options.tab && MESSAGES_TABS.some((t) => t.id === options.tab)) {
      myMessagesState.tab = options.tab;
    } else if (options.conversation) {
      myMessagesState.tab = "conversation";
    }

    myMessagesState.loading = true;
    myMessagesState.error = "";
    paintMyMessagesCenter();

    if (typeof window.refreshPushPreferenceState === "function") {
      await window.refreshPushPreferenceState().catch(() => null);
    }

    const result = await fetchMessagesCenterData();
    myMessagesState.loading = false;
    if (!result.ok) {
      myMessagesState.error = result.error || "Could not load messages.";
      // Keep previously loaded messages when a refresh fails so the thread does not vanish.
      if (!myMessagesState.loaded) {
        myMessagesState.data = {
          inbox: [], conversation: [], sent: [], drafts: [],
          support: [], features: [], bugs: [], archived: [], unread: [],
        };
      }
    } else {
      myMessagesState.data = result.data;
      myMessagesState.loaded = true;
      myMessagesState.error = "";
    }
    paintMyMessagesCenter();

    if (myMessagesState.tab === "conversation" && (myMessagesState.data.conversation || []).length) {
      if (typeof window.markNotificationRead === "function") {
        window.markNotificationRead({ conversationEmail: currentUserEmail() });
      }
    }
    refreshNotificationBellSafe();
    startMemberMessagesLiveRefresh();
    trackEvent("messages_center_view", { tab: myMessagesState.tab });
  }

  window.renderMyMessagesCenter = renderMyMessagesCenter;

  async function sendMessagesCenterReply(body) {
    const headers = await staffAuthHeaders();
    if (!headers) return { ok: false, error: "Please log in again." };
    try {
      const res = await fetch("/api/messages/reply", {
        method: "POST",
        headers,
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || "Could not send message." };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Could not send message." };
    }
  }

  // ─── 4. Changelog page ──────────────────────────────────────────────────────

  function changelogCategoryBlocks(note) {
    return CHANGELOG_CATEGORY_MAP.map(({ key, label }) => {
      const items = Array.isArray(note[key]) ? note[key].filter(Boolean) : [];
      if (!items.length) return "";
      return `
        <div class="changelog-category">
          <h4>${escapeHtml(label)}</h4>
          <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `;
    }).join("");
  }

  async function renderChangelogPage() {
    const section = document.querySelector("#view-whats-new");
    if (!section) return;
    section.innerHTML = `<div class="changelog-page"><p class="messages-loading">Loading what's new…</p></div>`;

    let notes = [];
    try {
      const res = await fetch("/api/release-notes", { cache: "no-store" });
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      notes = Array.isArray(data.releaseNotes) ? data.releaseNotes : [];
    } catch (error) {
      console.warn("Could not load release notes", error);
    }

    if (typeof window.whatsNewNavHasNotes !== "undefined") {
      window.whatsNewNavHasNotes = notes.length > 0;
    }
    try {
      if (typeof window.setWhatsNewNavVisible === "function") {
        window.setWhatsNewNavVisible(notes.length > 0);
      }
    } catch (_) { /* nav sync is optional */ }

    if (!notes.length) {
      section.innerHTML = `
        <div class="changelog-page">
          <div class="page-title">
            <p class="eyebrow">Product Updates</p>
            <h2>What's New</h2>
            <p>Published product updates will appear here when they are ready.</p>
          </div>
          ${emptyStateHtml("No published updates yet", "This page stays quiet until a release note is published.")}
          <div class="form-actions" style="margin-top:16px;">
            <button class="ghost-button" data-view="calendar" type="button">← Back to Calendar</button>
          </div>
        </div>
      `;
      return;
    }

    section.innerHTML = `
      <div class="changelog-page">
        <div class="page-title">
          <p class="eyebrow">Product Updates</p>
          <h2>What's New</h2>
          <p>Features, improvements, bug fixes, and new curriculum additions.</p>
        </div>
        <div class="changelog-list">
          ${notes.map((note) => `
            <article class="changelog-entry">
              <header class="changelog-entry-head">
                <h3>${escapeHtml(note.version || "Update")}</h3>
                <small>${escapeHtml(note.releaseDate || messagingRelativeTime(note.createdAt) || "")}</small>
              </header>
              ${changelogCategoryBlocks(note) || `<p class="muted-copy">No categorized changes listed.</p>`}
            </article>
          `).join("")}
        </div>
        <div class="form-actions" style="margin-top:16px;">
          <button class="ghost-button" data-view="calendar" type="button">← Back to Calendar</button>
        </div>
      </div>
    `;
  }

  window.renderChangelogPage = renderChangelogPage;

  // ─── 5. Founding Member experience card ─────────────────────────────────────

  function isFoundingMemberAccount(account) {
    if (!account) return false;
    if (account.foundingMemberActive) return true;
    if (account.foundingMember || account.foundingMemberHistorical) return true;
    if (account.foundingMemberNumber) return true;
    const plan = String(account.plan || "").toLowerCase();
    return plan.includes("founding");
  }

  function renderFoundingMemberExperience(options = {}) {
    const account = currentAccountSafe();
    if (!isFoundingMemberAccount(account)) return "";

    const joinDate = account.foundingJoinedAt
      || account.foundingMemberJoinedAt
      || account.subscriptionStart
      || account.createdAt
      || "";
    const joinLabel = joinDate
      ? new Date(joinDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : "—";
    const memberNumber = account.foundingMemberNumber ? `#${account.foundingMemberNumber}` : "";
    // Member Settings/Messages card: thank-you only — never acquisition / spots-remaining copy.
    const html = `
      <section class="founding-experience-card" aria-label="Founding Member experience">
        <div class="founding-experience-badge">Founding Member${memberNumber ? ` ${escapeHtml(memberNumber)}` : ""}</div>
        <h3>Thank you for being a Founding Member</h3>
        <p>Your $9.99/month rate stays locked while your membership remains continuously active. Thank you for helping Little Learner Hub grow.</p>
        <dl class="founding-experience-meta">
          <div><dt>Joined</dt><dd>${escapeHtml(joinLabel)}</dd></div>
          <div><dt>Pricing</dt><dd>$9.99/month locked while continuously active</dd></div>
          <div><dt>Access</dt><dd>Full Pro membership benefits</dd></div>
        </dl>
      </section>
    `;

    if (options.inject === false) return html;

    const targets = [
      document.querySelector("#view-messages .messages-page-shell"),
      document.querySelector("#view-settings"),
      document.querySelector("#settingsHubApp"),
      document.querySelector("#view-messages"),
    ].filter(Boolean);

    const host = options.container
      || targets.find((el) => el && !el.querySelector(".founding-experience-card"));

    if (host && !host.querySelector(".founding-experience-card")) {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      const card = wrap.firstElementChild;
      if (card) {
        const insertBefore = host.querySelector(".page-title")?.nextSibling
          || host.firstChild;
        if (host.querySelector(".page-title") && insertBefore) {
          host.querySelector(".page-title").after(card);
        } else {
          host.prepend(card);
        }
      }
    }
    return html;
  }

  window.renderFoundingMemberExperience = renderFoundingMemberExperience;

  // ─── 6. Admin panels ────────────────────────────────────────────────────────

  async function adminFetchJson(url, options = {}) {
    const token = adminToken();
    if (!token) throw new Error("Admin login required.");
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
    const method = (options.method || "GET").toUpperCase();
    let body = options.body;
    if (body && typeof body === "object" && !(body instanceof FormData)) {
      body = JSON.stringify(body);
    }
    const timeoutMs = Number(options.timeoutMs) || 20000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, method, headers, body, cache: "no-store", signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Request timed out. Please try again.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function adminPanelShell(title, bodyHtml, eyebrow = "Admin", activeTabId = "") {
    const nav = activeTabId && typeof window.adminMessagesWorkspaceNavHtml === "function"
      ? window.adminMessagesWorkspaceNavHtml(activeTabId)
      : "";
    return `
      ${nav}
      <div class="admin-comms-panel">
        <div class="section-heading">
          <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h3>${escapeHtml(title)}</h3></div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  async function renderAdminMessageTemplates(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading templates…</p>`;
    let templates = [...DEFAULT_MESSAGE_TEMPLATES];
    try {
      const data = await adminFetchJson("/api/admin/message-templates");
      if (Array.isArray(data.templates) && data.templates.length) templates = data.templates;
    } catch {
      // Use defaults when endpoint is not yet available.
    }

    container.innerHTML = adminPanelShell("Message Templates", `
      <div class="admin-template-list">
        ${templates.map((t) => `
          <article class="ticket-card" data-template-id="${escapeHtml(t.id)}">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(t.kind || "message")}</p>
                <h3>${escapeHtml(t.label || t.id)}</h3>
                <p>${escapeHtml(t.subject || "")}</p>
              </div>
            </div>
            <p>${escapeHtml(t.body || "")}</p>
            <div class="account-actions-row">
              <button type="button" class="ghost-button" data-admin-template-use="${escapeHtml(t.id)}">Use in Compose</button>
            </div>
          </article>
        `).join("")}
      </div>
      <p class="form-note" id="adminTemplatesMessage"></p>
    `, "Messaging", "message-templates");

    container.querySelectorAll("[data-admin-template-use]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-admin-template-use");
        const template = templates.find((t) => t.id === id);
        if (!template) return;
        if (typeof window.applyAdminMessageTemplate === "function") {
          window.applyAdminMessageTemplate(id);
        } else if (window.adminMessagesState) {
          Object.assign(window.adminMessagesState, {
            subject: template.subject,
            body: template.body,
            kind: template.kind || "message",
          });
          if (typeof window.renderAdminMessagesCompose === "function") {
            const compose = document.querySelector("#adminMessagesApp");
            if (compose) window.renderAdminMessagesCompose(compose);
          }
        }
        setFormMessage("#adminTemplatesMessage", `Loaded “${template.label}”.`, true);
        trackEvent("admin_template_used", { id });
      });
    });
  }

  window.renderAdminMessageTemplates = renderAdminMessageTemplates;

  async function renderAdminWelcomeMessages(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading welcome messages…</p>`;
    let config = null;
    try {
      config = await adminFetchJson("/api/admin/onboarding-welcome");
    } catch (error) {
      container.innerHTML = adminPanelShell("Welcome Messages", `<div class="empty-state">${escapeHtml(error.message || "Could not load welcome configuration.")}</div>`, "Messaging", "welcome-messages");
      return;
    }

    const sequence = config.sequence || {};
    const variables = Array.isArray(config.variables) ? config.variables : [];
    const foundingOpen = Boolean(config.foundingOpen);
    const scheduledSteps = Array.isArray(sequence.scheduledSteps) ? sequence.scheduledSteps : [];

    container.innerHTML = adminPanelShell("Communication Templates · Welcome Messages", `
      <p class="muted-copy">Configure the automatic welcome sequence for new Free accounts. In-app and email messages send once per account immediately after signup. Pro, Founding Member, and Trial signups are skipped.</p>
      <div class="admin-welcome-status-row">
        <span class="admin-pill ${sequence.enabled === false ? "is-muted" : "is-success"}">${sequence.enabled === false ? "Sequence paused" : "Sequence active"}</span>
        <span class="admin-pill ${foundingOpen ? "is-warning" : "is-muted"}">${foundingOpen ? "Founding spots open" : "Founding section hidden"}</span>
      </div>
      <form class="panel-form admin-welcome-form" id="adminWelcomeMessagesForm">
        <fieldset class="admin-welcome-fieldset">
          <legend>Sequence</legend>
          <label class="checkbox-row">
            <input type="checkbox" name="sequenceEnabled" ${sequence.enabled === false ? "" : "checked"} />
            Enable Free welcome sequence
          </label>
        </fieldset>

        <fieldset class="admin-welcome-fieldset">
          <legend>In-app welcome message</legend>
          <label class="checkbox-row">
            <input type="checkbox" name="inAppEnabled" ${sequence.inApp?.enabled === false ? "" : "checked"} />
            Send in-app message from Leah
          </label>
          <label>Title
            <input name="inAppTitle" maxlength="300" value="${escapeHtml(sequence.inApp?.title || "")}" />
          </label>
          <label>Message
            <textarea name="inAppBody" rows="12">${escapeHtml(sequence.inApp?.body || "")}</textarea>
          </label>
        </fieldset>

        <fieldset class="admin-welcome-fieldset">
          <legend>Welcome email</legend>
          <label class="checkbox-row">
            <input type="checkbox" name="emailEnabled" ${sequence.email?.enabled === false ? "" : "checked"} />
            Send welcome email
          </label>
          <label>Subject
            <input name="emailSubject" maxlength="300" value="${escapeHtml(sequence.email?.subject || "")}" />
          </label>
          <label>Body
            <textarea name="emailBody" rows="12">${escapeHtml(sequence.email?.body || "")}</textarea>
          </label>
          <div class="admin-welcome-cta-grid">
            <label>Primary button label
              <input name="primaryCtaLabel" maxlength="120" value="${escapeHtml(sequence.email?.primaryCtaLabel || "Explore Free Resources")}" />
            </label>
            <label>Primary button URL
              <input name="primaryCtaUrl" maxlength="500" value="${escapeHtml(sequence.email?.primaryCtaUrl || "{{LessonsUrl}}")}" />
            </label>
            <label>Secondary button label
              <input name="secondaryCtaLabel" maxlength="120" value="${escapeHtml(sequence.email?.secondaryCtaLabel || "Upgrade to Pro")}" />
            </label>
            <label>Secondary button URL
              <input name="secondaryCtaUrl" maxlength="500" value="${escapeHtml(sequence.email?.secondaryCtaUrl || "{{UpgradeUrl}}")}" />
            </label>
          </div>
          <label>Email footer
            <input name="emailFooter" maxlength="500" value="${escapeHtml(sequence.email?.footerNote || "")}" />
          </label>
        </fieldset>

        <fieldset class="admin-welcome-fieldset">
          <legend>Founding Member section</legend>
          <label class="checkbox-row">
            <input type="checkbox" name="foundingEnabled" ${sequence.foundingSection?.enabled === false ? "" : "checked"} />
            Show when Founding Member spots are available
          </label>
          <label>In-app / text version
            <textarea name="foundingText" rows="5">${escapeHtml(sequence.foundingSection?.inAppText || "")}</textarea>
          </label>
          <label>Email HTML block
            <textarea name="foundingHtml" rows="6">${escapeHtml(sequence.foundingSection?.emailHtml || "")}</textarea>
          </label>
        </fieldset>

        <fieldset class="admin-welcome-fieldset">
          <legend>Scheduled follow-ups (future-ready)</legend>
          <p class="form-note">These steps are saved for future automation. They do not send automatically yet.</p>
          <div class="admin-welcome-schedule-list">
            ${scheduledSteps.map((step, index) => `
              <article class="ticket-card admin-welcome-schedule-card">
                <div class="ticket-card-header">
                  <div>
                    <p class="eyebrow">Day ${escapeHtml(String(step.delayDays ?? 0))}</p>
                    <h4>${escapeHtml(step.label || step.id || `Step ${index + 1}`)}</h4>
                  </div>
                  <label class="checkbox-row">
                    <input type="checkbox" name="stepEnabled_${index}" ${step.enabled ? "checked" : ""} />
                    Enabled (future)
                  </label>
                </div>
                <input type="hidden" name="stepId_${index}" value="${escapeHtml(step.id || `step-${index}`)}" />
                <input type="hidden" name="stepDelay_${index}" value="${escapeHtml(String(step.delayDays ?? 0))}" />
                <label>Step label
                  <input name="stepLabel_${index}" maxlength="120" value="${escapeHtml(step.label || "")}" />
                </label>
              </article>
            `).join("")}
          </div>
        </fieldset>

        <details class="admin-welcome-variables">
          <summary>Dynamic variables</summary>
          <ul class="admin-welcome-variable-list">
            ${variables.map((v) => `<li><code>{{${escapeHtml(v.key)}}}</code> — ${escapeHtml(v.description || "")}</li>`).join("")}
          </ul>
        </details>

        <div class="account-actions-row admin-welcome-actions">
          <button type="submit" class="primary-button">Save welcome messages</button>
          <button type="button" class="ghost-button" id="adminWelcomePreviewInAppBtn">Preview in-app</button>
          <button type="button" class="ghost-button" id="adminWelcomePreviewEmailBtn">Preview email</button>
          <button type="button" class="ghost-button" id="adminWelcomeBackfillBtn">Backfill last 5 Free signups</button>
        </div>
        <p class="form-note" id="adminWelcomeMessagesMessage"></p>
      </form>

      <div class="admin-welcome-preview-wrap" id="adminWelcomePreviewWrap" hidden>
        <div class="section-heading">
          <div><p class="eyebrow">Preview</p><h4 id="adminWelcomePreviewTitle"></h4></div>
          <button type="button" class="ghost-button" id="adminWelcomePreviewCloseBtn">Close</button>
        </div>
        <div id="adminWelcomePreviewBody" class="admin-welcome-preview-body"></div>
      </div>
    `, "Messaging", "welcome-messages");

    const form = container.querySelector("#adminWelcomeMessagesForm");

    function collectSequenceFromForm() {
      const fd = new FormData(form);
      const steps = scheduledSteps.map((step, index) => ({
        id: String(fd.get(`stepId_${index}`) || step.id || `step-${index}`),
        delayDays: Number(fd.get(`stepDelay_${index}`) || step.delayDays || 0),
        enabled: fd.get(`stepEnabled_${index}`) === "on",
        label: String(fd.get(`stepLabel_${index}`) || step.label || ""),
        inApp: step.inApp || { enabled: false, title: "", body: "" },
        email: step.email || { enabled: false, subject: "", body: "" },
      }));
      return {
        enabled: fd.get("sequenceEnabled") === "on",
        inApp: {
          enabled: fd.get("inAppEnabled") === "on",
          title: String(fd.get("inAppTitle") || ""),
          body: String(fd.get("inAppBody") || ""),
        },
        email: {
          enabled: fd.get("emailEnabled") === "on",
          subject: String(fd.get("emailSubject") || ""),
          body: String(fd.get("emailBody") || ""),
          primaryCtaLabel: String(fd.get("primaryCtaLabel") || ""),
          primaryCtaUrl: String(fd.get("primaryCtaUrl") || ""),
          secondaryCtaLabel: String(fd.get("secondaryCtaLabel") || ""),
          secondaryCtaUrl: String(fd.get("secondaryCtaUrl") || ""),
          footerNote: String(fd.get("emailFooter") || ""),
        },
        foundingSection: {
          enabled: fd.get("foundingEnabled") === "on",
          inAppText: String(fd.get("foundingText") || ""),
          emailHtml: String(fd.get("foundingHtml") || ""),
          emailText: String(fd.get("foundingText") || ""),
        },
        scheduledSteps: steps,
      };
    }

    function showPreview(preview, channel) {
      const wrap = container.querySelector("#adminWelcomePreviewWrap");
      const titleEl = container.querySelector("#adminWelcomePreviewTitle");
      const bodyEl = container.querySelector("#adminWelcomePreviewBody");
      if (!wrap || !titleEl || !bodyEl) return;
      const payload = preview?.previews?.[channel] || preview;
      titleEl.textContent = payload?.title || payload?.subject || "Preview";
      if (channel === "email" && payload?.html) {
        bodyEl.innerHTML = `<div class="admin-welcome-email-preview">${payload.html}</div>`;
      } else {
        bodyEl.innerHTML = `<pre class="admin-welcome-preview-text">${escapeHtml(payload?.body || payload?.text || "")}</pre>`;
      }
      wrap.hidden = false;
    }

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setFormMessage("#adminWelcomeMessagesMessage", "Saving…", true);
        await adminFetchJson("/api/admin/onboarding-welcome", {
          method: "POST",
          body: { sequence: collectSequenceFromForm() },
        });
        setFormMessage("#adminWelcomeMessagesMessage", "Welcome messages saved.", true);
        renderAdminWelcomeMessages(container);
      } catch (error) {
        setFormMessage("#adminWelcomeMessagesMessage", error.message || "Save failed.", false);
      }
    });

    container.querySelector("#adminWelcomePreviewInAppBtn")?.addEventListener("click", async () => {
      try {
        const data = await adminFetchJson("/api/admin/onboarding-welcome/preview", {
          method: "POST",
          body: { channel: "in_app", sequence: collectSequenceFromForm(), firstName: "Alex" },
        });
        showPreview(data, "inApp");
      } catch (error) {
        setFormMessage("#adminWelcomeMessagesMessage", error.message || "Preview failed.", false);
      }
    });

    container.querySelector("#adminWelcomePreviewEmailBtn")?.addEventListener("click", async () => {
      try {
        const data = await adminFetchJson("/api/admin/onboarding-welcome/preview", {
          method: "POST",
          body: { channel: "email", sequence: collectSequenceFromForm(), firstName: "Alex" },
        });
        showPreview(data, "email");
      } catch (error) {
        setFormMessage("#adminWelcomeMessagesMessage", error.message || "Preview failed.", false);
      }
    });

    container.querySelector("#adminWelcomePreviewCloseBtn")?.addEventListener("click", () => {
      const wrap = container.querySelector("#adminWelcomePreviewWrap");
      if (wrap) wrap.hidden = true;
    });

    container.querySelector("#adminWelcomeBackfillBtn")?.addEventListener("click", async () => {
      try {
        const dryRun = await adminFetchJson("/api/admin/onboarding-welcome/backfill", {
          method: "POST",
          body: { count: 5 },
        });
        if (!dryRun.recipients?.length) {
          setFormMessage("#adminWelcomeMessagesMessage", "No eligible Free signups found for backfill.", false);
          return;
        }
        const names = dryRun.recipients.map((r) => r.email).join(", ");
        const ok = window.confirm(`Send welcome to the last ${dryRun.count} Free signups?\n\n${names}\n\nThis cannot be undone for accounts that already received the welcome.`);
        if (!ok) return;
        const result = await adminFetchJson("/api/admin/onboarding-welcome/backfill", {
          method: "POST",
          body: { count: 5, confirmPhrase: dryRun.confirmPhrase },
        });
        setFormMessage("#adminWelcomeMessagesMessage", `Backfill complete for ${result.count} account(s).`, true);
      } catch (error) {
        setFormMessage("#adminWelcomeMessagesMessage", error.message || "Backfill failed.", false);
      }
    });
  }

  window.renderAdminWelcomeMessages = renderAdminWelcomeMessages;

  function formatHealthDate(iso) {
    if (!iso) return "—";
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toLocaleDateString();
  }

  function paintAdminUserHealth(container, users, filterLevel) {
    const counts = {
      active: users.filter((u) => u.level === "active").length,
      at_risk: users.filter((u) => u.level === "at_risk").length,
      inactive: users.filter((u) => u.level === "inactive").length,
    };
    const filter = filterLevel || "all";
    const filtered = filter === "all" ? users : users.filter((u) => u.level === filter);
    const filterLabel = filter === "all"
      ? "All users"
      : filter === "at_risk"
        ? "At risk"
        : filter.charAt(0).toUpperCase() + filter.slice(1);

    container.innerHTML = adminPanelShell("User Health", `
      <p class="muted-copy">Click a category to drill into that group. Scoring is unchanged — this view only filters and expands details.</p>
      <div class="admin-health-grid" role="group" aria-label="User health categories">
        <button type="button" class="admin-health-card active${filter === "active" ? " is-selected" : ""}" data-health-filter="active">
          <span>Active</span><strong>${counts.active}</strong>
        </button>
        <button type="button" class="admin-health-card at_risk${filter === "at_risk" ? " is-selected" : ""}" data-health-filter="at_risk">
          <span>At risk</span><strong>${counts.at_risk}</strong>
        </button>
        <button type="button" class="admin-health-card inactive${filter === "inactive" ? " is-selected" : ""}" data-health-filter="inactive">
          <span>Inactive</span><strong>${counts.inactive}</strong>
        </button>
      </div>
      <div class="admin-health-table-toolbar">
        <h4>${escapeHtml(filterLabel)} (${filtered.length})</h4>
        ${filter !== "all" ? `<button type="button" class="ghost-button" data-health-filter="all">Show all</button>` : ""}
      </div>
      <div class="admin-health-table-wrap">
        ${filtered.length ? `
          <table class="admin-health-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Account type</th>
                <th>Plan</th>
                <th>Last login</th>
                <th>Last activity</th>
                <th>Created</th>
                <th>Days since activity</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((u) => {
                const email = u.email || "";
                const lastActivity = u.lastActivityAt || u.lastLoginAt || u.lastSeenAt || "";
                const days = Number.isFinite(Number(u.daysSince)) ? String(u.daysSince) : "—";
                return `
                  <tr>
                    <td>${escapeHtml(u.name || "—")}</td>
                    <td>${escapeHtml(email)}</td>
                    <td>${escapeHtml(u.accountType || "—")}</td>
                    <td>${escapeHtml(u.accessPlan || u.plan || "Free")}</td>
                    <td title="${escapeHtml(u.lastLoginAt || "")}">${escapeHtml(u.lastLoginAt ? messagingRelativeTime(u.lastLoginAt) : "—")}</td>
                    <td title="${escapeHtml(lastActivity)}">${escapeHtml(lastActivity ? messagingRelativeTime(lastActivity) : "—")}</td>
                    <td>${escapeHtml(formatHealthDate(u.createdAt))}</td>
                    <td>${escapeHtml(days)}</td>
                    <td title="${escapeHtml((u.reasons || []).join(" · "))}">${escapeHtml(String(u.score ?? "—"))}</td>
                    <td class="admin-health-actions">
                      <button type="button" class="ghost-button" data-health-message="${escapeHtml(email)}">Message</button>
                      <button type="button" class="ghost-button" data-health-conversation="${escapeHtml(email)}">Conversation</button>
                      <button type="button" class="ghost-button" data-admin-open-timeline="${escapeHtml(email)}">Timeline</button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        ` : `<div class="empty-state">No users in this category.</div>`}
      </div>
    `);

    container.querySelectorAll("[data-health-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        paintAdminUserHealth(container, users, btn.getAttribute("data-health-filter") || "all");
      });
    });
    container.querySelectorAll("[data-admin-open-timeline]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const email = btn.getAttribute("data-admin-open-timeline");
        if (email && typeof window.openAdminUserTimeline === "function") window.openAdminUserTimeline(email);
      });
    });
    container.querySelectorAll("[data-health-message]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const email = btn.getAttribute("data-health-message");
        if (email && typeof window.startAdminMessageToUser === "function") window.startAdminMessageToUser(email);
      });
    });
    container.querySelectorAll("[data-health-conversation]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const email = btn.getAttribute("data-health-conversation");
        if (email && typeof window.startAdminMessageToUser === "function") {
          window.startAdminMessageToUser(email, { openConversation: true });
        }
      });
    });
  }

  async function renderAdminUserHealth(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading user health…</p>`;
    let users = [];
    try {
      const data = await adminFetchJson("/api/admin/user-health");
      if (Array.isArray(data.users)) {
        users = data.users;
      } else if (Array.isArray(data.health)) {
        users = data.health;
      } else {
        users = [
          ...(Array.isArray(data.active) ? data.active : []),
          ...(Array.isArray(data.at_risk) ? data.at_risk : []),
          ...(Array.isArray(data.inactive) ? data.inactive : []),
        ];
      }
    } catch {
      // Fallback must use the full analytics user directory — never slice/hide users.
      users = Array.isArray(window.adminAnalyticsCache?.users)
        ? window.adminAnalyticsCache.users.map((u) => ({
          email: u.email,
          name: displayUserName(u),
          level: "active",
          score: 50,
          accessPlan: "Free",
          accountType: "",
          createdAt: u.signupAt || u.createdAt || "",
          lastLoginAt: u.lastLoginAt || "",
          lastActivityAt: u.lastLoginAt || u.lastSeenAt || "",
          daysSince: "",
          reasons: ["From analytics cache"],
        }))
        : [];
    }
    paintAdminUserHealth(container, users, "all");
  }

  window.renderAdminUserHealth = renderAdminUserHealth;

  async function renderAdminInbox(container) {
    if (!container) return;
    let items = [];
    let summary = { total: 0, support: 0, feature: 0, bug: 0, feedback: 0, message: 0 };
    let loadError = "";
    let selectedId = "";
    let kindFilter = "all";
    let searchQuery = "";
    let conversationHtml = "";
    let conversationLoading = false;
    let conversationError = "";
    const pageSize = 20;
    let page = 0;

    function inboxErrorHtml(message) {
      return adminPanelShell("Admin Inbox", `
        <div class="admin-async-state is-error" role="alert">
          <p><strong>${escapeHtml(message || "Could not load inbox.")}</strong></p>
          <p class="muted-copy">Check your connection or open System Health. You can retry without refreshing the page.</p>
          <button type="button" class="primary-button" data-inbox-retry>Retry</button>
        </div>
      `, "Messaging");
    }

    async function loadInboxItems() {
      container.innerHTML = adminPanelShell("Admin Inbox", `
        <div class="admin-async-state" role="status">
          <p><strong>Loading admin inbox…</strong></p>
          <p class="muted-copy">This should finish within a few seconds.</p>
        </div>
      `, "Messaging");
      loadError = "";
      try {
        const data = await adminFetchJson("/api/admin/inbox");
        items = Array.isArray(data.items) ? data.items : [];
        summary = data.summary || summary;
        selectedId = items[0]?.id || "";
        window.__adminInboxLastLoadOk = true;
      } catch (error) {
        loadError = error.message || "Could not load inbox.";
        window.__adminInboxLastLoadOk = false;
        container.innerHTML = inboxErrorHtml(loadError);
        container.querySelector("[data-inbox-retry]")?.addEventListener("click", () => loadInboxItems().then(() => paint()));
        return false;
      }
      return true;
    }

    async function loadConversation(selected) {
      conversationHtml = "";
      conversationError = "";
      if (!selected?.email) return;
      conversationLoading = true;
      paint();
      try {
        const convo = await adminFetchJson(
          `/api/admin/messages/conversation?userEmail=${encodeURIComponent(selected.email)}`,
        );
        const messages = Array.isArray(convo.messages) ? convo.messages : [];
        conversationHtml = messages.length
          ? `<div class="admin-inbox-thread">
              <div class="admin-inbox-thread-head">
                <h4>Full conversation (${messages.length} message${messages.length === 1 ? "" : "s"})</h4>
                <button type="button" class="ghost-button" data-inbox-conversation="${escapeHtml(selected.email)}">Open in All Conversations</button>
              </div>
              ${messages.map((m) => `
                <article class="admin-inbox-thread-item ${m.senderType === "admin" ? "from-admin" : "from-user"}">
                  <strong>${escapeHtml(m.senderType === "admin" ? "You" : (selected.name || selected.email))}</strong>
                  <p>${escapeHtml(m.body || m.subject || "")}</p>
                  <small>${escapeHtml(m.createdAt ? messagingRelativeTime(m.createdAt) : "")}</small>
                </article>
              `).join("")}
            </div>`
          : `<p class="muted-copy">No conversation history yet.</p>`;
      } catch (error) {
        conversationError = error.message || "Conversation history unavailable.";
        conversationHtml = `<div class="admin-async-state is-error"><p>${escapeHtml(conversationError)}</p><button type="button" class="ghost-button" data-inbox-conversation-retry>Retry conversation</button></div>`;
      } finally {
        conversationLoading = false;
      }
    }

    function visibleItems() {
      let visible = items;
      if (kindFilter === "test-internal") {
        visible = items.filter((i) => i.isTestInternal);
      } else if (kindFilter !== "all") {
        visible = items.filter((i) => i.kind === kindFilter);
      }
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        visible = visible.filter((item) => {
          const hay = `${item.title || ""} ${item.name || ""} ${item.email || ""} ${item.preview || ""}`.toLowerCase();
          return hay.includes(q);
        });
      }
      return visible;
    }

    async function paint(selectedOverride) {
      if (selectedOverride) selectedId = selectedOverride;
      if (loadError) {
        container.innerHTML = inboxErrorHtml(loadError);
        container.querySelector("[data-inbox-retry]")?.addEventListener("click", () => loadInboxItems().then(() => paint()));
        return;
      }
      const visible = visibleItems();
      const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
      if (page >= totalPages) page = Math.max(0, totalPages - 1);
      const pageItems = visible.slice(page * pageSize, (page + 1) * pageSize);
      if (selectedId && !visible.some((i) => i.id === selectedId)) {
        selectedId = visible[0]?.id || "";
      }
      const selected = visible.find((i) => i.id === selectedId) || null;

      container.innerHTML = adminPanelShell("Admin Inbox", `
        ${typeof window.adminMessagesWorkspaceNavHtml === "function" ? window.adminMessagesWorkspaceNavHtml("admin-inbox") : ""}
        <p class="muted-copy">New support, bug, feature, and feedback submissions plus unread member messages — in one place.</p>
        <label class="search-wrap admin-search">
          <span>Search conversations</span>
          <input type="search" data-inbox-search placeholder="Search title, name, or email" value="${escapeHtml(searchQuery)}" />
        </label>
        <div class="admin-inbox-summary">
          <button type="button" class="comms-admin-tab${kindFilter === "all" ? " active" : ""}" data-inbox-kind="all">All (${summary.total || items.length})</button>
          <button type="button" class="comms-admin-tab${kindFilter === "message" ? " active" : ""}" data-inbox-kind="message">Messages (${summary.message || 0})</button>
          <button type="button" class="comms-admin-tab${kindFilter === "support" ? " active" : ""}" data-inbox-kind="support">Support (${summary.support || 0})</button>
          <button type="button" class="comms-admin-tab${kindFilter === "bug" ? " active" : ""}" data-inbox-kind="bug">Bugs (${summary.bug || 0})</button>
          <button type="button" class="comms-admin-tab${kindFilter === "feature" ? " active" : ""}" data-inbox-kind="feature">Features (${summary.feature || 0})</button>
          <button type="button" class="comms-admin-tab${kindFilter === "feedback" ? " active" : ""}" data-inbox-kind="feedback">Feedback (${summary.feedback || 0})</button>
          <button type="button" class="comms-admin-tab${kindFilter === "test-internal" ? " active" : ""}" data-inbox-kind="test-internal">Test / Internal (${summary.testInternal || 0})</button>
        </div>
        <div class="admin-inbox-layout">
          <div class="admin-inbox-list" role="list">
            ${pageItems.length ? pageItems.map((item) => `
              <button type="button" class="admin-inbox-item${item.id === selectedId ? " is-selected" : ""}${item.isTestInternal ? " is-test-internal" : ""}" data-inbox-id="${escapeHtml(item.id)}" role="listitem">
                <span class="status-pill">${escapeHtml(item.kindLabel || item.kind)}${item.isTestInternal ? '<span class="admin-inbox-test-badge">Test / Internal</span>' : ""}</span>
                <strong>${escapeHtml(item.title || "Untitled")}</strong>
                <span>${escapeHtml(item.name || item.email || "Unknown")}</span>
                <small>${escapeHtml(item.createdAt ? messagingRelativeTime(item.createdAt) : "")}${item.unreadCount ? ` · ${item.unreadCount} unread` : ""}</small>
                <p>${escapeHtml(item.preview || "")}</p>
              </button>
            `).join("") : `<div class="empty-state">Inbox is clear.</div>`}
          </div>
          <div class="admin-inbox-detail">
            ${selected ? `
              <div class="admin-inbox-detail-header">
                <p class="eyebrow">${escapeHtml(selected.kindLabel || selected.kind)} · ${escapeHtml(selected.status || "")}${selected.isTestInternal ? ' · <span class="admin-inbox-test-badge">Test / Internal</span>' : ""}</p>
                <h3>${escapeHtml(selected.title || "")}</h3>
                <p>${escapeHtml(selected.name || "—")} · ${escapeHtml(selected.email || "—")}</p>
              </div>
              <div class="admin-inbox-body">${escapeHtml(selected.body || selected.preview || "No details.")}</div>
              <div class="admin-inbox-actions">
                ${selected.email ? `
                  <button type="button" class="primary-button" data-inbox-reply="${escapeHtml(selected.email)}">Reply / Message</button>
                  <button type="button" class="ghost-button" data-inbox-conversation="${escapeHtml(selected.email)}">Open conversation</button>
                  <button type="button" class="ghost-button" data-inbox-user="${escapeHtml(selected.email)}">View user</button>
                ` : ""}
                <button type="button" class="ghost-button" data-inbox-archive="${escapeHtml(selected.id)}">Archive (hide from inbox)</button>
              </div>
              ${conversationLoading ? `<p class="muted-copy">Loading conversation…</p>` : conversationHtml}
            ` : `<div class="empty-state">Select an item to review.</div>`}
          </div>
        </div>
        <div class="admin-users-pagination">
          <span>Page ${page + 1} of ${totalPages}</span>
          <div class="account-actions-row">
            <button type="button" class="ghost-button" data-inbox-page="prev" ${page <= 0 ? "disabled" : ""}>Previous</button>
            <button type="button" class="ghost-button" data-inbox-page="next" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
            <button type="button" class="ghost-button" data-inbox-retry>Refresh inbox</button>
          </div>
        </div>
      `, "Messaging");

      container.querySelectorAll("[data-inbox-kind]").forEach((btn) => {
        btn.addEventListener("click", () => {
          kindFilter = btn.getAttribute("data-inbox-kind") || "all";
          page = 0;
          paint();
        });
      });
      container.querySelectorAll("[data-inbox-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-inbox-id") || "";
          selectedId = id;
          const sel = visibleItems().find((i) => i.id === id);
          if (sel?.email) await loadConversation(sel);
          else paint(id);
        });
      });
      container.querySelector("[data-inbox-search]")?.addEventListener("input", (event) => {
        searchQuery = event.target.value;
        page = 0;
        paint();
      });
      container.querySelector("[data-inbox-page='prev']")?.addEventListener("click", () => { page -= 1; paint(); });
      container.querySelector("[data-inbox-page='next']")?.addEventListener("click", () => { page += 1; paint(); });
      container.querySelectorAll("[data-inbox-retry]").forEach((btn) => {
        btn.addEventListener("click", () => loadInboxItems().then(() => paint()));
      });
      container.querySelector("[data-inbox-conversation-retry]")?.addEventListener("click", async () => {
        const sel = visibleItems().find((i) => i.id === selectedId);
        if (sel) await loadConversation(sel);
        paint();
      });
      container.querySelectorAll("[data-inbox-reply]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const email = btn.getAttribute("data-inbox-reply");
          if (email && typeof window.startAdminMessageToUser === "function") window.startAdminMessageToUser(email);
        });
      });
      container.querySelectorAll("[data-inbox-conversation]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const email = btn.getAttribute("data-inbox-conversation");
          if (email && typeof window.startAdminMessageToUser === "function") {
            window.startAdminMessageToUser(email, { openConversation: true });
          }
        });
      });
      container.querySelectorAll("[data-inbox-user]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const email = btn.getAttribute("data-inbox-user");
          if (email && typeof window.openAdminUserProfile === "function") window.openAdminUserProfile(email, "view");
          else if (email && typeof window.setAdminSectionTab === "function") window.setAdminSectionTab("users");
        });
      });
      container.querySelectorAll("[data-inbox-archive]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-inbox-archive") || "";
          if (!id) return;
          const item = visibleItems().find((i) => i.id === id);
          const label = item?.title || id;
          const ok = window.confirm(
            `Archive "${label}"?\n\nThis hides the item from the admin inbox without deleting the underlying support record or message history.`,
          );
          if (!ok) return;
          try {
            await adminFetchJson("/api/admin/inbox/archive", {
              method: "POST",
              body: { confirm: true, id },
            });
            items = items.filter((i) => i.id !== id);
            if (selectedId === id) selectedId = items[0]?.id || "";
            paint();
          } catch (error) {
            loadError = error.message || "Could not archive inbox item.";
            paint();
          }
        });
      });
    }

    const loaded = await loadInboxItems();
    if (!loaded) return;
    const initial = items[0];
    if (initial?.email) await loadConversation(initial);
    await paint();
  }

  window.renderAdminInbox = renderAdminInbox;

  async function renderAdminAutomations(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading automations…</p>`;
    let automations = [];
    try {
      const data = await adminFetchJson("/api/admin/automations");
      automations = Array.isArray(data.automations) ? data.automations : [];
    } catch {
      automations = [
        {
          id: "trial-sequence",
          name: "Trial Users",
          audience: "trial",
          enabled: true,
          steps: [
            { day: 1, label: "Day 1 Welcome" },
            { day: 3, label: "Day 3 Tips" },
            { day: 5, label: "Day 5 Best Features" },
            { day: 7, label: "Day 7 Upgrade Offer" },
          ],
        },
        {
          id: "founding-sequence",
          name: "Founding Members",
          audience: "founding",
          enabled: true,
          steps: [
            { day: 0, label: "Welcome" },
            { day: 14, label: "Product Updates" },
            { day: 30, label: "New Feature Announcements" },
          ],
        },
      ];
    }

    container.innerHTML = adminPanelShell("Automations", `
      <div class="ticket-list">
        ${automations.map((a) => `
          <article class="ticket-card" data-automation-id="${escapeHtml(a.id)}">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(a.audience || "all")} · ${a.enabled === false ? "Paused" : "Enabled"}</p>
                <h3>${escapeHtml(a.name || a.id)}</h3>
              </div>
              <label class="checkbox-row">
                <input type="checkbox" data-automation-toggle="${escapeHtml(a.id)}" ${a.enabled === false ? "" : "checked"} />
                Enabled
              </label>
            </div>
            <ul class="admin-email-step-list">
              ${(a.steps || []).map((s) => `
                <li><strong>Day ${escapeHtml(String(s.day ?? 0))}</strong> · ${escapeHtml(s.label || s.subject || "Step")}</li>
              `).join("")}
            </ul>
          </article>
        `).join("") || `<div class="empty-state">No automations configured.</div>`}
      </div>
      <p class="form-note" id="adminAutomationsMessage"></p>
    `, "Messaging", "automations");

    container.querySelectorAll("[data-automation-toggle]").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.getAttribute("data-automation-toggle");
        const current = automations.find((a) => a.id === id) || { id };
        try {
          await adminFetchJson("/api/admin/automations", {
            method: "POST",
            body: {
              automation: {
                ...current,
                id,
                enabled: input.checked,
              },
            },
          });
          setFormMessage("#adminAutomationsMessage", "Automation updated.", true);
        } catch (error) {
          setFormMessage("#adminAutomationsMessage", error.message || "Could not update automation.", false);
          input.checked = !input.checked;
        }
      });
    });
  }

  window.renderAdminAutomations = renderAdminAutomations;

  async function renderAdminChangelogEditor(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading release notes…</p>`;
    let notes = [];
    try {
      const data = await adminFetchJson("/api/admin/release-notes");
      notes = Array.isArray(data.releaseNotes) ? data.releaseNotes : [];
    } catch (error) {
      container.innerHTML = adminPanelShell("Changelog Editor", `<div class="empty-state">${escapeHtml(error.message)}</div>`);
      return;
    }

    container.innerHTML = adminPanelShell("Changelog Editor", `
      <form class="panel-form" id="adminChangelogCreateForm" data-draft-scope="admin" data-draft-form="changelog-create">
        <label>Version<input name="version" required placeholder="e.g. 1.4.0" maxlength="80" /></label>
        <label>Release date<input name="releaseDate" type="date" /></label>
        <label>New Features<textarea name="featuresAdded" rows="3" placeholder="One item per line"></textarea></label>
        <label>Improvements<textarea name="improvements" rows="3" placeholder="One item per line"></textarea></label>
        <label>Bug Fixes<textarea name="bugsFixed" rows="3" placeholder="One item per line"></textarea></label>
        <label>Lesson Plan Additions<textarea name="lessonPlanAdditions" rows="2" placeholder="One item per line"></textarea></label>
        <label>Activity Additions<textarea name="activityAdditions" rows="2" placeholder="One item per line"></textarea></label>
        <label>Status
          <select name="status">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <div class="account-actions-row">
          <button type="submit" class="primary-button">Save release note</button>
          <span data-draft-status class="messages-draft-status" aria-live="polite"></span>
        </div>
        <p class="form-note" id="adminChangelogMessage"></p>
      </form>
      <div class="ticket-list" id="adminChangelogList">
        ${notes.length ? notes.map((n) => `
          <article class="ticket-card">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(n.status || "draft")}</p>
                <h3>${escapeHtml(n.version || "Untitled")}</h3>
                <small>${escapeHtml(n.releaseDate || messagingRelativeTime(n.createdAt) || "")}</small>
              </div>
              ${n.status !== "published" ? `<button type="button" class="ghost-button" data-publish-note="${escapeHtml(n.id)}">Publish</button>` : ""}
            </div>
            ${changelogCategoryBlocks(n)}
          </article>
        `).join("") : `<div class="empty-state">No release notes yet.</div>`}
      </div>
    `);

    const form = container.querySelector("#adminChangelogCreateForm");
    if (form) LLHDrafts.attach(form);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const lines = (key) => String(fd.get(key) || "").split("\n").map((s) => s.trim()).filter(Boolean);
      try {
        setFormMessage("#adminChangelogMessage", "Saving…", true);
        await adminFetchJson("/api/admin/release-notes", {
          method: "POST",
          body: {
            version: fd.get("version"),
            releaseDate: fd.get("releaseDate"),
            featuresAdded: lines("featuresAdded"),
            improvements: lines("improvements"),
            bugsFixed: lines("bugsFixed"),
            lessonPlanAdditions: lines("lessonPlanAdditions"),
            activityAdditions: lines("activityAdditions"),
            status: fd.get("status") || "draft",
          },
        });
        await LLHDrafts.clear(form);
        setFormMessage("#adminChangelogMessage", "Release note saved.", true);
        renderAdminChangelogEditor(container);
      } catch (error) {
        setFormMessage("#adminChangelogMessage", error.message || "Save failed.", false);
      }
    });

    container.querySelectorAll("[data-publish-note]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-publish-note");
        try {
          await adminFetchJson("/api/admin/release-note-update", {
            method: "POST",
            body: { id, status: "published" },
          });
          renderAdminChangelogEditor(container);
        } catch (error) {
          setFormMessage("#adminChangelogMessage", error.message || "Publish failed.", false);
        }
      });
    });
  }

  window.renderAdminChangelogEditor = renderAdminChangelogEditor;

  function statusSelectHtml(statuses, current, attrName, id) {
    return `
      <select ${attrName}="${escapeHtml(id)}">
        ${statuses.map((s) => `<option value="${escapeHtml(s)}"${s === current ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
      </select>
    `;
  }

  async function renderAdminFeatureRequests(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading feature requests…</p>`;
    let items = [];
    try {
      const data = await adminFetchJson("/api/feature-requests");
      items = Array.isArray(data.featureRequests) ? data.featureRequests : [];
    } catch (error) {
      container.innerHTML = adminPanelShell("Feature Requests", `<div class="empty-state">${escapeHtml(error.message)}</div>`);
      return;
    }

    container.innerHTML = adminPanelShell("Feature Requests", `
      <div class="ticket-list">
        ${items.length ? items.map((item) => `
          <article class="ticket-card" data-feature-id="${escapeHtml(item.id)}">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(item.category || "General")}${item.ageGroup ? ` · ${escapeHtml(item.ageGroup)}` : ""} · ${escapeHtml(String(item.votes || 0))} votes</p>
                <h3>${escapeHtml(item.title || "")}</h3>
                <p>${escapeHtml(item.name || "")} · ${escapeHtml(item.email || "")}${item.source ? ` · ${escapeHtml(item.source)}` : ""}</p>
                <small>${escapeHtml(messagingRelativeTime(item.createdAt))}</small>
              </div>
              <label>Status
                ${statusSelectHtml(FEATURE_REQUEST_STATUSES, item.status || "New", "data-feature-status", item.id)}
              </label>
            </div>
            <p>${escapeHtml(item.description || "")}</p>
          </article>
        `).join("") : `<div class="empty-state">No feature requests yet.</div>`}
      </div>
      <p class="form-note" id="adminFeatureRequestsMessage"></p>
    `);

    container.querySelectorAll("[data-feature-status]").forEach((select) => {
      select.addEventListener("change", async () => {
        const id = select.getAttribute("data-feature-status");
        try {
          await adminFetchJson("/api/admin/feature-request-update", {
            method: "POST",
            body: { id, status: select.value },
          });
          setFormMessage("#adminFeatureRequestsMessage", "Status updated.", true);
        } catch (error) {
          setFormMessage("#adminFeatureRequestsMessage", error.message || "Update failed.", false);
        }
      });
    });
  }

  window.renderAdminFeatureRequests = renderAdminFeatureRequests;

  const LESSON_PLAN_REQUEST_STATUSES = Object.freeze([
    "Received",
    "Planned",
    "In Progress",
    "Published",
    "Not Planned",
  ]);

  async function renderAdminLessonPlanRequests(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading lesson plan requests…</p>`;
    let items = [];
    try {
      const data = await adminFetchJson("/api/lesson-plan-requests");
      items = Array.isArray(data.lessonPlanRequests) ? data.lessonPlanRequests : [];
    } catch (error) {
      container.innerHTML = adminPanelShell("Lesson Plan Requests", `<div class="empty-state">${escapeHtml(error.message)}</div>`);
      return;
    }

    container.innerHTML = adminPanelShell("Lesson Plan Requests", `
      <p class="form-note">Review member theme requests. Status updates notify the requester in-app. Publishing does not promise every request will be created.</p>
      <div class="ticket-list">
        ${items.length ? items.map((item) => `
          <article class="ticket-card" data-lesson-plan-request-id="${escapeHtml(item.id)}">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(item.ageGroup || "")} · Needed ${escapeHtml(item.neededBy || "—")}</p>
                <h3>${escapeHtml(item.theme || "")}</h3>
                <p>${escapeHtml(item.name || "")} · ${escapeHtml(item.email || "")}</p>
                <small>${escapeHtml(messagingRelativeTime(item.createdAt))}</small>
              </div>
              <label>Status
                ${statusSelectHtml(LESSON_PLAN_REQUEST_STATUSES, item.status || "Received", "data-lesson-plan-request-status", item.id)}
              </label>
            </div>
            ${item.details ? `<p>${escapeHtml(item.details)}</p>` : ""}
            <div class="account-actions-row" style="margin-top:10px;gap:8px;flex-wrap:wrap;">
              <label>Linked lesson plan id
                <input type="text" data-lesson-plan-request-link-id="${escapeHtml(item.id)}" value="${escapeHtml(item.linkedLessonPlanId || "")}" placeholder="curriculum lesson id" />
              </label>
              <label>Linked title
                <input type="text" data-lesson-plan-request-link-title="${escapeHtml(item.id)}" value="${escapeHtml(item.linkedLessonPlanTitle || "")}" placeholder="Published plan title" />
              </label>
              <button class="ghost-button" type="button" data-lesson-plan-request-save-link="${escapeHtml(item.id)}">Save link</button>
            </div>
          </article>
        `).join("") : `<div class="empty-state">No lesson plan requests yet.</div>`}
      </div>
      <p class="form-note" id="adminLessonPlanRequestsMessage"></p>
    `);

    container.querySelectorAll("[data-lesson-plan-request-status]").forEach((select) => {
      select.addEventListener("change", async () => {
        const id = select.getAttribute("data-lesson-plan-request-status");
        const linkId = container.querySelector(`[data-lesson-plan-request-link-id="${CSS.escape(id)}"]`)?.value || "";
        const linkTitle = container.querySelector(`[data-lesson-plan-request-link-title="${CSS.escape(id)}"]`)?.value || "";
        try {
          await adminFetchJson("/api/admin/lesson-plan-request-update", {
            method: "POST",
            body: {
              id,
              status: select.value,
              linkedLessonPlanId: linkId,
              linkedLessonPlanTitle: linkTitle,
            },
          });
          setFormMessage("#adminLessonPlanRequestsMessage", "Status updated.", true);
        } catch (error) {
          setFormMessage("#adminLessonPlanRequestsMessage", error.message || "Update failed.", false);
        }
      });
    });
    container.querySelectorAll("[data-lesson-plan-request-save-link]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-lesson-plan-request-save-link");
        const linkId = container.querySelector(`[data-lesson-plan-request-link-id="${CSS.escape(id)}"]`)?.value || "";
        const linkTitle = container.querySelector(`[data-lesson-plan-request-link-title="${CSS.escape(id)}"]`)?.value || "";
        const status = container.querySelector(`[data-lesson-plan-request-status="${CSS.escape(id)}"]`)?.value || "Received";
        try {
          await adminFetchJson("/api/admin/lesson-plan-request-update", {
            method: "POST",
            body: {
              id,
              status: linkId || linkTitle ? "Published" : status,
              linkedLessonPlanId: linkId,
              linkedLessonPlanTitle: linkTitle,
            },
          });
          setFormMessage("#adminLessonPlanRequestsMessage", "Linked lesson plan saved.", true);
          renderAdminLessonPlanRequests(container);
        } catch (error) {
          setFormMessage("#adminLessonPlanRequestsMessage", error.message || "Save failed.", false);
        }
      });
    });
  }

  window.renderAdminLessonPlanRequests = renderAdminLessonPlanRequests;

  async function renderAdminBugReports(container) {
    if (!container) return;
    container.innerHTML = `<p class="messages-loading">Loading bug reports…</p>`;
    let items = [];
    try {
      const data = await adminFetchJson("/api/bug-reports");
      items = Array.isArray(data.bugReports) ? data.bugReports : [];
    } catch (error) {
      container.innerHTML = adminPanelShell("Bug Reports", `<div class="empty-state">${escapeHtml(error.message)}</div>`);
      return;
    }

    container.innerHTML = adminPanelShell("Bug Reports", `
      <div class="ticket-list">
        ${items.length ? items.map((item) => `
          <article class="ticket-card" data-bug-id="${escapeHtml(item.id)}">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(item.category || "Other")}</p>
                <h3>${escapeHtml(item.title || "")}</h3>
                <p>${escapeHtml(item.name || "")} · ${escapeHtml(item.email || "")}</p>
                <small>${escapeHtml(messagingRelativeTime(item.createdAt))}</small>
              </div>
              <label>Status
                ${statusSelectHtml(BUG_REPORT_STATUSES, item.status || "New", "data-bug-status", item.id)}
              </label>
            </div>
            <p>${escapeHtml(item.description || "")}</p>
          </article>
        `).join("") : `<div class="empty-state">No bug reports yet.</div>`}
      </div>
      <p class="form-note" id="adminBugReportsMessage"></p>
    `);

    container.querySelectorAll("[data-bug-status]").forEach((select) => {
      select.addEventListener("change", async () => {
        const id = select.getAttribute("data-bug-status");
        try {
          await adminFetchJson("/api/admin/bug-report-update", {
            method: "POST",
            body: { id, status: select.value },
          });
          setFormMessage("#adminBugReportsMessage", "Status updated.", true);
        } catch (error) {
          setFormMessage("#adminBugReportsMessage", error.message || "Update failed.", false);
        }
      });
    });
  }

  window.renderAdminBugReports = renderAdminBugReports;

  async function openAdminUserTimeline(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;

    let existing = document.querySelector("#adminUserTimelineModal");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "adminUserTimelineModal";
      existing.className = "modal-overlay admin-timeline-modal";
      existing.setAttribute("aria-hidden", "true");
      existing.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="adminTimelineTitle">
          <div class="modal-header">
            <h3 id="adminTimelineTitle">User timeline</h3>
            <button type="button" class="ghost-button" data-close-timeline aria-label="Close">Close</button>
          </div>
          <div class="modal-body" id="adminTimelineBody"><p class="messages-loading">Loading…</p></div>
          <div id="adminTimelineTags"></div>
        </div>
      `;
      document.body.appendChild(existing);
      existing.addEventListener("click", (event) => {
        if (event.target === existing || event.target.closest("[data-close-timeline]")) {
          existing.classList.remove("open");
          existing.setAttribute("aria-hidden", "true");
        }
      });
    }

    existing.classList.add("open");
    existing.setAttribute("aria-hidden", "false");
    const body = existing.querySelector("#adminTimelineBody");
    const tagsHost = existing.querySelector("#adminTimelineTags");
    body.innerHTML = `<p class="messages-loading">Loading timeline for ${escapeHtml(normalized)}…</p>`;

    let events = [];
    try {
      const data = await adminFetchJson(`/api/admin/user-timeline?email=${encodeURIComponent(normalized)}`);
      events = Array.isArray(data.events) ? data.events : (Array.isArray(data.timeline) ? data.timeline : []);
    } catch {
      events = [
        { at: new Date().toISOString(), type: "note", title: "Timeline endpoint unavailable", detail: "Showing placeholder until /api/admin/user-timeline is live." },
      ];
    }

    body.innerHTML = `
      <p class="muted-copy">${escapeHtml(normalized)}</p>
      <div class="ticket-list">
        ${events.length ? events.map((ev) => `
          <article class="ticket-card">
            <div class="ticket-card-header">
              <div>
                <p class="eyebrow">${escapeHtml(ev.type || "event")}</p>
                <h3>${escapeHtml(ev.title || ev.summary || "Event")}</h3>
                <small>${escapeHtml(ev.at ? new Date(ev.at).toLocaleString() : messagingRelativeTime(ev.createdAt))}</small>
              </div>
            </div>
            ${ev.detail || ev.description ? `<p>${escapeHtml(ev.detail || ev.description)}</p>` : ""}
          </article>
        `).join("") : `<div class="empty-state">No timeline events yet.</div>`}
      </div>
    `;

    if (tagsHost) {
      await renderAdminUserTags(normalized, tagsHost);
    }
  }

  window.openAdminUserTimeline = openAdminUserTimeline;

  async function renderAdminUserTags(email, container) {
    if (!container) return;
    const normalized = String(email || "").trim().toLowerCase();
    container.innerHTML = `<p class="messages-loading">Loading tags…</p>`;

    let tags = [];
    try {
      const data = await adminFetchJson(`/api/admin/user-tags?email=${encodeURIComponent(normalized)}`);
      tags = Array.isArray(data.tags) ? data.tags : [];
    } catch {
      tags = [];
    }

    const render = () => {
      container.innerHTML = `
        <div class="admin-user-tags">
          <h4>Tags</h4>
          <div class="admin-tag-chips" id="adminTagChips">
            ${tags.length ? tags.map((tag) => `
              <button type="button" class="tag admin-tag-chip" data-remove-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ×</button>
            `).join("") : `<span class="muted-copy">No tags yet.</span>`}
          </div>
          <div class="account-actions-row admin-tag-add-row">
            <select id="adminTagPreset">
              <option value="">Add preset…</option>
              ${USER_TAG_PRESETS.filter((t) => !tags.includes(t)).map((t) => `
                <option value="${escapeHtml(t)}">${escapeHtml(t)}</option>
              `).join("")}
            </select>
            <input type="text" id="adminTagCustom" placeholder="Custom tag" maxlength="40" />
            <button type="button" class="ghost-button" id="adminTagAddBtn">Add</button>
          </div>
          <p class="form-note" id="adminUserTagsMessage"></p>
        </div>
      `;

      const persist = async (next) => {
        try {
          await adminFetchJson("/api/admin/user-tags", {
            method: "POST",
            body: { email: normalized, tags: next },
          });
          tags = next;
          setFormMessage("#adminUserTagsMessage", "Tags saved.", true);
          render();
        } catch (error) {
          setFormMessage("#adminUserTagsMessage", error.message || "Could not save tags.", false);
        }
      };

      container.querySelectorAll("[data-remove-tag]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tag = btn.getAttribute("data-remove-tag");
          persist(tags.filter((t) => t !== tag));
        });
      });

      container.querySelector("#adminTagAddBtn")?.addEventListener("click", () => {
        const preset = container.querySelector("#adminTagPreset")?.value || "";
        const custom = String(container.querySelector("#adminTagCustom")?.value || "").trim();
        const nextTag = custom || preset;
        if (!nextTag) return;
        if (tags.includes(nextTag)) {
          setFormMessage("#adminUserTagsMessage", "Tag already added.", false);
          return;
        }
        persist([...tags, nextTag]);
      });
    };

    render();
  }

  window.renderAdminUserTags = renderAdminUserTags;

  // ─── Event delegation for messages center ───────────────────────────────────

  document.addEventListener("click", async (event) => {
    const markAllBtn = event.target.closest("[data-messages-mark-all-read]");
    if (markAllBtn) {
      event.preventDefault();
      const unreadCount = Number((myMessagesState.data.unread || []).length || myMessagesState.data.unreadCount || 0);
      const confirmed = window.confirm(
        unreadCount > 0
          ? `Mark all ${unreadCount} message${unreadCount === 1 ? "" : "s"} as read?\n\nMessage history will not be deleted.`
          : "Mark all messages as read?\n\nMessage history will not be deleted.",
      );
      if (!confirmed) return;
      if (typeof window.markNotificationRead === "function") {
        await window.markNotificationRead({ all: true });
      }
      await renderMyMessagesCenter({ tab: myMessagesState.tab || "unread" });
      refreshNotificationBellSafe();
      return;
    }

    const openItem = event.target.closest("[data-messages-open-item]");
    if (openItem) {
      event.preventDefault();
      const id = openItem.getAttribute("data-messages-open-item") || openItem.getAttribute("data-item-id") || "";
      if (id && typeof window.markNotificationRead === "function") {
        await window.markNotificationRead({ id });
      }
      // Keep the item visible; refresh counts after an explicit open/mark action.
      await renderMyMessagesCenter({ tab: myMessagesState.tab || "inbox" });
      refreshNotificationBellSafe();
      return;
    }

    const tabBtn = event.target.closest("[data-messages-center-tab]");
    if (tabBtn) {
      event.preventDefault();
      // Flush in-progress reply text before the tab remount destroys the textarea.
      const replyForm = document.querySelector("#messagesReplyForm");
      if (replyForm) LLHDrafts.flushLocal(replyForm);
      const draft = captureMessagesReplyDraft();
      myMessagesState.tab = tabBtn.getAttribute("data-messages-center-tab") || "inbox";
      paintMyMessagesCenter();
      restoreMessagesReplyDraft(draft);
      return;
    }

    const actionBtn = event.target.closest("[data-messages-center-action]");
    if (actionBtn) {
      event.preventDefault();
      const action = actionBtn.getAttribute("data-messages-center-action");
      if (action === "open-feature") openFeedbackModal("Feature Request");
      else if (action === "open-bug") openFeedbackModal("Bug");
      else if (action === "open-support") openFeedbackModal("General Feedback");
      else if (action === "prefs-link") {
        myMessagesState.tab = "preferences";
        renderMyMessagesCenter({ tab: "preferences" }).catch(() => {});
      }
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== "messagesReplyForm" && form.id !== "messagesCenterReplyForm") return;
    event.preventDefault();
    const textarea = form.querySelector("#messagesReplyInput, #messagesCenterReplyInput, textarea[name='body']");
    const body = String(textarea?.value || "").trim();
    if (!body) return;
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;
    const result = await sendMessagesCenterReply(body);
    if (submitBtn) submitBtn.disabled = false;
    if (result.ok) {
      if (textarea) textarea.value = "";
      await LLHDrafts.clear(form);
      await renderMyMessagesCenter({ tab: "conversation" });
      refreshNotificationBellSafe();
    } else {
      window.alert(result.error || "Could not send your message. Please try again.");
    }
  });

  // ─── 7. Boot ────────────────────────────────────────────────────────────────

  function attachAllDraftForms(root = document) {
    root.querySelectorAll?.("[data-draft-form]")?.forEach((form) => {
      if (form instanceof HTMLFormElement) LLHDrafts.attach(form);
    });
  }

  function startDraftFormObserver() {
    if (!window.MutationObserver) return;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches?.("[data-draft-form]") && node instanceof HTMLFormElement) {
            LLHDrafts.attach(node);
          }
          attachAllDraftForms(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function hookRenderMessagesPage() {
    if (typeof window.renderMessagesPage !== "function") return;
    if (window.renderMessagesPage.__llhCommsWrapped) return;
    const original = window.renderMessagesPage;
    async function wrapped(options = {}) {
      // Preserve login gate via renderMyMessagesCenter (same behavior as original).
      if (!isLoggedIn()) {
        return original.call(this, options);
      }
      return renderMyMessagesCenter(options);
    }
    wrapped.__llhCommsWrapped = true;
    wrapped.__llhOriginal = original;
    window.renderMessagesPage = wrapped;
  }

  function bootCommsCenter() {
    attachAllDraftForms();
    startDraftFormObserver();
    hookRenderMessagesPage();

    // Soft hooks for admin shells if present.
    if (hasAdminFullAccess()) {
      const templateHost = document.querySelector("[data-admin-comms='templates']");
      if (templateHost) renderAdminMessageTemplates(templateHost);
      const healthHost = document.querySelector("[data-admin-comms='user-health']");
      if (healthHost) renderAdminUserHealth(healthHost);
      const autoHost = document.querySelector("[data-admin-comms='automations']");
      if (autoHost) renderAdminAutomations(autoHost);
      const changelogHost = document.querySelector("[data-admin-comms='changelog']");
      if (changelogHost) renderAdminChangelogEditor(changelogHost);
      const featureHost = document.querySelector("[data-admin-comms='features']");
      if (featureHost) renderAdminFeatureRequests(featureHost);
      const bugHost = document.querySelector("[data-admin-comms='bugs']");
      if (bugHost) renderAdminBugReports(bugHost);
    }

    // Inject founding card on settings when already visible.
    if (isLoggedIn() && isFoundingMemberAccount(currentAccountSafe())) {
      const settings = document.querySelector("#view-settings, #settingsHubApp");
      if (settings) renderFoundingMemberExperience({ container: settings });
    }

    // Changelog view if present and active.
    const whatsNew = document.querySelector("#view-whats-new.active-view, #view-whats-new.active");
    if (whatsNew) renderChangelogPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCommsCenter);
  } else {
    bootCommsCenter();
  }

})(window, document);
