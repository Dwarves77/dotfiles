# AUD-AT-4 gates attacked: fitness functions and governance gates (fact lane, 2026-10-08)

> **Landing note (lane GATE-8, PR 1039):** Fixes landed in PR 1039. No finding in this register was re-verified by the landing lane (DOCS-4); findings carry the tokens the audit's own method assigns. The body is the register verbatim; the only edit is the form of status tokens, where the checker required it: 2 lines received the token that line's own section or method statement already carries.

Base: origin/master 12c69634. Lens run: ATTACKED. Subsystem rows 4 (fitness functions) and 5 (governance gates). Owed cells: O-005, O-006. Every row carries a rule 14 status token.

## Declaration

- Enumerator, fitness functions: `node fsi-app/.discipline/fitness/runner.mjs --list` printed "Registered fitness functions (52)": F2, F6, F8, F9, F10, F11, F12, F13, F14, F15, F16, F18, F19, F20, F21, F22, F23, F24, F25, F27, F28, F30, F31, F32, F33, F34, F35, F36, F38, F39, F40, F41, F42, F43, F44, F45, F46, F47, F48, F49, F50, F51, F52, F59, F61, F64, F65, F66, F67, F68, F69, F70. (The 2026-10-08 register B counted 60; master has since removed F17, F26, F37, F54, F57, F58, F60, F62, F63 by GATE-3 and added F70.)
- Enumerator, governance gates: the brief's list read against `fsi-app/.discipline/governance/` and `consistency/manifest.mjs`: closure-gate (4 checks), memory-gate, invariant-coverage (with its doctrine-contradiction scan), execution-wiring, skill-contract-map (the skill-acks half was deleted by GATE-3, 2026-10-08, so only the registration half exists), worktree-isolation, consistency C3, C4, C5. Gate count: 52 fitness functions + 9 governance units = 61.
- Method: a full copy of origin/master at 12c69634 exported with `git archive` into a throwaway git repo under the session scratchpad; each attack plants or edits files there, then the real gate module from that copy is imported and run with `DISCIPLINE_REPO_ROOT` pointing at the copy (for pure-function gates the real exported function is called with the unlisted input). Nothing ran in the main checkout, no worktree was created in the repo, no network, no database, no sub-agent. Each gate's `CONTROL` row feeds the gate the form its author listed, to prove the harness can see a refusal.
- Limits: CI-only behaviour (checkout shape, step ordering) was read from `.github/workflows/discipline.yml` but not executed; rows that depend on it say so. Attack coverage per gate is two or more forms, not exhaustive.

## Result summary

- Attacks attempted (excluding controls): 279 over 61 of 61 gates with at least two attacks. ACCEPTED: 267. Refused: 12. Errors (did not execute): 0. Controls: 61, of which refused: 61.
- Owed legs (fewer than two attacks): none.

Per gate (attacks / ACCEPTED / refused / error); `*` marks the ADR-046 point 1 security and spend class (F2, F8, F13, F15, F16, F19, F20, F21, F22, F31, F32, F61, F64):

| gate | attacks | ACCEPTED | refused | error | control refused |
|---|---|---|---|---|---|
| F2* | 5 | 4 | 1 | 0 | yes |
| F6 | 2 | 1 | 1 | 0 | yes |
| F8* | 5 | 5 | 0 | 0 | yes |
| F9 | 3 | 3 | 0 | 0 | yes |
| F10 | 2 | 2 | 0 | 0 | yes |
| F11 | 2 | 2 | 0 | 0 | yes |
| F12 | 2 | 2 | 0 | 0 | yes |
| F13* | 9 | 9 | 0 | 0 | yes |
| F14 | 5 | 5 | 0 | 0 | yes |
| F15* | 9 | 9 | 0 | 0 | yes |
| F16* | 6 | 5 | 1 | 0 | yes |
| F18 | 8 | 8 | 0 | 0 | yes |
| F19* | 7 | 7 | 0 | 0 | yes |
| F20* | 7 | 7 | 0 | 0 | yes |
| F21* | 6 | 6 | 0 | 0 | yes |
| F22* | 7 | 7 | 0 | 0 | yes |
| F23 | 6 | 6 | 0 | 0 | yes |
| F24 | 3 | 3 | 0 | 0 | yes |
| F25 | 8 | 8 | 0 | 0 | yes |
| F27 | 5 | 5 | 0 | 0 | yes |
| F28 | 2 | 2 | 0 | 0 | yes |
| F30 | 5 | 5 | 0 | 0 | yes |
| F31* | 6 | 6 | 0 | 0 | yes |
| F32* | 2 | 2 | 0 | 0 | yes |
| F33 | 4 | 4 | 0 | 0 | yes |
| F34 | 7 | 7 | 0 | 0 | yes |
| F35 | 3 | 3 | 0 | 0 | yes |
| F36 | 5 | 5 | 0 | 0 | yes |
| F38 | 6 | 6 | 0 | 0 | yes |
| F39 | 6 | 5 | 1 | 0 | yes |
| F40 | 4 | 4 | 0 | 0 | yes |
| F41 | 4 | 4 | 0 | 0 | yes |
| F42 | 5 | 5 | 0 | 0 | yes |
| F43 | 6 | 6 | 0 | 0 | yes |
| F44 | 4 | 4 | 0 | 0 | yes |
| F45 | 3 | 3 | 0 | 0 | yes |
| F46 | 5 | 5 | 0 | 0 | yes |
| F47 | 3 | 2 | 1 | 0 | yes |
| F48 | 4 | 4 | 0 | 0 | yes |
| F49 | 4 | 4 | 0 | 0 | yes |
| F50 | 3 | 3 | 0 | 0 | n/a |
| F51 | 4 | 4 | 0 | 0 | yes |
| F52 | 5 | 2 | 3 | 0 | yes |
| F59 | 3 | 3 | 0 | 0 | yes |
| F61* | 3 | 3 | 0 | 0 | yes |
| F64* | 6 | 6 | 0 | 0 | yes |
| F65 | 3 | 3 | 0 | 0 | yes |
| F66 | 3 | 2 | 1 | 0 | yes |
| F67 | 4 | 4 | 0 | 0 | yes |
| F68 | 5 | 5 | 0 | 0 | yes |
| F69 | 4 | 4 | 0 | 0 | yes |
| F70 | 5 | 5 | 0 | 0 | yes |
| CLOSURE | 7 | 7 | 0 | 0 | yes |
| MEMORY | 4 | 4 | 0 | 0 | yes |
| INVCOV | 9 | 8 | 1 | 0 | yes |
| EXECWIRING | 3 | 3 | 0 | 0 | yes |
| SKILLCONTRACT | 3 | 3 | 0 | 0 | yes |
| WORKTREE-ISOLATION | 3 | 3 | 0 | 0 | yes |
| C3 | 2 | 2 | 0 | 0 | yes |
| C4 | 3 | 1 | 2 | 0 | yes |
| C5 | 2 | 2 | 0 | 0 | yes |

