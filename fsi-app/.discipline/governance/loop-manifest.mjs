// Loop manifest (lane M9a, 2026-09-18): the hops of the build plan's own loop
// (docs/plans/complete-system-build-plan-2026-09-04.md section 1) as DATA, not as a memory of "we wired
// that." The 2026-09-18 stage audit's own finding (s6-gates-harness.md): every hop of the loop exists as
// code, but "wired and never fired" is invisible, because nothing states the hops so a gate can check
// each hop's trigger edge against the real workflow files, each hop's harness family against a real
// artifact directory, and whether a hop has ever actually fired from its upstream rather than from a
// person. This file is that data; F50 (.discipline/fitness/functions/F50-loop-wiring.mjs) is the checker
// that reads it against the live tree.
//
// SHAPE. Each hop:
//   {
//     id,                          // stable, kebab-case, unique
//     producer: { file, name },    // the workflow whose completion should trigger this hop
//     consumer: { file, name },    // the workflow that should react to it
//     trigger: 'workflow_run' | 'dispatch',
//     family: '<harness family dir under scripts/harness-runs/>' | null,
//     enforceEdge: boolean,        // true = the consumer's yml MUST carry the workflow_run edge today
//     enforceFired: boolean,       // true = an artifact in `family` MUST carry trigger:"workflow_run" today
//     producerPending: boolean,    // true = producer.file does not exist on this tree yet (a later lane
//     consumerPending: boolean,    //   creates it) - see "PENDING FILES" below. Default false; omitted
//                                  //   below for every hop where both are false.
//     familyPending: boolean,      // true = `family` is real but its scripts/harness-runs/<family>
//                                  //   directory and ALLOWED_FAMILIES registration do not exist yet.
//     note,                        // free text: which lane (M<n>) closes the gap, or why a flag is false.
//   }
//
// ENFORCE IS TWO BOOLEANS, NOT ONE (brief-m9a.md item 1): the sweep-to-ledger-consume hop's edge already
// exists today but nothing has fired through it as a workflow_run yet, so a single "enforce" flag cannot
// express "the wiring is real, the proof is not" - every hop uses the same enforceEdge/enforceFired pair
// so the manifest and F50 never need a hop-shape special case.
//
// PENDING FILES. Three hops (sweep-to-fetch-drain, brief-apply-to-gate-a-rescan,
// population-turn-to-gate-a-rescan) name a consumer workflow file that does not exist on this tree yet -
// fetch-drain.yml (lane M1) and a gate-a-rescan consumer (lane M6; the build plan section 6.1 row M6
// itself leaves the exact file undecided, ".github/workflows/maintenance.yml (or a gate-a.yml)" - this
// manifest names the not-yet-decided path as pending rather than presuming maintenance.yml, an existing
// but otherwise-unrelated multi-purpose workflow, is the intended home). `consumerPending: true` is the
// explicit, testable flag loop-manifest.test.mjs and F50 both read instead of pattern-matching the note
// text - the SAME exemption the family check already needs for a not-yet-created harness family, applied
// uniformly rather than re-derived per hop kind.
//
// FAMILY PENDING, CLOSED (lane M3, 2026-09-19). Two hops (population-turn-to-downstream-chain,
// corpus-turn-to-downstream-chain) used to name family "downstream-chain" with `familyPending: true`: the
// consumer WORKFLOW (downstream-chain.yml) already existed and already carried the workflow_run edge from
// both producers (confirmed by reading the file, 2026-09-18), but the HARNESS family itself
// (scripts/harness-runs/downstream-chain/) did not exist. Lane M3 registered it BY DESCRIPTOR ONLY (build
// plan section 6.8 Rule A: family.json + FAMILY.md, no edit to ALLOWED_FAMILIES/governing-files.mjs, both
// derived from the descriptor) and gave downstream-chain.yml its own committed run artifact; both hops'
// `familyPending` is now omitted (false is the default for every other hop's own flag).
//
// LOOP ORDER matches build plan section 1: sweep -> consume -> mint/corpus-turn -> downstream-chain ->
// propagation-drain -> brief-export -> gate-a-rescan. Read every workflow file's own `name:` line before
// trusting a value here (F50's manifest self-test fails on a wrong name); every name below was read
// directly from the committed `.github/workflows/*.yml` files on this branch, 2026-09-18.

