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
