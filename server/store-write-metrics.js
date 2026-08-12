/**
 * In-process metrics for full-store Postgres upserts (resets on restart).
 * Exposed via admin store-health for before/after comparisons.
 */

function createStoreWriteMetrics() {
  return {
    fullStoreWritesStarted: 0,
    fullStoreWritesSucceeded: 0,
    fullStoreWritesFailed: 0,
    debouncedScheduled: 0,
    debouncedFlushed: 0,
    debouncedCoalesced: 0,
    staleGenerationsSkipped: 0,
    identicalWritesSkipped: 0,
    dirtyDrains: 0,
    activeFullStoreWrites: 0,
    maxSimultaneousFullStoreWrites: 0,
    retryAttempts: 0,
    retrySuccesses: 0,
    lastWriteAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastPayloadBytes: 0,
    lastDurationMs: 0,
    maxDurationMs: 0,
    totalDurationMs: 0,
    totalPayloadBytes: 0,
    analyticsTableInserts: 0,
    analyticsFullStoreWritesAvoided: 0,
    ephemeralOnlyAttempts: 0,
  };
}

function recordWriteStart(metrics, payloadBytes) {
  metrics.fullStoreWritesStarted += 1;
  metrics.lastWriteAt = new Date().toISOString();
  metrics.lastPayloadBytes = payloadBytes;
  metrics.totalPayloadBytes += payloadBytes;
}

function recordWriteSuccess(metrics, durationMs) {
  metrics.fullStoreWritesSucceeded += 1;
  metrics.lastSuccessAt = new Date().toISOString();
  metrics.lastDurationMs = durationMs;
  metrics.totalDurationMs += durationMs;
  if (durationMs > metrics.maxDurationMs) metrics.maxDurationMs = durationMs;
}

function recordWriteFailure(metrics) {
  metrics.fullStoreWritesFailed += 1;
  metrics.lastFailureAt = new Date().toISOString();
}

function snapshot(metrics) {
  const succeeded = metrics.fullStoreWritesSucceeded || 0;
  return {
    ...metrics,
    averageDurationMs: succeeded
      ? Math.round(metrics.totalDurationMs / succeeded)
      : 0,
    averagePayloadBytes: succeeded
      ? Math.round(metrics.totalPayloadBytes / succeeded)
      : 0,
  };
}

module.exports = {
  createStoreWriteMetrics,
  recordWriteStart,
  recordWriteSuccess,
  recordWriteFailure,
  snapshot,
};
