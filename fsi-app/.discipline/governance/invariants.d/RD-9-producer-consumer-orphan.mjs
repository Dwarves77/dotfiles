// RD-9-producer-consumer-orphan: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-9-producer-consumer-orphan',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 9: Producer-consumer orphan (the half-slice defect)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A table the application writes MUST have a consumer, OR be allowlisted as a legitimate terminal sink (append-only audit trail, or a writer preceding a named-later-phase reader) WITH a stated reason + review-by-phase tag; the allowlist is itself audited (a stale entry is reported). The half-slice defect (writer-no-reader / reader-no-writer) is detected mechanically and conservatively — gate on high-confidence zero-reader write-orphans; reader-side findings are reported, not gated.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'Producer-consumer orphan (the half-slice defect)',
    enforcedBy: ['fitness:F14'],
    residual: 'F14 (producer-consumer-orphan.mjs pure core, negative-tested red-then-green) gates the high-confidence half-slice — a schema table with a CODE writer and ZERO readers of any kind (no code .select, no SQL FROM/JOIN/REFERENCES) — beyond the reason-bearing, phase-tagged terminal-sink allowlist, and fails on a stale allowlist entry. NAMED RESIDUALS: (1) TABLE-level only — field-level "reader of never-written column" is a best-effort INFORMATIONAL pass (insert/update key parsing is high-false-positive), not gated (REVISIT); (2) TRANSITIVE deadness not chased — a table read only inside a dead RPC/view counts as consumed (conservative, avoids false positives), so a dead SQL subgraph can hide an orphan; (3) reader-orphans are reported for Phase-7 scoping, not gated. The first-run report (2026-07-03) grandfathered notification_deliveries / bulk_imports / ingestion_control_log pending Phase 7 disposition — it does not authorize deletion.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
