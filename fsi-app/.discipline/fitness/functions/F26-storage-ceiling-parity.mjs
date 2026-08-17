// F26: storage-ceiling parity across BOTH writers of agent_run_searches.result_content_excerpt.
//
// WHY THIS EXISTS (2026-08-17). That column has two independent writers:
//   1. the Next.js canonical pipeline  — fsi-app/src/lib/agent/generation-config.ts
//   2. the Deno capture-worker         — fsi-app/supabase/functions/capture-worker/index.ts
// The Edge Function runs on Deno and imports only supabase-js + unpdf, so it CANNOT import the
// Next.js config module. Until 2026-08-17 it therefore had no ceiling at all: a floor (MIN_BYTES)
// and nothing above. ADR-016's 10M pathological-page ceiling was live on exactly one of the two
// paths, and three captures landed over it with no signal — 17,787,345 / 12,579,090 / 10,351,091
// chars, all `capture-worker:first-fetch`, all dated AFTER the 2026-07-21 ruling.
//
// WHAT THIS ASSERTS. Not "a cap exists" — that is a presence check, and standing rule 15 is explicit
// that presence checks are necessary and never sufficient. Presence is also exactly what let the
// gate_a_* hand-copied version literal drift (db-layer census, 2026-08-11). This asserts PARITY:
// both readers resolve the SAME env var name and fall back to the SAME literal. A copied constant
// that someone later bumps on one side only is the precise failure this file prevents.
//
// It is a static check by necessity: the two runtimes cannot share an import, so the source text
// is the only place the agreement can be verified before deploy.
//
// SHAPE. Holistic (the F14/F23/F24 idiom): enumerate() returns a single sentinel and the whole
// analysis runs once inside check(). Parity is a statement about a PAIR of files, so it cannot be
// evaluated one file at a time — the first version of this function carried a module-level Map to
// smuggle the first file's reading across to the second, which made the verdict depend on
// enumeration order and leaked state between runs in the same process. The decision logic is a pure
// function (auditCeilingParity) driven by constructed fixtures in the test, never by the live repo:
// a gate tested only against the current repo degrades into re-asserting whatever the repo happens
// to contain and stops being able to state what the rule IS.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

export const NEXT_CONFIG = 'fsi-app/src/lib/agent/generation-config.ts';
export const WORKER = 'fsi-app/supabase/functions/capture-worker/index.ts';

export const ENV_NAME = 'STORAGE_MAX_CHARS';

