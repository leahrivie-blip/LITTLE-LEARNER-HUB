/**
 * Family Hub helpers (testing-only surfaces).
 * Keep persistence/durability rules + parent feed builders here.
 */

function isEphemeralStorePath(storePath = "") {
  const normalized = String(storePath || "").trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("/tmp/") || normalized.includes("/tmp/")) return true;
  if (normalized.startsWith("/var/tmp/") || normalized.includes("/var/tmp/")) return true;
  if (normalized.includes("/temp/") || (/\/t[\\/]/i.test(normalized) && normalized.includes("temp"))) {
    if (normalized.includes("tmpdir") || normalized.includes("/temp/") || normalized.includes("\\temp\\")) return true;
  }
  if (normalized.includes("/appdata/local/temp/")) return true;
  return false;
}

function familyHubStorageStatus({
  databaseProvider = "local-json",
  databaseReady = false,
  usePostgres = false,
  storePath = "",
  allowEphemeral = false,
  lastError = "",
} = {}) {
  const provider = String(databaseProvider || "local-json").toLowerCase();
  const wantsPostgres = provider === "postgres" || provider === "postgresql";
  const ephemeralPath = isEphemeralStorePath(storePath);
  let durable = false;
  let backend = "none";
  let reason = "";

  if (usePostgres && databaseReady) {
    durable = true;
    backend = "postgres";
    reason = "Postgres store is connected and ready.";
  } else if (wantsPostgres && !databaseReady) {
    durable = false;
    backend = usePostgres ? "memory-only" : "postgres-not-configured";
    reason = lastError
      ? `DATABASE_PROVIDER is postgres but the store is not ready: ${lastError}`
      : (usePostgres
        ? "DATABASE_PROVIDER is postgres but the authentic store has not loaded, so writes stay in memory only (lost on restart)."
        : "DATABASE_PROVIDER is postgres but PRODUCTION_DATABASE_URL is missing/unusable. Family Hub refuses non-durable invites. Set the testing Neon URL or switch to local-json on a persistent disk (not /tmp).");
    if (ephemeralPath) {
      reason += ` LLH_STORE_PATH is also ephemeral (${storePath || "unset"}).`;
    }
  } else if (provider === "local-json" || !usePostgres) {
    if (ephemeralPath && !allowEphemeral) {
      durable = false;
      backend = "ephemeral-json";
      reason = `LLH_STORE_PATH points at an ephemeral location (${storePath || "unset"}). Use a persistent disk path or Postgres for Family Hub testing.`;
    } else {
      durable = true;
      backend = ephemeralPath ? "ephemeral-json-allowed" : "local-json";
      reason = ephemeralPath
        ? "Ephemeral JSON allowed by LLH_ALLOW_EPHEMERAL_FAMILY_HUB (test runners only)."
        : `Local JSON store at ${storePath}`;
    }
  }

  return {
    durable,
    backend,
    reason,
    storePath: storePath || "",
    ephemeralPath,
    allowEphemeral: Boolean(allowEphemeral),
    databaseProvider: provider,
    databaseReady: Boolean(databaseReady),
    usingPostgres: Boolean(usePostgres),
    lastError: lastError || "",
    testingOnly: true,
  };
}

function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso, days) {
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return todayIso(date);
}

function publicSharedItem(item = {}, type = "item") {
  return {
    id: String(item.id || ""),
    type,
    childId: String(item.childId || ""),
    title: String(item.title || item.caption || item.summary || type).trim() || type,
    summary: String(item.summary || item.notes || item.message || item.observationText || item.caption || "").trim(),
    date: String(item.date || item.createdAt || item.updatedAt || "").slice(0, 10),
    category: String(item.category || item.type || "").trim(),
    url: String(item.url || item.photoUrl || item.src || "").trim(),
    mood: String(item.mood || "").trim(),
    time: String(item.time || item.napStart || item.napEnd || item.dropoff || item.pickup || "").trim(),
    shareWithFamily: true,
  };
}

