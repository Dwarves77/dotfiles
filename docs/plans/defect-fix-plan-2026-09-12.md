# Defect fix plan, 2026-09-12 (W9 brief chain, Part 6 and Part 7)

Author: the coordinator (Fable). Operator ruling that produced this document, verbatim: "we need to pause so that you can build a plan to fix the defects, i dont want sonnet and haiku building the fixes on their own" and "a plan needs to be built to fix this by fable". Implementers execute the specifications below as written; a deviation is a report back, never a substitution.

Related: [brief-chain build plan](brief-chain-build-plan-2026-09-11.md), [ADR-030](../decisions/ADR-030-resolve-not-quarantine-and-every-item-dated.md), [lane common contract](../dispatches/lane-common-contract.md), [maintenance runbook](../runbooks/MAINTENANCE-RUNBOOK.md).

## 1. What this plan covers

The defects found on 2026-09-12 between the pause (RESUME STATE 3 in the W9 ledger) and this ruling. Every finding carries its status token per standing rule 14. Each defect gets: root cause, the fix at the source, the class fix that stops the family, the proof, and the lane that builds it. Nothing in this plan is dispatched until the operator says go.

State when the pause was called: #647 (6.2b) and #648 (7.4e) merged; the UK series-code reconcile applied (19 rows, read-back confirmed); 7.2 reviewed PASS and being pushed; 7.8 built and under review; 6.2c batch 002 committed (9 of 10); batch 001 lane writing; 7.5 stopped mid fix with one uncommitted edit in wt-brieffields-0911; 6.2d briefed, branch created, never dispatched.

## 2. The defects

### D1. The brief export cannot export a quarantined item, even by id [CONFIRMED]

Evidence: brief-export run 34717714753 asked for 20 ids and delivered 19; `export-corpus-for-extraction.mjs` (item scope, about line 332 to 343) ANDs `--ids` with `provenance_status = 'verified'`. Item 00a8c0d9 is quarantined, so the lane that exists to write the brief that re-grounds it never saw it.

Root cause: the `--ids` contract was written for the turn-request path (verified items only) and reused for brief export without revisiting the filter. The comment at that line already calls the filter a ticket.

Fix at the source (task 6.2d, `fsi-app/scripts/turns/export-corpus-for-extraction.mjs`):
- When `--ids` is given: select exactly those ids with `is_archived = false` and `provenance_status in ('verified', 'quarantined')`. The auto-selection paths (`--since`, the hollow and record selections of brief-export.yml) keep verified only.
- Each exported item carries `provenance_status`.
- Ids requested but not exported are listed in the summary object as `not_exported: [{ id, reason }]` with reason `archived` or `not_found`, and the workflow log line prints their count next to the last selected id.
- Tests (dependency injected, no database): a quarantined id named in `--ids` is exported; an archived id is refused with the reason listed; the auto-selection path still excludes quarantined items; the summary carries `not_exported`.
- `brief-export.yml`: the `ids` input description states that quarantined items are included when named. `record-briefs/README.md`: one paragraph, a quarantined export is written like any other and the apply with `allow_brief_overwrite` re-grounds it.

Class fix: the resolution path must reach every non-archived item. The test above is the guard; no further mechanism.

### D2. The provisional-source terminal status `promoted` is rejected by the live CHECK constraint [CONFIRMED]

Evidence (coordinator, live SQL): `provisional_sources_status_check` allows only `pending_review`, `confirmed`, `rejected`, `needs_more_data`. `src/app/api/admin/sources/promote/route.ts` writes `status: "promoted"` at two sites (lines 125 and 200 on master). Live counts: 489 pending_review, 6 confirmed, 2 needs_more_data, 0 promoted, 0 rows with `promoted_to_source_id`, last review 2026-05-06. The route's terminal write has never succeeded against this constraint. [HYPOTHESIS] the route inserts the `sources` row before the failing update, so an admin promote attempt may have left orphan `sources` rows; the fix lane counts them (`sources` rows whose registration note names a provisional id, or created by the route's actor, with no provisional row pointing at them) and reports the number before touching anything.

Root cause: the migration that added `promoted_to_source_id` did not widen the status CHECK, and nothing checks the vocabulary a writer uses against the vocabulary the database accepts. Task 7.5 copied the route's convention and would have failed on its first apply row.

Fix at the source, two tracks (standing rule 3):
- DDL, coordinator applies before the code merges: migration `317_provisional_sources_status_promoted.sql` (315 and 316 are the last tracked): drop and re-add `provisional_sources_status_check` with `promoted` added to the list. Nothing else changes; `rejected` stays the decline value.
- Code (task 7.5 fix round, in the same lane): `resolve-provisional-sources.mjs` and the shared `promote-provisional.ts` write `promoted` for an activated source (with `promoted_to_source_id`) and `rejected` for a declined one, with the reason in `reviewer_note`. A test asserts that every status literal the module can write is in the set the migration declares (the four existing values plus `promoted`), with a comment naming the constraint.

Class fix (D7 below): a tracked inventory of CHECK vocabularies with a drift verifier, so a writer that uses a value the database refuses fails a unit test before it fails in production.

### D3. The provisional-source worklist flag is written fresh every run [CONFIRMED by review]

Evidence: review-7.5.md; `resolve-provisional-sources.mjs` re-reads its own worklisted rows and inserts a new `integrity_flags` row per run instead of merging into the per-host `null-tier-host` flag.

