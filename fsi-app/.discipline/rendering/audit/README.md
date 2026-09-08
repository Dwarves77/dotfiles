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

5. **Commit the spec file, any new mount, and the regenerated document together.** The document is
   generated: never hand-edit its tables, edit the spec and rerun.

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
| `results.json` | last run's rows, as data |

## Cost

Filesystem plus one headless chromium. No network (every request the mounted tree issues is answered
by `page.route`), no database, no model call, no schedule, no credential — the same posture as every
other file under `.discipline/rendering/`.
