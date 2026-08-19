/**
 * Owner-only Social Media Performance Tracker UI.
 * Loaded after admin-workspace.js; uses existing admin styles.
 */
(function adminSocialMediaPerformanceModule() {
  /** @typedef {"7d"|"30d"|"90d"|"all"} DateRange */
  /** @typedef {"all"|"tiktok"|"instagram"|"facebook"|"youtube"} PlatformFilter */
  /** @typedef {"views"|"followers"|"followConversion"|"websiteClicks"|"freeSignups"|"paidSignups"|"newest"|"oldest"} SortKey */

  /** @type {{ range: DateRange, platform: PlatformFilter, sort: SortKey, loading: boolean, error: string, data: object|null, editingId: string, showForm: boolean }} */
  let state = {
    range: "30d",
    platform: "all",
    sort: "newest",
    loading: false,
    error: "",
    data: null,
    editingId: "",
    showForm: false,
  };

  /** @type {Record<string, unknown>|null} */
  let draft = null;

  function esc(value) {
    return typeof escapeHtml === "function" ? escapeHtml(String(value ?? "")) : String(value ?? "");
  }

  function token() {
    try {
      return typeof adminSession === "function" ? (adminSession()?.token || "") : "";
    } catch {
      return "";
    }
  }

  function pct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0.00%";
    return `${num.toFixed(2)}%`;
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : "0";
  }

  function emptyDraft() {
    return {
      platform: "tiktok",
      datePosted: new Date().toISOString().slice(0, 10),
      title: "",
      contentType: "",
      hook: "",
      views: 0,
      newFollowers: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      profileVisits: 0,
      websiteClicks: 0,
      freeSignups: 0,
      paidSignups: 0,
      videoUrl: "",
      notes: "",
      classroomStyleVideo: false,
      showsProduct: false,
      freeResourcePromotion: false,
      ctaUsed: "",
      themeTopic: "",
      backgroundLocation: "",
    };
  }

  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    if (options.body) headers["Content-Type"] = "application/json";
    const res = await fetch(path, {
      ...options,
      headers,
      cache: "no-store",
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  async function loadData() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const qs = new URLSearchParams({
        range: state.range,
        platform: state.platform,
        sort: state.sort,
        _: String(Date.now()),
      });
      const json = await apiFetch(`/api/admin/social-media-performance?${qs}`);
      state.data = json.socialMediaPerformance || null;
    } catch (error) {
      state.error = error?.message || String(error);
    } finally {
      state.loading = false;
      render();
    }
  }

  function summaryCard(label, value, hint = "") {
    return `
      <article class="analytics-card admin-smp-card">
        <p class="eyebrow">${esc(label)}</p>
        <strong class="admin-smp-card-value">${esc(value)}</strong>
        ${hint ? `<small class="muted-copy">${esc(hint)}</small>` : ""}
      </article>
    `;
  }

  function toolbarButton(active, attr, label) {
    return `<button type="button" class="ghost-button${active ? " is-active" : ""}" ${attr}>${esc(label)}</button>`;
  }

  function renderForm() {
    const d = draft || emptyDraft();
    const meta = state.data?.meta || {};
    const platforms = Array.isArray(meta.platforms) ? meta.platforms : [];
    const backgrounds = Array.isArray(meta.backgrounds) ? meta.backgrounds : [];
    const isEdit = Boolean(state.editingId);

    return `
      <div class="admin-smp-form-wrap">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${isEdit ? "Edit post / video" : "Add post / video"}</p>
            <h3>${isEdit ? "Update performance numbers" : "Log a new social post"}</h3>
          </div>
          <button type="button" class="ghost-button" data-smp-cancel-form>Cancel</button>
        </div>
        <form class="admin-smp-form" data-smp-form>
          <div class="admin-smp-form-grid">
            <label>Platform
              <select name="platform" required>
                ${platforms.map((p) => `<option value="${esc(p.id)}"${d.platform === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}
              </select>
            </label>
            <label>Date posted
              <input type="date" name="datePosted" value="${esc(d.datePosted)}" required />
            </label>
            <label class="admin-smp-span-2">Title / description
              <input type="text" name="title" value="${esc(d.title)}" maxlength="500" required placeholder="Short video title or caption" />
            </label>
            <label>Content type / format
              <input type="text" name="contentType" value="${esc(d.contentType)}" maxlength="200" placeholder="e.g. talking head, carousel" />
            </label>
            <label>Hook
              <input type="text" name="hook" value="${esc(d.hook)}" maxlength="500" placeholder="Opening line or hook" />
            </label>
            <label>Views <input type="number" min="0" step="1" name="views" value="${Number(d.views || 0)}" /></label>
            <label>New followers <input type="number" min="0" step="1" name="newFollowers" value="${Number(d.newFollowers || 0)}" /></label>
            <label>Likes <input type="number" min="0" step="1" name="likes" value="${Number(d.likes || 0)}" /></label>
            <label>Comments <input type="number" min="0" step="1" name="comments" value="${Number(d.comments || 0)}" /></label>
            <label>Shares <input type="number" min="0" step="1" name="shares" value="${Number(d.shares || 0)}" /></label>
            <label>Saves <input type="number" min="0" step="1" name="saves" value="${Number(d.saves || 0)}" /></label>
            <label>Profile visits <input type="number" min="0" step="1" name="profileVisits" value="${Number(d.profileVisits || 0)}" /></label>
            <label>Website clicks <input type="number" min="0" step="1" name="websiteClicks" value="${Number(d.websiteClicks || 0)}" /></label>
            <label>Free signups <input type="number" min="0" step="1" name="freeSignups" value="${Number(d.freeSignups || 0)}" /></label>
            <label>Paid signups <input type="number" min="0" step="1" name="paidSignups" value="${Number(d.paidSignups || 0)}" /></label>
            <label class="admin-smp-span-2">Video URL
              <input type="url" name="videoUrl" value="${esc(d.videoUrl)}" placeholder="https://..." />
            </label>
            <label>CTA used
              <input type="text" name="ctaUsed" value="${esc(d.ctaUsed)}" maxlength="300" />
            </label>
            <label>Theme / topic
              <input type="text" name="themeTopic" value="${esc(d.themeTopic)}" maxlength="300" />
            </label>
            <label>Background / location
              <select name="backgroundLocation">
                <option value="">—</option>
                ${backgrounds.map((b) => `<option value="${esc(b.id)}"${d.backgroundLocation === b.id ? " selected" : ""}>${esc(b.label)}</option>`).join("")}
              </select>
            </label>
            <label class="admin-smp-check"><input type="checkbox" name="classroomStyleVideo"${d.classroomStyleVideo ? " checked" : ""} /> Classroom-style video</label>
            <label class="admin-smp-check"><input type="checkbox" name="showsProduct"${d.showsProduct ? " checked" : ""} /> Shows Little Learner Hub product</label>
            <label class="admin-smp-check"><input type="checkbox" name="freeResourcePromotion"${d.freeResourcePromotion ? " checked" : ""} /> Free-resource promotion</label>
            <label class="admin-smp-span-2">Notes
              <textarea name="notes" rows="3" maxlength="5000">${esc(d.notes)}</textarea>
            </label>
          </div>
          <div class="account-actions-row">
            <button type="submit" class="primary-button">${isEdit ? "Save changes" : "Create record"}</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderTable(posts) {
    if (!posts.length) {
      return `<div class="empty-state">No posts in this date range yet. Click “+ Add Post / Video” to log your first one.</div>`;
    }
    return `
      <div class="admin-smp-table-wrap">
        <table class="admin-smp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Platform</th>
              <th>Video / post</th>
              <th>Views</th>
              <th>Followers</th>
              <th>Follow %</th>
              <th>Website clicks</th>
              <th>Free signups</th>
              <th>Paid signups</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${posts.map((post) => `
              <tr data-smp-row="${esc(post.id)}">
                <td>${esc(post.datePosted)}</td>
                <td>${esc(post.platformLabel || post.platform)}</td>
                <td>
                  <button type="button" class="link-button" data-smp-edit="${esc(post.id)}">${esc(post.title || post.hook || "Untitled")}</button>
                  ${post.videoUrl ? `<div><a href="${esc(post.videoUrl)}" target="_blank" rel="noopener noreferrer">Open video</a></div>` : ""}
                </td>
                <td>${num(post.views)}</td>
                <td>${num(post.newFollowers)}</td>
                <td>${pct(post.followConversionRate)}</td>
                <td>${num(post.websiteClicks)}</td>
                <td>${num(post.freeSignups)}</td>
                <td>${num(post.paidSignups)}</td>
                <td><button type="button" class="ghost-button" data-smp-delete="${esc(post.id)}">Delete</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderInsights(insights) {
    if (!insights?.hasEnoughData) {
      return `<div class="empty-state">${esc(insights?.message || "Not enough data yet.")}</div>`;
    }
    return `
      <ul class="admin-smp-insights-list">
        ${(insights.items || []).map((item) => `
          <li><strong>${esc(item.label)}:</strong> ${esc(item.value)}</li>
        `).join("")}
      </ul>
    `;
  }

  function render() {
    const target = document.querySelector("#adminSocialMediaPerformanceApp");
    if (!target) return;
    if (typeof isAdminUnlocked === "function" && !isAdminUnlocked()) {
      target.innerHTML = `<p class="muted-copy">Unlock admin access to use the Social Media Performance tracker.</p>`;
      return;
    }

    const summary = state.data?.summary || {};
    const posts = Array.isArray(state.data?.posts) ? state.data.posts : [];
    const insights = state.data?.whatsWorking || { hasEnoughData: false, message: "Not enough data yet." };

    target.innerHTML = `
      <div class="admin-smp-header">
        <div>
          <p class="eyebrow">Social Media Performance</p>
          <h3>Track which content drives followers, traffic, signups, and paid customers</h3>
          <p class="muted-copy">Manual entry from TikTok, Instagram, Facebook, and YouTube Shorts analytics. Calculated rates update automatically.</p>
        </div>
        <div class="account-actions-row">
          <button type="button" class="primary-button" data-smp-add>+ Add Post / Video</button>
          <button type="button" class="ghost-button" data-smp-refresh ${state.loading ? "disabled" : ""}>${state.loading ? "Loading…" : "Refresh"}</button>
        </div>
      </div>

      ${state.error ? `<div class="admin-analytics-state is-error" role="alert"><p><strong>Could not load tracker.</strong></p><p class="muted-copy">${esc(state.error)}</p></div>` : ""}

      <div class="admin-smp-toolbar">
        <div class="admin-smp-toolbar-group">
          <span class="admin-smp-toolbar-label">Date range</span>
          ${toolbarButton(state.range === "7d", 'data-smp-range="7d"', "Last 7 days")}
          ${toolbarButton(state.range === "30d", 'data-smp-range="30d"', "Last 30 days")}
          ${toolbarButton(state.range === "90d", 'data-smp-range="90d"', "Last 90 days")}
          ${toolbarButton(state.range === "all", 'data-smp-range="all"', "All time")}
        </div>
        <div class="admin-smp-toolbar-group">
          <span class="admin-smp-toolbar-label">Platform</span>
          ${toolbarButton(state.platform === "all", 'data-smp-platform="all"', "All")}
          ${toolbarButton(state.platform === "tiktok", 'data-smp-platform="tiktok"', "TikTok")}
          ${toolbarButton(state.platform === "instagram", 'data-smp-platform="instagram"', "Instagram")}
          ${toolbarButton(state.platform === "facebook", 'data-smp-platform="facebook"', "Facebook")}
          ${toolbarButton(state.platform === "youtube", 'data-smp-platform="youtube"', "YouTube")}
        </div>
        <div class="admin-smp-toolbar-group">
          <span class="admin-smp-toolbar-label">Sort</span>
          ${toolbarButton(state.sort === "views", 'data-smp-sort="views"', "Most views")}
          ${toolbarButton(state.sort === "followers", 'data-smp-sort="followers"', "Most followers")}
          ${toolbarButton(state.sort === "followConversion", 'data-smp-sort="followConversion"', "Highest follow %")}
          ${toolbarButton(state.sort === "websiteClicks", 'data-smp-sort="websiteClicks"', "Most website clicks")}
          ${toolbarButton(state.sort === "freeSignups", 'data-smp-sort="freeSignups"', "Most free signups")}
          ${toolbarButton(state.sort === "paidSignups", 'data-smp-sort="paidSignups"', "Most paid signups")}
          ${toolbarButton(state.sort === "newest", 'data-smp-sort="newest"', "Newest")}
          ${toolbarButton(state.sort === "oldest", 'data-smp-sort="oldest"', "Oldest")}
        </div>
      </div>

      <div class="analytics-summary-grid admin-smp-summary-grid">
        ${summaryCard("Total views", num(summary.totalViews))}
        ${summaryCard("Total followers gained", num(summary.totalFollowersGained))}
        ${summaryCard("Total website clicks", num(summary.totalWebsiteClicks))}
        ${summaryCard("Total free signups", num(summary.totalFreeSignups))}
        ${summaryCard("Total paid signups", num(summary.totalPaidSignups))}
        ${summaryCard("Avg follow conversion", pct(summary.averageFollowConversionRate))}
        ${summaryCard("Avg engagement rate", pct(summary.averageEngagementRate))}
      </div>

      ${state.showForm ? renderForm() : ""}

      <div class="section-heading" style="margin-top:18px;">
        <div><p class="eyebrow">Content performance</p><h3>Saved posts &amp; videos</h3></div>
      </div>
      ${renderTable(posts)}

      <div class="section-heading" style="margin-top:18px;">
        <div><p class="eyebrow">What's Working</p><h3>Deterministic insights from your logged data</h3></div>
      </div>
      <article class="analytics-card admin-smp-insights-card">${renderInsights(insights)}</article>
    `;

    bindEvents(target);
  }

  function readForm(form) {
    const fd = new FormData(form);
    return {
      platform: String(fd.get("platform") || "tiktok"),
      datePosted: String(fd.get("datePosted") || ""),
      title: String(fd.get("title") || "").trim(),
      contentType: String(fd.get("contentType") || ""),
      hook: String(fd.get("hook") || ""),
      views: Number(fd.get("views") || 0),
      newFollowers: Number(fd.get("newFollowers") || 0),
      likes: Number(fd.get("likes") || 0),
      comments: Number(fd.get("comments") || 0),
      shares: Number(fd.get("shares") || 0),
      saves: Number(fd.get("saves") || 0),
      profileVisits: Number(fd.get("profileVisits") || 0),
      websiteClicks: Number(fd.get("websiteClicks") || 0),
      freeSignups: Number(fd.get("freeSignups") || 0),
      paidSignups: Number(fd.get("paidSignups") || 0),
      videoUrl: String(fd.get("videoUrl") || ""),
      notes: String(fd.get("notes") || ""),
      classroomStyleVideo: fd.get("classroomStyleVideo") === "on",
      showsProduct: fd.get("showsProduct") === "on",
      freeResourcePromotion: fd.get("freeResourcePromotion") === "on",
      ctaUsed: String(fd.get("ctaUsed") || ""),
      themeTopic: String(fd.get("themeTopic") || ""),
      backgroundLocation: String(fd.get("backgroundLocation") || ""),
    };
  }

  function bindEvents(target) {
    target.querySelector("[data-smp-refresh]")?.addEventListener("click", () => { void loadData(); });
    target.querySelector("[data-smp-add]")?.addEventListener("click", () => {
      state.showForm = true;
      state.editingId = "";
      draft = emptyDraft();
      render();
    });
    target.querySelector("[data-smp-cancel-form]")?.addEventListener("click", () => {
      state.showForm = false;
      state.editingId = "";
      draft = null;
      render();
    });
    target.querySelector("[data-smp-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = /** @type {HTMLFormElement} */ (event.currentTarget);
      const payload = readForm(form);
      if (!payload.title) {
        window.alert("Title / description is required.");
        return;
      }
      try {
        if (state.editingId) {
          await apiFetch("/api/admin/social-media-performance-update", { method: "POST", body: { ...payload, id: state.editingId } });
        } else {
          await apiFetch("/api/admin/social-media-performance", { method: "POST", body: payload });
        }
        state.showForm = false;
        state.editingId = "";
        draft = null;
        await loadData();
      } catch (error) {
        window.alert(error?.message || String(error));
      }
    });

    target.querySelectorAll("[data-smp-range]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.range = /** @type {DateRange} */ (btn.getAttribute("data-smp-range") || "30d");
        void loadData();
      });
    });
    target.querySelectorAll("[data-smp-platform]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.platform = /** @type {PlatformFilter} */ (btn.getAttribute("data-smp-platform") || "all");
        void loadData();
      });
    });
    target.querySelectorAll("[data-smp-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.sort = /** @type {SortKey} */ (btn.getAttribute("data-smp-sort") || "newest");
        void loadData();
      });
    });
    target.querySelectorAll("[data-smp-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-smp-edit") || "";
        const post = (state.data?.posts || []).find((row) => row.id === id);
        if (!post) return;
        state.editingId = id;
        state.showForm = true;
        draft = { ...post };
        render();
      });
    });
    target.querySelectorAll("[data-smp-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-smp-delete") || "";
        const post = (state.data?.posts || []).find((row) => row.id === id);
        const label = post?.title || post?.hook || id;
        if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
        try {
          await apiFetch("/api/admin/social-media-performance-delete", { method: "POST", body: { id } });
          await loadData();
        } catch (error) {
          window.alert(error?.message || String(error));
        }
      });
    });
  }

  function renderAdminSocialMediaPerformance() {
    const target = document.querySelector("#adminSocialMediaPerformanceApp");
    if (!target) return;
    if (typeof getAdminSectionTab === "function" && getAdminSectionTab() !== "social-media-performance") return;
    if (typeof isAdminUnlocked === "function" && !isAdminUnlocked()) {
      render();
      return;
    }
    if (!state.data && !state.loading) {
      void loadData();
      return;
    }
    render();
  }

  window.renderAdminSocialMediaPerformance = renderAdminSocialMediaPerformance;
})();