function sharedForChild(list, childIds, type) {
  const idSet = new Set((Array.isArray(childIds) ? childIds : []).map((id) => String(id)));
  return (Array.isArray(list) ? list : [])
    .filter((item) => (
      item
      && typeof item === "object"
      && idSet.has(String(item.childId || ""))
      && item.shareWithFamily === true
      && item.archived !== true
    ))
    .sort((a, b) => String(b.updatedAt || b.createdAt || b.date || "").localeCompare(String(a.updatedAt || a.createdAt || a.date || "")))
    .map((item) => publicSharedItem(item, type));
}

function buildSharedFamilyFeed(childData = null, childIds = []) {
  const data = childData && typeof childData === "object" ? childData : {};
  return {
    reports: sharedForChild(data.Reports, childIds, "report").slice(0, 40),
    photos: sharedForChild(data.Photos, childIds, "photo").slice(0, 40),
    observations: sharedForChild(data.Observations, childIds, "observation").slice(0, 40),
    meals: sharedForChild(data.Meals, childIds, "meal").slice(0, 40),
    naps: sharedForChild(data.Naps, childIds, "nap").slice(0, 40),
    diapers: sharedForChild(data.Diapers, childIds, "diaper").slice(0, 40),
    activities: sharedForChild(data.ActivityLogs, childIds, "activity").slice(0, 40),
    notes: sharedForChild(data.Communications, childIds, "note").slice(0, 40),
  };
}

function liveDocumentsForChildren(childData = null, childIds = [], fallbackDocuments = []) {
  const idSet = new Set((Array.isArray(childIds) ? childIds : []).map((id) => String(id)));
  const live = (Array.isArray(childData?.Documents) ? childData.Documents : [])
    .filter((doc) => idSet.has(String(doc?.childId || "")) && doc?.archived !== true)
    .map((doc) => ({
      id: String(doc.id || ""),
      childId: String(doc.childId || ""),
      title: String(doc.title || "Form").trim() || "Form",
      category: String(doc.category || "Other").trim() || "Other",
      status: String(doc.status || "needed").trim() || "needed",
      statusLabel: String(doc.statusLabel || doc.status || "Needed").trim() || "Needed",
      notes: String(doc.notes || doc.summary || "").trim(),
      updatedAt: String(doc.updatedAt || doc.createdAt || "").trim(),
      viewOnly: true,
    }));
  if (live.length) return live;
  return (Array.isArray(fallbackDocuments) ? fallbackDocuments : []).map((doc) => ({
    id: String(doc.id || ""),
    childId: String(doc.childId || ""),
    title: String(doc.title || "Form").trim() || "Form",
    category: String(doc.category || "Other").trim() || "Other",
    status: String(doc.status || "needed").trim() || "needed",
    statusLabel: String(doc.statusLabel || doc.status || "Needed").trim() || "Needed",
    notes: String(doc.notes || "").trim(),
    updatedAt: String(doc.updatedAt || "").trim(),
    viewOnly: true,
  }));
}

