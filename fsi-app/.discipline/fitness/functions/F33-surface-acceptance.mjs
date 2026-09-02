// F33: SURFACE ACCEPTANCE. Lane GATES-1 (2026-09-02, finish plan Wave 1, "the acceptance gates that
// make gaps self-report"). Every gap in the 2026-08-31 register was found by a manual full-read of the
// specs against the live app — nothing caught it mechanically. This function is the gate: it hardcodes
// the customer surfaces docs/specs/00-10 actually name (the repo's spec directory runs 00-10; the
// finish-plan brief's "01..11-*.md" phrasing is the count of files INCLUDING the 00-numbered foundation
// spec, confirmed against `ls docs/specs/` — there is no 11th spec file) and checks each one against
// SURFACE_ACCEPTANCE_REGISTER (surface-acceptance-register.json, a sibling file). A surface is ACCEPTED
// when its register entry carries a route (an existing fsi-app/src/app/**/page.tsx), a data_path (a
// module the route is import-graph-reachable from — not merely named-alike), and a rendering_spec (an
// existing rendering-guard fixture or smoke-spec file). A surface is HONESTLY NOT-YET-BUILT when its
// entry carries an exemption naming who ruled it out and when. F33 is RED when:
//   (a) a hardcoded surface has no register entry at all (the surface went unregistered);
//   (b) a register entry's route/data_path/rendering_spec file does not exist on disk;
//   (c) a register entry claims a data_path the route cannot reach through a real import chain;
//   (d) a register entry has neither the full route/data_path/rendering_spec triple NOR an exemption;
//   (e) an exemption is missing reason/ruled_by/date;
//   (f) the register carries an entry for a surface id F33 does not hardcode (an invented surface, or a
//       stale entry left behind after a surface was renamed/removed here).
//
// WHY HARDCODED HERE, NOT DERIVED FROM THE SPECS AT RUNTIME. The spec files are prose; deriving "what is
// a customer surface" from them mechanically would need NLP judgment this gate cannot make low-false-
// positive. The hardcoded list is instead the AUDITABLE ARTIFACT: SPEC_SURFACES below states, per
// surface, the exact spec section that names it (basis), so a reviewer can check the claim against the
// cited prose directly, and adding/removing a surface here is a reviewed code change, not a silent drift.
// This is the same posture F23/F25/F30 already take for their own hardcoded baselines/allowlists.
//
// WHY A REAL IMPORT GRAPH FOR data_path, NOT A NAME CHECK. Reuses F25's buildImportGraph/resolveSpecifier
// (imported, not duplicated — F25 already resolves the `@/` tsconfig alias and the real extension list
// exactly the way the bundler does) rather than a second hand-rolled specifier resolver. F25's map is
// target -> Set(importer); this function inverts it once to importer -> Set(target) and walks it forward
// from the route file, so a register entry claiming "data_path X" where the route never actually imports
// X (directly or transitively) is caught, not rubber-stamped because a plausible-looking path string
// exists on disk.
//
// COST: filesystem only. No network, no database, no model call, no schedule — same posture as every
// other holistic function in this directory.
//
// Holistic: one graph built once. Single sentinel => check() runs once (F14/F23/F25/F30 idiom).

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';
import { buildImportGraph } from './F25-module-liveness.mjs';

const REGISTER_PATH = 'fsi-app/.discipline/fitness/surface-acceptance-register.json';

