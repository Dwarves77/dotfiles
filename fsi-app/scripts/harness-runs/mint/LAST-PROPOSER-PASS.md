# Last proposer pass — mint

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `mint` now has **two** artifacts (`mint-run-001.json`,
`mint-run-002.json`) — F28's rule (d) requires this file once a family reaches ≥2 artifacts, and it names
the latest one below.

**Artifacts read:** mint-run-001, mint-run-002.

**Full traces read:** `BATCH-001-REPORT.md`, `BATCH-001-REPORT-v2.md`, `transport-proof-raw.json`,
`queue-10.json`, `payload-32006R1692.json`, `payload-32009L0123.json`, `payload-32015R0757.json`,
`payload-32019R1242.json`, `payload-32023R0956.json`, `payload-32023R1804.json`,
`source-32006R1692.txt`, `source-32009L0123.txt`, `source-32015R0757.txt`, `source-32019R1242.txt`,
`source-32023R0956.txt`, `source-32023R1804.txt` (all under `/root/work/mint/batch-001/`, every path in
`mint-run-001.json`'s `full_trace_refs`), plus `MINT-RUNBOOK.md`, `validate-mint-payload.mjs` (in full,
including its header's KNOWN SIMPLIFICATIONS block), `payload-schema.json`, and
`validate-mint-payload.test.mjs`, per Wave MH-3's dispatch.

**Hypotheses (verified against the traces, not taken on the artifact's word):**
1. `defects_found[0]` (capture-completeness) checks out: `payload-32019R1242.json`'s own `search_results[0]`
   holds a 2,621-char `result_content`, while `BATCH-001-REPORT-v2.md` §3's fetch table records
   `window.__docs['32019R1242'].length` at 102,988 — a directly-verifiable 39x gap, confirmed for all six
   payloads (`result_content.length` values 2,195-12,082 against recorded fetches 12,237-178,953). The
   defect's `root_cause` (`javascript_tool`'s ~1.0-1.5K-char truncation defeating the runbook's suggested
   20,000-char slice) is corroborated by `BATCH-001-REPORT-v2.md` §1's own "Tool-output truncation finding."
2. `defects_found[1]`/`[2]` (the × → x and curly-quote transcription bugs) check out against the ACTUAL
   payload/source pair: `payload-32019R1242.json`'s `claims[]` for `jurisdictional_scope`/`penalty_summary`
   and `source-32019R1242.txt`'s Article 8/Article 2 text both now carry the real `×` (the bug was already
   corrected in-session per `mint-run-001.json`'s own `proposer_notes` before the batch report went green) —
   confirming the *fixed* state, and that the bug, while it existed, was undetectable by criterion 3 alone
   because BOTH of a payload's own fields (`source_span` and `result_content`) carried the identical error.
   A red test built against this exact hypothesis, with `validate-mint-payload.mjs`'s archive cross-check
   DISABLED, reproduces the historical gap directly (`validate-mint-payload.test.mjs`, "criterion 3 alone
   should NOT catch a corruption shared by both payload fields").
3. `defects_found[0]`'s root_cause also names the missing law: the 8KB-slice workaround
   `BATCH-001-REPORT-v2.md` improvised in-session existed only as lane-report prose, never codified in
   `MINT-RUNBOOK.md` — confirmed by reading the pre-MH-3 runbook in full: it named none of
   `fetched_length`, slice bounds, head/tail verification, or archive-before-authoring.
4. No new defect beyond what `mint-run-001.json` already named — this pass implements exactly the three
   proposals the prior `LAST-PROPOSER-PASS.md` scoped, without inventing new scope.

**Proposal implemented (Wave MH-3, this run):**
- (a) **Capture-completeness gate** — `search_results[].fetched_length` is now a required schema field
  (`payload-schema.json`); `validate-mint-payload.mjs` fails any `result_content` whose length diverges
  from it beyond a 50-char tolerance, or whose capture ratio falls under a 0.98 floor
  (`capture_incomplete` / `capture_length_mismatch` / `capture_length_exceeds_fetched` /
  `missing_fetched_length`).
- (b) **Unicode-integrity check** — NFKC + known-substitution-class (×, curly quotes, en/em dash, NBSP)
  comparison of every FACT `source_span` against an independently archived source
  (`search_results[].archived_source_path`, new optional schema field), plus a separate scan of authored
  prose (`full_brief`/`sections[].content_md`) for the same substitution classes. Six new failure reasons;
  falls back to a weaker `result_content`-only comparison when no archive is named (documented as a known
  simplification, matching this file's existing header-comment convention).
- (c) **`MINT-RUNBOOK.md` §1a, the ≤8,000-char slice-and-rebuild procedure, codified as law** — measure
  `fetched_length` first, slice at ≤8,000 chars, verify length + head/tail per slice, rebuild by script
  from empty, archive the rebuilt text BEFORE authoring any claim, then author claims from the archive —
  removing the possibility that `result_content` and a claim's `source_span` are typed by the same hand
  from the same reading of the page (the mechanism (b)'s check now depends on).
- **Retrofit**: batch-001's six payloads got ONLY `fetched_length` added (no `result_content` change) —
  the hardened validator now rejects all six for capture-incompleteness (`HARDENED-VALIDATOR-REJECTIONS-mh3.md`),
  proving the defect class is structurally closed. Re-fetching them to actually PASS is explicitly deferred
  ("M2 full-text rebuild," build plan §4) — not this wave's scope.
- `mint-run-001.json`'s `defects_found[0]` and `[2]` `fix_ref` fields were updated in place to point at
  this landing (their `description`/`root_cause` were left untouched — only the "is this fixed yet" pointer
  changed, which is the field's documented purpose).

**Family gates status:** GREEN — `node --test scripts/mint/validate-mint-payload.test.mjs` (33/33, 21
pre-existing + 12 new), `sh .discipline/run-test-suite.sh`, `npx tsc --noEmit`, and
`node .discipline/fitness/runner.mjs` (23 functions incl. F28, 0 violations) all pass under this wave's
diff — see the Wave MH-3 lane report for full gate tails.
