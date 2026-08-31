// F25: MODULE LIVENESS. Every module under fsi-app/src/** and fsi-app/scripts/lib/** must have at least
// one PRODUCTION importer, be a framework entry point, or carry a reason-bearing entry here.
//
// WHY THIS EXISTS (2026-08-11). This is the mechanization of the last two unmechanized classes the
// wiring census left open (docs/audits/wiring-census-2026-08-11.md §A and §B): 22 src modules imported by
// nothing, and 14 scripts/lib modules with no non-test consumer. The census could name them; nothing
// stopped the next one appearing. Re-measured here with a real import graph rather than the census's
// grep, the count is 54.
//
// THE CLASS. remediation-discipline category 21 is about seek-more.mjs: fully built, unit-tested, ZERO
// live callers, dormant on an unactioned wake-list while the live ladder ran an inferior search. "A
// capability having a test (or even callers) does not prove it is wired into the flow that should use
// it." A test proves the module WORKS. It says nothing about whether anything CALLS it, and a green
// suite over a dormant module reads exactly like a green suite over a live one. 12 of the 54 below are
// precisely that shape: a selftest and no production importer.
//
// WHY A GRAPH, NOT A GREP. The census used basename matching, which cannot tell `@/lib/verification`
// from `@/lib/sources/verification` and cannot see `await import("...")`. This builds the graph the way
// the bundler does: extract every import/require/dynamic-import specifier, resolve `@/` through the
// tsconfig alias and `./` relatively, try the real extension list. That precision immediately paid for
// itself twice — it found src/lib/verification.ts (a 1.2 KB helper living one directory above the 50 KB
// W2.F pipeline of nearly the same name, imported by nothing) which the grep had masked, and it forced
// the entry-point list to be right.
//
// THE FALSE POSITIVE THIS ALMOST SHIPPED, recorded because the cost of getting it wrong was high.
// fsi-app/src/proxy.ts has zero importers and looks exactly like dead code. It is the Next.js 16
// middleware entry point (renamed from middleware.ts in Next 16; this repo is on 16.1.6) — it gates
// authentication for every route in the application. A gate that reported it as dead would have invited
// someone to delete the auth boundary. Framework entry points are invoked by CONVENTION, never imported,
// and the convention list below is load-bearing: adding a filename to it is a decision, not a tidy-up.
//
// SHAPE: shrinking allowlist audited in BOTH directions, the F14/F15/F22/F24 idiom. A module with no
// importer and no entry is RED. An entry whose module HAS since gained a production importer is RED (it
// got wired — delete the entry). An entry naming a file that no longer exists is RED (it got deleted —
// delete the entry). Entries carry reason + reviewByPhase. There is no number to nudge.
//
// WHAT THIS GATE DOES NOT DO, deliberately: it does not delete anything, and it does not propose
// deleting anything by itself. Dormant capability and dead code look identical to a reference graph.
// spend-regime.mjs is spend doctrine; the *-reconstruction modules are audit reconstructions; seventeen
// unmounted components are a design system somebody built ahead of the pages. Which of those to wire and
// which to remove is a product call, and every entry below says which call it is waiting on.
//
// COST: filesystem only — one pass over the tracked tree. No network, no database, no credential, no
// schedule, no model call.
//
// Holistic, so it follows the F14/F23/F24 shape: enumerate() returns a single sentinel and the whole
// analysis runs once inside check().

import { readFileSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const MANIFEST = 'docs/audits/dead-code-manifest-2026-08-11.txt';

// Framework entry points: invoked by convention, never imported. See the header note on proxy.ts.
const ENTRY_BASENAMES = [
  'page', 'layout', 'route', 'loading', 'error', 'not-found', 'template', 'default', 'global-error',
  'sitemap', 'robots', 'opengraph-image', 'twitter-image', 'icon', 'apple-icon', 'manifest',
  'middleware', 'proxy', 'instrumentation',
];
const ENTRY_RE = new RegExp(`/(?:${ENTRY_BASENAMES.join('|')})\\.(?:ts|tsx|mjs|js)$`);

export const isTestFile = (f) =>
  /\.(?:test|selftest|npmtest)\.(?:ts|tsx|mjs)$/.test(f) ||
  /\.golden\.mjs$/.test(f) ||
  f.includes('/__tests__/');

// ── The allowlist. Grouped by class; every entry carries the decision it is waiting on. ──
const COMPONENTS = [
  'resource/SectorSynopsis.tsx',
];

const PROVEN_BUT_UNWIRED = [
  'src/lib/agent/derived-consistency.mjs', 'src/lib/coverage/identity.mjs',
  'src/lib/intake/census-writer.mjs', 'src/lib/intake/intake-url-corpus.mjs',
  'src/lib/llm/metered-emit.mjs', 'src/lib/llm/program-total.mjs', 'src/lib/llm/spend-gauge.mjs',
  'src/lib/sources/amendment-diff.mjs', 'src/lib/sources/api-fetch.ts', 'src/lib/sources/change-sweep.mjs',
  'src/lib/sources/feed-walk.mjs', 'src/lib/sources/instrument-identity.ts', 'src/lib/sources/register-walk.mjs',
];

const SCRIPTS_LIB = [
  'block1-reaudit.mjs', 'bootstrap-test1.mjs', 'decision-log-audit.mjs', 'drift-check-reconstruction.mjs',
  'error-drop-probe.mjs', 'exclusion-audit-reconstruction.mjs', 'fetch-quality.mjs', 'funded-release-plan.mjs',
  'inconclusive-report.mjs', 'liveness-reconstruction.mjs', 'net-agent.mjs', 'surface-registry-reconstruction.mjs',
  'type-consumer-probe.mjs', 'urgency.mjs', 'verify-reconstruction.mjs',
];

export const LEGACY_ALLOWLIST = [
  // ── 1 component built and never mounted (16 deleted, Wave A4 2026-08-31 — full-read-audit-2026-08-31.md §5) ──
  ...COMPONENTS.map((c) => ({
    file: `fsi-app/src/components/${c}`,
    reason:
      'Built and never mounted — no page, layout or component renders it. A design system that ran ahead of the ' +
      'pages, not a breakage. Wire it into the surface it was drawn for, or delete it; leaving it is how a ' +
      'component library rots into seventeen near-duplicates nobody trusts.',
    reviewByPhase: 'ui-liveness ruling (operator: mount or delete, per component)',
  })),

  // ── 13 src/lib modules with a proof and no caller: the seek-more shape exactly ──
  ...PROVEN_BUT_UNWIRED.map((p) => ({
    file: `fsi-app/${p}`,
    reason:
      'Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal ' +
      'form: the test proves the module works and says nothing about whether the flow that should use it ever ' +
      'calls it. Either wire it into that flow or remove it with its proof — a passing test over a dormant ' +
      'module is indistinguishable from a passing test over a live one, which is what makes the class expensive.',
    reviewByPhase: 'dormant-capability ruling (operator: wire into the live flow, or delete module + proof together)',
  })),

  // ── 7 src modules with neither importer nor proof ──
  // fsi-app/src/lib/verification.ts entry REMOVED (WO-27, 2026-08-29): the dead-code ruling it
  // awaited was executed — the module (and its dead fetchXrefPairs feed chain) is deleted, not renamed.
  // fsi-app/src/types/intelligence.ts entry REMOVED (Wave A4, 2026-08-31): the dead-code ruling it
  // awaited was executed — the module is deleted, not renamed (full-read-audit-2026-08-31.md §5).
  // RETIRED 2026-08-11, same day it was listed: src/lib/llm/spend-regime.mjs was WIRED, not deleted. It was
  // the elevated entry on this list — spend doctrine with no importer — and the investigation found worse
  // than dormancy: SPEND_REGIME is a DEPLOYED Vercel env var, so the switch read as live and controlled
  // nothing. spend-guard.assertBudget now calls assertRegimeDefined() before any spend, and an undefined or
  // typo'd regime refuses to authorize paid work instead of silently falling back to build-phase rules.
  // Behaviour under build-phase is byte-identical. This gate's own staleness audit is what forced the entry
  // to be removed here in the same commit — the coupling working exactly as designed.
  {
    file: 'fsi-app/src/lib/d3/hooks-reconstruction.mjs',
    reason: 'Reconstruction of the d3 hooks behaviour, written as an audit artifact and never imported by product code.',
    reviewByPhase: 'dead-code ruling (operator: keep as audit record under docs/, or delete)',
  },
  {
    file: 'fsi-app/src/lib/dashboard/credibility.ts',
    reason: 'Dashboard credibility helper with no importer. Pre-adoption or superseded; needs a product call.',
    reviewByPhase: 'dormant-capability ruling (operator)',
  },
  {
    file: 'fsi-app/src/lib/dashboard/critical-items.ts',
    reason: 'Dashboard critical-items helper with no importer. Pre-adoption or superseded; needs a product call.',
    reviewByPhase: 'dormant-capability ruling (operator)',
  },
  {
    file: 'fsi-app/src/lib/agent/extract-research-sections.ts',
    reason:
      'Imported ONLY by a script on the dead-code manifest, so it goes fully orphan the moment the sweep lands. ' +
      'Retire this entry in the same commit as the sweep, or wire the module if the extraction is still wanted.',
    reviewByPhase: 'dead-code-sweep (docs/audits/dead-code-manifest-2026-08-11.txt)',
  },

  // ── scripts/lib: proven, never consumed ──
  ...SCRIPTS_LIB.map((s) => ({
    file: `fsi-app/scripts/lib/${s}`,
    reason:
      'Library module under scripts/lib with no production consumer — its only referrers are its own proof and/or ' +
      'scripts on the dead-code manifest. The proofs were wired into the suite on 2026-08-11, which is why they ' +
      'are green; being green is not being used.',
    reviewByPhase: 'dormant-capability ruling (operator: adopt, or delete module + proof together)',
  })),

  // ── The one with a live coupling to another gate ──
  {
    file: 'fsi-app/scripts/lib/anthropic.mjs',
    reason:
      'The rule-016 sanctioned script-side LLM wrapper, and F15\'s one SANCTIONED script-side call site. Its three ' +
      'importers are ALL on the dead-code manifest, so the sweep leaves it with zero consumers. COUPLED: when the ' +
      'sweep deletes those three, this module and its F15 SANCTIONED entry must go in the same commit, or F15 ' +
      'silently sanctions a file that no longer exists (the SANCTIONED staleness audit added to ' +
      'F15-spend-chokepoint.test.mjs on 2026-08-11 makes that RED rather than silent).',
    reviewByPhase: 'dead-code-sweep (delete with the manifest; retire the F15 SANCTIONED entry in the same commit)',
  },
  {
    file: 'fsi-app/scripts/lib/batch-primitives.mjs',
    reason: 'Batch primitives consumed only by its own proof and two manifest scripts. Same sweep coupling as anthropic.mjs.',
    reviewByPhase: 'dead-code-sweep (docs/audits/dead-code-manifest-2026-08-11.txt)',
  },

  // ── Newly coupled by Wave A4 (2026-08-31), not itself on the audit's dead-code manifest ──
  {
    file: 'fsi-app/src/lib/credibility/chip-selection.mjs',
    reason:
      'Was WORKING-WIRED at audit time (full-read-2026-08-31/L11-lib-C.md: "confirmed consumed by BiasBadge.tsx") — ' +
      'its only production importer. BiasBadge.tsx was itself confirmed dead (zero importers of BiasBadge.tsx) and ' +
      'deleted in the same Wave A4 PR as part of the whole credibility/ subsystem, which orphans this module as a ' +
      'side effect. Not on the audit\'s §5 manifest, so not deleted here — the well-tested (8 cases, not vacuous per ' +
      'the same lane report) selectBiasChipsForDisplay implementation is left in place pending a call on whether it ' +
      'has another home to wire into or should be deleted with its test in a follow-up.',
    reviewByPhase: 'dormant-capability ruling (operator: wire selectBiasChipsForDisplay elsewhere, or delete module + chip-selection.test.mjs together)',
  },
];

const ALLOWED = new Map(LEGACY_ALLOWLIST.map((e) => [e.file, e]));

const RESOLVE_EXT = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.mjs', '/index.js'];

/** Resolve an import specifier to a repo-relative path, mirroring the tsconfig `@/*` -> `./src/*` alias. */
export function resolveSpecifier(spec, fromFile, tracked) {
  let base;
  if (spec.startsWith('@/')) base = `fsi-app/src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  else return null; // bare specifier => external package
  for (const ext of RESOLVE_EXT) if (tracked.has(base + ext)) return base + ext;
  return null;
}

const SPEC_RE = /(?:\bfrom\s*|\bimport\s*|\brequire\s*)\(?\s*["'`]([^"'`\n]+)["'`]/g;

/**
 * Build target -> Set(importer). Pure over its inputs so the selftest can drive it with a constructed
 * tree instead of the live repo — the negative-test discipline F23/F24 use on themselves.
 */
export function buildImportGraph(files, readFile) {
  const tracked = new Set(files);
  const importers = new Map();
  for (const f of files) {
    if (!/\.(?:ts|tsx|mjs|cjs|js|jsx)$/.test(f)) continue;
    let src;
    try { src = readFile(f); } catch { continue; }
    for (const m of src.matchAll(SPEC_RE)) {
      const target = resolveSpecifier(m[1], f, tracked);
      if (!target || target === f) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(f);
    }
  }
  return importers;
}

/** Modules in scope with no production importer. Pure. */
export function findUnimported(scope, importers, manifest) {
  return scope.filter((f) => {
    const imp = importers.get(f) ?? new Set();
    for (const i of imp) if (!isTestFile(i) && !manifest.has(i)) return false;
    return true;
  });
}

/**
 * Pure comparator. Returns an array of message strings ([] = pass).
 */
export function auditLiveness(unimported, scope, allowed = ALLOWED, fileExists = () => true) {
  const problems = [];
  const unimportedSet = new Set(unimported);
  const scopeSet = new Set(scope);

  for (const f of unimported) {
    if (!allowed.has(f)) {
      problems.push(
        `UNWIRED MODULE — "${f}" has no production importer. Wire it into the flow that should use it, or ` +
          `delete it (with its proof, if it has one), or add a reason-bearing entry to LEGACY_ALLOWLIST in ` +
          `F25-module-liveness.mjs. A module with a passing test and no caller is indistinguishable from a live ` +
          `one, which is exactly how a capability goes dormant unnoticed.`,
      );
    }
  }

  for (const entry of allowed.values()) {
    if (!fileExists(entry.file)) {
      problems.push(
        `STALE ALLOWLIST — "${entry.file}" no longer exists (deleted). Remove its LEGACY_ALLOWLIST entry ` +
          `(reviewByPhase was "${entry.reviewByPhase}").`,
      );
      continue;
    }
    if (scopeSet.has(entry.file) && !unimportedSet.has(entry.file)) {
      problems.push(
        `STALE ALLOWLIST — "${entry.file}" now HAS a production importer; it got wired. Remove its ` +
          `LEGACY_ALLOWLIST entry so the list keeps shrinking.`,
      );
    }
    if (!entry.reason || !entry.reviewByPhase) {
      problems.push(
        `ALLOWLIST ENTRY WITHOUT A REASON — "${entry.file}" must carry both reason and reviewByPhase, same as ` +
          `F15/F22/F24. An entry with no reason is a permanent exemption wearing a temporary label.`,
      );
    }
  }

  return problems;
}

function readManifest(root) {
  const p = join(root, MANIFEST);
  if (!existsSync(p)) return new Set();
  return new Set(readFileSync(p, 'utf8').trim().split('\n').filter(Boolean));
}

export const fitnessFunction = {
  id: 'F25',
  name: 'module-liveness',
  description:
    'Every module under src/ and scripts/lib/ has a production importer, is a framework entry point, or carries a ' +
    'reason-bearing exemption. Mechanizes the last two classes the 2026-08-11 wiring census could only name: 54 ' +
    'modules with zero production importer, 13 of them carrying a green selftest — remediation-discipline ' +
    'category 21 (a capability having a test does not prove it is wired) in its literal form.',
  source:
    'wiring census 2026-08-11 §A and §B (unmechanized classes); remediation-discipline category 21 (seek-more.mjs: ' +
    'fully built, unit-tested, zero live callers)',

  // Holistic: one graph, built once. Single sentinel => check() runs once.
  enumerate() {
    return ['fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs'];
  },

  check() {
    const root = getRepoRoot();
    const manifest = readManifest(root);
    // The graph input is wider than the SCOPE: anything that could import a scoped module has to be read,
    // including scripts on the dead manifest (so their references can be identified AS dead) and the
    // discipline tree (a governance module importing product code would be a real consumer).
    const files = globFiles([
      'fsi-app/src/**/*.{ts,tsx,mjs,cjs,js,jsx}',
      'fsi-app/scripts/**/*.{mjs,js}',
      'fsi-app/.discipline/**/*.mjs',
    ]);
    const importers = buildImportGraph(files, (f) => readFileSync(join(root, f), 'utf8'));
    const scope = files.filter(
      (f) =>
        (f.startsWith('fsi-app/src/') || f.startsWith('fsi-app/scripts/lib/')) &&
        /\.(?:ts|tsx|mjs)$/.test(f) &&
        !/\.d\.ts$/.test(f) &&
        !isTestFile(f) &&
        !ENTRY_RE.test(f) &&
        !manifest.has(f),
    );
    const unimported = findUnimported(scope, importers, manifest);
    const problems = auditLiveness(unimported, scope, ALLOWED, (f) => existsSync(join(root, f)));
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
