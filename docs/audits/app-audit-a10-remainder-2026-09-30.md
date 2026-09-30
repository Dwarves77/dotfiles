# App Audit A10 - Remainder Register (2026-09-30)

Lane A10 (REMAINDER), Sonnet, read-only. Scope: `fsi-app/src/__tests__/**`, `fsi-app/src/_archive/**`,
`fsi-app/src/data/**`, `fsi-app/src/test-support/**`, `fsi-app/src/proxy.ts`; fsi-app root files
(README, STATUS.md header, THIRD-PARTY-NOTICES, eslint/next/postcss/tsconfig/vercel/package.json);
`fsi-app/public/**`; `fsi-app/docs/**` (fsi-app's own docs dir); `fsi-app/supabase/**` except
`migrations/**` and `seed/**`; root `.claude/**` (excluding `.claude/worktrees/**` per coordinator
correction) and `fsi-app/.claude/**` (SKILL.md files owned by lane A6, listed not re-audited); root
`.gitattributes`/`.gitignore`/`.bashrc`/`install.sh`.

No code changed. No DB touched. Verification per rule 14: every finding below carries a status token.

---

## Summary

| Area | Findings | Severity spread |
|---|---|---|
| Dead/orphaned code & data | 3 | P2 ×3 |
| CI / build config gaps | 1 | P2 |
| Dependency hygiene | 1 | P3 |
| Repo hygiene (boilerplate) | 1 | P3 |
| `.claude` permission scope | 1 | P2 |
| Secrets scan | 0 findings (clean) | - |
| Doctrine/build-mode compliance | 2 positive confirmations | - |
| Doc hygiene | 1 | P3 |
| Historical / carried-forward (out of live scope) | 3 | informational |

**Top 5 (with status tokens):**
1. **[CONFIRMED]** `fsi-app/src/data/seed-resources.json` (4,491 lines, ~1.23 MB) has zero importers, dead data file.
2. **[CONFIRMED]** `fsi-app/supabase/seed.sql` (1,318 lines) targets three tables (`resources`, `cross_references`, `supersessions`) dropped by migration `013_drop_legacy_tables.sql`, entirely dead, would error if ever run, and is invoked by no script or CI job.
3. **[CONFIRMED]** ESLint is configured (`eslint.config.mjs`, `npm run lint`) but is never invoked by any GitHub Actions workflow.
4. **[CONFIRMED]** `.claude/settings.local.json` and `fsi-app/.claude/settings.local.json` are tracked in git rather than gitignored (the Claude Code convention treats "local" settings as per-developer/untracked); the `fsi-app` copy grants `Read(//c/Users/jason/**)`, the entire user home directory.
5. **[CONFIRMED]** `react-leaflet-cluster` is declared in `package.json` dependencies with zero imports anywhere in `src/`.

---

## Findings - Dead / orphaned code & data

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A10-1 | `fsi-app/src/_archive/lib/agent/extract-research-sections.ts`, `.../dashboard/credibility.ts`, `.../dashboard/critical-items.ts`, `.../d3/hooks-reconstruction.mjs` | The 4 archived files are correctly excluded from compilation (`tsconfig.json` `"exclude": [..., "src/_archive"]`) and have zero importers anywhere in `src/` outside the directory itself (grep-confirmed). Working as designed, this is **not a defect**, it is a properly quarantined archive. | **[CONFIRMED, read tsconfig.json exclude list + grep for importers]** |, (informational) | No action; correctly isolated | - |
| A10-2 | `fsi-app/src/data/seed-resources.json:1-4491` | Zero importers. `src/lib/data.ts:202` comment states it was formerly loaded via `await import("@/data")` but that barrel + its only call site were removed 2026-07-12 (lane T7); nothing in `src/data/` re-exports it today, and grep for `"@/data"` across `src/` returns only that historical comment. The file is a ~1.23 MB dead static regulatory-content artifact, exactly the class of hardcoded-fact drift rule 1 ("facts live in Supabase") warns against, now doubly wrong because it is also unreachable code. | **[CONFIRMED, read data.ts:190-215, grep `"@/data"` across src/, confirmed no `src/data/index.ts` exists]** | P2 | Delete the file (or move to `docs/archive/` if historical value is wanted); it duplicates content already frozen in `supabase/seed.sql` (see A10-3) | S |
| A10-3 | `fsi-app/supabase/seed.sql:1-1318` | Targets `INSERT INTO resources`, `cross_references`, `supersessions`, all three tables were `DROP TABLE ... CASCADE`'d by `supabase/migrations/013_drop_legacy_tables.sql`. Running this file against the live schema today would fail outright. No script, CI workflow, or doc references `supabase/seed.sql` (grep across `.github/workflows/`, `scripts/`, `docs/` found zero hits). It is a frozen 2026-03-02 snapshot of the same content that is separately (and equally dead) in `src/data/seed-resources.json` (A10-2). | **[CONFIRMED, grep `013_drop_legacy_tables.sql` for `DROP TABLE`, grep repo-wide for `seed.sql` references]** | P2 | Delete the file; if wanted as a historical record, move under `docs/archive/` with the drop-migration cited | S |

## Findings - CI / build config

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A10-4 | `fsi-app/eslint.config.mjs`, `fsi-app/package.json:"lint"` vs `.github/workflows/*.yml` | ESLint is configured (Next.js core-web-vitals + typescript configs) and `npm run lint` is a real script, but no workflow in `.github/workflows/` invokes it. The only "lint" reference repo-wide is `actionlint` in `discipline.yml`, which lints the *workflow YAML itself*, not application code. `next build` (build-proof.yml) type-checks via `tsc` but does not run ESLint separately (Next 16's build-time lint step was not observed invoked either). | **[CONFIRMED, grep `eslint\|npm run lint` across `.github/workflows/*.yml`, only actionlint hit]** | P2 | Add an `npm run lint` step to `discipline.yml` or `build-proof.yml` | S |

## Findings - Dependency hygiene

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A10-5 | `fsi-app/package.json` `dependencies."react-leaflet-cluster"` | Declared (`^4.0.0`) with zero imports/references anywhere in `src/` (grep for `react-leaflet-cluster` and `MarkerClusterGroup`, both empty). `react-leaflet` itself (the base library) is used; only the clustering add-on is unused. | **[CONFIRMED, grep across src/, no hits]** | P3 | Remove from `package.json`/lockfile, or wire it into the `/map` marker layer if clustering was the intent | S |
| A10-6 | `fsi-app/package.json` `dependencies."@types/leaflet"` | A `@types/*` package is declared under `dependencies` rather than `devDependencies`. Harmless at runtime (types are erased) but inconsistent with the rest of the type-only packages (`@types/node`, `@types/react`, `@types/react-dom` are all correctly in `devDependencies`). | **[CONFIRMED, read package.json dependency block]** | P3 | Move to `devDependencies` for consistency | S |
| A10-7 | `fsi-app/package.json`, no `"test"` script | Tests run via `.discipline/run-test-suite.sh` (discovery-by-`git ls-files`, documented in that file's header) rather than `npm test`. This is a deliberate, documented convention (not a gap, the 34 `__tests__/*.test.mjs` files in this lane's own read-set are confirmed execution-wired via `node .discipline/lib/test-discovery.mjs`), but it means `npm test`, the ecosystem-standard entry point, does nothing / errors, which could surprise a future contributor or CI generator that assumes it exists. | **[CONFIRMED, ran `node .discipline/lib/test-discovery.mjs`, all 34 `__tests__/*.test.mjs` files listed; package.json has no test script]** | P3 (informational) | Optional: add `"test": "sh .discipline/run-test-suite.sh"` alias for ecosystem-tooling compatibility | S |

## Findings - Repo hygiene

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A10-8 | `fsi-app/README.md` (entire file); `fsi-app/public/{file,globe,next,vercel,window}.svg` | `README.md` is still the unmodified `create-next-app` scaffold text (references the Geist font, which this project does not use, it uses Plus Jakarta Sans + Anton per doctrine). The 5 default Next.js boilerplate SVGs in `public/` are unreferenced anywhere in `src/` (grep confirmed). Both are `create-next-app` leftovers never cleaned up across ~800 commits of product work. | **[CONFIRMED, read README.md in full; grep for each svg filename across src/, zero hits]** | P3 | Rewrite README to describe the actual project (or link to `fsi-app/.claude/CLAUDE.md`); delete the 5 unused SVGs | S |
| A10-9 | `fsi-app/docs/admin-scan-audit.md` | Filename carries no date, unlike almost every other file in `docs/` and `docs/audits/`, which follow the `-YYYY-MM-DD` convention required by root `CLAUDE.md` standing rule 10 ("Dates in filenames for anything point-in-time"). The content itself is point-in-time (references a specific commit `f0f7cdf` and a specific route state). | **[CONFIRMED, read file, no date in name or frontmatter beyond inline commit refs]** | P3 | Rename with the date the audit was performed, or add a header note if the content is meant to stay evergreen | S |

## Findings - `.claude` permission scope

| id | file:line | finding | status | severity | better solution | effort |
|---|---|---|---|---|---|---|
| A10-10 | `.claude/settings.local.json`, `fsi-app/.claude/settings.local.json` | Both files are **tracked in git** (`git ls-files` lists both), contrary to the Claude Code convention that `settings.local.json` is per-developer/local and normally gitignored (only `settings.json` is meant to be the shared, committed config). `fsi-app/.claude/settings.local.json` grants `"Read(//c/Users/jason/**)"`, read access to the entire user home directory, far broader than the task-scoped `additionalDirectories` entries alongside it, plus a one-off, hardcoded `Bash(gh pr create --title 'Phase A: ...' --body ...)` allow-string that has no ongoing utility once that PR shipped. Root `.claude/settings.local.json` similarly grants broad `Read`/scratchpad paths tied to specific past session temp-dirs. Not a secret leak (no credentials present, confirmed by the repo-wide secret-pattern grep, see below) but an over-broad, stale, and mis-homed permission surface committed to a shared repo. | **[CONFIRMED, `git ls-files \| grep settings.local.json` returns both paths; read both files in full]** | P2 | Add `.claude/settings.local.json` and `**/settings.local.json` to `.gitignore`; move any permissions that must be team-shared into the tracked `settings.json` files (already present and narrower); drop the stale one-off `gh pr create` allow-string | S |

## Positive confirmations (doctrine / build-mode compliance)

| id | finding | status |
|---|---|---|
| A10-11 | `fsi-app/public/robots.txt` blocks GPTBot, ChatGPT-User, Google-Extended, CCBot, anthropic-ai, Claude-Web, Bytespider, Amazonbot, FacebookBot, Applebot-Extended, PerplexityBot, Cohere-ai, Meta-ExternalAgent entirely, and blocks `/api/`, `/dashboard/`, `/settings/`, `/admin/` for all other crawlers, exactly matching the doctrine cited in `fsi-app/.claude/CLAUDE.md` ("robots.txt blocks all AI crawlers and all /api/, /dashboard/, /settings/, /admin/ routes"). | **[CONFIRMED, read robots.txt in full]** |
| A10-12 | `fsi-app/vercel.json` contains no `crons` key (only `framework`/`regions`). Consistent with root `CLAUDE.md` standing rule 16 ("build mode holds the scrape cadence OFF... no standing schedules during build, every runtime by explicit dispatch"). No standing schedule is declared at the Vercel-config layer. | **[CONFIRMED, read vercel.json in full]** |

## Secrets scan

| id | finding | status |
|---|---|---|
| A10-13 | Grepped `src/`, `scripts/`, `supabase/` (all subdirs), `.github/`, and root/`fsi-app` `.claude/` (excluding `.claude/worktrees/`) for common secret-key shapes (`sk-[A-Za-z0-9]{20,}`, AWS `AKIA...`, PEM private-key headers, GitHub `ghp_...`, Slack `xox[baprs]-...`). Zero matches in any tracked file within this lane's read set. | **[CONFIRMED, grep run, zero matches]** |
| A10-14 | `fsi-app/.gitignore` documents a *historical, already-remediated* incident: `.perftoken`/`.perfrefresh`/`.fsi-perftoken` "were historically tracked at the repo root and carried plaintext Supabase JWT + refresh tokens," untracked 2026-05-13. No live exposure today, the ignore rules are the fix already in place. Recorded here for completeness, not as a new finding. | **[CONFIRMED, read .gitignore header comment]** |

## Historical / carried-forward items (outside this lane's live-file scope)

| id | finding | status |
|---|---|---|
| A10-15 | `fsi-app/docs/FULL-CODEBASE-AUDIT-2026-06-06.md` section 9 (a doc already in this lane's read set, dated 2026-06-06) records that at that time the **out-of-repo, user-level** `~/.claude/settings.json` embedded a plaintext GitHub PAT and the Supabase service-role JWT in its permissions allow-list. That file is not part of this repository (it lives outside any git-tracked tree on the operator's machine) and was not observable from this worktree, I cannot re-verify its current state, and it is explicitly out of scope per the root doctrine ("`.claude/` = Commands, settings, agent worktrees" refers to the in-repo copies). Carried forward as a labeled hypothesis, not re-confirmed this session. | **[HYPOTHESIS, cited from a prior session's audit doc, not independently re-verified; out of repo scope]** |
| A10-16 | Root `.bashrc`/`install.sh` fetch the operator's *global* `~/.claude/CLAUDE.md` from an unauthenticated, mutable public GitHub Gist URL (`gist.githubusercontent.com/Dwarves77/...`) via `curl -sf`, with no revision pin or checksum, then that fetched file becomes global agent instructions for future sessions. Root `CLAUDE.md` already labels this file "Legacy dotfiles; not part of the product," so it is out of the product's blast radius, but the mechanism itself (unauthenticated, unpinned remote fetch feeding agent instructions) is a theoretical supply-chain consideration for the operator's own workflow. | **[HYPOTHESIS, mechanism observed and read in full; no exploit attempted or evidence of compromise]** |
| A10-17 | `fsi-app/docs/data-audit-dispositions.md` records one open waiver (`unregistered-span-host`) with an explicit expiry of **2026-07-15**, and states its own enforcement rule in the same file: "Time never clears red... An expired waiver blocks again." Today's session date is 2026-09-30, well past that expiry. Whether generation preflight is *currently* halted on this (live DB / `integrity_flags` state) cannot be determined from files alone; this is a decision-ready item for a lane with DB access to check, not a code defect. | **[HYPOTHESIS, read the doc's own rule and expiry date; live DB state not queryable from this file-only audit]** |

---

## Coverage appendix

Every file in the assigned read set, with line count and a one-line verdict. A file's absence from
this list means the audit is incomplete.

### `fsi-app/src/__tests__/**` (34 files, execution-wired, confirmed via `node .discipline/lib/test-discovery.mjs`)

| file | lines | verdict |
|---|---|---|
| carbon-intensity.test.mjs | 73 | clean; execution-wired |
| carrier-ets-surcharge-composition.test.mjs | 139 | clean; execution-wired |
| contracts-corridor-id.test.mjs | 162 | clean; execution-wired |
| contracts-envelope.test.mjs | 320 | clean; execution-wired |
| contracts-licence-and-tier.test.mjs | 369 | clean; execution-wired |
| contracts-vocabularies.test.mjs | 296 | clean; execution-wired |
| domain-laundering.test.mjs | 44 | clean; execution-wired |
| fueleu-annex-iv.test.mjs | 117 | clean; execution-wired |
| jurisdiction-iso-mapping.test.mjs | 91 | clean; execution-wired |
| leakage-fix-classifier.test.mjs | 266 | clean; execution-wired |
| lineage-backfill.test.mjs | 128 | clean; execution-wired |
| market-carbon-overlay-composition.test.mjs | 141 | clean; execution-wired |
| market-ecb-fx-parser.test.mjs | 468 | clean; execution-wired |
| market-eia-v2-petroleum-spot-parser.test.mjs | 288 | clean; execution-wired |
| market-eu-oil-bulletin-parser.fixtures.mjs | 40 | fixture, imported by the parser test, not itself a runnable test |
| market-eu-oil-bulletin-parser.test.mjs | 119 | clean; execution-wired |
| market-headline-series-select.test.mjs | 240 | clean; execution-wired |
| market-producer-composition.test.mjs | 205 | clean; execution-wired |
| market-refresh-published-price-statistics.test.mjs | 218 | clean; execution-wired |
| market-series-board-view-model.test.mjs | 245 | clean; execution-wired |
| market-series-deltas.test.mjs | 154 | clean; execution-wired |
| market-series-freshness.test.mjs | 108 | clean; execution-wired |
| market-series-registry.test.mjs | 110 | clean; execution-wired |
| market-signal-promotion.test.mjs | 95 | clean; execution-wired |
| market-write-market-series.test.mjs | 92 | clean; execution-wired |
| oil-bulletin-workbook.fixtures.mjs | 350 | fixture, imported by its test |
| oil-bulletin-workbook.test.mjs | 425 | clean; execution-wired |
| org-ban-check.test.mjs | 65 | clean; execution-wired |
| origin-class-mapping.test.mjs | 75 | clean; execution-wired |
| prose-renderer-scope.test.mjs | 89 | clean; execution-wired |
| regional-bls-oews-composition.test.mjs | 205 | clean; execution-wired |
| regional-eurostat-lc-lci-lev-composition.test.mjs | 199 | clean; execution-wired |
| regional-eurostat-nrg-pc-205-composition.test.mjs | 203 | clean; execution-wired |
| research-surface-candidate.test.mjs | 63 | clean; execution-wired |
| select-modal-factor.test.mjs | 162 | clean; execution-wired |
| statutory-types.test.mjs | 48 | clean; execution-wired |
| surface-admission.test.mjs | 172 | clean; execution-wired |

### `fsi-app/src/_archive/**`, `test-support/**`, `proxy.ts`, `data/**`

| file | lines | verdict |
|---|---|---|
| src/_archive/lib/agent/extract-research-sections.ts | 53 | dead by design, properly excluded (A10-1) |
| src/_archive/lib/dashboard/credibility.ts | 170 | dead by design, properly excluded (A10-1) |
| src/_archive/lib/dashboard/critical-items.ts | 270 | dead by design, properly excluded (A10-1) |
| src/_archive/lib/d3/hooks-reconstruction.mjs | 58 | dead by design, properly excluded (A10-1) |
| src/test-support/fake-supabase.mjs | 107 | live, used by 4 real test files (link-item-entities.test.mjs, apply-staged-update-forward-participation.npmtest.mjs, mint-item-entities.npmtest.mjs, apply-record-briefs.test.mjs) |
| src/proxy.ts | 105 | clean, well-documented auth/routing middleware |
| src/data/seed-resources.json | 4491 | dead data, zero importers (A10-2) |

### `fsi-app` root files

| file | lines | verdict |
|---|---|---|
| README.md | 37 | unmodified create-next-app boilerplate (A10-8) |
| STATUS.md (header only, per brief) | - | HISTORICAL banner confirmed present and correct |
| THIRD-PARTY-NOTICES.md | 47 | clean, one MIT-licensed vendored source properly attributed |
| eslint.config.mjs | 19 | clean config; never invoked by CI (A10-4) |
| next.config.ts | 135 | clean, well-documented (worktree Turbopack fix, PERF-2/PERF-9 notes) |
| postcss.config.mjs | 8 | clean |
| package.json | 61 | clean; see A10-5/A10-6/A10-7 |
| tsconfig.json | 32 | clean; correctly excludes `src/_archive`, `supabase/functions`, `node_modules` |
| vercel.json | 8 | clean; no crons (A10-12) |
| next-env.d.ts | - | not present (gitignored/generated, confirmed via `fsi-app/.gitignore:41`) |

### `fsi-app/public/**`

| file | verdict |
|---|---|
| robots.txt | matches doctrine exactly (A10-11) |
| file.svg, globe.svg, next.svg, vercel.svg, window.svg | unreferenced boilerplate (A10-8) |

### `fsi-app/supabase/**` (excluding `migrations/**`, `seed/**`)

| file | lines | verdict |
|---|---|---|
| functions/capture-worker/index.ts | 615 | clean, well-versioned (v1.6), matches its own extensive header contract |
| seed.sql | 1318 | dead, targets dropped tables (A10-3) |
| rollbacks/164_market_intel_org_gate_rollback.sql | 61 | clean |
| rollbacks/165_profiles_self_write_and_anon_pii_rollback.sql | 14 | clean |
| rollbacks/166_provisional_sources_admin_select_rollback.sql | 10 | clean |
| rollbacks/167_staged_updates_reviewer_notes_rollback.sql | 11 | clean |
| rollbacks/168_aux_table_parent_gates_rollback.sql | 23 | clean |
| rollbacks/169_reconciler_rls_repair_rollback.sql | 12 | clean |
| rollbacks/170_ledger_repair_107_134_rollback.sql | 15 | clean |
| rollbacks/171_validate_provenance_brief_presence_rollback.sql | 318 | clean |
| rollbacks/180_drop_orphan_rpcs_and_dead_views.down.sql | 108 | clean |
| rollbacks/181_drop_vendor_family.down.sql | 113 | clean |
| rollbacks/183_drop_user_profiles_mirror.down.sql | 144 | clean |
| rollbacks/184_drop_ingestion_pair.down.sql | 39 | clean |
| rollbacks/185_drop_dead_columns.down.sql | 18 | clean |
| rollbacks/190_community_counter_integrity_rollback.sql | 78 | clean |
| rollbacks/191_org_membership_ban_guard_rollback.sql | 12 | clean |
| rollbacks/192_drop_forum_layer_rollback.sql | 189 | clean |
| rollbacks/195_error_events_rollback.sql | 13 | clean |
| rollbacks/200_canonical_instrument_key_rollback.sql | 18 | clean |
| rollbacks/264_rename_result_content_excerpt_rollback.sql | 70 | clean, notably careful anchor-guarded DO block |
| rollbacks/267_origin_class_and_envelope_rollback.sql | 38 | clean |
| rollbacks/332_state_cost_facts_value_numeric_rollback.sql | 13 | clean |
| rollbacks/333_derivation_edges_allow_state_cost_facts_rollback.sql | 29 | clean, guarded against data-loss |

### Root `.claude/**` (excluding `.claude/worktrees/**`) and `fsi-app/.claude/**`

| file | verdict |
|---|---|
| .claude/settings.json | clean, hooks only (vault-sync, session-start, pre-compact), no permissions block |
| .claude/settings.local.json | tracked-in-git over-broad permissions (A10-10) |
| .claude/commands/done.md, ledger.md, start.md, status.md | clean, all point at the `ledger` skill correctly |
| .claude/hooks/vault-sync.mjs | 170 | clean, defensively written (phantom-file classifier, fail-safe) |
| .claude/hooks/session-start-vault.mjs | 112 | clean |
| .claude/hooks/pre-compact-snapshot.mjs | 86 | clean |
| .claude/hooks/vault-sync.test.mjs | 195 | clean, thorough real-git-fixture tests |
| .claude/skills/ledger/SKILL.md | clean |
| .claude/launch.json | not present in this worktree snapshot (untracked local file per root gitStatus) |
| fsi-app/.claude/CLAUDE.md | (full doctrine file; already the primary product-doctrine reference, read in full) |
| fsi-app/.claude/PLUGIN-NOTES.md | 44 | clean, documents plugin drift risk, informational |
| fsi-app/.claude/settings.json | clean, narrow allow-list |
| fsi-app/.claude/settings.local.json | tracked-in-git over-broad permissions (A10-10) |
| fsi-app/.claude/skills/*/SKILL.md (7 files: analysis-construction-spec, caros-ledge-platform-intent, caros-ledge-surface-contracts, done, environmental-policy-and-innovation, remediation-discipline, source-credibility-model, sprint-followups-discipline) | **owned by lane A6**, listed only, not re-audited, per coordinator scope correction |

### Root dotfiles

| file | lines | verdict |
|---|---|---|
| .gitattributes | 49 | clean, well-documented (LF-normalization for discipline-guard byte parity, binary woff2 exception) |
| .gitignore | 73 | clean; documents remediated perftoken incident (A10-14) |
| .bashrc | 47 | legacy per doctrine; unauthenticated remote CLAUDE.md fetch (A10-16) |
| install.sh | 37 | legacy per doctrine; same remote-fetch pattern (A10-16) |

### `fsi-app/docs/**` (fsi-app's own docs dir)

All ~110 files in this tree were read. The large majority are dated, historical sprint/audit/design
artifacts (Sprint 3/4, the redesign template rollout, corpus-integrity drain sessions) consistent with
their own narrative, no code defects found inside docs content itself beyond what is cited above and
in the findings tables. Full per-file line counts were captured during the audit; the three largest
files warrant an explicit disclosure:

- **[CONFIRMED, file headers + multiple full sample records read directly; cross-checked against their narrative .md reports]** `docs/audits/sprint3-a1-revised-manifest-2026-05-25.json` (14,918 lines), `docs/audits/sprint3-classifier-quality-batch-2026-05-25.json` (8,072 lines), and `docs/audits/sprint3-corpus-reclassify-crosscheck-2026-05-27.json` (3,200 lines), combined ~26,190 lines, over half of `docs/`'s total line count, are homogeneous, machine-generated Haiku-classification batch outputs (per-item `id`/`title`/`category`/`rationale` records, ~450 near-identical rows), not code, and carry no anomaly. I read each file's header/schema and multiple full sample records, and cross-verified structure and content against the narrative `.md` reports that describe them (`sprint3-a1-a3-prework-summary-2026-05-25.md`, `sprint3-corpus-reclassify-audit-2026-05-27.md`, `sprint3-followup-part2-...`), all read in full. I did not re-read all ~26,000 lines record-by-record verbatim: doing so is per-line duplication of content already fully characterized by its own summary docs, and directly conflicts with root `CLAUDE.md` standing rule 11 ("never call a list endpoint... route unavoidably large or noisy tool output... when a session passes context on finished work, say so"). Flagged here explicitly per rule 14 rather than silently claimed as verbatim-read. No anomaly, secret, or unexpected field was found in any sampled record.
- `docs/sprint4-governing-state.md` (799 lines) and `docs/sprint4-workflow-spec.md` (462 lines) were read in full across two passes each (offset-paginated), no coverage gap.
- All other `docs/` files (≤1,349 lines each) were read in full in one pass.

---

## Decision-ready build items

1. **Delete `fsi-app/src/data/seed-resources.json` and `fsi-app/supabase/seed.sql`.** Both are fully dead (A10-2, A10-3), duplicate each other's content, and target/reference nothing live. A single commit removing both, with a one-line note citing this audit, closes the finding completely, no investigation or design decision required.
2. **Add an ESLint step to CI** (A10-4). Exact change: add a `- name: Lint` step running `npm run lint` inside `discipline.yml`'s existing npm-dependent job (it already runs `npm ci`), or as a new lightweight job in `build-proof.yml`. No config change needed, `eslint.config.mjs` is already correct and would run as-is.
3. **Gitignore the two `settings.local.json` files** (A10-10): `git rm --cached .claude/settings.local.json fsi-app/.claude/settings.local.json`, add both paths (or a `**/settings.local.json` glob) to the relevant `.gitignore`, and audit whether any permission currently only in the local files needs promoting into the tracked `settings.json` files first.
4. **Remove `react-leaflet-cluster`** from `package.json`/lockfile (A10-5), or wire it into the `/map` marker layer, operator/design decision on which; either is a small, low-risk commit.

