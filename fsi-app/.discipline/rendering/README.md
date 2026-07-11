# Rendering guard (overflow / placeholder-literal / hydration)

Invariant `SF-10-customer-surface-rendering`. Makes three customer-surface defect classes
build-catchable instead of relying on a browser-floor manual audit:

- **L-1 / L-4 / L-6 horizontal overflow** — `scrollWidth > clientWidth` on an audited container or
  `document.body` (excludes `.leaflet-container`, which pans internally by design).
- **F-1 placeholder-literal** — a table-header literal (`Source Name`, `Tier estimate`, `URL`,
  `Why this source matters`, …) rendered as visible data.
- **V-07 hydration** — the server + first-client render must use a now-independent label so React
  `#418`/`#423` cannot fire.

## Layout

| File | Runs in | Purpose |
|---|---|---|
| `assertions.mjs` | both | The pure detector core (overflow / placeholder / hydration). Reuses the REAL app modules (`source-entry-filter.mjs`, `relative-time-format.ts`). |
| `assertions.test.mjs` | no-npm `node --test` discipline suite (pre-push + CI) | Red-then-green proof of all three detectors, portable. |
| `fixtures.mjs` | both | Extreme-data fixtures (max-milestone timeline, long URL, placeholder brief table, zero-data) in GREEN (post-fix) + RED (reconstructed pre-fix) variants. |
| `run-rendering-guard.mjs` | dedicated CI job `Rendering guard` (needs a browser) | Renders every fixture at every app breakpoint tier in Playwright chromium and measures REAL layout, feeding the same detectors. |

## Why two layers

The overflow leg needs a REAL layout engine — `scrollWidth`/`clientWidth` are all-zero in jsdom, so
only a real browser (Playwright chromium) can detect overflow. That browser leg needs npm + a
browser, so it runs in its own CI job. The pure detector core is ALSO unit-proven red-then-green in
the portable no-npm suite, so the browser job cannot silently pass a broken detector.

## Run locally

```sh
# Pure detector self-test (no deps):
node --test fsi-app/.discipline/rendering/assertions.test.mjs

# Browser guard (needs chromium):
cd fsi-app && npm i --no-save playwright && npx playwright install chromium
node .discipline/rendering/run-rendering-guard.mjs
```

## Fidelity boundary

The browser fixtures reproduce each fix's **layout contract** (the timeline strip is verbatim inline
styles; the Tailwind `break-all` / `min-w-0` / `overflow-x-auto` fixes are reproduced by their
equivalent raw CSS with the class→CSS mapping commented), not the bundled auth-walled `.tsx` surface.
A full-page E2E under auth + live data is the named not-yet-built extension. The F-1 and V-07 legs
reuse the REAL app modules directly (no reproduction).

## Viewport tiers

Device-emulated 380 / 768 / 1440 plus every app breakpoint confirmed in `src/app/globals.css`:
420, 480, 560, 640, 767, 900, 960, 1100, 1200. The source chrome audit ran at a 1297px browser
floor, so `< 1200px` was never checked — this guard's first run is the mobile/tablet verification.
