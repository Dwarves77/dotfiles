// Loop manifest (lane M9a, 2026-09-18; converted to a directory, lane R7m, 2026-09-21): the hops of the
// build plan's own loop (docs/plans/complete-system-build-plan-2026-09-04.md section 1) as DATA, not as a
// memory of "we wired that." F50 (.discipline/fitness/functions/F50-loop-wiring.mjs) is the checker that
// reads this data against the live tree, checking each hop's trigger edge against the real workflow files,
// each hop's harness family against a real artifact directory, and whether a hop has ever actually fired
// from its upstream rather than from a person.
//
// CONVERSION (category 48, plan 6.8, lane R7m): LOOP_HOPS was a hand-edited array literal in this file --
// every M lane touching a hop meant editing the same shared array, the exact "a registry is a directory"
// shape plan 6.8 names. `LOOP_HOPS` is now DERIVED at import by reading `loop-hops.d/`, one file per hop,
// sorted by filename, frozen. No consumer's import changes (F50, RD-74, loop-manifest.test.mjs,
// loop-run-id.test.mjs all still `import { LOOP_HOPS } from './loop-manifest.mjs'`). This file keeps only
// the contract: the shape, the loader, and the validation a hop file must satisfy. The per-hop commentary
// that used to live in this file's header now lives in each hop's own `note` field (loop-hops.d/*.json).
//
// SHAPE. Each hop:
//   {
//     id,                          // stable, kebab-case, unique across the directory
//     producer: { file, name },    // the workflow whose completion should trigger this hop
//     consumer: { file, name },    // the workflow that should react to it
//     trigger: 'workflow_run' | 'dispatch',
//     family: '<harness family dir under scripts/harness-runs/>' | null,
//     enforceEdge: boolean,        // true = the consumer's yml MUST carry the workflow_run edge today
//     enforceFired: boolean,       // true = an artifact in `family` MUST carry trigger:"workflow_run" today
//     producerPending: boolean,    // true = producer.file does not exist on this tree yet. Optional,
//                                  //   defaults to false when absent.
//     consumerPending: boolean,    // true = consumer.file does not exist on this tree yet. Optional.
//     familyPending: boolean,      // true = `family` is real but its scripts/harness-runs/<family>
//                                  //   directory and ALLOWED_FAMILIES registration do not exist yet.
//                                  //   Optional.
//     note,                        // free text: which lane (M<n>) closes the gap, or why a flag is false.
//   }
//
// ENFORCE IS TWO BOOLEANS, NOT ONE (brief-m9a.md item 1): the sweep-to-ledger-consume hop's edge already
// exists today but nothing has fired through it as a workflow_run yet, so a single "enforce" flag cannot
// express "the wiring is real, the proof is not" - every hop uses the same enforceEdge/enforceFired pair
// so the manifest and F50 never need a hop-shape special case.
//
// FILE NAMING. `<order>-<hop-id>.json`, two-digit order prefix, e.g. `01-sweep-to-fetch-drain.json`. The
// order prefix exists only to keep the build plan section 1 loop order stable on disk (sweep -> consume ->
// mint/corpus-turn -> downstream-chain -> propagation-drain -> brief-export -> gate-a-rescan); it is
// dropped from the loaded hop object. A duplicate order prefix or a duplicate `id` is a thrown error, not
// a silently-accepted collision - the loader is the enforcement, not a convention in a comment.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LOOP_HOPS_DIR = join(HERE, 'loop-hops.d');

const FILE_NAME_RE = /^(\d{2})-([a-z0-9-]+)\.json$/;

// Fields every hop file MUST declare. `family` is required too, but validated separately (below) since a
// legitimate value is `null`, which `field in hop` still satisfies - a plain "in" check covers both.
const REQUIRED_FIELDS = ['id', 'producer', 'consumer', 'trigger', 'family', 'enforceEdge', 'enforceFired', 'note'];

/**
 * Load and validate LOOP_HOPS from a `loop-hops.d`-shaped directory. Pure over its `dir` argument so
 * loop-manifest.test.mjs can point it at fixture directories rather than the live one (rule 15: a proof
 * that does not execute is not a proof - the attack cases below run for real, against real fixture files
 * on disk, never as a hand-simulated string check).
 *
 * @param {string} dir
 * @returns {ReadonlyArray<object>}
 */
