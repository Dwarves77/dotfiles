# Rendering guard: local vs CI divergence (D8 investigation, 2026-09-12)

Read-only investigation, no source edits, no fix. Scope: defect-fix-plan-2026-09-12.md's D8
("The local rendering guard reports 112 failures while CI's rendering guard is green
[HYPOTHESIS]"). Worktree: `wt-facetfix-0911`, branch `lane/w9-d8-investigation-2026-09-12`,
checked out from `origin/master` at commit `6f3bcb96` (PR #649). No database access. No em dashes,
en dashes, or the section-sign glyph appear below.

## Verdict

[CONFIRMED] D8's hypothesis is correct, refined: CI's rendering guard is genuinely green (not
merely non-blocking-masked) on current master. A native local run on this Windows machine
deterministically reproduces 112 failures at the identical commit, the identical command, and the
identical Playwright/Chromium version CI uses. The divergence is a Windows-vs-Linux Chromium
text-layout rendering difference inside the site-wide layout guard's boundary-sensitive rules, not
a stale build, a missing or mismatched browser, an environment variable, a viewport difference, or
an allowlist/baseline drift. The reviewer's 112 (review-7.5.md) were an environment artefact:
[CONFIRMED] by an exact match, route-by-route and width-by-width, between the reviewer's reported
breakdown and this investigation's own local reproduction (method below).

The one command that gives a CI-equivalent result is NOT available natively on this machine today:
neither Docker nor WSL2 is installed [CONFIRMED: `docker --version` -> command not found; `wsl
--status` -> "The Windows Subsystem for Linux is not installed"]. See "The one command" section
below for what to run once one of those is present, and for the fallback that works today.

## Method

1. Read `docs/plans/defect-fix-plan-2026-09-12.md` section D8, `.superpowers/sdd/brief-chain-build-plan-2026-09-11/review-7.5.md`
   (finding 6, the reviewer's own reproduction and breakdown), and `.github/workflows/discipline.yml`'s
   `rendering-guard` job (the exact command, browser install, and the job's own header notes on a
   related prior cross-OS font finding).
2. Read `fsi-app/.discipline/rendering/run-rendering-guard.mjs` and the `layout-guard/` engine
   (`run-layout-guard.mjs`, `baseline.mjs`, `collect.mjs`) to establish what the guard actually needs
   to run (no `next build`, no `.next`; it esbuild-bundles real `src/components/**` modules and
   mounts them in Playwright chromium against hand-compiled global CSS) and how its baseline
   suppression works (a git-tracked `baseline.json`, keyed by `rule|route|width|element`, dated to
   expire 2026-10-15, unrelated to the wave-number oracle used elsewhere in the same file).
3. Confirmed this worktree's environment matches CI's pinned versions before running anything:
   Playwright `1.61.1` already installed (`npx --no-install playwright --version` -> `1.61.1`,
   matching the workflow's `npm install --no-save playwright@1.61.1`), and Chromium revision 1228
   already cached locally (`chromium-1228` in `~/AppData/Local/ms-playwright`), the same revision the
   CI log shows downloading (`playwright chromium v1228`). [CONFIRMED]
4. Ran the guard exactly as CI's `rendering-guard` job runs it, from `fsi-app/`:
   `node .discipline/rendering/run-rendering-guard.mjs`
   Ran it twice in a row on the same commit to rule out flake.
5. Pulled the actual CI job logs for two runs via `gh api repos/Dwarves77/dotfiles/actions/jobs/<id>/logs`:
   one for the commit immediately before #649 (run `34718511035`, job `103619939689`) and one for the
   commit that is this worktree's own HEAD, `6f3bcb96` / #649 (run `34719995465`, job `103623972635`).

## Evidence

### CI, both checked runs: genuinely PASS, not masked

Job `103623972635` (run `34719995465`, commit `6f3bcb96`, the exact commit this worktree is on):

```
layout guard: 622 finding(s) covered by the dated baseline (expires 2026-10-15, today 2026-09-12) - see docs/audits/layout-guard-2026-09-08.md for the owning part of each
===== RENDERING GUARD (browser) =====
layout guard: 36 route×width measurement(s), 0 finding(s)
=== rendering guard PASS ===
```

Job `103619939689` (run `34718511035`, the commit immediately preceding #649):

```
layout guard: 622 finding(s) covered by the dated baseline ...
layout guard: 36 route×width measurement(s), 0 finding(s)
ALL fixtures pass: GREEN fixtures clean at every viewport; RED fixtures reproduced their defect (in-browser red-then-green).
=== rendering guard PASS ===
```

Both runs print `PASS`, not a masked FAIL under `continue-on-error: true`. [CONFIRMED] the job's
"success" conclusion at the GitHub Actions level reflects a real 0-failure outcome here, not the
non-blocking flag hiding a real failure (the plan text raised this as the thing to check; it is
refuted for these two runs specifically).

### Local, same commit, same command: deterministically FAIL, twice

Two consecutive local runs of `node .discipline/rendering/run-rendering-guard.mjs` at commit
`6f3bcb96`, in this worktree, produced byte-identical output:

```
layout guard: 534 finding(s) covered by the dated baseline (expires 2026-10-15, today 2026-09-12) - ...
===== RENDERING GUARD (browser) =====
layout guard: 36 route×width measurement(s), 112 finding(s)
112 FAILURE(S): ...
=== rendering guard FAIL ===
```

[CONFIRMED] not a flake: run 1 and run 2 produced the identical 112 lines, in the identical order,
with identical pixel measurements. The instability the layout guard's own code comments warn about
(`run-layout-guard.mjs`'s note on a render that "had sometimes not painted at 150ms") is not what is
happening here.

The 112 break down by route/width exactly as follows (tallied from the local output):

| Route@width | Count | Rules involved |
|---|---|---|
| `/settings@1024` | 63 | L2 (35), L9 (28) |
| `/settings@1440` | 32 | L2 (20), L9 (12) |
| `/watchlist@1440` | 4 | L6 |
| `/watchlist@1024` | 4 | L6 |
| `/research@1440` | 2 | L9 |
| `/research@1024` | 2 | L9 |
| `/map@1440` | 1 | L9 |
| `/map@1024` | 1 | L9 |
| `/admin@1440` | 1 | L7 |
| `/admin@1024` | 1 | L7 |
| `/profile@1440` | 1 | L9 |

Total: 112.

### The local 112 match the reviewer's 112, category for category

review-7.5.md finding 6 reports the reviewer's own local reproduction as: "63 `/settings@1024`, 32
`/settings@1440`, 4 `/watchlist@1440`, 4 `/watchlist@1024`, 2 `/research@1440`, 2 `/research@1024`,
1 `/profile@1440`, 1 `/map@1440`, 1 `/map@1024`, and 1 `/admin@1440` + 1 `/admin@1024`". Every one
of those eleven counts matches this investigation's own tally above exactly, on a different commit
(the reviewer's target was `wt-brieffields-0911`, diff `2b6d4f56..HEAD`, not `6f3bcb96`). [CONFIRMED]
this is the same underlying, platform-determined finding set recurring across commits, not a
coincidence of two independent 112-counts, and not something introduced by task 7.5's diff: review-7.5.md
already independently confirmed via `git diff` that the one file that diff touched
(`WorkspacesUsageRow.tsx`) was untouched in the way that would cause any of these findings, and none
of the 112 lines here or there name `admin-stat-tiles`/`StatBlock` (the actual subject of that lane).

## What was ruled out

- **Stale or missing `.next` build**: [REFUTED] as a candidate cause. The guard needs no build at
  all. It esbuild-bundles real `src/**` modules in memory (`smoke/harness.mjs`'s `bundleEntry`) and
  mounts them against a compiled stylesheet (`smoke-fixtures.mjs`'s `fullAppCssCompiled()`); CI's own
  `rendering-guard` job never runs `npm ci`, `next build`, or touches `.next` either. Local and CI are
  identical on this axis by construction, not by luck.
- **Browser/version mismatch**: [REFUTED]. Both environments pin Playwright `1.61.1` and both
  resolved to Chromium revision 1228 (confirmed above).
- **Missing browser install**: [REFUTED]. Chromium 1228 was already cached locally before this
  investigation ran anything.
- **Environment variables**: [REFUTED] as a distinguishing factor. The only env var the guard reads
  is the optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override, unset in both CI and this local run
  (confirmed by source read of `run-rendering-guard.mjs` and `run-layout-guard.mjs`).
- **Viewport differences**: [REFUTED]. `VIEWPORTS` and `LAYOUT_WIDTHS` are hard-coded constants in
  the checked-out source tree; local and CI ran the identical commit's identical file.
- **Allowlist/baseline drift**: [REFUTED] as a source-level difference. `baseline.json`,
  `exemptions-375.mjs`, and `exemptions-law2-desktop.mjs` are git-tracked files at the same commit in
  both places, byte-identical (git status clean in this worktree before either run).
- **Test data**: [REFUTED] as a source-level difference for the same reason (same tree, same commit).
- **Git history depth affecting the wave-based exemption oracle** (`latestTrainWave()`, the class of
  divergence this same workflow file's own header documents at length for a different guard leg):
  [REFUTED] as the cause here specifically, because the layout guard's baseline (`baseline.mjs`) is
  DATE-gated (`BASELINE_EXPIRY_DATE = '2026-10-15'`), not wave-gated; `today()` reads the system
  clock, which was 2026-09-12 in both places. The wave oracle is a real, documented mechanism in this
  codebase but it is not what is producing this specific gap.

## Root cause

[HYPOTHESIS, well-precedented but not isolated to the exact byte in this investigation] The one
remaining, unruled-out variable between the two runs is the operating system: this Windows machine's
native Chromium build vs CI's `ubuntu-latest` Chromium build, at the identical Playwright/Chromium
version. Chromium's text shaping and hinting are partially delegated to the OS text stack (DirectWrite
on Windows, FreeType on Linux) even for an identical bundled font file, so the same DOM and CSS can
measure different glyph advance widths, different button box widths (padding sized around text
content), and different overlap amounts between the two OSes. All four rules that produced the local
112 (L2 overlap, L6 a fixed 3px top rule "measured none", L7 font-family resolution on rendered text,
L9 hit-target-floor sizing) are geometry rules sensitive to exactly that kind of sub-pixel,
text-content-driven measurement, which is consistent with (but does not itself independently prove) an
OS-level font-rendering cause. This class of divergence already has a named precedent in this same
`discipline.yml` file's own header comment, for a different fixture, paraphrased rather than quoted
verbatim here (the source line carries a glyph this document avoids): on the timeline-labels GREEN
fixture, Linux-CI's font fallback overflows digits by 11px at 380px where the identical fixture fits
under Windows, a fixture-fidelity and cross-OS font-nondeterminism issue the lane that owns it already
recorded as not a confirmed production defect. This investigation did not go further to isolate the
exact glyph or CSS rule responsible (that would be fix-round work, out of scope for a read-only
finding), so the mechanism is labeled HYPOTHESIS while the higher-level claim (platform, not code or
environment misconfiguration, is the cause) is CONFIRMED by the controlled comparison above.

## Classification of the 112

Every one of the 112 is [CONFIRMED environment]: reproducible byte-for-byte on this Windows machine
across two separate runs of the identical commit, absent entirely from two separate CI (Linux) runs
of commits either side of the same window, and matching a third, independent local reproduction
(the reviewer's) category for category. None of the 112 lines touch any file task 7.5 changed. None
of them is evidence of a real regression CI is failing to catch: they are findings that appear only
when this specific guard runs on Windows Chromium, which is not the platform CI enforces the guard
against.

This does not mean the underlying pixel conditions (a 40.6x28px hit target on `/research`, an absent
3px top rule on four `/watchlist` fixture rows, the Anton-family resolution on `/admin`'s "May 27")
are fictitious measurements: a Windows user's real browser could plausibly hit some of the same
metrics-driven edge (Windows Chrome/Edge also uses DirectWrite). But that is a claim about
Windows-specific customer-surface fidelity, which is a separate, new investigation from D8's question
("is CI's green real, and is the local 112 a defect CI is missing"). D8's question is answered: CI's
green is real, and the 112 are not evidence of that green being wrong.

## The one command

There is no single native-Windows command today that reproduces CI's Linux rendering exactly, because
the divergence found here is an OS-level Chromium behavior, not something a flag or an npm script
toggles. Neither Docker nor WSL2 is installed on this machine right now:

```
$ docker --version
/usr/bin/bash: line 2: docker: command not found
$ wsl --status
The Windows Subsystem for Linux is not installed.
```

Once one of those is available, the CI-equivalent command (from the repo root, inside a Linux
environment) is:

```
wsl -- bash -lc "cd fsi-app && npx playwright install --with-deps chromium && node .discipline/rendering/run-rendering-guard.mjs"
```

or the Docker equivalent against the same `node:24` base CI uses. Until then, the honest
CI-equivalent result for this specific guard is the actual CI job log for the commit in question,
not a native-Windows local run:

```
gh run view <run-id> --json jobs -q '.jobs[] | select(.name | startswith("Rendering guard")) | .databaseId'
gh api repos/Dwarves77/dotfiles/actions/jobs/<job-id>/logs
```

A lane on this machine should treat a local red from `run-rendering-guard.mjs` on the `/settings`,
`/watchlist`, `/research`, `/map`, `/admin`, `/profile` routes at 1024/1440 as inconclusive on its own
and check the pushed commit's actual CI job log before treating it as a real regression, rather than
re-running the same native-Windows command expecting a different answer (it will not differ; see the
determinism check above).

## What this investigation did not do

No fix was authorized or made (D8's own text: "A fix is planned only after the finding"). No baseline
file was regenerated. No source file was edited. This finding does not resolve whether the 112 Windows
findings represent a real Windows-Chrome/Edge customer-facing defect; that would be new, separately
scoped work (most directly: whether to broaden the layout guard to run cross-platform CI matrix jobs,
or to treat this class as permanently out of scope the way the timeline-labels fixture already is).
