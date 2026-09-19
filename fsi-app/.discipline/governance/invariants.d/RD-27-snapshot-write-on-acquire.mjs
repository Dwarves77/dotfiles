// RD-27-snapshot-write-on-acquire: split from invariants.mjs (plan 6.8, Rule A, lane N5). One entry, one file; see
// invariants.d/README.md. The comment block below (if any) is exactly what preceded this entry in
// the array before the split.

export const invariant = {
    id: 'RD-27-snapshot-write-on-acquire',
    skill: 'remediation-discipline',
    section: 'Section 4 — category 18: Snapshot-first grounding (acquisition is locked by default)',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    text: 'An acquiring run MUST write the acquired content to the snapshot store (raw_fetches + the gzipped body in Storage). No acquisition may leave raw_fetches unwritten — that is the abandoned-store defect (660 May snapshots written once, never re-populated, never read).',  // glyph:verbatim (unedited content carried over from invariants.mjs; see invariants.d/README.md)
    anchor: 'An acquiring run MUST write the acquired content to the snapshot store',
    enforcedBy: ['selftest:fsi-app/src/lib/sources/snapshot-store.test.mjs'],
    residual: 'I3. snapshot-store.test.mjs proves writeSnapshot builds the canonical storage key and upserts idempotently by content_hash, and refuses a sourceId-less write. The write is wired into the paid-acquire path in the workflow-rewire block (item 3).',
  };
