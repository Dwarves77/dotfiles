## 46. `resolve-provisional-sources`

**Purpose**: resolve pending `provisional_sources` rows (489 with `status='pending_review'` since
April) and `sources` rows with `status='provisional'` (563) -- Part 7 task 7.5 item 1. Retires the
human-approval half of the ruled-digest path (`fsi-app/scripts/review/build-review-digests.mjs` +
`fsi-app/scripts/review/apply-provisional-sources.mjs`, keep/suspend from an operator ruling file; the
apply script was deleted by G6-GATES 2026-10-05, see section 13 RETIRED) for every
row the deterministic rule below can classify.

**Upstream**: `scripts/maintenance/resolve-provisional-sources.mjs`, reusing (never a second copy):
`existingTierForHost` (`scripts/maintenance/canonical-autoverify.mjs`, live-registry institution-key
lookup, rule a), `classTierForHost`/`decidePoolHostRegistration` (`src/lib/sources/host-authority.ts`,
the SC-13 class table, rule b), `buildPromotedSourceRow`/`findExistingSourceByCanonicalUrl`
(`src/lib/sources/promote-provisional.ts`, extracted THIS TASK out of
`/api/admin/sources/promote/route.ts`'s approve arm so the route and this step share one promoted-row
shape -- the route now calls the same module), and `checkVerticalFitGate`
(`src/lib/sources/vertical-fit-gate.ts`, the same off-vertical block the route runs).

**The rule, per row** (defect fix D13, docs/plans/defect-fix-plan-2026-09-12.md, 2026-09-12 -- rule (c)
below is REMOVED): (a) the host's registrable domain matches an existing ACTIVE institution in
`sources` -> promote/activate at the institution's canonical tier; (b) no institution match, but the
SC-13 class table resolves a tier -> promote/activate at that tier; (b2) no class-table tier, but a committed host verdict places the host -> promote/activate at the verdict
class's table tier; (d) otherwise (no institution/class/verdict match) -> worklist as residue, "awaiting host
verdict batch". Accessibility never decides promote vs. worklist. What accessibility DOES do: the
PROMOTED `sources` row's own `status` carries the fact already on record -- `active` when
`sources.fetch_status` is ok or null, `inaccessible` when `fetch_status='error'` (a WALL such as
`cdn_block`/`blocked` is NOT dead, "a wall is not a dead link", the same posture
`canonical-autoverify.mjs` already takes, so a wall-fetch_status row still promotes to `active`). A
`provisional_sources` row promoted via a NEW `sources` INSERT has no `fetch_status` of its own (the
column does not exist on that table) and so always resolves to `active`.
`provisional_sources.accessibility_verified` is never read as evidence of anything -- its INSERT
default is `false` on every one of the 497 live rows, meaning no accessibility check has ever actually
run against any of them; reading that default as "dead" was rule (c)'s own defect (dry run 34724257806
rejected 248 real institutions -- irishstatutebook.ie, transport.gov.scot, theccc.org.uk, dma.dk, cre.fr,
belastingdienst.nl, bmluk.gv.at, mindop.sk -- on that absence alone). Under standing rules 16/18 and
ADR-030 an unreachable URL on a real institution is a STATUS, never a rejection, and an unknown host is
a QUESTION (the worklist), never a rejection. The vertical-fit gate still runs on every
`provisional_sources` promote-arm candidate; a gate refusal downgrades a would-be promote to a reject,
citing the gate's reason -- this is now the ONLY decline path this step has, for either table (there is
no vertical-fit gate on the `sources`-table promote path, so a `sources` row can no longer decline
through this step at all).

**D14 residue ruling (coordinator, 2026-09-13, defect-fix-plan-2026-09-12.md D14, "Residue ruling")**
extended rule (b) with 8 deterministic name-keyword rules run over the row's OWN stored `name` plus its
host, in fixed precedence: legal publisher (T1), academic (T4), association/standards body (T4),
government (T2, host-label-anywhere or an institutional-noun name, with a think-tank exclusion), news/
press (T7), analysis (T6, incl. Big-4/advisory hosts), **`company`** (T7, a NEW class: any host with a
stored name and no rule 1-6 match -- its own site is a primary only for its own announcements, never
passes an authority floor, T7 weight 0 in the citation network), and worklist (rule 8, a host with NO
stored name at all -- the true residue). `classTierForHost`'s second, optional `name` parameter carries
this; this step threads each row's own `name` column into rule (b) so the `company` class closes most of
the corporate/unnamed residue the D14 evidence surfaced, rather than leaving it worklisted.

