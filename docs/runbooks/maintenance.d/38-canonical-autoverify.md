## 38. `canonical-autoverify`

**New this runbook, lane CANONICAL-AUTOVERIFY, 2026-09-06; ruling CONFIRMED same day, lane
CANONICAL-AUTOVERIFY-2.** Operator ruling (verbatim): "the problem with this is that its a human process,
if the web crawl surfaced a secondary location for the source it should also confirm that source is
accurate and not wait on human intervention. it has the tools to review and find sources to start, so its
completely capable of doing that again for the secondary source or new source location." **Verification of
a replacement source location is automatic, never a human process - there is no `needs_individual_review`
outcome at all.** The first version of this step still left two classes waiting on a human (an ambiguous
candidate host with no codified authority tier; a downgrade the step could not prove safe); the ruling was
confirmed the same day specifically to close both.

**Purpose**: auto-verify `canonical_source_candidates` rows (`decision='pending'`) - the queue section 14
(`review-apply-canonical-candidates`) can only ever auto-resolve when the candidate URL already matches a
registered source; every genuinely NEW replacement source location the web crawl found used to be routed to
a human. This step performs the same verification a human reviewer would and rules the row itself, all the
way to a terminal outcome: **reachability** (the SAME $0 polite-fetch + `captureDocument` path
`scripts/maintenance/provenance-heal.mjs`'s `buildHealDeps` already wires for `heal-provenance.mjs` -
`makePoliteFetch({fetchImpl:fetch})` at 1 req/s through `followUpgradingRedirects` into
`scripts/mint/export-census-rows.mjs`'s `captureDocument`, reshaped by this step's own
`makeCanonicalFetchCandidate` adapter into the `{status,text,error,host,path}` shape `decideRow` expects;
**lane CANONICAL-AUTOVERIFY-3, 2026-09-07** - the step originally wired `deps.fetchCandidate` to
`src/lib/sources/canonical-fetch.mjs`'s `browserlessFetch`, a paid rendering service with no key anywhere
in `.github/workflows/maintenance.yml` by design (CLAUDE.md's $0 rule); maintenance run 34069709848
(`mode=dry`) confirmed the defect live - all 16 pending rows came back `deferred: fetch failed:
BrowserlessError: BROWSERLESS_API_KEY not configured`, nothing verified. Browserless is not referenced by
this step at all, and a "render with Browserless if a key is present" fallback is explicitly not wanted;
dead codes 404/410/5xx reject, a network error/DNS timeout/connection reset that never completed the
request **defers** instead - see Outcomes below) → **page class** (a small pure classifier rejecting login/sign-in
gateways, `/about` pages, directory/index listings, press releases on a substantive missing-link item, and
aggregator/tracker/directory datacards when the item's own subject IS the institution the datacard merely
lists - every rule cites the live pending row that motivated it, see the module's own header) → **content
proof** (the item's FACT source_spans located verbatim via `scripts/mint/heal-provenance.mjs`'s
`locateSpanInText`, when it has any; every one of the 16 live pending rows read 2026-09-06 carries ZERO
FACT claims, so rule 3's own named fallback - the institution name plus the item's subject phrase both
located, with a word-overlap fallback for a title's spacing/punctuation drift from the page's own prose -
is what actually decides every row in practice) → **authority** (`src/lib/sources/host-authority.mjs`'s
codified tiers + `defaultTierForHost` plus a live-registry lookup keyed the same way `registerSource`
dedups; a permanently-unregistered host class always rejects; an ambiguous host with no deterministic
codified tier no longer waits on a human - it **accepts, registered PROVISIONAL at the deterministic
sub-floor default tier** (the same `status: 'provisional'` the registry already mints an unclassified
machine-discovered citation host at, `source-growth.ts`'s `registerCitedSources` - never a guessed ACTIVE
tier); a different-host candidate may never downgrade authority below the item's actually-**linked**
current source's tier (exact `current_source_id` lookup, never a host-text guess - a `missing_link` row
has no linked current source at all, so there is nothing to protect and no downgrade question is even
asked) unless that current source is CONFIRMED dead, 404/410/5xx/DNS or a fetch error - a 403/WAF block is
explicitly NOT "dead" and **rejects the candidate outright** instead of licensing the downgrade: the
current citation stands, a wall is not a dead link).

**Upstream, reused (never re-implemented)**: `scripts/mint/export-census-rows.mjs`'s `captureDocument` +
`followUpgradingRedirects` + `makePoliteFetch` (the $0 polite-fetch path, the SAME one
`provenance-heal.mjs`'s `buildHealDeps` wires for `heal-provenance.mjs` - never
`src/lib/sources/canonical-fetch.mjs`'s paid `browserlessFetch`, retired from this step lane
CANONICAL-AUTOVERIFY-3, 2026-09-07), `src/lib/sources/access-wall.mjs`'s `detectAccessWall` (wall
detection, folded into reachability),
`scripts/mint/heal-provenance.mjs`'s `locateSpanInText` (content proof), `src/lib/sources/
host-authority.mjs`'s `codifiedTierForHost`/`classTierForHost`/`permanentlyUnregisteredClass`/
`defaultTierForHost` (authority), `scripts/lib/db.mjs`'s `registerSource` (the ONE source-registration
function - same one heal-provenance's STEP SOURCE uses, including its own `extra` pass-through - never a
new registration mechanism, never a new provisional/queue table) and `guardedUpdateByIds` (both writes).
$0 - no LLM call anywhere in this module.

**Accept path** (two writes, matching `bulk-approve/route.ts`'s and section 14's own approve shape):
`canonical_source_candidates.decision='approved'` + `promoted_to_source_id` (an already-registered host's
existing source id, reused via `registerSource`'s own institutionKey dedup - never a duplicate row; for a
provisional accept, a freshly-registered row at `defaultTierForHost`, `status: 'provisional'`) +
`verified`/`verified_status_code`/`verified_content_excerpt`; `intelligence_items.source_id`/`source_url`
repointed to the candidate either way. **Reject path**: `canonical_source_candidates.decision='rejected'`
+ `reviewer_notes` naming the exact stage and reason (`auto: reject - <reason>`; a walled-current-source
downgrade names it verbatim: "current source reachable behind an access wall; candidate is a different
publisher"); `intelligence_items` is never touched. **Deferred** (transient fetch error only - network
error, DNS timeout, connection reset that never completed the request): the row is left `decision='pending'`
untouched, `reviewer_notes` names the fetch error, and it is retried automatically the next dispatch - not
a verdict on the candidate, not a human outcome. **Reviewer identity**: `reviewer_id` is left `null` (never
set) - the same convention `scripts/review/lib/canonical-candidates.mjs`'s own `patchForDecision` already
uses for every other machine-applied decision on this table; there is no automated-actor id anywhere else
in this codebase to reuse, and inventing one would be a fabricated identity CLAUDE.md rule 2 forbids.

**What it does NOT do**: never invents/guesses an ACTIVE tier for an ambiguous host (SC-13 - it registers
that case PROVISIONAL instead, at the deterministic sub-floor default, never a wait); never downgrades
authority below a genuinely LINKED current source without proof that source is dead; never touches a row
whose `decision` is not `pending` (bounded, paginated read via `readAll`'s own match, and
`guardedUpdateByIds`'s `applyMatch` re-checks on write - idempotent on re-run by construction, so a
re-run's only remaining `pending` rows are ones a prior run deferred). `review-apply-canonical-candidates`
(section 14) is UNCHANGED and keeps working for a group ruling an operator has already taken (its own, separate
`needs_individual_review` fallback - a group ruled "accept" naming a candidate needing a brand-new source
with no existing registry match at all - is untouched by this ruling); this step is additive, not a
replacement for that path - `scripts/review/lib/canonical-candidates.mjs`'s own digest recommendation
labels a mixed group `auto-verify` (not `uncertain`), since this step is what actually resolves those
rows, all the way to approved/rejected, never a human.

**tier-opinions (section ?, `tier-opinions.mjs`)**: the deterministic second look for a provisional accept's
sub-floor tier. It scans the WHOLE `sources` table with no status filter (`readAll("sources", "id, url,
base_tier")`, no `match`) - a `status='provisional'` row this step registers is scanned on
`tier-opinions`'s very next dispatch exactly like an `active` row, no selection change needed (confirmed,
`tier-opinions.test.mjs`'s own provisional-source test). If the host later classifies to a codified tier
that disagrees with the registered default, `tier-opinions` records the opinion (`opinion_source:
'host_class_table'`) for the admin review surface - it never writes `base_tier` itself.

**Ruling**: none by token - not gated on an `arg`; this is a standing, always-on verification pass over
whatever the queue holds each time it runs.

**Dispatch**: `mode=dry` fetches and classifies every pending row (candidate AND, when present, the
item's linked current source), writes nothing - the summary's `verdicts` array shows every row's decision
+ reviewer_notes. `mode=apply` writes through `guardedUpdateByIds` (rule 015) for every `approved`/
`rejected` row; a `deferred` row is left untouched (retried next dispatch) - there is no other row left
'pending' by design.

**Artifact / read back**: `summary.json`'s `counts` (`pending_read`/`approved`/`rejected`/`deferred`),
`verdicts` (dry and apply), and - apply mode only - `read_back`
(`rows_named`/`rows_now_live`/`approved_now`/`rejected_now`/`still_pending`, re-read via `readAllByIds`;
`still_pending` should be 0 unless a `deferred` row's fetch failed this run). Confirm against `SELECT
decision, count(*) FROM canonical_source_candidates WHERE id = ANY(<row ids>) GROUP BY decision`.

**Registration**: `intelligence_items` is a harness/flywheel shared-8 table - `docs/inventories/
shared-dataset-ownership.md`'s allowlist gains a `scripts/maintenance/canonical-autoverify.mjs` row for
its `source_id`/`source_url` repoint on an accepted candidate.

**First dispatch** (coordinator): `mode=dry`, `step=canonical-autoverify`, no `arg` - a live read of every
pending row's verdict against the real registry and real fetched content, no write either way, before the
first `mode=apply` run. Follow with `mode=dry`, `step=tier-opinions` (then `mode=apply`) to give any
freshly-registered provisional source its class-table opinion.

---