export const LOOP_HOPS = [
  {
    id: 'sweep-to-fetch-drain',
    producer: { file: '.github/workflows/source-sweep.yml', name: 'Source sweep' },
    consumer: { file: '.github/workflows/fetch-drain.yml', name: 'Fetch drain' },
    trigger: 'workflow_run',
    family: 'fetch-drain',
    enforceEdge: false,
    enforceFired: false,
    consumerPending: true,
    note:
      'M1 creates fetch-drain.yml and wires this workflow_run edge, replacing the hand pg_net call. The ' +
      'fetch-drain harness family already exists (scripts/harness-runs/fetch-drain/, registered in ' +
      'ALLOWED_FAMILIES) with real prior artifacts, so only the workflow file and the edge are pending.',
  },
  {
    id: 'sweep-to-ledger-consume',
    producer: { file: '.github/workflows/source-sweep.yml', name: 'Source sweep' },
    consumer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
    trigger: 'workflow_run',
    family: 'ledger-consume',
    enforceEdge: true,
    enforceFired: false,
    note:
      'Edge exists today: ledger-consume.yml carries on.workflow_run.workflows: ["Source sweep"]. Nothing ' +
      'has fired through it as trigger:"workflow_run" yet (M2 closes the apply half and proves it).',
  },
  {
    id: 'ledger-consume-to-population-turn',
    producer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
    consumer: { file: '.github/workflows/population-turn.yml', name: 'Population turn' },
    trigger: 'workflow_run',
    family: 'mint',
    enforceEdge: true,
    enforceFired: false,
    note:
      'Edge exists today: population-turn.yml carries on.workflow_run.workflows: ["Ledger consume"]. ' +
      'Fired-from-upstream proof is M3.',
  },
  {
    id: 'ledger-consume-to-corpus-turn',
    producer: { file: '.github/workflows/ledger-consume.yml', name: 'Ledger consume' },
    consumer: { file: '.github/workflows/corpus-turn.yml', name: 'Corpus turn' },
    trigger: 'workflow_run',
    family: 'corpus-turn',
    enforceEdge: true,
    enforceFired: false,
    note:
      'Edge landed (lane M3, 2026-09-19): corpus-turn.yml now carries on.workflow_run.workflows: ["Ledger ' +
      'consume"], alongside workflow_dispatch and push:branches turn/**. Fired-from-upstream proof is the ' +
      'coordinator\'s proof run (build plan section 6.2).',
  },
  {
    id: 'population-turn-to-downstream-chain',
    producer: { file: '.github/workflows/population-turn.yml', name: 'Population turn' },
    consumer: { file: '.github/workflows/downstream-chain.yml', name: 'Downstream chain' },
    trigger: 'workflow_run',
    family: 'downstream-chain',
    enforceEdge: true,
    enforceFired: false,
    note:
      'Edge exists today: downstream-chain.yml carries on.workflow_run.workflows: ["Population turn", ' +
      '"Corpus turn"]. The downstream-chain harness family is now registered (lane M3, 2026-09-19, by ' +
      'descriptor only, scripts/harness-runs/downstream-chain/family.json) -- familyPending cleared. ' +
      'Fired-from-upstream proof is the coordinator\'s proof run (build plan section 6.2).',
  },
  {
    id: 'corpus-turn-to-downstream-chain',
    producer: { file: '.github/workflows/corpus-turn.yml', name: 'Corpus turn' },
    consumer: { file: '.github/workflows/downstream-chain.yml', name: 'Downstream chain' },
    trigger: 'workflow_run',
    family: 'downstream-chain',
    enforceEdge: true,
    enforceFired: false,
    note: 'Same edge, same now-registered family as population-turn-to-downstream-chain above (M3).',
  },
  {
    id: 'downstream-chain-to-propagation-drain',
    producer: { file: '.github/workflows/downstream-chain.yml', name: 'Downstream chain' },
    consumer: { file: '.github/workflows/propagation-drain.yml', name: 'Propagation drain' },
    trigger: 'workflow_run',
    family: 'propagation',
    enforceEdge: true,
    enforceFired: false,
    note:
      'Edge exists today: propagation-drain.yml carries on.workflow_run.workflows: ["Data producers", ' +
      '"Downstream chain"]. No artifact in the propagation family records a trigger field yet (this lane ' +
      'adds the field itself, see scripts/lib/run-artifact.mjs) - no artifact records its trigger yet.',
  },
  {
    id: 'data-producers-to-propagation-drain',
    producer: { file: '.github/workflows/producers.yml', name: 'Data producers' },
    consumer: { file: '.github/workflows/propagation-drain.yml', name: 'Propagation drain' },
    trigger: 'workflow_run',
    family: 'propagation',
    enforceEdge: true,
    enforceFired: false,
    note: 'Same edge as downstream-chain-to-propagation-drain above; no artifact records its trigger yet.',
  },
  {
    id: 'population-turn-to-brief-export',
    producer: { file: '.github/workflows/population-turn.yml', name: 'Population turn' },
    consumer: { file: '.github/workflows/brief-export.yml', name: 'Brief export' },
    trigger: 'workflow_run',
    family: 'brief-apply',
    enforceEdge: false,
    enforceFired: false,
    note:
      'brief-export.yml carries only workflow_dispatch today; no workflow_run edge. Family is brief-apply ' +
      'for now (M4 may add a dedicated brief-export family). M4 wires this hop.',
  },
  {
    id: 'brief-apply-to-gate-a-rescan',
    producer: { file: '.github/workflows/brief-apply.yml', name: 'Brief apply' },
    consumer: { file: '.github/workflows/gate-a-rescan.yml', name: 'Gate A rescan' },
    trigger: 'workflow_run',
    family: null,
    enforceEdge: false,
    enforceFired: false,
    consumerPending: true,
    note:
      'M6 builds the gate-a-rescan consumer. Build plan section 6.1 row M6 leaves the exact file open ' +
      '(".github/workflows/maintenance.yml (or a gate-a.yml)"); this manifest names the undecided path as ' +
      'pending rather than presuming maintenance.yml, which exists today but carries no gate-a-rescan step ' +
      'or workflow_run edge, is the intended home.',
  },
  {
    id: 'population-turn-to-gate-a-rescan',
    producer: { file: '.github/workflows/population-turn.yml', name: 'Population turn' },
    consumer: { file: '.github/workflows/gate-a-rescan.yml', name: 'Gate A rescan' },
    trigger: 'workflow_run',
    family: null,
    enforceEdge: false,
    enforceFired: false,
    consumerPending: true,
    note: 'Same pending consumer as brief-apply-to-gate-a-rescan above (M6).',
  },
];