// ── The hardcoded spec-named surface list, with its basis. Do not invent surfaces: every id here must
//    be traceable to a section a human can open and read. See the file header for why this is hardcoded
//    rather than derived. ──────────────────────────────────────────────────────────────────────────────
export const SPEC_SURFACES = [
  {
    id: 'dashboard',
    name: 'Dashboard (home)',
    basis:
      'docs/specs/00-foundation-the-spine.md §5 "The portfolio: one “my things” object across five ' +
      'surfaces"; docs/specs/07-page-walkthrough.md "HOW THE FIVE FIT TOGETHER"',
  },
  {
    id: 'regulations',
    name: 'Regulations',
    basis: 'docs/specs/01-regulations.md §4 "Required components"',
  },
  {
    id: 'market-intel',
    name: 'Market Intel',
    basis: 'docs/specs/02-market-intel.md §6 "Required components"',
  },
  {
    id: 'research',
    name: 'Research',
    basis: 'docs/specs/03-research.md §7 "Required components"',
  },
  {
    id: 'operations',
    name: 'Operations',
    basis: 'docs/specs/04-operations.md §6 "Required components"',
  },
  {
    id: 'community',
    name: 'Community',
    basis: 'docs/specs/05-community.md §5 "Required components"',
  },
  {
    id: 'watchlist',
    name: 'Watchlist (the portfolio)',
    basis:
      'docs/specs/00-foundation-the-spine.md §5 "The portfolio: one “my things” object across five surfaces"',
  },
  {
    id: 'obligation-register',
    name: 'Regulations obligation register',
    basis:
      'docs/specs/01-regulations.md §3.2 "Obligation (cl:oblig:*) — NET NEW, the core build"; §4 Required ' +
      'components #1 (binding-position banner), #3 (obligation card), #10 (obligation → task)',
  },
  {
    id: 'carbon-cost-per-feu-overlay',
    name: 'Market Intel carbon-cost-per-FEU overlay',
    basis:
      'docs/specs/02-market-intel.md §6 Required components #3 "Carbon cost overlay on the freight rate ' +
      '— the differentiating component"',
  },
  {
    id: 'lead-time-chart',
    name: 'Market Intel lead-time position chart',
    basis: 'docs/specs/02-market-intel.md §6 Required components #5 "Lead-time position chart"',
  },
  {
    id: 'community-differentiators',
    name:
      'Community differentiators (peer-org context, cross-group topic discovery, peer directory, ' +
      'trusted-peer DM, cross-surface "peers are discussing this", topic follow, digest)',
    basis: 'docs/specs/05-community.md §5 Required components #2, #4, #5, #6, #7, #8, #9, #10, #11',
  },
  {
    id: 'spec-09-domain-tables',
    name: 'Spec-09 domain extension tables',
    basis: 'docs/specs/09-domain-extensions.md §1 "The eight new domains"',
  },
  {
    id: 'research-credibility-chips',
    name: 'Research credibility chips',
    basis: 'docs/specs/03-research.md §7 Required components #4 "Split credibility"',
  },
  {
    id: 'dashboard-five-surface-rebalance',
    name: 'Dashboard five-surface rebalance',
    basis:
      'docs/specs/00-foundation-the-spine.md §5 "The portfolio: one “my things” object across five ' +
      'surfaces"; docs/plans/finish-plan-2026-09-02.md Wave 2 lane DASH',
  },
];

/** Invert F25's target -> Set(importer) map into importer -> Set(target). Pure. */
export function invertToForward(importsMap) {
  const forward = new Map();
  for (const [target, importers] of importsMap) {
    for (const imp of importers) {
      if (!forward.has(imp)) forward.set(imp, new Set());
      forward.get(imp).add(target);
    }
  }
  return forward;
}

