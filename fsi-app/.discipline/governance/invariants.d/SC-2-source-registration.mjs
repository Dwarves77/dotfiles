// SC-2-source-registration: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'SC-2-source-registration',
    skill: 'source-credibility-model',
    section: 'Section 5: Source Discovery Loop',
    text: 'A source-not-item is REGISTERED as a scannable source (never archived-without-registration); archiving a row AS a source without a registered active source orphans the scanner.',
    anchor: 'Source Discovery Loop',
    enforcedBy: [
      'rule:019',
      'audit:fsi-app/scripts/verify/orphan-source-audit.mjs',
      'migration:135',
    ],
    residual: 'rule 019 = commit-time (scripts); migration 135 = DB guard on NEW writes; orphan-source-audit = live-data scan that must reach 0 to clear pre-existing orphans. db.mjs reclassifyToSource() is the safe path all three steer toward.',
  };
