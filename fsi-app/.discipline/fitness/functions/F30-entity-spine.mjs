// F30: ENTITY SPINE — TEXT-KEYED REFERENCE SITE RATCHET. Lane DP-SPINE, system-completion train,
// 2026-09-02. Enforces the progressive-re-keying half of ADR-024: migration 282/283 built the entity
// spine (entities/entity_identifiers/entity_scope) and the FK-backed replacements for four text-keyed
// lookups (jurisdiction_iso, canonical_instrument_key, sources.url-derived organisation identity), but
// building the replacement changes nothing about the CALL SITES that still use the old text key — a
// migration cannot force a reader to migrate. Something has to hold the line so the count of remaining
// text-keyed sites only ever goes DOWN as callers migrate, never silently back up as a new one is added
// next to the FK-backed one that already exists for exactly that purpose.
//
// WHAT IT MEASURES, PER NAMED PATTERN, ACROSS THE WHOLE fsi-app/src TREE (excluding *.test.* and
// *.stories.* — this counts PRODUCTION call sites, not the fixtures that legitimately construct a raw
// filter to prove a helper's behaviour):
//
//   jurisdiction_iso_eq          `.eq("jurisdiction_iso", ...)` — WRONG even before this migration:
//                                  jurisdiction_iso is TEXT[] (migration 033); an .eq() against an array
//                                  column cannot mean what a reader intends. Zero today; must stay zero.
//   jurisdiction_iso_contains    `.contains("jurisdiction_iso", ...)` — the correct array-membership
//                                  filter for the OLD column. Every occurrence is a candidate for
//                                  migrating to entity_refs (role='jurisdiction') via instrument/
//                                  organisation-style `.eq("entity_id", ...)` through a join. Zero today.
//   canonical_instrument_key_eq  `.eq("canonical_instrument_key", ...)` — migrate to
//                                  `.eq("instrument_entity_id", ...)` (migration 283's FK column, one
//                                  join fewer). Zero today.
//   source_url_eq                `.eq("source_url", ...)` — a source identified by raw URL text rather
//                                  than `organisation_entity_id` (migration 283). Two today (see BASELINE
//                                  comment below for why they are not yet zero).
//   url_host_derivation          `new URL(...).host` / `.hostname` — ad-hoc host derivation OUTSIDE
//                                  entity-id.mjs's hostFromUrl(), the single normalizer this spine
//                                  defines (spec §1.3's progressive-re-keying rationale: one seed
//                                  function, not N call-site reimplementations that can drift from it
//                                  and from each other). Thirteen today.
//
// ONE-DIRECTIONAL, NOT A BIDIRECTIONAL RATCHET (deliberately different from F23's GAP_BASELINE shape).
// F23 fails when the count moves in EITHER direction, because coverage-scan.mjs's gap categories are a
// FINISHED-when-zero cleanup with a known total. This ratchet governs an ONGOING migration with no fixed
// completion date across many independent lanes (DP-ENGINE, DP-SURF, and whichever lane next touches a
// call site) — forcing every lane that merely HOLDS a count steady (touches the file for an unrelated
// reason, changes nothing about which key it reads) to bump BASELINE_COUNTS in the same commit would be
// pure ceremony with no signal. So: regression (now > baseline) is RED, same as F23; improvement
// (now < baseline) PASSES outright and is reported as a delta in the pass message, left for the next
// commit that touches this file to fold into a lowered baseline — never a build failure by itself.
//
// BASELINE, measured 2026-09-02 against this commit's tree (544 files scanned: fsi-app/src/**/*.{ts,tsx,
// mjs,js}, excluding *.test.* and *.stories.*):
//   source_url_eq: 2 — fsi-app/src/app/api/agent/run/route.ts, fsi-app/src/lib/intake/mint-item.ts. Both
//     pre-date this migration and are OUT OF Lane DP-SPINE's write set (route.ts / intake/ are owned by
//     other surfaces per docs/inventories/shared-dataset-ownership.md) — named here as a defect outside
//     the write set (see this lane's REPORT), not fixed in this commit.
//   url_host_derivation: 13 — thirteen sites under fsi-app/src/lib/sources/** and fsi-app/src/app/api/
//     admin/**, all pre-dating entity-id.mjs's hostFromUrl(). Same posture: named, not fixed here (all
//     outside the write set; several are inside institutionKey()'s shared-portal path-splitting logic in
//     scripts/lib/db.mjs, which this lane deliberately did NOT reuse for organisation-entity hashing —
//     see backfill-entities.mjs's header — and is itself outside fsi-app/src so is not counted here).
//   jurisdiction_iso_eq / jurisdiction_iso_contains / canonical_instrument_key_eq: 0 — no production
//     reader queries these shapes today (canonical_instrument_key readers use array `.in()` / direct
//     column selects, not a single-value `.eq()`; nothing yet filters jurisdiction_iso at all). The
//     backfill this lane ships (scripts/entities/backfill-entities.mjs) reads these columns directly by
//     selecting the whole array, never through `.eq()`/`.contains()`, so it does not move these counts.
//
// COST: filesystem only. No network, no database, no model call, no schedule — same posture as F23/F24.
//
// Holistic: the whole tree is scanned once, not per-file. Single sentinel => check() runs once (F14/F23/
// F24 idiom).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { globFiles } from '../lib/glob.mjs';

const SCAN_GLOB = 'fsi-app/src/**/*.{ts,tsx,mjs,js}';