export function loadLoopHops(dir) {
  const entries = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const seenOrders = new Map(); // order prefix -> filename
  const seenIds = new Map(); // hop id -> filename
  const hops = [];

  for (const filename of entries) {
    const match = FILE_NAME_RE.exec(filename);
    if (!match) {
      throw new Error(
        `loop-manifest: ${filename} does not match the required "<order>-<hop-id>.json" shape (e.g. ` +
          `"01-sweep-to-fetch-drain.json").`,
      );
    }
    const [, order] = match;
    if (seenOrders.has(order)) {
      throw new Error(
        `loop-manifest: duplicate order prefix "${order}" - ${filename} collides with ${seenOrders.get(order)}.`,
      );
    }
    seenOrders.set(order, filename);

    let hop;
    try {
      hop = JSON.parse(readFileSync(join(dir, filename), 'utf8'));
    } catch (e) {
      throw new Error(`loop-manifest: ${filename} is not valid JSON (${e.message}).`);
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in hop)) {
        throw new Error(`loop-manifest: ${filename} is missing required field "${field}".`);
      }
    }

    if (seenIds.has(hop.id)) {
      throw new Error(
        `loop-manifest: duplicate hop id "${hop.id}" - ${filename} collides with ${seenIds.get(hop.id)}.`,
      );
    }
    seenIds.set(hop.id, filename);

    hops.push(Object.freeze(hop));
  }

  return Object.freeze(hops);
}

export const LOOP_HOPS = loadLoopHops(LOOP_HOPS_DIR);

// ---------------------------------------------------------------------------------------------------------
// FIRING EVIDENCE (lane GATES-1, 2026-10-04). Chained runs land in the `harness_runs` table (migration 331),
// not as committed artifacts, so F50 could never see a hop fire. These are the pure pieces both the exporter
// (scripts/verify/export-loop-fired-evidence.mjs), the audit (scripts/verify/loop-fired-evidence-audit.mjs)
// and F50 share, kept here so there is one definition of "this row fired this hop".
// ---------------------------------------------------------------------------------------------------------

/** The two `trigger` values that prove a run started from an upstream workflow's completion, not a person.
 *  "workflow_run_forced_dry" is a real workflow_run event that build mode downgraded to dry (CONVENTION.md). */
export const FIRED_TRIGGERS = Object.freeze(['workflow_run', 'workflow_run_forced_dry']);

/** Where the committed firing evidence lives, repo-relative and fsi-app-relative. */
export const LOOP_FIRED_EVIDENCE_PATH = 'fsi-app/.discipline/governance/loop-fired-evidence.json';

/** The same file as an absolute path derived from this module's own location (never from the caller's cwd). */
export const LOOP_FIRED_EVIDENCE_FILE = join(HERE, 'loop-fired-evidence.json');

/** Producer workflows that are not the consumer of any hop, so their harness family cannot be read off the
 *  manifest itself. Used only to tell apart two hops that share one consumer family (05 vs 06, 07 vs 08,
 *  10 vs 11). Every value is a real directory under scripts/harness-runs/ (pinned by the exporter's test). */
export const PRODUCER_FAMILY_BY_WORKFLOW_FILE = Object.freeze({
  '.github/workflows/source-sweep.yml': 'source-sweep',
  '.github/workflows/producers.yml': 'producers',
  '.github/workflows/brief-apply.yml': 'brief-apply',
  // Lane S1-E: Research walker is a chain root that is the producer of research-walker-to-source-resolution.
  '.github/workflows/research-walker.yml': 'research-walker',
});

/** Harness family of a hop's PRODUCER workflow: the family of whichever hop consumes that workflow, else the
 *  table above, else null. @param {object} hop @param {ReadonlyArray<object>} hops @returns {string|null} */
