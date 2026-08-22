# WO-26 — Scope remediation disposition table (2026-08-21, ⛔ operator gate before any archive)

**Ruling being executed:** Caro's Ledge is a freight-SUSTAINABILITY platform. Pure customs-procedure and
transport-administration law is out of scope. Edge zones ruled IN: CBAM/ETS-at-the-border, ESG supply-chain
due diligence, energy/fuel taxation reliefs. Ruled OUT: dangerous goods, customs digitalization.
Correction C11 recorded: the 2026-08-09 anchoring doc's "import/export, not a narrow filter" scope line was
paraphrase, not an operator ruling; the August EUR-Lex backfill executed it literally (632 items, 2 with a
sustainability theme).

## The split (910 live items)

| Bucket | Count | Action proposed |
|---|---|---|
| **IN** — sustainability scope | **357** | stays live |
| **OUT** — customs/transport-admin law | **526** | archive (reversible flag, snapshot-first) |
| **JUNK** — irrelevant feed captures (autism proclamation, family-violence week, CPI digest, ASEAN summit) | 4 | archive |
| **OPS_CONTEXT** — freight-operations context (state DOT plans, logistics research orgs, trade press, Port Watch) | 13 | **your class ruling: keep or archive** |
| **ATTENTION** — genuinely borderline, individually listed below | 10 | your per-item ruling (my lean noted) |

Validation of the method: the pre-August corpus (your original platform) splits 251 IN / 3 OUT by the same
rules; the August import splits 82 IN / 374 OUT. Both false-positive sweeps came back clean (zero
sustainability-worded titles stranded in OUT; the tag-less IN items read as legitimate on individual review).

## The 10 ATTENTION items

| Item | My lean |
|---|---|
| Shift2Rail Master Plan endorsement (2015/214) | OUT — institutional R&I, modal-shift only by association |
| Implementing Reg (EU) 2022/89 (application rules under a truncated-title directive) | verify parent instrument, then follow it |
| Decision 167/2006 ("activities of…", likely a funding programme) | verify, then follow purpose |
| European Year of Rail 2021 (2020/2228) | OUT — promotional |
| Implementing Decision 2023/2697 (Italian requests, truncated) | verify, then follow |
| Expert group Decision 2003/425 | OUT — administrative |
| Vehicle-tax reduced-rate Decisions (2009/760, 2005/449) | IN — emissions-adjacent road-charging family, pairs with Eurovignette which is IN |
| UN/ECE Reg 100 (electric-vehicle safety approval) | OUT — type-approval safety, though it enables EVs |
| UN/ECE Reg 110 (CNG/LNG vehicle components) | OUT — same class |

## What happens after your ratification (all $0, WO-8 discipline)

1. Rule-015 snapshot of every to-be-archived row's current state (the undo artifact, md5-recorded).
2. Archive via checksummed batched UPDATEs (`is_archived=true`), Sonnet executor shards, count+md5 gates.
3. Flywheel re-run over the remaining ~370-item sustainability corpus: edges re-discovered (ADR-019
   weighting), themes re-clustered, digest-verified DB write. The customs themes dissolve.
4. U6 resumes over the NEW themes (the paused batch of 37 is void; the maritime pilot brief survives).
5. Docs PR: scope doctrine, C11 correction, WO-26 run record, addendum, board rows.

Nothing is deleted anywhere. One UPDATE reverses any archive decision. The full item-by-item lists are in
the companion file `disposition-lists.md`.