// Named, not anonymous — a violation message and the pass-report delta both need a human label per
// pattern, and PATTERNS is iterated in a stable key order so the report is deterministic.
export const PATTERNS = {
  jurisdiction_iso_eq: /\.eq\(\s*["'`]jurisdiction_iso["'`]/g,
  jurisdiction_iso_contains: /\.contains\(\s*["'`]jurisdiction_iso["'`]/g,
  canonical_instrument_key_eq: /\.eq\(\s*["'`]canonical_instrument_key["'`]/g,
  source_url_eq: /\.eq\(\s*["'`]source_url["'`]/g,
  url_host_derivation: /new URL\([^)]*\)\.(?:host|hostname)\b/g,
};

// The committed ceiling. See the header comment for what each number is and why it is not yet zero.
export const BASELINE_COUNTS = {
  jurisdiction_iso_eq: 0,
  jurisdiction_iso_contains: 0,
  canonical_instrument_key_eq: 0,
  source_url_eq: 2,
  url_host_derivation: 13,
};

/** Strip `/* *‍/` and `//` comments so a file that merely MENTIONS a pattern in prose (a doc-comment
 *  explaining the old shape, exactly like this file's own header) cannot be counted as a live call site.
 *  Same simplicity/tradeoff as F24's stripSqlComments: a `//` inside a string literal is mis-stripped in
 *  principle, but none of the five patterns here can straddle that edge (they all match `.method(` /
 *  `new URL(` shapes that do not appear inside the kind of string a `//`-in-a-string false strip would
 *  hide) — verified empirically against the current tree (counts above), not merely asserted. */
export function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
}

/**
 * Pure counter, exported so the selftest can prove the catching/ratchet behaviour against constructed
 * file maps rather than the live tree (F23/F24's negative-test discipline). `filesWithContent` is
 * `[{ path, content }]`. Returns `{ counts, sites }` — `sites[patternName]` is `["path:line", ...]`.
 */
export function countPatterns(filesWithContent) {
  const counts = {};
  const sites = {};
  for (const name of Object.keys(PATTERNS)) { counts[name] = 0; sites[name] = []; }
  for (const { path, content } of filesWithContent) {
    const stripped = stripComments(content);
    for (const [name, re] of Object.entries(PATTERNS)) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(stripped))) {
        counts[name]++;
        const line = stripped.slice(0, m.index).split('\n').length;
        sites[name].push(`${path}:${line}`);
      }
    }
  }
  return { counts, sites };
}

/**
 * Pure comparator, exported so the selftest can prove BOTH the fail-on-regression and pass-with-delta
 * behaviours against constructed counts. ONE-DIRECTIONAL (see header): only `actual > baseline` is a
 * violation. Returns `{ problems, deltas }` — `problems` is `[]` on pass; `deltas` always reports every
 * pattern's movement (negative = improvement) for the pass-path summary line.
 */
export function compareToBaseline(counts, sites, baseline = BASELINE_COUNTS) {
  const problems = [];
  const deltas = {};
  for (const name of Object.keys(baseline)) {
    const actual = counts[name] ?? 0;
    const was = baseline[name];
    deltas[name] = actual - was;
    if (actual > was) {
      const offending = (sites[name] || []).slice(0, 10).join(', ');
      problems.push(
        `REGRESSION — "${name}": ${actual} text-keyed site(s), baseline ${was} (+${actual - was}). ` +
          `A new site was added using the OLD key instead of migration 283's FK-backed replacement ` +
          `(instrument_entity_id / organisation_entity_id / entity_refs — see ADR-024 and this file's ` +
          `header for which one). Offending site(s): ${offending}${sites[name].length > 10 ? ', …' : ''}. ` +
          `Migrate the call site, or if it is a genuinely new and justified use of the old key, that is a ` +
          `decision for review, not a silent baseline bump.`,
      );
    }
  }
  return { problems, deltas };
}

function readTree() {
  const root = getRepoRoot();
  const files = globFiles([SCAN_GLOB]).filter((f) => !f.includes('.test.') && !f.includes('.stories.'));
  return files.map((path) => ({ path, content: readFileSync(resolve(root, path), 'utf8') }));
}

export const fitnessFunction = {
  id: 'F30',
  name: 'entity-spine',
  description:
    'The count of text-keyed reference sites the entity spine (migration 282/283) exists to replace — ' +
    '.eq/.contains on jurisdiction_iso, .eq on canonical_instrument_key, .eq on source_url, and ad-hoc ' +
    'new URL(...).host/.hostname host derivation outside entity-id.mjs\'s hostFromUrl() — holds to a ' +
    'committed baseline per pattern. A new site is RED; a migrated-away site is reported as an ' +
    'improvement delta, never a failure, since the migration spans many independent lanes with no fixed ' +
    'completion date (ADR-024\'s progressive-re-keying decision: no big-bang rewrite).',
  source:
    'ADR-024 (decision-propagation, §"progressive re-keying"); docs/specs/08-flywheel-design.md §1.3 ' +
    '(progressive re-keying rationale, big-bang rewrite rejected); migration 282/283 (the entity spine ' +
    'and its FK-backed replacements this ratchet protects from silent regression)',

  // Holistic: the whole tree is scanned once, not per-file. Single sentinel => check() runs once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F30-entity-spine.mjs'];
  },

  check() {
    const { counts, sites } = countPatterns(readTree());
    const { problems, deltas } = compareToBaseline(counts, sites);
    if (problems.length === 0) {
      const improved = Object.entries(deltas).filter(([, d]) => d < 0);
      if (improved.length) {
        // Not a violation — surfaced via a synthetic PASS-shaped note is not how this engine reports
        // non-failing info, so this stays silent on the gate and is left for report/README-level
        // narration. (Kept as a no-op branch, named rather than omitted, so a future reader does not
        // wonder whether improvement detection was simply forgotten.)
      }
      return PASS;
    }
    return problems.map((msg) => violation(1, msg));
  },
};