// `Number(process.env.STORAGE_MAX_CHARS || 10_000_000)` / `Number(Deno.env.get("STORAGE_MAX_CHARS") || 10_000_000)`
export const NEXT_RE = /STORAGE_MAX_CHARS\s*=\s*Number\(\s*process\.env\.STORAGE_MAX_CHARS\s*\|\|\s*([0-9_]+)\s*\)/;
export const WORKER_RE = /STORAGE_MAX_CHARS\s*=\s*Number\(\s*Deno\.env\.get\(\s*["']STORAGE_MAX_CHARS["']\s*\)\s*\|\|\s*([0-9_]+)\s*\)/;

/**
 * The loudness requirements on the WORKER side. A ceiling that binds silently is a decorative gate:
 * it would quietly slice the grounding pool and still satisfy a parity check, which is how the
 * memory-gate canary went quiet. Each entry is a marker that must appear in the worker source.
 */
export const LOUD_MARKERS = [
  {
    re: /\[truncation-guard\]/,
    why:
      `emits no [truncation-guard] warning. ADR-016 requires the ceiling to be LOUD ON BIND — a silent ` +
      `slice of the grounding pool is forbidden.`,
  },
  {
    re: /integrity_flags/,
    why:
      `never writes integrity_flags. A ceiling bind is a real coverage gap and must reach the operator ` +
      `queue, matching recordTruncation() on the Next.js path.`,
  },
];

const norm = (lit) => Number(String(lit).replaceAll('_', ''));

/** Read the fallback literal out of one side. Returns a number, or null when the form is absent. */
export function readCeiling(which, content) {
  const m = String(content ?? '').match(which === 'worker' ? WORKER_RE : NEXT_RE);
  return m ? norm(m[1]) : null;
}

/**
 * The whole verdict, pure. Takes the two file bodies, returns an array of message strings.
 * Empty array = the two writers agree and the worker's ceiling is loud.
 */
export function auditCeilingParity(nextContent, workerContent) {
  const problems = [];

  const nextValue = readCeiling('next', nextContent);
  const workerValue = readCeiling('worker', workerContent);

  if (nextValue === null) {
    problems.push(
      `${NEXT_CONFIG} does not resolve ${ENV_NAME} in the required form ` +
        `(Number(process.env.${ENV_NAME} || <literal>)). The ceiling must be read from env with an explicit ` +
        `numeric fallback so F26 can verify both writers agree.`,
    );
  }
  if (workerValue === null) {
    problems.push(
      `${WORKER} does not resolve ${ENV_NAME} in the required form ` +
        `(Number(Deno.env.get("${ENV_NAME}") || <literal>)). ADR-016's ceiling must bind on EVERY writer of ` +
        `result_content_excerpt, not just the pipeline — the worker path is where the three over-ceiling ` +
        `captures landed.`,
    );
  }

  // Only meaningful when both sides parsed; a missing side is already reported above.
  if (nextValue !== null && workerValue !== null && nextValue !== workerValue) {
    problems.push(
      `${ENV_NAME} fallback DIVERGED: ${NEXT_CONFIG} declares ${nextValue} but ${WORKER} declares ` +
        `${workerValue}. One column, two writers, two ceilings — this is the exact defect that let ` +
        `17,787,345-char captures land unflagged. Change both or neither.`,
    );
  }

  // The worker's ceiling is only worth having if a bind is LOUD. Checked whenever the worker declares
  // the constant at all: a declared-but-silent ceiling is worse than none, because it looks enforced.
  if (workerValue !== null) {
    for (const marker of LOUD_MARKERS) {
      if (!marker.re.test(String(workerContent ?? ''))) {
        problems.push(`capture-worker declares ${ENV_NAME} but ${marker.why}`);
      }
    }
  }

  return problems;
}

function readRepoFile(rel) {
  try {
    return readFileSync(join(getRepoRoot(), rel), 'utf8');
  } catch {
    return null;
  }
}

export const fitnessFunction = {
  id: 'F26',
  name: 'storage-ceiling-parity',
  description:
    'Both writers of agent_run_searches.result_content_excerpt (Next.js generation-config + Deno capture-worker) ' +
    'must resolve STORAGE_MAX_CHARS from the same env var with the same fallback literal, and a worker bind must ' +
    'be LOUD (warn + integrity_flags). One column, two writers, ONE rule — the divergence that let three ' +
    'over-ceiling captures land silently.',
  source: 'ADR-016 + the 2026-08-17 capture-worker ceiling-hole finding',

  // Holistic: parity is a property of the PAIR, so the analysis runs once, not once per file.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F26-storage-ceiling-parity.mjs'];
  },

  check() {
    const nextContent = readRepoFile(NEXT_CONFIG);
    const workerContent = readRepoFile(WORKER);

    // A missing file is a violation, not a silent skip — either writer disappearing is exactly the
    // kind of move that would quietly retire the ceiling on one side.
    const missing = [];
    if (nextContent === null) missing.push(NEXT_CONFIG);
    if (workerContent === null) missing.push(WORKER);
    if (missing.length) {
      return missing.map((f) =>
        violation(
          1,
          `${f} is unreadable or gone, so ${ENV_NAME} parity cannot be verified. If this writer was ` +
            `genuinely retired, retire its half of F26 in the same change rather than leaving the gate blind.`,
        ),
      );
    }

    const problems = auditCeilingParity(nextContent, workerContent);
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