## ACCEPTED attacks (the gate did not block the input)

| attack | gate | form | expected | observed | evidence | status |
|---|---|---|---|---|---|---|
| B1-01 | F2 | ungated admin route as route.js (Next serves it, glob is **/route.ts) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-02 | F2 | ungated admin route.tsx variant | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-03 | F2 | gate name present only inside a string literal | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-04 | F2 | override marker forged inside a string literal on any line | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-07 | F8 | URL string earlier on the line truncates the line at // (split("//")[0]) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-08 | F8 | bracket-key assignment body["base_tier"] = x | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-09 | F8 | multi-line object literal, tier key on its own line | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-10 | F8 | client code in src/lib/client (dir not globbed) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-11 | F8 | Object.assign(body, parsed json with tier) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-13 | F13 | URL string earlier on the line (split("//")[0] hides the from()) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-14 | F13 | .upsert( instead of .insert( | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-15 | F13 | table name via variable | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-16 | F13 | insert chained more than 3 lines after from() | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-17 | F13 | template literal table name | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-18 | F13 | same insert in fsi-app/scripts (outside src glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-19 | F13 | same insert as .cjs under src (extension not globbed) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-20 | F13 | production file under a __tests__ directory | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-21 | F13 | forged override marker inside a string on the same line | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-23 | F15 | host split across a concatenation | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-24 | F15 | header spelled X-API-Key (regex is case-sensitive lowercase) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-25 | F15 | SDK import via split specifier in dynamic import | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-26 | F15 | continuation line beginning with * (code, skipped as JSDoc) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-27 | F15 | call in .cjs under scripts (glob is scripts/**/*.mjs) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-28 | F15 | call in scripts/**/*.ts | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-29 | F15 | call in a production file named *.selftest.mjs (name-excluded) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-30 | F15 | call in a component .tsx (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-31 | F15 | base URL via env var only (ANTHROPIC_BASE_URL), no literal | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-33 | F16 | host split across concatenation | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-35 | F16 | WebSocket/puppeteer connect via env var | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-36 | F16 | raw browserless host in scripts/ (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-37 | F16 | primitive keeps only a comment mentioning the gate call | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-38 | F16 | primitive gate call reduced to a string literal | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-01 | F18 | scheme strip via new RegExp string | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-02 | F18 | query and fragment dropped via split("?")[0] | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-03 | F18 | replaceAll (regex looks for .replace( only) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-04 | F18 | query dropped through the URL API (url.search = "") | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-05 | F18 | scheme strip with capture group after ^ (/^(https?):\/\//) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-06 | F18 | same normalizer in scripts/ (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-07 | F18 | forged override marker in a string on same line | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-08 | F18 | line starting with * (continuation of an expression) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-10 | F19 | nullish coalescing ?? instead of // | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-11 | F19 | ternary fallback | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-12 | F19 | fallback to the publishable key name (no ANON_KEY token) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-13 | F19 | more than 150 chars between the two names | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-14 | F19 | try/catch downgrade in two statements | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-15 | F19 | same downgrade in scripts/*.mjs (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-16 | F19 | forged override string on the matched line | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-18 | F20 | nested braces before the key inside .update({...}) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-19 | F20 | .upsert instead of .update | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-20 | F20 | update through a variable payload | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-21 | F20 | PostgREST PATCH via fetch with JSON body | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-22 | F20 | column name built by concatenation | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-23 | F20 | direct write in scripts/ (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-24 | F20 | path-suffix confusion: file whose path ends with the sanctioned suffix | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-26 | F21 | indirect call (0, generateBrief)(x) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-27 | F21 | import alias then call the alias | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-28 | F21 | namespace bracket call m["generateBrief"](x) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-29 | F21 | call split across lines (name, newline, paren) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-30 | F21 | direct call from scripts/ (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-31 | F21 | call in a component or workflow-adjacent .tsx (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-33 | F22 | a comment elsewhere in the file mentions classifySourceRole (file-wide includes()) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-34 | F22 | string literal elsewhere contains classifySourceRole | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-35 | F22 | .from( and "sources" on separate lines | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-36 | F22 | table name through a constant | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-37 | F22 | URL string earlier on line truncates (split("//")[0]) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-38 | F22 | raw SQL INSERT INTO sources through a pg client | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B2-39 | F22 | insert in scripts/*.ts or .cjs (glob is scripts/**/*.mjs) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-02 | F6 | placeholder description variants (wip_tmp, test_stuff) pass the exact-match placeholder test | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-04 | F9 | type-broken file while typescript does not resolve (fail-open SKIP path) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-06 | F10 | selftest gutted to exit 0 while the core is broken | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-07 | F10 | core broken, jiti unresolvable (SKIP -> PASS) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-08 | F11 | selftest gutted to exit 0 | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-10 | F11 | jiti unresolvable (SKIP -> PASS) with trust.ts weights altered | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-12 | F12 | moat leak in a sibling module the selftest never loads (second tier resolver) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-13 | F12 | selftest gutted to exit 0 while resolver leaks | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-15 | F14 | reader exists only inside a code comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-16 | F14 | reader exists only as a SQL comment mentioning FROM zz_orphan in a migration | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-17 | F14 | writer through a variable table name (the write is invisible, so no orphan is computed) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-18 | F14 | writer in a .cjs file (extension not scanned) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-19 | F14 | FK REFERENCES from a second table counts as a reader | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-02 | F23 | same writer with an op token (intelligence_items) in a comment: skillsForOp reads raw content | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-03 | F23 | writer placed at a path that contains an exemption substring (isExempt uses includes) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-04 | F23 | writer calls a new write RPC not in the WRITE_RPCS list | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-05 | F23 | writer in an edge function directory outside the scan roots | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-06 | F23 | writer as .cjs (CODE_RE is ts/tsx/mjs/js) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-07 | F23 | model call with host split in two strings | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-09 | F24 | table homed by a DROP-only migration (never created in the repo) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-10 | F24 | table homed by an ALTER-only migration | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-11 | F24 | table homed by a string literal that contains the CREATE text | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-13 | F25 | two dead modules importing each other (cycle, no root reaches them) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-14 | F25 | dead module whose only importer is a comment in another file | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-15 | F25 | dead module named like a Next framework entry (default.ts) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-16 | F25 | dead module with a .js extension (scope is ts/tsx/mjs) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-17 | F25 | dead script named in a comment of a workflow file (roots are mined from whole workflow text) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-18 | F25 | dead script named in a package.json script as an echo argument | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-19 | F25 | dead module under a _archive directory | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-20 | F25 | dead module under a directory named fixtures | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-22 | F27 | producer file without the #!/usr/bin/env node first line (not an entry point) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-23 | F27 | "proof" that only imports the seams and asserts nothing | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-24 | F27 | proof whose seam imports sit in comments | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-25 | F27 | producer imports its seams through a computed dynamic import | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B4-26 | F27 | producer as .js (extension not .mjs) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-02 | F30 | host derivation with a nested call: new URL(String(u)).hostname | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-03 | F30 | source_url filter through .match({}) / .filter() | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-04 | F30 | column name via a variable (.eq(col, v)) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-05 | F30 | jurisdiction_iso filter in scripts/ (not in glob) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-06 | F30 | production module named *.test.ts (".test." excluded) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-08 | F31 | .from( and the table name on separate lines | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-09 | F31 | table name through a variable | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-10 | F31 | new file inside the sanctioned directory | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-11 | F31 | raw SQL select from derived_values through a pg client | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-12 | F31 | forged override string on the same line | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-13 | F31 | read in scripts/*.ts or src .cjs (extension not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-15 | F32 | 286 trigger changed to AFTER DELETE with the required BEFORE text kept in a trailing comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-16 | F32 | a later migration replaces the purity function with a no-op and disables the trigger | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-18 | F34 | aliased named import (readFileSync as rf) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-19 | F34 | namespace import under another name (nodeFs.readFileSync) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-20 | F34 | read inside a module-scope try block | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-21 | F34 | read inside an IIFE (runs at import) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-22 | F34 | fs obtained by dynamic import, no static fs import | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-23 | F34 | fs obtained through createRequire (no literal require( ) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-24 | F34 | module-scope fs read in a file named *.spec.ts that is production | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-26 | F36 | toLocaleString() (not in the call list) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-27 | F36 | timeZone key present but undefined | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-28 | F36 | Intl.DateTimeFormat reached through destructuring | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-29 | F36 | bracket-notation call | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-30 | F36 | same code in a client-imported module that has no "use client" directive | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-32 | F38 | scientific literal .limit(1e4) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-33 | F38 | numeric separator .limit(10_000) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-34 | F38 | .range(0, 99999) instead of .limit | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-35 | F38 | lowercase same-file constant | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-36 | F38 | SCREAMING constant declared with a numeric separator | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-37 | F38 | .limit(Number("5000")) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-39 | F39 | call split across lines | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-40 | F39 | column passed as a variable | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-41 | F39 | runtime array hidden behind a SCREAMING_SNAKE name | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-43 | F39 | forged marker string on the line above | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-44 | F39 | bracket call ["in"] | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-02 | F45 | copy with one identifier renamed every 5th line (no 8-line window repeats) | refuse | ACCEPTED | dup lines base 0 head 0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-02 | CLOSURE | workflow written as "on: workflow_dispatch" / "on: [push, workflow_dispatch]" is invisible to NEVER-RUN | refuse | ACCEPTED | scalar=false list=false | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-46 | F40 | helper import path mentioned only in a comment (usesHelper uses includes) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-03 | F45 | copy with one distinct statement inserted every 6 lines | refuse | ACCEPTED | dup lines base 0 head 0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-03 | CLOSURE | NEVER-RUN evidence forged by prose: any "run 1" in the step section of the runbook counts | refuse | ACCEPTED | no-record=false forged-prose=true | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-47 | F40 | route path assembled at runtime | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-04 | F45 | copies placed where inScope() is false (fixtures dir, *.test.mjs name, .cjs outside the scope globs) | refuse | ACCEPTED | {"fixtures":false,"testName":false,"cjs":false,"discipline":false,"edge":false} | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-04 | CLOSURE | NEVER-RUN skipped when the introduction date is unknown (introducedAt null, e.g. a shallow checkout) | refuse | ACCEPTED | known-old=fails unknown-age=ok | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-48 | F40 | hand-rolled bearer using concatenation instead of a template | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-05 | CLOSURE | STALE-NEXT: a train token (T99) anywhere in the row exempts it forever | refuse | ACCEPTED | plain=fails with-T99=ok | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-49 | F40 | bare fetch from a .mjs/.js client helper (glob is ts/tsx) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-06 | CLOSURE | STALE-NEXT: row shapes findNextRows does not recognise (indented pipe, emoji prefix, Planned/TODO status) | refuse | ACCEPTED | recognised rows=1 of 5 (1 is the control) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-07 | CLOSURE | WRITER-READER: reader that exists only in a code comment satisfies the table | refuse | ACCEPTED | control(no reader)=fails comment-reader=ok | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-06 | F46 | host split across a concatenation | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-08 | CLOSURE | LANE-CONTRACT: the section marker kept as a quoted line while the section is gutted | refuse | ACCEPTED | ok=true | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-51 | F41 | dead class also mentioned in an unrelated string literal | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-52 | F41 | dead class without the cl- prefix | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-07 | F46 | protocol-relative URL | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-10 | MEMORY | executable code placed under scripts/harness-runs/ and scripts/turns/record-briefs/batches/ (excluded from "code") | refuse | ACCEPTED | ok=true | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-53 | F41 | dead media rule in a .css file | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-11 | MEMORY | changes outside the code prefixes: workflows, package.json, edge functions, skills, next.config | refuse | ACCEPTED | ok=true | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-08 | F46 | second home in a .cjs file | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-54 | F41 | @container rule instead of @media | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-12 | MEMORY | memory requirement met by a session-log.d file with a stale date, any slug, and no content check | refuse | ACCEPTED | ok=true (path shape only; content and date unchecked) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-09 | F46 | host built from an env/base variable plus path | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-13 | MEMORY | end to end in a throwaway git repo: commit a code file under harness-runs, run the CLI on the range | refuse | ACCEPTED | cli exit=0 memory gate OK | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-56 | F42 | same shell with single-quoted values | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-57 | F42 | shell with radius 12 and border line-2 | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-10 | F46 | host in a NOT_EXTERNAL suffix (attacker.vercel.app is treated as not external) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-58 | F42 | forged marker string within 9 lines | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-59 | F42 | shell properties spread over more than 9 lines | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-16 | INVCOV | new invariant whose enforcedBy names an unrelated fitness function (F44) and whose anchor is any string in the skill | refuse | ACCEPTED | ok=true problems=0  | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-60 | F42 | shell as a Tailwind class string | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-17 | INVCOV | new invariant exempted with a one-character reason | refuse | ACCEPTED | ok=true problems=0  | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-18 | INVCOV | new invariant enforced by an audit: token whose script is an empty exit-0 file that only contains the word "governing" | refuse | ACCEPTED | ok=true problems=0  | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-62 | F43 | open state under a name without open/expand words (showDetails) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-13 | F47 | write-only table whose reader is a comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-63 | F43 | state initialised through !! of a prop | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-20 | EXECWIRING | path mentioned in quotes inside a COMMENT of a fitness function source is treated as run by a sentinel | refuse | ACCEPTED | wired=true | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-64 | F43 | Radix-style defaultValue on an Accordion | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-14 | F47 | dead function referenced only in a yml comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-21 | EXECWIRING | a test path that does not exist is "wired" if a comment in discipline.yml names it | refuse | ACCEPTED | wired=true (file does not exist) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-65 | F43 | controlled open={true} | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-22 | EXECWIRING | a *.test.mjs with no assertions is wired by discovery | refuse | ACCEPTED | wired=true (empty file) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-66 | F43 | forged marker string within 5 lines above | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-16 | F48 | bracket access process["loadEnvFile"] | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-67 | F43 | default-open state in a page under src/app (glob is src/components) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-17 | F48 | destructured from process | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-24 | SKILLCONTRACT | same citation with a lowercase marker, in a .cjs file, and in .discipline (outside scan roots/exts) | refuse | ACCEPTED | ok=true [] | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-18 | F48 | imported from node:process | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-69 | F44 | reversed operand order | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-25 | SKILLCONTRACT | slug placed beyond the 800 character window after the marker | refuse | ACCEPTED | ok=true [] | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-19 | F48 | same bare load in a .ts script | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-70 | F44 | string concatenation instead of a template | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-26 | SKILLCONTRACT | a pinned SKILL.md rewritten to one line (the acknowledgment rule was deleted by GATE-3) | refuse | ACCEPTED | ok=true | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-71 | F44 | loose equality and file:/// prefix | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-21 | F49 | 3px rule with single quotes / height "3px" | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-72 | F44 | broken guard in src/ (outside scripts and .discipline) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-28 | WORKTREE-ISOLATION | same commit with the agent env var absent, "0", "false" or empty | refuse | ACCEPTED | {"absent":false,"zero":false,"falseStr":false,"empty":false} | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-22 | F49 | Anton through a variable | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-29 | WORKTREE-ISOLATION | main checkout whose parent path contains a segment named worktrees is classed as a linked worktree | refuse | ACCEPTED | isMainCheckout=false blocked=false | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-02 | F9 | the type-broken file excluded in tsconfig.json | refuse | ACCEPTED | violations=0  | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-23 | F49 | same literals in layout.tsx (only page.tsx is scanned) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-30 | WORKTREE-ISOLATION | branching git commands in forms isBranchingGitCommand does not match | refuse | ACCEPTED | control matched=true; not matched: G=git; $G checkout main / git reset --hard origin/master / git restore --source=origin/master . / git cherry-pick abc / git update-ref refs/heads/x HEAD / git symbol | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-03 | F9 | the type-broken file carries // @ts-nocheck | refuse | ACCEPTED | violations=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-24 | F49 | card border as template literal with radius 12 | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-25 | F50 | forged firing: the hop real artifacts and evidence entry removed, then a hand-written artifact {trigger: workflow_run} added | refuse | ACCEPTED | violations naming the hop: control(no firing)=1; with hand-written artifact=0 (all violations: 0) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-32 | C3 | placeholder subject line plus a regenerated inventory (content quality is unchecked) | refuse | ACCEPTED | drifts=0  | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-26 | F50 | forged firing: evidence JSON entry for a run id that never existed | refuse | ACCEPTED | violations naming the hop: control=1; with forged evidence entry=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-05 | F28 | invalid artifact one directory deeper (scanArtifacts only reads <family>/<file>) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-33 | C3 | migration claiming APPLIED in its subject while no ledger row exists (the check never reads the ledger) | refuse | ACCEPTED | drifts=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-27 | F50 | edge faked: real on.workflow_run removed from the consumer, a run: heredoc carries a fake workflow_run: block | refuse | ACCEPTED | violations naming the hop sweep-to-fetch-drain: 0 (all: 0) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-06 | F28 | a governing file of the mint family edited with no run and no marker | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-29 | F51 | stored measurement under a name not ending _CEILING / as an object property | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-30 | F51 | hand-written import alias in the fitness manifest with a non-F alias | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-08 | F33 | dashboard replaced by an exemption with junk reason, ruled_by and date | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-31 | F51 | invariant ids differing only by case (INV and inv) are treated as distinct | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-09 | F33 | rendering_spec pointed at any existing file (package.json): existence only is checked | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-10 | F33 | route reaches the data path only through a comment import | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-32 | F51 | check 4 on a branch not named lane/ (coordinator-only file changed) | refuse | ACCEPTED | {"lane/zz":"REFUSED","claude/zz":"ACCEPTED","detached":"ACCEPTED"} | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-11 | F33 | a new customer surface route with no register entry (SPEC_SURFACES is a fixed list) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-12 | F35 | a new row component not listed in ROW_COMPONENTS (opt-in registry) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-35 | C4 | the same unlisted worktree with CI=1 set (the check returns before looking) | refuse | ACCEPTED | drifts=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-35 | F52 | same defect with a flow-style env mapping | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-14 | F35 | same, with the attribute name kept in a comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-37 | F52 | composite action saved as action.yaml (GitHub reads it; F52 lists only action.yml) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-15 | F35 | registered component whose only smoke-spec mount is the import path inside a comment | refuse | ACCEPTED | mounting specs rewritten=1; refused=false | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-16b | F68 | upload-artifact as the first key of the step item (- uses: ...), retention-days 90 | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-17 | F68 | upload-artifact with no retention-days at all (platform default applies) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-40 | F59 | path assembled from pieces (join(root, "fsi-app", "node_" + "modules")) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-18 | F68 | retention-days quoted or expression-valued | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-41 | F59 | relative ./node_modules/.bin path | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-19 | F68 | quoted action reference and scratch path split across lines | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-42 | F59 | literal path in a .cjs or .ts under scripts | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B8-20 | F68 | upload-artifact used from a composite action file (only .github/workflows is scanned) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-44 | F61 | guard script and output names appear only in YAML comments | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B9-02 | INVCOV | same sentence with any citation token on the line (ADR-001) | refuse | ACCEPTED | violations=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-45 | F61 | apply spelled --mode apply (no quotes, no =) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B9-03 | INVCOV | same sentence split across two lines | refuse | ACCEPTED | violations=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-38 | C5 | anchor substring kept only in a trailing comment while the anchored identifier is gone from the code | refuse | ACCEPTED | drifts=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-46 | F61 | workflow_run trigger written in flow style | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B9-04 | INVCOV | a human gate worded outside GATE_RE (needs a person to sign it off; Jason ratifies each batch first) | refuse | ACCEPTED | violations=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-39 | C5 | ACTIVE_PHASE set to none while the anchored identifier is gone | refuse | ACCEPTED | drifts=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B9-05 | INVCOV | the control sentence in a doctrine-bearing file that is not in DOCTRINE_FILES (docs/dispatches/lane-common-contract.md) | refuse | ACCEPTED | scanned files=9 docs/* entries=0 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-48 | F64 | create unlogged table | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-49 | F64 | quoted schema "public"."zz_t" | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-50 | F64 | create table as select | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-51 | F64 | RLS enable present only in a comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-53 | F64 | same policy with the word org_id in a comment inside the statement | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-54 | F64 | same policy with role::text = and role = any(array[]) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-56 | F65 | bracket directory with .test.ts suffix (regex is .mjs only) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-57 | F65 | glob metacharacters other than brackets ({a,b} directory) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-58 | F65 | bracket in the filename with .spec.mjs suffix | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-60 | F66 | expected string built on the line above the assert | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-62 | F66 | performance.now()/Date constructed from a string-keyed lookup | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-64 | F67 | void main() prefix | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-65 | F67 | entry named run() instead of main() | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-66 | F67 | inverted guard: main() inside if (isMainModule(...) === false) { } | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-67 | F67 | main invoked through an IIFE wrapper | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-69 | F69 | model family outside haiku/sonnet/opus (claude-fable-5) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-70 | F69 | id split across a concatenation | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-71 | F69 | provider-prefixed id (anthropic.claude-...) | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-72 | F69 | literal in src/workflows (not in glob) | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-74 | F70 | "--" inside a string literal truncates the header line before SECURITY DEFINER | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-75 | F70 | REVOKE and search_path text only inside a block comment | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-76 | F70 | search_path with pg_temp FIRST (the unsafe order) and a revoke | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-77 | F70 | revoke written for a different overload of the same name | refuse | ACCEPTED | file scanned, 0 violations | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-78 | F70 | migration numbered 000 (below 371, out of scope by number) carrying a definer | refuse | ACCEPTED | file not enumerated by the gate (outside its glob or filter) | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-15b | INVCOV | an invariant file that no doctrine names deleted outright (silent removal, second attempt) | refuse | ACCEPTED | deleted AC-1-section-construction.mjs; ok=true problems=0  invariants=152 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |

