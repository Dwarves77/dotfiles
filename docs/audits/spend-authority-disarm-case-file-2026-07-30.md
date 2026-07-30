# Spend-authority disarm — root-cause case file (2026-07-30)

**Status:** written BEFORE the fix, per operator order 2026-07-30.
**Scope:** every incident this campaign where a spend-authorization control existed, was believed live, and
was not actually binding the path that spent.
**Prerequisite of:** the engine-scale metered run (the 2,452-instrument catalogue) and the policy proposal.

Related: [session-log](../ops/session-log.md) (case-file instances 1–10), [ADR-015](../decisions/ADR-015-source-monitoring-restored.md).

---

## 1. The incidents

Seven distinct incidents. Each is a *different mechanism*; the failure shape is identical.

| # | Incident | The control | Why it did not bind |
|---|---|---|---|
| 1 | **Metered gate off-path** | `assertMeteredCallAllowed` (metered-gate.mjs) | It only governs callers that *choose to call it*. `grep callClass src/` returns nothing outside the gate's own modules — the entire canonical pipeline never consults it. The wall exists; the road goes around it. |
| 2 | **SPEND_CEILING inert** | `assertBudget(ticket, standingCeilingUsd)` | The parameter is "accepted for signature stability but is NO LONGER used as a limit." A signature that still *looks* like a ceiling, and isn't. Every caller passing it believed it capped them. |
| 3 | **Unwired batch markers** | batch-marker emission | Marker-writing lived in ONE runner, so authorized batch spend from any other runner ran unmarked — 19,898 paid rows against 54 markers. Fixed by C2 (emission moved into the gate), which is the correct shape and the precedent for this whole fix. |
| 4 | **Ticket clobber** | `SpendTicket.pricedLine` | All four canonical-pipeline steps re-set the context ticket to stamp attribution and **overwrote** a caller-supplied priced line. The operator's sole dollar authority was droppable by an internal bookkeeping call. |
| 5 | **jiti dual-instance** | `currentTicket` module-local | jiti keys its module cache by *specifier*. `import(resolve(ROOT,"src/lib/llm/spend-client.ts"))` and `import("@/lib/llm/spend-client")` are two module instances with two `currentTicket` bindings. The runner set its ticket on a copy the pipeline never read. |
| 6 | **Untraced $0.0438** | per-call ledger persistence | Did not exist at run time. Spend was real; the only trace was console output in a client that then crashed. |
| 7 | **Unpriced $0.6442** | the operator's $1.25 priced line | Consequence of #5. `32026R1030` generated under the permissive LEGACY ticket. It stayed under the line by luck, not by control. |

Adjacent, same family (recorded as case-file instance 10): a comment reading
`// PER-CALL PERSISTENCE (fail-closed metering)` sat directly above `if (ledgerErr) console.error(...)`, which
logs and keeps spending. Documentation standing in for enforcement.

## 2. The common cause

> **Authorization was carried in AMBIENT STATE — environment variables, module-local singletons, and
> call-site convention — and ambient state is invisible at the call site, inherited by default, and silently
> escaped by any new path.**

Three concrete forms, all present above:

- **Environment** (`GROUNDING_ACQUIRE_ENABLED`, `METERED_BATCH_TOKEN`) — process-wide, set far from the call,
  true for everything at once or nothing.
- **Module-local singletons** (`currentTicket`) — depends on module *identity*, which depends on the loader's
  cache key. Incident #5 is the pure case: the authorization was set correctly, on the wrong copy of the module.
- **Call-site convention** (a caller *choosing* to call `assertMeteredCallAllowed` / `assertPricedSpend`) —
  incidents #1 and #2. A control that must be remembered is a control that will be forgotten.

The decisive property they share: **the default is "unchecked", not "refused."** A new code path that knows
nothing about spend authority spends anyway. Every one of these seven was found *by looking*, never by the
system objecting — and #6 and #7 were found only after the money was gone. That is the definition of a
control that is not load-bearing.

This is the same class the campaign has been killing all week, one level up: the dig-fallback (a matcher that
invented grounding), the unchecked bulk write (a delete that matched zero rows and reported success), the
unpaginated read (a count that silently truncated). In each, **the failure mode was a permissive default**.
Here the permissive default is on money.

## 3. The structural fix (single choke point)

Ordered 2026-07-30. Stated as invariants, not implementation:

1. **Exactly ONE module may construct or invoke the paid API client.** No other module imports the SDK or
   builds a client. There is one door.
2. **Authorization is an explicit ARGUMENT to every call through it** — a priced line or a metered-batch
   grant, passed in, never read from ambient state. No default value. No context ticket.
3. **Missing or exhausted authorization REFUSES the call, fail-closed.** A caller that does not know about
   spend authority cannot spend, because it cannot construct a valid call.
4. **The ledger write is part of the same call** — before-spend projection, after-spend persist, **halt on
   write failure**. Spend and its trace are one operation, so untraced spend is not expressible (kills #6).
5. **A fitness function (F17 pattern) bans SDK import / client construction outside the choke-point module**,
   so a future path cannot route around the door *by existing* (kills #1, and #5 with it — one module, one
   instance question, and the argument is explicit anyway).

Why this closes the class rather than the instances: making authorization a **required argument** inverts the
default. Ambient authorization fails open for anything that does not know to ask; an explicit required
argument fails closed for anything that does not supply it. The compiler and the fitness guard, not the
author's memory, become the enforcement.

## 4. What this does NOT fix (stated, not hidden)

- It does not make the *amount* correct. An operator-priced line is still an operator judgement; the choke
  point only guarantees the line is present, binding, and traced.
- It does not retro-authorize incidents #6 and #7. Those stay annotated as real, unauthorized-by-mechanism
  spend (see the non-fabrication precedent: a hole is documented, never back-filled with invented evidence).
- The acquire gate (`GROUNDING_ACQUIRE_ENABLED`) remains an environment flag. It is a *master off-switch*, not
  a per-call authorization, and an off-switch failing closed on absence is the correct shape for that role.

## 5. Standing rule proposed from this file

> **Authorization is an argument, never an ambience.** Any control that gates spend, writes, or publication
> MUST be passed explicitly to the operation it governs and MUST refuse on absence. A control read from the
> environment, a module-local, or a caller's good manners is not a control — it is a convention, and it will
> be escaped by the next path that does not know it exists.