function normalizeGuardianEmails(primaryEmail = "", guardianEmails = []) {
  const list = [];
  const push = (value) => {
    const email = String(value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (!list.includes(email)) list.push(email);
  };
  push(primaryEmail);
  (Array.isArray(guardianEmails) ? guardianEmails : []).forEach(push);
  return list;
}

function mealLines(item = {}) {
  const lines = [];
  if (item.breakfast) lines.push({ label: "Breakfast", detail: String(item.breakfast) });
  if (item.lunch) lines.push({ label: "Lunch", detail: String(item.lunch) });
  if (item.snack) lines.push({ label: "Snack", detail: String(item.snack) });
  if (item.type && item.amount) lines.push({ label: String(item.type), detail: String(item.amount) });
  if (!lines.length && (item.summary || item.notes || item.title)) {
    lines.push({ label: "Meal", detail: String(item.summary || item.notes || item.title) });
  }
  return lines;
}

function buildFamilyHubToday({
  childData = null,
  children = [],
  childId = "",
  date = "",
  messages = [],
  events = [],
  now = new Date(),
} = {}) {
  const day = String(date || todayIso(now)).slice(0, 10);
  const list = Array.isArray(children) ? children : [];
  const focusId = String(childId || list[0]?.id || "").trim();
  const focusChild = list.find((child) => String(child.id) === focusId) || list[0] || null;
  const ids = focusChild ? [String(focusChild.id)] : [];
  const data = childData && typeof childData === "object" ? childData : {};
  const onDay = (items, type) => sharedForChild(items, ids, type).filter((item) => !item.date || item.date === day);

  const mealsRaw = (Array.isArray(data.Meals) ? data.Meals : []).filter((item) => (
    ids.includes(String(item.childId || ""))
    && item.shareWithFamily === true
    && item.archived !== true
    && String(item.date || "").slice(0, 10) === day
  ));
  const meals = mealsRaw.flatMap((item) => mealLines(item).map((line, index) => ({
    id: `${item.id || "meal"}-${index}`,
    childId: String(item.childId || ""),
    label: line.label,
    detail: line.detail,
    time: String(item.time || "").trim(),
  })));

  const naps = (Array.isArray(data.Naps) ? data.Naps : [])
    .filter((item) => (
      ids.includes(String(item.childId || ""))
      && item.shareWithFamily === true
      && item.archived !== true
      && String(item.date || "").slice(0, 10) === day
    ))
    .map((item) => {
      const start = String(item.napStart || "").trim();
      const end = String(item.napEnd || "").trim();
      const range = start && end ? `${start}–${end}` : (start || end || "");
      return {
        id: String(item.id || ""),
        childId: String(item.childId || ""),
        title: "Nap",
        summary: String(item.summary || "").trim(),
        detail: [range, item.summary].filter(Boolean).join(" · ") || "Nap logged",
        time: range || start,
        date: day,
        napStart: start,
        napEnd: end,
      };
    });
  const diapers = (Array.isArray(data.Diapers) ? data.Diapers : [])
    .filter((item) => (
      ids.includes(String(item.childId || ""))
      && item.shareWithFamily === true
      && item.archived !== true
      && String(item.date || "").slice(0, 10) === day
    ))
    .map((item) => {
      const kind = String(item.type || item.summary || "Update").trim() || "Update";
      return {
        id: String(item.id || ""),
        childId: String(item.childId || ""),
        title: kind,
        category: kind,
        summary: String(item.summary || kind).trim(),
        detail: String(item.summary || kind).trim(),
        time: String(item.time || "").trim(),
        date: day,
      };
    });
  const activities = onDay(data.ActivityLogs, "activity");
  const photos = onDay(data.Photos, "photo");
  const reports = onDay(data.Reports, "report");
  const notes = onDay(data.Communications, "note").filter((item) => {
    const cat = String(item.category || "").toLowerCase();
    return !cat.includes("mood");
  });
  const moodItem = onDay(data.Communications, "note").find((item) => {
    const cat = String(item.category || "").toLowerCase();
    return cat.includes("mood") || Boolean(item.mood);
  }) || null;
  const mood = moodItem
    ? { value: moodItem.mood || moodItem.summary || moodItem.title || "Logged", summary: moodItem.summary || "", at: moodItem.time || moodItem.date }
    : null;

  const profile = (Array.isArray(data.Profiles) ? data.Profiles : []).find((p) => String(p.id) === focusId) || null;
  const photoUrl = String(profile?.photoUrl || profile?.avatarUrl || photos[0]?.url || "").trim();
  const hour = now.getHours();
  const greetingWord = hour < 12 ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening");
  const childName = String(focusChild?.name || "there").trim() || "there";
  const firstName = childName.split(/\s+/)[0] || childName;

  // Preview latest thread notes on Today (not only unread), so the section stays useful after opening Messages.
  const recentMessages = (Array.isArray(messages) ? messages : [])
    .filter((msg) => msg && String(msg.body || "").trim())
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 3)
    .map((msg) => ({
      id: String(msg.id || ""),
      body: String(msg.body || "").trim(),
      authorName: String(msg.authorName || (msg.from === "parent" ? "You" : "Teacher")).trim()
        || (msg.from === "parent" ? "You" : "Teacher"),
      createdAt: String(msg.createdAt || "").trim(),
      unread: msg.from === "provider" && msg.readByParent !== true,
      from: String(msg.from || ""),
    }));

  const upcoming = (Array.isArray(events) ? events : []).slice(0, 5);

  return {
    date: day,
    childId: focusId,
    child: focusChild ? { id: String(focusChild.id), name: childName, photoUrl } : null,
    greeting: `${greetingWord}`,
    greetingLine: focusChild
      ? `Here’s how ${firstName}’s day is going.`
      : "Your household updates will show here.",
    mood,
    meals,
    naps,
    diapers,
    activities,
    teacherNotes: notes,
    photos,
    reports,
    messages: recentMessages,
    upcomingEvents: upcoming,
    empty: !mood && !meals.length && !naps.length && !diapers.length && !activities.length
      && !notes.length && !photos.length && !reports.length && !recentMessages.length && !upcoming.length,
  };
}

