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
 *  TWO EVIDENCE SOURCES, CORRECTED 2026-09-25 (coordinator cross-check on PR #810, rule 14/B4, then rule 13
 *  "no flagged-as-follow-up, the credential exists locally, add it now"): the harness-run artifact
 *  convention (`<family>-run-NNN.json`) is NOT the only proof a workflow fired. A live cross-check against
 *  `market_series` (rows under `ecb-fx:*`, `eu-oil-bulletin:*`, `eia-v2:*` prefixes, 8/12/2727 rows,
 *  timestamps 2026-08-30 through 2026-09-16) and `emission_factors` (desnz/epa rows, 2026-08-30/09-03)
 *  PROVED several `producers` scripts WERE dispatched, repeatedly, via real `workflow_dispatch` runs of
 *  `.github/workflows/producers.yml` ("Data producers") that PREDATE the `producers` harness family's own
 *  registration (2026-09-20, lane M9d) and its `emit-producers-artifact.mjs` step -- the workflow ran, no
 *  artifact was ever written for those runs. So this audit now queries a SECOND evidence source, GitHub
 *  Actions' own run history (`gh run list --workflow <file> --json databaseId,event,conclusion,createdAt`),
 *  per family/producer, via `resolveWorkflowFileForFamily`/`classifyDispatchEvidence`
 *  (lib/harness-family-walk-scan.mjs). It self-skips (never crashes, never asserts a false "no dispatch")
 *  when `gh` is not on PATH, not authenticated, or no workflow mapping resolves for a family -- see
 *  `queryWorkflowRunHistory` below. Every finding therefore carries one of four verdicts:
 *  ARTIFACT_RECORDED / WORKFLOW_RUN_HISTORY_ONLY / NO_EVIDENCE_FOUND / EVIDENCE_UNAVAILABLE, never a bare
 *  "never dispatched" claim.
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
import { spawnSync } from 'node:child_process';
import { loadFamilies, HARNESS_RUNS_DIR } from '../harness-runs/family-registry.mjs';
import { walkFiles } from '../lib/walk-files.mjs';
import {
  runArtifactNames,
  summarizeFamilyDispatchHistory,
  findZeroDispatchProducers,
  extractProducerRoster,
  summarizeProducerDispatchHistory,
  findNeverDispatchedIndividualProducers,
  resolveWorkflowFileForFamily,
  parseGhRunListJson,
  summarizeWorkflowRunHistory,
  classifyDispatchEvidence,
  staleHarnessWalkAllowlistEntries,
} from './lib/harness-family-walk-scan.mjs';

const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SKIP_DIR = new Set(['node_modules', '.next', '_snapshots', 'tmp', 'dist', '.git', 'harness-runs']);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // fsi-app root
const REPO_ROOT = resolve(ROOT, '..'); // dotfiles repo root -- .github/workflows and `gh` both live here

// WORKFLOW-RUN-HISTORY EVIDENCE SOURCE. `gh`'s own availability is checked ONCE (not once per family);
// every family's `gh run list` call is memoized by workflow file so `producers.yml` (queried once for the
// family, again implicitly for all 11 producers) only ever shells out a single time.
let ghAvailability = null;
function checkGhAvailable() {
  if (ghAvailability !== null) return ghAvailability;
  const r = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  ghAvailability = !r.error && r.status === 0
    ? { available: true }
    : { available: false, reason: r.error ? `gh CLI not found on PATH (${r.error.code ?? r.error.message})` : `gh --version exited ${r.status}` };
  return ghAvailability;
}