**Write shapes differ by table** (the row already exists for `sources`, so promote/worklist are
UPDATEs there, never a second INSERT):
- `provisional_sources` promote -> INSERT a new `sources` row (via `buildPromotedSourceRow`, with the
  SAME Q10 canonical-URL dedup guard the promote route runs -- a match reuses the existing row instead
  of minting a duplicate) + `status=PROVISIONAL_SOURCES_PROMOTED_STATUS` ("promoted", exported from
  `promote-provisional.ts`), `promoted_to_source_id`, `reviewed_at`, `reviewer_notes`.
- `provisional_sources` reject -> ONLY from the vertical-fit gate downgrading a would-be promote
  (defect D13: rule c itself no longer produces a reject) -> `status=PROVISIONAL_SOURCES_REJECTED_STATUS`
  ("rejected", same module), `reviewed_at`, `reviewer_notes` naming the gate's reason.
- `provisional_sources` worklist -> `status='needs_more_data'` (the one CHECK-legal value judged closest
  to "awaiting a class-table ruling"; no dedicated value exists in the tracked vocabulary, a documented
  judgment call; change `PROVISIONAL_WORKLIST_STATUS` in the script if the coordinator rules otherwise),
  `reviewed_at`, `reviewer_notes`.
- `sources` (status='provisional') promote (defect D13 fix) -> `status=sourcesStatusForPromote(row)`
  ("active" when `fetch_status` is ok or null, "inaccessible" when `fetch_status='error'`, never a
  reject), `base_tier`/`effective_tier` stamped to the resolved tier (never `tier_override`, which stays
  reserved for an explicit operator act).
- `sources` reject -> REMOVED (defect D13): there is no vertical-fit gate on this table's promote path,
  so a `sources` row can no longer decline through this step at all. `rejectSourcesRow`/
  `SOURCES_REJECT_STATUS` (`status='suspended'` WITH the decline reason appended to `notes`, defect fix
  D4, review-7.5.md finding 3) remain defined as the on-row-reason mechanism for a future decline path
  on this table, currently unreached from `main()`.
- `sources` worklist -> status stays `'provisional'` (already the awaiting-decision resting state for
  this table, no value is invented); the equivalent record is appended to `notes` instead of
  `reviewer_notes`/`reviewed_at`, which this table does not have.