function buildFamilyHubCalendar(scheduleDoc = null, { fromDate = "", days = 45 } = {}) {
  const start = String(fromDate || todayIso()).slice(0, 10);
  const end = addDaysIso(start, Math.max(1, Number(days) || 45));
  const items = Array.isArray(scheduleDoc?.items) ? scheduleDoc.items : [];
  const familyTypes = new Set(["closure", "family_event", "reminder", "director_event"]);
  return items
    .filter((item) => {
      if (!item || item.archived) return false;
      const type = String(item.type || "");
      if (!familyTypes.has(type) && type !== "classroom_event") return false;
      // classroom_event only if explicitly family-facing
      if (type === "classroom_event" && item.shareWithFamily !== true && item.visibleToFamilies !== true) return false;
      const itemStart = String(item.startDate || item.date || "").slice(0, 10);
      const itemEnd = String(item.endDate || item.startDate || item.date || "").slice(0, 10);
      if (!itemStart) return false;
      return itemStart <= end && itemEnd >= start;
    })
    .sort((a, b) => String(a.startDate || a.date || "").localeCompare(String(b.startDate || b.date || "")))
    .slice(0, 60)
    .map((item) => ({
      id: String(item.id || ""),
      title: String(item.title || item.name || "Event").trim() || "Event",
      type: String(item.type || "event"),
      startDate: String(item.startDate || item.date || "").slice(0, 10),
      endDate: String(item.endDate || item.startDate || item.date || "").slice(0, 10),
      startTime: String(item.startTime || "").trim(),
      endTime: String(item.endTime || "").trim(),
      summary: String(item.notes || item.summary || item.description || "").trim(),
    }));
}

function publicFamilyMessage(msg = {}) {
  return {
    id: String(msg.id || ""),
    householdId: String(msg.householdId || ""),
    from: String(msg.from || ""),
    authorName: String(msg.authorName || "").trim() || (msg.from === "provider" ? "Teacher" : "You"),
    body: String(msg.body || "").trim(),
    createdAt: String(msg.createdAt || "").trim(),
    readByParent: Boolean(msg.readByParent),
    readByProvider: Boolean(msg.readByProvider),
  };
}

function publicFamilyNotification(item = {}) {
  return {
    id: String(item.id || ""),
    householdId: String(item.householdId || ""),
    type: String(item.type || "update"),
    title: String(item.title || "Update").trim() || "Update",
    body: String(item.body || "").trim(),
    createdAt: String(item.createdAt || "").trim(),
    read: Boolean(item.read),
    href: String(item.href || "").trim(),
  };
}

function defaultHouseholdSettings(settings = {}) {
  const src = settings && typeof settings === "object" ? settings : {};
  return {
    preferredName: String(src.preferredName || "").trim().slice(0, 80),
    notifyMessages: src.notifyMessages !== false,
    notifyPhotos: src.notifyPhotos !== false,
    notifyDailyReports: src.notifyDailyReports !== false,
    notifyEvents: src.notifyEvents !== false,
  };
}

