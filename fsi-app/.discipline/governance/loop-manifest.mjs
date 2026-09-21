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
