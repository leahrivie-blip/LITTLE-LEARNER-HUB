/**
 * Test helper: when a suite enables customer Teaching Kit surfaces
 * (Viewer / Print / Attachments), also enable production-release approval
 * unless the caller explicitly sets teachingKitProductionReleaseApproved.
 *
 * Production safety still requires both gates; this only keeps existing
 * Teaching Kit QA suites focused on the surface under test.
 */
function withCustomerReleaseApproval(flags = {}) {
  const next = flags && typeof flags === "object" && !Array.isArray(flags) ? { ...flags } : {};
  const enablingCustomer = next.teachingKitViewer === true
    || next.teachingKitPrintCenter === true
    || next.teachingKitAttachments === true;
  if (enablingCustomer && next.teachingKitProductionReleaseApproved === undefined) {
    next.teachingKitProductionReleaseApproved = true;
  }
  return next;
}

module.exports = {
  withCustomerReleaseApproval,
};
