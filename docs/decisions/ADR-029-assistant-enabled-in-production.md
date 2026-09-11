---
id: ADR-029
title: The Intelligence Assistant (Ask mode) is ON in production, by ruling
status: accepted
date: 2026-09-11
scope:
  - "fsi-app/src/app/api/ask/route.ts"
  - "fsi-app/src/app/api/workspace/bootstrap/route.ts"
  - "fsi-app/.discipline/assistant-spend-gate.test.mjs"
  - "fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md"
  - "Vercel carosledge project, Production environment (ASSISTANT_ENABLED)"
supersedes: null
related:
  - PR #478
  - "session-log Addendum 31 and Addendum 32 (2026-08-28)"
  - RD-31-operator-priced-spend
  - RD-32-data-existence-before-acquisition
  - ADR-020-sustainability-first-vertical-scope
---

## Context

Operator, 2026-09-09, verbatim: "actually turn the AI on, we just wont use it"; and, on being asked
again: "you shut it off you can turn it on." Operator, 2026-09-11, verbatim: "is fixing the search and
ai panel in this work tree, it should be." Three lanes before this one read the same repo state and
refused to flip `ASSISTANT_ENABLED`, citing PR #478, session-log Addendum 32, and invariant RD-31. This
ADR is the ruling that resolves the flip, and its Consequences section states, for each of those three
citations, exactly why it does not forbid what the operator has now twice directed.

**Facts, re-verified against master 5e891abd, not restated from memory:**

- `fsi-app/src/app/api/ask/route.ts:28` - `const ASSISTANT_ENABLED = process.env.ASSISTANT_ENABLED === "true";`
  Strict equality against the literal string `"true"`. Unset, empty, `"1"`, `"yes"`, and any typo all
  read OFF.
- `fsi-app/src/app/api/ask/route.ts:153-158` - the refusal (`if (!ASSISTANT_ENABLED) return ... 503 ...`)
  runs before the `ANTHROPIC_API_KEY` check and before any code path that can reach a paid call.
- `fsi-app/src/app/api/workspace/bootstrap/route.ts:83` - `const assistantEnabled = process.env.ASSISTANT_ENABLED === "true";`
  read fresh on every request (not cached at module scope), surfaced to the client at
  `route.ts:85`'s payload.
- `fsi-app/src/components/ui/CommandBar.tsx:121` - `const assistantEnabled = bootstrap.data?.assistantEnabled === true;`
  gates Ask mode in the command bar (`:237` `askDisabled = mode === "ask" && !assistantEnabled`).
- `fsi-app/.discipline/assistant-spend-gate.test.mjs:33-64` - four tests that pin the strict `=== "true"`
  comparison, the refusal branch, and (the load-bearing one) that the gate's source offset precedes
  every `setSpendTicket(`/`spendStreamRaw(` call in the route, so a gate downstream of the paid call
  cannot pass while spend still happens.
- `fsi-app/src/app/api/ask/route.ts:484` - `setSpendTicket({ purpose: "ask-assistant (/api/ask user question)" });`
  immediately before the `spendStreamRaw` call at `:485`. This is the existing attribution: every
  `/api/ask` spend call is telemetered under that exact purpose string via `spend-client.ts`'s
  `recordSpendCall` (`spend-client.ts:75`), the same chokepoint every other sanctioned caller uses (F15).
- `/api/ask` is listed in `fsi-app/.claude/CLAUDE.md`'s permitted-live-Claude-API-calls table:
  `claude-sonnet-4-6`, 60/min/user, no per-workspace quota.

## Decision

**The Intelligence Assistant (Ask mode) is ON in production.** `ASSISTANT_ENABLED=true` in the Vercel
`carosledge` project, Production environment, is the single control. This ADR changes no code:

- The fail-closed gate (`route.ts:28`, `:153-158`) is unchanged. It stays a strict `=== "true"` read
  with the refusal ordered before every paid call.
- `assistant-spend-gate.test.mjs` is unchanged and keeps enforcing exactly that shape; this ADR does
  not weaken, bypass, or delete it.
- `bootstrap/route.ts:83` and `CommandBar.tsx:121` are unchanged; they already read the flag correctly
  and will reflect the flip on the caller's next bootstrap fetch, no redeploy of those files required.
- Spend attribution is already correct and sanctioned: every `/api/ask` call carries the
  `ask-assistant (/api/ask user question)` purpose through `spend-client.ts`'s chokepoint (F15), so
  spend is neither unmetered nor unattributed once the flag is on.
- **Preview and Development stay OFF unless separately set.** `ASSISTANT_ENABLED` is a per-environment
  Vercel variable; this decision sets Production only. A Preview deploy of this same code reads
  `undefined !== "true"` and refuses, by the same gate, with no extra work.