Fix at the source: extract `planHostDecision(url, classTierForHostFn)`, `buildNullTierHostWrite(existingFlag, host, itemId, url, permanentClass)` and the constant `NULL_TIER_CREATED_BY = "null-tier-host"` from `resolve-cited-host-gate.mjs` (lines 69, 92 and 107 on master) into `src/lib/sources/null-tier-host-worklist.mjs`, names and signatures unchanged, their tests moved with them; `resolve-cited-host-gate.mjs` re-exports them so its callers do not change; both maintenance scripts import it; `resolve-provisional-sources.mjs` uses it for every unclassifiable host. Test: a second run over the same input inserts 0 flag rows and updates the existing per-host row's contribution list.

Class fix: one worklist mechanism, one module. The shared-writer ownership row for `integrity_flags` names the module.
Fix round 2 for D3 (re-review of 16179a2a, FAIL on one regression [CONFIRMED by the reviewer]): in `resolve-provisional-sources.mjs` the row-level terminal writes (`worklistProvisional` and `worklistSourcesRow`) were nested inside `if (plan.host)` next to the new `buildNullTierHostWrite` merge, so a row whose URL has no parsable host is counted as worklisted but its own row is never written on apply and never reaches a terminal state. Specification: the two row-level calls run for every `worklist` decision, outside the `if (plan.host)` guard; only the per-host flag merge stays inside it (a null host has no flag to merge into, and the row's notes record "URL has no parsable host" as the reason). Test: an apply run over a fixture row with an unparsable URL asserts the row reaches its terminal state with that reason and that no flag row is inserted; a second run changes nothing. One commit; re-run the touched tests and the preflight; the re-review then runs on that commit.


### D4. The `sources` row reject path records no reason on the row [CONFIRMED by review]

Fix: `rejectSourcesRow` writes the decline reason into `notes` in the same form the other outcomes use (rule name, evidence, date); test asserts the note is present after a decline. The live `sources_status_check` allows only active, stale, inaccessible, provisional, suspended (no decline value), so a declined provisional `sources` row is set to `suspended` with the reason in `notes`; no DDL. The runbook section states this.

### D5. Dash and section-sign glyphs keep entering new prose [CONFIRMED]

Evidence: 7.4e added 7 (fixed in its round), 7.5 added 36 across nine files, 7.2 added 4 (a sanitiser's character class, ruled acceptable). The check is a byte count the coordinator runs by hand; no rule enforces it.

Root cause: the rule lives in the coordinator's dispatch text, not in the discipline engine.

Class fix, discipline rule 022 (`fsi-app/.discipline/rules/022-no-dash-glyphs.mjs` plus test): fails a commit when an added line contains U+2014, U+2013 or U+00A7, unless (a) the file path is under `fsi-app/scripts/turns/record-briefs/batches/`, a `fixtures` directory, or `docs/archive/`, or (b) the line carries the marker `glyph:verbatim` (a fixture string or a regex character class that must contain the glyph; the marker is the disclosure). Wired like the other rules (pre-commit, `runner.mjs --mode=ci`, the rules inventory). The rule replaces the manual byte check in the lane contract.

### D6. Session-log entries were missing from three lanes and the hook did not catch it [CONFIRMED]

Evidence: #647 red at CI's memory gate; 7.4e and 7.5 ranges also lacked the entry; the pre-push hook has no memory-gate step.

Fix: task 7.8 (built on lane/w9-7.8-2026-09-12, commit 27ea8296, under review): one script both CI and the hook run. Lands after review under this plan's gate order; no new work.

Review outcome (review-7.8.md, CONDITIONAL FAIL, two parity deviations) and the fix specification:
- [CONFIRMED] on a pull_request event where the memory gate fails, the original shell exited before evaluating the UX-compliance check; the new script evaluates both and prints both errors, with the same exit code. Ruling: keep the new behaviour (a lane sees every failure at once); document it in the script header and in the discipline.yml comment above the step as a deliberate change from the inline shell. No code change.
- [CONFIRMED] the UX-compliance message replaced the original single ellipsis glyph (U+2026) with three periods. Fix: restore the original glyph so the message is byte-identical (U+2026 is not in the banned set).
- One commit, tests re-run, preflight re-run, report appended; then the review is re-run on that commit.


### D7. Lanes cannot see the live schema and copy conventions from code that is itself wrong (the D2 class) [CONFIRMED]

Class fix, one discipline lane:
- A read-only maintenance step `schema-vocabulary-inventory` (maintenance.yml, dry only) dumps every list-valued CHECK constraint on public tables (`select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace and pg_get_constraintdef(oid) ~ 'ANY \(ARRAY'`; about 200 constraints across about 90 tables on 2026-09-12, the coordinator holds the first dump) to `fsi-app/docs/inventories/db-check-constraints.json` and commits it back on its own branch the way run artifacts are committed.
- A unit test `check-vocabulary.test.mjs` scans `scripts/maintenance/*.mjs`, `scripts/turns/*.mjs`, `src/app/api/**/route.ts` and `src/lib/**/*.{ts,mjs}` for object literals that set a column carrying a CHECK in the inventory (`status`, `provenance_status`, `discovered_via`, `archive_reason`, and every other column the inventory names) and fails when a literal value is not in that column's allowed set. Dynamic values are skipped, never guessed.
- A data-audit-lane verifier compares the tracked inventory with the live constraints and reports drift (exit 2 without credentials).

Fix round 1 for D7 (review-l3.md, CONDITIONAL FAIL): the negative fixture `fsi-app/.discipline/fixtures/check-vocabulary/bad-status-value.mjs` is, by design, imported by nothing, so fitness function F25 (module liveness) reports it as a dead module and CI's fitness job would go red. Specification: F25 exempts every file under a directory named `fixtures` by rule, with a test that a dead module inside `fixtures/` passes and the same module outside it fails; no per-file allowlist entry (an allowlist entry for one fixture is the instance patch this plan retires). The lane also corrects the report's claim about invariant RD-52 (it appears once; the report names the actually duplicated identifiers instead), re-runs `node fsi-app/.discipline/fitness/runner.mjs` (must print 0 violations) and the full preflight, and the review re-runs on the fix commit.


### D8. The local rendering guard reports 112 failures while CI's rendering guard is green [HYPOTHESIS]

Evidence: review-7.5.md reproduced the 112 in a full local run, none touching the 7.5 change; CI on #647 and #648 passed the rendering guard.

Investigation before any fix (read-only, one Sonnet agent, a finding not a change): run the guard the way CI runs it (same command, same build, same browser flags) and diff the failure list; classify each failure as environment (fonts, viewport, missing build) or real. The finding lands in `docs/audits/rendering-guard-local-vs-ci-2026-09-12.md` with status tokens. A fix is planned only after the finding.

### D9. Jurisdiction proposals have nowhere to land [CONFIRMED, decision owed]

Evidence: 7.2 declines every jurisdiction proposal with the architectural gate named (`sources.jurisdictions` holds the region-bucket vocabulary three surfaces read; the classifier's ISO values have no column). The close is valid under ADR-030. The information is still discarded.

Decision for the operator: add `sources.jurisdictions_iso text[]` (a migration, coordinator applied) and let 7.2's rule adopt into it, or keep declining. Recommendation: add the column; the classifier already produces the values and the decline note names exactly this gap.

### D10. The forward-events extractor turns a document-date sentence into an event [CONFIRMED]

Evidence (coordinator, live SQL, 2026-09-12): 2 rows in `item_forward_events` (2 items, created 2026-09-11 and 2026-09-12) with `source_kind = section`, `obligation_text = "In force as of <date>."`, `source_span` equal to the bare date, and the date equal to the run date, not a date the instrument states. The batch-001 lane found the first (item 252f0ecf) because the span is not verbatim in the pool, and excluded it rather than fabricate.

Root cause: the section-side extractor in the forward-events derive path (the code that reads brief sections for dated obligations) accepts an "as of" sentence whose date is the brief's own writing date; the 6.1b pilot bodies carried "as of 2026-09-12" notes, and the extractor read them as an entry-into-force event.

Fix at the source: the section extractor refuses a candidate whose span is only a date, and refuses any candidate whose date equals the run date or the brief's document date unless the sentence names the instrument's own commencement (a test per case: "In force as of <today>" refused; "enters into force on 1 January 2027" accepted; a bare-date span refused). Cleanup: a data migration committed with the extractor fix and run after merge deletes rows matching exactly the shape above (`source_kind = section`, `obligation_text like 'In force as of %'`, `source_span = event_date::text`), 2 rows expected, the count asserted in the migration comment; fabricated rows are removed, never kept as records.

Class fix: a forward event must be verbatim in its source (the same rule as a FACT claim); add an assertion to the forward-events write path that the span is present in the pool or section text it cites, refusing otherwise with a run-log line. Lane: L6, one Sonnet lane after L1 to L5, on a freed worktree.

### D11. The pre-push hook writes every step log to a fixed path under /tmp, so concurrent hook runs clobber each other [CONFIRMED]

Evidence: `fsi-app/.discipline/hooks/pre-push` lines 102 to 178 redirect each step to `/tmp/discipline-prepush-{c,t,inv,gate,tsc}.log` and `rm -f` the file when the step ends. On 2026-09-12 the batch-001 push ran while two lane gates were running; its step 3 failed and printed `tail: cannot open '/tmp/discipline-prepush-t.log'` instead of the failing tests, because another run had already deleted the file. The exit status is the suite's own, so a fail is real, but its diagnosis is lost and a passing run can also delete the log a failing run needs.

Root cause: shared fixed temp paths in a hook that is run concurrently by design (one push per lane, lane preflights, the coordinator's gate runs).

Fix at the source: the hook creates one per-run directory with `mktemp -d` (fallback to `$TMPDIR` or `/tmp` with the pid in the name when mktemp is unavailable), writes every step log inside it, prints the directory on failure, and removes it on success with a trap on exit; no fixed path remains. A test in `.discipline/hooks/` (or the hook's existing test file if one exists) runs two hook invocations concurrently against a fixture and asserts both logs survive. Lane: L3 (the discipline lane), added to its scope by the coordinator; if L3 has already reported, a follow-on lane L7.

### D12. Harness run artifacts are numbered per checkout, so parallel lane branches produce colliding artifact names [CONFIRMED]

Evidence (coordinator, 2026-09-12): `brief-lane/001-2026-09-12` carries `brief-apply-run-003.json` and `brief-apply-run-004.json` from GitHub runs 34708781168 and 34709053690; `brief-lane/002-2026-09-12` carries files of the same two names from runs 34712217771 and 34712340105. Both sets stamp the same harness version. The earlier proposer pass on master already recorded the same class as finding F ("CI claimed run-001 twice in fresh checkouts"). Landing both branches' artifacts on master is impossible without renaming, and F28's staleness logic keys on these numbers.

Root cause: `scripts/turns/commit-brief-apply-artifact.sh` (and the run-artifact writer in `run-artifact.mjs`) allocate the next number from the files present in the checkout that runs the workflow, which for a lane branch is that branch's own view, never the family's global sequence.

Fix at the source: the artifact file name carries the GitHub run id as the identity (`brief-apply-run-<github_run_id>.json`) and the sequence number becomes a field inside the artifact allocated at landing time on master by the proposer pass, not by CI; F28 and `parsePendingRunHash`'s consumers, the proposer-pass attestation check and the runbook sections that name `run-NNN` adapt (an attestation names the run id); the two colliding pairs on the batch branches are renamed by the coordinator when their proposer passes land on master. Tests: two artifacts written from two branches for the same family never share a name; F28's latest-artifact selection orders by the artifact's recorded timestamp, not the file name. Lane: L8, one Sonnet lane after L6, on a freed worktree; the same fix applies to every harness family that uses the shared writer (date-chain, propagation, mint, source-sweep), which the lane enumerates from `run-artifact.mjs`'s family registry before changing anything.

### D13. The provisional-source resolver rejects on the absence of an accessibility check [CONFIRMED]

Evidence (coordinator, 2026-09-12): the dry run 34724257806 of `resolve-provisional-sources` decided promote 368, reject 248, worklist 438; the reject sample is real authorities (irishstatutebook.ie, transport.gov.scot, theccc.org.uk, dma.dk, cre.fr, belastingdienst.nl, bmluk.gv.at, mindop.sk) with the reason "URL dead or accessibility check failed". Live SQL: every `provisional_sources` row, all 497 across every status including the 6 confirmed ones, has `accessibility_verified = false`; no row was ever checked. `decideHost` (rule c) treats that default as "dead" once rules a and b fail to resolve the host. The apply is held.

Root cause: an absent check read as a negative result, and a reject decision made without knowing what the institution is. Under standing rules 16 and 18 and ADR-030, an unreachable URL on a real institution is a status, never a rejection, and an unknown host is a question (the worklist), never a rejection.

Fix at the source (`fsi-app/scripts/maintenance/resolve-provisional-sources.mjs`, `decideHost`): rule (c) is removed. The decision is a (existing institution) or b (class table) promote, else d worklist; accessibility never decides. The promoted `sources` row's `status` carries the accessibility fact: `active` when `fetch_status` is ok or null, `inaccessible` when `fetch_status = 'error'` (the live `sources_status_check` vocabulary); `accessibility_verified` is never read as evidence of anything until a check has actually run and stamped it. Tests: a row with `accessibility_verified = false` and no class match goes to the worklist, not reject; a class-matched row with `fetch_status = 'error'` is promoted with status `inaccessible`; the reject outcome no longer exists for rule c (a decline stays possible only from the vertical-fit gate the promote path already applies, with its reason). Runbook section 46 and the dry-output vocabulary updated. Lane: L9, one Sonnet lane, on the 7.5 worktree from master after #652.

### D14. The SC-13 class table does not recognise most national government and legal-publisher hosts [CONFIRMED]

Evidence: of the 489 pending `provisional_sources`, 227 hosts match a government or legal pattern by a coarse regex (gov, gouv, gob, gc, go, gv, govt, bund, admin, overheid, gouvernement, regeringen, riksdagen, legislation, statutebook, legifrance, gesetze, retsinformation, boe.es, normattiva, europa.eu) and 202 more sit on plain country domains (dma.dk, mindop.sk, hzn.hr, sfzp.cz, cre.fr) that are national authorities by name but not by pattern; the class table's codified government rule resolved only a fraction (rule b promoted 368 of 1,052 rows overall). The 563 provisional `sources` rows are mostly commercial (226) and .org (198) hosts with no class.

Fix at the source, in two deterministic steps, never a model guess (SC-13):
1. Pattern extension in `src/lib/sources/host-authority.ts` (`classTierForHost`): a government second-level label list per country (gov, gouv, gob, gc, go, gv, govt, admin, bund, overheid, gouvernement, regeringen, riksdagen, and the ones the enumeration below surfaces) resolves to T2 when it appears as a registrable label under a country TLD; a curated legal-publisher allowlist resolves to T1 (irishstatutebook.ie, legifrance.gouv.fr, gesetze-im-internet.de, retsinformation.dk, wetten.overheid.nl, boe.es, normattiva.it, lovdata.no, finlex.fi, legislation.gov.au, laws-lois.justice.gc.ca, fedlex.admin.ch, ris.bka.gv.at, plus those the enumeration surfaces), each entry named with its institution in a comment. Tests per pattern and per allowlist entry, plus negatives (a `.gov.example.com` lookalike and a `gov` label under a commercial TLD do not match).
2. Enumeration for the residue: a read-only script writes the remaining unresolved hosts of both backlogs to a gitignored scratch file with, per host, the row's stored name, `discovered_via`, the citing item title where one exists, and the count; the coordinator rules host classes from that list (a doctrine act, never delegated to Haiku) and the lane commits the resulting allowlist entries with their institution names. A host the coordinator cannot classify with certainty stays worklisted; that residue is reported by count in the population report.
Lane: L9 (same lane as D13, since both change the same decision path); the dry run is repeated after both land, counts read, then apply.


Residue ruling (coordinator, 2026-09-13, from the enumerate-unclassified-hosts artifact of run 34728958591: 628 hosts, 672 rows, after #657). A name-keyword tally over the stored registry names classifies 147 as government bodies, 17 as legal publishers, 76 as associations or standards bodies, 23 as news or press, 2 as academic, and leaves 363 corporate or unnamed. The ruling turns that tally into codified rules, deterministic on the stored institution name and the host, never a model guess (SC-13), applied in this precedence in `classTierForHost`:

1. Legal publisher, T1: the host allowlist gains the 17 the artifact names with their institutions (bclaws.gov.bc.ca, dre.pt, e-sbirka.cz, gazzettaufficiale.it, law.gov.wales, laws.yukon.ca, legilux.public.lu, legislation.mt, magyarkozlony.hu, narodne-novine.nn.hr, njt.hu, publicationsduquebec.gouv.qc.ca and the five more listed under "legal" in the artifact), and a name rule: a registry name containing "official gazette", "official journal", "legislation registry", "statutes", "laws of", "legal register", "journal officiel", "diario oficial", "gazzetta ufficiale", "sbirka", "közlöny", "narodne novine" or "mémorial" resolves T1.
2. Academic, T4: the existing .edu and .ac rule plus a name containing "university", "universit", "college", "polytechnic", "academy of sciences" or "research institute".
3. Association or standards body, T4: a name containing "association", "federation", "alliance", "consortium", "chamber of commerce", "standards", "normalisation", "institute of" followed by an industry noun, or "council" when the host is not a government host by rule 4; the existing curated allowlists stay first.
4. Government, T2: the host carries a `gov`, `gouv`, `gob`, `gc`, `govt` or `parliament` label anywhere (transport.gov.scot, gov.wales, law.gov.wales already T1 by rule 1, commonslibrary.parliament.uk), or the name contains an institutional noun from a fixed list (ministry and its French, Spanish, Portuguese, Italian, Dutch, German, Romanian and Scandinavian forms; department of; government; agency; authority; commission; office of; bureau; parliament; legislature; assembly; senate; regulator; inspectorate; directorate; secretariat; municipality; county; city of; port authority; customs; revenue; treasury; central bank; environment agency; emissions authority; environment corporation) and no rule 1 to 3 match. A think tank is not a government body: the words "center for", "centre for", "institute for", "council on" and "foundation" route to rule 6 before rule 4.
5. News or press, T7: a name containing "news", "times", "post", "herald", "magazine", "daily", "weekly", "press", "media", "broadcast", "tribune", or a host under .news; a corporate press room ("newsroom", "press release", "media information") is rule 7, not news.
6. Analysis, T6: a name containing "center for", "centre for", "institute for", "council on", "foundation", "think tank", "research", "analysis", "consulting", "advisory", "insight", or a Big-4 or advisory host (pwc, deloitte, ey, kpmg, mckinsey, bcg, bain, accenture, guidehouse, roland berger).
7. Company, T7, a new class: any host with a stored name and no rule 1 to 6 match. Its own site is a primary only for its own announcements (market-signal corroboration counting) and never passes an authority floor; T7 weight 0 in the citation network. This class exists so a corporate host stops being a question; a mis-tier here under-credits and never over-credits.
8. Worklist stays only for hosts with no stored name at all (the artifact says how many); those are the true residue and are listed in the population report.

Tests: one positive and one negative per rule with hosts from the artifact (gov.scot, mmediu.ro, emissionsauthority.nl, dre.pt, njt.hu, bimco.org, afnor.org, eur.nl, fleetnews.co.uk, enotrans.org as analysis not government, guidehouse.com, masdar.ae as company, acea.auto as association), the precedence order proven (a legal publisher with "government" in its name is T1; a think tank with "institute for" is T6 not T2), and the existing class-table tests green. The dry run of resolve-provisional-sources is repeated after this lands; expected worklist: the unnamed hosts only. Lane: L9b, one Sonnet lane on the freed L9 worktree from master after #657.


### D15. 1,034 tag flags carry zero proposals and ask for manual tagging, and the decider leaves them open [CONFIRMED]

Evidence (coordinator, 2026-09-12): the tag-ratification dry run with `--arg auto` (run 34724664228) reports open 1,105, decidable 71 (81 adopts, 0 declines), not_adoptable 1,034. Live SQL: every open flag is `flywheel-tag:empty-signature` (2026-09-03 and 04); the 1,034 carry `PROPOSALS_JSON: []` with a description ending "needs manual operator tagging (or a KEYWORD_MAP extension) before it can join the connection graph". `evaluateAutoAdoption` returns "flag carries zero proposals" and the auto path counts the flag as not adoptable and leaves it open.

Root cause: the proposer (`derive-tags.mjs`) opened a flag whose only proposal was a request for a human, and the 7.2 decider only decides flags that carry proposals. Most of these items were record-grade stubs on 2026-09-03 with a title and no brief text; hundreds of them now carry briefs (batches 001 and 002, the timeline and forward-event backfills), so the derivation that found nothing then may find tags now.

Fix at the source, two parts, one lane:
1. Decider (`tag-ratification.mjs` auto path, `apply-tags.mjs`): a zero-proposal flag is decided, never skipped. At run time the step re-derives candidates for the flag's item from its current title, instrument key, what_is_it, summary and full_brief through `derive-tags.mjs`'s own pure derivation (imported, not copied), then runs each candidate through `decideTagProposal` (closed vocabulary plus evidence present in the item's own text); adopts what passes; and resolves the flag either with the adopted tags or, when nothing derives, with `resolution_note` "no derivable tags from the item's own text on <date> (derive-tags KEYWORD_MAP); the item joins the connection graph through its entity refs; no manual tagging (ADR-030)". The dry output lists, per outcome, re-derived-and-adopted, re-derived-and-declined, and no-derivable-tags counts with a 20-row sample each. Tests: a zero-proposal flag whose item now has brief text with a vocabulary keyword is adopted and resolved; a zero-proposal flag whose item still has no derivable text is resolved with the no-derivable-tags note; a second run inserts nothing and reopens nothing.
2. Proposer (`derive-tags.mjs`): when it finds no candidates it no longer opens an open flag asking for a human; it records the finding as an already-resolved flag with the same no-derivable-tags note (one row per item, merged on re-run), so the count stays visible in the population report and no queue forms. The phrase "needs manual operator tagging" is removed.
Lane: L10, one Sonnet lane on a freed worktree from master, before the tag-ratification apply; the dry run is repeated after it lands.

Fix round 1 for D15 (review-l10.md, CONDITIONAL FAIL on coverage): (1) `tag-ratification.mjs`'s D15 dry and apply outcome bucketing (re-derived-and-adopted, re-derived-and-declined, no-derivable-tags) and its 20-row sampling gain tests mirroring the classification side's; (2) the re-derivation's declined branch (a candidate in the vocabulary whose evidence is not in the item's own text) is tested end to end on the tag side, asserting the flag resolves with the declined decision recorded in its note. Ruling on the Minor: "runs" in the drift sample floor is read as distinct calendar dates of observation, accepted; the runbook sentence says so. No behaviour change; the review re-runs on the fix commit.


### D17. The quarantine writers and the human-request flag writers, enumerated and removed as a class [CONFIRMED pattern; sites to enumerate]

Operator, 2026-09-12, verbatim: "You probably have to find the code that is quarantining the info and remove it and the code that is creating these false flags and remove them." D13 (a resolver rejecting on the absence of a check) and D15 (a proposer opening 1,034 flags that ask for manual tagging) are two instances of one class: a runtime that reaches a question it cannot answer and parks the item or opens a flag addressed to a person, instead of answering or recording a decision. ADR-030 and the admin-is-visibility rider forbid both resting states.

Fix, two steps:
1. Enumeration (read-only, one Sonnet agent, a finding not a change): every code site under fsi-app/src, fsi-app/scripts and fsi-app/supabase/migrations (triggers and functions) that (a) sets `provenance_status = 'quarantined'`, archives with a hold reason, or routes an item to a "needs review", "manual", "operator", "deferred" or "parked" state; and (b) inserts an `integrity_flags` row whose description or recommended_actions asks a person to act ("manual", "operator", "review", "confirm", "needs", "TBD") or whose only content is a run log. For each site: file and line, the condition that triggers it, what question the code could not answer, whether the answer is derivable at that point (the pool, the registry, the class table, the item's own text, a re-fetch through the free capture path), the live row count it produced (from integrity_flags.created_by and provenance_status counts, read-only SQL by the coordinator on the agent's request), and its status token. Output: docs/audits/quarantine-and-human-flag-writers-2026-09-12.md, plus a table in the W9 ledger folder.
2. Specification (coordinator) per site: resolve at the site (derive the answer, as D13 and D15 do), record a decision and close (a resolved flag with the reason, a status value that names the state), or delete the writer when it produces nothing a runtime or a reader consumes. Sites that quarantine for a real provenance failure (ADR-016: a span not verbatim in a capture) keep quarantine as an OPEN INVESTIGATION with an enqueued resolver (research-or-erase, remediation-discipline section 2.1), never as a terminal state; the audit names the resolver for each. Lanes follow, one per family of sites.

Enumeration result (docs/audits/quarantine-and-human-flag-writers-2026-09-12.md, 21 sites, 15 families) and the coordinator's ruling per family, with live open-row counts read 2026-09-12:

| Family | Live open rows | Ruling |
|---|---|---|
| 1 provenance-gate quarantine (ADR-016) | 85 quarantined live items | Keep as the open investigation it is; the resolver is `regen-quarantined.mjs` under RD-6; the 7.3 residue report names the exact missing answer per item. No change. |
| 2 provisional-source reject | 248 would-be rejects | D13, lane L9. |
| 3 tag zero-proposal | 1,034 of 1,105 | D15, lane L10. |
| 4 classification zero-proposal (`flywheel-axis:source-classification`, 1,287 open; the zero-proposal subset is counted by the L10 dry run) | 1,287 | Same fix shape as D15, folded into lane L10: the decider re-derives the unset axes from the SC-13 class table and the source's observed item-category distribution (both deterministic, both already read by the classifier), adopts what the evidence rule allows, and resolves every flag with the adopted values or the note "no derivable classification from the class table or the observed output on <date>; re-evaluated on the next classify run"; the proposer stops writing "needs manual operator classification" and records a zero-derivation as an already-resolved row. |
| 5 classification drift and anomaly (`flywheel-axis:source-drift`, `flywheel-axis:item-anomaly`, 1 open) | 1 | Drift: the source's observed output over at least 2 runs and 20 items is the answer; the step adopts the observed distribution as `expected_output` and resolves the flag with the before and after values; below that sample size it resolves with "insufficient sample, re-evaluated next run". Anomaly: the writer is deleted (a judgment call with no reader); the open row is resolved as "advisory retired under the ADR-030 rider". Lane L10. |
| 6 cited-host-gate | 0 | Fixed (7.4). |
| 7 null-tier-host worklist | 21 hosts | A legitimate terminal worklist by SC-13, but its answer path is the class-table extension; D14's enumeration step lists these 21 hosts with the residue and the coordinator rules their classes in the same pass. |
| 8 error-body-gate | 0 | Fixed (7.4); the 5 still-failing URLs are 7.4d. |
| 9 census validation hold | closed loop | No change. |
| 10 acquire-primaries manual hold (`acquire-primaries-batch-2026-07-16`) | 19 | A write-only orphan from a one-shot July script: the flag writer and the script are deleted (nothing reads them; the free capture path and provenance-heal supersede them); the 19 rows are resolved with "superseded by the free capture path and provenance-heal (task 7.3); item carried in the 7.3 residue report". Lane L11. |
| 11 refetch-capped manual hold (`refetch-capped-worklist`) | 8 | A real provenance question with no resolver: a maintenance step `resolve-refetch-holds` re-grounds each held item against its newest capture through `groundBrief` (snapshot first, zero fetch); a span that no longer matches supersedes its claim (`claim_versions.supersede_reason = 'changed'`); the flag resolves with the outcome (re-grounded, superseded claims count, or quarantined under Family 1 with the enqueue). Lane L11. |
| 12 timeline-backfill undateable (`timeline-backfill`, 1 row listing 211 ids) | 211 items | A sixth deterministic step: an item with no derivable instrument date carries a `captured` timeline row dated at its stored capture's `searched_at` (the capture is a real dated event about the item, labelled as such, never presented as the instrument's date); the flag then resolves with the count; the "manual research" ask is removed from the writer. Lane L11 (touches `timeline-backfill.mjs` and `timeline-backfill-derive.mjs`, with a test that the capture row is labelled and ordered last). |
| 13 coverage-gap and anticipate (`flywheel-gap:*` 18, `flywheel-anticipate:*` 6) | 24 | Product-scope reflections, not questions to a person: the writer inserts them already resolved with the note "reflected in the coverage view; no per-row decision pending", the population report keeps counting them, and the open rows are resolved the same way on the first run. Lane L11. |
| 14 run logs and carve-outs (`authorship-shard-*` 82 open, `legacy-remediation*` 71 open, `gate-a-verifier-sweep` 37) | 190 | Run logs: fixed (7.1). The authorship BLOCKER rows are legal role determinations the platform never makes (doctrine): resolved with "Legal Confirmation Required; no platform determination (environmental-policy skill); recorded for counsel" and listed in a `legal-confirmation` line of the population report. The legacy-remediation PARKED rows are the 7.3 residue: converted to valid RD-6 deferrals (reason: paid re-acquire behind the operator's acquire lock; resolution_event: acquire lock lifted; owner: operator; deferred_until: 2026-10-15) so they stop counting as undispositioned; the 7.3 residue report to the operator carries the exact list. gate-a-verifier-sweep is 7.7: verifier run summaries, closed by `close-run-logs` once its allowlist names that vocabulary. Lane L11. |
| 15 flywheel-signal undecided | 0 | Fixed (7.2). |

Lane L11 is one Sonnet lane executing families 10 to 14 as specified, with a dry run per step and the population report's open-flags-by-family entry as the proof; L10 absorbs families 4 and 5. After L9, L10 and L11 land, the drains run in this order, dry then apply, one at a time: resolve-provisional-sources, tag-ratification (auto), apply-classifications, resolve-signals, then the L11 steps. Acceptance stays the Part 7 acceptance: open integrity_flags requiring a human decision 0; quarantined live items only those carrying an enqueued Family 1 investigation; no admin view renders an approve, ratify, decide or resolve control (7.6, which follows).

Correction to the Family 14 ruling (coordinator, 2026-09-13, standing rule 13 corollary, corrected in place): [REFUTED] the reading of `gate-a-verifier-sweep` as verifier run summaries (task 7.7's hypothesis and the row above). Live SQL over the 37 open rows shows per-item findings of two shapes: "Item <title> has no full_brief at all (NULL/empty) while quarantined; a structural authoring gap" and "<title>: two of three Gate A orphans fixed this pass; the remaining orphan is <named>". These are real questions and the brief chain answers them: an item with no brief gets one through the record-briefs lane (the export includes quarantined items since D1), and an item with a remaining Gate A orphan gets its rewrite in the same lane. Ruling: `close-run-logs` must NOT gain a gate-a-verifier-sweep family. Instead lane L11 adds a step `close-flags-for-verified-items`: it resolves every open item-subject flag from a named per-item family list (gate-a-verifier-sweep first; the list is a constant the coordinator extends) whose subject item is now `provenance_status = 'verified'`, with the note "item verified on <date>; finding superseded"; rows whose item is still quarantined stay open as the brief-chain queue, and the step's dry output lists their item ids so the coordinator feeds them to the next brief-export batch. Test: a flag whose item verified is resolved; a flag whose item is quarantined is left open and listed; a second run changes nothing.



### D18. The validator's qualification check matches bare words and misses inflected forms [CONFIRMED by the batch-002 lane]

Evidence: writing the 00a8c0d9 brief, the lane found the instrument's only occurrences of the exceptions vocabulary are "Exemption" and "exempted"; the validator's check uses a word-boundary match on "exempt" and reports the qualification absent, so an honest capture fails while a page-furniture "except" would pass. The lane recorded the absence honestly rather than game the check.

Fix at the source (`fsi-app/scripts/turns/record-briefs/schema.mjs`, the qualification-capture mirror): each qualification kind matches a small stem list with inflections (exempt, exempts, exempted, exemption, exemptions; condition, conditions, conditional, subject to; scope, applies to, does not apply; phase, phased, per year, from <year>), case-insensitive, evaluated on the claim's verbatim `source_span` as today; the negation guard stays. Tests: "Exemption" and "exempted" in a span count as an exceptions capture; "except" inside page furniture alone does not (the span must be a claim's span, not body prose). README rule text updated to name the stems. Lane: folded into the next record-briefs lane (L12) after L9 and L10; no re-apply of landed batches is required (their captures were honest either way).


### D19. Git runs a stale copy of the pre-push hook, so merged hook changes are not in force on push [CONFIRMED]

Evidence (coordinator, 2026-09-13): `core.hooksPath` is the repository's `.git/hooks`; `install-hooks.mjs` copies the tracked hooks there byte for byte as an operator-run step; the installed pre-push copy is dated 2026-09-11 19:33 and differs from the tracked `fsi-app/.discipline/hooks/pre-push` on master. Every push since #651 merged ran without step 2b (the memory gate) and without D11's per-run log directory; the L3 push (lane/w9-d5-d7) failed at step 3 and the stale copy deleted its own log ("tail: cannot open /tmp/discipline-prepush-t.log"), the very defect D11 fixed on that branch. The lanes' preflights run the tracked file directly, so a lane's green preflight and the push hook can disagree.

Root cause: a copy with no freshness check and a manual installer; the boundary between the tracked source of truth and the out-of-repo hook directory is not enforced by anything.

Fix at the source: `install-hooks.mjs` installs a trampoline for each hook, not a copy: a three-line shell script in `.git/hooks/<name>` that resolves the current worktree's top level (`git rev-parse --show-toplevel`) and execs the tracked `fsi-app/.discipline/hooks/<name>` from it with the same arguments and stdin, so the hook that runs is always the branch's tracked hook (CI parity by construction, per worktree). A check in the tracked pre-push (step 0) verifies it was reached through the trampoline (an environment variable the trampoline sets) and otherwise prints "stale hook copy; run node fsi-app/.discipline/install-hooks.mjs" and exits 1, so a stale copy can never silently run again. The runbook's hook section and `docs/inventories/discipline.md` (the out-of-repo boundary rows) record the trampoline. Tests: the installer writes the trampoline shape; the tracked hook refuses without the trampoline variable. Interim, before the lane lands: the coordinator runs the existing installer once so the merged hook is in force. Lane: L12 (with D18), one Sonnet lane.


## 3. Lanes, order and gates

| Lane | Contents | Worktree | Precondition |
|---|---|---|---|
| L0 (coordinator) | Migration for D2 applied live; then D9 if ruled | none | operator go |
| L1 7.5 fix round | D2 code, D3, D4, the 36 glyphs, the session-log entry with a UX compliance block; resume from the stopped tree (one uncommitted edit in `admin-stat-tiles-smoke.mjs`) | wt-brieffields-0911 | L0's migration applied |
| L2 6.2d | D1 | wt-part3-0911 (branch exists) | none |
| L3 discipline | D5 rule 022, D7 inventory step, test and verifier | a freed worktree | none; lands before L1 and L2 push so their ranges are checked by the rule |
| L4 7.8 | D6, review then push | wt-eudecision-0911 | review PASS |
| L5 investigation | D8 finding | read-only | none |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |
| L8 harness numbering | D12 run-id artifact names across every harness family | a freed worktree | after L6 |
| L11 quarantine and human-flag writers | D17 enumeration (read-only) then per-site specification and lanes | a freed worktree, read-only first | enumeration now; lanes after L9 and L10 |
| L12 record-briefs validator | D18 qualification stems | a freed worktree | after L9 and L10 |
| L10 tag decider | D15 zero-proposal flags re-derived and decided; proposer stops asking for a human | a freed worktree from master | before the tag-ratification apply |
| L9 provisional resolver | D13 reject rule removed, accessibility as status; D14 class-table extension and residue enumeration | wt-brieffields-0911 from master after #652 | before the resolve-provisional-sources apply |
| L3 addendum | D11 per-run hook temp files | wt-searchkeys-0911 | with L3 |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |
| L6 forward events | D10 extractor refusal, verbatim assertion, cleanup data migration | a freed worktree | after L1 to L5 |

Order of pushes (serial, each through the hook): L4, L3, L2, L1. Then: brief-export for 00a8c0d9 alone, the batch-002 lane writes its tenth brief, brief-apply with `allow_brief_overwrite` for batches 001 and 002, the three 7.2 dry runs one at a time, then their applies, then the 7.5 dry runs and applies.

Every lane: the lane contract, the Wiring preflight, tests for every refusal, findings labeled, the report in the W9 ledger folder, review by a Sonnet reviewer, coordinator gate run before the push.

## 4. What stays as it was

Task 7.2's code (reviewed PASS) is not reopened. The batch-001 brief-writing lane continues. 7.3 residue, 7.4d, 7.6, 7.7 and the 211 undateable items remain owed as listed in the ledger and are not defects of this plan.

## 5. Standing rule from this ruling

Operator, 2026-09-12, verbatim: "this should be your rule going forward, fable builds the plans to fix when a problem arises, and sonnet and haiku fix based on the plan." Applied from here on: a Critical or Important finding, or a CI red not explained by a known marker re-pin, stops the implementer; the coordinator writes the fix plan (root cause, fix at the source, class fix, proof, lane, order); lanes are dispatched only against that plan.
