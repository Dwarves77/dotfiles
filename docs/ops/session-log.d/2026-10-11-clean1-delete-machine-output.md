# 2026-10-11 CLEAN-1: committed machine output and archives removed

Lane clean1-delete-machine-output (build lane, Sonnet). Operator ruling, 2026-10-11: delete outright, nothing archived,
nothing kept "just in case"; a consumer that only existed to read the deleted evidence is deleted with it.

## Accomplished

- Line count before: 1,659,012; after: 880,366 (`git ls-files -z | xargs -0 cat | wc -l`, both sides, same command; the binary
  artboard images in the handoff folders count by newline bytes, which is why the drop exceeds the text-line sum below).
- Directories removed (text lines, from `git diff --numstat`), every top path listed for HISTORY-1:
  - docs/ratifications 139,546
  - fsi-app/scripts/harness-runs run records only (`*-run-NNN.json`, `traces/`, `LAST-PROPOSER-PASS.md`; 222 files) 127,649
  - docs/archive 108,559
  - fsi-app/.discipline/rendering/audit/results.json 53,545
  - fsi-app/scripts/turns/record-briefs/batches (14 of 15 files) 51,402
  - fsi-app/scripts/_worklists (4 data files) 40,111
  - fsi-app/docs/audits 35,636
  - fsi-app/src/lib/connections/fixtures/census-rows.apply-ready.json 20,562
  - fsi-app/.discipline/governance/coverage-report.json, harness-ledger-export.json, loop-fired-evidence.json 18,678
  - fsi-app/scripts/turns/ledger-verdicts/ledger-verdicts-001.json and -002.json 10,165
  - docs/design/handoff-2026-09-06 8,923 text lines plus its images and 640 KB canvas HTML; docs/design/handoff-2026-09-07 2,826 plus images
  - design_handoff_2026-05 5,046
  - fsi-app/.discipline/rendering/layout-guard/results.json 4,987
- fsi-app/scripts/harness-runs is a MIXED directory: it also holds live code (family-registry.mjs, governing-files.mjs, their tests)
  and each family's `family.json` descriptor, which the registry derives GOVERNING_FILES and ALLOWED_FAMILIES from. Those, the
  FAMILY.md/PROTOCOL.md/CONVENTION.md/PROPOSER-RUNBOOK.md process docs and the 39 `family.json` files are kept; only the run
  records were deleted. Deleting the whole directory would have broken the harness.
- .gitignore now ignores the runtime-written paths: the audit results.json and AUDIT document, coverage-report.json,
  layout-guard results.json, harness-run records and traces and LAST-PROPOSER-PASS.md, `_worklists/*` (negating the kept
  fixtures), record-briefs/batches, ledger-verdicts-*.json. No `.gitkeep` was added: the one directory a writer needs
  (record-briefs/batches) keeps its tracked chain-proof input file, and the readers listed under 2b treat a missing directory as empty.

## 2a consumers deleted (readers of the deleted evidence only)

- fsi-app/.discipline/rendering/audit/generated-on.test.mjs (asserted the committed results.json and AUDIT document carry a linux stamp)
- fsi-app/scripts/lib/export-harness-ledger.mjs and export-harness-ledger.test.mjs (generator of the deleted ledger export)
- fsi-app/scripts/verify/loop-fired-evidence-audit.mjs and its test (validated only the deleted evidence file); registry row
  A-loop-fired-evidence retired
- fsi-app/scripts/harness-runs/append-dispatch-ledger.mjs and its test (a retired writer with no caller); two F25 allowlist entries removed
- fsi-app/scripts/verify/candidate-dwell-audit.mjs and its test, plus fsi-app/.discipline/governance/invariants.d/RD-31-candidate-dwell.mjs
  (judged a candidate by whether a committed ledger-verdicts batch named it); registry rows A-candidate-dwell and RD-31-candidate-dwell retired
- fsi-app/src/lib/connections/tag-yield.fixture.test.mjs (a yield measurement over the deleted 178-item snapshot)
- tests removed from files that stay: five `census index N` tests and their helpers in fsi-app/scripts/obligations/derive-obligations.test.mjs;
  the committed-artifact sanity test in F28-harness-run-integrity.test.mjs; the `--list` real screen family test and the G-6 committed
  history test in fsi-app/scripts/lib/run-artifact.test.mjs; three tests that read the committed ruling in
  review-apply-coverage-gaps.test.mjs and review-apply-portal-links.test.mjs; the stale committed verdict batches test in
  verdict-fixture.test.mjs; the committed batches load test in run-ledger-consume.test.mjs; the archived fork test in
  fork-log-archived.test.mjs; the AUDIT-2026-09-07 assertion in docs-only-range.test.mjs
- ci.yml: the dispatch-only "Commit the audit result back" step and the app job's `contents: write` permission (nothing commits the
  deleted pair any more); design-audit-workflow.test.mjs and the F52-workflow-file-validity.test.mjs PERM-1 check now require no
  write permission anywhere
- memory-gate.mjs: the ledger export removed from the refresh-file pattern, with its tests

## 2b readers (live inputs) made or confirmed empty-tolerant

- fsi-app/.discipline/rendering/audit/run-audit.mjs:557-567 writes results.json and now writes the AUDIT document beside it (gitignored)
  instead of into docs/design/handoff-2026-09-06; ci.yml design-audit step and upload point at the new path
