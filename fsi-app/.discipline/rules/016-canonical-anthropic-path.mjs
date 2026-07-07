// Rule 016: Claude/Anthropic calls must go through the canonical path, not a direct API call.
// Governing skill: the agent contract (CLAUDE.md AGENT ARCHITECTURE — permitted routes) +
// source-of-truth generation path. Content-verifiable (012-style): read staged bytes, FAIL on a
// direct Anthropic call in a file OUTSIDE the permitted set.
//
// This is the exact bypass that caused source_citations to never populate (a direct API call
// during the exemplar instead of /api/agent/run). Verifies the real call site, not a trailer.
//
// Trigger: any staged code file.
// Check:   FAIL if a direct Anthropic call appears outside the permitted wrappers/routes.

import { pass, fail } from '../lib/result.mjs';

// Direct Anthropic usage signals.
const DIRECT_CALL_RE = /api\.anthropic\.com|new\s+Anthropic\s*\(|anthropic\.messages\.create|@anthropic-ai\/sdk/;

const CODE_EXT = ['.ts', '.tsx', '.mjs', '.js'];

// The ONLY places a direct Anthropic call is permitted (the canonical wrappers + sanctioned routes).
const PERMITTED = [
  'fsi-app/scripts/lib/anthropic.mjs',                 // the canonical script wrapper (path of least resistance)
  'fsi-app/src/app/api/agent/run/',                    // canonical per-item generation route
  'fsi-app/src/app/api/ask/',                          // user Q&A route
  'fsi-app/src/app/api/admin/scan/',                   // admin scan route
  'fsi-app/src/app/api/admin/sources/recommend-classification/',
  'fsi-app/src/app/api/admin/canonical-sources/',
  'fsi-app/src/app/api/admin/spot-check/recurring/',   // monthly calibration spot-check: re-classifies a source sample via the verification Haiku (source classification, sanctioned per CLAUDE.md permitted-routes table — NOT brief generation; mirrors recommend-classification)
  'fsi-app/src/lib/llm/first-fetch-classify.ts',       // shared first-fetch Haiku CLASSIFIER for the drain worker (~$0.001/call, wave1b investigation 2026-05-11): source classification/enrichment, NOT brief generation and never populates source_citations — same sanctioned Haiku-classifier class as recommend-classification/spot-check. Enumerated 2026-07-01 (phase-intake-gate) when the file was first re-committed under rule 016.
  'fsi-app/src/lib/agent/canonical-pipeline.ts',       // canonical pipeline (calls the route's model)
  'fsi-app/src/lib/agent/anthropic-stream.mjs',        // canonical STREAMING call site (used by the above + scripts/lib/anthropic.mjs)
  'fsi-app/src/lib/llm/spend-client.ts',               // THE spend chokepoint (2026-07-04) — spendStream/spendSearch; F15 enforces routing THROUGH it
];

function norm(p) { return (p || '').replaceAll('\\', '/'); }
function isCode(p) { return CODE_EXT.some((e) => norm(p).endsWith(e)); }
function isPermitted(p) { const n = norm(p); return PERMITTED.some((pre) => n === pre || n.startsWith(pre)); }

function relevant(ctx) {
  return ctx.stagedFiles.filter((f) => {
    const p = norm(f.path);
    if (f.status === 'D') return false;
    if (!isCode(p)) return false;
    if (p.includes('node_modules/')) return false;
    if (p.includes('/scripts/_diag/')) return false;
    if (p.includes('/.discipline/')) return false;      // the discipline engine references the API pattern to ENFORCE it (F15 + tests), never to call it
    if (isPermitted(p)) return false;
    return true;
  });
}

export const rule = {
  id: '016',
  name: 'Canonical Anthropic path',
  description: 'Direct Anthropic API calls are only permitted in the canonical wrappers/routes. Elsewhere, route through scripts/lib/anthropic.mjs or /api/agent/run.',
  ruleSource: 'CLAUDE.md AGENT ARCHITECTURE (permitted routes); operating-mechanism build (canonical-path guard)',

  trigger(ctx) {
    if (ctx.isMergeCommit || ctx.isRevertCommit) return false;
    return relevant(ctx).length > 0;
  },

  check(ctx) {
    const violations = [];
    for (const f of relevant(ctx)) {
      const content = ctx.getFileContent(f.path);
      if (!content) continue;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (DIRECT_CALL_RE.test(lines[i])) violations.push(`${norm(f.path)}:${i + 1}`);
      }
    }
    if (violations.length === 0) return pass();
    return fail({
      message: `Direct Anthropic API call(s) outside the canonical path in ${violations.length} location(s).`,
      remediation: [
        'Route Claude calls through the canonical path so spend-cap + provenance wiring are preserved:',
        "  scripts:  import { canonicalGenerate } from './lib/anthropic.mjs'",
        '  app:      call POST /api/agent/run (per-item) or the sanctioned /api/ask, /api/admin/scan routes',
        'Direct calls bypassed /api/agent/run before and source_citations never populated.',
        'Locations:',
        ...violations.map((v) => `    ${v}`),
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
