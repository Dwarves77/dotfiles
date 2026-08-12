// Recorded governance exemptions. The wire-or-exempt rule: every file on the GOVERNED SURFACE
// (writes data / calls model / defines routing / carries a proof) is either covered by the
// skill-map + a verifier, OR exempted HERE WITH A REASON. Exemption is never silent — an item
// missing from both coverage and this registry is a GAP the coverage scan reports.
//
// Each entry: { match, kinds, reason, by }. `match` is a path prefix or substring; `kinds` limits
// the exemption to specific governed categories (e.g. ['writes'] exempts only the data-write
// classification, not proof/model). Omit `kinds` to exempt the path entirely.

export const EXEMPTIONS = [
  {
    match: 'fsi-app/src/lib/contracts/corridor-id.mjs',
    kinds: ['writes'],
    reason:
      'FALSE POSITIVE, not a write. WRITE_RE matches `.update(` and this module calls ' +
      'createHash("sha256").update(payload) — a crypto digest update, not a Supabase mutation. The file ' +
      'imports node:crypto and nothing else; it has no DB client and cannot reach the database. ' +
      'FOLLOW-UP (evidence, not a request to relax the gate): this false-positive CLASS will recur, ' +
      'because Map.delete(), Set.delete() and hash.update() are ordinary JS. The durable fix is to ' +
      'require a db-client OR scripts/lib/db.mjs import as a precondition for the WRITES ' +
      'classification. Deliberately NOT done inside this unit: narrowing a governance detector needs ' +
      'its own change with a before/after count on all 21 current unmapped writes, so it cannot ' +
      'silently mask a real one.',
    by: 'corridor-identity unit 2026-08-12',
  },
  {
    match: 'fsi-app/scripts/_diag/',
    reason: 'Read-only diagnostic convention — investigation scripts, no production writes. (A _diag that actually mutates data is itself a smell; rule 015 still scans content.)',
    by: 'operating-mechanism build 2026-06-06',
  },
  {
    match: 'fsi-app/scripts/lib/db.mjs',
    kinds: ['writes'],
    reason: 'The guarded-write helper itself — it IS the sanctioned write surface; its raw write call is the implementation, not a bypass.',
    by: 'operating-mechanism build 2026-06-06',
  },
  {
    match: 'fsi-app/scripts/lib/anthropic.mjs',
    kinds: ['model'],
    reason: 'The canonical Anthropic wrapper itself — the sanctioned direct-call site.',
    by: 'operating-mechanism build 2026-06-06',
  },
  // USER-ACCOUNT PLUMBING (2026-08-11, operator wiring census — wire-or-exempt, exempt side). These
  // write PER-USER preference / notification / auth-provisioning / telemetry rows, RLS-guarded and
  // route-auth-gated — not the intelligence corpus (sources / items / facts / trust) the governing
  // skills exist to protect. No skill governs account plumbing BY DESIGN; mapping one falsely would be
  // the over-mapping-decays-to-ceremony failure the skill-map header names. Grouped, not globbed wide:
  // each entry names the surface so a NEW corpus-writing file in these dirs still gaps unless it lands
  // in exactly these paths.
  {
    match: 'fsi-app/src/components/profile/',
    kinds: ['writes'],
    reason: 'User profile + notification-preference UI — per-user preference rows only.',
    by: 'wiring census 2026-08-11',
  },
  {
    match: 'fsi-app/src/components/settings/',
    kinds: ['writes'],
    reason: 'Briefing-schedule settings UI — per-user schedule rows only.',
    by: 'wiring census 2026-08-11',
  },
  {
    match: 'fsi-app/src/stores/settingsStore.ts',
    kinds: ['writes'],
    reason: 'Client settings store — per-user preference persistence.',
    by: 'wiring census 2026-08-11',
  },
  {
    match: 'fsi-app/src/lib/auth/provision-personal-workspace.ts',
    kinds: ['writes'],
    reason: 'First-login workspace provisioning — per-user org/workspace bootstrap rows.',
    by: 'wiring census 2026-08-11',
  },
  {
    match: 'fsi-app/src/lib/notifications/',
    kinds: ['writes'],
    reason: 'Notification dispatch + fallback flag — delivery bookkeeping rows, fail-open by design.',
    by: 'wiring census 2026-08-11',
  },
  {
    match: 'fsi-app/src/lib/telemetry/',
    kinds: ['writes'],
    reason: 'Error-capture telemetry — deliberately fail-open (capture-error.ts header contract); rows are diagnostics, never corpus data.',
    by: 'wiring census 2026-08-11',
  },
  {
    match: 'fsi-app/src/lib/agent/anthropic-stream.mjs',
    kinds: ['model'],
    reason:
      'The streaming transport the spend chokepoint wraps. F15 names it in SANCTIONED alongside ' +
      'src/lib/llm/spend-client.ts, so it is governed by a live fitness function — it was reported as an ' +
      'ungoverned model call only because this scan asks "does a SKILL map it?" and F15 is a mechanism, ' +
      'not a skill. Exempting for the model kind records the real disposition instead of leaving a ' +
      'permanent phantom gap; the file stays fully in F15 scope.',
    by: 'coverage-scan wiring 2026-08-11 (F23)',
  },
];

export function isExempt(path, kind) {
  const n = (path || '').replaceAll('\\', '/');
  for (const e of EXEMPTIONS) {
    if (!(n.startsWith(e.match) || n.includes(e.match))) continue;
    if (e.kinds && kind && !e.kinds.includes(kind)) continue;
    return e;
  }
  return null;
}
