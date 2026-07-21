/**
 * Phase 5 fake preview fixtures for the built-in form library.
 * No emails, Stripe, AI, production children, or response collection.
 */

const foundation = require("./foundation-data-model.js");
const orgPermissions = require("./org-permissions.js");
const model = require("./built-in-form-library-data-model.js");
const importer = require("./built-in-form-library-importer.js");
const { STARTER_TEMPLATES } = require("./built-in-form-library-starter-templates.js");
const { createOrganizationCopyFromTemplate } = require("./built-in-form-library-copy.js");
const formsFixtures = require("./forms-center-preview-fixtures.js");

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function templateByKey(store, key) {
  const id = store.builtInFormLibrary.templateKeyIndex[key];
  return id ? store.builtInFormLibrary.templates[id] : null;
}

function currentVersion(store, template) {
  return template?.currentVersionId ? store.builtInFormLibrary.versions[template.currentVersionId] : null;
}

/**
 * Seed the global built-in catalog exactly once per store: all 29 starter templates,
 * one template with a second published version ("newer version available"), and
 * one retired template with a replaced-by reference. Idempotent and safe on every boot.
 */
function ensureCatalogSeeded(store) {
  model.ensureBuiltInFormLibraryStore(store);
  const lib = store.builtInFormLibrary;
  if (lib.meta.starterSeeded === true && Object.keys(lib.templates).length) {
    return { seeded: false };
  }

  const result = importer.applyImportBatch(store, STARTER_TEMPLATES, { actorEmail: "system@littlelearnershubbyleah.com" });
  if (!result.ok) {
    throw Object.assign(new Error("Failed to seed built-in form library starter templates."), { errors: result.errors });
  }

  // Demonstrate "a newer template version is available" without touching org copies.
  const emergencyContact = templateByKey(store, "emergency-contact-form");
  if (emergencyContact) {
    const v1 = currentVersion(store, emergencyContact);
    importer.applyImportBatch(store, [{
      ...STARTER_TEMPLATES.find((t) => t.templateKey === "emergency-contact-form"),
      version: 2,
      changeSummary: "Added a physician field and emergency-instructions paragraph for faster reference during an emergency.",
      sections: STARTER_TEMPLATES.find((t) => t.templateKey === "emergency-contact-form").sections.map((section) => (
        section.id === "emergency_contact_1"
          ? { ...section, fields: [...section.fields, { id: "physician_reference", type: "smart_physician", label: "Physician / clinic" }] }
          : section
      )),
    }], { actorEmail: "system@littlelearnershubbyleah.com", allowNewVersion: true });
    void v1;
  }

  // Demonstrate a retired template with a replaced-by reference. Existing org copies
  // sourced from a retired template must keep working — never break them.
  const policyChange = templateByKey(store, "policy-change-acknowledgment");
  const handbookAck = templateByKey(store, "parent-handbook-acknowledgment");
  if (policyChange && handbookAck) {
    policyChange.status = model.TEMPLATE_STATUSES.RETIRED;
    policyChange.retiredAt = model.nowIso();
    policyChange.replacedByTemplateId = handbookAck.id;
    store.builtInFormLibrary.templates[policyChange.id] = policyChange;
  }

  lib.meta.starterSeeded = true;
  lib.meta.updatedAt = model.nowIso();
  return { seeded: true, applied: result.applied.length };
}

function ensureRoleFixtureMemberships(store, organization) {
  foundation.ensureFoundationStore(store);
  const existing = listValues(store.staffMemberships).filter((member) => member.organizationId === organization.id);
  let owner = existing.find((member) => member.role === orgPermissions.ORG_ROLES.DIRECTOR_OWNER);
  if (!owner) {
    owner = foundation.createStaffMembershipRecord({
      organizationId: organization.id,
      userEmail: organization.ownerEmail,
      displayName: "Preview Owner",
      role: orgPermissions.ORG_ROLES.DIRECTOR_OWNER,
    });
    store.staffMemberships[owner.id] = owner;
  }
  let teacher = existing.find((member) => member.role === orgPermissions.ORG_ROLES.LEAD_TEACHER && member.displayName === "Preview Lead Teacher");
  if (!teacher) {
    teacher = foundation.createStaffMembershipRecord({
      organizationId: organization.id,
      userEmail: "forms.preview.teacher@example.test",
      displayName: "Preview Lead Teacher",
      role: orgPermissions.ORG_ROLES.LEAD_TEACHER,
    });
    store.staffMemberships[teacher.id] = teacher;
  }
  let assistant = existing.find((member) => member.role === orgPermissions.ORG_ROLES.ASSISTANT_STAFF && member.displayName === "Preview Assistant");
  if (!assistant) {
    assistant = foundation.createStaffMembershipRecord({
      organizationId: organization.id,
      userEmail: "forms.preview.assistant@example.test",
      displayName: "Preview Assistant",
      role: orgPermissions.ORG_ROLES.ASSISTANT_STAFF,
    });
    store.staffMemberships[assistant.id] = assistant;
  }

  // Director-granted form-library overrides for teacher/assistant preview roles.
  // Teacher may browse and create draft copies; assistant is view-only (browse only).
  store.builtInFormLibrary.staffLibraryPermissions = store.builtInFormLibrary.staffLibraryPermissions || {};
  store.builtInFormLibrary.staffLibraryPermissions[teacher.id] = { canBrowse: true, canCreateDraftCopy: true, grantedBy: "director_preview" };
  store.builtInFormLibrary.staffLibraryPermissions[assistant.id] = { canBrowse: true, canCreateDraftCopy: false, grantedBy: "director_preview" };

  return { owner, teacher, assistant };
}

