/** @implements {import('@playwright/test/reporter').Reporter} */
class FailureDetailReporter {
  onTestEnd(test, result) {
    if (result.status === "passed" || result.status === "skipped") return;
    const errors = result.errors.map((e) => e.message).join("\n");
    console.error("\n--- E2E FAILURE ---");
    console.error(`Test: ${test.title}`);
    console.error(`Project: ${test.parent.project()?.name || "unknown"}`);
    console.error(`Status: ${result.status}`);
    console.error(`Error: ${errors}`);
    console.error("Artifacts: screenshot, trace, and failure-details attachment in HTML report");
    console.error("-------------------\n");
  }
}

module.exports = FailureDetailReporter;