## Refused attacks

| attack | gate | form | expected | observed | evidence | status |
|---|---|---|---|---|---|---|
| B1-05 | F2 | comment opener inside a string then gate name inside a block comment | refuse | REFUSED | refused: Admin API route does not call isPlatformAdmin or requireAdminRoute. Add the shared guard (src/lib/ap | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B1-34 | F16 | region host not matching chrome/production-* (eu.browserless.io) | refuse | REFUSED | refused: Raw Browserless content fetch outside the single canonical primitive (fsi-app/src/lib/sources/canoni | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B3-03 | F6 | far-ahead number jump with the F6 override added to the first line of the lowest migration | refuse | REFUSED | refused: Migration sequence has 658 numbering gaps between 001 and 999. Gaps are tolerated but may indicate d | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B5-42 | F39 | head slice followed by concat (slice must be the tail) | refuse | REFUSED | refused: .in("id", ids.slice(0, 500).concat(more)) â€” the second argument is a runtime value with no cap vis | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-15 | INVCOV | an invariant file deleted outright (silent removal) | refuse | REFUSED | ok=false problems=1 UNKNOWN INVARIANT: doctrine no-inference-as-fact-on-regulatory-content â†’ EP-1-integrity is not a registered invariant id. invariants=152 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-12 | F47 | unreferenced table "referenced" only by a code comment | refuse | REFUSED | refused: REGRESSION: 1 unreferenced table(s), ceiling 0: zz_unref. Wire a reader or drop the table with a mig | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-34 | F52 | same defect with 4-space indentation | refuse | REFUSED | refused: .github/workflows/zz.yml:1: F52a a workflow file's 'jobs:' block defines no job. | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-36 | F52 | needs: names a job that does not exist (flow list form) | refuse | REFUSED | refused: .github/workflows/zz.yml:6: F52d job 'a' needs 'ghost', which is not a job in this file. | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-38 | F52 | tab-indented workflow body | refuse | REFUSED | refused: .github/workflows/zz.yml:1: F52a a workflow file's 'jobs:' block defines no job. | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-36 | C4 | unlisted worktree placed under a .claude/worktrees path (ephemeral by convention, never inventoried) | refuse | REFUSED | drifts=1 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B7-36b | C4 | unlisted worktree whose directory basename is dotfiles (historical-form match) | refuse | REFUSED | drifts=1 | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |
| B6-61 | F66 | indented it( block instead of a column-0 test( | refuse | REFUSED | refused: this assertion is in the same test() block as a live clock read (new Date()/Date.now() with no pinne | [CONFIRMED: real gate code run on a fixture in a throwaway git repo] |

## Attacks that did not execute

None.

## Controls (the author-listed form, proving the harness)

| attack | gate | form | expected | observed | evidence | status |
|---|---|---|---|---|---|---|
| B1-00 | F2 | CONTROL: ungated admin route.ts | refuse (control) | REFUSED | refused: Admin API route does not call isPlatformAdmin or requireAdminRoute. Add the shared guard (src/lib/ap | [CONFIRMED: control, real gate code run on a fixture] |
| B1-06 | F8 | CONTROL: body.tier assignment in component | refuse (control) | REFUSED | refused: Client-side assignment to body.tier. Client must not write tier-shaped fields; tier handling is serv | [CONFIRMED: control, real gate code run on a fixture] |
| B1-12 | F13 | CONTROL: direct insert into intelligence_items | refuse (control) | REFUSED | refused: INSERT into intelligence_items outside the mint chokepoint. Route this mint through mintIntelligence | [CONFIRMED: control, real gate code run on a fixture] |
| B1-22 | F15 | CONTROL: direct api.anthropic.com literal | refuse (control) | REFUSED | refused: Direct Anthropic API call outside the spend chokepoint. Route it through spendStream/spendSearch (sr | [CONFIRMED: control, real gate code run on a fixture] |
| B1-32 | F16 | CONTROL: raw browserless host literal | refuse (control) | REFUSED | refused: Raw Browserless content fetch outside the single canonical primitive (fsi-app/src/lib/sources/canoni | [CONFIRMED: control, real gate code run on a fixture] |
| B2-00 | F18 | CONTROL: bare scheme strip regex | refuse (control) | REFUSED | refused: Ad-hoc URL-identity normalizer (bare scheme-strip or whole query/fragment drop). Route URL identity  | [CONFIRMED: control, real gate code run on a fixture] |
| B2-09 | F19 | CONTROL: SERVICE_ROLE // ANON | refuse (control) | REFUSED | refused: Silent serviceâ†’anon key downgrade (SUPABASE_SERVICE_ROLE_KEY // â€¦ANON_KEY). A service-role clien | [CONFIRMED: control, real gate code run on a fixture] |
| B2-17 | F20 | CONTROL: direct .update({scrape_cadence}) | refuse (control) | REFUSED | refused: Direct write to a pause stop-flag (global_processing_paused / scrape_cadence / judgement_drain; the  | [CONFIRMED: control, real gate code run on a fixture] |
| B2-25 | F21 | CONTROL: direct generateBrief( call | refuse (control) | REFUSED | refused: Direct grounding-entry invocation outside the single pipeline (fsi-app/src/lib/agent/canonical-pipel | [CONFIRMED: control, real gate code run on a fixture] |
| B2-32 | F22 | CONTROL: sources insert without classifySourceRole | refuse (control) | REFUSED | refused: INSERT/UPSERT into sources without classifying source_role at birth. Set `source_role: <explicit> ?? | [CONFIRMED: control, real gate code run on a fixture] |
| B3-01 | F6 | CONTROL: two new migrations with the same number | refuse (control) | REFUSED | refused: Duplicate migration number 399: "399_dup_a_tbl.sql" and "399_dup_b_tbl.sql". Resolve by renumbering  | [CONFIRMED: control, real gate code run on a fixture] |
| B3-05 | F10 | CONTROL: syndication math broken in source-growth.ts (collapse removed) | refuse (control) | REFUSED | refused: Source-credibility syndication-collapse math FAILED (exit 1).     raw citation edges: 5     BEFORE ( | [CONFIRMED: control, real gate code run on a fixture] |
| B3-09 | F11 | selftest left intact but trust.ts tier weights changed to non-decreasing (control) | refuse (control) | REFUSED | refused: Source-credibility tier-weight / decay math FAILED (exit 1).         ^     AssertionError [ERR_ASSER | [CONFIRMED: control, real gate code run on a fixture] |
| B3-11 | F12 | CONTROL: ?? effective_tier fallback reintroduced in tierOfSource | refuse (control) | REFUSED | refused: MOAT BREACH, reg-fact resolver is NOT base_tier-only (exit 1).     == reg-fact resolver is base_tier | [CONFIRMED: control, real gate code run on a fixture] |
| B3-14 | F14 | CONTROL: table created and written, never read | refuse (control) | REFUSED | refused: WRITE-ORPHAN (half-slice): table "zz_orphan" is written by app code but read by nothing â€” writer f | [CONFIRMED: control, real gate code run on a fixture] |
| B4-01 | F23 | CONTROL: new writer with no governing skill | refuse (control) | REFUSED | refused: REGRESSION â€” UNMAPPED WRITES (creates or mutates data with no governing skill): 1, ceiling 0 (+1). | [CONFIRMED: control, real gate code run on a fixture] |
| B4-08 | F24 | CONTROL: live table in the snapshot with no migration | refuse (control) | REFUSED | refused: OUT-OF-REPO DDL â€” "zz_ghost" exists in the database and no committed migration creates it. Write t | [CONFIRMED: control, real gate code run on a fixture] |
| B4-12 | F25 | CONTROL: dead module with no importer | refuse (control) | REFUSED | refused: UNWIRED MODULE â€” "fsi-app/src/lib/zz/dead.ts" has no production importer. Wire it into the flow th | [CONFIRMED: control, real gate code run on a fixture] |
| B4-21 | F27 | CONTROL: producer with two seams and no composition proof | refuse (control) | REFUSED | refused: NO COMPOSITION PROOF â€” "fsi-app/scripts/producers/zz-prod.mjs" imports 2 first-party seam(s) and n | [CONFIRMED: control, real gate code run on a fixture] |
| B5-01 | F30 | CONTROL: new .eq("source_url") site | refuse (control) | REFUSED | refused: REGRESSION â€” "source_url_eq": 3 text-keyed site(s), baseline 2 (+1). A new site was added using th | [CONFIRMED: control, real gate code run on a fixture] |
| B5-07 | F31 | CONTROL: raw derived_values read outside propagation | refuse (control) | REFUSED | refused: Direct read of derived_values outside src/lib/propagation/ â€” spec Âsec 3.3's pollution barrier. Read  | [CONFIRMED: control, real gate code run on a fixture] |
| B5-14 | F32 | CONTROL: trigger definition deleted from 286 | refuse (control) | REFUSED | refused: statutory_purity_trg trigger definition is missing from migration 286. | [CONFIRMED: control, real gate code run on a fixture] |
| B5-17 | F34 | CONTROL: module-scope readFileSync | refuse (control) | REFUSED | refused: readFileSync() at module scope: runs on import on every page that imports this module and the server | [CONFIRMED: control, real gate code run on a fixture] |
| B5-25 | F36 | CONTROL: toLocaleDateString without timeZone in a client component | refuse (control) | REFUSED | refused: toLocaleDateString() with no timeZone in a "use client" component: the server (UTC) and client hydra | [CONFIRMED: control, real gate code run on a fixture] |
| B5-31 | F38 | CONTROL: .limit(5000) | refuse (control) | REFUSED | refused: .limit(5000) = 5000 rows is ABOVE PostgREST's 1000-row db-max-rows ceiling â€” a request for 5000 si | [CONFIRMED: control, real gate code run on a fixture] |
| B5-38 | F39 | CONTROL: .in("id", ids) with a runtime list | refuse (control) | REFUSED | refused: .in("id", ids) â€” the second argument is a runtime value with no cap visible at this call site (the | [CONFIRMED: control, real gate code run on a fixture] |
| B6-01 | F45 | CONTROL: exact 12-line copy added twice | refuse (control) | REFUSED | dup lines base 0 head 36 | [CONFIRMED: control, real gate code run on a fixture] |
| B7-01 | CLOSURE | CONTROL: a workflow in block-form on: with workflow_dispatch: is dispatchable | refuse (control) | REFUSED | dispatchable=true | [CONFIRMED: control, real gate code run on a fixture] |
| B5-45 | F40 | CONTROL: bare fetch of a requireAuth route | refuse (control) | REFUSED | refused: fetch("/api/ask") calls /api/ask, which is guarded by requireAuth, without the shared authenticated  | [CONFIRMED: control, real gate code run on a fixture] |
| B6-05 | F46 | CONTROL: second home for a homed host (eur-lex.europa.eu) | refuse (control) | REFUSED | refused: SECOND HOME for eur-lex.europa.eu: its home is fsi-app/src/lib/sources/identifier-variants.mjs; also | [CONFIRMED: control, real gate code run on a fixture] |
| B5-50 | F41 | CONTROL: media rule names a cl- class nothing carries | refuse (control) | REFUSED | refused: @media rule targets .cl-deadthing, which no element in this file carries. A media query naming a cla | [CONFIRMED: control, real gate code run on a fixture] |
| B7-09 | MEMORY | CONTROL: code change with no memory file | refuse (control) | REFUSED | ok=false | [CONFIRMED: control, real gate code run on a fixture] |
| B5-55 | F42 | CONTROL: hand-built card shell in double-quoted style object | refuse (control) | REFUSED | refused: Card shell assembled by hand (card background + card border + card radius in one style object). The  | [CONFIRMED: control, real gate code run on a fixture] |
| B6-11 | F47 | CONTROL: table nothing references | refuse (control) | REFUSED | refused: REGRESSION: 1 unreferenced table(s), ceiling 0: zz_unref. Wire a reader or drop the table with a mig | [CONFIRMED: control, real gate code run on a fixture] |
| B5-61 | F43 | CONTROL: isOpen starts true | refuse (control) | REFUSED | refused: Disclosure starts OPEN: `isOpen` starts `true`. Operator ruling 2026-09-08, "no items expanded when  | [CONFIRMED: control, real gate code run on a fixture] |
| B7-19 | EXECWIRING | CONTROL: a tracked verifier nothing runs | refuse (control) | REFUSED | wired=false | [CONFIRMED: control, real gate code run on a fixture] |
| B6-15 | F48 | CONTROL: bare process.loadEnvFile( | refuse (control) | REFUSED | refused: bare process.loadEnvFile: the one home for the env-file load is fsi-app/scripts/lib/env-file.mjs. Im | [CONFIRMED: control, real gate code run on a fixture] |
| B7-23 | SKILLCONTRACT | CONTROL: unregistered skill cited by a src file | refuse (control) | REFUSED | ok=false ["citation-unregistered"] | [CONFIRMED: control, real gate code run on a fixture] |
| B5-68 | F44 | CONTROL: the broken guard | refuse (control) | REFUSED | refused: broken CLI main guard: import.meta.url compared against a hand-built `file://` + process.argv[1] str | [CONFIRMED: control, real gate code run on a fixture] |
| B6-20 | F49 | CONTROL: Anton title literal in a page | refuse (control) | REFUSED | refused: Literal part style in a page.tsx: an Anton title (fontFamily naming Anton or var(--font-display)). P | [CONFIRMED: control, real gate code run on a fixture] |
| B7-27 | WORKTREE-ISOLATION | CONTROL: agent env in the main checkout commits on lane/x | refuse (control) | REFUSED | blocked=true | [CONFIRMED: control, real gate code run on a fixture] |
| B8-01 | F9 | CONTROL: fixture project with a type error | refuse (control) | REFUSED | violations=>=1  | [CONFIRMED: control, real gate code run on a fixture] |
| B7-31 | C3 | CONTROL: new migration with no subject line | refuse (control) | REFUSED | drifts=1 | [CONFIRMED: control, real gate code run on a fixture] |
| B8-04 | F28 | CONTROL: invalid artifact at family level | refuse (control) | REFUSED | refused: INVALID ARTIFACT - fsi-app/scripts/harness-runs/mint/mint-run-998.json does not validate against CON | [CONFIRMED: control, real gate code run on a fixture] |
| B6-28 | F51 | CONTROL: nonzero stored ceiling in a function file | refuse (control) | REFUSED | refused: fsi-app/.discipline/fitness/functions/F97-zz.mjs:1: REGRESSION: a nonzero stored ceiling "FOO_CEILIN | [CONFIRMED: control, real gate code run on a fixture] |
| B8-07 | F33 | CONTROL: dashboard rendering_spec pointing at a missing file | refuse (control) | REFUSED | refused: MISSING FILE â€” "dashboard" (Dashboard (home)) rendering_spec "fsi-app/.discipline/rendering/smoke/ | [CONFIRMED: control, real gate code run on a fixture] |
| B7-34 | C4 | CONTROL: an unlisted git worktree inside the repository path | refuse (control) | REFUSED | drifts=2 | [CONFIRMED: control, real gate code run on a fixture] |
| B6-33 | F52 | CONTROL: job-level env uses runner.temp (2-space indent) | refuse (control) | REFUSED | refused: .github/workflows/zz.yml:7: F52b job-level env.T references 'runner.', which does not exist at job-l | [CONFIRMED: control, real gate code run on a fixture] |
| B8-13 | F35 | CONTROL: registered ledger loses its data-guard-title attribute | refuse (control) | REFUSED | refused: src/components/operations/OperationsLedger.tsx carries no data-guard-title attribute and mounts no t | [CONFIRMED: control, real gate code run on a fixture] |
| B8-16 | F68 | CONTROL: upload-artifact with retention-days 30 | refuse (control) | REFUSED | refused: .github/workflows/zz.yml:12: F68 retention-days: 30 exceeds the 7-day Actions-storage budget (docs/r | [CONFIRMED: control, real gate code run on a fixture] |
| B6-39 | F59 | CONTROL: literal fsi-app/node_modules path | refuse (control) | REFUSED | refused: a literal fsi-app/node_modules path: resolve the dependency with resolveAppDep()/tryResolveAppDep()  | [CONFIRMED: control, real gate code run on a fixture] |
| B6-43 | F61 | CONTROL: workflow_run workflow with an apply literal and no guard | refuse (control) | REFUSED | refused: .github/workflows/zz.yml: has a workflow_run or master batch-push trigger and can set a mode to "app | [CONFIRMED: control, real gate code run on a fixture] |
| B9-01 | INVCOV | CONTROL: a human-review gate sentence in a doctrine file | refuse (control) | REFUSED | violations=1 | [CONFIRMED: control, real gate code run on a fixture] |
| B7-37 | C5 | CONTROL: the phase-2 anchor substring (hostInstitution) removed from the anchored file | refuse (control) | REFUSED | drifts=1 | [CONFIRMED: control, real gate code run on a fixture] |
| B6-47 | F64 | CONTROL: create table with no RLS enable anywhere | refuse (control) | REFUSED | refused: CREATE TABLE "zz_t" has no matching ALTER TABLE ... ENABLE ROW LEVEL SECURITY anywhere in the migrat | [CONFIRMED: control, real gate code run on a fixture] |
| B6-52 | F64 | CONTROL: global admin policy via org_memberships role check | refuse (control) | REFUSED | refused: CREATE POLICY "zz_pol" reads org_memberships for a role check (owner/admin/moderator) with no org_id | [CONFIRMED: control, real gate code run on a fixture] |
| B6-55 | F65 | CONTROL: bracket directory test .test.mjs tracked | refuse (control) | REFUSED | refused: fsi-app/src/app/api/[id]/x.test.mjs: tracked test path contains a "[" or "]" character -- Node's tes | [CONFIRMED: control, real gate code run on a fixture] |
| B6-59 | F66 | CONTROL: new Date() plus assert.equal against a template on one line | refuse (control) | REFUSED | refused: this assertion is in the same test() block as a live clock read (new Date()/Date.now() with no pinne | [CONFIRMED: control, real gate code run on a fixture] |
| B6-63 | F67 | CONTROL: unguarded main() | refuse (control) | REFUSED | refused: unguarded main() invocation: this call runs unconditionally at module scope with no isMainModule gua | [CONFIRMED: control, real gate code run on a fixture] |
| B6-68 | F69 | CONTROL: model id literal | refuse (control) | REFUSED | refused: Hardcoded Anthropic model-id literal outside the shared home. Import HAIKU_MODEL / SONNET_MODEL from | [CONFIRMED: control, real gate code run on a fixture] |
| B6-73 | F70 | CONTROL: SECURITY DEFINER function with no revoke and no search_path | refuse (control) | REFUSED | refused: fsi-app/supabase/migrations/999_zz_def.sql: F70 definer-hygiene: function public.zz_def is SECURITY  | [CONFIRMED: control, real gate code run on a fixture] |

## Facts found while attacking (each with its status)

- [CONFIRMED: read governance/skill-contract-map.mjs header and RD-76 residual] The skill-acks mechanism was deleted by GATE-3 (2026-10-08). `docs/dispatches/lane-common-contract.md` line 109 still instructs lanes to add a `skill-acks/<date>-<lane>.md` file, and the brief for this lane lists skill-acks as a gate. Only the registration half of skill-contract-map remains (rows B7-23 to B7-26).
- [CONFIRMED: runner --list and git log --diff-filter=D] The fitness runner lists 52 functions, not the 60 of register B. GATE-3 (#1002) deleted F17, F26, F37, F54, F57, F58, F60, F62, F63; F70 is new.
- [CONFIRMED: baseline run B7-14, ok=true] invariant-coverage passes on the clean tree; its problem list is empty, so every ACCEPTED row in that gate is a pass the gate gave on a changed tree.
- [CONFIRMED: B6-32] F51 check 4 (a lane branch touching a coordinator-only file) fires only when `git rev-parse --abbrev-ref HEAD` starts with `lane/`; a branch named claude/zz and a detached HEAD both pass. [HYPOTHESIS] The CI pull_request checkout is detached, which would make check 4 inert in CI; the checkout step in discipline.yml was read, the event shape was not run.
- [CONFIRMED: B7-35] consistency C4 returns before looking when the CI environment variable is set; GitHub Actions sets CI itself on every runner (platform behaviour, not read from this repository) [HYPOTHESIS for the consistency job].
- [CONFIRMED: B6-25, B6-26, B6-27] F50 accepts a hand-written harness artifact, a hand-written entry in loop-fired-evidence.json, and a workflow_run edge faked inside a run: heredoc. Loop-hop firing claims rest on files an author can write; AUD-AT-5 owns the hop-level legs.
- [CONFIRMED: B7-15 refused, B7-15b accepted] Deleting an invariant file is caught only when a doctrine names it; deleting one that no doctrine names passed invariant-coverage.
- [CONFIRMED: B8-16 refused, B8-16b] F68 reads `uses: actions/upload-artifact@` only at line start; the common `- uses:` first-key step form is not read (see B8-16b).

## Owed legs (reason)

- F9 on the real app project: the fixture project (two files) proved the tsconfig exclude and ts-nocheck forms; a full tsc over the 3,500-file app needs the full dependency install and was not run.
- F45 live ratchet: the detector, ratchet comparison and scope predicates were run in process; `measureAtBase` against a real origin/master base was not run (no remote in the throwaway repo).
- F24 and the live-only DDL class: the gate reads a committed snapshot of the database; an object that exists live and is absent from the snapshot cannot be represented offline. Owed to a live-catalog leg (no live access in this lane).
- F28 time-based legs (STALE RUN, NEVER RUN windows) were not exercised with dated ledger rows; only schema, nesting and governing-file edits were. [CONFIRMED: owed, not exercised by this lane]
- CLOSURE NEVER-RUN with real git history dates (`introducedAt` from `git log`) was exercised through the exported pure functions, not end to end. [CONFIRMED: owed, not exercised by this lane]
- Overlap between gates (whether another gate catches an input one gate accepted) was not measured; ACCEPTED means this gate alone did not block.

## Read and reused

Read: CLAUDE.md, docs/dispatches/lane-common-contract.md, docs/runbooks/audit-catalogue.md (sections 1, 2, 3e), fsi-app/scripts/tmp/gate-evaluation-B-fitness-governance-2026-10-08.md, ADR-046 (opening), the source of every fitness function and governance gate listed above, fitness/runner.mjs, fitness/lib, lib/context.mjs, lib/change-range.mjs, governance loop-manifest excerpts. Reused: the real gate modules and their own exported functions (no second copy of any rule), the repo's DISCIPLINE_REPO_ROOT seam, `git archive` of origin/master as the fixture tree. Built nothing in the repo.

Matrix cells to enter: row 4 (fitness functions) x ATTACKED and row 5 (governance gates) x ATTACKED, both `2026-10-08 AT4` (filled, with the owed legs above), closing O-005 and O-006.
