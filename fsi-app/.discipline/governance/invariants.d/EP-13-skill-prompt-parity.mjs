// EP-13-skill-prompt-parity: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'EP-13-skill-prompt-parity',
    skill: 'environmental-policy-and-innovation',
    section: 'The 16 Rules for All Output / Database Field Emission',
    text: 'The skill\'s numbered rules list and its 20-field database-contract enumeration are kept at exact parity — same numbering, same wording, same field set — with the operative runtime contract in src/lib/agent/system-prompt.ts. The header\'s "Synced to ... (canonical)" claim is not honor-system: a wording or field-set drift between the two files must be caught mechanically, not discovered by inspection.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'is enforced by `src/lib/agent/skill-prompt-parity.test.mjs`',
    enforcedBy: ['selftest:fsi-app/src/lib/agent/skill-prompt-parity.test.mjs'],
    residual: 'The selftest extracts the numbered-rules block (anchored on the "Rules for All Output" heading through the first non-numbered line) and the Fields: bullet block (anchored between "Fields:" and "Severity to priority mapping") from both files via regex, normalizes whitespace, and asserts equal rule count/text and equal field-name sets. It proves STRUCTURAL parity of these two specific contract surfaces (rule text, field names) — it does NOT parse or compare the rest of each file (section lists, vocabularies, changelog, etc.), and a rewrite that keeps rule/field text identical while changing surrounding prose elsewhere in either file is not caught by this invariant. contract-version.test.mjs remains the separate, narrower guard for the regeneration_skill_version literal alone.',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
  };
