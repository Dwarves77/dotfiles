---
id: AUDIT-D17-2026-09-12
title: Quarantine writers and human-request flag writers, enumerated
status: read-only finding
date: 2026-09-12
scope:
  - "fsi-app/src"
  - "fsi-app/scripts"
  - "fsi-app/supabase/migrations"
related: "docs/plans/defect-fix-plan-2026-09-12.md (tasks D13, D15, D17); docs/decisions/ADR-030-resolve-not-quarantine-and-every-item-dated.md; fsi-app/.claude/skills/remediation-discipline/SKILL.md (section 2.1, RD-6); fsi-app/.claude/CLAUDE.md (integrity flags agent contract)"
---

# Quarantine writers and human-request flag writers (D17 enumeration)

Read-only investigation for defect D17 of the 2026-09-12 defect fix plan, operator directive quoted
there verbatim: find the code that quarantines information and the code that opens flags asking a
person to act, so the coordinator can decide, per site, whether to resolve at the source, record a
decision and close, or delete a writer that produces nothing a runtime or reader consumes.

Method: grep across `fsi-app/src`, `fsi-app/scripts` and `fsi-app/supabase/migrations` (SQL functions
and triggers included) for (a) writers of `provenance_status = 'quarantined'`, `archive_reason`
holds, and routing to a needs-review/manual/operator/deferred/parked/hold/pending-review state, and
(b) `integrity_flags` inserts or upserts whose description or recommended_actions asks a person to
act, or whose content is only a run log. Each site below was opened and read directly; no site is
reported from a grep match alone. No database access was used; the "SQL for the coordinator" section
at the end lists the counts this file's claims would need to be read against live.

Fifteen families, twenty-one live call sites. Two are the historical record of the same class already
fixed once (before this session), kept for precedent. Where this file names a resolver, it verified the
resolver's existence by reading it; it did not run it.

## Family 1: the provenance gate's quarantine branch (the legitimate case)

The single trigger function `set_provenance_status()` stamps `intelligence_items.provenance_status`
from `validate_item_provenance()`'s six-criterion result on every insert, update and delete that
touches an item, its sections, or its claim ledger.

