// RD-18-column-existence-parity: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-18-column-existence-parity',
    skill: 'remediation-discipline',
    section: 'Section 4 category 3 — Type-system drift (schema-vs-code)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'A code write-site that names a column the schema does not have is a PostgREST silent whole-row reject (error swallowed) — the reviewer_notes / dismissed_* phantom-column class. Every literal .from("T").insert|update|upsert({...}) column key MUST exist in the live schema; a code-referenced phantom column is a drift caught before it reaches prod.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'schema-vs-code compatibility breaks',
    enforcedBy: ['audit:fsi-app/scripts/verify/column-existence-parity.mjs'],
    residual: 'column-existence-parity.mjs (CI-with-secrets lane) greps literal object-literal write-sites, extracts top-level column keys, and asserts each exists in information_schema.columns for that table. HONEST SCOPE (the achievable targeted version, NOT a full typed contract): it sees LITERAL keys only — spread writes ({...payload}), dynamically-built rows, computed keys, and a variable passed to .insert(row) are reported UNRESOLVED (informational), never flagged as phantom; select-column strings are not parsed (write-side is the higher-severity class). The durable form is a committed `supabase gen types` snapshot + a tsc gate (REVISIT); this catalog-vs-grep audit is the zero-DDL interim that catches the reviewer_notes class today. The meta-gate proves wiring (file tracked + skill-cited).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
