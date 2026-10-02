// RD-89-unguarded-main-invocation: registers F67 (lane R20, 2026-10-01) with the invariant-coverage
// meta-gate. One entry, one file; see invariants.d/README.md.

export const invariant = {
  id: 'RD-89-unguarded-main-invocation',
  skill: 'remediation-discipline',
  section:
    'Section 4 - category 57: a CLI entrypoint that calls its own main() unconditionally at module ' +
    'scope turns a plain import into a live run',
  text:
    'A CLI entrypoint under fsi-app/scripts/** or fsi-app/.discipline/** must never call its own main() ' +
    '(or an orchestrator such as runEnvelopeProducer) unconditionally at module scope. Merely importing ' +
    'such a file (a test asserting on one of its exported pure functions, a sibling script importing a ' +
    'shared constant) triggers a real run: stdin read, a live network fetch, or a live Supabase ' +
    'read/write. Audited findings this codifies: F44-2a/2b/2c ' +
    '(docs/audits/app-audit-a4bc-scripts-completion-2026-09-30.md, three producers under ' +
    'scripts/producers/**) and F-10/F-11 (docs/audits/app-audit-a4cc-scripts-completion-2026-09-30.md) ' +
    '-- F-10 was ACTIVELY triggered, not merely latent: emission-factors-desnz.test.mjs imported ' +
    'splitPending from emission-factors-desnz.mjs, so every `node --test` run of that suite also ran ' +
    'main() unconditionally, performing a live Supabase read as a side effect of the test run. Lane R20 ' +
    '(2026-10-01) fixed those five plus a grep sweep across the whole fsi-app/scripts and ' +
    'fsi-app/.discipline trees that found 33 more live instances of the identical shape (8 in scripts/, ' +
    '3 after widening to the full scripts/ tree, 22 in .discipline/, three of the latter the discipline ' +
    'engine\'s own top-level runners: .discipline/runner.mjs, .discipline/fitness/runner.mjs, ' +
    '.discipline/consistency/runner.mjs), each guarded the same way: ' +
    '`if (isMainModule(import.meta.url)) { main()... }` or the one-line ' +
    '`if (isMainModule(import.meta.url)) await main();` form (scripts/lib/is-main.mjs).',
  anchor:
    'A CLI entrypoint under `fsi-app/scripts/**` or `fsi-app/.discipline/**` must never call its own ' +
    'main() (or an orchestrator such as runEnvelopeProducer) unconditionally at module scope; guard ' +
    'the call with `isMainModule(import.meta.url)` from `scripts/lib/is-main.mjs` so importing the ' +
    'file for its exported pure functions never triggers a live run.',
  enforcedBy: [
    'fitness:F67',
    'selftest:fsi-app/.discipline/fitness/functions/F67-unguarded-main-invocation.test.mjs',
  ],
  residual:
    'F67 is a text-based heuristic, the same posture F44/F60/F61 already state for themselves: it ' +
    'recognizes a line starting with `main(`, `await main(`, or `main().catch(` as unguarded unless the ' +
    'same line or an enclosing block (tracked by indentation, not brace counting) carries one of three ' +
    'recognized guard tokens (`isMainModule(`, `fileURLToPath(import.meta.url)`, `pathToFileURL(`). A ' +
    'guard expressed through some other idiom entirely (no recognized token anywhere in the file) would ' +
    'read as unguarded even if it happens to work; a call reached only through a differently-named ' +
    'wrapper function (never the literal identifier `main`) would not be recognized as the pattern ' +
    'either. Scope is fsi-app/scripts/**/*.mjs and fsi-app/.discipline/**/*.mjs, excluding test files, ' +
    '_archive/ (confirmed dead, 0 live importers), and /fixtures/ + /fixtures-dash/ paths (fixture ' +
    'modules are never a live CLI entrypoint).',
};
