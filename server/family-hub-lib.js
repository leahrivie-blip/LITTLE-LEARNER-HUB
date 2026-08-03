/**
 * Family Hub helpers (testing-only surfaces).
 * Keep persistence/durability rules here so invite/session handlers stay consistent.
 */

function isEphemeralStorePath(storePath = "") {
  const normalized = String(storePath || "").trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("/tmp/") || normalized.includes("/tmp/")) return true;
  if (normalized.startsWith("/var/tmp/") || normalized.includes("/var/tmp/")) return true;
  // macOS / Windows temp folders used by local test runners
  if (normalized.includes("/temp/") || /\/t[\\/]/i.test(normalized) && normalized.includes("temp")) {
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

function publicSharedItem(item = {}, type = "item") {
  return {
    id: String(item.id || ""),
    type,
    childId: String(item.childId || ""),
    title: String(item.title || item.caption || item.summary || type).trim() || type,
    summary: String(item.summary || item.notes || item.message || item.observationText || item.caption || "").trim(),
    date: String(item.date || item.createdAt || item.updatedAt || "").slice(0, 10),
    category: String(item.category || item.type || "").trim(),
    shareWithFamily: true,
  };
}

function buildSharedFamilyFeed(childData = null, childIds = []) {
  const idSet = new Set((Array.isArray(childIds) ? childIds : []).map((id) => String(id)));
  const data = childData && typeof childData === "object" ? childData : {};
  const pick = (key, type) => (Array.isArray(data[key]) ? data[key] : [])
    .filter((item) => (
      item
      && typeof item === "object"
      && idSet.has(String(item.childId || ""))
      && item.shareWithFamily === true
      && item.archived !== true
    ))
    .sort((a, b) => String(b.updatedAt || b.createdAt || b.date || "").localeCompare(String(a.updatedAt || a.createdAt || a.date || "")))
    .slice(0, 40)
    .map((item) => publicSharedItem(item, type));

  return {
    reports: pick("Reports", "report"),
    photos: pick("Photos", "photo"),
    observations: pick("Observations", "observation"),
  };
}

function liveDocumentsForChildren(childData = null, childIds = [], fallbackDocuments = []) {
  const idSet = new Set((Array.isArray(childIds) ? childIds : []).map((id) => String(id)));
  const live = (Array.isArray(childData?.Documents) ? childData.Documents : [])
    .filter((doc) => idSet.has(String(doc?.childId || "")) && doc?.archived !== true)
    .map((doc) => ({
      childId: String(doc.childId || ""),
      title: String(doc.title || "Form").trim() || "Form",
      category: String(doc.category || "Other").trim() || "Other",
      status: String(doc.status || "needed").trim() || "needed",
      statusLabel: String(doc.statusLabel || doc.status || "Needed").trim() || "Needed",
    }));
  if (live.length) return live;
  return Array.isArray(fallbackDocuments) ? fallbackDocuments : [];
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

function buildFamilyHubDemoSeed({
  now = new Date(),
  origin = "https://little-learner-hub-testing.onrender.com",
  createLoginCode,
  hashLoginCode,
  randomBytes,
} = {}) {
  const invitedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const ownerEmail = "familyhub.demo.provider@llh.test";
  const parentEmail = "familyhub.demo.parent@llh.test";
  const guardianEmail = "familyhub.demo.guardian@llh.test";
  const childA = { id: "fh-demo-child-ava", name: "Ava Demo" };
  const childB = { id: "fh-demo-child-milo", name: "Milo Demo" };
  const loginCode = typeof createLoginCode === "function" ? createLoginCode() : "246801";
  const magicToken = typeof randomBytes === "function"
    ? randomBytes(24).toString("hex")
    : `demo${Date.now().toString(16)}`;
  const householdId = `family-demo-${now.getTime().toString(36)}`;
  const magicUrl = `${String(origin || "").replace(/\/$/, "")}/?familyHub=${encodeURIComponent(magicToken)}`;

  const childData = {
    Profiles: [
      { id: childA.id, name: childA.name, ageGroup: "Toddler", parentInfo: "Sam Parent & Jordan Guardian" },
      { id: childB.id, name: childB.name, ageGroup: "Preschool", parentInfo: "Sam Parent & Jordan Guardian" },
    ],
    Documents: [
      { id: "fh-doc-enroll", childId: childA.id, title: "Enrollment Packet", category: "Enrollment", status: "needed", statusLabel: "Needed" },
      { id: "fh-doc-emergency", childId: childA.id, title: "Emergency Contacts", category: "Emergency", status: "on_file", statusLabel: "On file" },
      { id: "fh-doc-medical", childId: childB.id, title: "Medical Form", category: "Medical", status: "needed", statusLabel: "Needed" },
    ],
    Reports: [
      {
        id: "fh-report-1",
        childId: childA.id,
        date: invitedAt.slice(0, 10),
        title: "Daily Report",
        summary: "Happy morning outdoors, ate most of lunch, nap 12:30–2:00.",
        shareWithFamily: true,
      },
      {
        id: "fh-report-2",
        childId: childB.id,
        date: invitedAt.slice(0, 10),
        title: "Daily Report",
        summary: "Built with blocks, practiced letters, cheerful at pickup.",
        shareWithFamily: true,
      },
    ],
    Photos: [
      {
        id: "fh-photo-1",
        childId: childA.id,
        caption: "Sidewalk chalk masterpieces",
        date: invitedAt.slice(0, 10),
        shareWithFamily: true,
        url: "",
      },
      {
        id: "fh-photo-2",
        childId: childB.id,
        caption: "Letter practice at the table",
        date: invitedAt.slice(0, 10),
        shareWithFamily: true,
        url: "",
      },
    ],
    Observations: [
      {
        id: "fh-obs-1",
        childId: childA.id,
        title: "Gross motor play",
        summary: "Ava climbed the low structure and invited a friend to try next.",
        date: invitedAt.slice(0, 10),
        shareWithFamily: true,
      },
    ],
    Communications: [],
    Attendance: [],
    Meals: [],
    Naps: [],
    Diapers: [],
    ActivityLogs: [],
    Goals: [],
    SupportPlans: [],
    Differentiations: [],
    MealPresets: [],
  };

  const household = {
    id: householdId,
    ownerEmail,
    label: "Demo Family (internal testing)",
    email: parentEmail,
    phone: "",
    guardianEmails: [parentEmail, guardianEmail],
    childIds: [childA.id, childB.id],
    children: [childA, childB],
    documents: childData.Documents.map((doc) => ({
      childId: doc.childId,
      title: doc.title,
      category: doc.category,
      status: doc.status,
      statusLabel: doc.statusLabel,
    })),
    status: "invited",
    invitedAt,
    expiresAt,
    loginCodeHash: typeof hashLoginCode === "function" ? hashLoginCode(loginCode) : "",
    loginCode,
    programName: "Sunshine Testing Home Daycare",
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
  };
}

module.exports = {
  isEphemeralStorePath,
  familyHubStorageStatus,
  buildSharedFamilyFeed,
  liveDocumentsForChildren,
  normalizeGuardianEmails,
  buildFamilyHubDemoSeed,
  publicSharedItem,
};
