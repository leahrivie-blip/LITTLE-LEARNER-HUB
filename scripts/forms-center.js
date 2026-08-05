/**
 * Forms Center (premium) — testing site only.
 * Sectioned Forms Center, conversational AI packets, filterable dashboard,
 * child status + timeline, deep platform connections, Family Hub parent UX.
 *
 * Depends on window.FormsEcosystem. Global: window.FormsCenter
 */
(function initFormsCenter(global) {
  "use strict";

  const CHAT_KEY = "llhFormsCenterChatV1";
  const DASH_FILTER_KEY = "llhFormsCenterDashFilterV1";
  const PARENT_DRAFT_KEY = "llhFormsCenterParentDraftV1";
  const TIMELINE_KEY_PREFIX = "llhFormsTimeline:";

  const CENTER_SECTIONS = Object.freeze([
    {
      id: "enrollment",
      label: "Enrollment",
      icon: "📋",
      description: "Start-of-care packets, child & family info, tuition, and handbook.",
      recommended: ["Enrollment Application", "Child Information", "Family Information", "Tuition Agreement", "Parent Handbook Acknowledgment"],
    },
    {
      id: "health",
      label: "Health & Medical",
      icon: "🩺",
      description: "Allergies, medications, immunizations, and care plans — synced to the child file.",
      recommended: ["Allergy Information", "Medication Authorization", "Immunization Record", "Medical Information", "Individual Health Plan"],
    },
    {
      id: "emergency",
      label: "Emergency",
      icon: "🚨",
      description: "Who to call and who may pick up — always one tap away for staff.",
      recommended: ["Emergency Contacts", "Authorized Pickup"],
    },
    {
      id: "permissions",
      label: "Permissions",
      icon: "✍️",
      description: "Photo, trips, sunscreen, water play, and everyday authorizations.",
      recommended: ["Photo & Video Permission", "Walking Field Trip Permission", "Sunscreen Permission", "Transportation Permission", "Water Play Permission"],
    },
    {
      id: "daily",
      label: "Daily Care",
      icon: "☀️",
      description: "Logs families expect every day — meals, naps, diapers, bottles.",
      recommended: ["Daily Report", "Infant Daily Report", "Meal Log", "Nap Log", "Diaper Log"],
    },
    {
      id: "behavior",
      label: "Behavior & Support",
      icon: "🌱",
      description: "Observations, goals, conferences, incidents, and support plans.",
      recommended: ["Observation", "Incident Report", "Parent Conference", "Behavior Support Plan", "Learning Goals"],
    },
    {
      id: "staff",
      label: "Staff",
      icon: "👥",
      description: "Hiring, certifications, training, and time-off — kept with your program.",
      recommended: ["Staff Information", "CPR Record", "Background Check", "Training Record", "Employment Application"],
    },
    {
      id: "licensing",
      label: "Licensing",
      icon: "✅",
      description: "Drills, inspections, temps, and visitor logs for inspection day.",
      recommended: ["Fire Drill", "Playground Inspection", "Cleaning Checklist", "Refrigerator Temperature", "Visitor Log"],
    },
    {
      id: "business",
      label: "Business",
      icon: "💼",
      description: "Tuition, withdrawals, surveys, schedule changes, and RSVPs.",
      recommended: ["Tuition Agreement", "Withdrawal Form", "Vacation Notice", "Parent Survey", "Schedule Change"],
    },
    {
      id: "custom",
      label: "Custom Forms",
      icon: "✨",
      description: "AI-built and program templates unique to your childcare.",
      recommended: [],
    },
  ]);

  const ENROLLMENT_PACKET_DEFAULTS = Object.freeze([
    "Enrollment Application",
    "Emergency Contacts",
    "Medical Information",
    "Allergy Information",
    "Medication Authorization",
    "Authorized Pickup",
    "Photo & Video Permission",
    "Parent Handbook Acknowledgment",
    "Tuition Agreement",
    "Transportation Permission",
  ]);

  const REFINE_CHIPS = Object.freeze([
    { id: "shorter", label: "Make this shorter" },
    { id: "oklahoma", label: "Make it Oklahoma compliant" },
    { id: "spanish", label: "Add Spanish" },
    { id: "signatures", label: "Require signatures" },
    { id: "initials", label: "Add initials" },
    { id: "friendlier", label: "Make this friendlier" },
    { id: "pickup", label: "Add emergency pickup" },
    { id: "remove_medical", label: "Remove medical section" },
    { id: "printable", label: "Make this printable" },
  ]);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function eco() {
    return global.FormsEcosystem || null;
  }

  function hdhOn() {
    try {
      return typeof isHomeDaycareHubTestingEnabled === "function" && isHomeDaycareHubTestingEnabled();
    } catch (_e) {
      return false;
    }
  }

  function catalog() {
    const e = eco();
    return Array.isArray(e?.CATALOG) ? e.CATALOG : [];
  }

  function resolveSection(item) {
    if (!item) return "custom";
    const title = String(item.title || "").toLowerCase();
    const cat = String(item.category || "").toLowerCase();
    if (/emergency contact/.test(title)) return "emergency";
    if (/authorized pickup|pick-up password|pickup/.test(title) && !/permission|field trip|transport/.test(title)) return "emergency";
    if (/photo|sunscreen|insect|water play|field trip|transport|nap permission|walking/.test(title)) return "permissions";
    if (/tuition|withdrawal|vacation|survey|schedule change|rsvp|invoice|rate sheet|payment|tax|contract/.test(title)) return "business";
    if (cat === "staff" || /staff|employment|cpr|background|training|time off|evaluation|volunteer|confidentiality|substitute/.test(title)) return "staff";
    if (cat === "licensing" || /drill|inspection|cleaning|temperature|visitor|vehicle|medication audit|safe sleep checklist|playground/.test(title)) return "licensing";
    if (cat === "daily" || /daily report|bottle|diaper|potty|nap log|meal log|infant daily/.test(title)) return "daily";
    if (cat === "behavior" || /observation|assessment|learning goals|conference|incident|injury|illness|behavior support/.test(title)) return "behavior";
    if (cat === "medical" || /allerg|medic|immun|asthma|seizure|diabetes|health|physician|food restriction|fever|ointment/.test(title)) return "health";
    if (cat === "enrollment" || /enrollment|child information|family information|handbook|custody|child schedule|potty training information/.test(title)) return "enrollment";
    if (cat === "parent") return "business";
    return "custom";
  }

  function formsForSection(sectionId) {
    return catalog().filter((item) => resolveSection(item) === sectionId);
  }

  function customForms() {
    const templates = (typeof formsProgramTemplates === "function" ? formsProgramTemplates() : []) || [];
    const draft = eco()?.getAiDraft?.();
    const list = templates.map((t) => ({
      id: t.id,
      title: t.title,
      description: "Saved program template",
      existingResourceId: t.resourceId || "",
      fields: t.fieldsSchema?.fields || [],
      isCustom: true,
    }));
    if (draft?.schema && !list.some((t) => t.title === draft.schema.title)) {
      list.unshift({
        id: draft.schema.id,
        title: draft.schema.title,
        description: "Current AI draft",
        fields: draft.schema.fields || [],
        isCustom: true,
        isDraft: true,
      });
    }
    return list;
  }

  function sectionStats() {
    return CENTER_SECTIONS.map((section) => {
      const forms = section.id === "custom" ? customForms() : formsForSection(section.id);
      const recommended = (section.recommended || [])
        .map((title) => catalog().find((f) => f.title === title) || { title, missing: true })
        .filter((f) => !f.missing);
      return { ...section, count: forms.length, forms, recommended };
    });
  }

  function getChat() {
    try {
      const raw = global.localStorage?.getItem(CHAT_KEY);
      if (!raw) return { messages: [], packet: null, activeSchemaId: "" };
      const parsed = JSON.parse(raw);
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-40) : [],
        packet: parsed.packet || null,
        activeSchemaId: parsed.activeSchemaId || "",
      };
    } catch (_e) {
      return { messages: [], packet: null, activeSchemaId: "" };
    }
  }

  function saveChat(next) {
    try {
      global.localStorage?.setItem(CHAT_KEY, JSON.stringify(next));
    } catch (_e) { /* ignore */ }
  }

  function pushChat(role, text, meta = {}) {
    const chat = getChat();
    chat.messages.push({
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      text,
      at: new Date().toISOString(),
      ...meta,
    });
    saveChat(chat);
    return chat;
  }

  function getDashFilter() {
    try {
      return global.localStorage?.getItem(DASH_FILTER_KEY) || "all";
    } catch (_e) {
      return "all";
    }
  }

  function setDashFilter(value) {
    try {
      global.localStorage?.setItem(DASH_FILTER_KEY, value);
    } catch (_e) { /* ignore */ }
  }

  function timelineKey(email) {
    return `${TIMELINE_KEY_PREFIX}${email || "local"}`;
  }

  function currentEmail() {
    try {
      return String(global.localStorage?.getItem("llhUser") || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function readTimeline(childId) {
    try {
      const all = JSON.parse(global.localStorage?.getItem(timelineKey(currentEmail())) || "{}");
      const list = Array.isArray(all[childId]) ? all[childId] : [];
      return list.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    } catch (_e) {
      return [];
    }
  }

  function writeTimelineEvent(childId, event) {
    if (!childId) return;
    try {
      const key = timelineKey(currentEmail());
      const all = JSON.parse(global.localStorage?.getItem(key) || "{}");
      const list = Array.isArray(all[childId]) ? all[childId] : [];
      list.unshift({
        id: `tl-${Date.now()}`,
        at: new Date().toISOString(),
        ...event,
      });
      all[childId] = list.slice(0, 120);
      global.localStorage?.setItem(key, JSON.stringify(all));
    } catch (_e) { /* ignore */ }
    try {
      if (typeof appendAutomationTimeline === "function") {
        appendAutomationTimeline(childId, event.title, event.detail || "", {
          source: event.source || "forms_center",
          date: String(event.at || new Date().toISOString()).slice(0, 10),
        });
      }
    } catch (_e) { /* ignore */ }
  }

  function classifyDoc(doc) {
    const status = String(doc.status || "").toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const signedToday = doc.signedAt && String(doc.signedAt).slice(0, 10) === today;
    if (doc.rejected || status === "rejected") return "rejected";
    if ((status === "signed" || doc.signedAt) && !doc.providerReviewed) return "needs_review";
    if (signedToday || (doc.providerReviewed && String(doc.reviewedAt || "").slice(0, 10) === today)) return "completed_today";
    if (doc.signedAt || ["on_file", "reviewed", "signed"].includes(status)) return "recently_signed";
    const exp = doc.expiresAt || doc.answers?.immExpires || doc.answers?.cprExpires;
    if (exp) {
      const days = (new Date(exp) - new Date(today)) / 86400000;
      if (days >= 0 && days <= 30) return "expiring_soon";
    }
    if (doc.shareWithFamily && !doc.signedAt) return "waiting_on_parents";
    if (["draft", "needed", "assigned"].includes(status) && !doc.shareWithFamily) return "waiting_to_send";
    return "other";
  }

  function dashboardBuckets() {
    const docs = (typeof childStore === "function" ? (childStore("Documents") || []) : []).filter((d) => !d.archived);
    const children = (typeof childStore === "function" ? (childStore("Profiles") || []) : []).filter((c) => c && !c.archived);
    const active = new Set(children.map((c) => String(c.id)));
    const live = docs.filter((d) => active.has(String(d.childId || "")));
    const nameFor = (id) => children.find((c) => String(c.id) === String(id))?.name || "Child";

    const buckets = {
      waiting_to_send: [],
      waiting_on_parents: [],
      completed_today: [],
      expiring_soon: [],
      missing: [],
      recently_signed: [],
      rejected: [],
      needs_review: [],
    };

    live.forEach((doc) => {
      const key = classifyDoc(doc);
      if (buckets[key]) buckets[key].push({ ...doc, childName: nameFor(doc.childId), bucket: key });
    });

    // Missing required enrollment/health forms per child
    const requiredTitles = [
      "Enrollment Application",
      "Emergency Contacts",
      "Allergy Information",
      "Authorized Pickup",
      "Immunization Record",
      "Photo & Video Permission",
      "Parent Handbook Acknowledgment",
      "Medical Information",
    ];
    children.forEach((child) => {
      requiredTitles.forEach((title) => {
        const has = live.some((d) => String(d.childId) === String(child.id)
          && String(d.title || "").toLowerCase() === title.toLowerCase()
          && (d.signedAt || d.providerReviewed || ["on_file", "signed", "reviewed"].includes(String(d.status || "").toLowerCase())));
        if (!has) {
          buckets.missing.push({
            id: `missing-${child.id}-${title}`,
            childId: child.id,
            childName: child.name,
            title,
            statusLabel: "Missing",
            bucket: "missing",
            isMissing: true,
          });
        }
      });
    });

    return buckets;
  }

  function dashboardHtml() {
    if (!hdhOn()) return "";
    const buckets = dashboardBuckets();
    const filter = getDashFilter();
    const counts = {
      all: Object.values(buckets).reduce((n, list) => n + list.length, 0),
      waiting_to_send: buckets.waiting_to_send.length,
      waiting_on_parents: buckets.waiting_on_parents.length,
      completed_today: buckets.completed_today.length,
      expiring_soon: buckets.expiring_soon.length,
      missing: buckets.missing.length,
      recently_signed: buckets.recently_signed.length,
      rejected: buckets.rejected.length,
      needs_review: buckets.needs_review.length,
    };
    const filterDefs = [
      ["all", "All"],
      ["waiting_to_send", "Waiting to Send"],
      ["waiting_on_parents", "Waiting on Parents"],
      ["completed_today", "Completed Today"],
      ["expiring_soon", "Expiring Soon"],
      ["missing", "Missing Forms"],
      ["recently_signed", "Recently Signed"],
      ["rejected", "Rejected"],
      ["needs_review", "Needs Review"],
    ];
    const rows = filter === "all"
      ? filterDefs.slice(1).flatMap(([key]) => buckets[key] || [])
      : (buckets[filter] || []);

    return `
      <section class="section-block fc-dashboard" id="fcDashboard" data-fc-dashboard data-fe-dashboard>
        <p class="eyebrow">Forms Center</p>
        <h3>Forms Dashboard</h3>
        <p class="muted-copy">See every piece of paperwork at a glance — filter by status, then jump to the action.</p>
        <div class="fc-dash-metrics" role="list">
          ${filterDefs.slice(1).map(([key, label]) => `
            <button type="button" class="fc-metric ${filter === key ? "is-active" : ""} ${key === "expiring_soon" || key === "rejected" ? "is-alert" : ""} ${key === "needs_review" || key === "waiting_on_parents" ? "is-warn" : ""} ${key === "completed_today" ? "is-ok" : ""}" data-fc-dash-filter="${esc(key)}" role="listitem">
              <strong>${counts[key] || 0}</strong>
              <span>${esc(label)}</span>
            </button>`).join("")}
        </div>
        <div class="fc-dash-filters" role="tablist" aria-label="Filter forms dashboard">
          ${filterDefs.map(([key, label]) => `
            <button type="button" class="fc-chip-filter ${filter === key ? "is-active" : ""}" data-fc-dash-filter="${esc(key)}">${esc(label)} <em>${counts[key] || 0}</em></button>
          `).join("")}
        </div>
        <div class="fc-dash-list" data-fc-dash-list>
          ${rows.length ? rows.slice(0, 24).map((item) => `
            <article class="fc-dash-row">
              <div>
                <strong>${esc(item.title)}</strong>
                <p class="muted-copy">${esc(item.childName || "—")} · ${esc(item.statusLabel || item.bucket?.replace(/_/g, " ") || "")}${item.dueDate ? ` · Due ${esc(item.dueDate)}` : ""}</p>
              </div>
              <div class="account-actions-row">
                ${item.isMissing
                  ? `<button class="primary-button" type="button" data-fc-assign-missing="${esc(item.title)}" data-child-id="${esc(item.childId)}">Assign</button>`
                  : item.bucket === "needs_review"
                    ? `<button class="primary-button" type="button" data-review-child-document="${esc(item.id)}">Review</button>`
                    : item.bucket === "waiting_to_send"
                      ? `<button class="primary-button" type="button" data-share-child-document="${esc(item.id)}">Send</button>`
                      : `<button class="ghost-button" type="button" data-view-child-profile="${esc(item.childId)}" data-open-child-tab="forms-records">Open</button>`}
              </div>
            </article>`).join("")
            : `<div class="profile-empty-state"><strong>You’re clear on this filter</strong><p>Nothing needs attention in “${esc(filterDefs.find((f) => f[0] === filter)?.[1] || filter)}” right now.</p></div>`}
        </div>
        <div class="account-actions-row" style="margin-top:12px;">
          <button class="primary-button" type="button" data-fc-jump="fcAiChat">Open AI Form Builder</button>
          <button class="ghost-button" type="button" data-fc-jump="fcSections">Browse Forms Center</button>
          <button class="ghost-button" type="button" data-hdh-forms-refresh>Refresh</button>
        </div>
      </section>`;
  }

  function sectionsHtml() {
    if (!hdhOn()) return "";
    const stats = sectionStats();
    return `
      <section class="section-block fc-sections" id="fcSections" data-fc-sections data-fe-library>
        <p class="eyebrow">Forms Center</p>
        <h3>Everything organized for childcare</h3>
        <p class="muted-copy">Ten clear sections — not one endless list. Each shows recommended forms providers actually use.</p>
        <div class="fc-section-grid">
          ${stats.map((section) => `
            <article class="fc-section-card" data-fc-section="${esc(section.id)}">
              <header class="fc-section-head">
                <span class="fc-section-icon" aria-hidden="true">${section.icon}</span>
                <div>
                  <h4>${esc(section.label)}</h4>
                  <p>${esc(section.description)}</p>
                </div>
                <span class="fc-section-count">${section.count}</span>
              </header>
              ${section.recommended.length ? `
                <div class="fc-recommended">
                  <p class="fc-rec-label">Recommended</p>
                  <ul>
                    ${section.recommended.slice(0, 5).map((f) => `
                      <li>
                        <button type="button" class="fc-linkish" data-fc-use-form="${esc(f.id || f.title)}">${esc(f.title)}</button>
                      </li>`).join("")}
                  </ul>
                </div>` : `<p class="muted-copy">Save AI drafts here as your custom library.</p>`}
              <div class="account-actions-row">
                <button class="primary-button" type="button" data-fc-open-section="${esc(section.id)}">Open section</button>
              </div>
            </article>`).join("")}
        </div>
        <div id="fcSectionDetail" class="fc-section-detail" hidden></div>
      </section>`;
  }

  function renderSectionDetail(sectionId) {
    const section = CENTER_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return "";
    const forms = sectionId === "custom" ? customForms() : formsForSection(sectionId);
    return `
      <article class="fc-detail-panel" data-fc-detail="${esc(sectionId)}">
        <header>
          <h4><span aria-hidden="true">${section.icon}</span> ${esc(section.label)}</h4>
          <p class="muted-copy">${esc(section.description)} · ${forms.length} form${forms.length === 1 ? "" : "s"}</p>
          <button type="button" class="ghost-button" data-fc-close-section>Close</button>
        </header>
        <div class="fc-detail-grid">
          ${forms.length ? forms.map((item) => `
            <article class="fc-form-tile">
              <strong>${esc(item.title)}</strong>
              <p>${esc(item.description || "Program form")}</p>
              <p class="fe-field-meta">${(item.fields || []).length} smart fields</p>
              <div class="account-actions-row">
                <button class="primary-button" type="button" data-fc-use-form="${esc(item.id || item.title)}">Use</button>
                ${item.isDraft ? "" : `<button class="ghost-button" type="button" data-fc-preview-form="${esc(item.id || item.title)}">Preview</button>`}
              </div>
            </article>`).join("")
            : `<p class="muted-copy">No forms in this section yet — ask AI to build one.</p>`}
        </div>
      </article>`;
  }

  function isPacketPrompt(text) {
    return /enrollment packet|start.?of.?care packet|new family packet|onboarding packet|full packet/i.test(text || "");
  }

  function conversationalAiHtml() {
    if (!hdhOn()) return "";
    const chat = getChat();
    const e = eco();
    const draft = e?.getAiDraft?.() || {};
    const children = (typeof childStore === "function" ? (childStore("Profiles") || []) : []).filter((c) => !c.archived);
    const packet = chat.packet;

    return `
      <section class="section-block fc-ai" id="fcAiChat" data-fc-ai data-fe-ai-builder>
        <p class="eyebrow">AI Form Builder</p>
        <h3>Talk through the paperwork</h3>
        <p class="muted-copy">Describe what you need. AI proposes a packet or a single form — then you refine without starting over.</p>
        <div class="fc-ai-examples">
          <button type="button" class="fe-chip" data-fc-prompt="I need an enrollment packet.">I need an enrollment packet</button>
          <button type="button" class="fe-chip" data-fc-prompt="Make a medication authorization form.">Medication authorization</button>
          <button type="button" class="fe-chip" data-fc-prompt="Build a field trip permission slip.">Field trip slip</button>
        </div>
        <div class="fc-chat" data-fc-chat>
          ${chat.messages.length ? chat.messages.map((m) => `
            <div class="fc-chat-bubble is-${esc(m.role)}">
              <p>${esc(m.text)}</p>
            </div>`).join("") : `
            <div class="fc-chat-bubble is-assistant">
              <p>Hi — I’m your forms assistant. Try “I need an enrollment packet” and I’ll propose the full set for your home daycare.</p>
            </div>`}
        </div>
        ${packet ? `
          <form class="fc-packet-form" id="fcPacketForm" data-fc-packet>
            <p class="fc-packet-lead">I can include these forms:</p>
            <div class="fc-packet-checks">
              ${(packet.items || []).map((item) => `
                <label class="fe-check">
                  <input type="checkbox" name="packetItem" value="${esc(item.title)}" ${item.selected !== false ? "checked" : ""} />
                  <span>${esc(item.title)}</span>
                </label>`).join("")}
            </div>
            <button class="primary-button" type="submit">Generate selected forms together</button>
          </form>` : ""}
        <form id="fcChatForm" class="panel-form fc-chat-form">
          <label>Message
            <textarea name="message" rows="2" maxlength="600" required placeholder="I need an enrollment packet."></textarea>
          </label>
          <button class="primary-button" type="submit">Send</button>
        </form>
        ${draft.schema || (packet?.generated?.length) ? `
          <div class="fc-ai-workspace">
            <p class="fe-refine-label">Refine without rebuilding</p>
            <div class="fc-ai-examples">
              ${REFINE_CHIPS.map((c) => `<button type="button" class="fe-chip" data-fc-refine="${esc(c.id)}">${esc(c.label)}</button>`).join("")}
            </div>
            ${draft.schema ? `
              <div class="fe-ai-result" style="margin-top:12px;">
                <div class="fe-ai-result-head">
                  <div>
                    <strong>${esc(draft.schema.title)}</strong>
                    <p class="muted-copy">${esc(draft.schema.description || "")}${draft.schema.complianceNote ? ` · ${esc(draft.schema.complianceNote)}` : ""}${draft.schema.language === "es" ? " · Spanish" : ""}</p>
                  </div>
                  <div class="account-actions-row">
                    <button class="primary-button" type="button" data-fe-save-template>Save template</button>
                  </div>
                </div>
                ${e.renderBeautifulForm(draft.schema, {}, { mode: "preview" })}
                ${children.length ? `
                  <form id="feAssignDraftForm" class="panel-form" style="margin-top:12px;">
                    <label>Assign to
                      <select name="childId" required>
                        ${children.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}
                      </select>
                    </label>
                    <label class="settings-check-label"><input type="checkbox" name="shareWithFamily" checked /> Share with Family Hub</label>
                    <button class="primary-button" type="submit">Assign &amp; notify</button>
                  </form>` : ""}
              </div>` : ""}
            ${packet?.generated?.length ? `
              <div class="fc-packet-generated">
                <h4>Packet ready (${packet.generated.length} forms)</h4>
                <ul class="fe-activity-list">
                  ${packet.generated.map((g) => `<li><strong>${esc(g.title)}</strong> <span class="muted-copy">${(g.fields || []).length} fields</span></li>`).join("")}
                </ul>
                ${children.length ? `
                  <form id="fcAssignPacketForm" class="panel-form">
                    <label>Assign whole packet to
                      <select name="childId" required>
                        ${children.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}
                      </select>
                    </label>
                    <label class="settings-check-label"><input type="checkbox" name="shareWithFamily" checked /> Share each form with Family Hub</label>
                    <button class="primary-button" type="submit">Assign packet</button>
                  </form>` : ""}
              </div>` : ""}
          </div>` : ""}
      </section>`;
  }

  function hubHtml() {
    if (!hdhOn()) return "";
    return `${dashboardHtml()}${sectionsHtml()}${conversationalAiHtml()}`;
  }

  function proposePacket(prompt) {
    const items = ENROLLMENT_PACKET_DEFAULTS.map((title) => {
      const found = catalog().find((f) => f.title === title);
      return { title, catalogId: found?.id || "", selected: true };
    });
    const chat = pushChat("user", prompt);
    pushChat("assistant", "I can include these forms for your enrollment packet. Uncheck anything you don’t need, then generate everything together.");
    const next = getChat();
    next.packet = { prompt, items, generated: [] };
    saveChat(next);
    return next;
  }

  function handleChatMessage(message) {
    const text = String(message || "").trim();
    if (!text) return getChat();
    const e = eco();
    if (!e) return pushChat("assistant", "Forms engine is still loading — try again in a moment.");

    if (isPacketPrompt(text)) {
      return proposePacket(text);
    }

    // Refine-style free text while a draft exists
    if (e.getAiDraft()?.schema && /make|add|remove|require|spanish|oklahoma|shorter|friendlier|printable|initial/i.test(text)) {
      pushChat("user", text);
      try {
        applyPremiumRefine(text);
        pushChat("assistant", "Updated — your form kept its structure. Review the preview below.");
      } catch (err) {
        pushChat("assistant", err.message || "I couldn’t apply that change.");
      }
      return getChat();
    }

    pushChat("user", text);
    const draft = e.generateFromPrompt(text);
    pushChat("assistant", `Here’s “${draft.schema.title}”. You can refine it (“Make this shorter”, “Add Spanish”, “Make it Oklahoma compliant”) without starting over.`);
    const chat = getChat();
    chat.packet = null;
    saveChat(chat);
    return chat;
  }

  function generatePacket(selectedTitles) {
    const e = eco();
    if (!e) throw new Error("Forms engine unavailable.");
    const titles = (selectedTitles || []).filter(Boolean);
    if (!titles.length) throw new Error("Select at least one form.");
    const generated = titles.map((title) => {
      const item = catalog().find((f) => f.title === title) || e.findCatalogItem(title);
      if (!item) {
        const draft = e.generateFromPrompt(title);
        return draft.schema;
      }
      return e.cloneSchema(item);
    });
    // Keep last schema as active draft for refine
    const last = generated[generated.length - 1];
    e.saveAiDraft({
      prompt: `Enrollment packet (${generated.length} forms)`,
      schema: last,
      body: e.schemaToBody(last),
      history: [{ at: new Date().toISOString(), action: "packet", prompt: titles.join(", ") }],
      packetSchemas: generated,
    });
    pushChat("assistant", `Generated ${generated.length} forms together. Refine any one below, or assign the whole packet to a child.`);
    const chat = getChat();
    chat.packet = {
      ...(chat.packet || {}),
      items: titles.map((title) => ({ title, selected: true })),
      generated,
    };
    saveChat(chat);
    e.pushActivity?.({ type: "packet", title: "Enrollment packet", detail: `${generated.length} forms generated` });
    return chat;
  }

  function applyPremiumRefine(instruction) {
    const e = eco();
    if (!e?.getAiDraft()?.schema) throw new Error("Generate a form first.");
    const text = String(instruction || "").toLowerCase();
    let action = "custom";
    if (/shorter|simplify/.test(text)) action = "shorter";
    else if (/spanish|español|espanol/.test(text)) action = "spanish";
    else if (/signature|require signature/.test(text)) action = "signatures";
    else if (/initial/.test(text)) action = "initials";
    else if (/friendlier|warmer|plain/.test(text)) action = "friendlier";
    else if (/pickup|emergency pickup/.test(text)) action = "pickup";
    else if (/allerg/.test(text)) action = "allergies";
    else if (/oklahoma|compliant|licensing/.test(text)) action = "oklahoma";
    else if (/remove medical|no medical/.test(text)) action = "remove_medical";
    else if (/printable|print/.test(text)) action = "printable";
    else if (/required|require fields/.test(text)) action = "required";
    else if (/emergency/.test(text)) action = "emergency";

    if (action === "oklahoma" || action === "remove_medical" || action === "printable" || action === "initials") {
      const draft = e.getAiDraft();
      const schema = e.cloneSchema(
        { ...draft.schema, fields: draft.schema.fields, connections: draft.schema.connections },
        { title: draft.schema.title, description: draft.schema.description, language: draft.schema.language },
      );
      schema.id = draft.schema.id;
      schema.catalogId = draft.schema.catalogId;
      if (action === "oklahoma") {
        schema.complianceNote = "Oklahoma review checklist added — confirm DHS/OKDHS requirements before use.";
        schema.description = `${schema.description || ""} Include DHS licensing acknowledgments and keep immunization / emergency contacts current.`.trim();
        if (!schema.fields.some((f) => f.key === "okLicensingAck")) {
          schema.fields.splice(Math.max(0, schema.fields.length - 2), 0, {
            type: "checkbox",
            key: "okLicensingAck",
            label: "I understand this form must meet Oklahoma DHS childcare requirements",
            required: true,
            section: "Licensing",
            options: ["I understand"],
          });
        }
      }
      if (action === "remove_medical") {
        schema.fields = schema.fields.filter((f) => !/medical|allerg|medication|physician|immun/i.test(`${f.section} ${f.key} ${f.label}`));
        schema.description = "Medical section removed at your request.";
      }
      if (action === "printable") {
        schema.printable = true;
        schema.description = `${schema.description || ""} Print-ready layout with signature lines.`.trim();
      }
      if (action === "initials") {
        if (!schema.fields.some((f) => f.type === "initials")) {
          schema.fields.splice(schema.fields.length - 1, 0, {
            type: "initials",
            key: "parentInitials",
            label: "Parent initials",
            required: true,
            section: "Signatures",
          });
        }
      }
      const body = e.schemaToBody(schema);
      e.saveAiDraft({
        ...draft,
        schema,
        body,
        history: [...(draft.history || []), { at: new Date().toISOString(), action, prompt: instruction }],
      });
      e.pushActivity?.({ type: "ai_refine", title: schema.title, detail: action });
      return e.getAiDraft();
    }

    // Map initials chip to signatures+initials via custom path above; others use ecosystem refine
    if (action === "custom") return e.refineSchema("custom", instruction);
    return e.refineSchema(action, instruction);
  }

  async function assignPacket(childId, shareWithFamily) {
    const e = eco();
    const chat = getChat();
    const schemas = chat.packet?.generated || e.getAiDraft()?.packetSchemas || [];
    if (!schemas.length) throw new Error("Generate a packet first.");
    if (!childId) throw new Error("Choose a child.");
    const saved = [];
    for (const schema of schemas) {
      const formSpec = {
        title: schema.title,
        category: schema.category || "Enrollment",
        draftText: e.schemaToBody(schema),
        body: e.schemaToBody(schema),
        shareWithFamily,
        catalogId: schema.catalogId || schema.id,
        fieldsSchema: schema,
        connections: schema.connections || [],
        resourceId: schema.existingResourceId || "",
      };
      if (typeof assignAndNotifyForm === "function") {
        const docs = await assignAndNotifyForm(formSpec, [childId]);
        saved.push(docs[0]);
      } else if (typeof assignFormDocumentToChild === "function") {
        saved.push(assignFormDocumentToChild(childId, formSpec));
      }
    }
    writeTimelineEvent(childId, {
      title: "Enrollment packet assigned",
      detail: `${saved.length} forms sent${shareWithFamily ? " to Family Hub" : ""}`,
      source: "forms_packet",
      kind: "packet_assigned",
    });
    e.pushActivity?.({ type: "assign", title: "Enrollment packet", detail: `${saved.length} forms` });
    return saved;
  }

  function deepenPlatformConnections(doc, answers, baseResult) {
    if (!doc?.childId) return baseResult;
    const changes = [...(baseResult?.changes || [])];
    const title = String(doc.title || "");
    const allergies = answers.allergies || answers.foodRestrictions || "";

    // Allergy fan-out
    if (allergies || /allerg/i.test(title)) {
      try {
        if (typeof childStore === "function" && typeof saveChildStore === "function") {
          const profiles = childStore("Profiles") || [];
          const next = profiles.map((c) => {
            if (String(c.id) !== String(doc.childId)) return c;
            return {
              ...c,
              allergies: String(allergies || c.allergies || "").trim() || c.allergies,
              allergyAlert: Boolean(String(allergies || c.allergies || "").trim()),
              allergyUpdatedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          });
          saveChildStore("Profiles", next);
          changes.push("classroom allergy alert");
        }
      } catch (_e) { /* ignore */ }

      try {
        if (typeof appendOpsAlert === "function") {
          appendOpsAlert({
            type: "allergy_update",
            title: `Allergy updated: ${title}`,
            detail: String(allergies || "See child profile").slice(0, 160),
            childId: doc.childId,
            hrefView: "today",
            priority: "high",
          });
          // Clear matching missing-paperwork noise
          if (typeof listOpsAlerts === "function" && typeof saveOpsAlerts === "function") {
            saveOpsAlerts(listOpsAlerts().map((item) => (
              /missing|paperwork|allerg/i.test(`${item.title} ${item.detail}`) && String(item.childId) === String(doc.childId)
                ? { ...item, read: true }
                : item
            )));
          }
          changes.push("dashboard missing alert cleared");
        }
      } catch (_e) { /* ignore */ }

      writeTimelineEvent(doc.childId, {
        title: "Allergy Updated",
        detail: String(allergies || title).slice(0, 180),
        kind: "allergy_updated",
        source: "form_signed",
        documentId: doc.id,
      });
    }

    // Timeline kinds from form titles
    const timelineMap = [
      [/enrollment/i, "Enrollment Complete"],
      [/medication authorization/i, "Medication Added"],
      [/immunization/i, "Immunization Uploaded"],
      [/incident/i, "Incident Report"],
      [/injury/i, "Injury Report"],
      [/permission|photo|field trip|transport|sunscreen|water/i, "Permission Slip Signed"],
      [/handbook/i, "Handbook Acknowledged"],
      [/birthday/i, "Birthday Form Updated"],
    ];
    if (!/allerg/i.test(title)) {
      const match = timelineMap.find(([re]) => re.test(title));
      if (match) {
        writeTimelineEvent(doc.childId, {
          title: match[1],
          detail: `${title}${doc.signedBy ? ` · ${doc.signedBy}` : ""}`,
          kind: "form_complete",
          source: "form_signed",
          documentId: doc.id,
        });
      } else if (doc.signedAt) {
        writeTimelineEvent(doc.childId, {
          title: "Form Completed",
          detail: title,
          kind: "form_complete",
          source: "form_signed",
          documentId: doc.id,
        });
      }
    }

    // Medication reminders
    if (answers.medName || /medication authorization/i.test(title)) {
      try {
        if (typeof appendOpsAlert === "function") {
          appendOpsAlert({
            type: "medication_reminder",
            title: `Medication on file`,
            detail: answers.medName || title,
            childId: doc.childId,
            hrefView: "child-tools-daily-logs",
            priority: "high",
          });
          changes.push("medication reminder");
        }
      } catch (_e) { /* ignore */ }
      writeTimelineEvent(doc.childId, {
        title: "Medication Added",
        detail: answers.medName || title,
        kind: "medication_added",
        source: "form_signed",
        documentId: doc.id,
      });
    }

    eco()?.pushActivity?.({ type: "connection", title, detail: changes.join(", ") || "synced" });
    return { updated: true, changes };
  }

  function onFormSigned(doc) {
    const e = eco();
    const answers = doc?.answers && typeof doc.answers === "object" ? doc.answers : {};
    let result = { updated: false, changes: [] };
    if (e?.applyConnections) {
      result = e.applyConnections(doc, answers) || result;
    }
    return deepenPlatformConnections(doc, answers, result);
  }

  function childStatusHtml(child) {
    if (!child?.id || !hdhOn()) return "";
    const docs = (typeof childStore === "function" ? (childStore("Documents") || []) : [])
      .filter((d) => String(d.childId) === String(child.id) && !d.archived);
    const signed = (titleRe) => docs.some((d) => titleRe.test(String(d.title || "")) && (d.signedAt || d.providerReviewed));
    const pill = (ok, label) => `<span class="fc-status-pill ${ok ? "is-ok" : "is-miss"}">${ok ? "Ready" : "Needed"} · ${esc(label)}</span>`;
    const enrollmentOk = /enrolled/i.test(child.enrollmentStatus || "") || signed(/enrollment/i);
    const medicalOk = Boolean(child.allergies || child.medicalNotes || child.physician) || signed(/allerg|medical|immun/i);
    const emergencyOk = Boolean(child.emergencyContact || child.emergency) || signed(/emergency/i);
    const pickupOk = Boolean(child.pickupContacts) || signed(/pickup|pick-up/i);
    const permissionsOk = Boolean(child.photoPermission) || signed(/photo|permission|sunscreen|field trip/i);
    const medsOk = docs.some((d) => /medication/i.test(d.title || "") && (d.signedAt || d.providerReviewed));
    const immOk = Boolean(child.immunizationStatus) || signed(/immunization/i);
    const incidents = docs.filter((d) => /incident|injury|illness/i.test(d.title || ""));
    const timeline = readTimeline(child.id).slice(0, 8);

    return `
      <section class="section-block fc-child-status" data-fc-child-status="${esc(child.id)}">
        <p class="eyebrow">Child paperwork</p>
        <h3>${esc(child.name)} — live status</h3>
        <p class="muted-copy">Same data as Forms Center — enrollment, medical, emergency, permissions, medications, and immunizations.</p>
        <div class="fc-status-grid">
          <article class="fc-status-card"><h4>Enrollment Status</h4>${pill(enrollmentOk, child.enrollmentStatus || "Not enrolled")}<p class="muted-copy">${child.enrollmentDate ? `Start ${esc(child.enrollmentDate)}` : "No start date yet"}</p></article>
          <article class="fc-status-card"><h4>Medical Status</h4>${pill(medicalOk, child.allergies ? "Allergies on file" : "Medical file")}<p class="muted-copy">${esc(child.allergies || child.medicalNotes || "No medical notes yet")}</p></article>
          <article class="fc-status-card"><h4>Emergency Contacts</h4>${pill(emergencyOk, "Emergency")}<p class="muted-copy">${esc(child.emergencyContact || child.emergency || "Add via Emergency Contacts form")}</p></article>
          <article class="fc-status-card"><h4>Permissions</h4>${pill(permissionsOk, child.photoPermission || "Permissions")}<p class="muted-copy">${pickupOk ? `Pickup: ${esc(child.pickupContacts || "on file")}` : "Pickup authorization needed"}</p></article>
          <article class="fc-status-card"><h4>Documents</h4><p><strong>${docs.length}</strong> on file</p><p class="muted-copy">${docs.filter((d) => d.signedAt).length} signed</p></article>
          <article class="fc-status-card"><h4>Incidents</h4><p><strong>${incidents.length}</strong></p><p class="muted-copy">${incidents[0] ? esc(incidents[0].title) : "None on file"}</p></article>
          <article class="fc-status-card"><h4>Medication</h4>${pill(medsOk, medsOk ? "Authorized" : "None")}</article>
          <article class="fc-status-card"><h4>Immunizations</h4>${pill(immOk, child.immunizationStatus || "Record")}<p class="muted-copy">${child.immunizationExpires ? `Review ${esc(child.immunizationExpires)}` : "Keep records current"}</p></article>
        </div>
        <div class="fc-timeline" data-fc-timeline>
          <h4>Child timeline</h4>
          ${timeline.length ? `
            <ol class="fc-timeline-list">
              ${timeline.map((ev) => `
                <li>
                  <strong>${esc(ev.title)}</strong>
                  <span class="muted-copy">${esc(ev.detail || "")}${ev.at ? ` · ${esc(String(ev.at).slice(0, 16).replace("T", " "))}` : ""}</span>
                </li>`).join("")}
            </ol>` : `<p class="muted-copy">Completed forms will appear here as a permanent history for ${esc(child.name)}.</p>`}
        </div>
      </section>`;
  }

  function estimateMinutes(schema) {
    const fields = schema?.fields?.length || 8;
    return Math.max(2, Math.min(12, Math.ceil(fields * 0.45)));
  }

  function parentExperienceHtml(doc, opts = {}) {
    const e = eco();
    const schema = doc?.fieldsSchema;
    if (!schema?.fields?.length || !e) return e?.parentFillHtml?.(doc, opts) || "";
    const canFill = opts.canFill !== false && !doc.signedAt;
    const minutes = estimateMinutes(schema);
    const answers = { ...(doc.answers || {}), ...(loadParentDraft(doc.id) || {}) };
    return `
      <div class="fc-parent-app" data-fc-parent-doc="${esc(doc.id || "")}">
        <header class="fc-parent-hero">
          <p class="eyebrow">Family paperwork</p>
          <h3>${esc(doc.title || "Form")}</h3>
          <p>Designed for your phone — about <strong>${minutes} minutes</strong>. Save and continue anytime.</p>
        </header>
        <form class="fe-parent-form fc-parent-form" data-fe-parent-form="${esc(doc.id || "")}" data-fc-parent-form="${esc(doc.id || "")}">
          ${e.renderBeautifulForm(schema, answers, { mode: "parent", readOnly: !canFill })}
          ${canFill ? `
            <div class="fc-parent-actions">
              <button class="ghost-button fc-btn-large" type="button" data-fc-save-continue="${esc(doc.id || "")}">Save &amp; continue later</button>
              <button class="primary-button fc-btn-large" type="submit">Finish &amp; sign</button>
              <p class="fh-meta">Testing signature — your provider sees answers immediately.</p>
            </div>` : `<p class="fh-meta">You’re all set on this form.</p>`}
        </form>
      </div>`;
  }

  function loadParentDraft(docId) {
    try {
      const all = JSON.parse(global.localStorage?.getItem(PARENT_DRAFT_KEY) || "{}");
      return all[docId] || null;
    } catch (_e) {
      return null;
    }
  }

  function saveParentDraft(docId, answers) {
    try {
      const all = JSON.parse(global.localStorage?.getItem(PARENT_DRAFT_KEY) || "{}");
      all[docId] = { ...answers, savedAt: new Date().toISOString() };
      global.localStorage?.setItem(PARENT_DRAFT_KEY, JSON.stringify(all));
    } catch (_e) { /* ignore */ }
  }

  function enhanceFamilyHubFormsHtml(originalHtml, data) {
    try {
      const documents = Array.isArray(data?.documents) ? data.documents : [];
      if (!documents.length) return originalHtml;
      const children = Array.isArray(data?.children) ? data.children : [];
      const childName = (id) => children.find((c) => c.id === id)?.name || "Child";
      const actionable = documents.filter((d) => d.canAcknowledge && !d.signedAt).length;
      return `
        <div class="fh-panel-stack fc-fh-forms">
          <header class="fc-fh-header">
            <h3>Your forms</h3>
            <p class="fh-meta">${actionable ? `${actionable} waiting for you` : "You’re caught up"} — tap a card to continue. No PDFs required.</p>
          </header>
          ${documents.map((doc) => {
            const hasSchema = Boolean(doc.fieldsSchema?.fields?.length);
            const minutes = estimateMinutes(doc.fieldsSchema);
            const signedMeta = doc.signedAt
              ? `Signed ${String(doc.signedAt).slice(0, 16).replace("T", " ")}${doc.signedBy ? ` by ${esc(doc.signedBy)}` : ""}`
              : "";
            return `
              <article class="fh-card fc-fh-card" id="fh-doc-${esc(doc.id || "doc")}">
                <div class="fh-card-head">
                  <strong>${esc(doc.title || "Form")}</strong>
                  <span class="fh-status-tag">${esc(doc.statusLabel || doc.status || "Needed")}</span>
                </div>
                <p class="fh-meta">${esc(childName(doc.childId))} · ~${minutes} min${doc.dueDate ? ` · Due ${esc(doc.dueDate)}` : ""}</p>
                ${hasSchema
                  ? parentExperienceHtml({ ...doc }, { canFill: Boolean(doc.canAcknowledge) })
                  : `
                    ${doc.bodyText ? `<details class="fh-form-body"><summary>Read form</summary><pre class="fh-form-pre">${esc(doc.bodyText)}</pre></details>` : ""}
                    ${doc.canAcknowledge && doc.id ? `<button class="primary-button fc-btn-large" type="button" data-family-hub-sign-form="${esc(doc.id)}">Sign form</button>` : ""}
                  `}
                ${signedMeta ? `<p class="fh-meta">${signedMeta}</p>` : ""}
              </article>`;
          }).join("")}
        </div>`;
    } catch (_e) {
      return originalHtml;
    }
  }

  function allergyBannerHtml(records) {
    const children = (records?.children || (typeof childStore === "function" ? childStore("Profiles") : []) || [])
      .filter((c) => c && !c.archived && (c.allergyAlert || c.allergies));
    if (!children.length) return "";
    return `
      <section class="work-hub-section fc-allergy-banner" data-fc-allergy-banner>
        <h3>Allergy alerts</h3>
        <div class="fc-allergy-list">
          ${children.slice(0, 8).map((c) => `
            <article class="fc-allergy-card">
              <strong>${esc(c.name)}</strong>
              <p>${esc(c.allergies || "See profile")}</p>
            </article>`).join("")}
        </div>
      </section>`;
  }

  function reviewReport() {
    const bySection = sectionStats();
    const titles = catalog().map((f) => f.title);
    const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
    const recommendedAdd = [
      "Dental Health Permission",
      "Over-the-Counter Medication List",
      "Disaster Preparedness Acknowledgment",
      "Screen Time / Media Permission",
      "Holiday Schedule Acknowledgment",
      "Late Pick-Up Policy Acknowledgment",
    ];
    return {
      sections: bySection.map((s) => ({ id: s.id, label: s.label, count: s.count, recommended: s.recommended.map((f) => f.title) })),
      totalForms: catalog().length,
      duplicateTitles: [...new Set(dupes)],
      mergedNote: "Catalog links existing printable IDs; center sections reorganize without duplicating templates.",
      wording: "Labels use plain family language; Oklahoma refine adds DHS acknowledgment checkbox.",
      recommendedAdditional: recommendedAdd,
    };
  }

  function refreshHub() {
    try {
      if (typeof renderHomeDaycareHubPage === "function"
        && global.document?.querySelector?.("#view-home-daycare-hub.active-view")) {
        renderHomeDaycareHubPage({ refreshHouseholds: false });
      }
    } catch (_e) { /* ignore */ }
  }

  function bindUi(root = global.document) {
    if (!root || root.__fcBound) return;
    root.__fcBound = true;

    root.addEventListener("click", async (event) => {
      const jump = event.target.closest?.("[data-fc-jump]");
      if (jump) {
        const el = root.querySelector(`#${jump.getAttribute("data-fc-jump")}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const filterBtn = event.target.closest?.("[data-fc-dash-filter]");
      if (filterBtn) {
        setDashFilter(filterBtn.getAttribute("data-fc-dash-filter") || "all");
        refreshHub();
        return;
      }

      const openSection = event.target.closest?.("[data-fc-open-section]");
      if (openSection) {
        const id = openSection.getAttribute("data-fc-open-section");
        const host = root.querySelector("#fcSectionDetail");
        if (host) {
          host.hidden = false;
          host.innerHTML = renderSectionDetail(id);
          host.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }

      if (event.target.closest?.("[data-fc-close-section]")) {
        const host = root.querySelector("#fcSectionDetail");
        if (host) {
          host.hidden = true;
          host.innerHTML = "";
        }
        return;
      }

      const promptChip = event.target.closest?.("[data-fc-prompt]");
      if (promptChip) {
        handleChatMessage(promptChip.getAttribute("data-fc-prompt"));
        refreshHub();
        root.querySelector("#fcAiChat")?.scrollIntoView({ behavior: "smooth" });
        return;
      }

      const refine = event.target.closest?.("[data-fc-refine]");
      if (refine) {
        try {
          applyPremiumRefine(refine.getAttribute("data-fc-refine"));
          pushChat("assistant", `Applied: ${refine.textContent.trim()}`);
          refreshHub();
          if (typeof showActionFeedback === "function") showActionFeedback("Form updated.");
        } catch (err) {
          if (typeof showActionFeedback === "function") showActionFeedback(err.message || "Could not refine.");
        }
        return;
      }

      const useForm = event.target.closest?.("[data-fc-use-form], [data-fc-preview-form]");
      if (useForm) {
        const id = useForm.getAttribute("data-fc-use-form") || useForm.getAttribute("data-fc-preview-form");
        const e = eco();
        const item = e?.findCatalogItem?.(id) || catalog().find((f) => f.id === id || f.title === id);
        if (item && e) {
          const schema = e.cloneSchema(item);
          e.saveAiDraft({
            prompt: `Use ${item.title}`,
            schema,
            body: e.schemaToBody(schema),
            history: [{ at: new Date().toISOString(), action: "center", prompt: item.title }],
          });
          pushChat("assistant", `Opened “${item.title}”. Refine or assign when ready.`);
          refreshHub();
          root.querySelector("#fcAiChat")?.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }

      const saveContinue = event.target.closest?.("[data-fc-save-continue]");
      if (saveContinue) {
        const docId = saveContinue.getAttribute("data-fc-save-continue");
        const form = root.querySelector(`[data-fc-parent-form="${CSS.escape(docId)}"]`);
        const answers = eco()?.collectAnswers?.(form) || {};
        saveParentDraft(docId, answers);
        if (typeof showActionFeedback === "function") showActionFeedback("Saved — continue anytime.");
        return;
      }

      const assignMissing = event.target.closest?.("[data-fc-assign-missing]");
      if (assignMissing) {
        const title = assignMissing.getAttribute("data-fc-assign-missing");
        const childId = assignMissing.getAttribute("data-child-id");
        const e = eco();
        const item = catalog().find((f) => f.title === title);
        if (!item || !e || !childId) return;
        const schema = e.cloneSchema(item);
        try {
          if (typeof assignAndNotifyForm === "function") {
            await assignAndNotifyForm({
              title: schema.title,
              category: schema.category || "Enrollment",
              body: e.schemaToBody(schema),
              draftText: e.schemaToBody(schema),
              fieldsSchema: schema,
              catalogId: schema.catalogId || schema.id,
              connections: schema.connections || [],
              shareWithFamily: true,
            }, [childId]);
          }
          writeTimelineEvent(childId, { title: "Form assigned", detail: title, kind: "assigned" });
          if (typeof showActionFeedback === "function") showActionFeedback(`Assigned ${title}.`);
          refreshHub();
        } catch (err) {
          if (typeof showActionFeedback === "function") showActionFeedback(err.message || "Could not assign.");
        }
      }
    });

    root.addEventListener("submit", async (event) => {
      const chatForm = event.target.closest?.("#fcChatForm");
      if (chatForm) {
        event.preventDefault();
        const message = String(new FormData(chatForm).get("message") || "").trim();
        handleChatMessage(message);
        refreshHub();
        return;
      }

      const packetForm = event.target.closest?.("#fcPacketForm");
      if (packetForm) {
        event.preventDefault();
        const selected = Array.from(packetForm.querySelectorAll('input[name="packetItem"]:checked')).map((el) => el.value);
        try {
          generatePacket(selected);
          refreshHub();
          if (typeof showActionFeedback === "function") showActionFeedback("Packet generated.");
        } catch (err) {
          if (typeof showActionFeedback === "function") showActionFeedback(err.message || "Could not generate packet.");
        }
        return;
      }

      const assignPacketForm = event.target.closest?.("#fcAssignPacketForm");
      if (assignPacketForm) {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(assignPacketForm).entries());
        const share = Boolean(assignPacketForm.querySelector('[name="shareWithFamily"]')?.checked);
        try {
          await assignPacket(String(data.childId || ""), share);
          if (typeof showActionFeedback === "function") showActionFeedback("Packet assigned.");
          refreshHub();
        } catch (err) {
          if (typeof showActionFeedback === "function") showActionFeedback(err.message || "Could not assign packet.");
        }
      }
    });
  }

  function boot() {
    bindUi(global.document);
    // Prefer Forms Center Family Hub + sign hooks
    if (eco()) {
      const original = eco().onFormSigned?.bind(eco());
      eco().onFormSigned = function wrapped(doc) {
        const base = original ? original(doc) : { updated: false, changes: [] };
        return deepenPlatformConnections(doc, doc?.answers || {}, base);
      };
      eco().enhanceFamilyHubFormsHtml = enhanceFamilyHubFormsHtml;
      eco().parentFillHtml = parentExperienceHtml;
    }
  }

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.FormsCenter = {
    CENTER_SECTIONS,
    ENROLLMENT_PACKET_DEFAULTS,
    REFINE_CHIPS,
    hubHtml,
    dashboardHtml,
    sectionsHtml,
    conversationalAiHtml,
    childStatusHtml,
    parentExperienceHtml,
    enhanceFamilyHubFormsHtml,
    allergyBannerHtml,
    handleChatMessage,
    generatePacket,
    applyPremiumRefine,
    assignPacket,
    onFormSigned,
    deepenPlatformConnections,
    dashboardBuckets,
    sectionStats,
    resolveSection,
    reviewReport,
    readTimeline,
    writeTimelineEvent,
    getChat,
  };
})(typeof window !== "undefined" ? window : globalThis);