- fsi-app/scripts/turns/run-population-flywheel.mjs `--check-gate` already prints "no prior mint-run artifact on this checkout, nothing to gate" and
  exits 0 on an empty directory (fired for real in this lane)
- fsi-app/scripts/turns/run-ledger-consume.mjs:733-737 and fsi-app/scripts/drain/plan-drain.mjs:343 treat a missing batch or verdict directory as `[]`
- run-artifact.mjs readHarnessLedgerExport (:337) returns `present: false` on a missing export; closure-gate.mjs, F28, F50 and
  verification-audit-report.mjs read it and fall back (closure-gate to the Actions API lookup, which CI runs with GITHUB_TOKEN)
- gate-a-rescan.yml and the chain-proof steps already skip when no `attach-found-sources-*.json` worklist exists

## 2c fixtures kept

- fsi-app/scripts/_worklists/attach-found-sources.fixture.json (imported by attach-found-sources.test.mjs:16)
- fsi-app/scripts/_worklists/statutory-fueleu-annex-iv-2026-09-05.json, .test.mjs and .BROWSER-WORKLIST.md (imported by validate-statutory-rows-file.test.mjs:15)
- fsi-app/scripts/verify/lib/fixtures/duplicate-table-schema-snapshot.json and fsi-app/scripts/producers/operations/fixtures/ukpn-capacity-heatmap-sample.json (fixtures a test imports)
- fsi-app/scripts/proof/attacks/attacks.json (the attack manifest, hand-authored input of run-attacks.mjs)

## STOP list (a reader that cannot work without committed history, kept or left as is)

- fsi-app/scripts/proof/steps/prepare.mjs:62-75 (chain-proof `brief-batch` hook) reads every committed record-briefs batch for production item
  ids that exist in the local subset; tests prepare.test.mjs:101 and :120 and run-chain-steps.test.mjs need them. Kept only
  fsi-app/scripts/turns/record-briefs/batches/record-briefs-009b-tool.json (195 lines), the batch the subset export pins. [WORK: owed]
- fsi-app/scripts/mint/export-census-rows.mjs:1521-1523 (loadReviewedVerdicts) reads fsi-app/scripts/mint/reviewed-verdicts.json (8,732 lines),
  with screen-rules.test.mjs:598 and :601 asserting rule outcomes that live in it. It is operator-reviewed judgement input, not machine output, so it was
  kept and not counted among the deleted files. Whether it is folded into the rules or deleted is a ruling. [WORK: owed]

## Decisions

- docs/INDEX.md edit REVERTED: the brief (step 5) orders removing the dead lines, but F51 check 4 fails any `lane/` branch that touches
  docs/INDEX.md (COMMON rule 4), and the fitness runner went red on exactly that file. The lines are listed below for the coordinator.
- Edits made by a shell script under a PreToolUse governing-skill block loaded fsi-app:remediation-discipline and
  fsi-app:environmental-policy-and-innovation first, as that hook instructs.
- A stale GITHUB_TOKEN-less local run of closure-gate.test.mjs fails NEVER-RUN because the ledger export no longer dates anything;
  with the token the live lookup passes (closure-gate PASS in this lane), and ci.yml gives both the suite step and the gate step `GITHUB_TOKEN: ${{ github.token }}`.

## Read and reused

- Read the callers named in the consumer grep for every path (listed above) and the headers of F25, F28, F50, F51, F52, closure-gate, memory-gate,
  registry.mjs, run-artifact.mjs, run-audit.mjs, ci.yml (design-audit job), layout-baseline-renewal.yml. Reused the registry's retired-id
  records, the existing gitignore, the shipped design-audit generator and its workflow test; no new mechanism was built.

## NOT done

- docs/INDEX.md still lists dead links: lines for ratifications/2026-09 README, ratifications/2026-09/proposed/README, ratifications/2026-09/RULING-2026-09-06, design/handoff-2026-09-06/README, design/handoff-2026-09-07/README; the whole-build-audit-2026-10-11 line's trailing "archive logs" link; and the sentence about archive/ in line 3. [WORK: owed]
- fsi-app/.claude/CLAUDE.md line 8 points at docs/archive/CLAUDE-session-log-2026-04.md, now deleted (the brief bars CLAUDE.md edits). [WORK: owed]
- fsi-app/src/app/theme.css:5, :17, :114 and about thirty component headers cite docs/design/handoff-2026-09-06 README and DEVIATION-LOG as the design authority; the audit spec JSON `source` strings name its artboards. The files are gone; the operator supplies artboards from Claude Design. [WORK: owed]
- Comment-only references to deleted paths remain in many scripts (for example scripts/mint/MINT-RUNBOOK.md, review-apply-*.mjs headers). [NOT-WORK: comments only, no behaviour reads them]
- F50's `enforceFired` branch and the fired-evidence reader, and the closure-gate NEVER-RUN ledger reads, are now inert (no hop sets enforceFired; the ledger export is absent and the live Actions lookup decides). Removing the dead capability is a separate change. [WORK: owed]
- no-personal-identifiers.test.mjs fails on docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md:1514 (first-name, 3 lines) on origin/master before this lane; not touched here. [WORK: owed]
- BACKLOG rows: the brief names no backlog id. [NOT-WORK: no row is closed by this lane]

## Open items

- None beyond the NOT done lines. [NOT-WORK: every open item is recorded above with its own token]
