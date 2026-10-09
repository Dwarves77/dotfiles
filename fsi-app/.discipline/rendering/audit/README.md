# Design audit harness

Measures the built product against the design package, value by value, in a real browser.

The operator's complaint that this exists to answer: *"find every place your build doesn't match the
design; you didn't check your work against the design in the build or after the build."* A source
read cannot answer it — a CSS-in-JS value that reads correctly can still lose to a later shorthand
in the same style object (that is exactly how the FactCard counsel variant's orange left edge is
lost today, which reading the file did not catch and measuring it did). So the harness renders the
real component and reads `getComputedStyle`.

## Run it

```
cd fsi-app && npm run audit:design
# or one spec at a time
node fsi-app/.discipline/rendering/audit/run-audit.mjs --spec=factcard
```

Requires playwright + chromium, the same install the rendering guard needs. In this repo's container:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NO_PROXY=smoke-guard.internal \
AUDIT_HEAD=$(git rev-parse --short HEAD) AUDIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
node fsi-app/.discipline/rendering/audit/run-audit.mjs
```

It writes two things, both regenerated in full every run:

- `docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md` — the document (the seed pass's A-list is
  preserved verbatim as its final section, read from `seed-2026-09-07.md`).
- `results.json` — every row as data, for a lane that wants to filter or diff.

It exits 0 whenever the sweep ran, whatever it found. This is an audit that reports, not a gate that
blocks; a non-zero exit means the harness itself broke.

## Statuses

| Status | Meaning |
|---|---|
| MATCH | the measured value equals the design source value |
| MISMATCH | it differs — the row carries both numbers, never a verdict without one |
| NOT BUILT | the spec's selector matched nothing in the mounted tree |
| NOT IN SPEC | a `forbid` selector matched: the design does not have this element |

## Adding a part — the exact commands

1. **Find the design values.** The artboard markup is the authority (`where README prose and a page
   artboard disagree, the artboard wins`). The canvas file is 640 KB on very long lines, so grep it
   and read only the block you hit:

   ```
   cd docs/design/handoff-2026-09-06
   grep -n -o '.\{0,80\}<your part name>.\{0,80\}' 'Caros Ledge UI System.dc.html'
   awk 'NR>=<start> && NR<=<end>' 'Caros Ledge UI System.dc.html' | fold -w 200
   ```

   Cross-read `README.md` §0.4 for the same part, and check the operator's rulings — where a ruling
   states a number, the ruling wins and the artboard value is recorded in the spec's `notes` so the
   divergence stays visible.

2. **Give the part a mount**, if it has none. Add an entry to `AUDIT_MOUNTS` in `mounts.mjs`: a TSX
   `entry` string that defines `window.__mount()` and renders the real `src/components/**` module,
   plus any esbuild `alias` and Playwright `apiRoutes` it needs. Copy the shape of an existing entry.
   Mounts are guard code; they never touch `src/**`. Wrap each thing you want to address separately
   in a `<div data-audit="…">` so a selector can reach it.

3. **Write the spec.** One JSON file per part in `spec/`:

   ```jsonc
   {
     "part": "BandTile",
     "mount": "bandtile",              // a key in AUDIT_MOUNTS
     "viewport": 1440,
     "artboards": ["02-regulations-list"],
     "source": "dc.html #sys band-tile block; README §0.4",
     "notes": ["anything a reader needs to judge the rows"],
     "selector": "[data-audit=\"tile\"] > div",
     "expect": { "border-radius": "10px", "padding-top": "14px" },
     "children": [ { "name": "numeral", "selector": "…", "note": "…", "expect": { … } } ],
     "forbid":   [ { "name": "…", "selector": "…", "textMatch": "…", "reason": "…" } ]
   }
   ```

   Property keys are CSS property names as CSSOM spells them (`border-left-color`, not `borderLeft`);
   prefer longhands, they serialise predictably. Two non-CSS keys are available: `text` compares
   `textContent`, `count` compares how many elements the selector matched.

   Value forms:
   - a plain design value — `#DC2626`, `rgba(0,0,0,.12)`, `0.04em`, `2px solid #1A1A1A`. Colours are
     canonicalised on both sides; `em` is resolved against the element's own computed font-size and
     the resolved px is printed beside it in the document.
   - `*` — matches exactly one token. Its only honest use is the `1fr` track in a
     `grid-template-columns` list, which CSSOM reports as a used pixel width.
   - `contains:<substring>` — for a value whose exact serialisation is not a design statement, e.g.
     a font-family fallback stack (`contains:Anton`).
   - `textMatch` on a target or a forbid narrows the selector by the element's own text:
     a plain string is a SUBSTRING test, and `re:<regex>` is a JS regular expression. Reach for
     the regex form whenever the substring would also match a legitimate longer value — a forbid
     on `"0/12"` also matches `"10/12"`, and a forbid that fires on correct output is a false
     finding (CLAUDE.md rule 14), not a strict check.
   - `matchStyle` on a target or a forbid narrows the selector by computed style
     (`{"height": "3px", "background-image": "contains:rgb(22, 163, 74)"}`) — the way to address an
     element the product gives no marker attribute to.

4. **Run it and read every non-MATCH row.** Before reporting, check each one is a real finding and
   not a harness bug: a selector that hit a nested `<style>` tag, a computed `width` that excludes a
   border, an expectation written in a form CSSOM never emits. Fix those in the spec. A false
   MISMATCH is worse than no audit (CLAUDE.md rule 14).

   ```
   node -e "const r=require('./fsi-app/.discipline/rendering/audit/results.json');
     for (const x of r.rows.filter(x=>x.status!=='MATCH'))
       console.log([x.target,x.property,'exp='+x.expected,'got='+x.actual,x.status].join(' | '));"
   ```

5. **Commit the spec file and any new mount. Do not commit the regenerated results.json or audit
   document**: those are CI's (see "The committed results are CI's" below). The document is generated:
   never hand-edit its tables, edit the spec and rerun.

## The committed results are CI's

`results.json` and `docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md` are generated by the Design audit
workflow and committed by it, never by a developer (lane DAUDIT-3, 2026-10-08). A computed style depends on
the machine that measured it: DAUDIT-2 diffed the green CI run's artifact against the results.json it had
committed from Windows and 4 rows differed (the `ch` width of the vendored font, a 44px target), both with 0
harness errors. A committed oracle that depends on the committing machine is a defect.

- **Every run stamps where it ran.** The generator writes `generated_on: { platform, node, container_image }`
  into `results.json` and a "Generated on" line into the audit document's Repo state block (one site:
  `generatedOn` in `run-audit.mjs`). `container_image` is `none` for a run outside the CI container.
- **A local run is for development and is never committed.** It stamps its own platform (for example
  `win32`). Before you commit, discard it: `git checkout -- fsi-app/.discipline/rendering/audit/results.json
  docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md`. `generated-on.test.mjs` (run by the discipline suite)
  fails a committed pair whose platform is not `linux`, so a local result cannot land by accident.
- **How to refresh the committed pair.** Dispatch the workflow on your branch:
  `gh workflow run design-audit.yml --ref <branch>`, watch it with `gh run watch <id> --exit-status`, then
  `git pull`. On a `workflow_dispatch` run, after the audit and the summary step pass, a step commits both
  files back to the dispatched ref as `github-actions[bot]` through
  `fsi-app/scripts/maintenance/commit-worklist-artifact.sh` (the shared commit-back script): nothing changed
  means nothing committed, and a protected ref such as `master` degrades to a warning and never fails the run.
  The `pull_request` path never commits; it only reports. A push made with the workflow token does not start
  another workflow run, so follow the pull with an ordinary push to re-run the PR checks.
- **A run whose harness errored never commits.** The commit-back step runs only if the summary step
  (which fails on a non-empty `errors` list) succeeded.

## CI: the Design audit job (soft)

`.github/workflows/design-audit.yml` (workflow name `Design audit`, lane DAUDIT-2, 2026-10-08) runs
`npm run audit:design` on every pull request to master and on `workflow_dispatch`. Until then the audit
was run by hand only: results.json went 26 days unmeasured and 136 rows turned non-matching with nothing
red (ADR-046, an operator-seat blind spot).

- **Soft by contract.** The job reports; it never fails the build on a non-matching row (MISMATCH, NOT
  BUILT, NOT IN SPEC). Many such rows are open DESIGN CHANGES OWED (CLAUDE.md rule 20) or a build defect
  waiting on a follow-up lane, and failing a PR on them would block correct work. It fails only when the
  harness itself cannot run: the generator exits non-zero, results.json or the audit document is not
  produced, or results.json carries a non-empty `errors` list (a spec file whose mount threw; the generator
  exits 0 for that, so the summary step fails it). The workflow deletes both generated files before the run so a stale committed copy can never
  pass for fresh output. There is no `continue-on-error` anywhere in the file.
- **Where the result lands.** The job summary carries the four counts and the id of every non-matching
  row. results.json and the audit document are uploaded as the artifact `design-audit-results` (retention
  7 days).
- **The row id handle.** results.json carries no row id field, so a row is named `<spec id>#<index>`:
  the spec id is the spec file name (`fsi-app/.discipline/rendering/audit/spec/<spec id>.json`) and the
  index is the zero-based position of the row in the `rows` array of results.json. The index is stable
  only until the next regeneration; a lane that cites a row quotes the commit it read it at.
- **Same container as the rendering guard.** The job runs in the Playwright image the rendering-guard job
  of `discipline.yml` uses (GATE-6), and `scripts/proof/design-audit-workflow.test.mjs` fails if the two
  image tags ever differ, if a `continue-on-error` or a path filter appears, or if the exit contract
  changes. It also runs the summary script against fixture results, so the counts and the id list are
  proven by execution.
- **Reading a non-matching row.** Trace it to exactly one cause before acting on it: harness (a selector
  or a mount fixture no longer matches the product), spec stale (the spec predates a ruled change; cite
  the ruling in the spec's `note`), build defect (the component diverges from the artboard and nothing
  ruled it), or system-driven (the build is right by a system need, so the design changes and the row is
  listed under DESIGN CHANGES OWED with the artboard number and the ruling). The DAUDIT-2 session log
  (`docs/ops/session-log.d/2026-10-08-daudit2-design-audit.md`) is the worked example for 96 rows.
- **A selector that names a class nothing emits is a vacuous guard.** A target on it reads NOT BUILT, but
  a FORBID on it reads MATCH for ever. When a part drops a marker class, grep the specs for it in the same
  change (the `cl-absence` class left the Absence part and 14 specs kept forbids on it until DAUDIT-2).

## Files

| File | What it is |
|---|---|
| `run-audit.mjs` | the runner; dispatch root via `npm run audit:design` |
| `mounts.mjs` | `AUDIT_MOUNTS` — one real-component mount per part or page frame |
| `normalise.mjs` | pure value normalisation and comparison; no browser, no npm dep |
| `normalise.test.mjs` | its `node --test` proof, run by `.discipline/run-test-suite.sh` |
| `../smoke/stub-auth-provider.mjs` | esbuild alias target for `@/components/auth/AuthProvider`. Every shipped stub lives in `smoke/`; F25's stub-resolution source (`F25-module-liveness.mjs` §Source 3) resolves a `stub-*.mjs` filename literal against that directory, so a stub placed anywhere else reads as an unwired module |
| `spec/*.json` | one spec per part or page frame |
| `seed-2026-09-07.md` | the hand-written source-level pass, appended verbatim to the document |
| `generated-on.test.mjs` | refuses a committed results.json or audit document whose platform is not linux (the stamp is CI's) |
| `results.json` | the last CI-generated run's rows, as data (CI commits it, never a developer) |

## Cost

Filesystem plus one headless chromium. No network (every request the mounted tree issues is answered
by `page.route`), no database, no model call, no schedule, no credential — the same posture as every
other file under `.discipline/rendering/`.
