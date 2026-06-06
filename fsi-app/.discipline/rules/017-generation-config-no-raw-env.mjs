// Rule 017: Generation logic must not read raw process.env — knobs live in generation-config.ts.
// Governing skills: environmental-policy-and-innovation + analysis-construction-spec (G).
// Content-verifiable. Closes red-team Finding 1: a knob like BROWSERLESS_FETCH_CONCURRENCY read
// inline from process.env changes generation behavior with NO reviewable G-diff and slips the
// mechanical trigger. Forcing knobs into a named-constant module makes every tuning a visible diff.
//
// Trigger: a staged generation file (skill-map G files), excluding the config module itself.
// Check:   FAIL on any `process.env.` read in those files.

import { pass, fail } from '../lib/result.mjs';

const ENV_READ_RE = /process\.env\./;

// Generation files (mirrors governance/skill-map G entries) — the config module is the ONE
// place env is allowed to be read and surfaced as named constants.
const GEN_FILES = [
  'fsi-app/src/lib/agent/canonical-pipeline.ts',
  'fsi-app/src/lib/agent/system-prompt.ts',
  'fsi-app/src/lib/agent/parse-output.ts',
  'fsi-app/src/lib/agent/format-spec.ts',
  'fsi-app/src/lib/agent/extract-registry.ts',
  'fsi-app/src/lib/agent/source-pool.ts',
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
        if (ENV_READ_RE.test(lines[i])) violations.push(`${norm(f.path)}:${i + 1}`);
      }
    }
    if (violations.length === 0) return pass();
    return fail({
      message: `Raw process.env read(s) in generation logic (${violations.length}) — knobs must live in generation-config.ts.`,
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
