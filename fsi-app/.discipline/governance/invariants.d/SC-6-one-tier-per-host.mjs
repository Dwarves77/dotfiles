// SC-6-one-tier-per-host: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-6-one-tier-per-host',
    skill: 'source-credibility-model',
    section: 'Canonical Institutional Tier (Phase 0\')',
    text: 'One canonical institutional tier per host group (registrable domain = institution; documented super-domain exceptions: europa.eu subdomains distinct, legislation.gov.uk distinct from gov.uk); a host with rows at inconsistent base_tier and no explicit tier_override is the duplicate-row defect.',
    anchor: 'one canonical institutional tier per host group',
    enforcedBy: ['audit:fsi-app/scripts/verify/one-tier-per-host-audit.mjs'],
    residual: 'The audit is the live-data guard (CI-with-secrets lane); the meta-gate proves the file is wired (exists + skill-cited) in the secret-less pre-push. Per-row tier_override (section 7 override columns, reason required, default none) is the only sanctioned multi-tier escape. The durable fix (one institutions row, sources FK) is the tracked institutions-table follow-on.',
  };
