// The perf-budget REGISTRY (lane PERF-ARCH, 2026-09-04) — the same registry-of-classified-
// constants shape F17's CAP_REGISTRY already established (fsi-app/.discipline/fitness/functions/
// F17-size-cap-doctrine.mjs), applied to the CI perf budget the dispatch asked for: "document
// decoded size per listing route, self.__next_f bytes, sequential DB hops per request... with the
// numbers from the waterfall as the initial ratchet and the targets."
//
// Plain .mjs (not .ts): F37 (fsi-app/.discipline/fitness/functions/F37-perf-budget.mjs) imports
// this directly under the fitness runner's plain `node` process — no tsc/bundler step, matching
// F17/every other fitness-function registry's own file type.
//
// TWO NUMBERS PER METRIC, NOT ONE — stated honestly, not asserted as already met:
//   - `ratchet`: the CURRENT measured ceiling. A future re-measurement may LOWER it (real
//     improvement) but F37 fails if a re-measurement RAISES it without also raising `evidence`'s
//     date and citation — i.e. a regression must be seen and cited, never silently absorbed by
//     bumping the number up to match. F37 cannot itself diff against git history (a fitness
//     function only sees the current file's content, per F17's own established design) — the
//     enforced invariant is honesty of the CURRENT snapshot (present, dated, evidence-labeled,
//     internally consistent), not an automatic historical ratchet. A real regression still shows
//     up: the very next re-measurement either matches this file (nothing to do) or the lane that
//     ran it must edit `ratchet` here WITH a new dated citation — silently letting the number drift
//     with no citation update is what F37 actually catches (see F37's own check()).
//   - `target`: the operator's stated goal for this metric (docs/decisions/ADR-027-*.md §"CI
//     budget"), enforced to be <= ratchet (a target can only ask for equal-or-better than today,
//     never encode giving up ground) but NOT itself gated on being met yet — the whole point of a
//     ratchet is that `ratchet` starts above `target` and closes over time, one lane at a time.
//
// UNITS: documentBytes / nextFBytes in bytes (UTF-8 decoded document size / the `self.__next_f`
// RSC payload embed, per the dispatch's own phase list); sequentialDbHops as an integer count;
// warmRscMs / coldRscMs / dclMs in milliseconds.
//
// SOURCE OF THE INITIAL NUMBERS: docs/audits/perf-waterfall-2026-09-04.md (this lane's own
// measurement pass) and, where this lane's own container could not re-run a live browser
// measurement, docs/audits/perf-load-times-2026-09-03.md's own [CONFIRMED] figures, carried
// forward with their original citation and NOT re-labeled [CONFIRMED] by this file — see each
// entry's own `evidence` string for its real status.

export const REQUIRED_ROUTES = Object.freeze([
  "regulations-list",
  "regulations-detail",
  "workspace-bootstrap",
]);