**Unclassifiable hosts merge into the SAME per-host `null-tier-host` worklist flag** (rule d) --
defect fix D3 (docs/plans/defect-fix-plan-2026-09-12.md, review-7.5.md finding 2, CONFIRMED): the
original version built a SECOND, non-idempotent mechanism (`buildBatchWorklistFlag`, one row inserted
per RUN, re-read every run since `readPendingProvisional()`'s own query includes the worklisted
status, so a still-unclassifiable host produced a brand-new open `integrity_flags` row every
dispatch). That mechanism is DELETED. `planHostDecision`/`buildNullTierHostWrite` (extracted, D3, into
the shared `src/lib/sources/null-tier-host-worklist.mjs`, out of `resolve-cited-host-gate.mjs`, names
and signatures unchanged) now do a read-modify-write per host: `readNullTierFlag(host)` -> merge via
`buildNullTierHostWrite` -> insert (new host) or update (existing open flag) -- the SAME mechanism
task 7.4's `resolve-cited-host-gate` already uses, never a second worklist. The per-item key
`buildNullTierHostWrite`'s aggregate merges on is a synthetic `${table}:${id}` (there is no
intelligence_items row backing a provisional_sources/sources record), so a repeated resolve of the
SAME row contributes to the aggregate exactly once. Idempotent by construction and proven by test (a
second `main({mode:"apply"})` run over the same still-unclassifiable input inserts 0 new flag rows and
updates the existing per-host row's contribution list instead).

**Host verdicts, bias tags and the admin override (lane S1-B, 2026-10-04).** Nothing in this step waits
on a person any more.
- **Rule (b2), host verdicts.** A host the built-in rules (a, b) leave unplaced is looked up in the committed
  verdict batches under `scripts/maintenance/host-verdicts/` (`host-verdicts-NNN.json`, later batch wins per
  host; README and `schema.json` there). A verdict names a CLASS from the existing class table
  (`HOST_CLASS_TIER` in `host-authority.ts`), never a tier number; the tier is read from the table, and the
  loader rejects an unknown class or a `tier` field per entry (reported in `summary.host_verdicts.rejected`,
  never a block). `permanentlyUnregisteredClass` hosts still never register. The built-in rules run first, so a
  verdict only places what they decline. A host still unplaced after the batches stays recorded as residue,
  reason "awaiting host verdict batch", and the run exits 0. When a host now resolves (rule a, rule b or a
  verdict), its open `null-tier-host` flag is resolved by this step with a note naming the rule or the
  verdict batch (apply only; counted in `summary.host_verdicts.flags_resolved`).
- **Export mode (read-only).** `node scripts/maintenance/resolve-provisional-sources.mjs --arg export-unplaced
  --out <dir>` writes `<dir>/unplaced-hosts.json` (host, stored names, discovered_via) and writes nothing to
  the database whatever `--mode` says; a session lane classifies from that file into the next batch. The
  `enumerate-unclassified-hosts` step (46a) writes the same file through the same shared loop
  (`collectUnresolvedRows`).
- **Bias tags on machine promotion.** A newly inserted `sources` row carries the Haiku `bias_tags` cached on
  its `provisional_sources` row, written through `writeBiasTags` and the guarded batched insert (a reused
  existing source is skipped). Tags at 0.65 and above are stored adopted, as `haiku_auto_high_confidence`,
  with the real confidence kept; below 0.65 is discarded. No stored state waits for a confirm click (migration
  092's CHECK admits no other automatic value, so no migration). The admin PATCH
  `/api/admin/sources/[id]/bias-tags` stays as an optional override (confirm or remove) on adopted and legacy
  pending rows. `summary.bias_tags` counts written, discarded, failed; a failure never fails the promotion.
- **Admin override respected.** The `sources`-table activation skips `base_tier` and `effective_tier` on any
  row whose `tier_override` is set; status may still change (`sourcesActivationPatch`).

**Ruling**: ADR-030 rider / defect-fix-plan-2026-09-12.md D2/D3/D4/D13. Not gated by a separate `arg`
token. $0, no LLM, no fetch -- every check is the deterministic class table and the live-registry
lookup; the STORED `fetch_status` column (never `accessibility_verified`, defect D13) is consulted only
to stamp the promoted `sources` row's own status, never to gate promote vs. worklist.

**Status vocabulary is now CHECK-legal, live** (defect fix D2): migration 317
(`317_provisional_sources_status_promoted.sql`, applied live by the coordinator before this code
merged, per standing rule 3) widened `provisional_sources_status_check` to
`pending_review, confirmed, rejected, needs_more_data, promoted`. Before that migration, the promote
route's `status: "promoted"` write had never succeeded against the live constraint (D2 evidence: 0
promoted rows, 0 rows with `promoted_to_source_id`, live SQL). Both write sites (this script, and the
promote route) now reference the SAME exported constants
(`PROVISIONAL_SOURCES_PROMOTED_STATUS`/`_REJECTED_STATUS`, `src/lib/sources/promote-provisional.ts`)
rather than independent literals, and a test in that module's own test file pins all five CHECK values
as the contract (`promote-provisional.test.mjs`, with a comment naming the constraint).

**Dispatch**: `mode=dry` classifies every row (rule a/b/d; rule c is removed, D13) and reports counts + a
20-row sample per outcome; writes nothing. Dry mode's `reject` count is always 0 for both tables --
the vertical-fit gate, the only remaining decline path, runs only on `apply` (against the live
registry), so a dry run cannot predict it. `mode=apply` performs the promote/worklist write per row
(plus the occasional gate-downgraded reject on `provisional_sources`), merging any worklisted host into
its per-host `null-tier-host` flag.

**Artifact / read back**: `summary.json`'s `counts.{promote,reject,worklist}`, `samples`, and
`read_back.{provisional_sources_pending_review_remaining,sources_provisional_remaining}`, plus
`worklist_flag_writes.{inserted,updated}` -- confirm against `SELECT count(*) FROM provisional_sources
WHERE status='pending_review'` and `SELECT count(*) FROM sources WHERE status='provisional'` (both
should shrink by the promoted+rejected count; the worklisted count moves to `needs_more_data` / stays
`provisional`), plus `SELECT * FROM integrity_flags WHERE created_by='null-tier-host' AND subject_ref
IN (<the worklisted hosts>)` for the merged per-host flags (never `created_by='resolve-provisional-
sources'`, which no longer writes any flag of its own).

---

