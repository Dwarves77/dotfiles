// data-audit: label=harness-family-schedule-walker hard=false
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING: docs/plans/data-machine-tool-gaps-2026-09-25.md build
 *  order step 3 ("harness-family schedule walker ... extends F50's 'every hop fires' pattern to every
 *  harness family"). Closes audit coverage gap 6 (docs/audits/supabase-integrity-and-wiring-audit-
 *  2026-09-25.md, finding PROD-2's own closing note): the prior pass covered only top-level `.github/
 *  workflows/*.yml` `cron:` declarations plus one sampled family; this walks EVERY registered harness
 *  family (family-registry.mjs's loadFamilies(), reused, no second copy of that scan) against its own
 *  run-artifact directory, and reports which families have NEVER left a dispatch artifact.
 *
 *  RULE 16 (CLAUDE.md): build mode holds the scrape cadence OFF; ADR-023 states every runtime fires by
 *  explicit dispatch, not a standing schedule. A zero-dispatch family is therefore the EXPECTED state for
 *  most families today (data-machine-tool-gaps-2026-09-25.md's own register lists most loop hops as
 *  "built-not-fired"), not a defect this audit is entitled to editorialize about. This script's output is
 *  strictly factual, which families have ever been dispatched, which have not, and each family's last run
 *  (if any), and NEVER recommends flipping the cadence gate. Read-only: filesystem read of committed
 *  family.json descriptors and run artifacts, no DB, no writes.
 *
 *  hard=false (soft/informational): a bare fact list about dispatch history is not itself a defect signal
 *  under build-mode rules; it exists so the coordinator has the "has X ever fired" answer on demand instead
 *  of a fresh manual grep every time (the exact gap PROD-2 named).
 *
 *  Exit 0 = every registered family has at least one dispatch artifact (net of allowlist) and the
 *  allowlist has no stale entries; exit 1 = at least one zero-dispatch family or stale entry (soft,
 *  reported, informational per rule 16, not gating while hard=false). This audit has no exit-2 case: it
 *  reads only committed files, no DB connection is needed. */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { loadFamilies, HARNESS_RUNS_DIR } from '../harness-runs/family-registry.mjs';
import { runArtifactNames, summarizeFamilyDispatchHistory, findZeroDispatchProducers, staleHarnessWalkAllowlistEntries } from './lib/harness-family-walk-scan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ALLOWLIST_PATH = resolve(ROOT, 'scripts/verify/harness-family-walk-allowlist.json');
function loadAllowlist() {
  try {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    const { _comment, ...entries } = raw;
    return entries;
  } catch (e) {
    console.error(`harness-family-schedule-walker-audit: failed to read allowlist ${ALLOWLIST_PATH}: ${e.message}`);
    return {};
  }
}

function readFamilyArtifacts(family) {
  const dir = join(HARNESS_RUNS_DIR, family);
  let entries = [];
  try { entries = readdirSync(dir); } catch { return []; }
  const names = runArtifactNames(family, entries);
  return names.map((name) => {
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { /* unparseable, counted as a parse failure */ }
    return { name, parsed };
  });
}

try {
  const families = loadFamilies();
  const summaries = families.map((f) => summarizeFamilyDispatchHistory(f.family, readFamilyArtifacts(f.family)));
  const allowlist = loadAllowlist();

  const zeroDispatch = findZeroDispatchProducers(summaries).filter((s) => !Object.prototype.hasOwnProperty.call(allowlist, s.family));
  const stale = staleHarnessWalkAllowlistEntries({ summaries, allowlist });

  console.log(
    `harness-family-schedule-walker-audit: ${summaries.length} registered harness families walked ` +
    `(scripts/harness-runs/*/family.json), ${summaries.filter((s) => s.everDispatched).length} with dispatch history, ` +
    `${summaries.length - summaries.filter((s) => s.everDispatched).length} zero-dispatch, ${Object.keys(allowlist).length} allowlisted.`,
  );

  console.log('\n--- dispatch history by family ---');
  for (const s of summaries) {
    if (s.everDispatched) {
      console.log(`  ${s.family}: ${s.runCount} run(s), last ${s.lastRunId} at ${s.lastStartedAt ?? '(no started_at)'} (trigger: ${s.lastTrigger ?? 'unrecorded'})`);
    } else {
      console.log(`  ${s.family}: 0 runs, NEVER DISPATCHED`);
    }
  }

  if (zeroDispatch.length === 0 && stale.length === 0) {
    console.log('\nPASS, every registered harness family has at least one recorded dispatch artifact (or is reasonably allowlisted); no stale allowlist entries.');
    process.exit(0);
  }

  if (zeroDispatch.length) {
    console.error(`\nZERO-DISPATCH PRODUCER(S) (informational, rule 16: expected under build-mode/ADR-023, not a defect), ${zeroDispatch.length} family(ies) with NO recorded dispatch artifact ever:`);
    for (const s of zeroDispatch) console.error(`  ${s.family}`);
    console.error('  This audit does not and will not recommend enabling a schedule, see rule 16. Disposition: track under the build order that names this family\'s proof run, or allowlist with a reason if the family is intentionally retired/pre-registration.');
  }
  if (stale.length) {
    console.error(`\nSTALE ALLOWLIST, ${stale.length} entry(ies) no longer applicable:`);
    for (const s of stale) console.error(`  ${s.family}, ${s.reason}`);
  }
  process.exit(1);
} catch (e) {
  console.error(`harness-family-schedule-walker-audit: engine error, ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
