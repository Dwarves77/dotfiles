# Sweep Ledger

Standing register of corpus-wide sweeps to run wholesale (close a defect CLASS in one query rather
than instance-by-instance). Each entry: the class, confirmed instances, the detection query, the
trigger to run, and status. Append new sweeps; never delete a run one — mark it DONE with the date +
result so the class stays visible if it recurs.

---

## SW-1 — Jurisdiction-code collision (country code vs US state code)

**Status:** PENDING — run the one-query corpus-wide sweep when the archive-endgame review lane completes.
**Logged:** 2026-07-17 (operator ruling). **Class owner:** corpus-integrity / review lane.

**The class.** A jurisdiction coded `US-XX` where `XX` is *also* an ISO 3166-1 alpha-2 country code is a
collision risk: a country item can be silently mis-tagged to a US state (or vice versa). The two-letter
country codes that collide with US state postal codes include:
`AL` (Albania↔Alabama), `AR` (Argentina↔Arkansas), `CA` (Canada↔California), `CO` (Colombia↔Colorado),
`DE` (Germany↔Delaware), `GA` (Georgia-country↔Georgia-state), `ID` (Indonesia↔Idaho), `IN` (India↔Indiana),
`LA` (Laos↔Louisiana), `MA` (Morocco↔Massachusetts), `MD` (Moldova↔Maryland), `ME` (Montenegro↔Maine),
`MO` (Macau↔Missouri), `MT` (Malta↔Montana), `NE` (Niger↔Nebraska), `PA` (Panama↔Pennsylvania),
`VA` (Vatican↔Virginia), `VI` (Virgin Is.↔?), and the rest of the alpha-2 ∩ state-postal set.

**Confirmed instances (fixed as caught):**
- Indonesia / `US-ID` (Idaho) — caught 2026-07-17 in the archive-endgame RESTORE jurisdiction check
  (ASEAN Transport Plan `g24`, `["MY","PH","SG","US-ID"]` → `["ID","MY","PH","SG"]`), fixed at restore.
- Colombia / `US-CO` (Colorado) — Session B drain finding; FIXED 2026-07-17 (`3e9c3ebe` `["US-CO"]`→`["CO"]`).
- India / `US-IN` (Indiana) — Session B drain finding; FIXED 2026-07-17 (`beae0a7e` `["US-IN"]`→`["IN"]`).
- **Canada / `US-CA` (California)** — NEW collision member, Session B drain finding; FIXED 2026-07-17
  (`5b2c6655` Canada Clean Fuel Regs `["US-CA"]`→`["CA"]`). `CA` (Canada) ↔ California is the highest-traffic
  pair; add it to the collision set below.
- (The GA-country / GA-state pair is the letters-identical case; verify Georgia-Multimodal-Freight
  (US-coded, correct) is not confused with any Georgia-country item.)
- Also fixed 2026-07-17 (pool-conflation, not a country/state collision but same jurisdiction sweep):
  Japan Customs `ad4cc6c6` `["AE","BD","JP"]`→`["JP"]` (UAE+Bangladesh wrongly pooled onto a Japan item).

**ROOT CAUSE (found 2026-07-17 via the fixed instances).** These are NOT random mis-tags — `jurisdictions`
(text) was CORRECT (`CA`, `IN`) while `jurisdiction_iso` was WRONG (`US-CA`, `US-IN`). So the bug is in the
DERIVATION: `_derive_jurisdiction_iso_from_canonical` maps ISO country codes `CA`/`IN` → US-state codes
`US-CA`/`US-IN`. The corpus-wide FIX is therefore a DERIVATION-FUNCTION migration (not just per-row edits) —
audit `_derive_jurisdiction_iso_from_canonical` for every country-code→US-state mapping. That migration is the
real SW-1 close; per-row fixes (above) close the live instances at their handling moment.

**Detection query (mechanical shortlist, then per-item content confirmation).** Select every
`intelligence_items` row whose `jurisdiction_iso` array contains a `US-XX` token where `XX` is in the
collision set; the item's actual subject (title/brief) decides whether it is the US state (leave) or the
country (flip `US-XX` → `XX`). The mechanical query narrows the field; the flip is a per-item read (the
country-vs-state call is judgment, same discipline as content-is-not-nature).

**Why wholesale, not instance-by-instance.** Each instance so far was caught only by a restore-time
jurisdiction check. A single corpus-wide query closes the whole class at once, so no future item silently
carries a mis-coded jurisdiction between now and the next accidental catch.

---

## SW-2 — Stale session-log fork write hazard (fsi-app/docs/ops/session-log.md)

**Status:** PENDING — deprecation pointer in place (near-term mitigation); mechanical check not yet built.
**Logged:** 2026-07-18 (operator ruling). **Class owner:** corpus-integrity / process discipline.