const workflowRunHistoryCache = new Map();
/** @returns {{available:true, everRun:boolean, runCount:number, lastRunAt:string|null, workflowFile:string} | {available:false, reason:string}} */
function queryWorkflowRunHistory(workflowFile) {
  if (workflowRunHistoryCache.has(workflowFile)) return workflowRunHistoryCache.get(workflowFile);
  const gh = checkGhAvailable();
  if (!gh.available) {
    const result = { available: false, reason: gh.reason };
    workflowRunHistoryCache.set(workflowFile, result);
    return result;
  }
  const res = spawnSync(
    'gh', ['run', 'list', '--workflow', workflowFile, '--json', 'databaseId,event,conclusion,createdAt', '--limit', '100'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  let result;
  if (res.error) {
    result = { available: false, reason: `gh run list failed to spawn: ${res.error.message}` };
  } else if (res.status !== 0) {
    result = { available: false, reason: `gh run list exited ${res.status}: ${(res.stderr || '').trim().slice(0, 200) || '(no stderr)'}` };
  } else {
    try {
      const runs = parseGhRunListJson(res.stdout);
      const summary = summarizeWorkflowRunHistory(workflowFile, runs);
      result = { available: true, ...summary };
    } catch (e) {
      result = { available: false, reason: `gh run list output unparseable: ${e.message}` };
    }
  }
  workflowRunHistoryCache.set(workflowFile, result);
  return result;
}

function loadAvailableWorkflowBasenames() {
  try {
    return new Set(readdirSync(resolve(REPO_ROOT, '.github/workflows')).filter((f) => f.endsWith('.yml')));
  } catch {
    return new Set();
  }
}

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
  const availableWorkflowBasenames = loadAvailableWorkflowBasenames();

  // Resolve + classify: family-grain. workflowFileByFamily is kept for the producers sub-walk below
  // (the workflow evidence for `producers` is reused there, one query, per the caching header note).
  const workflowFileByFamily = new Map();
  const familyEvidence = families.map((descriptor, i) => {
    const workflowFile = resolveWorkflowFileForFamily(descriptor, availableWorkflowBasenames);
    workflowFileByFamily.set(descriptor.family, workflowFile);
    const workflowEvidence = workflowFile
      ? queryWorkflowRunHistory(workflowFile)
      : { available: false, reason: `no known .github/workflows/*.yml mapping for family "${descriptor.family}"` };
    return classifyDispatchEvidence({ artifactEverDispatched: summaries[i].everDispatched, workflowEvidence });
  });

  const zeroDispatch = summaries
    .map((s, i) => ({ s, classification: familyEvidence[i] }))
    .filter(({ s, classification }) => !s.everDispatched && classification.verdict !== 'ARTIFACT_RECORDED')
    .filter(({ s }) => !Object.prototype.hasOwnProperty.call(allowlist, s.family));
  const stale = staleHarnessWalkAllowlistEntries({ summaries, allowlist });

  // PER-PRODUCER SUB-WALK (producers family only, coordinator ruling above). Workflow-level evidence
  // (producers.yml has run N times) is REUSED for every producer, since gh run list has no step-level
  // granularity, this is stated explicitly in the printed caveat, never silently attributed per-producer.
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
  const producersWorkflowFile = workflowFileByFamily.get('producers') ?? null;
  const producersWorkflowEvidence = producersWorkflowFile
    ? queryWorkflowRunHistory(producersWorkflowFile)
    : { available: false, reason: 'no known .github/workflows/*.yml mapping for family "producers"' };
  const producerEvidence = producerSummaries.map((s) =>
    classifyDispatchEvidence({ artifactEverDispatched: s.everDispatched, workflowEvidence: producersWorkflowEvidence }));

  const neverDispatchedProducers = producerSummaries
    .map((s, i) => ({ s, classification: producerEvidence[i] }))
    .filter(({ s, classification }) => !s.everDispatched && classification.verdict !== 'ARTIFACT_RECORDED')
    .filter(({ s }) => !Object.prototype.hasOwnProperty.call(allowlist, `producers:${s.producer}`));

  console.log(
    `harness-family-schedule-walker-audit: ${summaries.length} registered harness families walked ` +
    `(scripts/harness-runs/*/family.json), ${summaries.filter((s) => s.everDispatched).length} with a harness artifact, ` +
    `${familyEvidence.filter((c) => c.verdict === 'WORKFLOW_RUN_HISTORY_ONLY').length} dispatched via GitHub Actions run history only (no artifact), ` +
    `${familyEvidence.filter((c) => c.verdict === 'NO_EVIDENCE_FOUND').length} with no evidence found either way, ` +
    `${familyEvidence.filter((c) => c.verdict === 'EVIDENCE_UNAVAILABLE').length} with workflow evidence unavailable, ` +
    `${Object.keys(allowlist).length} allowlisted.`,
  );

  console.log('\n--- dispatch history by family (harness artifact + GitHub Actions run history) ---');
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const c = familyEvidence[i];
    if (s.everDispatched) {
      console.log(`  ${s.family}: ${s.runCount} run(s), last ${s.lastRunId} at ${s.lastStartedAt ?? '(no started_at)'} (trigger: ${s.lastTrigger ?? 'unrecorded'})`);
    } else {
      console.log(`  ${s.family}: 0 harness artifacts, ${c.verdict} (${c.detail})`);
    }
  }

  console.log(`\n--- producers family: per-producer sub-walk (${roster.length} producer(s) in roster, mechanically derived from PRODUCER_NAME declarations; workflow-level evidence is SHARED across all producers, no step-level attribution possible from gh run list) ---`);
  for (let i = 0; i < producerSummaries.length; i++) {
    const s = producerSummaries[i];
    const c = producerEvidence[i];
    if (s.everDispatched) {
      console.log(`  ${s.producer}: ${s.runCount} run(s), last ${s.lastRunId} (outcome: ${s.lastOutcome ?? 'unrecorded'})`);
    } else {
      console.log(`  ${s.producer}: 0 harness artifacts, ${c.verdict} (${c.detail})`);
    }
  }

  if (zeroDispatch.length === 0 && neverDispatchedProducers.length === 0 && stale.length === 0) {
    console.log('\nPASS, every registered harness family and every individual producer has at least one recorded dispatch artifact (or is reasonably allowlisted); no stale allowlist entries.');
    process.exit(0);
  }

  if (zeroDispatch.length) {
    console.error(`\nNO HARNESS ARTIFACT (informational, rule 16: expected under build-mode/ADR-023), ${zeroDispatch.length} family(ies), classified per the workflow-run-history cross-check:`);
    for (const { s, classification } of zeroDispatch) console.error(`  ${s.family}: ${classification.verdict} (${classification.detail})`);
    console.error('  This audit does not and will not recommend enabling a schedule, see rule 16. WORKFLOW_RUN_HISTORY_ONLY means dispatched, just before/without the harness-artifact convention, not a defect to chase. NO_EVIDENCE_FOUND and EVIDENCE_UNAVAILABLE are the only two verdicts worth a coordinator look.');
  }
  if (neverDispatchedProducers.length) {
    console.error(`\nNO HARNESS ARTIFACT, INDIVIDUAL PRODUCER(S) (informational, rule 16, same posture as above), ${neverDispatchedProducers.length} producer(s):`);
    for (const { s, classification } of neverDispatchedProducers) console.error(`  ${s.producer}: ${classification.verdict} (${classification.detail})`);
    console.error('  Workflow evidence here is shared across all 11 producers (one gh run list call for producers.yml, no per-step attribution available), so WORKFLOW_RUN_HISTORY_ONLY here means "the producers.yml workflow ran", not "this specific producer script ran" -- cross-check the data the producer writes (market_series, emission_factors, regional_data_facts) for a per-producer answer.');
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
