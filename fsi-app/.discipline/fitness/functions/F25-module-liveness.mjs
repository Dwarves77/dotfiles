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
import { execFileSync } from 'node:child_process';
import { join, posix } from 'node:path';
import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { getRepoRoot } from '../../lib/context.mjs';

const MANIFEST = 'docs/audits/dead-code-manifest-2026-08-11.txt';

// ── WAVE W7.1 WIDENING (2026-09-04, lane F25-WIDE, docs/plans/complete-system-build-plan-2026-09-04.md
// §W7.1; method per docs/audits/wiring-audit-2026-09-04/B1-modules.md). THE GAP THIS CLOSES: B1's own
// "Method" section read this exact file and named its scope as the reason the census/ratification half of
// the loop (four scripts/review/apply-*.mjs) and 65 other modules could sit unwired with every fitness
// gate green — nothing outside src/**+scripts/lib/** was in this check's SCOPE at all, so "0 importers, no
// workflow" modules under scripts/mint, scripts/turns, scripts/maintenance, scripts/review,
// scripts/spec09, scripts/gen, scripts/connections, scripts/entities, scripts/producers, and every
// .discipline/** governance/rendering module were structurally invisible to this gate. SCOPE now covers
// fsi-app/src/**, fsi-app/scripts/** (all subdirectories, not just lib/), and fsi-app/.discipline/**.
//
// WHY WIDENING ALONE WOULD HAVE BEEN WRONG: most of scripts/** is CLI entry points invoked by
// `node scripts/x.mjs` from a GitHub Actions `run:` step, never imported by another module — B1's Method
// section is explicit that "0 importers" is NORMAL AND EXPECTED for a correctly-wired driver, and the
// import graph alone cannot see that. Two more blind spots B1 found and corrected by hand: (a) four
// .discipline/rendering/smoke/stub-*.mjs files are resolved through an esbuild module-alias table (a
// string constant), never a static `import` specifier; (b) a documented, artifact-proven MANUAL procedure
// (screen-worklist.mjs, run by hand per MINT-RUNBOOK.md, proven by scripts/harness-runs/screen/*.json)
// is real and used despite having neither an importer nor a workflow line. findDispatchRoots() below
// mechanizes (a) and the workflow/package.json half of B1's method; the (b) class (proven only by a
// harness-run artifact, not by any static reference) is not mechanically detectable from source text alone
// and is instead carried as a named, reason-bearing LEGACY_ALLOWLIST entry — same treatment B1 itself gave
// it.
export function findDispatchRoots(
  root,
  readFileFn = (f) => readFileSync(join(root, f), 'utf8'),
  listFilesFn = globFiles,
) {
  const roots = new Set();
  // Path-based, not `node `-prefixed: B1's own Method section is explicit that it "grepped for the
  // file's repo-relative path" across every workflow, not only literal `node x.mjs` invocations — several
  // real dispatch shapes never look like that (a `run:` step building an `args=` string that a LATER line
  // executes via `node $args`; a step comment naming the exact path it wires, which B1 itself counted as
  // evidence). Matching the bare path is what makes this resolver agree with B1's own verdicts instead of
  // a stricter regex silently disagreeing with the audit it is meant to mechanize.
  const MJS_PATH_RE = /((?:fsi-app\/)?(?:scripts|\.discipline)\/[\w./-]+\.mjs)/g;
  const normalize = (p) => (p.startsWith('fsi-app/') ? p : `fsi-app/${p}`);

  // Source 1: every `.github/workflows/*.yml` — dispatch by CI (population-turn.yml, corpus-turn.yml,
  // source-sweep.yml, ledger-consume.yml, change-detection.yml, propagation-drain.yml, producers.yml,
  // maintenance.yml, discipline.yml, source-monitoring.yml, etc).
  for (const wf of listFilesFn(['.github/workflows/*.yml'])) {
    let text;
    try { text = readFileFn(wf); } catch { continue; }
    for (const m of text.matchAll(MJS_PATH_RE)) roots.add(normalize(m[1]));
  }

  // Source 2: fsi-app/package.json's own "scripts" section (e.g. `perf:bundles` -> measure-bundles.mjs) —
  // a dispatch root by `npm run <name>`, the same "reachable by a human hitting dispatch" shape B1's
  // top-line findings describe for the workflow_dispatch-only loop stages.
  try {
    const pkg = JSON.parse(readFileFn('fsi-app/package.json'));
    for (const cmd of Object.values(pkg.scripts || {})) {
      for (const m of String(cmd).matchAll(MJS_PATH_RE)) roots.add(normalize(m[1]));
    }
  } catch { /* no package.json scripts to mine — not fatal */ }

  // Source 3: esbuild module-alias tables under .discipline/rendering — every `stub-*.mjs` filename
  // literal (however it is embedded: `join(HERE, 'stub-x.mjs')`, a template literal, a STUBS map value)
  // names a real alias TARGET resolved at bundle time, invisible to the static import-specifier scan. All
  // shipped stub files live in .discipline/rendering/smoke/; a stub introduced elsewhere under
  // .discipline/rendering/ is still caught (the glob covers the whole subtree) but the reference itself is
  // the file's own name wherever it appears, so this does not depend on which file DECLARES the alias.
  const STUB_RE = /stub-[\w-]+\.mjs/g;
  for (const f of listFilesFn(['fsi-app/.discipline/rendering/**/*.mjs'])) {
    let text;
    try { text = readFileFn(f); } catch { continue; }
    for (const m of text.matchAll(STUB_RE)) roots.add(`fsi-app/.discipline/rendering/smoke/${m[0]}`);
  }

  // Source 4: scripts/verify/run-data-audit-lane.mjs's own `AUDITS` string table — a dispatch mechanism
  // distinct from a static import OR a literal workflow path: ~28 scripts/verify/*-audit.mjs files are
  // named as `["label", "scripts/verify/x-audit.mjs", hardFlag]` entries and run by
  // `.github/workflows/data-audit-lane.yml` via this ONE indirection. Deliberately narrow (only this one
  // file's own AUDITS array, the same regex `.discipline/governance/execution-wiring.mjs`'s own
  // `auditLaneSet()` uses for the identical table — cited, not copied verbatim into general use) rather
  // than reusing execution-wiring's full `isExecutionWired()`: that resolver's fitness-sentinel surface
  // scans every fitness function file (F25-module-liveness.mjs included) for ANY `.mjs` path string
  // literal, which would self-match this very file's own LEGACY_ALLOWLIST entries and silently mark them
  // "wired" the moment they are written down — a false positive this module cannot risk on itself.
  try {
    const src = readFileFn('fsi-app/scripts/verify/run-data-audit-lane.mjs');
    for (const m of src.matchAll(/\[\s*"[^"]+"\s*,\s*"([^"]+\.mjs)"\s*,/g)) roots.add(normalize(m[1]));
  } catch { /* run-data-audit-lane.mjs itself is scope-checked like any other module; absence is its own violation */ }

  // Source 5: behavioral goldens (run-goldens.mjs auto-discovers every `*.golden.mjs`/`*-golden.mjs`
  // under scripts/verify/ — the same suffix coverage-scan.mjs's own PROOF_RE and execution-wiring.mjs's
  // own goldensMatcher() use). isTestFile() (this file, above) does NOT classify a `-golden.mjs` suffix as
  // a test — that convention predates this widening and changing it would ripple into every existing
  // golden in the repo, well outside this lane's write set — so a golden with no static importer would
  // otherwise misread as an unwired MODULE despite being a wired, executed PROOF. Named as a dispatch root
  // here instead, which fixes the widened scope's blind spot without touching isTestFile()'s contract.
  for (const f of listFilesFn(['fsi-app/scripts/verify/**/*.mjs'])) {
    if (/(?:\.golden|-golden)\.mjs$/.test(f)) roots.add(f);
  }

  // Source 6 (lane W7.1-CLOSE, 2026-09-05): the tracked hook SOURCES install-hooks.mjs copies
  // byte-for-byte into .git/hooks/ — fsi-app/.discipline/hooks/{pre-commit,pre-push,post-checkout,
  // commit-msg}. install-hooks.mjs itself is an operator-run installer with no static importer of these
  // files (it copies them as opaque text via readFileSync/writeFileSync, never an import specifier), so
  // the import graph cannot see this dispatch shape at all. [CONFIRMED] this lane: reading every hook
  // source found post-checkout and pre-commit both run
  // `exec node "$REPO_ROOT/fsi-app/.discipline/governance/worktree-isolation-hook.mjs"`, and pre-push's
  // step 3c runs `node fsi-app/.discipline/governance/check-pretooluse-wired.mjs` — real, live
  // invocations once the hooks are installed, not merely advisory text (contrast: pre-push's step-3c
  // FAILURE message only *prints* a suggestion to run wire-pretooluse-settings.mjs in an echo string —
  // that is not an invocation and does NOT make wire-pretooluse-settings.mjs a dispatch root; nor does
  // check-pretooluse-wired.mjs's own doc-comment mention of pretooluse-skill-gate.mjs, which is read only
  // via ~/.claude/settings.json, outside this repo, never a tracked path). Matches the same MJS_PATH_RE
  // already used for Source 1, scoped to the four tracked hook files.
  const HOOK_SOURCE_FILES = ['pre-commit', 'pre-push', 'post-checkout', 'commit-msg'];
  for (const name of HOOK_SOURCE_FILES) {
    const rel = `fsi-app/.discipline/hooks/${name}`;
    let text;
    try { text = readFileFn(rel); } catch { continue; }
    if (!text) continue;
    // Comment/echo-line-filtered, not whole-text like Source 1: a shell hook can `echo` advice naming a
    // script it does NOT run (pre-push's step-3c failure message tells the operator to run
    // wire-pretooluse-settings.mjs by hand — that is text, not an invocation), and treating an echoed
    // suggestion as a dispatch root would wrongly mark an unreached script reachable. Whole-text (not
    // per-line) matching is still needed on what remains: the real invocations here are a two-line
    // indirection (`RUNNER="$REPO_ROOT/.../x.mjs"` on one line, `exec node "$RUNNER"` on the next), so
    // requiring `node` on the SAME line as the path would miss the genuine case while only echo lines
    // needed excluding.
    const invocationText = text
      .split('\n')
      .filter((line) => { const t = line.trim(); return t && !t.startsWith('#') && !t.startsWith('echo'); })
      .join('\n');
    for (const m of invocationText.matchAll(MJS_PATH_RE)) roots.add(normalize(m[1]));
  }

  // Source 7 (lane W71-A, 2026-09-05, docs/plans/complete-system-build-plan-2026-09-04.md §W7 /
  // docs/audits/wiring-audit-2026-09-04/B1-modules.md; widened lane F25-WAVE52, 2026-09-07, per
  // docs/audits/f25-wave52-dispositions-2026-09-07.md): OUT-OF-REPO-BOUNDARY.md is itself the in-repo
  // registry of tools invoked from OUTSIDE any workflow, package.json script, or import graph — a git
  // hook's shared settings.json, or a human at a terminal. Its two markdown tables (the boundary-
  // dependency table and the "Operator-CLI register" beneath it) name every such tool in backticked
  // `governance/*.mjs` / `dispatch/*.mjs` / `install-hooks.mjs` paths; the registry row IS the
  // reachability evidence, the same "a documented indirection is itself dispatch-root evidence" shape
  // Source 4 and Source 6 already use for run-data-audit-lane.mjs's AUDITS table and the tracked hook
  // sources, respectively. WIDENED (lane F25-WAVE52) to also recognize backticked `_reground/*.mjs`
  // rows: the 2026-07-16 "_reground" CLI toolkit (operator ruling / amendment 2026-07-16) is the exact
  // same shape — hand-run, per-item, no schedule, no workflow line — serving the still-ACTIVE Unit-3
  // quarantine drain (docs/PROGRAM-BOARD.md §2, deferred to 2026-10-31, not closed), not a discharged
  // one-shot. Registering it in the SAME table as install-hooks.mjs/dispatch/*.mjs rather than inventing
  // a parallel mechanism keeps "operator-invoked, out-of-workflow" as ONE recognized shape, not two.
  // parseBoundaryRegistryPaths() is factored out (not inlined) so F25-module-liveness.test.mjs can
  // assert every parsed path resolves against the REAL file, which is what keeps this registry from
  // rotting silently the way a plain doc reference could.
  try {
    const text = readFileFn('fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md');
    for (const p of parseBoundaryRegistryPaths(text)) roots.add(p);
  } catch { /* registry absent is its own violation surface, not this resolver's job to hide */ }

  // Source 8 (lane W71-A, 2026-09-05): subprocess-spawn dispatch. A script already known to be a
  // dispatch root (via any source above) that computes a SIBLING script's path with this repo's own
  // `resolve(HERE, 'x.mjs')` convention (HERE = `dirname(fileURLToPath(import.meta.url))`) and passes it
  // to `spawnSync`/`execFileSync` makes that target reachable too — a real `node <path>` child-process
  // invocation neither the static import graph (it is not an import specifier) nor Source 1 (the
  // TARGET's own path is never a string literal in any workflow file; only the SPAWNING script's path
  // is) can see. Concrete instance this closes: `.discipline/consistency/override-check.mjs` (a Source-1
  // dispatch root via `.github/workflows/discipline.yml`'s "Consistency backstop" job and
  // `.discipline/hooks/pre-push`) spawns `.discipline/consistency/runner.mjs` this exact way — a plainly
  // wired module by subprocess dispatch, not a registry/operator-CLI exemption (see
  // OUT-OF-REPO-BOUNDARY.md's own note on this). Fixed-point over the growing root set: a spawn chain
  // more than one hop deep would otherwise need its own hand-added source.
  const RESOLVE_HERE_RE = /resolve\(\s*HERE\s*,\s*['"`]([\w.-]+\.mjs)['"`]\s*\)/g;
  let grew = true;
  while (grew) {
    grew = false;
    for (const spawnRoot of Array.from(roots)) {
      let text;
      try { text = readFileFn(spawnRoot); } catch { continue; }
      if (!/spawnSync|execFileSync/.test(text)) continue;
      const dir = posix.dirname(spawnRoot);
      for (const m of text.matchAll(RESOLVE_HERE_RE)) {
        const target = posix.join(dir, m[1]);
        if (!roots.has(target)) { roots.add(target); grew = true; }
      }
    }
  }

  return roots;
}

// Every backticked path under governance/, dispatch/, or consistency/, or the bare `install-hooks.mjs`
// literal, or (lane F25-WAVE52) under _reground/, appearing anywhere in OUT-OF-REPO-BOUNDARY.md's
// markdown tables — factored out of findDispatchRoots's Source 7 so its own unit test can assert every
// parsed path resolves against the real tree (a row naming a deleted or renamed file would otherwise rot
// silently). _reground/*.mjs rows resolve under fsi-app/scripts/ (their real tree location), every other
// matched prefix under fsi-app/.discipline/ as before.
export function parseBoundaryRegistryPaths(text) {
  // Opening backtick required (a real inline-code span, not prose), but NOT a closing one immediately
  // after `.mjs` — the boundary-dependency table's own applier cell is `` `governance/
  // wire-pretooluse-settings.mjs --apply` `` (a CLI invocation with flags inside the same code span), so
  // anchoring to the closing backtick would miss it.
  const RE = /`((?:governance|dispatch|consistency|_reground)\/[\w.-]+\.mjs|install-hooks\.mjs)\b/g;
  const found = new Set();
  for (const m of text.matchAll(RE)) {
    const p = m[1];
    found.add(p.startsWith('_reground/') ? `fsi-app/scripts/${p}` : `fsi-app/.discipline/${p}`);
  }
  return [...found];
}

// Latest landed train/wave number, read from `git log --oneline origin/master` (the expiry oracle named
// by docs/plans/complete-system-build-plan-2026-09-04.md §W7.1). Returns null (never throws) when the
// history is unavailable — the CI fitness-check job runs a DELIBERATELY shallow checkout ("fitness
// functions scan the working tree ... do not consult git history", .github/workflows/discipline.yml) and
// typically will not have an `origin/master` ref to read; a HEAD-only fallback covers the common case
// where the checked-out commit IS itself a landed train commit (`git log` needs no network, only the
// commits already present locally). Expiry enforcement is therefore best-effort in the shallow CI job and
// exact in any full checkout (this worktree, the "Consistency layer" job, a coordinator's local run) — a
// known, named degradation rather than a silent one, same posture as F9's own tool-availability handling.
export function latestTrainWave(root, exec = execFileSync) {
  for (const ref of ['origin/master', 'HEAD']) {
    try {
      const out = exec('git', ['log', '--oneline', ref], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      let max = null;
      for (const m of out.matchAll(/\bwave(\d+)\b/gi)) max = Math.max(max ?? 0, Number(m[1]));
      if (max !== null) return max;
    } catch { /* try the next ref */ }
  }
  return null;
}

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

// Wave W2 (2026-09-01, unwired-module disposition register docs/plans/unwired-disposition-2026-08-31.md
// §A/§B, wires #2 and #5): 'src/lib/agent/derived-consistency.mjs' and 'src/lib/llm/spend-gauge.mjs'
// REMOVED from this list — both now have a real production importer (canonical-pipeline.ts:~1738 and
// health/spend/route.ts respectively), so F25 enforces their liveness going forward instead of
// exempting it. Leaving either entry in place after wiring would itself trip the STALE ALLOWLIST check
// below ("now HAS a production importer; it got wired").
// 'src/lib/sources/amendment-diff.mjs' and 'src/lib/sources/change-sweep.mjs' REMOVED (lane CD,
// change-detection chain repair, 2026-09-01): both now have real production importers.
// change-sweep.mjs's bridgeChangedSourceToStagedUpdates is called from src/lib/sources/reconcile.ts's
// runReconcilePass (itself now called from src/app/api/worker/check-sources/route.ts, in-process, and
// from the manual-redrive /api/worker/reconcile route) — no longer a selftest-only module. change-sweep.mjs
// imports amendment-diff.mjs's diffDocuments directly for that same bridge, which is what gives
// amendment-diff.mjs its own first production importer (previously proven only by its own test).
// Lane HYG-2 (2026-09-02) re-audited every entry below against the live import graph and the Aug-31 W1
// disposition register (docs/plans/unwired-disposition-2026-08-31.md — finish-plan R-C "accept as
// delivered"): every file still exists and is still exactly as unwired as the register found it (6 of
// the register's WIRE/DELETE/HOLD/KEEP rows map onto entries here; execution of a WIRE or DELETE
// disposition is MAINT's job, not this lane's write set, which is this file only — so the entry stays
// until MAINT lands it, annotated with which row and recommendation it is waiting on).
// 'src/lib/sources/feed-walk.mjs' and 'src/lib/sources/register-walk.mjs' (register #13-16, HOLD as of
// 2026-08-31 pending an unpriced crawl orchestrator) are NOT re-added here — checked this session: both
// now have a real production importer, scripts/turns/run-source-sweep.mjs, so the orchestrator the
// register found missing has since landed and F25 enforces their liveness going forward.
const PROVEN_BUT_UNWIRED = [
  {
    file: 'src/lib/coverage/identity.mjs',
    disposition:
      'W1 register #8: WIRE (call from census-writer.mjs:73), but explicitly sequenced behind #11 — "only ' +
      'takes effect once census-writer.mjs itself has a caller." #11 is still HOLD, so this stays unwired.',
  },
  {
    file: 'src/lib/intake/census-writer.mjs',
    disposition:
      'W1 register #11: HOLD (crawl-rebuild scope, ADR-015 §5 — "no build proceeds until the operator ' +
      'prices wave-one sizing"). Correct, tested, waiting on an unfunded orchestrator, not a wiring gap.',
  },
  {
    file: 'src/lib/intake/intake-url-corpus.mjs',
    disposition:
      'W1 register #17: KEEP, no action — a data-only golden-fixture file with no production call site to ' +
      'be "wired" into; the register names this class a graph-tool false positive, same family as ' +
      'src/proxy.ts\'s framework-entry-point exemption above.',
  },
  // 'src/lib/llm/metered-emit.mjs' entry REMOVED (lane DEAD-EXEC, 2026-09-04): the W1 register #3
  // DELETE disposition was executed — the module and its test are gone, with them (the
  // batch-classification runner it existed to gate was never built anywhere in the repo).
  {
    file: 'src/lib/llm/metered-gate.mjs',
    disposition:
      'W1 register #4: KEEP, no action, explicitly anticipating this exact moment — "its disposition is ' +
      'entirely downstream of #3 ... If #3 is deleted, leave this module in place — it\'s the law a future ' +
      'batch-classification build would need to satisfy, and deleting sound doctrine to match a deleted ' +
      'implementation is the wrong direction." Its one real caller was metered-emit.mjs (register #3, ' +
      'DELETE, executed lane DEAD-EXEC 2026-09-04, entry above); the register itself verified ' +
      '`admin/promotion-policy/route.ts` and `health/spend-health.mjs` only *mention* "metered-gate" in ' +
      'comments, never import it. Newly unwired as a direct, verified consequence of #3\'s deletion — added ' +
      'here the same commit that removed #3\'s own entry, per this register\'s own explicit instruction.',
  },
  {
    file: 'src/lib/llm/program-total.mjs',
    disposition:
      'W1 register #1: WIRE, but explicitly low-urgency — "wire it in the same change that ever gives ' +
      'seedSpend its first real caller; don\'t invent a caller just to hang this on." Pending MAINT execution.',
  },
  // 'src/lib/sources/api-fetch.ts' entry REMOVED (lane DEAD-EXEC, 2026-09-04): the W1 register #12
  // DELETE disposition was executed — superseded by canonical-pipeline.ts's own inline apiFetchForHost,
  // which already did the live work; this was a parallel, unused implementation, not an
  // orchestrator-blocked module like its scripts/lib/sources siblings.
  { file: 'src/lib/sources/instrument-identity.ts', disposition: null }, // not covered by the Aug-31 register
  {
    file: 'src/lib/contracts/corridor-id.mjs',
    disposition:
      'Newly unwired as a direct, verified side effect of lane W71-C (2026-09-05) deleting ' +
      'scripts/gen/migration-258.mjs (the migration-258 generator was this module\'s only production ' +
      'importer, via renderCorridorIdSql() — the migration itself is applied live and unaffected). Same ' +
      'shape as provenance-envelope.mjs\'s own entry below: a genuinely reusable identity module ' +
      '(corridorId(), validateCorridorSpec(), isSameCorridor() — runtime logic, not just SQL codegen), not ' +
      'a one-shot, with a concrete named future consumer — migration 258\'s own inventory row states ' +
      '"deliberately NO factor rows... a separate, independently-verified data unit"; whichever lane loads ' +
      'corridor-scoped emission-factor data is this module\'s real caller. Its src/__tests__/' +
      'contracts-corridor-id.test.mjs proof stays wired via the src/__tests__/*.test.mjs glob regardless. ' +
      'No expiry granted (lane W71-C\'s brief forbids adding one) — wire it into that future loader, or ' +
      'delete it with its test if that loader never materializes.',
  },
];

// SCRIPTS_LIB (the 15 "proven, never consumed" scripts/lib entries) ARCHIVED 2026-09-01 (lane hyg,
// task 6): git mv'd to scripts/_archive/lib/** (content untouched; tombstoned in
// scripts/_archive/README.md). Archiving moves them out of this gate's scope by construction — the
// scope filter below requires 'fsi-app/scripts/lib/', and scripts/_archive/ never matches it — so the
// entries are removed rather than kept as now-stale allowlist rows.

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

  // ── 7 src/lib modules with a proof and no caller: the seek-more shape exactly ──
  ...PROVEN_BUT_UNWIRED.map((p) => ({
    file: `fsi-app/${p.file}`,
    reason:
      'Has a selftest, has NO production importer. This is remediation-discipline category 21 in its literal ' +
      'form: the test proves the module works and says nothing about whether the flow that should use it ever ' +
      'calls it. Either wire it into that flow or remove it with its proof — a passing test over a dormant ' +
      'module is indistinguishable from a passing test over a live one, which is what makes the class expensive.' +
      (p.disposition ? ` DISPOSITION (docs/plans/unwired-disposition-2026-08-31.md): ${p.disposition}` : ''),
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
  // fsi-app/src/lib/d3/hooks-reconstruction.mjs, fsi-app/src/lib/dashboard/{credibility,critical-items}.ts,
  // fsi-app/src/lib/agent/extract-research-sections.ts entries REMOVED 2026-09-01 (lane hyg, task 6):
  // git mv'd to src/_archive/lib/** (content untouched; tombstoned in scripts/_archive/README.md). Same
  // "moved out of scope" logic as the scripts/lib archival below — the scope filter's `!f.includes('/_archive/')`
  // exclusion (added the same commit) keeps them out for good.

  // ── scripts/lib: 4 modules ORPHANED AS A DIRECT, VERIFIED CONSEQUENCE of the 2026-09-01 scripts/lib
  // archival above (F25's own buildImportGraph, re-run after the archival: each lost its one real
  // importer — decision-log-audit.mjs / exclusion-audit-reconstruction.mjs / inconclusive-report.mjs /
  // liveness-reconstruction.mjs, respectively, all now archived). NOT archived themselves: 3 of the 4
  // (decision-anchors.mjs, exclusion-audit.mjs, inconclusive-probe.mjs) have their *.selftest.mjs
  // hard-named in .github/workflows/discipline.yml's "App unit tests requiring npm deps" step (lines
  // ~303-307) — moving the module out from under that pinned path breaks a live CI job this lane's write
  // set forbids editing (.github/**). liveness.mjs carries no such CI pin (only named in
  // .discipline/run-test-suite.sh, which this lane could freely edit) but is grouped here rather than
  // archived alone, for symmetry with its three orphaned-the-same-way siblings — a product call on the
  // whole small cluster together reads better than archiving one quarter of it. verify.mjs, drift-check.mjs,
  // surface-registry.mjs, fetch-negative-probe.mjs (also read/imported by this cluster) are UNAFFECTED —
  // each retains a real, non-archived importer among the four modules below or each other, verified the
  // same way.
  {
    file: 'fsi-app/scripts/lib/decision-anchors.mjs',
    reason:
      'Orphaned 2026-09-01 when this lane archived its sole importer, scripts/lib/decision-log-audit.mjs ' +
      '(scripts/_archive/lib/decision-log-audit.mjs). Not archived itself: decision-anchors.selftest.mjs is ' +
      'hard-named in .github/workflows/discipline.yml\'s npm-deps test step — moving the module breaks that ' +
      'CI-pinned path, and this lane\'s write set forbids editing .github/**.',
    reviewByPhase: 'dormant-capability ruling (operator: wire into a live flow, or retire the CI pin + module + proof together — needs a lane with .github/** in its write set)',
  },
  {
    file: 'fsi-app/scripts/lib/exclusion-audit.mjs',
    reason:
      'Orphaned 2026-09-01 when this lane archived its remaining production importers, ' +
      'scripts/lib/block1-reaudit.mjs, bootstrap-test1.mjs, and exclusion-audit-reconstruction.mjs (all now ' +
      'under scripts/_archive/lib/). Not archived itself: exclusion-audit.selftest.mjs is hard-named in ' +
      '.github/workflows/discipline.yml\'s npm-deps test step — same CI-pin blocker as decision-anchors.mjs above.',
    reviewByPhase: 'dormant-capability ruling (operator: wire into a live flow, or retire the CI pin + module + proof together — needs a lane with .github/** in its write set)',
  },
  {
    file: 'fsi-app/scripts/lib/inconclusive-probe.mjs',
    reason:
      'Orphaned 2026-09-01 when this lane archived its sole importer, scripts/lib/inconclusive-report.mjs ' +
      '(scripts/_archive/lib/inconclusive-report.mjs). Not archived itself: inconclusive-probe.selftest.mjs is ' +
      'hard-named in .github/workflows/discipline.yml\'s npm-deps test step — same CI-pin blocker as ' +
      'decision-anchors.mjs above.',
    reviewByPhase: 'dormant-capability ruling (operator: wire into a live flow, or retire the CI pin + module + proof together — needs a lane with .github/** in its write set)',
  },
  {
    file: 'fsi-app/scripts/lib/liveness.mjs',
    reason:
      'Orphaned 2026-09-01 when this lane archived its sole importer, scripts/lib/liveness-reconstruction.mjs ' +
      '(scripts/_archive/lib/liveness-reconstruction.mjs). No CI pin on liveness.selftest.mjs (only named in ' +
      'run-test-suite.sh, freely editable) — grouped with its three CI-pinned siblings above rather than ' +
      'archived alone, so the operator rules on the whole small orphaned cluster together.',
    reviewByPhase: 'dormant-capability ruling (operator: wire into a live flow, or delete module + proof together)',
  },

  // 'fsi-app/scripts/lib/anthropic.mjs' entry REMOVED (lane DEAD-EXEC, 2026-09-04): the coupled DELETE
  // named here (docs/plans/unwired-disposition-2026-08-31.md #18) was executed — the module, its rule-016
  // PERMITTED entry, and its F15 SANCTIONED entry all went in the same commit, exactly as this entry's
  // own coupling note required (the F15 SANCTIONED staleness audit stayed green throughout because all
  // three moved together).
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

  // Meta-harness substrate entry (scripts/lib/run-artifact.mjs) REMOVED (Wave MH-2, 2026-09-01): the
  // wiring it was waiting on landed on schedule — screen-worklist.mjs now imports writeRunArtifact/
  // hashHarnessVersion from it directly (its own execution path, per build plan §2's "emission is in the
  // harness"), giving it a real production importer. The entry said to remove it "the same wave those
  // callers land" — this is that wave.

  // fsi-app/src/lib/entities/decisions.mjs entry REMOVED (Lane DP-ENGINE, 2026-09-02, system-completion
  // train): the wiring it was published for landed on schedule — admissible-for.ts (below) now imports
  // FLOOR from it directly, giving it a real production importer. The entry said to remove it once Lane
  // DP-ENGINE or DP-SURF lands an import — this is that lane.

  // fsi-app/src/lib/propagation/admissible-for.ts entry REMOVED (Lane DP-SURF, 2026-09-02, system-
  // completion train): the wiring it was published for landed on schedule — StatutoryFigure.tsx,
  // EstimatedFigure.tsx and DerivedFigure (same file) all now import admissibleFor() from it directly
  // ("the one gate," spec §3.3), giving it real production importers. The entry said to remove it once a
  // later lane in the train lands a real caller — this is that lane.

  // ── Lane DP-SURF (2026-09-02, system-completion train): Layer 4's statutory render component, no
  // consuming page landed in THIS lane's own scope (a FuelEU Annex IV filing surface is a future lane's
  // build, not this one's — this lane's write set built the formula, the type barrier and the render
  // component, not an obligations/filing page to mount it on) ──
  {
    file: 'fsi-app/src/components/figures/StatutoryFigure.tsx',
    reason:
      'Layer 4 of spec §4\'s statutory/estimate isolation (a separate render component for a filing-grade ' +
      'figure, never sharing a visual slot with EstimatedFigure) — published for whichever lane next wires ' +
      'a real obligation/filing page (e.g. a FuelEU Annex IV penalty computed via ' +
      'src/lib/statutory/types.ts\'s computeStatutory(), migration 286\'s statutory_computations). This ' +
      'lane\'s own write set (docs/specs/08-flywheel-design.md, this train) built the formula ' +
      '(fueleu-annex-iv.mjs), the type barrier (types.ts) and this component — not a filing page to mount ' +
      'it on, which was never in scope here. Same published-contract-ahead-of-its-caller shape as ' +
      'admissible-for.ts\'s own (now-removed) entry above.',
    reviewByPhase: 'system-completion train (operator: remove this entry once a later lane lands a real caller — if none has by the train\'s close, treat as a real orphan)',
  },

  // ── Lane DP-SURF (2026-09-02, system-completion train): a compile-time-only tsc proof, never meant to
  // be imported at runtime by ANY caller, production or otherwise ──
  {
    file: 'fsi-app/src/lib/statutory/types.contractable-barrier.check.ts',
    reason:
      'This file exists ONLY to be type-checked (`npx tsc --noEmit`), never executed — its two ' +
      'computeStatutory() calls (one clean, one carrying a deliberate `// @ts-expect-error` on a modelled ' +
      'field) exist to PROVE Layer 2\'s compile-time barrier (spec §4: "passing a modelled value does not ' +
      'type-check") actually rejects at the type level, not just in a runtime test. A module whose entire ' +
      'purpose is being read by the compiler and never by Node has no production importer BY DESIGN — ' +
      'F25\'s own "unwired = dormant" concern does not apply (a dormant capability is one nothing calls at ' +
      'runtime when it should; this one is never meant to run). See the file\'s own header for the same ' +
      'note from its own side.',
    reviewByPhase: 'n/a — this file is never meant to gain a production importer; re-review only if the file itself is deleted or its proof role changes',
  },

  // Lane DP-ENGINE's aggregate-safeguards.mjs allowlist entry (system-completion train, 2026-09-02) was
  // REMOVED here (Lane COMMUNITY-A, Wave 3, 2026-09-03) — F25 itself flagged it STALE: src/lib/community/
  // antitrust.mjs (dominanceCap()) now imports computeDominanceShare from it, and antitrust.mjs is a real
  // production importer (src/app/api/community/posts/route.ts). See antitrust.mjs's own header for why
  // this reuse happens rather than a second reimplementation.

  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // WAVE W7.1 WIDENING (2026-09-04, lane F25-WIDE): every module the newly-widened scope
  // (scripts/** in full, .discipline/**) flags TODAY, measured against THIS tree (wave36,
  // e8cb748f) by actually running the widened check — not hand-predicted from the audit. Source for
  // every disposition + train is docs/plans/complete-system-build-plan-2026-09-04.md §W7.1 and
  // docs/audits/wiring-audit-2026-09-04/B1-modules.md Appendix A ("no" rows) unless noted otherwise.
  // Each entry carries `disposition` ({kind: 'wire'|'delete'|'one-shot', detail}) and `expiry` (a
  // train/wave number): auditLiveness() reds the entry once latestTrainWave() reaches or passes
  // `expiry`, forcing a real wire-or-delete instead of a permanent exemption wearing a temporary label.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  ...(() => {
    const w = (file, plan, expiry, reason) => ({
      file: `fsi-app/${file}`,
      reason,
      reviewByPhase: `W7.1 ratchet (operator/coordinator: wire per ${plan}, or delete with its test, before wave${expiry})`,
      disposition: { kind: 'wire', detail: plan },
      expiry,
    });
    const d = (file, plan, expiry, reason) => ({
      file: `fsi-app/${file}`,
      reason,
      reviewByPhase: `W7.1 ratchet (operator/coordinator: delete per ${plan} before wave${expiry})`,
      disposition: { kind: 'delete', detail: plan },
      expiry,
    });
    const o = (file, reasonDetail, expiry, reason) => ({
      file: `fsi-app/${file}`,
      reason,
      reviewByPhase: `W7.1 ratchet (one-shot: ${reasonDetail}; re-review before wave${expiry})`,
      disposition: { kind: 'one-shot', detail: reasonDetail },
      expiry,
    });
    return [
      // NOTE (lane W71-WIRE, 2026-09-05): skill-contract-map.mjs, propose-classifications.mjs,
      // generate-theme-brief.mjs, ratify-flag-to-census.mjs, the migration-267/268/271 generators,
      // assumption-register-seed.mjs, backfill-lineage-edges.mjs, held-classes.mjs, screen-worklist.mjs,
      // build-oil-bulletin-rows.mjs, ratify-series-items.mjs and verification-audit-report.mjs were all
      // W7.1-allowlisted here. Each is now either wired (discipline.yml / maintenance.yml / producers.yml
      // run: line — F25's own dispatch-root detection now finds it, so keeping the entry would itself go
      // STALE) or deleted with its test (migration-267/268/271 generators + their contracts-*.test.mjs;
      // held-classes.mjs + its test). See docs/runbooks/MAINTENANCE-RUNBOOK.md and
      // docs/inventories/migrations.md for the per-module disposition and this lane's report for the full
      // §0 evidence trail.
      //
      // SIDE-EFFECT OF THE ABOVE, caught by re-running F25 after deleting the three migration generators
      // (not itself a named W7.1 target — flagged and fixed in the same lane per the operator's "no small
      // follow-up fix, fix it now" ruling): deleting migration-267/268/271-*.mjs left
      // src/lib/contracts/provenance-envelope.mjs with zero PRODUCTION importers (its only production
      // callers were those three now-deleted generators; the six *-composition/*-parser.test.mjs files
      // that still import ORIGIN_CLASS_VALUES/DERIVATION_VALUES from it are test-only, so F25 correctly
      // does not count them). Judgment call, recorded rather than silently exempted: this module is a
      // genuinely reusable DDL renderer (renderEnvelopeDDL et al.), not a one-shot — WO-17 ("Operations
      // facts for EU + US, envelope-first", complete-system-build-plan-2026-09-04.md) is a concrete named
      // future consumer that will need the SAME envelope-rendering logic 267/268/271 already proved;
      // deleting this module now would force that lane to reinvent byte-identical DDL-generation code,
      // the exact duplicated-logic failure the "one module every caller imports" ruling exists to prevent
      // in the other direction. Allowlisted with an expiry (not exempted permanently) so a future lane
      // must either wire it into WO-17's migration generator when that lands, or delete it if WO-17 never
      // materializes by then.
      // scripts/spec09/{auxiliary-energy,dqi,indexation,surcharge-audit}-producer.mjs entries REMOVED
      // here (ASSEMBLE-47 coordinator lane, 2026-09-05): each is now wired as its own maintenance.yml
      // step (spec09-auxiliary-energy-csv / spec09-dqi-csv / spec09-indexation-csv /
      // spec09-surcharge-audit-csv — `arg` = "<csv-path>,<org-id>") — the exact "coordinator follow-up"
      // lane SPEC09-B's own entries named. See docs/runbooks/MAINTENANCE-RUNBOOK.md §29-32.
      // scripts/spec09/eudr-custody-producer.mjs REMOVED here (Lane SPEC09-B, 2026-09-05) — F25 itself
      // flagged it STALE: scripts/spec09/run-fixture-import.mjs now imports its exported
      // applyHoldRiskDefault() (the shared write-time hold_risk default both the CLI producer and the
      // upload route apply), a real, non-test, non-incidental importer. See run-fixture-import.mjs's own
      // allowlist entry below for why THAT file still needs one.
      // scripts/spec09/grid-queue-producer.mjs and scripts/spec09/oem-roadmap-producer.mjs entries REMOVED
      // (Lane SPEC09-A, 2026-09-05, folded into this train ahead of SPEC09-B): both wired into
      // maintenance.yml (spec09-grid-queue/spec09-oem-roadmap steps) — real dispatch roots, confirmed
      // against this tree. Lane SPEC09-B's own diff (authored before SPEC09-A's fold) still described
      // both as present/"UNCHANGED"; the ASSEMBLE-47 coordinator lane removed both here rather than
      // re-adding entries F25 would immediately flag STALE (a module that already has a dispatch root).
      // 'src/lib/contracts/provenance-envelope.mjs' entry REMOVED (lane W71-A, 2026-09-05,
      // docs/plans/complete-system-build-plan-2026-09-04.md §W7): the module itself was DELETED, not
      // wired. grep across src/+scripts/ for a duplicate "provenance envelope" DDL-rendering module found
      // none — nothing reimplements this shape elsewhere — but confirmed zero PRODUCTION consumers
      // either: every production file that mentions "provenance-envelope.mjs" does so only in a doc
      // comment (operations-ask-context.mjs, supabase-server.ts, regional-facts-envelope.mjs,
      // region-grid.mjs, refresh-published-price-statistics.mjs, eu-weekly-oil-bulletin.mjs,
      // assumption-register-common.mjs — none `import` from it), and every real production caller of
      // ORIGIN_CLASS/DERIVATION imports them directly from their real homes (vocabularies.mjs,
      // envelope.mjs) rather than through this module's re-export, exactly as the module's own header
      // says those homes are. Its only remaining importers were the six *-composition/*-parser.test.mjs
      // files (test-only, never satisfied F25) — repointed to import ORIGIN_CLASSES/DERIVATIONS directly
      // from vocabularies.mjs/envelope.mjs in the same commit, so nothing breaks. WO-17 (the named future
      // consumer this entry was waiting on) has still not started; rather than re-grant a fourth expiry
      // (41->43->46->47->52) on a module with genuinely zero live callers, WO-17 gets a plain
      // renderEnvelopeDDL-shaped generator when it actually starts — reusing the general APPROACH this
      // module proved (factor-tier.mjs's own pattern, generalised) costs nothing extra at that point,
      // and it is not "duplicated logic" to reintroduce a helper for a workstream that doesn't exist yet.
      // 'scripts/spec09/run-fixture-import.mjs' entry REMOVED (lane W71-A, 2026-09-05,
      // docs/plans/complete-system-build-plan-2026-09-04.md §W7): now reachable by construction — it is
      // the honest dry-run substitute for the no-arg branch of maintenance.yml's spec09-surcharge-audit-csv
      // step (the four spec09-*-csv steps previously just echoed "arg is required... skipping" on a
      // dry-all run, leaving the whole six-table CSV-upload pipeline permanently unproven in CI). Its own
      // path is now a literal Source-1 dispatch-root match in that workflow file.
      // '.discipline/install-hooks.mjs' entry REMOVED (lane W71-A, 2026-09-05, docs/plans/
      // complete-system-build-plan-2026-09-04.md §W7): now reachable by construction —
      // OUT-OF-REPO-BOUNDARY.md's new "Operator-CLI register" table names it (usage line, invoker: the
      // operator on a fresh checkout or hook-source change, per .discipline/INSTALL.md), and
      // findDispatchRoots' new Source 7 parses that table into a dispatch root. Same treatment as the
      // settings.json boundary-dependency table's existing row.

      // ── ASSEMBLE-47 RATCHET NOTE (2026-09-05): every entry below (install-hooks.mjs above included)
      // carried expiry:46, set before wave46 itself had landed on origin/master. F25's own mechanism
      // (auditLiveness, latestTrainWave) reds an entry once the LATEST LANDED train reaches or passes its
      // expiry — reading origin/master's own git log, which now (post wave46 merge, PR #593) contains
      // "wave46" for the first time, so all 49 of these files flipped EXPIRED the instant this train's
      // base landed, independent of anything any of the 11 lanes folded into this train touched.
      // [CONFIRMED, this session: identical entries, byte-for-byte, already present on origin/master
      // before this train's first cherry-pick — grep this exact reason text against
      // `git show origin/master:fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs`.] None of
      // these ~49 files were written, read in full, or touched by any of the eleven lanes this train
      // assembles (assembly, kitbackfill, rulingsexec, attachsrc, corridors, chips, spec09a, spec09b,
      // w71wire, notices, ledgerchain2) — making a real wire-or-delete disposition call on each requires
      // reading and understanding a script this coordinator lane was never asked to read, which is a
      // distinct workstream, not a "small follow-up" to any of the eleven folds (rule 13 is about not
      // deferring a fix discovered IN this lane's own diff, not about absorbing an unrelated multi-year
      // backlog on the strength of a wave number crossing a threshold). Re-granted to wave52 (a ~5-train
      // buffer, not indefinite) rather than silently re-stamped with no comment — named here, in this
      // train's report, and in session-log postscript 58 as a standing, undischarged backlog item: a
      // dedicated lane must read each of these ~49 files and either wire it, delete it, or (for the
      // documented out-of-repo-boundary / historical-one-shot families below) formally reclassify it out
      // of this ratchet's scope so it stops re-expiring on every train that happens to cross wave52.

      // ── The rest of the widened scope's "no": modules the audit's 2026-08-21+ window never covered
      // (all predate it) but the widened check flags exactly the same way. Enumerated by ACTUALLY RUNNING
      // the widened check against this tree (B4: measure, don't predict) rather than hand-guessing from
      // the plan text alone, which names only the post-08-21 set. Two families:
      //  (a) operator/git-hook-invoked out-of-repo-boundary tools (same class as install-hooks.mjs above,
      //      .discipline/governance/OUT-OF-REPO-BOUNDARY.md) — legitimately never workflow-dispatched;
      //  (b) dated, operator-authorized ONE-SHOT programs already run against production, left in the
      //      tree at their original path as historical record (this repo's established pattern — see
      //      scripts/_archive/README.md for the same convention applied one step further, after archival).
      // '.discipline/consistency/runner.mjs' entry REMOVED (lane W71-A, 2026-09-05): F25 itself flags it
      // STALE now — findDispatchRoots' new Source 8 mechanizes the subprocess-spawn shape
      // consistency/override-check.mjs already used to run it (`const RUNNER = resolve(HERE,
      // 'runner.mjs'); spawnSync(process.execPath, [RUNNER], ...)`), and override-check.mjs is itself a
      // Source-1 dispatch root ('.github/workflows/discipline.yml`'s "Consistency backstop" job,
      // `.discipline/hooks/pre-push`). Plainly wired by subprocess dispatch, not an operator-CLI
      // exemption — see OUT-OF-REPO-BOUNDARY.md's own note under the new Operator-CLI register.
      // '.discipline/dispatch/audit.mjs' and '.discipline/dispatch/start.mjs' entries REMOVED (lane
      // W71-A, 2026-09-05): now reachable by construction — OUT-OF-REPO-BOUNDARY.md's new
      // "Operator-CLI register" table names both (usage line + invoker: the operator, per
      // .discipline/dispatch/README.md's own lifecycle section) and findDispatchRoots' new Source 7
      // parses that table into a dispatch root, same treatment as install-hooks.mjs above.
      // '.discipline/governance/check-pretooluse-wired.mjs' entry REMOVED (lane W7.1-CLOSE, 2026-09-05):
      // F25 itself flagged it STALE once findDispatchRoots() gained Source 6 (hook scripts install-hooks.mjs
      // writes) — fsi-app/.discipline/hooks/pre-push's step 3c genuinely runs this file, a real dispatch
      // root the graph-only scan could never see (the hook copies it as text, not an import). See Source 6's
      // header comment for the [CONFIRMED] evidence.
      // '.discipline/governance/pretooluse-skill-gate.mjs' and
      // '.discipline/governance/wire-pretooluse-settings.mjs' entries REMOVED (lane W71-A, 2026-09-05):
      // both were ALREADY named as backticked `governance/*.mjs` paths in OUT-OF-REPO-BOUNDARY.md's
      // pre-existing boundary-dependency table (source-of-truth and applier columns respectively) —
      // findDispatchRoots' new Source 7 parses that same table, so both are now reachable by
      // construction without any change to the registry itself.
      // '.discipline/governance/worktree-isolation-hook.mjs' entry REMOVED (lane W7.1-CLOSE, 2026-09-05):
      // F25 itself flagged it STALE once findDispatchRoots() gained Source 6 — fsi-app/.discipline/hooks/
      // post-checkout and pre-commit both genuinely `exec node .../worktree-isolation-hook.mjs`, a real
      // dispatch root the graph-only scan could never see (the hooks copy it as text via install-hooks.mjs,
      // never an import specifier). See Source 6's header comment for the [CONFIRMED] evidence.
      // 'scripts/_dataops/interlock.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED. Its only two
      // importers (scripts/_archive/phase2-{reconcile,build-binding}.mjs) are themselves already archived
      // (inert, out of F25 scope), and every script docs/runbooks/sprint4-dataops-ledger.md names as
      // guarded by it is gone from the tree the same way — the guard has nothing left to guard. The
      // ledger doc is updated in the same commit to say so; it remains the historical audit record.
      // 'scripts/_diag/_pdf-probe.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED — a scratch probe
      // ("PROBE (scratch)") that already answered its question (unpdf extracts text) before the transport
      // was wired; no importer, no dispatch, nothing downstream depends on it.
      // Lane F25-WAVE52 (2026-09-07) disposition of the seven `_reground/*.mjs` entries this block used
      // to generate (docs/audits/f25-wave52-dispositions-2026-09-07.md): each carried expiry:52 with zero
      // dispatch root anywhere. Per-file:
      //  - 'scripts/_reground/restore-overclear.mjs' DELETED: DEAD-HISTORICAL per
      //    docs/audits/full-read-2026-08-31/L14-scripts-B.md — a one-shot restoration scoped precisely to
      //    a single named 2026-07-16 drain-clear incident, not reusable machinery. The ruling it served is
      //    closed and its remediation already applied; nothing else in the tree references it.
      //  - The other six ('executor-ground', 'free-pass-run', 'id-stamp', 'lease', 'target-match-probe',
      //    'tombstone-delete') are WIRED, not deleted — L14-scripts-B.md classifies every one of them
      //    OPERATOR-TOOL (not DEAD), and they serve the still-ACTIVE Unit-3 quarantine drain
      //    (docs/PROGRAM-BOARD.md §2 — "62-quarantine → recover-or-delete", deferred to 2026-10-31, NOT
      //    closed): tombstone-delete.mjs alone shows 236 live disposition_ledger rows as running evidence.
      //    Each takes item-specific positional args (an itemId, a lease holder, a proposed identifier) that
      //    do not fit a scheduled or CI-fanned-out shape, so they are registered as Operator-CLI-register
      //    rows in OUT-OF-REPO-BOUNDARY.md instead of a maintenance.yml step — findDispatchRoots' Source 7
      //    is widened (above) to recognize a backticked `_reground/*.mjs` row the same way it already
      //    recognizes `governance/*.mjs`/`dispatch/*.mjs`/`install-hooks.mjs`, so the registry row itself is
      //    the reachability evidence, same idiom as every other row in that table.
      {
        file: 'fsi-app/scripts/_ruling/null-tier-host-ruling.mjs',
        reason:
          'RECLASSIFIED (lane W71-C, 2026-09-05, was a W7.1 expiring one-shot): this is NOT a discharged one-shot ' +
          '— fsi-app/src/lib/sources/host-authority-ruling-conformance.test.mjs imports its exported RULING array ' +
          'directly (a relative import of this exact file, three directories up) and asserts host-authority.ts ' +
          'stays byte-for-byte in sync with the ruling, host for host, forever. The ruling text ' +
          'itself is applied/codified/verified (docs/audits/null-tier-host-ruling-2026-08-11.md: "Status: applied, ' +
          'codified, verified") — but the FILE is the permanent single record + regression fixture the conformance ' +
          'test depends on, same shape as fsi-app/src/lib/intake/intake-url-corpus.mjs\'s own entry above ("a ' +
          'data-only golden-fixture file with no production call site to be wired into"). A test-only importer does ' +
          'not satisfy F25\'s production-importer bar, so it still needs an entry — but deleting the file would ' +
          'break a live, CI-run conformance proof, and no expiry is honest here: this file is never meant to gain a ' +
          'production importer, the same posture as types.contractable-barrier.check.ts above.',
        reviewByPhase: 'n/a — permanent data-fixture cited by a live conformance test; re-review only if the test is deleted or the file\'s role changes',
      },
      {
        file: 'fsi-app/scripts/lib/is-main-fixture.mjs',
        reason:
          'task 0.3b, 2026-09-11: a deliberate spawn fixture for scripts/lib/is-main.test.mjs, same shape as ' +
          'the null-tier-host-ruling.mjs entry above ("a data-only golden-fixture file with no production ' +
          'call site to be wired into"). isMainModule() (scripts/lib/is-main.mjs, the primitive this fixture ' +
          'exercises) fixes a Windows defect where a hand-built file:// comparison string never equals ' +
          'import.meta.url; proving the fix requires a REAL `node <file>` invocation (execFileSync spawning ' +
          'this exact file), not a mocked process.argv[1] override in-process, because the defect only ' +
          'reproduces under a genuine spawn where Node itself supplies the platform-native argv[1] shape. A ' +
          'test-only importer does not satisfy F25\'s production-importer bar, but this file is never meant ' +
          'to gain one: its entire purpose is being invoked as a separate process by the test.',
        reviewByPhase: 'n/a, permanent spawn fixture for a live regression test; re-review only if the test is deleted or the fixture\'s role changes',
      },
      // 'scripts/_wave-alpha/backfill-canonical-keys.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED
      // — migration 200's canonical_instrument_key backfill applied live 2026-07-11 (wave-alpha; RD-5,
      // 20/21 rows set, 1 unverified skipped by design). Removed from skill-contract-map.mjs's
      // citingFiles (both remediation-discipline and environmental-policy-and-innovation) in the same
      // commit.
      // 'scripts/apply-4c-plan.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25 expiry-52 disposition):
      // DELETED, with its judge/plan-emitter pair run-4c-relabel.mjs and the tracked plan artifact
      // scripts/_plans/4c-plan-1783345619430.json — operator ruling 2026-09-06 (per this lane's own
      // dispatch script): the 4c relabel freeze W71-C's entry described as "deliberately parked, not
      // discharged" is now honored by DELETION, not indefinite exemption — a hold with no active plan to
      // resume is a one-shot that never ran, not a standing capability, and the corpus's unlabeled-
      // assertion quarantine class it targeted is unaffected (regen-quarantined.mjs / verify-item.mjs
      // still drive the live quarantine-resolution path). No test existed for either file to remove
      // alongside it.
      // 'scripts/audit-optionc-reachability.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED — the
      // Part 1 B archiving-decision bug class it investigated was fixed at the source 2026-06-01
      // (canonical-fetch.mjs's browserlessFetch replaced the plain-fetch reachability check everywhere
      // that matters); this was the one-time diagnostic that found the defect, not a recurring check.
      // 'scripts/canonical-pipeline-proof.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED — a
      // development-time proof harness for the canonical-pipeline step functions "before wrapped as 'use
      // step'"; the pipeline has been live, wrapped, and running through /api/agent/run for weeks, so the
      // thing this proved is now proven by the live system itself.
      // 'scripts/connections/backfill-edges.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED —
      // superseded, not merely unwired: scripts/connections/discover-for-items.mjs (wired into
      // corpus-turn.yml) is now the live, CI-dispatched connection-discovery runtime for the same table
      // (item_cross_references), and backfill-edges.mjs's own cold-start pass already ran (migration 252's
      // "Consumed by" note, docs/ops/session-log.md's Pillar A2 dry-pass evidence). Docs updated in the
      // same commit: shared-dataset-ownership.md, migrations.md #252, ADR-019, MAINTENANCE-RUNBOOK.md,
      // and IntersectionDetectionView.tsx's empty-state copy (now points at discover-for-items.mjs).
      // 'scripts/funded-pass.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25 expiry-52 disposition):
      // DELETED, with scripts/lib/funded-pass-core.mjs (orphaned as a direct, verified consequence —
      // its only production importer was funded-pass.mjs itself; grep confirms nothing else imports it)
      // and both files' tests. Operator ruling 2026-09-06 (rule 14 corollary — a refuted finding is
      // corrected IN PLACE): the 2026-07-18 dormant-systems audit's "keep-and-integrate" verdict for this
      // file (docs/audits/dormant-systems-audit-2026-07-18.md line 169, annotated superseded in the same
      // commit) is SUPERSEDED — the file contradicts CLAUDE.md standing rule "no LLM call in any runtime"
      // read together with the $0 build-mode posture (funded-pass drives PAID Sonnet/Haiku generation
      // passes) and its own top-level readFileSync of scripts/tmp/funded-pass-worklist.json (a
      // hand-authored, per-campaign artifact that does not exist) means any dispatch — scheduled or
      // hand-run without first authoring that file — crashes on ENOENT by construction; no harness-run
      // artifact exists proving it ever completed a run. funded-pass-lock.mjs (the run-lock primitive,
      // migration 205, doctrine RD-38) and its golden funded-pass-lock-golden.mjs are UNAFFECTED — that
      // golden is itself a real, non-test importer of funded-pass-lock.mjs (F25's own isTestFile() does
      // not classify a `-golden.mjs` suffix as a test), so the lock stays wired and proven independent of
      // funded-pass.mjs's own deletion.
      // 'scripts/gen/migration-258.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED — same
      // one-shot-generator-already-applied reasoning as the migration-267/268/271 generators above
      // (migration 258 is applied live; no anti-drift test ever existed for this generator, unlike
      // 267/268/271 — grep confirms `src/__tests__/migration-258-codegen-drift.test.mjs`, named in this
      // file's own header, was never built). The migration SQL file is untouched.
      // 'scripts/holdings-audit.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25 expiry-52
      // disposition): WIRED, not deleted — registered in scripts/verify/run-data-audit-lane.mjs's own
      // AUDITS table (SOFT/informational, self-skip exit 2 without creds, same convention as
      // wave-acceptance-audit.mjs) — a real, CI-dispatched reachability path this file's own
      // findDispatchRoots Source 4 now finds. The env-load is also now guarded (was an unguarded
      // process.loadEnvFile that would ENOENT-crash a no-.env.local run). shared-dataset-ownership.md's
      // TO-VERIFY note on the 2026-07-14 dispatch's write is UNCHANGED — this registration runs only the
      // script's default read-only report path, never --write.
      // 'scripts/recovery-measure.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED — the ~347-recovery
      // read-only measurement tool (Phase 1/1b/2), a dated incident-response tool with no evidence of an
      // open, unresolved incident naming it (docs/ops/session-log.md carries no live reference).
      // 'scripts/regen-quarantined.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25 expiry-52
      // disposition): WIRED, not deleted — the decision loop is now an exported, injectable
      // `runResolver()`, driven UNMODIFIED by scripts/maintenance/regen-quarantined.mjs (maintenance.yml
      // step "regen-quarantined", `arg` = optional --only scope) — a real dispatch root (this file's own
      // findDispatchRoots Source 1, via the workflow's literal `scripts/maintenance/regen-quarantined.mjs`
      // run: line and this script's own path named in that step's comment). .discipline/governance/
      // invariants.mjs still cites this file as the live resolver the "Quarantine is an open
      // investigation, never terminal" invariant depends on — now reachable by dispatch, not only by hand.
      // 'scripts/remediation/acquire-primaries-batch.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25
      // expiry-52 disposition): WIRED, not deleted — dispatched via scripts/maintenance/acquire-primaries.mjs
      // (maintenance.yml step "acquire-primaries", apply-only — never part of the 'all' dry fan-out since
      // even this script's own dry path performs real network fetches; `arg` names the item scope to
      // acquire for). Wrapped as a subprocess (not an in-process import) because the acquisition logic
      // itself does live network I/O the wrapper does not duplicate — see that wrapper's own header. This
      // is still the sole writer of raw_fetches on the operator-fired acquire path (docs/inventories/
      // shared-dataset-ownership.md), now registered there.
      // 'scripts/remediation/refetch-capped-worklist.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25
      // expiry-52 disposition): WIRED, not deleted — dispatched via scripts/maintenance/refetch-capped.mjs
      // (maintenance.yml step "refetch-capped"; dry/BUILD always allowed, apply/EXECUTE gated on
      // `arg=GUARD-1-accepted` per ADR-016, docs/decisions/ADR-016-storage-side-uncap.md — its own
      // Implementation-step numbering, cited in that wrapper's header comment). The open GUARD-1
      // pool-insert-size ruling this file was blocked on is UNCHANGED by this wiring; the gate refuses
      // EXECUTE without the explicit token exactly as ADR-016's drain order requires.
      // 'scripts/run-4c-relabel.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25 expiry-52
      // disposition): DELETED alongside its pure-node applier pair apply-4c-plan.mjs — see that entry's
      // own removal note above for the operator ruling and full rationale (the 4c relabel freeze is now
      // honored by deletion, not indefinite exemption).
      // 'scripts/source-role-cleanup.mjs' entry REMOVED (lane ONESHOTS, 2026-09-06, F25 expiry-52
      // disposition): WIRED, not deleted — dispatched via scripts/maintenance/source-role-cleanup.mjs
      // (maintenance.yml step "source-role-cleanup", dry/apply, `arg=active-only` narrows scope). The
      // FIX this lane also made (rule 13 — fix it now): this script's own connection code previously
      // hardcoded a LOCAL-ONLY `supabase link` path with no CI fallback (an unguarded readFileSync that
      // would ENOENT-crash the moment this ran from the only place with DB credentials, GitHub Actions) —
      // now uses the shared scripts/lib/pg-conn.mjs resolver every other pg-direct tool in this repo uses,
      // and self-skips (exit 2) rather than crashing when no candidate connects. docs/ops/session-log.md's
      // "874 registry-wide NULL-role rows... the durable path is scripts/source-role-cleanup.mjs" note is
      // now a real, reachable dispatch, not only a hand-run script.
      // 'scripts/source-state-min-wage.mjs' entry REMOVED (lane W71-C, 2026-09-05): DELETED — the state
      // minimum-wage DATA PROGRAM (operator ruling 2026-07-07) is discharged: state_cost_facts carries
      // 13/13 live rows (docs/inventories/migrations.md #152, population report), matching exactly the "13
      // US states" the program's own header describes. Its one test reference (F13 in
      // src/lib/sources/phase-r-cheap-fixes.test.mjs) is removed in the same commit.
      // 'scripts/sprint4-114-spancheck-test.mjs' entry REMOVED (lane W71-C, 2026-09-05): WIRED, not
      // deleted — this is a real regression proof for spanCheckFetch's RetryableError-on-timeout behavior
      // (src/lib/agent/span-check.ts), still live production code (generate-brief.ts's canonical
      // pipeline). Its only defect was naming (`-test.mjs` hyphen, not the `.test.mjs`/`.npmtest.mjs`
      // convention isTestFile() and run-test-suite.sh's globs expect) and a needless tsc-subprocess
      // compile step. Rewritten as fsi-app/src/lib/agent/span-check.npmtest.mjs (node:test, imports
      // spanCheckFetch directly — Node 24 type-stripping makes the relative .ts import portable, same
      // pattern every other src/lib/agent/*.test.mjs uses) — `.npmtest.mjs` because span-check.ts imports
      // the "workflow" npm package for RetryableError, so it cannot join the no-npm-ci glob. Picked up
      // automatically by discipline.yml's `git ls-files 'fsi-app/src/**/*.npmtest.mjs'` glob — no
      // workflow-file edit needed. The old file is deleted; deleting it outright with no replacement (the
      // brief's default expectation for this class) would have removed real safety-net proof over live
      // retry-on-timeout behavior with nothing to replace it, which is a worse outcome than the small fix.
      // 'scripts/verify/audit-finding-status.mjs' entry REMOVED (lane W71-A, 2026-09-05): now reachable
      // by construction — a real "verify:audit-findings" package.json script (Source 2) and a real
      // report-only invocation from run-test-suite.sh, both wired this lane. The recursion bug that left
      // 27 of 101 docs/audits/ files unscanned was fixed in the same diff (rule 13).
      // 'scripts/verify/wave-acceptance-audit.mjs' entry REMOVED (lane W71-A, 2026-09-05): ADR-014's
      // "wave-close" mechanism was [REFUTED] this lane — it does not exist anywhere in the repo (trains
      // land continuously; no wave-boundary hook to gate). Wired instead into
      // run-data-audit-lane.mjs's AUDITS table as a SOFT nightly audit (Source 4), using "since 24h ago"
      // as the honest practical proxy for a wave boundary; self-skips (exit 2) without creds.
      // 'mint-gate-calibration' entry REMOVED (lane W71-A, 2026-09-05): the script itself was deleted
      // (no live caller — see F38-unbounded-supabase-read.mjs's own removed-entry note for the evidence).
      // Lane F25-WAVE52 (2026-09-07) disposition of the seven `scripts/verify/*.mjs` entries this block
      // used to generate (docs/audits/f25-wave52-dispositions-2026-09-07.md): each carried expiry:52 with
      // zero dispatch root anywhere. Per-file:
      //  - 'cleanup-dup-sources.mjs' DELETED: the specific duplicate-source cluster it targeted was a
      //    named, dated incident already resolved; no recurring class remains for it to catch.
      //  - 'remediate-reclassify-proposal.mjs' DELETED: the proposal-reclassification ruling it applied
      //    was a one-time batch already executed against the live corpus; re-running it against an
      //    already-corrected corpus is a no-op, not a standing check.
      //  - 'stale-verified-audit.mjs' DELETED: superseded — its detection surface is now covered by the
      //    already-wired `defect-signature-scan` (S-CONFLATE/S-NUMERIC triage) and `surface-visibility`
      //    audits below; keeping a third, unwired, overlapping detector was the "shadow capability" class
      //    CLAUDE.md's "one module every caller imports" ruling forbids in the other direction.
      //  - 'admin-phrase-scan.mjs', 'defect-signature-scan.mjs', 'remediate-orphan-sources.mjs' and
      //    'surface-visibility-audit.mjs' are WIRED, not deleted — each is a live-corpus check or
      //    remediation that a freshly-minted or freshly-classified item can trip AT ANY TIME (RD-20
      //    admin-gate framing, FACT-claim S-CONFLATE/S-NUMERIC triage, orphan-source registration, and the
      //    "verified item hidden from its surface" PPWR-incident invariant, respectively) — a recurring
      //    class, not a closed one-shot. Wired below: admin-phrase-scan/defect-signature-scan/
      //    surface-visibility-audit as SOFT run-data-audit-lane.mjs AUDITS entries (this file's own Source
      //    4), remediate-orphan-sources.mjs via a scripts/maintenance/ subprocess wrapper dispatched as a
      //    new `.github/workflows/maintenance.yml` step (Source 1) — see that workflow's own step comment
      //    and docs/runbooks/MAINTENANCE-RUNBOOK.md §39 for the wiring detail. Each entry now reads
      //    STALE ALLOWLIST ("now HAS a production importer") the moment the wiring lands, which is this
      //    same commit — so the four entries are removed here rather than left to red on their own gate.
      // Lane UIADMIN2 (2026-09-07) had cherry-picked commit 34b476c5 (DetailShell.tsx, already folded
      // via lane uidetails-2026-09-06 in this train) and, alongside it, re-added the seven
      // 'scripts/verify/*.mjs' entries above (stale — already disposed of by F25-WAVE52, expiry 52,
      // long past) plus two NEW entries for FactCard.tsx/fact-paragraphs.ts at expiry 55, reasoning
      // its own /settings SectionIndex use pulled them in as an unwired same-commit dependency. Both
      // are DROPPED at this train's fold (UI-FOLD, 2026-09-07): never re-grant an expiry, and by fold
      // time both files have real production importers — the four detail-surface `[slug]/page.tsx`
      // routes (regulations/market/research/operations, landed via lane uidetails-2026-09-06/
      // uidetails2-2026-09-07) plus FactBlocks.tsx. No allowlist entry needed for either file.
    ];
  })(),

  // lane NOTICES's notices-rail-smoke.mjs allowlist entry REMOVED here (ASSEMBLE-47 coordinator lane,
  // 2026-09-05): registered in ux-smoke-specs.mjs and given its F35 ROW_COMPONENTS entry in this same
  // commit, exactly the landing action the entry itself named as its own removal condition.

  // ── DATECHAIN lane (2026-09-11) allowlist entries for backfill-item-timelines.mjs and
  // forward-events/dispatch-extraction.mjs REMOVED (DATECHAINWF lane, same day): both scripts now HAVE a
  // production importer — `.github/workflows/date-chain.yml` (workflow_dispatch-only, no schedule block,
  // so rule 16's build-mode cadence-off standing rule is untouched: this is explicit dispatch, not a
  // cron). Source 1 of this file's import graph already counts a `.github/workflows/*.yml` reference as
  // an importer (see this file's own header), so the entries are the stale-allowlist condition the gate
  // exists to catch, not a defect to paper over.

  // W9 part 1, task 1.1 (2026-09-11): src/test-support/fake-supabase.mjs is a SHARED injected-fake
  // Supabase client, the same permanent-test-infrastructure shape as
  // scripts/_ruling/null-tier-host-ruling.mjs's own entry above ("a test-only importer does not satisfy
  // F25's production-importer bar, so it still needs an entry"), never meant to gain one: its whole
  // reason to exist is to be imported by *.test.mjs/*.npmtest.mjs files (currently
  // src/lib/entities/link-item-entities.test.mjs and src/lib/intake/mint-item-entities.npmtest.mjs;
  // isTestFile() correctly does not count either as a production importer). Extracted from the
  // bespoke fake client src/lib/agent/timeline-harvest-unlock.npmtest.mjs first established, so a
  // second writer-level test does not hand-roll a one-off fake for the same handful of Supabase chain
  // shapes (select/eq/in, upsert, update).
  {
    file: 'fsi-app/src/test-support/fake-supabase.mjs',
    reason:
      'A shared injected-fake Supabase client for node:test suites (select/eq/in, upsert with ' +
      'onConflict/ignoreDuplicates, update.eq) — test infrastructure, not a production capability. Its ' +
      'only intended callers are test files, which isTestFile() correctly excludes from the ' +
      'production-importer count. Grows new chain shapes as new writer tests need them; deleting it ' +
      'would mean re-inlining the same fake per test file.',
    reviewByPhase: 'n/a — permanent shared test double; re-review only if every importing test is deleted or a real production caller appears (which would itself be a design smell for a test fake)',
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

// WIDENED SCOPE PREDICATE (W7.1, 2026-09-04) — factored out so the orphan-module CI check
// (.discipline/governance/orphan-modules.mjs) computes the identical scope this fitness function gates,
// rather than a second hand-written copy that could quietly drift from it (the exact "two homes" class
// CLAUDE.md forbids). fsi-app/scripts/** in FULL (was scripts/lib/** only) and the whole of
// fsi-app/.discipline/** — see the header note above findDispatchRoots() for why this could not ship
// without dispatch-root awareness (most of scripts/** is CI-invoked CLI, never imported).
export function inWidenedScope(f, manifest) {
  return (
    (f.startsWith('fsi-app/src/') || f.startsWith('fsi-app/scripts/') || f.startsWith('fsi-app/.discipline/')) &&
    /\.(?:ts|tsx|mjs)$/.test(f) &&
    !/\.d\.ts$/.test(f) &&
    !isTestFile(f) &&
    !ENTRY_RE.test(f) &&
    !manifest.has(f) &&
    // _archive/ (scripts/_archive/**, src/_archive/**): inert-by-construction sunset storage — a module
    // moved there is deliberately dead, not a fresh liveness question. Without this, moving a module out
    // of src/lib/** into src/_archive/lib/** would keep it in scope (it still matches the 'fsi-app/src/'
    // prefix) and immediately re-red the gate the archival was meant to close. scripts/lib/** archives
    // land under scripts/_archive/lib/, which already fails a bare-prefix test and needs no help here —
    // this exclusion exists for the src/ side of the same move.
    !f.includes('/_archive/') &&
    // scripts/_snapshots/, scripts/_plans/: gitignored scratch per CLAUDE.md standing rule 5 (machine
    // evidence / regenerable working state) — tracked exceptions there are data, not modules to wire.
    !f.includes('/scripts/_snapshots/') &&
    !f.includes('/scripts/_plans/')
  );
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
export function auditLiveness(unimported, scope, allowed = ALLOWED, fileExists = () => true, latestWave = null) {
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
    // W7.1: an entry that carries an expiry (a train/wave number) must also carry a disposition, and reds
    // once the latest landed train reaches or passes it — the ratchet that keeps a "temporary" exemption
    // from becoming permanent by nobody ever coming back to it (plan §W7.1: "the check fails when an
    // allowlisted module's expiry passes").
    if (entry.expiry !== undefined) {
      const kind = entry.disposition && entry.disposition.kind;
      if (!['wire', 'delete', 'one-shot'].includes(kind) || !entry.disposition.detail) {
        problems.push(
          `ALLOWLIST ENTRY WITH EXPIRY BUT NO DISPOSITION — "${entry.file}" carries an expiry (wave${entry.expiry}) ` +
            `but no valid disposition ({kind: 'wire'|'delete'|'one-shot', detail}). An expiry without a stated plan ` +
            `is a deadline nobody can act on.`,
        );
      }
      if (latestWave !== null && latestWave >= entry.expiry) {
        problems.push(
          `ALLOWLIST ENTRY EXPIRED — "${entry.file}"'s expiry (wave${entry.expiry}) has passed (latest landed: ` +
            `wave${latestWave}). Disposition was ${kind ?? 'MISSING'} (${(entry.disposition && entry.disposition.detail) ?? 'n/a'}). ` +
            `Wire it, delete it, or grant a new expiry with a fresh reason — an expiry that nobody returns to is a ` +
            `permanent exemption wearing a temporary label, exactly what the expiry field exists to prevent.`,
        );
      }
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
    'Every module under src/, the whole of scripts/, and .discipline/ has a production importer, is a framework ' +
    'entry point, is a CI/npm dispatch root (a workflow run: line, a package.json script, or an esbuild alias ' +
    'target), or carries a reason-bearing, expiring exemption. Mechanizes the last two classes the 2026-08-11 ' +
    'wiring census could only name, then (2026-09-04, plan §W7.1) widens past its original src/+scripts/lib/ scope ' +
    'to the rest of scripts/** and .discipline/** — the exact gap docs/audits/wiring-audit-2026-09-04/B1-modules.md ' +
    'found this file\'s own scope leaving open (the four scripts/review/apply-*.mjs ratification scripts green on ' +
    'every fitness gate while portal_link_candidates carried 1,837 untouched rows).',
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
    const scope = files.filter((f) => inWidenedScope(f, manifest));
    const dispatchRoots = findDispatchRoots(root, (f) => readFileSync(join(root, f), 'utf8'));
    const unimported = findUnimported(scope, importers, manifest).filter((f) => !dispatchRoots.has(f));
    const latestWave = latestTrainWave(root);
    const problems = auditLiveness(unimported, scope, ALLOWED, (f) => existsSync(join(root, f)), latestWave);
    if (problems.length === 0) return PASS;
    return problems.map((msg) => violation(1, msg));
  },
};