function recordPreview(store, organizationId, actorEmail, template) {
  const id = model.newId("bftrecent");
  store.builtInFormLibrary.recentPreviews[id] = {
    id,
    organizationId,
    actorEmail: String(actorEmail || "").trim().toLowerCase(),
    templateId: template.id,
    templateKey: template.templateKey,
    templateTitle: template.title,
    createdAt: model.nowIso(),
  };
  template.previewCount = (Number(template.previewCount) || 0) + 1;
}

function toggleFavoriteInternal(store, organizationId, actorEmail, template, favorited) {
  const key = `${organizationId}:${String(actorEmail || "").trim().toLowerCase()}:${template.id}`;
  if (favorited) {
    store.builtInFormLibrary.favorites[key] = {
      organizationId,
      actorEmail: String(actorEmail || "").trim().toLowerCase(),
      templateId: template.id,
      createdAt: model.nowIso(),
    };
    template.favoriteCount = (Number(template.favoriteCount) || 0) + 1;
  } else if (store.builtInFormLibrary.favorites[key]) {
    delete store.builtInFormLibrary.favorites[key];
    template.favoriteCount = Math.max(0, (Number(template.favoriteCount) || 1) - 1);
  }
}

/**
 * Seed an organization-scoped preview scenario: several org-owned copies, favorites,
 * and recently previewed/copied history for the given admin's preview organization.
 * Never touches the global template catalog beyond read access.
 */
function seedLibraryPreview(store, { adminEmail = "forms.preview@example.test", organizationId = "" } = {}) {
  model.ensureBuiltInFormLibraryStore(store);
  ensureCatalogSeeded(store);
  const organization = formsFixtures.ensurePreviewOrganization(store, { adminEmail, organizationId });
  const actorEmail = String(adminEmail || "").trim().toLowerCase() || organization.ownerEmail;
  const roles = ensureRoleFixtureMemberships(store, organization);

  const copyKeys = [
    "child-enrollment-form",
    "emergency-contact-form",
    "photo-media-permission-form",
    "field-trip-permission-form",
  ];
  const createdCopies = [];
  copyKeys.forEach((key) => {
    const template = templateByKey(store, key);
    if (!template) return;
    const alreadyCopied = listValues(store.formsCenter?.forms || {}).some((form) => (
      form.organizationId === organization.id && form.sourceTemplateId === template.id
    ));
    if (alreadyCopied) return;
    // Emergency Contact copy intentionally sourced from version 1 before the v2
    // update, to demonstrate "a newer template version is available".
    const versionToUse = key === "emergency-contact-form"
      ? listValues(store.builtInFormLibrary.versions).find((version) => version.templateId === template.id && version.versionNumber === 1)
      : currentVersion(store, template);
    if (!versionToUse) return;
    const created = createOrganizationCopyFromTemplate(store, {
      template,
      version: versionToUse,
      organizationId: organization.id,
      actorEmail,
      actorMembershipId: roles.owner.id,
    });
    createdCopies.push(created.form);
  });

  // Preserve one org copy sourced from the now-retired "Policy Change Acknowledgment"
  // template to prove retirement never breaks an existing organization form.
  const retiredTemplate = templateByKey(store, "policy-change-acknowledgment");
  if (retiredTemplate) {
    const alreadyCopied = listValues(store.formsCenter?.forms || {}).some((form) => (
      form.organizationId === organization.id && form.sourceTemplateId === retiredTemplate.id
    ));
    if (!alreadyCopied) {
      const retiredVersion = listValues(store.builtInFormLibrary.versions).find((version) => version.templateId === retiredTemplate.id);
      if (retiredVersion) {
        const created = createOrganizationCopyFromTemplate(store, {
          template: retiredTemplate,
          version: retiredVersion,
          organizationId: organization.id,
          actorEmail,
          actorMembershipId: roles.owner.id,
        });
        createdCopies.push(created.form);
      }
    }
  }

  const favoriteKeys = ["emergency-contact-form", "photo-media-permission-form", "incident-injury-report"];
  favoriteKeys.forEach((key) => {
    const template = templateByKey(store, key);
    if (template) toggleFavoriteInternal(store, organization.id, actorEmail, template, true);
  });

  const previewKeys = ["medical-allergy-information-form", "tuition-payment-agreement", "developmental-progress-summary", "safe-sleep-agreement"];
  previewKeys.forEach((key) => {
    const template = templateByKey(store, key);
    if (template) recordPreview(store, organization.id, actorEmail, template);
  });

  store.builtInFormLibraryPreview = {
    seededAt: model.nowIso(),
    adminEmail: actorEmail,
    emailSent: false,
    stripeTouched: false,
    aiTouched: false,
    responseCollection: false,
  };

  return {
    ok: true,
    organizationId: organization.id,
    copiesCreated: createdCopies.length,
    templateCount: Object.keys(store.builtInFormLibrary.templates).length,
    roles: {
      ownerMembershipId: roles.owner.id,
      teacherMembershipId: roles.teacher.id,
      assistantMembershipId: roles.assistant.id,
    },
  };
}

module.exports = {
  templateByKey,
  currentVersion,
  ensureCatalogSeeded,
  ensureRoleFixtureMemberships,
  recordPreview,
  toggleFavoriteInternal,
  seedLibraryPreview,
};
