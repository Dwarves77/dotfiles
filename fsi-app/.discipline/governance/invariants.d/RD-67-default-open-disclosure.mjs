// RD-67-default-open-disclosure: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-67-default-open-disclosure',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 43: a page that opens something before the reader acted',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'No component under `fsi-app/src/components/` may initialise a disclosure to OPEN, and no page mount may render an open disclosure in its INITIAL DOM. [CONFIRMED, operator report 2026-09-08]: he navigated to /operations and the page had already opened a dimension, Infrastructure capacity, with nobody having clicked anything: "no items expanded when first navigtaing to a page". The class has two shapes with different hiding places. The LEXICAL shape (`useState(true)` on an open/expand state, `useState(false)` on a collapsed/closed one, a `defaultOpen`/`defaultExpanded`/`initialOpen`/`expandedByDefault`/`openByDefault`/`defaultIndex` prop defaulting truthy, a `<details open>`) compiles, renders without a warning, and passes every layout and design assertion, because the thing it opened is correctly styled; two live instances were found by grep on the day of the ruling. The RENDERED shape has no source-level tell at all: RegionDimensionMatrix computed a default SELECTION on mount ("the first sourced cell in the first sourced row") and rendered its fact panel for it, so no boolean and no prop existed for a scanner to name, and the design spec that measured the panel REQUIRED it to be open in order to measure it. Two carve-outs, each written at the site rather than as a path allowlist: a FILTERS rail whose stated default is "first two groups open, rest closed" is a control surface rather than page content, and a deep link may open exactly what it names while the bare route may not.',
    anchor: '### Section 4 — category 43: a page that opens something before the reader acted',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    enforcedBy: [
      'fitness:F43',
      'selftest:fsi-app/.discipline/fitness/functions/F43-default-open-disclosure.test.mjs',
      // The rendering-guard leg (`no-default-open-smoke.mjs`) is NOT cited as a token here, and the
      // reason is mechanical rather than a judgement about its worth: `isExecutionWired` recognises
      // the guard ENTRYPOINT (`run-rendering-guard.mjs`) and not the smoke modules that entrypoint
      // imports, so a `selftest:` token naming it resolves UNRESOLVED even though the guard runs it on
      // every invocation. This is the same shape RD-58 (F35) and the rendering-guard invariant already
      // carry: the fitness function is the citable enforcement, and the browser measurement is named in
      // `residual` with the runner that executes it. Where it runs, exactly: the `SMOKE_SPECS` array in
      // `.discipline/rendering/run-rendering-guard.mjs` (entry `no-default-open`), which the
      // rendering-guard CI job invokes directly.
    ],
    residual: 'F43 is a LEXICAL scanner over `fsi-app/src/components/**/*.tsx` (test files and `/_archive/` excluded). It reads POLARITY off the state name after a camelCase split, matching whole words, so `openingHours` and `reopenQueue` are not disclosure state and a disclosure named in a vocabulary it does not carry (`shown`, `visible`, `up`) is invisible to it. It cannot see a disclosure whose open state lives in a store, a URL, a reducer or a parent prop threaded from a server component, and by construction it cannot see the RENDERED shape at all: a default selection, a computed default index, a panel rendered from derived data. That half is closed in the rendering guard: `no-default-open-smoke.mjs` mounts the real RegionDimensionMatrix and every `compose-*` page mount and measures `details[open]`, `aria-expanded="true"`, a non-tab `aria-selected="true"` and a visible `role="tabpanel"` in the initial DOM, using the same probe `audit/open-state-sweep.mjs` exports rather than a second copy of it. The guard\'s reach is the mount registry: a route with no page mount (the /community sub-routes, /admin/factors, /workspace/new, /invitations/[token], /auth/*, /privacy) is covered by F43 alone. A `role="tab"` reporting `aria-selected="true"` is EXCLUDED by both, and the exclusion is a ruling written into the probe: a tab strip is sibling navigation, exactly one tab is always active, and nothing is expanded by it. Proven by attack 2026-09-08 in both directions: the default-selection block was pasted back into RegionDimensionMatrix.tsx and the guard leg went red on six assertions, and `tocOpen` was set back to `true` in IntelligenceBrief.tsx and F43 went red; both were restored to green.',
  };
