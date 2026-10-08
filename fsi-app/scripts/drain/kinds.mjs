// kinds.mjs: the judgement drain's ONE registry of judgement queues (lane G6-DRAIN, 2026-10-06, plan Stage 6,
// "How model judgement runs"). A workflow EXPORTS items, a Claude session WRITES a committed batch file, a
// workflow APPLIES it by rule. This file names, for each queue (a "kind"): where its batch files live, how
// they are named, which existing exporter produces the queue, which existing apply workflow consumes the
// batch, and how big one batch is. It is the single source of that wiring: plan-drain.mjs plans from it,
// resolve-push-batch.mjs reads the same directories and name patterns when an apply workflow fires on a
// merge, and the paths here are the ones each apply workflow's `push:` trigger lists.
//
// NOTHING here queries anything. The exporters are the existing ones and are run as they stand (no second
// copy of any export query lives in scripts/drain/); `readQueue` only reads what an exporter wrote.
//
// BATCH SIZE (CLAUDE.md rule 11): "fewer firings with larger batches beat frequent small ones". batchSize is
// the item count of ONE batch file. maxBatchesPerRun is 1 for every kind: a drain session lands ONE batch file
// per kind per PR, because an apply workflow that names its file (brief-apply, theme-briefs, question-answers)
// takes exactly one file per merge (resolve-push-batch.mjs refuses a push that adds more). The session splits a
// batch's items among sub-agents and merges their output into the one file. Sizes follow each exporter's own
// per-item character budget (theme bundles 60000 characters each, question bundles 60000, ledger 200 to 400 per
// the README), not a guess.
//
// KINDS NOT HERE, ON PURPOSE: corpus-turn's extraction (export-corpus-for-extraction.mjs, apply-extraction-
// output.mjs). Forward-event extraction is a pure, deterministic parser (src/lib/forward-events/extract-
// forward-events.mjs, "no-LLM module"), run by corpus-turn.yml itself; no session writes a batch for it and no
// committed extraction batch directory exists, so there is no judgement to drain. The with-pool-text export
// that DOES feed a session is the record-briefs queue below.

/** Fixed tie-break order for kinds whose pending age is unknown or equal: upstream of the flywheel first. */
export const KIND_ORDER = Object.freeze(["ledger-verdicts", "host-verdicts", "needs-search", "question-answers", "theme-briefs", "record-briefs"]);

/**
 * @typedef {object} DrainKind
 * @property {string} id
 * @property {string} label
 * @property {string} batchDir        fsi-app relative directory the session commits batch files into
 * @property {RegExp} batchRe         the filename shape an apply workflow's push trigger and resolver accept
 * @property {string} batchPrefix     filename stem the session uses (NNN follows it)
 * @property {string} applyWorkflow   the existing workflow that applies a merged batch
 * @property {string} applyFileInput  how that workflow is told which file (workflow_dispatch input name; informational)
 * @property {boolean} namesFile       true when the apply workflow is told the one batch file (so a merge may add exactly one)
 * @property {string} authoringGuide  the README that holds the batch schema the sub-agent authors against
 * @property {number} batchSize
 * @property {number} maxBatchesPerRun
 * @property {string[]} exportArgv    argv (after `node`) of the existing exporter, `{out}` is the output directory
 * @property {string|null} bundleGlobPrefix  filename prefix of the file the exporter writes into {out}
 * @property {string} itemsKey        top-level array in that file holding one entry per pending item
 * @property {string} idKey            field of a queue item that names it in the plan and in the batch file
 * @property {string|null} leaseKey   field of an item that is a uuid usable as a mutation lease key, or null
 */

