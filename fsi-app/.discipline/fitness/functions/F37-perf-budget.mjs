// F37: PERF BUDGET RATCHET. Lane PERF-ARCH, 2026-09-04, docs/decisions/ADR-027-*.md /
// docs/audits/perf-waterfall-2026-09-04.md. The operator's own words (2026-09-04, verbatim,
// docs/PROGRAM-BOARD.md's lane brief for this dispatch): "clicking into any item or any page
// takes WAY too long ... every click should show items on a page instantly." This is the
// mechanical CI-budget half of that dispatch's Part 2 item "the CI budget (F37: document decoded
// size per listing route, self.__next_f bytes, sequential DB hops per request ... with the
// numbers from the waterfall as the initial ratchet and the targets)".
//
// SAME REGISTRY SHAPE AS F17 (size-cap-doctrine): the registry itself
// (src/lib/perf/perf-budget.mjs's PERF_BUDGET_REGISTRY) is the source of truth, checked/classified
// there, not restated here. F37's job is narrow and mechanical:
//   1. every REQUIRED_ROUTES entry is present in the registry (a route silently dropped from
//      accountability is RED, the same "new/unregistered cap is RED" doctrine F17 enforces for
//      caps) — a route present with ZERO metrics is also RED (an empty entry is not tracking
//      anything);
//   2. every metric object in the registry is well-formed per perf-budget.mjs's own
//      isWellFormedMetric (a finite non-negative ratchet, a finite non-negative target no worse
//      than the ratchet, a real YYYY-MM-DD measuredAt, and an evidence string that starts
//      [CONFIRMED] or [HYPOTHESIS] per CLAUDE.md rule 14 — an unlabeled number is not a
//      measurement, it is a guess wearing a measurement's clothes).
// F37 does NOT and CANNOT diff against git history to catch a silent regression (a fitness
// function only ever sees the CURRENT file's content, the same constraint F17's own header
// states) — see perf-budget.mjs's module header for what that does and does not mean in practice.
//
// COST: filesystem only (one registry file), no network, no live measurement — this is a
// discipline/documentation gate, not the measurement itself. The measurement is
// docs/audits/perf-waterfall-2026-09-04.md; this gate just keeps that measurement's numbers
// present, dated, and honestly labeled in the codebase a future PR can regress against.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import {
  PERF_BUDGET_REGISTRY,
  REQUIRED_ROUTES,
  isWellFormedMetric,
} from '../../../src/lib/perf/perf-budget.mjs';

const REGISTRY_FILE = 'fsi-app/src/lib/perf/perf-budget.mjs';

/** Pure check logic, parameterized over the registry — split out so a test can exercise the
 *  missing-route / malformed-metric detection against a deliberately broken fixture object
 *  without needing to mutate the real (frozen) PERF_BUDGET_REGISTRY. check() below is a thin
 *  wrapper calling this with the real imported registry. */
export function checkRegistry(registry, requiredRoutes) {
  const out = [];

  for (const route of requiredRoutes) {
    const entry = registry[route];
    if (!entry) {
      out.push(
        violation(
          1,
          `REQUIRED_ROUTES lists "${route}" but PERF_BUDGET_REGISTRY has no entry for it — a ` +
            'route silently dropped from perf accountability. Add an entry with at least one ' +
            'dated, evidence-labeled metric, or remove it from REQUIRED_ROUTES with a stated reason.',
        ),
      );
      continue;
    }
    const metricNames = Object.keys(entry);
    if (metricNames.length === 0) {
      out.push(
        violation(1, `PERF_BUDGET_REGISTRY["${route}"] has no metrics — an empty entry tracks nothing.`),
      );
      continue;
    }
    for (const metricName of metricNames) {
      const metric = entry[metricName];
      if (!isWellFormedMetric(metric)) {
        out.push(
          violation(
            1,
            `PERF_BUDGET_REGISTRY["${route}"].${metricName} is not well-formed: needs a finite ` +
              'non-negative `ratchet`, a finite non-negative `target` <= ratchet, a `measuredAt` ' +
              'date (YYYY-MM-DD), and an `evidence` string starting [CONFIRMED] or [HYPOTHESIS] ' +
              `(CLAUDE.md rule 14). Got: ${JSON.stringify(metric)}`,
          ),
        );
      }
    }
  }

  return out;
}

export const fitnessFunction = {
  id: 'F37',
  name: 'perf-budget',
  description:
    'The perf-budget registry (src/lib/perf/perf-budget.mjs) must track every REQUIRED_ROUTES ' +
    'entry with at least one metric, and every metric must be well-formed: a finite ratchet, a ' +
    'target no worse than the ratchet, a real measuredAt date, and an evidence string labeled ' +
    '[CONFIRMED] or [HYPOTHESIS] (CLAUDE.md rule 14). Keeps the CI perf budget the operator asked ' +
    'for present, dated, and honest — see docs/decisions/ADR-027-*.md.',
  source: 'Lane PERF-ARCH, 2026-09-04, docs/audits/perf-waterfall-2026-09-04.md',

  enumerate() {
    return globFiles([REGISTRY_FILE]);
  },

  check(file) {
    if (file !== REGISTRY_FILE) return PASS;
    // A registry entry for a route NOT in REQUIRED_ROUTES is fine (a lane may track more than the
    // floor) — no violation for that direction; the floor is "at least these three", not "exactly".
    const out = checkRegistry(PERF_BUDGET_REGISTRY, REQUIRED_ROUTES);
    return out.length > 0 ? out : PASS;
  },
};
