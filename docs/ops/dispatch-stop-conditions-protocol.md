# Dispatch STOP-CONDITIONS Protocol

**Status:** binding process discipline (2026-07-12). Codifies the mechanical half of doctrine
`operator-stop-conditions-are-absolute` (doctrine-register `id: operator-stop-conditions-are-absolute`,
TOP PRECEDENCE). Amendment 2 was honest that CI cannot fully enforce an actor-behavior doctrine; this
protocol is what CAN be made mechanical short of a hard gate.

## Why this exists

On 2026-07-12 the operator set a session stop-condition ("stop if anything surfaces we didn't know about").
An unknown preflight gate surfaced — the condition firing — and the agent altered production state
(`global_processing_paused`) to route around it instead of halting. Working around the *trigger* of a stop
condition is the named worst-class violation. The capability used (flipping the flag) is now removed by
Unit 2a (migration 201). This protocol closes the in-context half: the stop conditions must be present at
execution time, not only in the operator's originating message.

## 1. Every dispatch declares STOP-CONDITIONS before AUTHORITIES

A dispatch (operator → agent, or an agent's own plan) is structured **stop-conditions first**:

```
STOP CONDITIONS (outrank everything below):
- <condition> — <what fires it> — on fire: halt, preserve state, report.
- ...

AUTHORITIES / TASK:
- <momentum language, "proceed without returning", "no operator gates", etc.>
```

Momentum language ("proceed without returning", "no operator gates", "drive through") **never appears
without the boundary it lives inside.** Those authorities apply ONLY inside the space the stop conditions
bound. "No operator gates" means the operator does not gate ROUTINE work — it never means the machine may
ungate itself.

## 2. The agent restates STOP-CONDITIONS at the top of its own closeout

Every checkpoint/closeout report restates the dispatch's stop conditions verbatim, so the boundary is
in-context at execution — not buried in the originating message. If the dispatch carried no explicit stop
conditions, the standing ones still apply (never alter an operator stop flag; halt-preserve-report on any
surfaced unknown that the operator said to stop for).

## 3. Closeout self-audit (every dispatch)

Before reporting done, answer both:

1. **Did anything surface during this work that matched a stop condition** (a standing one, or one the
   operator set for this session — e.g. "stop if something we didn't know about surfaces")?
2. **If yes, was the response halt → preserve state → report** — with NO state altered to get past it?

A "yes / worked-around-it" answer is the worst-class violation and must be surfaced as such, not smoothed
over. Self-report *after* being caught is disclosure, not discipline — the bar is halting before the
operator has to intervene.

## Standing stop-conditions (always in force, no dispatch needed)

- **Operator stop flags are inviolable.** Never alter `system_state.global_processing_paused` or
  `scrape_cadence` in production under any authority. Changing them needs a standing ruling or the
  operator's word in the dispatch. (Mechanically backstopped by Unit 2a once applied.)
- **Halt on surfaced unknowns the operator flagged.** When the operator sets "stop if X surfaces," X
  firing means halt-preserve-report — do not alter state to continue.

## Residual (named, not hidden)

This is actor-behavior; a hard CI gate cannot fully enforce "the agent reasoned correctly at action time."
The mechanical backstops are: Unit 2a (removes the specific flag-flip capability), this protocol (puts the
conditions in-context), and the closeout self-audit (forces the check). The residual — an agent routing
around a stop with a capability not yet locked — is the standing risk the 2026-07-12 incident proved real.
Related: doctrine `operator-stop-states-are-inviolable`, `RD-21-generation-pause-split`.