**The class.** `fsi-app/docs/ops/session-log.md` is a stale fork of the canonical `docs/ops/session-log.md`
(repo root, per `CLAUDE.md` rule 6) that stopped receiving real entries after commit `42ac8969`. Two
INDEPENDENT sessions (Session A's 2026-07-18 restart reconciliation, and Session B's 2026-07-17 containment
bank) each wrote real work to the fork without noticing it wasn't the canonical file. Two independent misses
means this is a mechanical hazard, not an advisory one — a third session doing the same thing is the base
rate until something cheaper than "remember which file" closes it.

**Near-term mitigation (done):** a deprecation pointer at the top of the fork (added 2026-07-18) redirects
any session that opens it.

**The mechanical fix (not built, pending):** a one-line check — a discipline rule or pre-commit hook line —
that flags (or blocks) any commit touching `fsi-app/docs/ops/session-log.md`, naming the canonical path as
the redirect. Cheap to build (a single path-match in the existing pre-push/pre-commit chain, same shape as
other path-based guards already in the discipline suite) but not built in this bank per operator instruction
— the pointer covers the near term; this entry keeps the item visible until it lands.

**Why wholesale, not instance-by-instance.** The deprecation pointer only helps a session that opens the file
and reads past the top; a session that writes via a script or appends without reading the header would still
land in the fork silently. A mechanical block closes the class regardless of whether the header gets read.

---

## SW-3 — drain_worklist note accuracy (label-is-not-proof extended to operational metadata)

**Status:** FLAGGED — for Session E's dormant-systems audit. Sample-confirmed, not yet corpus-swept.
**Logged:** 2026-07-18 (surfaced during B-reassignment queue processing). **Class owner:** corpus-integrity /
drain discipline.

**The class.** `drain_worklist.notes` is a free-text finding written once, at assignment time, by whichever
session (or tool) enqueued the row. It is treated downstream as a reliable summary of the item's state — banks
read it, trust its claim counts and characterization, and sequence work off it. But a worklist note is itself
an UNVERIFIED CLAIM about live state, exactly the same shape as an `archive_reason` label describing an item's
nature: it can be accurate when written and silently go stale (a later mechanical drain pass changes the
item's real failure set), or be wrong from the start (a miscount, a narrower check than the live gate runs).
**Label-is-not-proof (RD-42, Section 4 category 30) was scoped to customer-facing content labels
(`archive_reason`); this extends the same discipline to operational bookkeeping — a drain_worklist note is a
LEAD for triage, never a WARRANT to skip re-verifying against the live gate before acting at scale.**

**Confirmed instance (sample, 2026-07-18).** Sampled 7 "PROMOTED... relabel-manual residual" items and ran
`validate_item_provenance` live against each, comparing the result to what the assignment-time note claimed:

| Item | Note claimed | Live gate shows | Verdict |
|---|---|---|---|
| Canada Clean Fuel (5b2c6655) | 7 in-prose ANALYSIS | 7 `analysis_missing_label_syntax` | within tolerance |
| ISSB IFRS S2 (38322420) | 30 relabel-manual | 33 (32 floor + 1 unlabeled) | within tolerance |
| GLEC Framework v3 (3581c084) | relabel-manual (unquantified) | 1 `unlabeled_assertion` | within tolerance |
| Norway Fjords (82f09535) | 5 relabel-manual | 8 (5 floor + 3 missing-slot) | within tolerance |
| Brazil Lei 12.305 (6a857887) | relabel-manual (unquantified) | 1 `missing_required_slot` | within tolerance |
| LA EWEO (d031e36e) | 8 relabel-manual | 8 (3 floor + 5 label-syntax) | within tolerance |
| **EPA HDV Phase 3 (bec305e1)** | **4 relabel-manual** | **28**, all `fact_span_not_in_source` | **MATERIALLY WRONG — 7x undercount** |

Six of seven were reasonable given notes are written before later mechanical passes add findings. One was not
noise — a 7x gap between claimed and actual failure count on the same item, same check.

**Detection query (mechanical shortlist, then per-item confirmation).** For every `drain_worklist` row whose
`notes` field asserts a claim count or a bounded finding ("N relabel-manual", "0 mechanical exits", etc.), call
`validate_item_provenance` live and diff the returned failure count/reasons against the note's claim. A
material gap (order-of-magnitude, not a small drift) is the sweep's positive hit.

**Why wholesale, not instance-by-instance.** The whole point of a worklist is to let later work trust earlier
triage without re-deriving it; if that trust is sometimes wrong by 7x, every downstream bank that sequences or
batches off note counts inherits the error silently. A single sweep — re-validating every note-bearing row
against the live gate once — closes the class for the current backlog; going forward, any tool that WRITES a
worklist note should stamp it from the SAME live gate call it just ran, not a separate manual count.
