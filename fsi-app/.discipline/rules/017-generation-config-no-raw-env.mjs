// Rule 017: Generation logic must not read raw process.env — knobs live in generation-config.ts.
// Governing skills: environmental-policy-and-innovation + analysis-construction-spec (G).
// Content-verifiable. Closes red-team Finding 1: a knob like BROWSERLESS_FETCH_CONCURRENCY read
// inline from process.env changes generation behavior with NO reviewable G-diff and slips the
// mechanical trigger. Forcing knobs into a named-constant module makes every tuning a visible diff.
//
// Trigger: a staged generation file (skill-map G files), excluding the config module itself.
// Check:   FAIL on any `process.env.` read in those files.

import { pass, fail } from '../lib/result.mjs';

// Rule 017 targets TUNING KNOBS (behavior-changing config), not CREDENTIALS. Credentials/secrets
// (API keys, DB URL, tokens) legitimately read from env at point of use and cannot be named
// constants in a config module — flagging them was an over-broad false-positive (caught in CI on
// canonical-pipeline.ts credential reads). A line is a violation only if it reads a NON-credential
// env var (a knob). Credential-shaped names are exempt.
const ENV_TOKEN_RE = /process\.env(?:\.([A-Z0-9_]+)|\[\s*['"`]([A-Z0-9_]+)['"`]\s*\])/g;
const CREDENTIAL_RE = /(API_KEY|ANON_KEY|SERVICE_ROLE_KEY|_SECRET|_TOKEN|_PASSWORD|_PASS\b|SUPABASE_URL|^NEXT_PUBLIC_|WORKER_SECRET|DATABASE_URL)/;

// Returns the non-credential (knob) env identifiers read on a line, or [] if none.
function knobEnvReads(line) {
  const out = [];
  ENV_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = ENV_TOKEN_RE.exec(line))) {
    const ident = m[1] || m[2];
    if (ident && !CREDENTIAL_RE.test(ident)) out.push(ident);
  }
  return out;
}

// Generation files (mirrors governance/skill-map G entries) — the config module is the ONE
// place env is allowed to be read and surfaced as named constants.
const GEN_FILES = [
  'fsi-app/src/lib/agent/canonical-pipeline.ts',
  'fsi-app/src/lib/agent/system-prompt.ts',
  'fsi-app/src/lib/agent/parse-output.ts',
  'fsi-app/src/lib/agent/format-spec.ts',
  'fsi-app/src/lib/agent/extract-registry.ts',
  // source-pool.ts entry removed 2026-07-11: file deleted (retired module, zero importers — audit CODE-1 F-04)
];
const GEN_DIRS = ['fsi-app/src/lib/agent/formats/'];
const CONFIG_FILE = 'fsi-app/src/lib/agent/generation-config.ts';

function norm(p) { return (p || '').replaceAll('\\', '/'); }
function isGenFile(p) {
  const n = norm(p);
  if (n === CONFIG_FILE) return false;             // the sanctioned env-reading module
  if (GEN_FILES.includes(n)) return true;
  return GEN_DIRS.some((d) => n.startsWith(d) && n.endsWith('.ts'));
}

function relevant(ctx) {
  return ctx.stagedFiles.filter((f) => f.status !== 'D' && isGenFile(f.path));
}

export const rule = {
  id: '017',
  name: 'Generation config — no raw env',
  description: 'Generation/grounding files must not read process.env directly; declare knobs as named constants in src/lib/agent/generation-config.ts so tuning is a reviewable G-diff.',
  ruleSource: 'governance/skill-map → environmental-policy-and-innovation + analysis-construction-spec; red-team Finding 1',

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
        const knobs = knobEnvReads(lines[i]);
        if (knobs.length) violations.push(`${norm(f.path)}:${i + 1} (${knobs.join(', ')})`);
      }
    }
    if (violations.length === 0) return pass();
    return fail({
      message: `Raw process.env KNOB read(s) in generation logic (${violations.length}) — tuning knobs must live in generation-config.ts (credentials are exempt).`,
      remediation: [
        'Move the env-driven knob into src/lib/agent/generation-config.ts as a named export, then import it.',
        'This makes a behavior change a reviewable G-diff (an env-only change is invisible to review).',
        'Locations:',
        ...violations.map((v) => `    ${v}`),
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
