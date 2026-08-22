---
id: ADR-020
title: Sustainability-first vertical scope for Caro's Ledge
status: accepted
date: 2026-08-21
scope: regulation intake and corpus classification — WO-26 scope remediation (910-item disposition),
  the flywheel re-run over the surviving corpus, and the future regulatory_domain architecture item
supersedes: none
related: ops/wo26-scope-remediation-2026-08-21.md (run record), archive/wo26/wo26-disposition-table.md
  (companion run artifact, item-by-item lists in archive/wo26/disposition-lists.md), session-log
  Addendum 28, C11 correction,
  ADR-019-inverse-frequency-scenario-weighting.md (targets re-based by this corpus change)
---

# ADR-020 — Sustainability-first vertical scope (operator-ruled 2026-08-21)

## Context

The 2026-08-09 analysis-anchoring resolution doc carried the line "Regulation scope: anything and
everything... import/export... not a narrow filter." That line was written as paraphrase, describing
the platform's read-time posture toward whatever was already in the corpus — not as an operator ruling
on intake scope. Nothing at the time flagged the distinction, because nothing needed to: the corpus it
was written against was itself already sustainability-shaped.

The August 1–7 EUR-Lex fleet backfill read that line literally and executed it as an intake filter. It
ingested 632 items — the full breadth of "anything and everything... import/export" EUR-Lex law — of
which only 2 carried a sustainability theme. The platform's fail-open relevance floor (mint anyway below
the 40-point relevance score, rather than refuse) let all 632 land as live, undifferentiated from the
platform's actual sustainability corpus, and they sat there for weeks before this session's review
surfaced them.

This is recorded as **Correction C11**: the anchoring doc's scope line was paraphrase, never an operator
ruling, and the backfill that treated it as one is the proximate cause of the August scope drift.

## Decision

**Caro's Ledge is a freight-SUSTAINABILITY platform, first.** Pure customs-procedure and
transport-administration law is out of scope for what the platform ingests, classifies, and serves
today.

- **Parked future vertical, not waste.** Customs and transport-administration law is not being
  discarded as irrelevant — it is scope for a later, deliberately separate phase of the product (see
  the pitch vision below). Every item leaving the live corpus under this ruling is archived
  *reversibly*, never deleted, for exactly this reason.
- **Edge zones ruled IN** (sustainability-adjacent, stays live): CBAM/ETS-at-the-border, ESG
  supply-chain due diligence, energy/fuel taxation reliefs.
- **Ruled OUT for now** (not edge zones, no sustainability adjacency): dangerous goods, customs
  digitalization.

## The pitch vision (operator, same day — the vision, not a verbatim-sacred spec)

The scope ruling was delivered alongside the operator's own long-term pitch for the product, recorded
here as the vision this decision serves, not as binding product-spec language:

> A tool that will eventually take ALL regulations for any freight forwarder and categorize them
> recognizably and actionably — starting with sustainability, ingesting customs and other domains
> later.

Read this as intent, not architecture: it explains *why* customs is parked rather than purged, and it
is the reason the consequences below include a standing architecture item rather than a closed door.

## Consequences

- **Archive reversibility is load-bearing, not incidental.** Nothing executed under this ruling is a
  delete. The 537-item archive batch (WO-26; see the companion run record) is a single reversible
  `is_archived` flip per row, and the pre-archive snapshot (md5 `3bbf6132`) is the undo artifact for the
  whole batch — because the pitch vision says customs comes back later, the mechanism that lets it come
  back has to exist now.
- **`regulatory_domain` backlog item.** The pitch vision implies more than one domain will eventually
  live in this corpus side by side (sustainability, customs, and others). A `regulatory_domain`
  dimension (`sustainability | customs | ...`) is owed on the schema before any future customs
  restoration is attempted, so a later vertical can be ingested without cross-contaminating this one.
  Not designed here — named as a backlog item for the architecture queue, board-tracked.
- **Open question for the intake lane — explicitly NOT decided here.** The mechanism that let the
  632-item backfill mass into the live corpus undetected was the fail-open relevance floor: items
  scoring below the 40-point relevance threshold are minted anyway rather than refused or queued for
  review. This ADR does not rule on whether intake should fail-closed below the floor, gate on
  `regulatory_domain` match, or something else — that is an intake-lane design question, out of this
  ADR's scope, flagged here so it is not lost before the next intake-lane review takes it up.
- **ADR-019's targets are stated against a corpus this decision retired.** ADR-019 measured its largest-theme
  and theme-count targets against the 806-item / 726-tagged corpus that included the August customs mass.
  That corpus no longer exists in that form after this archive and the flywheel re-run that followed it.
  The new base is 276 verified items (209 tagged), and ADR-019's targets need re-ratification against it
  — see the companion run record for the current numbers (largest theme 32.5% of 209 tagged, 9 themes).
  This ADR does not re-ratify them; it records that the ground under them moved.