- The env var is the single control and is recorded in the in-repo boundary manifest (`fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md`) so in-repo governance has a pointer to the
  out-of-repo state, even though it cannot enforce it (see Consequences).

This lane holds no Vercel credentials and does not attempt the flip. The coordinator runs:

```bash
vercel env add ASSISTANT_ENABLED production
# value: true
```
from the linked checkout, then redeploys the current production deployment so the running server
process picks up the new value (`bootstrap/route.ts` reads `process.env` per-request and needs no
redeploy once the *running* process has the var, but a var newly added to Vercel is only visible to
deployments started after it was set - hence the redeploy).

## Consequences

### On PR #478

PR #478 shipped the fail-closed gate itself, not a standing ruling that the Assistant must stay off.
Its own body says so explicitly: "The gate takes effect in production only once deployed; the
Assistant remains live until then" - the PR's author understood the gate as the *mechanism* that makes
it safe to flip the flag, not a policy that the flag must stay `false`. PR #478 also names its own
premise directly: the dollar-cap question it was asked to resolve was **already decided** by the
$0-during-build doctrine, and re-litigating it was itself the error (PR #478's "C14" self-correction).
A prior lane reading PR #478 as "the Assistant must stay off" inverted a safety mechanism into a
policy the PR never asserted. **Consequence for future lanes: PR #478 is cited here as satisfied, not
overridden** - its gate is exactly what makes this flip safe, and it stays intact (see Decision,
above). Citing PR #478 as a reason to refuse the flip is no longer available; the PR's own text refutes
that reading.

### On session-log Addendum 32

Addendum 32 (2026-08-28) is accurate and this ADR does not dispute a word of it. It names a real,
mechanical, and still-open consequence: **`spend-watch` (the `computeSpendHealth` probe, RD-31's
`enforcedBy`) will alarm `healthy: false` on the first real `/api/ask` paid row after this flip**,
because that row's spend ticket carries no `pricedLine` and no `batch-marker`, and
`computeSpendHealth` treats any post-freeze paid row that does not trace to one of those as the
anomaly - `spend-health.test.mjs`'s golden (e) proves exactly this shape. Addendum 32's own words:
"if the Assistant is ever deliberately enabled, its spend will again lack an authorization marker and
again red this probe. Enabling therefore OWES a batch-marker or priced-line write on the ask path
FIRST." **[CONFIRMED]** by reading `spend-client.ts:41-44`'s `guardPricedLine` (a no-op unless the
ticket carries a `pricedLine` field) and `spend-health.mjs`/`spend-health.test.mjs` together: nothing
in the code path from `/api/ask` to `recordSpendCall` attaches a `pricedLine` or `batch-marker`, so the
alarm Addendum 32 predicted is not a hypothesis - it is what the code, unchanged, will do on first real
use.

This ADR's ruling on that debt: **the batch-marker/priced-line write is real, still owed, and out of
this lane's write set** - the task brief for this ADR is explicitly docs-only and does not touch
`route.ts`. It is named here as a scoped follow-up (the exact shape: a `fetch_method: "batch-marker"`
row, `errors: [{ batchMarker: { task: "ask-assistant", model: "claude-sonnet-4-6", capUsd, windowStart,
windowEnd } }]`, written once per enablement window rather than per-request, mirroring the shape
`spend-health.test.mjs`'s `batch()` fixture already exercises) so that **a future lane seeing
`/api/health/spend` return `healthy: false` after this flip reads that as the expected, already-named
consequence of this ADR, not as a new incident or a reason to turn the Assistant back off.** The
`recommended_actions` note on that observation, if raised, is: land the batch-marker write, then
re-verify `/api/health/spend`; do not flip `ASSISTANT_ENABLED` back to unset as the fix.

**A related, more precise correction to this Part's own Step 4 verification language:** the brief for
this task says the coordinator's post-flip check is that "`/api/health/spend` shows the ask row
attributed." Read literally against `buildSpendResponseBody` (`fsi-app/src/app/api/health/spend/logic.ts:36-38`),
the ask-assistant row **will** appear in `paid_after_rows[]` with its real `item_id`/`source_id`/`cost_usd`/
`started_at` - that part of "attributed" is true and needs no fix. But its `justification` field will
be `null` (the row is not traced to a priced line), and the endpoint's top-level `healthy` field will
be `false` for as long as that row is within the post-freeze window - that part of "shows... attributed"
overstates what the probe will actually report. This is not a defect in the verification step; it is
this ADR making the probe's actual behavior explicit so the coordinator is not surprised by it.

### On RD-31

**[CONFIRMED]** by reading the enforcement code, not just the invariant's prose: RD-31's mechanism
(`assertPricedSpend`/`guardPricedLine` in `spend-client.ts:41-44`, re-exported by `spend-guard.mjs`)
is a no-op for any spend ticket that does not carry a `pricedLine` field. `/api/ask`'s ticket
(`{ purpose: "ask-assistant (/api/ask user question)" }`, `route.ts:484`) never sets one - by design,
per PR #478's own words, quoted above: "`/api/ask` was never *under-capped* - a cap there is decorative
by design. It sat **outside the authorization model entirely**." RD-31 governs the **paid-acquire /
grounding path**, which is separately gated OFF by `GROUNDING_ACQUIRE_ENABLED` (unaffected by this
ADR) - not the Assistant path. **Consequence: RD-31's enforcement code does not refuse, block, or even
observe `/api/ask`'s spend calls; it has nothing to assert against a ticket with no priced line, so it
passes through silently.** What RD-31's *sibling* mechanism (`spend-health.mjs`, the monitoring probe,
not a gate) does with that same fact is the Addendum-32 consequence above - a documented alarm, not a
refusal. A future lane citing RD-31 as a reason `/api/ask` cannot be enabled is citing an invariant
whose own enforcement code was never scoped to that route; this ADR records that reading as settled.

