# 2026-10-04, lane S1-D (s1d-walker-registers): the research walker registers and rates an OpenAlex publisher

## Accomplished

- `fsi-app/scripts/research/research-walker.mjs`: new exported `resolveOpenAlexPublisher` and an exported
  `runWalk`. Each OpenAlex candidate's publisher host is placed by the existing `rateSourceByInstitutionClass`
  (built-in rules, no stored name passed) and then by `verdictPlacementForHost` over committed host verdicts.
  Placed: registered through `registerSource` (apply mode, `extra.status = "provisional"`, `base_tier` from
  the class table) or `would_register` (dry), then minted through the unchanged chokepoint. Unplaced: residue
  with reason `awaiting host verdict batch` (constant imported from `resolve-provisional-sources.mjs`), host
  added to `metrics.unplaced_hosts` (`{host, name, discovered_via, sample_url}`), counted in
  `residue_awaiting_host_verdict`, not in `rejected_unsourced`. A work with no resolvable URL is still dropped
  by `normalizeOpenAlexWork`.
- `fsi-app/src/lib/sources/host-authority.ts`: every built-in rule (codified legal/gov, host-only classes,
  the 8 residue rules) now returns its tier from `HOST_CLASS_TIER`; no tier literal remains in a rule.
  `RULED_HOST_TIER` (per-host recorded rulings) stays literal data.
- `fsi-app/src/lib/sources/host-authority-class-tier.test.mjs`: one representative host per class through
  `classTierForHost`, plus the name-derived residue rules, asserted equal to `HOST_CLASS_TIER`.
- Fixtures: three OpenAlex works (built-in placed `eprints.soton.ac.uk`, verdict-placed
  `unplaced-example.test` via `host-verdicts-000.fixture.json`, unplaced `unlisted-journal.example`).
- Harness: `research-walker-run-003.json` (dry fixture run, new metrics shape) and pending marker
  `pending/2026-10-04-s1d-walker-registers.md`.

## Read and reused

Read in full: CLAUDE.md, lane-common-contract.md, research-walker.mjs and both test files and fixtures,
2026-10-02-l7.md session log, `rate-source-by-class.mjs`, `host-authority.ts`, the host-verdicts README and
loader, `registerSource` in `db.mjs`. Reused: `rateSourceByInstitutionClass`, `verdictPlacementForHost`,
`loadHostVerdicts` and its committed fixture batch, `registerSource`, `RESIDUE_REASON`, the mint chokepoint.
No second rating path built.

## Decisions

- Verdict placement is done in the walker, not in `rate-source-by-class.mjs`, which is outside this lane's
  write set.
- No stored name is passed for an OpenAlex publisher, so an unknown host is never rated `company` by the
  residue rule 7 (it stays unplaced, per the brief).
- `main()` stays dry and fixture-only; the apply path is exercised only by an injected `registerSourceFn` in tests.

## NOT done

- `doi.org` (a DOI resolver, not a publisher) is unplaced and appears in `metrics.unplaced_hosts`; a host
  verdict naming it would register the resolver as a source. See open items.
- Run-001 and run-002 are immutable history and were not rewritten; the new shape lands as run-003.
- No live run, no DB access, no apply.

## Open items

- Whether `doi.org` joins the permanent never-register list in `permanentlyUnregisteredClass` (the class-table
  comment already names "DOI-resolver" in that list but no pattern implements it). Proposed fix: add it to
  `HOSTING_PLATFORM`; waiting for the coordinator, not done here.
