// index.mjs — the COMMUNITY-A / COMMUNITY-B interface contract (Wave 3 lane plan,
// docs/plans/wave3-lanes-2026-09-03.md). Both lanes build to this file's exports; COMMUNITY-B imports it
// (or, where COMMUNITY-A's route is not yet present in that worktree, builds against this same shape via
// its own `src/components/community/api-client.ts` + fixtures). Re-exports only — every function is
// implemented, documented and unit-tested in its own module; this file adds no logic of its own so the
// contract surface stays exactly what the wave-3 plan named:
//
//   evaluateAntitrustGuard(post) -> { allowed, reason, aggregateRoute }
//   projectAuthorIdentity(profile) -> { orgType, role, sector, region, verified }
//   corroborationCount(thread) -> { organisations, posts }
//   promotionState(thread) -> { state, transitions[] }
//   evidenceAge(evidence, now) -> { ageDays, weight, chip }

export { evaluateAntitrustGuard, kAnonymity, dominanceCap, threeMonthLag, SENSITIVE_FIELDS } from "./antitrust.mjs";
export { projectAuthorIdentity, ORG_TYPES } from "./identity.mjs";
export { corroborationCount } from "./corroboration.mjs";
export { promotionState, buildTransition, originClassFor, PROMOTION_STATES } from "./promotion.mjs";
export { evidenceAge } from "./decay.mjs";
export { isAdmissibleInCalculation, isCitableAsFact, filterOperationsAdmissible, recordsNotCitableAsFact } from "./lineage-guard.mjs";
export { aggregateBenchmarkResponses, scopeBenchmarksForReader, isOpenForResponses } from "./benchmark.mjs";