export const PERF_BUDGET_REGISTRY = Object.freeze({
  "regulations-list": {
    documentBytes: {
      ratchet: 886_000,
      target: 200_000,
      measuredAt: "2026-09-03",
      evidence:
        '[CONFIRMED] docs/audits/perf-load-times-2026-09-03.md: "/regulations 886 KB decoded" ' +
        '(the operator\'s own pre-lane figure, carried forward — this lane\'s container has no ' +
        'live browser to re-measure decoded document bytes; PERF-11 owns the listing-payload trim ' +
        'this number tracks).',
    },
    nextFBytes: {
      ratchet: 401_000,
      target: 100_000,
      measuredAt: "2026-09-03",
      evidence:
        '[CONFIRMED] operator-supplied pre-lane figure: "401 KB of self.__next_f" for the same ' +
        '/regulations decoded-document measurement above — the RSC payload embed specifically, ' +
        'not the whole document. Same re-measurement caveat as documentBytes.',
    },
    sequentialDbHops: {
      ratchet: 2,
      target: 1,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by reading] src/lib/data.ts's getListingsOnly (line ~278-307): " +
        "resolveOrgIdFromCookies() THEN cachedListingsOnly(orgId, page) — two round trips that " +
        "cannot run in Promise.all because the listing RPC is org-parameterized (needs orgId as " +
        "an argument). ADR-027 names the org-independent-RPC-plus-client-merge migration that " +
        "would collapse this to 1 as PERF-10/PERF-11 follow-up work, not done this lane.",
    },
  },
  "regulations-detail": {
    coldRscMs: {
      ratchet: 1_257,
      target: 300,
      measuredAt: "2026-09-03",
      evidence:
        '[CONFIRMED] docs/audits/perf-load-times-2026-09-03.md §7.2/§9.1: worst pre-PERF-2 cold ' +
        "server [perf] figure for a regulations detail click (g14 Mexico SEMARNAT) was 1257ms; " +
        "post-PERF-2 it measured 609-679ms (§9.1). This ratchet is deliberately the WORSE " +
        "(pre-fix) figure, not the best post-fix sample, because this lane's container could not " +
        "re-run a live click-through to confirm the improved figure holds under today's build — " +
        "see docs/audits/perf-waterfall-2026-09-04.md Part 1 for why re-measurement was not " +
        "possible from this container, and the honesty rule this registry's own header states.",
    },
    warmRscMs: {
      ratchet: 1_257,
      target: 300,
      measuredAt: "2026-09-03",
      evidence:
        "[CONFIRMED] docs/audits/perf-load-times-2026-09-03.md §9.5: \"Warm ... server times are " +
        'NOT meaningfully lower than cold on any surface\" — every RSC request, cold or warm, is ' +
        "cache=MISS under Cache-Control: private (ADR-026's own finding, §context point 2: the " +
        "per-viewer override read cannot be made static without a migration). warmRscMs therefore " +
        "carries the SAME ratchet as coldRscMs today, honestly, rather than a lower number this " +
        "lane has no evidence for.",
    },
    sequentialDbHops: {
      ratchet: 1,
      target: 1,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by reading] src/lib/detail/load-detail-core.ts's loadDetailCore (line " +
        "~241-298): fetchItem, then Promise.all([fetchSections, runItemScoped, runViewerScoped]) " +
        "— ONE sequential hop (the admission-guard fetchItem) ahead of one parallel bundle, " +
        "already collapsed by PERF/PERF-2/PERF-6/PERF-7/PERF-9 (see docs/audits/perf-load-times-" +
        "2026-09-03.md §8/§12/§13, ADR-026). target === ratchet: this metric is already at goal " +
        "for the round-trip-count axis specifically — the remaining gap on this route is latency " +
        "per hop (coldRscMs/warmRscMs above), not hop count.",
    },
  },
  "workspace-bootstrap": {
    sequentialDbHops: {
      ratchet: 1,
      target: 1,
      measuredAt: "2026-09-04",
      evidence:
        "[CONFIRMED, by reading] src/app/api/workspace/bootstrap/route.ts (this lane's own wired " +
        "example): requireAuth, then ONE Promise.all([loadPersonalState, loadListOrders, " +
        "loadMembers, loadAdminAttention]) — already the PERF-9/ADR-026 §3 batched shape (\"never " +
        "more than one round trip per screen\" collapsed to auth + one parallel bundle). At goal.",
    },
  },
});

/** Every metric object's shape check, shared by F37 and by this module's own selftest. Pure. */
export function isWellFormedMetric(metric) {
  if (!metric || typeof metric !== "object") return false;
  const { ratchet, target, measuredAt, evidence } = metric;
  if (typeof ratchet !== "number" || !Number.isFinite(ratchet) || ratchet < 0) return false;
  if (typeof target !== "number" || !Number.isFinite(target) || target < 0) return false;
  if (target > ratchet) return false; // a target may only ask for equal-or-better than today
  if (typeof measuredAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) return false;
  if (typeof evidence !== "string" || evidence.length < 10) return false;
  // CLAUDE.md rule 14: [CONFIRMED]/[HYPOTHESIS], allowing the repo's own established
  // "[CONFIRMED, by reading]" / "[CONFIRMED, node --test]" qualified form (see
  // docs/audits/perf-load-times-2026-09-03.md's own usage throughout), not only the bare token.
  if (!/^\[(CONFIRMED|HYPOTHESIS)[^\]]*\]/.test(evidence)) return false;
  return true;
}