/** Lightweight illustrated demo photos (SVG data URIs) — no external image host required. */
function familyHubDemoPhotoUri({
  sky = "#cfe8f7",
  ground = "#b7d8a8",
  accent = "#f0c27a",
  motif = "play",
} = {}) {
  const motifs = {
    play: `
      <circle cx="210" cy="52" r="22" fill="${accent}"/>
      <rect x="48" y="118" width="18" height="52" rx="6" fill="#6b8f71"/>
      <ellipse cx="57" cy="118" rx="28" ry="16" fill="#7fad84"/>
      <circle cx="120" cy="148" r="14" fill="#e8a07a"/>
      <rect x="112" y="160" width="16" height="34" rx="6" fill="#5b9bd5"/>
      <circle cx="168" cy="152" r="12" fill="#c9a227"/>
      <rect x="161" y="162" width="14" height="30" rx="6" fill="#7b6bb5"/>
    `,
    art: `
      <rect x="70" y="110" width="100" height="70" rx="12" fill="#fff8ef" stroke="#d8c4a8"/>
      <circle cx="95" cy="138" r="10" fill="#e8a07a"/>
      <circle cx="118" cy="145" r="10" fill="#5b9bd5"/>
      <circle cx="140" cy="136" r="10" fill="#7b6bb5"/>
      <rect x="88" y="158" width="54" height="8" rx="4" fill="#c9a227"/>
      <path d="M190 90c18 8 28 28 22 46" fill="none" stroke="#5a4d8a" stroke-width="4" stroke-linecap="round"/>
    `,
    garden: `
      <circle cx="200" cy="48" r="20" fill="${accent}"/>
      <rect x="40" y="150" width="160" height="36" rx="10" fill="#8fbc8f"/>
      <circle cx="70" cy="140" r="16" fill="#6aa84f"/>
      <circle cx="110" cy="132" r="18" fill="#7fad84"/>
      <circle cx="150" cy="142" r="14" fill="#5b9bd5"/>
      <rect x="104" y="150" width="10" height="28" fill="#6b8f71"/>
    `,
    letters: `
      <rect x="56" y="100" width="130" height="86" rx="14" fill="#fffdf8" stroke="#d8c4a8"/>
      <text x="78" y="155" font-family="Georgia, serif" font-size="42" fill="#5a4d8a">M</text>
      <text x="128" y="155" font-family="Georgia, serif" font-size="42" fill="#5b9bd5">S</text>
      <circle cx="200" cy="70" r="16" fill="${accent}"/>
    `,
  };
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 240 240" role="img">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${sky}"/>
      <stop offset="100%" stop-color="#eef6fb"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" fill="url(#sky)"/>
  <ellipse cx="120" cy="210" rx="140" ry="54" fill="${ground}"/>
  ${motifs[motif] || motifs.play}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function familyHubDemoPortraitUri({ initials = "A", from = "#5b9bd5", to = "#3a7abf" } = {}) {
  const safe = String(initials || "A").slice(0, 2).toUpperCase();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" rx="56" fill="url(#g)"/>
  <circle cx="120" cy="96" r="42" fill="rgba(255,255,255,0.28)"/>
  <ellipse cx="120" cy="190" rx="70" ry="48" fill="rgba(255,255,255,0.22)"/>
  <text x="120" y="110" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="#fff">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildFamilyHubDemoSeed({
  now = new Date(),
  origin = "https://little-learner-hub-testing.onrender.com",
  createLoginCode,
  hashLoginCode,
  randomBytes,
} = {}) {
  const invitedAt = now.toISOString();
  const day = todayIso(now);
  const tomorrow = addDaysIso(day, 1);
  const nextWeek = addDaysIso(day, 7);
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const ownerEmail = "familyhub.demo.provider@llh.test";
  const parentEmail = "familyhub.demo.parent@llh.test";
  const guardianEmail = "familyhub.demo.guardian@llh.test";
  const childA = { id: "fh-demo-child-ava", name: "Ava Rivera" };
  const childB = { id: "fh-demo-child-milo", name: "Milo Rivera" };
  const loginCode = typeof createLoginCode === "function" ? createLoginCode() : "246801";
  const magicToken = typeof randomBytes === "function"
    ? randomBytes(24).toString("hex")
    : `demo${Date.now().toString(16)}`;
  const householdId = `family-demo-${now.getTime().toString(36)}`;
  const magicUrl = `${String(origin || "").replace(/\/$/, "")}/?familyHub=${encodeURIComponent(magicToken)}`;
  const photoChalk = familyHubDemoPhotoUri({ sky: "#cfe8f7", ground: "#b7d8a8", accent: "#f0c27a", motif: "play" });
  const photoLetters = familyHubDemoPhotoUri({ sky: "#e8f1fb", ground: "#d7c4a8", accent: "#e8a07a", motif: "letters" });
  const photoGarden = familyHubDemoPhotoUri({ sky: "#d9eef8", ground: "#8fbc8f", accent: "#f2d06b", motif: "garden" });
  const photoArt = familyHubDemoPhotoUri({ sky: "#eef4fb", ground: "#c9b89a", accent: "#7ba8c9", motif: "art" });
  const portraitAva = familyHubDemoPortraitUri({ initials: "AR", from: "#5b9bd5", to: "#3a7abf" });
  const portraitMilo = familyHubDemoPortraitUri({ initials: "MR", from: "#7ba8c9", to: "#5a8f7b" });

  const childData = {
    Profiles: [
      {
        id: childA.id,
        name: childA.name,
        ageGroup: "Toddler",
        parentInfo: "Sam & Jordan Rivera",
        photoUrl: portraitAva,
      },
      {
        id: childB.id,
        name: childB.name,
        ageGroup: "Preschool",
        parentInfo: "Sam & Jordan Rivera",
        photoUrl: portraitMilo,
      },
    ],
    Documents: [
      { id: "fh-doc-enroll", childId: childA.id, title: "Enrollment packet", category: "Enrollment", status: "needed", statusLabel: "Action needed", notes: "Please review and return the signature page this week.", updatedAt: invitedAt },
      { id: "fh-doc-emergency", childId: childA.id, title: "Emergency contacts", category: "Emergency", status: "on_file", statusLabel: "On file", notes: "Sam and Jordan Rivera are listed as primary contacts.", updatedAt: invitedAt },
      { id: "fh-doc-medical", childId: childB.id, title: "Annual medical form", category: "Medical", status: "needed", statusLabel: "Action needed", notes: "Due by the end of the month — drop off a signed copy anytime.", updatedAt: invitedAt },
      { id: "fh-doc-handbook", childId: childB.id, title: "Parent handbook", category: "Policy", status: "on_file", statusLabel: "On file", notes: "Your household copy is available to view anytime.", updatedAt: invitedAt },
    ],
    Reports: [
      {
        id: "fh-report-1",
        childId: childA.id,
        date: day,
        title: "Today’s daily report",
        summary: "Happy morning outdoors, ate most of lunch, nap 12:30–2:00. Practiced sharing during block play.",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
      {
        id: "fh-report-2",
        childId: childB.id,
        date: day,
        title: "Today’s daily report",
        summary: "Built with blocks, practiced letters, cheerful at pickup. Asked to bring a favorite book tomorrow.",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
    ],
    Photos: [
      {
        id: "fh-photo-1",
        childId: childA.id,
        caption: "Sidewalk chalk masterpieces",
        date: day,
        shareWithFamily: true,
        url: photoChalk,
        createdAt: invitedAt,
      },
      {
        id: "fh-photo-2",
        childId: childB.id,
        caption: "Letter practice at the table",
        date: day,
        shareWithFamily: true,
        url: photoLetters,
        createdAt: invitedAt,
      },
      {
        id: "fh-photo-3",
        childId: childA.id,
        caption: "Garden water play",
        date: day,
        shareWithFamily: true,
        url: photoGarden,
        createdAt: new Date(now.getTime() - 1000 * 60 * 90).toISOString(),
      },
      {
        id: "fh-photo-4",
        childId: childB.id,
        caption: "Afternoon art table",
        date: day,
        shareWithFamily: true,
        url: photoArt,
        createdAt: new Date(now.getTime() - 1000 * 60 * 50).toISOString(),
      },
    ],
    Observations: [
      {
        id: "fh-obs-1",
        childId: childA.id,
        title: "Gross motor play",
        summary: "Ava climbed the low structure and invited a friend to try next.",
        date: day,
        shareWithFamily: true,
        createdAt: invitedAt,
      },
    ],
    Communications: [
      {
        id: "fh-mood-1",
        childId: childA.id,
        date: day,
        type: "Mood Note",
        mood: "Happy",
        title: "Mood",
        summary: "Happy and curious this morning",
        shareWithFamily: true,
        createdAt: invitedAt,
        time: "09:15",
      },
      {
        id: "fh-note-1",
        childId: childA.id,
        date: day,
        type: "Teacher Note",
        title: "From Ms. Leah",
        summary: "Ava tried a new fruit at snack and loved it. Extra clothes are in her cubby.",
        message: "Ava tried a new fruit at snack and loved it. Extra clothes are in her cubby.",
        shareWithFamily: true,
        createdAt: invitedAt,
        time: "14:20",
      },
      {
        id: "fh-mood-2",
        childId: childB.id,
        date: day,
        type: "Mood Note",
        mood: "Focused",
        title: "Mood",
        summary: "Calm and focused during circle",
        shareWithFamily: true,
        createdAt: invitedAt,
        time: "10:00",
      },
    ],
    Attendance: [
      {
        id: "fh-att-1",
        childId: childA.id,
        date: day,
        dropoff: "08:40",
        status: "Present",
        shareWithFamily: true,
      },
    ],
    Meals: [
      {
        id: "fh-meal-1",
        childId: childA.id,
        date: day,
        breakfast: "Oatmeal with berries",
        lunch: "Ate most — pasta & veggies",
        snack: "Apple slices",
        title: "Meals",
        summary: "Breakfast, lunch, and snack logged",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
      {
        id: "fh-meal-2",
        childId: childB.id,
        date: day,
        lunch: "Ate all — rice bowl",
        snack: "Yogurt",
        title: "Meals",
        summary: "Lunch and snack logged",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
    ],
    Naps: [
      {
        id: "fh-nap-1",
        childId: childA.id,
        date: day,
        napStart: "12:30",
        napEnd: "14:00",
        summary: "Rested well",
        title: "Nap",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
      {
        id: "fh-nap-2",
        childId: childB.id,
        date: day,
        napStart: "13:00",
        napEnd: "13:45",
        summary: "Quiet rest",
        title: "Nap",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
    ],
    Diapers: [
      {
        id: "fh-diaper-1",
        childId: childA.id,
        date: day,
        time: "10:15",
        type: "Wet",
        title: "Wet",
        summary: "Changed",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
      {
        id: "fh-diaper-2",
        childId: childA.id,
        date: day,
        time: "13:10",
        type: "BM",
        title: "BM",
        summary: "Changed",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
      {
        id: "fh-potty-1",
        childId: childB.id,
        date: day,
        time: "11:00",
        type: "Potty",
        title: "Potty",
        summary: "Successful",
        shareWithFamily: true,
        createdAt: invitedAt,
      },
    ],
    ActivityLogs: [
      {
        id: "fh-act-1",
        childId: childA.id,
        date: day,
        activity: "Outdoor chalk art",
        area: "Art",
        title: "Outdoor chalk art",
        summary: "Drew suns and flowers with friends",
        notes: "Drew suns and flowers with friends",
        shareWithFamily: true,
        createdAt: invitedAt,
        time: "10:45",
      },
      {
        id: "fh-act-2",
        childId: childB.id,
        date: day,
        activity: "Letter tracing",
        area: "Literacy",
        title: "Letter tracing",
        summary: "Practiced M and S",
        notes: "Practiced M and S",
        shareWithFamily: true,
        createdAt: invitedAt,
        time: "11:20",
      },
    ],
    Goals: [],
    SupportPlans: [],
    Differentiations: [],
    MealPresets: [],
  };

  const scheduleItems = [
    {
      id: "fh-evt-picnic",
      type: "family_event",
      title: "Family picnic",
      startDate: nextWeek,
      endDate: nextWeek,
      allDay: false,
      startTime: "16:00",
      endTime: "17:30",
      notes: "Bring a blanket. All families welcome after pickup.",
      shareWithFamily: true,
    },
    {
      id: "fh-evt-closure",
      type: "closure",
      title: "Closed for provider training",
      startDate: addDaysIso(day, 14),
      endDate: addDaysIso(day, 14),
      allDay: true,
      notes: "No care this day. We’ll share a make-up date soon.",
      shareWithFamily: true,
    },
    {
      id: "fh-evt-reminder",
      type: "reminder",
      title: "Picture day",
      startDate: tomorrow,
      endDate: tomorrow,
      allDay: false,
      startTime: "09:30",
      endTime: "10:30",
      notes: "Solid colors photograph best if you have them.",
      shareWithFamily: true,
      visibleToFamilies: true,
    },
  ];

  const messages = [
    {
      id: `fh-msg-${now.getTime().toString(36)}-1`,
      householdId,
      from: "provider",
      authorName: "Ms. Leah",
      body: "Hi Sam — welcome to Family Hub. You’ll see Ava and Milo’s day here: meals, naps, photos, and notes.",
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 5).toISOString(),
      readByParent: true,
      readByProvider: true,
    },
    {
      id: `fh-msg-${now.getTime().toString(36)}-2`,
      householdId,
      from: "provider",
      authorName: "Ms. Leah",
      body: "Quick reminder: sunscreen and a light sweater for tomorrow’s outdoor morning.",
      createdAt: new Date(now.getTime() - 1000 * 60 * 35).toISOString(),
      readByParent: false,
      readByProvider: true,
    },
    {
      id: `fh-msg-${now.getTime().toString(36)}-3`,
      householdId,
      from: "parent",
      authorName: "Sam",
      body: "Thanks! We’ll pack both. Can Milo bring his blue water bottle?",
      createdAt: new Date(now.getTime() - 1000 * 60 * 20).toISOString(),
      readByParent: true,
      readByProvider: true,
    },
  ];

  const notifications = [
    {
      id: `fh-ntf-${now.getTime().toString(36)}-1`,
      householdId,
      type: "photo",
      title: "New photos",
      body: "4 new photos from today were shared with your household.",
      createdAt: invitedAt,
      read: false,
      href: "photos",
    },
    {
      id: `fh-ntf-${now.getTime().toString(36)}-2`,
      householdId,
      type: "report",
      title: "Daily report ready",
      body: "Ava’s daily report is ready to view.",
      createdAt: invitedAt,
      read: false,
      href: "reports",
    },
    {
      id: `fh-ntf-${now.getTime().toString(36)}-3`,
      householdId,
      type: "event",
      title: "Upcoming: Picture day",
      body: "Picture day is tomorrow at 9:30 AM.",
      createdAt: invitedAt,
      read: false,
      href: "calendar",
    },
  ];

  const household = {
    id: householdId,
    ownerEmail,
    label: "Rivera Family",
    email: parentEmail,
    phone: "",
    guardianEmails: [parentEmail, guardianEmail],
    guardianLabels: {
      [parentEmail]: "Sam Rivera",
      [guardianEmail]: "Jordan Rivera",
    },
    childIds: [childA.id, childB.id],
    children: [childA, childB],
    documents: childData.Documents.map((doc) => ({
      id: doc.id,
      childId: doc.childId,
      title: doc.title,
      category: doc.category,
      status: doc.status,
      statusLabel: doc.statusLabel,
      notes: doc.notes,
    })),
    settings: defaultHouseholdSettings({ preferredName: "Sam" }),
    status: "invited",
    invitedAt,
    expiresAt,
    loginCodeHash: typeof hashLoginCode === "function" ? hashLoginCode(loginCode) : "",
    loginCode,
    programName: "Sunshine Home Daycare",
    emailSent: false,
    smsSimulated: false,
    magicToken,
    magicUrl,
    demoSeed: true,
  };

  return {
    ownerEmail,
    parentEmail,
    guardianEmail,
    loginCode,
    magicToken,
    magicUrl,
    household,
    magicLink: {
      token: magicToken,
      householdId,
      createdAt: invitedAt,
      expiresAt,
      channel: "email",
      status: "pending",
      demoSeed: true,
    },
    childData,
    children: [childA, childB],
    scheduleItems,
    messages,
    notifications,
  };
}

module.exports = {
  isEphemeralStorePath,
  familyHubStorageStatus,
  buildSharedFamilyFeed,
  buildFamilyHubToday,
  buildFamilyHubCalendar,
  familyHubDemoPhotoUri,
  familyHubDemoPortraitUri,
  liveDocumentsForChildren,
  normalizeGuardianEmails,
  buildFamilyHubDemoSeed,
  publicSharedItem,
  publicFamilyMessage,
  publicFamilyNotification,
  defaultHouseholdSettings,
  todayIso,
  addDaysIso,
};
