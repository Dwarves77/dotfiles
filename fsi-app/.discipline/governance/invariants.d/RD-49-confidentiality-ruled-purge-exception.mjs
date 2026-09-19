// RD-49-confidentiality-ruled-purge-exception: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-49-confidentiality-ruled-purge-exception',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 27: Primary text is permanent (the document baseline)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A confidentiality-ruled purge is a sanctioned, narrow, per-instance exception to RD-46 append-only retention. When stored content is confirmed to be a confidential third-party document improperly staged into the corpus, the operator may rule a purge of the extractable content through the guarded write path only (never a raw delete), bounded by: an operator ruling is required EACH time (never a standing automatic capability); the evidentiary minimum (source URL, fetch timestamp, byte count, content hash where available, the confidentiality marking quoted verbatim) MUST be captured to a durable docs/compliance/ incident record BEFORE the purge; and the purge redacts the row\'s extractable substance while preserving its audit metadata (URL, item association, timestamps), never deleting the row itself. Origin case: the NCAER "Logistics Cost in India" confidentiality incident (docs/compliance/confidentiality-incident-2026-07-17-ncaer.md).',
    anchor: 'confidentiality-ruled purges are a sanctioned, narrow exception to append-only',
    exempt: {
      reason: 'PROCESS discipline exercised at the operator-ruling level (same class as RD-8/RG-1) — whether stored content is confidentially-marked, third-party, and improperly staged is a judgment call the operator makes per-incident, not a mechanically checkable property with a low-false-positive detector today. The bound is carried by the incident-record requirement (evidentiary minimum captured BEFORE any purge) and the guarded-write-path requirement (no raw delete, redact not remove) rather than a standing automated gate. A confidentiality-marking capture-gate detector (screening fetched content for disclosure-prohibition language before staging, preventing the recurrence rather than gating the purge) is QUEUED on the hardening ledger (docs/PROGRAM-BOARD.md) — when it lands, THIS invariant stays exempt (the purge-authorization judgment does not become mechanical just because the upstream capture gets a screen), but the recurrence rate it is meant to prevent becomes auditable.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    },
  };
