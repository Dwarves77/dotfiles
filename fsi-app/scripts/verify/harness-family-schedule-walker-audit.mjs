// data-audit: label=harness-family-schedule-walker hard=false
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING: docs/plans/data-machine-tool-gaps-2026-09-25.md build
 *  order step 3 ("harness-family schedule walker ... extends F50's 'every hop fires' pattern to every
 *  harness family"). Closes audit coverage gap 6 (docs/audits/supabase-integrity-and-wiring-audit-
 *  2026-09-25.md, finding PROD-2's own closing note): the prior pass covered only top-level `.github/
 *  workflows/*.yml` `cron:` declarations plus one sampled family; this walks EVERY registered harness
 *  family (family-registry.mjs's loadFamilies(), reused, no second copy of that scan) against its own
 *  run-artifact directory, and reports which families have NO recorded dispatch artifact (see the
 *  precise-claim note below, this is not the same claim as never dispatched).
 *
 *  RULE 16 (CLAUDE.md): build mode holds the scrape cadence OFF; ADR-023 states every runtime fires by
 *  explicit dispatch, not a standing schedule. A zero-dispatch family is therefore the EXPECTED state for
 *  most families today (data-machine-tool-gaps-2026-09-25.md's own register lists most loop hops as
 *  "built-not-fired"), not a defect this audit is entitled to editorialize about. Read-only: filesystem
 *  read of committed family.json descriptors and run artifacts, no DB, no writes.
 *
 *  PRECISE CLAIM, CORRECTED 2026-09-25 (coordinator cross-check on PR #810, rule 14/B4): this audit's ONLY
 *  evidence source is the `<family>-run-NNN.json` / `producers-run-NNN.json` harness-run artifact
 *  convention. Its finding is "no harness artifact was ever recorded for this family/producer", NOT "this
 *  family/producer was never dispatched" -- those are different claims. A live cross-check against
 *  `market_series` (rows under `ecb-fx:*`, `eu-oil-bulletin:*`, `eia-v2:*` prefixes, 8/12/2727 rows
 *  respectively, timestamps 2026-08-30 through 2026-09-16) and `emission_factors` (desnz/epa rows,
 *  2026-08-30/09-03) PROVED those producers WERE dispatched, repeatedly, via real `workflow_dispatch` runs
 *  of `.github/workflows/producers.yml` ("Data producers", `gh run list` shows runs from 2026-08-30
 *  onward) -- they simply predate the `producers` harness family's own registration (2026-09-20, lane
 *  M9d) and its `emit-producers-artifact.mjs` step, so no artifact exists for any of them even though the
 *  workflow ran. GitHub Actions run history is therefore a REAL, separate dispatch-evidence source this
 *  audit does not read (no `gh` credentials assumed in this SELECT-only, no-network lane; adding it is a
 *  follow-up, not done here). This audit's output is therefore always phrased "NO HARNESS ARTIFACT
 *  RECORDED", never "NEVER DISPATCHED", and this header states the distinction so a reader of the code
 *  gets the same correction the session-log addendum gives a reader of the report.
 *
 *  hard=false (soft/informational): a bare fact list about dispatch history is not itself a defect signal
 *  under build-mode rules; it exists so the coordinator has the "has X ever fired" answer on demand instead
 *  of a fresh manual grep every time (the exact gap PROD-2 named).
 *
 *  PER-PRODUCER SUB-WALK (coordinator ruling, 2026-09-25, PR #810): the "producers" family is one workflow
 *  firing that runs up to 11 independent producer scripts, each a distinct dispatch unit with its own
 *  history (rule 17). This audit additionally walks the producer roster (every `const PRODUCER_NAME = "..."`
 *  declaration under src/+scripts/, extractProducerRoster) against every `producers-run-NNN.json`
 *  artifact's `per_item[].id`, and reports which INDIVIDUAL producers have never fired, distinct from the
 *  family-grain "has producers.yml ever run at all" question above.
 *
 *  Exit 0 = every registered family has at least one dispatch artifact (net of allowlist), every
 *  individual producer has fired at least once, and the allowlist has no stale entries; exit 1 = at least
 *  one zero-dispatch family, never-dispatched producer, or stale entry (soft, reported, informational per
 *  rule 16, not gating while hard=false). This audit has no exit-2 case: it reads only committed files, no
 *  DB connection is needed. */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { loadFamilies, HARNESS_RUNS_DIR } from '../harness-runs/family-registry.mjs';
import { walkFiles } from '../lib/walk-files.mjs';
import {
  runArtifactNames,
  summarizeFamilyDispatchHistory,
  findZeroDispatchProducers,
  extractProducerRoster,
  summarizeProducerDispatchHistory,
  findNeverDispatchedIndividualProducers,
  staleHarnessWalkAllowlistEntries,
} from './lib/harness-family-walk-scan.mjs';

const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SKIP_DIR = new Set(['node_modules', '.next', '_snapshots', 'tmp', 'dist', '.git', 'harness-runs']);

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

  // PER-PRODUCER SUB-WALK (producers family only, coordinator ruling above).
  const codeFiles = [];
  for (const d of ['src', 'scripts']) walkFiles(join(ROOT, d), CODE_EXT, SKIP_DIR, codeFiles);
  const corpusFiles = codeFiles.map((f) => {
    let content = '';
    try { content = readFileSync(f, 'utf8'); } catch { /* skip */ }
    return { file: f.slice(ROOT.length + 1), content };
  });
  const roster = extractProducerRoster(corpusFiles);
  const producersArtifacts = readFamilyArtifacts('producers');
  const producerSummaries = roster.map((r) => summarizeProducerDispatchHistory(r.producer, producersArtifacts));
  const neverDispatchedProducers = findNeverDispatchedIndividualProducers(producerSummaries)
    .filter((s) => !Object.prototype.hasOwnProperty.call(allowlist, `producers:${s.producer}`));

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
      console.log(`  ${s.family}: 0 runs, NO HARNESS ARTIFACT RECORDED (not proof of never-dispatched -- see header note)`);
    }
  }

  console.log(`\n--- producers family: per-producer sub-walk (${roster.length} producer(s) in roster, mechanically derived from PRODUCER_NAME declarations) ---`);
  for (const s of producerSummaries) {
    if (s.everDispatched) {
      console.log(`  ${s.producer}: ${s.runCount} run(s), last ${s.lastRunId} (outcome: ${s.lastOutcome ?? 'unrecorded'})`);
    } else {
      console.log(`  ${s.producer}: 0 runs, NO HARNESS ARTIFACT RECORDED (not proof of never-dispatched -- see header note)`);
    }
  }

  if (zeroDispatch.length === 0 && neverDispatchedProducers.length === 0 && stale.length === 0) {
    console.log('\nPASS, every registered harness family and every individual producer has at least one recorded dispatch artifact (or is reasonably allowlisted); no stale allowlist entries.');
    process.exit(0);
  }

  if (zeroDispatch.length) {
    console.error(`\nNO HARNESS ARTIFACT RECORDED (informational, rule 16: expected under build-mode/ADR-023, and NOT proof of never-dispatched, see header note), ${zeroDispatch.length} family(ies) with zero dispatch artifacts ever:`);
    for (const s of zeroDispatch) console.error(`  ${s.family}`);
    console.error('  This audit does not and will not recommend enabling a schedule, see rule 16. Disposition: track under the build order that names this family\'s proof run, or allowlist with a reason if the family is intentionally retired/pre-registration.');
  }
  if (neverDispatchedProducers.length) {
    console.error(`\nNO HARNESS ARTIFACT RECORDED, INDIVIDUAL PRODUCER(S) (informational, rule 16, same posture as above, NOT proof of never-dispatched), ${neverDispatchedProducers.length} producer(s) with NO per_item entry in any producers-run-NNN.json ever:`);
    for (const s of neverDispatchedProducers) console.error(`  ${s.producer}`);
    console.error('  This audit does not and will not recommend enabling a schedule, see rule 16. A producer can show no recorded artifact even while it was dispatched via workflow_dispatch before the producers family/artifact convention existed (2026-09-20) -- cross-check the data the producer writes (market_series, emission_factors, regional_data_facts) and `gh run list --workflow=producers.yml` before treating this as never-dispatched.');
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
