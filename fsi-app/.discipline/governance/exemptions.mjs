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
    match: '-behaviour.sql',
    kinds: ['writes'],
    reason:
      'Hand-run behavioural PROOF fixtures for the migration codegen family (scripts/gen/' +
      'migration-NNN-behaviour.sql). They exist to be executed against a scratch database and to ' +
      'DEMONSTRATE what the migration CHECKs reject; they are not a production write path, are ' +
      'referenced by no lane, no route and no scheduled pass, and never run against live data. ' +
      'FINDING recorded rather than relied on (rule 14): migration-258-behaviour.sql was already ' +
      'on the covered side of this scan, but only INCIDENTALLY — it happens to contain a ' +
      '`DELETE FROM public.emission_factors` line, which matches remediation-discipline\'s ' +
      '/\\bDELETE\\s+FROM\\b/i op regex. Its coverage was an artefact of fixture content, not a ' +
      'governance decision. migration-268-behaviour.sql contains only INSERTs and therefore gapped, ' +
      'which is what surfaced the class. This entry states the rule for the whole family once, so ' +
      'the next behaviour fixture is decided rather than accidental in either direction.',
    by: 'Wave 4 producers (WO-16/17/18/20) coordinator, 2026-08-30',
  },
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
    match: 'fsi-app/src/lib/entities/entity-id.mjs',
    kinds: ['writes'],
    reason:
      'SAME FALSE POSITIVE as corridor-id.mjs above, same file shape: WRITE_RE matches `.update(` and ' +
      'entityId() calls createHash("sha256").update(payload) — a crypto digest update, not a Supabase ' +
      'mutation. The file imports only node:crypto and ../contracts/vocabularies.mjs; it has no DB client ' +
      'and cannot reach the database. Recorded here rather than left as a phantom gap, per the corridor-' +
      'id.mjs entry\'s own follow-up note that this class would recur.',
    by: 'Lane DP-SPINE, system-completion train, 2026-09-02',
  },
  {
    match: 'fsi-app/src/lib/community/organisation-key.mjs',
    kinds: ['writes'],
    reason:
      'SAME FALSE POSITIVE as corridor-id.mjs / entity-id.mjs above, same file shape: WRITE_RE matches ' +
      '`.update(` and deriveOrganisationKey() calls createHmac("sha256", salt).update(domain) — a crypto ' +
      'HMAC digest update, not a Supabase mutation. The file imports only node:crypto; it has no DB ' +
      'client and cannot reach the database (the module is deliberately PURE — see its own header). ' +
      'Recorded here per the corridor-id.mjs entry\'s own follow-up note that this class would recur.',
    by: 'Lane COMMUNITY-C, Wave 3, 2026-09-03',
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
  {
    match: 'fsi-app/src/lib/propagation/',
    kinds: ['writes'],
    reason:
      'The propagation engine (docs/specs/08-flywheel-design.md §2-§5) writes derived_values/' +
      'propagation_events/derivation_edges — corpus infrastructure, not content this repo\'s existing ' +
      'skills govern (environmental-policy-and-innovation/source-credibility-model/etc. all govern WHAT ' +
      'gets said about a corridor or an obligation; this directory governs HOW A COMPUTED VALUE IS ' +
      'INVALIDATED AND RECOMPUTED — an orthogonal concern with its own governance, already mechanised: ' +
      'migration 285\'s assert_acyclic()/RLS, migration 286\'s assert_statutory_purity(), and F31 ' +
      '(derived-values-gate)/F32 (statutory-purity) are live fitness functions enforcing this domain\'s ' +
      'invariants structurally. Same disposition as the anthropic-stream.mjs entry above: governed by a ' +
      'mechanism, not a skill — recording the real disposition here rather than mapping to an unrelated ' +
      'skill just to close the gap, or leaving a permanent phantom gap.',
    by: 'Lane DP-ENGINE, system-completion train, 2026-09-02',
  },
  {
    match: 'fsi-app/scripts/propagation/seed-derived-values',
    reason:
      'seed-derived-values.mjs performs the SAME class of write as the src/lib/propagation/ entry above ' +
      '(derived_values via registerDerivedValue\'s RPC, plus a direct estimated_values upsert — both ' +
      'corpus infrastructure the propagation engine owns, not skill-governed content) — this entry exists ' +
      'separately because the file lives under scripts/propagation/, one root up from src/lib/propagation/, ' +
      'so the existing match prefix does not reach it. No `kinds` restriction (unlike the entry above): ' +
      'this also covers seed-derived-values.test.mjs\'s ORPHANED-PROOF finding — that test is real and ' +
      'passing (`node --test scripts/propagation/seed-derived-values.test.mjs`) but is NOT wired into ' +
      '.discipline/run-test-suite.sh (scripts/propagation/ is not one of its covered globs, and that file ' +
      'is outside this lane\'s write set) — a documented, known gap, not an oversight; see the test file\'s ' +
      'own header and the lane\'s final report.',
    by: 'Lane DP-SURF, system-completion train, 2026-09-02',
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