| Site | Function | Trigger condition | Question the code could not answer | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/supabase/migrations/209_provenance_status_on_delete.sql:81-102` (current function body; originated migration 115, criterion logic current in migration 207) | `public.set_provenance_status()` | `validate_item_provenance(item_id)` returns `recommended_status = 'quarantined'` (1 or more of 6 provenance criteria fail: source validity, cited-URL completeness, claim-tier floor, label variants, brief presence, own-body floor) | Does this item's ledger meet the six criteria for a grounded, verifiable brief | Yes, by re-grounding or re-researching the item (ADR-016) | `set_provenance_status_trigger` | `scripts/regen-quarantined.mjs` (research-or-erase resolver); audited live by `scripts/verify/quarantine-disposition-audit.mjs` (RD-6, dwell-bound + disposition check); auto-closed by the same function's F5 close-on-verify branch (migration 139, lines 105-118 of the current file) when the item re-verifies | [CONFIRMED] |

This is the case ADR-030 and remediation-discipline section 2.1 explicitly except from removal:
"Sites that quarantine for a real provenance failure (ADR-016: a span not verbatim in a capture) keep
quarantine as an OPEN INVESTIGATION with an enqueued resolver ... never as a terminal state." The
resolver and the live-data invariant both exist and are wired. Read as designed and working; not a
site the coordinator needs to remove.

## Family 2: D13, the provisional-source reject rule (already scheduled)

| Site | Function | Trigger condition | Question | Derivable? | Row/reason | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/maintenance/resolve-provisional-sources.mjs`, `decideHost` rule (c) | `decideHost` | `accessibility_verified = false` (the column's untouched default, never actually checked) falls through rules (a)/(b) to a reject | Is this host reachable | No, the column was never populated by any check; the fix (D13) removes rule (c) and makes accessibility a status on the promoted row, not a rejection input | `provisional_sources.status` reject reason "URL dead or accessibility check failed" | Feeds the resolver's own apply step; already has a coordinator-authored fix at plan lane L9 | [CONFIRMED] |

Already named and fixed in the defect plan (D13); listed here only so the family count is complete.

## Family 3: D15, the tag-proposal zero-signal flag (already scheduled)

| Site | Function | Trigger condition | Question | Derivable? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/connections/propose-tags.mjs:171` (`buildFlagRow`) | proposer | `derive-tags.mjs` returns zero tag candidates for an item's title/instrument key/brief text | Can this item join the connection graph via a tag | Yes, once the item has brief text (most of the 1,034 now do, per D15's own evidence) | `createdBy(TAG_NAMESPACE, "empty-signature")` = `flywheel-tag:empty-signature` | `fsi-app/scripts/maintenance/tag-ratification.mjs`'s auto path, which (pre-fix) treated a zero-proposal flag as `not_adoptable` and left it open forever | [CONFIRMED] |

Already named and fixed in the defect plan (D15, two-part fix: decider re-derives and resolves;
proposer stops opening a flag with the "needs manual operator tagging" phrase). Listed here only so
the family count is complete.

## Family 4: the classification zero-proposal flag (sibling of D15, not yet scheduled)

The 5-axis source-classification framework mirrors propose-tags.mjs's own pattern one directory over,
built later (2026-09-02/03), and reproduces the exact D15 shape for a different subject: a source
whose `scope_topics`/`scope_modes`/`scope_verticals`/`expected_output` fields are unset and whose
classifier found nothing to propose.

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/classification/propose-classifications.mjs:120-160` (`buildClassificationFlagRow`, the empty-proposals branch at line 133 and the recommended_actions at line 147-149) | proposer | `classify-source.mjs` returns zero proposals for a source's unset 5-axis field(s) from its name/url/role alone | What is this source's scope_topics/scope_modes/scope_verticals/expected_output | Possibly, via the SC-13 class table (`fsi-app/src/lib/sources/host-authority.ts`, `classTierForHost`) for the institution-type half of the answer, or via the source's own observed item-category distribution (the same signal `buildDriftFlagRow` already computes for drift) | `createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE)` = `flywheel-axis:source-classification` | `fsi-app/scripts/classification/apply-classifications.mjs`, `evaluateAutoAdoption` (line 289: `if (!parsed.value.length) return { ok: false, error: "flag carries zero proposals; nothing to decide." }`), and the `--auto-adopt` loop (line 608) treats this outcome as `not_auto_adoptable` and logs it as "expected, not a failure": the flag stays open with no path to close | [CONFIRMED] |

The recommended_actions text this site writes when it has zero proposals is, verbatim: "Classify
manually via SQL/admin, or extend the relevant classifier if a real, recurring signal was missed."
This is the same shape D15 named: a proposer asking a human because it found nothing, and a decider
that treats "nothing to decide" as a reason to leave the queue open rather than a reason to resolve it
with a recorded no-derivable-classification note. Recommend the coordinator treat this as the same
fix family as D15 (decider resolves with a note when nothing derives; proposer stops writing the
"needs manual operator classification" phrase), since the two scripts already share the propose/apply
split and the auto-adopt scaffold D15's fix will build.

## Family 5: classification drift and anomaly flags (advisory by design, likely legitimate)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/classification/propose-classifications.mjs:168-192` (`buildDriftFlagRow`) | proposer | a source's observed item-category distribution deviates from its registered Axis-5 `expected_output` by more than the drift threshold | Which of four possible causes (scope changed, wrong registration, item-rule gap, genuine anomaly) explains the drift | The file's own comment: "only an operator can disposition which" | `flywheel-axis:source-drift` | None; advisory-only by design, never auto-adopted | [CONFIRMED] |
| `fsi-app/scripts/classification/propose-classifications.mjs:202-221` (`buildAnomalyFlagRow`) | proposer | one item's classified category carries less than the anomaly threshold's expected probability under its source's distribution | Is the item's classification wrong, or is the source's output genuinely unusual | Same as above, a judgment call between two live possibilities, not a lookup | `flywheel-axis:item-anomaly` | None; advisory-only by design | [CONFIRMED] |

These two differ from Family 4: the code comments state, at design time, that the question genuinely
has no deterministic answer (a four-way judgment call among live possibilities, not a missing lookup).
Flagged here for completeness per the D17 spec's own enumeration criteria, not as a recommended
removal target; the coordinator should confirm this reading before excluding them from the D17 fix
lanes.

## Family 6: cited-host-gate (already fixed the same day, task 7.4)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/src/lib/agent/canonical-pipeline.ts:1639-1645` | brief-ground step | a brief cites a URL whose host is unknown to both the item's fetched pool and the source registry | Is this a real, citable source, and at what tier | Yes, via the SC-13 class table (`classTierForHost`, `fsi-app/src/lib/sources/host-authority.ts`) | `cited-host-gate` | `fsi-app/scripts/maintenance/resolve-cited-host-gate.mjs`, built the same day as this plan (ADR-030 rider task 7.4): registers a codified host through `registerSource`, routes an uncodified one to the `null-tier-host` worklist, and resolves the cited-host-gate flag itself either way | [CONFIRMED] |

Already remediated; included as the closest in-repo precedent for how Family 4 should be fixed (a
deterministic lookup first, a named worklist only for the genuine residue, and the triggering flag
always resolved, never left open on the lookup's account).

## Family 7: null-tier-host worklist (the terminal, legitimate case for an unclassifiable host)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/src/lib/agent/canonical-pipeline.ts:351-378` (`surfaceNullTierHosts`) | grounding step | a FACT span grounds to a host the SC-13 class table cannot classify, even after floor-first re-attribution | What tier does this host deserve | No by construction: `classTierForHost` returned null, which per SC-13 ruling is "never a guessed tier" | `null-tier-host` (aggregated per host, one row per host across items) | The operator's own batched review at hold-lift, and `resolve-cited-host-gate.mjs` (Family 6) which routes its own uncodified hosts into this SAME worklist rather than a second one | [CONFIRMED] |

This is the worklist D13/D14's own doctrine names as the honest terminal state for an unclassifiable
host ("an unknown host is a question, never a rejection"). Included because it does route to a
standing state per the D17 enumeration criteria, not because it looks like a defect.

## Family 8: error-body-gate-write (already has a resolver)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/src/lib/agent/canonical-pipeline.ts:336-342` | capture-store step | a fetched capture is refused at store time as a failed fetch (bot wall, 403, 404, Request-Access, nav shell) | Is there a real primary at this URL | Yes, by re-fetching through the transport escalation ladder (RD-14) at hold-lift | `error-body-gate-write` | `fsi-app/scripts/maintenance/resolve-error-body-gate.mjs` | [CONFIRMED] |

## Family 9: census_worklist validation-failed hold (already has a resolver)

| Site | Function | Trigger condition | Question | Derivable there? | Row field | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/mint/apply-mint-batch.mjs:701-710` | apply step | a mint payload fails the mint validator (`validation_failed`) | Can this payload mint once the named validator condition changes | Yes, on the next export once the underlying data changes; not a human judgment | `census_worklist.dryrun_disposition = 'hold'`, `hold_reason` names the validator | `fsi-app/scripts/mint/reopen-validation-holds.mjs` re-queues any row whose `hold_reason` starts `validation_failed:` back to `would_mint` | [CONFIRMED] |

## Family 10: acquire-primaries-batch, manual-capture hold (write-only orphan)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/remediation/acquire-primaries-batch.mjs:118-124` | batch acquisition | no floor-qualifying path-a primary found free among the item's candidate URLs | Is there an authoritative primary for this item at the required tier | Possibly, via the paid Browserless render leg of the transport escalation ladder (RD-14) or the bounded-alternative-search capability (remediation-discipline category 8), neither of which this one-shot 2026-07-16 script calls | `acquire-primaries-batch-2026-07-16` | None found: grepped the full repo for this created_by string and for `manual-primary-capture`; both appear only in this file. A write-only row with zero readers (remediation-discipline category 9, the half-slice defect) | [CONFIRMED] |

## Family 11: refetch-capped-worklist, manual-recapture-review hold (no dedicated resolver found)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/remediation/refetch-capped-worklist.mjs:81-88` (`holdRow`) | ADR-016 re-capture EXECUTE step | after a legacy storage-capped row is re-fetched at full length, the diff-on-recapture guard finds a previously grounded FACT span no longer matches the fresh capture (or the re-fetch itself is unreadable) | Which capture is authoritative, the old (capped) one or the fresh one, and should the item re-ground | Not obviously a lookup; this is closer to Family 1's legitimate ADR-016 case (a real content discrepancy) than to a proposer that simply found nothing | `refetch-capped-worklist` | Grepped the repo for this created_by string: the only other match is `fsi-app/scripts/maintenance/refetch-capped.mjs`, which is the CI dispatch wrapper that spawns this script as a subprocess, not a resolver that reads the flags it writes | [CONFIRMED] site and [CONFIRMED] absence of a dedicated resolver; [HYPOTHESIS] on whether this genuinely needs one or is correctly a Family-1-shaped open investigation already covered by `regen-quarantined.mjs`'s general sweep |

## Family 12: timeline-backfill, undateable-item flag

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/maintenance/timeline-backfill.mjs:108-140` (`buildUndateableFlagDescription` and the row it builds) | corpus backfill (task 6.1c, ADR-030) | none of the five deterministic date-derivation steps (title date, Federal Register URL date, legislation.gov.uk line, forward event, dateline) dates an item | What is this instrument's own date | The file's own comment says no: "no deterministic date source was found" | `timeline-backfill`, one row per run (`subject_type='system'`, `subject_ref='timeline-backfill'`), the full id list carried in `recommended_actions[0].ids` | `fsi-app/scripts/verify/population-report.mjs` reads the id list back for its "timeline coverage" metric (a reader, not a resolver); the recommended action itself, "manual_research_or_source_review", has no script that closes it | [CONFIRMED] |

This is a genuine residue after five deterministic steps, not a proposer that skipped deriving. It is
still, by the D17 (b) criteria, an integrity_flags row whose recommended_actions asks a person to
research or decide, with no closing mechanism. Whether ADR-030's "no item without some date" bar
should extend a sixth, weaker derivation step (a capture-text dateline scan already exists per the
plan text; a portal/registry page's own listing date as a last resort) or accept this residue as
honestly undated is a coordinator call, not a mechanical one this audit can make.

## Family 13: coverage-gap and anticipated-coverage flags (business judgment, likely legitimate)

| Site | Function | Trigger condition | Question | Derivable there? | created_by | Consumer | Status |
|---|---|---|---|---|---|---|---|
| `fsi-app/scripts/connections/analyze-corpus.mjs:281-291` | gap detection (U2) | the corpus clustering step finds a coverage gap of a given type | Is dedicated coverage of this gap warranted | No; this is a product-scope decision, not a fact lookup | `createdBy(GAP_NAMESPACE, g.type)` = `flywheel-gap:<type>` | Reflected (opened/resolved) each run by `reflectFlags`; no auto-adopt path, by design | [CONFIRMED] |
| `fsi-app/scripts/connections/analyze-corpus.mjs:293-306` | anticipated-coverage (U5) | a scheduling source suggests an obligation is coming | Is dedicated coverage of this upcoming obligation warranted before the date arrives | No, same reason | `createdBy(ANTICIPATE_NAMESPACE, t.reason)` = `flywheel-anticipate:<reason>` | Same reflection mechanism | [CONFIRMED] |

Recommended_actions text is, verbatim, "Confirm whether dedicated coverage of this upcoming
obligation is warranted before the date arrives." Included per the enumeration criteria; this reads
as the `design_drift`-shaped case CLAUDE.md's own integrity-flags contract describes as the correct
use of the queue (a decision only intended use / business judgment can make), not the D15/D13-shaped
case (a question the system itself could answer but didn't try).

## Family 14: run-log-only flags (already fixed the same day, task 7.1), and the per-item rows carved out of that fix

| Site (writer) | Site (resolver) | Trigger / carve-out | Question | Status |
|---|---|---|---|---|
| Not in current committed scripts. Per `fsi-app/scripts/maintenance/close-run-logs.mjs:8-20`, the `authorship-shard-N` rows were written by the pre-consolidation (before 2026-08-08) 12-shard authorship fleet charter's own CLOSE step (`docs/runbooks/fleet-charters/authorship-worker.md`); `citation-harvest*` batch-summary rows and `legacy-remediation` RUN SUMMARY rows were written by their own named fleet charters/lanes, none of which remain as live scripts in this worktree | `fsi-app/scripts/maintenance/close-run-logs.mjs` (built the same day as this plan, task 7.1, ADR-030 rider) | Resolves any row matching the charter's own documented CLOSE-step vocabulary (an allowlist, not a denylist, after a reviewer-caught false-positive on a genuine per-item blocker) | "Is this row informational only" | [CONFIRMED] writer location is historical/undocumented-in-code; [CONFIRMED] resolver exists and is allowlist-shaped |
| n/a | n/a | Carved OUT of the above resolver by design: an `authorship-shard-N` row whose description reads as a declarative per-item blocker (the file's own worked example: "AUTHORSHIP-SHARD-8 BLOCKER: item needs operator decision on role placement, novel case") stays open | Should this entity's role be reclassified | Per CLAUDE.md's own doctrine and the operator's standing "no legal role determination" rule, entity-to-defined-role matching is a legal determination and correctly routes to a person, not a lookup | [CONFIRMED] carve-out exists; likely a legitimate exception, not a D17 target |
| n/a | n/a | Also carved OUT: a `legacy-remediation` row whose description is a per-item PARKED note (not a RUN SUMMARY) stays open, explicitly deferred by the same file's header to "task 7.3 resolves those from their stored pools" | Can this item's stored pool re-ground it | Yes, per the header's own claim, via task 7.3 (not read as part of this D17 pass; a separate task in the same build plan) | [HYPOTHESIS] that task 7.3 covers the full PARKED backlog; not independently verified here |

## Family 15: flywheel-signal, undecided-forever (already fixed the same day, task 7.2; historical precedent)

Before task 7.2 (ADR-030 rider, same day as this plan), an "undecided" title-entity-link signal
candidate that kept reproducing the same non-decisive score sat open forever: the pre-7.2 reflect
step's "already open, unchanged" bucket never closed a still-reproducing finding once opened. Task
7.2 changed the rule so an undecided pair closes with `resolution_note = "below the decisive
threshold, no edge; score <s>"` (a non-edge is itself a decision). `fsi-app/scripts/maintenance/
resolve-signals.mjs` (built the same day) drains the pre-7.2 backlog under the corrected rule. Cited
here as direct, same-repo, same-day precedent that the D15/D17 pattern (a decider that treats "no
positive answer" as "leave it open" rather than "record the negative answer and close") is a
recognized, recurring class the coordinator has already fixed twice this session (Families 6, 8, 9,
14 and 15) before this enumeration. Family 4 (classification zero-proposal) and Family 12
(timeline-backfill undateable) are the two live instances of the same class this pass found still
open. Status: [CONFIRMED], not a live site (superseded).

## Historical precedent: two prior human-resting-states, already retired

Two previous instances of exactly this class were found and removed in earlier sessions, cited here
because they show the coordinator's fix pattern for a genuine human-tick state (delete it, do not
leave a smaller one), not because they are live:

- `pending_human_verify` was a third `provenance_status` value: migrations 112/114/115/116/118/119
  routed a CRITICAL/HIGH item that passed criteria 1-5 to `pending_human_verify` instead of
  `verified` (criterion 6, "a human ticks the box"). Migration 121, titled
  `uniform_promotion_no_human_tick`, removed this branch outright: "CRITICAL/HIGH no longer route to
  'pending_human_verify'; the task-1.12 human tick is removed." [CONFIRMED, read migration 121's own
  header].
- `hold_resolution_queue` (and its four `hrq_*` PL/pgSQL functions) was an earlier hold queue, dropped
  by migration 219 on 2026-07-19 and superseded by `drain_worklist`; the four out-of-repo `hrq_*`
  functions that still referenced the dropped table were found and retired by migration 254.
  [CONFIRMED, read migration 254's own header].

## Summary table

| Family | Shape | Live today | Resolver exists | Recommended coordinator attention |
|---|---|---|---|---|
| 1. Provenance-gate quarantine | Legitimate open investigation | Yes | Yes (`regen-quarantined.mjs`, RD-6) | None; working as designed |
| 2. Provisional-source reject (D13) | Absent-check read as reject | Yes | Fix already planned (L9) | Already scheduled |
| 3. Tag zero-proposal (D15) | Proposer asks human on empty derivation | Yes | Fix already planned (L10) | Already scheduled |
| 4. Classification zero-proposal | Same shape as D15, different subject | Yes | No (decider skips, never resolves) | New: same-shaped fix as D15 |
| 5. Classification drift/anomaly | Advisory judgment call, by design | Yes | None (by design) | Confirm exemption, else fix |
| 6. Cited-host-gate | Was open, now fixed same day | Yes | Yes (`resolve-cited-host-gate.mjs`) | None; already fixed |
| 7. Null-tier-host worklist | Legitimate terminal worklist | Yes | Operator batched review + `verifyCandidate` | None; working as designed |
| 8. Error-body-gate-write | Was open, now fixed | Yes | Yes (`resolve-error-body-gate.mjs`) | None; already fixed |
| 9. census_worklist validation hold | Closed loop | Yes | Yes (`reopen-validation-holds.mjs`) | None; working as designed |
| 10. Acquire-primaries manual hold | Write-only orphan | Yes (one-shot script) | No reader anywhere | Delete the writer, or wire a resolver, coordinator's call |
| 11. Refetch-capped manual hold | No dedicated resolver found | Yes | No | Confirm whether Family 1's general sweep already covers it |
| 12. Timeline-backfill undateable | Reader exists, no resolver | Yes | Partial (metric reader only) | Coordinator call on a sixth derivation step vs honest residue |
| 13. Coverage-gap / anticipate | Business judgment, by design | Yes | None (by design) | Confirm exemption |
| 14. Run-log-only + carve-outs | Was open, now fixed same day | Yes | Yes (`close-run-logs.mjs`), except two named carve-outs | Carve-outs likely legitimate; verify task 7.3 covers PARKED backlog |
| 15. Flywheel-signal undecided | Historical, fixed same day | No (superseded) | Yes (`resolve-signals.mjs`) | None; cited as precedent |

## SQL for the coordinator

Every query below is a read-only count against live tables; none was run in this session (no database
access from this worktree).

```sql
-- Family 1: live quarantined items and open trigger-created flags
select count(*) from intelligence_items where provenance_status = 'quarantined';
select count(*) from integrity_flags where created_by = 'set_provenance_status_trigger' and status = 'open';

-- Family 2 (D13): provisional_sources reject population
select count(*) from provisional_sources where status = 'rejected' and accessibility_verified = false;

-- Family 3 (D15): tag zero-proposal flags
select count(*) from integrity_flags where created_by = 'flywheel-tag:empty-signature' and status = 'open';

-- Family 4: classification zero-proposal flags (PROPOSALS_JSON: [] marks the zero-proposal case)
select count(*) from integrity_flags
  where created_by = 'flywheel-axis:source-classification' and status = 'open'
    and description like '%PROPOSALS_JSON: []%';

-- Family 5: classification drift and anomaly flags
select count(*) from integrity_flags where created_by = 'flywheel-axis:source-drift' and status = 'open';
select count(*) from integrity_flags where created_by = 'flywheel-axis:item-anomaly' and status = 'open';

-- Family 6: cited-host-gate flags remaining open after the same-day resolver
select count(*) from integrity_flags where created_by = 'cited-host-gate' and status = 'open';

-- Family 7: null-tier-host worklist size
select count(*) from integrity_flags where created_by = 'null-tier-host' and status = 'open';

-- Family 8: error-body-gate-write flags remaining open
select count(*) from integrity_flags where created_by = 'error-body-gate-write' and status = 'open';

-- Family 9: census_worklist validation-failed holds
select count(*) from census_worklist where dryrun_disposition = 'hold';

-- Family 10: acquire-primaries-batch manual-capture holds
select count(*) from integrity_flags where created_by = 'acquire-primaries-batch-2026-07-16' and status = 'open';

-- Family 11: refetch-capped-worklist manual-recapture-review holds
select count(*) from integrity_flags where created_by = 'refetch-capped-worklist' and status = 'open';

-- Family 12: timeline-backfill undateable-run rows (one row per run; check the ids array length, not just row count)
select id, jsonb_array_length(recommended_actions -> 0 -> 'ids') as undateable_count
  from integrity_flags where created_by = 'timeline-backfill' and status = 'open';

-- Family 13: coverage-gap and anticipated-coverage flags
select count(*) from integrity_flags where created_by like 'flywheel-gap:%' and status = 'open';
select count(*) from integrity_flags where created_by like 'flywheel-anticipate:%' and status = 'open';

-- Family 14: run-log-only backlog remaining after close-run-logs.mjs, and the carved-out per-item rows
select count(*) from integrity_flags where created_by like 'authorship-shard-%' and status in ('open','in_review');
select count(*) from integrity_flags where created_by = 'legacy-remediation' and status in ('open','in_review') and description like 'RUN SUMMARY%';
select count(*) from integrity_flags where created_by = 'legacy-remediation' and status in ('open','in_review') and description not like 'RUN SUMMARY%';
select count(*) from integrity_flags where created_by like 'citation-harvest%' and status in ('open','in_review');

-- Family 15: flywheel-signal backlog remaining after resolve-signals.mjs (expect near zero)
select count(*) from integrity_flags where created_by like 'flywheel-signal:%' and status = 'open';
```

## What this file did not do

No code was changed. No database was queried. The coordinator's own fix specification (D17 step 2,
per-site: resolve at the site, record a decision and close, or delete the writer) is out of scope for
this pass and is not attempted above.
