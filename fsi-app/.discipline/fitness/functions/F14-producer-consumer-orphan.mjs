// F14: producer-consumer orphan (the half-slice defect detector). Fails on any NEW write-orphan —
// a table the application writes but nothing reads — beyond the reason-bearing, phase-tagged
// terminal-sink allowlist, and on a stale allowlist entry. The analyzer + allowlist + first-run report
// live in ../../governance/producer-consumer-orphan.mjs (pure core, negative-testable). Source:
// remediation-discipline (the half-slice defect class; A2 producer-consumer orphan check).

import { violation } from '../lib/result.mjs';
import { runOrphanCheck } from '../../governance/producer-consumer-orphan.mjs';

export const fitnessFunction = {
  id: 'F14',
  name: 'producer-consumer-orphan',
  description:
    'No NEW write-orphan (a table app code writes but nothing reads) beyond the reason-bearing, phase-tagged terminal-sink allowlist; the allowlist must not go stale. The half-slice defect detector (A2).',
  source: 'remediation-discipline (half-slice defect class; A2 producer-consumer orphan check)',

  // Holistic: the whole producer-consumer graph is analysed once, not per-file. enumerate returns a
  // single sentinel so the runner invokes check() exactly once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F14-producer-consumer-orphan.mjs'];
  },

  check() {
    const r = runOrphanCheck();
    const violations = [];
    for (const o of r.gatingOrphans) {
      const w = o.writers[0];
      violations.push(
        violation(
          1,
          `WRITE-ORPHAN (half-slice): table "${o.table}" is written by app code but read by nothing — writer ${w.file}:${w.line}. ` +
            `Wire a reader, or allowlist it in producer-consumer-orphan.mjs TERMINAL_SINK_ALLOWLIST with a reason + reviewByPhase (a legitimate write-only audit sink).`,
        ),
      );
    }
    for (const issue of r.allowlistIssues) {
      violations.push(violation(1, `ALLOWLIST STALE: ${issue}`));
    }
    return violations;
  },
};
