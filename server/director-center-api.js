/**
 * Director Center Phase 2 API (admin-only private preview).
 *
 * All handlers assume the caller already passed expansion access checks
 * (preview env + stored directorCenter flag + verified admin session).
 *
 * Regular members never reach these handlers.
 */
const foundation = require("../scripts/foundation-data-model.js");
const orgPermissions = require("../scripts/org-permissions.js");

function ensureCollections(store) {
  return foundation.ensureFoundationStore(store);
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function findOrganizationForEmail(store, email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return null;
  return listValues(store.organizations).find((org) => (
    org && String(org.ownerEmail || "").toLowerCase() === clean
  )) || null;
}

function ensurePreviewOrganization(store, adminEmail = "") {
  ensureCollections(store);
  const email = String(adminEmail || "").trim().toLowerCase() || "admin@preview.local";
  let org = findOrganizationForEmail(store, email);
  if (!org) {
    org = foundation.createOrganizationRecord({
      accountType: foundation.ACCOUNT_TYPES.CENTER,
      ownerEmail: email,
      name: "Admin Preview Program",
    });
    store.organizations[org.id] = org;
  }
  let profile = listValues(store.programProfiles).find((row) => row.organizationId === org.id) || null;
  if (!profile) {
    profile = foundation.createProgramProfileRecord({
      organizationId: org.id,
      programName: org.name || "Admin Preview Program",
      email,
      directorOwnerName: "Director Preview",
      programType: foundation.PROGRAM_TYPES.CHILDCARE_CENTER,
      classroomCount: 0,
    });
    store.programProfiles[profile.id] = profile;
  }
  const classrooms = listValues(store.classrooms).filter((row) => row.organizationId === org.id);
  if (!classrooms.length) {
    const classroom = foundation.createClassroomRecord({
      organizationId: org.id,
      name: "Main Classroom",
      ageGroupDefault: "Mixed",
      legacyClassroomId: "classroom-main",
    });
    store.classrooms[classroom.id] = classroom;
    profile.classroomCount = 1;
    profile.updatedAt = new Date().toISOString();
    store.programProfiles[profile.id] = profile;
  }
  let membership = listValues(store.staffMemberships).find((row) => (
    row.organizationId === org.id && String(row.userEmail || "").toLowerCase() === email
  ));
  if (!membership) {
    membership = foundation.createStaffMembershipRecord({
      organizationId: org.id,
      userEmail: email,
      userId: `admin:${email}`,
      role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
    });
    store.staffMemberships[membership.id] = membership;
  }
  return { organization: org, programProfile: profile, membership };
}

function organizationBundle(store, organizationId) {
  ensureCollections(store);
  const organization = store.organizations[organizationId] || null;
  if (!organization) return null;
  const programProfile = listValues(store.programProfiles).find((row) => row.organizationId === organizationId) || null;
  const classrooms = listValues(store.classrooms).filter((row) => row.organizationId === organizationId);
  const staffMemberships = listValues(store.staffMemberships).filter((row) => row.organizationId === organizationId);
  const classroomStaffAssignments = listValues(store.classroomStaffAssignments)
    .filter((row) => row.organizationId === organizationId);
  const childRecords = listValues(store.childRecords).filter((row) => row.organizationId === organizationId);
  const classroomChildAssignments = listValues(store.classroomChildAssignments)
    .filter((row) => row.organizationId === organizationId);
  return {
    organization,
    programProfile,
    classrooms,
    staffMemberships,
    classroomStaffAssignments,
    childRecords,
    classroomChildAssignments,
  };
}

function createDirectorCenterApi({
  readStore,
  writeStore,
  jsonResponse,
  readJson,
  normalizeEmail,
}) {
  async function handleStatus(request, response, context = {}) {
    const store = readStore();
    ensureCollections(store);
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    writeStore(store);
    const bundle = organizationBundle(store, preview.organization.id);
    jsonResponse(response, 200, {
      ok: true,
      phase: 2,
      preview: true,
      adminOnly: true,
      adminEmail: normalizeEmail(context.adminEmail || ""),
      organizationId: preview.organization.id,
      counts: {
        classrooms: bundle.classrooms.length,
        staffMemberships: bundle.staffMemberships.length,
        children: bundle.childRecords.length,
        classroomStaffAssignments: bundle.classroomStaffAssignments.length,
        classroomChildAssignments: bundle.classroomChildAssignments.length,
      },
    });
  }

  async function handleOverview(request, response, context = {}) {
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    writeStore(store);
    const bundle = organizationBundle(store, preview.organization.id);
    jsonResponse(response, 200, {
      ok: true,
      phase: 2,
      preview: true,
      adminOnly: true,
      ...bundle,
      permissionCatalog: {
        roles: orgPermissions.ORG_ROLES,
        sampleActions: [
          orgPermissions.ACTIONS.ORG_VIEW_ALL_CLASSROOMS,
          orgPermissions.ACTIONS.CLASSROOM_VIEW,
          orgPermissions.ACTIONS.CHILD_VIEW,
        ],
      },
    });
  }

  async function handleListClassrooms(request, response, context = {}) {
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    writeStore(store);
    const classrooms = listValues(store.classrooms).filter((row) => row.organizationId === preview.organization.id);
    jsonResponse(response, 200, { ok: true, organizationId: preview.organization.id, classrooms });
  }

  async function handleCreateClassroom(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    const classroom = foundation.createClassroomRecord({
      organizationId: preview.organization.id,
      name: String(body.name || "").trim() || "Untitled Classroom",
      ageGroupDefault: String(body.ageGroupDefault || "").trim(),
      notes: String(body.notes || "").trim(),
    });
    store.classrooms[classroom.id] = classroom;
    const profile = listValues(store.programProfiles).find((row) => row.organizationId === preview.organization.id);
    if (profile) {
      profile.classroomCount = listValues(store.classrooms)
        .filter((row) => row.organizationId === preview.organization.id).length;
      profile.updatedAt = new Date().toISOString();
      store.programProfiles[profile.id] = profile;
    }
    writeStore(store);
    jsonResponse(response, 201, { ok: true, classroom });
  }

  async function handleListStaff(request, response, context = {}) {
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      organizationId: preview.organization.id,
      staffMemberships: listValues(store.staffMemberships)
        .filter((row) => row.organizationId === preview.organization.id),
      classroomStaffAssignments: listValues(store.classroomStaffAssignments)
        .filter((row) => row.organizationId === preview.organization.id),
    });
  }

  async function handleAssignStaff(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    const classroomId = String(body.classroomId || "").trim();
    const classroom = store.classrooms[classroomId];
    if (!classroom || classroom.organizationId !== preview.organization.id) {
      jsonResponse(response, 404, { error: "Classroom was not found in this organization." });
      return;
    }
    const email = normalizeEmail(body.userEmail || body.email || "");
    if (!email) {
      jsonResponse(response, 400, { error: "Staff email is required." });
      return;
    }
    let membership = listValues(store.staffMemberships).find((row) => (
      row.organizationId === preview.organization.id && row.userEmail === email
    ));
    if (!membership) {
      membership = foundation.createStaffMembershipRecord({
        organizationId: preview.organization.id,
        userEmail: email,
        userId: String(body.userId || "").trim(),
        role: orgPermissions.normalizeOrgRole(body.role || "lead_teacher") || orgPermissions.ORG_ROLES.LEAD_TEACHER,
      });
      store.staffMemberships[membership.id] = membership;
    }
    const assignment = foundation.createClassroomStaffAssignmentRecord({
      organizationId: preview.organization.id,
      classroomId,
      staffMembershipId: membership.id,
      userId: membership.userId || `staff:${email}`,
    });
    store.classroomStaffAssignments[assignment.id] = assignment;
    writeStore(store);
    jsonResponse(response, 201, { ok: true, membership, assignment });
  }

  async function handleListChildren(request, response, context = {}) {
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      organizationId: preview.organization.id,
      children: listValues(store.childRecords).filter((row) => row.organizationId === preview.organization.id),
      classroomChildAssignments: listValues(store.classroomChildAssignments)
        .filter((row) => row.organizationId === preview.organization.id),
    });
  }

  async function handleAssignChild(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    const classroomId = String(body.classroomId || "").trim();
    const classroom = store.classrooms[classroomId];
    if (!classroom || classroom.organizationId !== preview.organization.id) {
      jsonResponse(response, 404, { error: "Classroom was not found in this organization." });
      return;
    }
    let childId = String(body.childId || "").trim();
    let child = childId ? store.childRecords[childId] : null;
    if (!child) {
      child = foundation.createChildRecord({
        organizationId: preview.organization.id,
        displayName: String(body.displayName || body.name || "").trim() || "Child",
        legacyChildId: String(body.legacyChildId || "").trim(),
      });
      store.childRecords[child.id] = child;
      childId = child.id;
    } else if (child.organizationId !== preview.organization.id) {
      jsonResponse(response, 403, { error: "Child belongs to a different organization." });
      return;
    }
    // Historical move: end any active assignment for this child in this org.
    const now = new Date().toISOString();
    listValues(store.classroomChildAssignments)
      .filter((row) => (
        row.organizationId === preview.organization.id
        && row.childId === childId
        && (!row.status || row.status === foundation.ASSIGNMENT_STATUS.ACTIVE)
        && !row.endsAt
      ))
      .forEach((row) => {
        row.status = foundation.ASSIGNMENT_STATUS.HISTORICAL;
        row.endsAt = now;
        row.updatedAt = now;
        store.classroomChildAssignments[row.id] = row;
      });
    const assignment = foundation.createClassroomChildAssignmentRecord({
      organizationId: preview.organization.id,
      classroomId,
      childId,
    });
    store.classroomChildAssignments[assignment.id] = assignment;
    writeStore(store);
    jsonResponse(response, 201, { ok: true, child: store.childRecords[childId], assignment });
  }

  async function handleGetProgramProfile(request, response, context = {}) {
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    writeStore(store);
    jsonResponse(response, 200, {
      ok: true,
      organization: preview.organization,
      programProfile: preview.programProfile,
    });
  }

  async function handleUpdateProgramProfile(request, response, context = {}) {
    const body = await readJson(request);
    const store = readStore();
    const preview = ensurePreviewOrganization(store, context.adminEmail);
    const profile = store.programProfiles[preview.programProfile.id];
    const next = {
      ...profile,
      programName: body.programName !== undefined ? String(body.programName || "").trim() : profile.programName,
      logoAssetId: body.logoAssetId !== undefined ? String(body.logoAssetId || "").trim() : profile.logoAssetId,
      directorOwnerName: body.directorOwnerName !== undefined ? String(body.directorOwnerName || "").trim() : profile.directorOwnerName,
      address: body.address !== undefined ? String(body.address || "").trim() : profile.address,
      phone: body.phone !== undefined ? String(body.phone || "").trim() : profile.phone,
      email: body.email !== undefined ? normalizeEmail(body.email) : profile.email,
      licenseNumber: body.licenseNumber !== undefined ? String(body.licenseNumber || "").trim() : profile.licenseNumber,
      website: body.website !== undefined ? String(body.website || "").trim() : profile.website,
      programType: body.programType !== undefined ? String(body.programType || "").trim() : profile.programType,
      updatedAt: new Date().toISOString(),
    };
    store.programProfiles[profile.id] = next;
    if (body.programName !== undefined && store.organizations[preview.organization.id]) {
      store.organizations[preview.organization.id] = {
        ...store.organizations[preview.organization.id],
        name: next.programName,
        updatedAt: next.updatedAt,
      };
    }
    writeStore(store);
    jsonResponse(response, 200, { ok: true, programProfile: next, organization: store.organizations[preview.organization.id] });
  }

  function matchRoute(method, pathname) {
    const path = String(pathname || "");
    if (method === "GET" && path === "/api/director-center/status") return handleStatus;
    if (method === "GET" && path === "/api/director-center/overview") return handleOverview;
    if (method === "GET" && path === "/api/director-center/classrooms") return handleListClassrooms;
    if (method === "POST" && path === "/api/director-center/classrooms") return handleCreateClassroom;
    if (method === "GET" && path === "/api/director-center/staff") return handleListStaff;
    if (method === "POST" && path === "/api/director-center/staff/assign") return handleAssignStaff;
    if (method === "GET" && path === "/api/director-center/children") return handleListChildren;
    if (method === "POST" && path === "/api/director-center/children/assign") return handleAssignChild;
    if (method === "GET" && path === "/api/director-center/program-profile") return handleGetProgramProfile;
    if (method === "PATCH" && path === "/api/director-center/program-profile") return handleUpdateProgramProfile;
    return null;
  }

  return {
    matchRoute,
    ensurePreviewOrganization,
    organizationBundle,
  };
}

module.exports = {
  createDirectorCenterApi,
  ensurePreviewOrganization,
  organizationBundle,
};