### Net effect

- The Assistant answers real questions in production once the coordinator sets the env var and
  redeploys. No code in this repository changes to make that true.
- `spend-watch` will report unhealthy on first real use, exactly as Addendum 32 predicted, and that is
  now a documented, expected state tied to this ADR - not a new defect and not grounds to re-disable
  the Assistant.
- The batch-marker/priced-line write that would keep `spend-watch` green under real Assistant use
  remains a named, scoped, un-landed follow-up, out of this lane's write set by the task brief that
  authorized this ADR.
- Preview/Development environments are unaffected and stay fail-closed.

## Verification (run by the coordinator, not this lane)

1. `curl -s https://carosledge.com/api/version` shows the redeployed sha.
2. The operator opens the site, switches the bar to Ask, asks "what is PPWR", and gets an answer.
3. `GET /api/workspace/bootstrap` on carosledge.com returns `assistantEnabled: true`.
4. `/api/health/spend` is read with the corrected expectation from this ADR's Consequences: the ask row
   appears in `paid_after_rows[]`, `justification` is `null`, and `healthy` is `false` until the
   batch-marker follow-up lands. That is success for this ADR's scope, not failure.
5. Any Ask-panel UI defect found during step 2 becomes a scoped follow-up task in this Part (4.4), per
   the task brief; it is not filed here as a silent note.

## Alternatives Considered

- **Build the batch-marker write in this lane before flipping the flag.** Rejected for this ADR: the
  task brief that authorizes this document is explicitly docs-only ("the code is NOT changed... the
  flip is configuration"); building it here would exceed this lane's authorized write set. Named as the
  immediate next follow-up instead.
- **Leave the flag off until the batch-marker write lands.** Rejected: this is the exact re-litigation
  the operator's 2026-09-09 and 2026-09-11 statements foreclosed. The operator ruled on the Assistant
  question directly, twice; a precondition invented by this lane would be the same error PR #478's own
  "C14" self-correction already named (treating a settled question as still open).
- **Widen `ASSISTANT_ENABLED` to a truthy check so Preview inherits Production's value implicitly.**
  Rejected: Vercel environment variables are already per-environment by platform design: an explicit
  Production-only entry means Preview and Development need no code change to stay off, and the strict
  `=== "true"` comparison in `assistant-spend-gate.test.mjs` forbids weakening the check anyway.

## References

- PR #478 (`gh pr view 478`) - built the fail-closed gate this ADR relies on and leaves unchanged.
- `docs/ops/session-log.md` Addendum 31 (gate construction) and Addendum 32 (spend-watch baseline +
  the ask-path batch-marker debt), lines ~4419-4539.
- `fsi-app/.discipline/governance/invariants.mjs:1174-1188` - RD-31-operator-priced-spend,
  RD-32-data-existence-before-acquisition.
- `fsi-app/src/lib/llm/spend-client.ts`, `spend-guard.mjs`, `priced-line.mjs`, `spend-health.mjs`,
  `spend-health.test.mjs` - the mechanisms read to confirm the RD-31/Addendum-32 analysis above.
- `fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md` - the boundary manifest this ADR adds a row
  to (see accompanying commit).

## Related

- [ADR-020-sustainability-first-vertical-scope](./ADR-020-sustainability-first-vertical-scope.md) - the
  same class of "a prior document's paraphrase was mistaken for a ruling" (its own "C11" correction) that
  this ADR's PR #478 discussion mirrors ("C14").
- [out-of-band-objects](../inventories/out-of-band-objects.md) - the neighboring out-of-repo/live-state
  ledger; this ADR's manifest row lives in `OUT-OF-REPO-BOUNDARY.md` itself rather than here (see that
  commit's note on why).
