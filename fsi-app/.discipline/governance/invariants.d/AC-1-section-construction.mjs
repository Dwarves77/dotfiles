// AC-1-section-construction: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.
//
  // ───────────────────────────── analysis-construction-spec ─────────────────────────────
  

export const invariant = {
    id: 'AC-1-section-construction',
    skill: 'analysis-construction-spec',
    section: '1. The construction method',
    text: 'Each format is constructed to its declared per-section spec (the section set per format); sections without grounded content are omitted-with-note, never invented to fill.',
    anchor: 'The construction method',
    enforcedBy: ['audit:fsi-app/scripts/verify/format-structure.mjs', 'audit:fsi-app/scripts/audit-skill-conformance.mjs'],
    residual: 'format-structure.mjs proves section presence/structure vs the spec; cannot prove each section\'s INGEST/TRANSFORM/OUTPUT quality (semantic). audit-skill-conformance.mjs is the broader code-checkable conformance sweep over ALL items (format_type↔item_type, min-section count, topic/severity vocab) — the SOFT/informational lane audit, evidence-basing the regen scope; it was an unwired lane audit before this registration (default invocation reads only; --apply persists to integrity_flags via the guarded path).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