export function producerFamilyOf(hop, hops = LOOP_HOPS) {
  const consumerHop = hops.find((h) => h.consumer.file === hop.producer.file && h.family);
  if (consumerHop) return consumerHop.family;
  return PRODUCER_FAMILY_BY_WORKFLOW_FILE[hop.producer.file] ?? null;
}

const asText = (v) => (v === null || v === undefined ? null : String(v));

/**
 * Whether an evidence row or entry counts as a firing of `hop`. PURE. A trigger in FIRED_TRIGGERS always does.
 * A hop that declares `dispatchFallback: true` in its hop file (the F60 explicit-dispatch workaround: GitHub's
 * 3-level workflow_run limit means the real event is a machine-fired workflow_dispatch, recorded honestly as
 * such) also counts a `workflow_dispatch` row that carries a non-null `upstream_run_id`: nothing but the
 * producer's own dispatch step passes one, so a hand dispatch (no upstream id) never counts.
 * @param {{trigger?: string, upstream_run_id?: unknown}} row @param {object} hop
 */
export function isFiredEvidence(row, hop) {
  if (FIRED_TRIGGERS.includes(row?.trigger)) return true;
  return row?.trigger === 'workflow_dispatch' && hop?.dispatchFallback === true && asText(row?.upstream_run_id) !== null;
}

/**
 * Map `harness_runs` rows onto loop hops. PURE. A row is fired evidence when its trigger is in FIRED_TRIGGERS
 * and its family is a hop's family. When one family serves several hops, the hop is the one whose producer
 * family has a row whose github_run_id equals this row's upstream_run_id; a row that cannot be placed on
 * exactly one hop is returned in `unmapped` with its reason and is never written as evidence (a hop is not
 * claimed fired on a guess). One entry per hop: its EARLIEST firing row (stable across regeneration).
 * @param {object[]} rows @param {ReadonlyArray<object>} [hops]
 * @returns {{entries: object[], unmapped: {run_id: string, reason: string}[]}}
 */
export function mapRowsToHops(rows, hops = LOOP_HOPS) {
  const list = Array.isArray(rows) ? rows : [];
  const byHop = new Map();
  const unmapped = [];
  for (const row of list) {
    if (!FIRED_TRIGGERS.includes(row?.trigger) && row?.trigger !== 'workflow_dispatch') continue;
    const candidates = hops.filter((h) => h.family && h.family === row.harness_family && isFiredEvidence(row, h));
    if (candidates.length === 0) continue; // a family no hop names, or a plain dispatch: not a loop firing
    let hop = null;
    if (candidates.length === 1 && FIRED_TRIGGERS.includes(row.trigger)) {
      hop = candidates[0];
    } else {
      const upstream = asText(row.upstream_run_id);
      const placed = upstream === null
        ? []
        : candidates.filter((h) => {
            const pf = producerFamilyOf(h, hops);
            return pf !== null && list.some((r) => r.harness_family === pf && asText(r.github_run_id) === upstream);
          });
      if (placed.length === 1) hop = placed[0];
      else {
        unmapped.push({
          run_id: String(row.run_id),
          reason: upstream === null
            ? `family "${row.harness_family}" serves ${candidates.length} hops and the row has no upstream_run_id`
            : placed.length === 0
              ? `family "${row.harness_family}" serves ${candidates.length} hops and no producer row has github_run_id ${upstream}`
              : `upstream_run_id ${upstream} matches ${placed.length} hops`,
        });
        continue;
      }
    }
    const entry = {
      hop: hop.id,
      family: row.harness_family,
      run_id: String(row.run_id),
      github_run_id: asText(row.github_run_id),
      upstream_run_id: asText(row.upstream_run_id),
      started_at: String(row.started_at),
      trigger: row.trigger,
    };
    const prior = byHop.get(hop.id);
    const t = Date.parse(entry.started_at);
    const pt = prior ? Date.parse(prior.started_at) : 0;
    if (!prior || t < pt || (t === pt && entry.run_id < prior.run_id)) {
      byHop.set(hop.id, entry);
    }
  }
  const order = new Map(hops.map((h, i) => [h.id, i]));
  const entries = [...byHop.values()].sort((a, b) => order.get(a.hop) - order.get(b.hop));
  return { entries, unmapped };
}
