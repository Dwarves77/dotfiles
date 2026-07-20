---
id: ADR-016
title: Append-only source-contact ledger, one home for every source touch
status: accepted
date: 2026-07-19
scope: source-knowledge capture, found-then-lost class closure, intake/discovery lanes
supersedes: none
related: ADR-015, ADR-012, RD-20, docs/audits/source-map-from-esgtoday-2026-05-09.md, docs/audits/source-map-existence-check-2026-05-10.md
---

# ADR-016 — Append-only source-contact ledger

## Decision (operator-approved 2026-07-19, build queued)

Every future source contact, evaluation, or ruling lands a queryable row at the moment it happens,
in ONE home. The decision to build a single append-only `source_contact_ledger` is accepted; the
build queues behind census work and the operator sequences it. This ADR is the design record;
nothing is built by it.

## The class it closes (found-then-lost)

The found-then-lost source recovery audit (Session C, 2026-07-19, canonical session log entry of
that date) established that source knowledge leaks because it is fragmented across stores that each
capture only PART of the lifecycle, plus two stores that are not queryable at all:

- `sources` captures REGISTERED sources only.
- `provisional_sources` / `canonical_source_candidates` capture CANDIDATES only.
- `census_worklist` captures ENUMERATED DOCUMENTS within already-held sources.
- `coverage_gap_candidates` / `coverage_gap_census_findings` capture the discovery lane's finds.
- `disposition_ledger` captures ITEM tombstones, not source contacts.
- **Session-log paragraphs** and **the operator's inbox** capture the rest, and neither is queryable.

A provider evaluated in a session-log paragraph, or signed-up-for via a data-provider newsletter,
leaves no queryable row. That is exactly how the audit's 35 lost providers leaked: mapped in the
2026-05-09 esgtoday "Source Registry Expansion" survey and the legacy Gemini-era `seed-resources.json`,
flagged for addition, and then invisible to every table in today's system. The knowledge existed; it
had no durable home, so it was lost.

This is a class-over-instance fix (`remediation-discipline`). The recurring failure is source
knowledge living in ephemeral stores; the durable capture home makes recurrence structurally
impossible, rather than re-recovering lost providers one audit at a time.

## The design

A single append-only table, `source_contact_ledger`, one row per contact event, keyed by normalized
host, written at every touch by every lane (discovery, intake, operator).

**`contact_type` vocabulary (as specced in the recovery audit):**

- `discovered` — a host first surfaced as a candidate (any lane, any method).
- `evaluated` — a host was assessed for fit/tier/relevance, with the verdict recorded.
- `signed_up` — an account or subscription was created with the provider (operator or lane).
- `newsletter_inbound` — a data-provider newsletter or release notice was received. **Explicitly
  modeled**, because this is the intake channel no current table covers: a newsletter subscription is
  a source contact, not merely an inbox state, and must land a row the moment the first message
  arrives (the IEA Monthly Electricity Statistics / statsnews@iea.org case is the worked example).
- `declined` — a host was ruled out, with a citable reason.
- `parked` — a host was deferred with a revisit condition.
- `registered` — a host became a live `sources` row (the ledger records the transition; `sources`
  remains the registry).

**Shape (design intent, not a migration):** id, host (normalized), contact_type, occurred_at,
actor (lane or operator), evidence (free text plus a pointer to the artifact: migration, session-log
date, integrity_flag, inbox sender), disposition_note, related_source_id (nullable, set when a
`registered` event ties to a `sources` row). Append-only (no update/delete of prior events; a
correction is a new event), mirroring `census_worklist`'s append-only discipline.

**What it is NOT.** It is not a second registry (that is `sources`) and not a second candidate queue
(that is `provisional_sources` / the census tables). It is the CONTACT-EVENT spine that ties them
together and captures the two currently-unqueryable channels (session-log mentions, inbox
subscriptions). The existing tables keep their roles; the ledger records the touches between them.

## Consequences

- No source knowledge can live only in a session-log paragraph, an inbox, or a dead worklist again:
  every touch is queryable by host and contact_type.
- The newsletter/email-borne intake channel becomes a first-class, captured class rather than an
  operator memory. When the operator signs up for a provider newsletter, a `newsletter_inbound` row
  lands, and a future audit queries it instead of re-discovering the loss.
- Build sequencing is the operator's. This ADR does not schedule it; it records the decided design so
  the build, when sequenced, compiles from a durable source (`edit-the-source-not-the-output`).

## Related

- [ADR-015](./ADR-015-restore-source-monitoring-supersede-adr-012.md) — source-monitoring is the
  operating design; this ledger is the capture spine that monitoring writes to.
- The found-then-lost recovery audit (canonical `docs/ops/session-log.md`, 2026-07-19) and its census
  rows (`coverage_gap_census_findings` sweep `sweep4_found_then_lost_recovery`, migrations 245-246).
