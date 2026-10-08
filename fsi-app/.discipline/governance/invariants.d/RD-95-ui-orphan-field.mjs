// RD-95: registered by lane AUDWIRE-1 (2026-10-08, VERIFY-1 register row B-3). One entry, one file; see invariants.d/README.md.
// Id picked as the next free RD number: master's highest was RD-93 and open PR 1013 (MIG-HIST-1b) holds RD-94
// (checked against every origin branch's invariants.d on 2026-10-08). The lane brief named no id; disclosed in the
// lane's session-log entry for the coordinator to re-number if it collides with a concurrently registered id.

export const invariant = {
  id: 'RD-95-ui-orphan-field',
  skill: 'remediation-discipline',
  section: 'Section 4: Remediation Strategy by Category',
  text: 'A field a UI-facing read selects (an API route, a page, a component, the server-data layer) must have at least one producer: a code write whose literal payload names the column, a SQL INSERT or UPDATE that names it, an RPC whose own function body writes it, or a table write whose payload the parser cannot trace. A UI-selected, in-scope (not PK, FK, generated or timestamp) table.column with zero producers anywhere and no reasoned entry in scripts/verify/ui-orphan-allowlist.json fails the HARD data-audit-lane audit ui-orphan, and so does an allowlist entry whose column is gone or now has a writer. This is the FIELD-grain sibling of RD-9 (F14 is table-grain). The audit also ENUMERATES every in-scope UI-selected field as one register row (component, prop, bound column, producer present yes or no, basis) written to fsi-app/.discipline/out/ui-orphan-register.md and printed for producer=no, so the B-3 field list is produced by a run instead of remembered. Before AUDWIRE-1 the audit carried a soft marker, so a live orphan never failed the lane.',
  anchor: 'Producer-consumer orphan (the half-slice defect)',
  enforcedBy: [
    'audit:fsi-app/scripts/verify/ui-orphan-audit.mjs',
    'selftest:fsi-app/scripts/verify/ui-orphan-audit.test.mjs',
    'selftest:fsi-app/scripts/verify/lib/ui-orphan-scan.test.mjs',
  ],
  residual: 'The audit needs live credentials: without them it self-skips (exit 2) and proves nothing about live columns, and the data-audit lane is workflow_dispatch only during build mode (the workflow header, operator ruling 2026-08-11), so a run happens when dispatched. The producer scan is lexical and conservative: a write whose payload is a variable is an opaque producer for every column of that table (it can hide a genuinely unwritten column), a select string built from a template or variable is not parsed, and an alias in a select list is dropped by the scanner, so the register prop is the selected column name. The register file is gitignored and survives a CI run only as the uploaded artifact of the data-audit-lane workflow (7 day retention, F68), so a reader after that window has only the producer=no rows in the job log.',
};
