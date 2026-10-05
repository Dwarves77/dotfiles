---
id: ADR-044
title: Learning loop runs with no operator gate and no priced request
status: accepted
date: 2026-10-05
scope: learning loop (questions, answers, inferences, predictions, source reliability)
supersedes: ADR-036 decisions 1 and 3 (decision 2 stands)
related: ADR-025, ADR-036, ADR-042, ADR-043
---

# ADR-044: Learning loop runs with no operator gate and no priced request

## Context

ADR-036 decision 1 made any acquisition for an unanswered question an operator-reviewed,
operator-priced request. ADR-036 decision 3 made source reweights ratification-gated. Both conflict
with later operator rulings: "No human gates. Period" (2026-10-04), everything is free (no metered
model or search call anywhere in the build), and the buildout plan of 2026-10-04, Stage 4, which the
operator accepted: the residue of unanswered questions goes to a session lane, and the source
reliability ledger adjusts weighting automatically. ADR-025 already ruled that deterministic
derivations adopt with no human gate. The code register of 2026-10-05 found the conflict standing in
the code (`QUESTION_ACQUISITION = "operator-priced-only"`, the flag text "for operator review, never
auto-answered") and found that nothing answers a question at all.

## Decision

1. A question is answered from holdings first. A workflow exports open questions with the held
   source text of the item and of the items connected to it. A Claude session lane writes a committed
   answer batch. An apply step validates and writes by rule. No metered call, no priced ticket, no
   operator review step. This is the same export, committed batch, apply pattern as record briefs,
   theme briefs and host verdicts.
2. A question the holdings cannot answer is not parked for an operator. Its answer entry says so, and
   the apply step turns it into a source search target through the existing gap-target mechanism. The
   question stays recorded with that outcome and is asked again when new holdings arrive.
3. An answer is written as an inference record (ADR-036 decision 2 stands: a separate table joined
   to the derivation graph). An inference is never a fact: it carries its status token, its cited
   items, and its confidence, and it is shown to customers labelled as an inference.
4. Source reliability moves automatically. A scored outcome is one more evidence input to the
   existing effective-tier calculation, inside its existing clamp. The admin tier override always
   wins. No ratification step. The reliability ledger is append-only evidence; it never writes a tier
   itself.
5. The spend chokepoint and RD-31 and RD-32 stay in the code as the guard that no path spends; no
   learning-loop path builds a spend ticket.

## Consequences

- `QUESTION_ACQUISITION` and the question flag wording change to match decision 1.
- `seekAnswerForQuestion`'s priced branch has no caller in the learning loop.
- Population of answers and inferences waits until every build layer is complete (operator ruling
  2026-10-04); the tools are proven on fixtures and stay dry.
