## Skill

remediation-discipline

## Change

`fsi-app/.claude/skills/remediation-discipline/SKILL.md` itself is unchanged. This range ADDS
`GOVERNING SKILL(S):`-style citations of it (rule 15, "a guard is proven by attack, not presence") in
two new/touched adversarial RLS audit files:

- `fsi-app/scripts/verify/harness-runs-rls-adversarial-audit.mjs` (new, migration 331's own adversarial
  proof, modeled directly on the existing SEC-1 template).
- `fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs` (touched: its duplicated
  `probe`/`classifyProbe`/CLI-bootstrap bodies were extracted to a new shared module,
  `fsi-app/scripts/verify/lib/rls-adversarial-probe.mjs`, after F45's duplicate-code ratchet caught the
  near-verbatim copy this lane's first draft of harness-runs-rls-adversarial-audit.mjs landed; the rule
  15 citation and this file's own adversarial-attack behavior are unchanged, only the shared primitives
  moved to one home).

A straightforward reuse of remediation-discipline's existing "proven by attack, not presence" framing,
same posture as the SEC-1 skill-ack this lane's citation directly follows
(`2026-09-25-sec1-derivation-edges-rls.md`). Not a new interpretation of the skill.

## Citing files reviewed

- `fsi-app/scripts/verify/harness-runs-rls-adversarial-audit.mjs`
- `fsi-app/scripts/verify/derivation-edges-rls-adversarial-audit.mjs`
- `fsi-app/scripts/verify/lib/rls-adversarial-probe.mjs` (the extracted shared primitives; carries no
  `GOVERNING SKILL(S):` marker of its own -- it is mechanism, not the rule-15 citation, which stays on
  the two per-table audit files that use it).