/** @type {readonly DrainKind[]} */
export const KINDS = Object.freeze([
  {
    id: "ledger-verdicts",
    label: "Portal link candidate verdicts",
    batchDir: "scripts/turns/ledger-verdicts",
    batchRe: /^ledger-verdicts-\d{3}\.json$/,
    batchPrefix: "ledger-verdicts",
    applyWorkflow: "ledger-consume.yml",
    applyFileInput: "(none: auto-discovers every committed ledger-verdicts-*.json)",
    namesFile: false,
    authoringGuide: "scripts/turns/ledger-verdicts/README.md",
    batchSize: 300,
    maxBatchesPerRun: 1,
    exportArgv: ["scripts/turns/run-ledger-consume.mjs", "--export-candidates", "{out}/ledger-candidates.json", "--with-text", "--limit", "{limit}"],
    bundleGlobPrefix: "ledger-candidates",
    itemsKey: "candidates",
    idKey: "candidate_id",
    leaseKey: "candidate_id",
  },
  {
    id: "host-verdicts",
    label: "Unplaced host class verdicts",
    batchDir: "scripts/maintenance/host-verdicts",
    batchRe: /^host-verdicts-\d{3}\.json$/,
    batchPrefix: "host-verdicts",
    applyWorkflow: "source-resolution.yml",
    applyFileInput: "(none: resolve-provisional-sources reads every committed host-verdicts-NNN.json)",
    namesFile: false,
    authoringGuide: "scripts/maintenance/host-verdicts/README.md",
    batchSize: 150,
    maxBatchesPerRun: 1,
    exportArgv: ["scripts/maintenance/resolve-provisional-sources.mjs", "--arg", "export-unplaced", "--out", "{out}"],
    bundleGlobPrefix: "unplaced-hosts",
    itemsKey: "hosts",
    idKey: "host",
    leaseKey: null,
  },
  {
    id: "needs-search",
    label: "Source URLs for open needs",
    batchDir: "scripts/turns/needs-search/batches",
    batchRe: /^needs-search-\d{3}\.json$/,
    batchPrefix: "needs-search",
    applyWorkflow: "needs-search.yml",
    applyFileInput: "batch_file",
    namesFile: true,
    authoringGuide: "scripts/turns/needs-search/README.md",
    batchSize: 40,
    maxBatchesPerRun: 1,
    exportArgv: ["scripts/turns/export-needs-for-search.mjs", "--out-dir", "{out}", "--limit", "{limit}"],
    bundleGlobPrefix: "needs-search-export",
    itemsKey: "needs",
    idKey: "need_id",
    leaseKey: "need_id",
  },
  {
    id: "question-answers",
    label: "Open question answers",
    batchDir: "scripts/turns/question-answers/batches",
    batchRe: /^question-answers-\d{3}\.json$/,
    batchPrefix: "question-answers",
    applyWorkflow: "question-answers.yml",
    applyFileInput: "answers_file",
    namesFile: true,
    authoringGuide: "scripts/turns/question-answers/README.md",
    batchSize: 40,
    maxBatchesPerRun: 1,
    exportArgv: ["scripts/turns/export-questions-for-answers.mjs", "--out-dir", "{out}", "--limit", "{limit}"],
    bundleGlobPrefix: "question-answers-export",
    itemsKey: "bundles",
    idKey: "subject_ref",
    leaseKey: "item_id",
  },
  {
    id: "theme-briefs",
    label: "Theme briefs",
    batchDir: "scripts/turns/theme-briefs/batches",
    batchRe: /^theme-briefs-\d{3}\.json$/,
    batchPrefix: "theme-briefs",
    applyWorkflow: "theme-briefs.yml",
    applyFileInput: "briefs_file",
    namesFile: true,
    authoringGuide: "scripts/turns/theme-briefs/README.md",
    batchSize: 15,
    maxBatchesPerRun: 1,
    exportArgv: ["scripts/turns/export-themes-for-briefs.mjs", "--out-dir", "{out}", "--limit", "{limit}"],
    bundleGlobPrefix: "theme-briefs-export",
    itemsKey: "bundles",
    idKey: "theme_id",
    leaseKey: "theme_id",
  },
  {
    id: "record-briefs",
    label: "Record brief authoring",
    batchDir: "scripts/turns/record-briefs/batches",
    batchRe: /^record-briefs-\d{3}[a-z0-9-]*\.json$/,
    batchPrefix: "record-briefs",
    applyWorkflow: "brief-apply.yml",
    applyFileInput: "briefs_file",
    namesFile: true,
    authoringGuide: "scripts/turns/record-briefs/README.md",
    batchSize: 40,
    maxBatchesPerRun: 1,
    // The queue is harness_runs rows (scripts/turns/brief-export/queue.mjs); its one consumer is this CLI.
    exportArgv: ["scripts/turns/read-brief-export-queue.mjs", "--list"],
    bundleGlobPrefix: null,
    itemsKey: "ids",
    idKey: "id",
    leaseKey: "id",
  },
]);

/** @param {string} id */
export function kindById(id) {
  return KINDS.find((k) => k.id === id) ?? null;
}

/** Normalise a path to forward slashes and strip a leading `fsi-app/`. */
export function toAppRelative(p) {
  return String(p ?? "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^fsi-app\//, "");
}

/**
 * The kind whose committed batch file this path is, or null. Accepts an fsi-app relative or repo relative path.
 * @param {string} path
 */
export function kindForBatchPath(path) {
  const p = toAppRelative(path);
  for (const k of KINDS) {
    if (!p.startsWith(`${k.batchDir}/`)) continue;
    const name = p.slice(k.batchDir.length + 1);
    if (!name.includes("/") && k.batchRe.test(name)) return k;
  }
  return null;
}

/**
 * The next batch file path for a kind: the highest NNN already present (in any naming variant the kind accepts)
 * plus one, zero padded to 3. Pure.
 * @param {DrainKind} kind
 * @param {string[]} existingNames  file names present in kind.batchDir
 * @param {number} [offset]  0 for the next one, 1 for the one after, so a plan can name several
 */
export function nextBatchPath(kind, existingNames, offset = 0) {
  let max = 0;
  for (const n of existingNames ?? []) {
    if (!kind.batchRe.test(n)) continue;
    const m = /-(\d{3})/.exec(n.slice(kind.batchPrefix.length));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const num = String(max + 1 + offset).padStart(3, "0");
  return `${kind.batchDir}/${kind.batchPrefix}-${num}.json`;
}