/** BFS reachability over the forward import graph. Pure. */
export function isReachable(from, to, forward) {
  if (from === to) return true;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of forward.get(cur) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Pure comparator: hardcoded surfaces vs the register, plus per-entry file/exemption/reachability
 * checks. Exported so the selftest can drive it with constructed fixtures instead of the live repo/
 * filesystem (the F23/F25/F30 negative-test discipline).
 * `env.fileExists(relPath) -> boolean`, `env.canReach(routePath, dataPath) -> boolean`.
 * Returns an array of problem strings ([] = pass).
 */
export function auditSurfaceAcceptance(specSurfaces, registerSurfaces, env) {
  const problems = [];
  const specIds = new Set(specSurfaces.map((s) => s.id));
  const registerById = new Map(registerSurfaces.map((s) => [s.id, s]));

  for (const spec of specSurfaces) {
    if (!registerById.has(spec.id)) {
      problems.push(
        `MISSING REGISTER ENTRY — spec-named surface "${spec.id}" (${spec.name}, basis: ${spec.basis}) ` +
          `has no entry in surface-acceptance-register.json. Add a route/data_path/rendering_spec entry, or ` +
          `an exemption naming who ruled it out and when.`,
      );
    }
  }

  for (const entry of registerSurfaces) {
    const where = `"${entry.id}"${entry.name ? ` (${entry.name})` : ''}`;

    if (!specIds.has(entry.id)) {
      problems.push(
        `UNKNOWN SURFACE — register entry ${where} does not match any id in F33's hardcoded ` +
          `SPEC_SURFACES. Either the surface was renamed/removed here and the register is stale, or this ` +
          `entry names a surface that is not actually spec-named — do not invent surfaces.`,
      );
      continue;
    }

    const hasExemption = entry.exemption && typeof entry.exemption === 'object';
    const hasTriple = Boolean(entry.route) && Boolean(entry.data_path) && Boolean(entry.rendering_spec);

    if (hasExemption) {
      const { reason, ruled_by: ruledBy, date } = entry.exemption;
      if (!reason || !String(reason).trim()) {
        problems.push(`EMPTY EXEMPTION — ${where} has an exemption with no reason.`);
      }
      if (!ruledBy || !String(ruledBy).trim()) {
        problems.push(`EMPTY EXEMPTION — ${where} has an exemption with no ruled_by.`);
      }
      if (!date || !String(date).trim()) {
        problems.push(`EMPTY EXEMPTION — ${where} has an exemption with no date.`);
      }
      if (hasTriple) {
        problems.push(
          `CONTRADICTORY ENTRY — ${where} carries BOTH a full route/data_path/rendering_spec triple AND ` +
            `an exemption. A built surface is not exempt; pick one.`,
        );
      }
      continue;
    }

    if (!hasTriple) {
      const missing = ['route', 'data_path', 'rendering_spec'].filter((k) => !entry[k]);
      problems.push(
        `INCOMPLETE ENTRY — ${where} is missing ${missing.join(', ')} and carries no exemption. Every ` +
          `register entry needs the full route/data_path/rendering_spec triple, or an exemption.`,
      );
      continue;
    }

    if (!env.fileExists(entry.route)) {
      problems.push(`MISSING FILE — ${where} route "${entry.route}" does not exist.`);
    }
    if (!env.fileExists(entry.data_path)) {
      problems.push(`MISSING FILE — ${where} data_path "${entry.data_path}" does not exist.`);
    }
    if (!env.fileExists(entry.rendering_spec)) {
      problems.push(`MISSING FILE — ${where} rendering_spec "${entry.rendering_spec}" does not exist.`);
    }
    if (env.fileExists(entry.route) && env.fileExists(entry.data_path) && !env.canReach(entry.route, entry.data_path)) {
      problems.push(
        `UNREACHABLE DATA PATH — ${where} claims data_path "${entry.data_path}", but the route ` +
          `"${entry.route}" does not import it, directly or transitively — verified by the real import ` +
          `graph, not by the path merely existing.`,
      );
    }
  }

  return problems;
}

function readRegister(root) {
  const p = join(root, REGISTER_PATH);
  const raw = readFileSync(p, 'utf8');
  const json = JSON.parse(raw);
  return Array.isArray(json.surfaces) ? json.surfaces : [];
}

export const fitnessFunction = {
  id: 'F33',
  name: 'surface-acceptance',
  description:
    'Every customer surface docs/specs/00-10 names has a surface-acceptance-register.json entry carrying ' +
    'a route, a data_path reachable from that route through the real import graph, and a rendering-guard ' +
    'fixture/smoke spec — or an exemption naming who ruled it out and when. Makes the class of defect the ' +
    '2026-08-31 gap register found by manual full-read (a spec-named surface with no route, or no data ' +
    'wiring, or no rendering coverage, and no ruling saying so) self-report the moment it happens instead ' +
    'of waiting for the next full-read.',
  source:
    'finish-plan-2026-09-02.md Wave 1 lane GATES-1 ("the acceptance gates that make gaps self-report"); ' +
    'docs/specs/00-10 (surface + required-component sections cited per entry in SPEC_SURFACES)',

  enumerate() {
    return [REGISTER_PATH];
  },

  check() {
    const root = getRepoRoot();
    let registerSurfaces;
    try {
      registerSurfaces = readRegister(root);
    } catch (err) {
      return [violation(1, `Cannot read/parse ${REGISTER_PATH}: ${err.message}`)];
    }

    const files = globFiles(['fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}']);
    const importsMap = buildImportGraph(files, (f) => readFileSync(join(root, f), 'utf8'));
    const forward = invertToForward(importsMap);

    const problems = auditSurfaceAcceptance(SPEC_SURFACES, registerSurfaces, {
      fileExists: (relPath) => existsSync(resolve(root, relPath)),
      canReach: (routePath, dataPath) => isReachable(routePath, dataPath, forward),
    });

    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
