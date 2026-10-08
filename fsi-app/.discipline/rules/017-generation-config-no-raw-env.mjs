// Rule 017: Generation logic must not read raw process.env — knobs live in generation-config.ts.
// Governing skills: environmental-policy-and-innovation + analysis-construction-spec (G).
// Content-verifiable. Closes red-team Finding 1: a knob like BROWSERLESS_FETCH_CONCURRENCY read
// inline from process.env changes generation behavior with NO reviewable G-diff and slips the
// mechanical trigger. Forcing knobs into a named-constant module makes every tuning a visible diff.
//
// Trigger: a staged generation file (skill-map G files), excluding the config module itself.
// Check:   FAIL on a `process.env.` knob read that the commit INTRODUCES in those files. Scope is
//          introduced lines (lane GATE-1, 2026-10-08): a read already on a line the commit edits, or
//          moved from elsewhere in the diff, is not charged (ctx.introducedLines, lib/context.mjs).
//
// HONEST FORMS (lane GATE-7, 2026-10-08, attacks A017-1 to A017-9 of the AUD-AT-3 register):
//   * the generation files are DERIVED from governance/skill-map.mjs (every G-class file or directory under
//     src/lib/agent/), not kept as a second list here, so a new generator file is covered the day it exists;
//   * a destructured read (`const { KNOB } = process.env`), an optional chain (`process?.env.KNOB`), a
//     bracket read and `import.meta.env` are reads of the same environment;
//   * an alias (`const e = process.env`, a spread) and a computed key (`process.env[name]`) cannot be
//     resolved to a name, so the line that creates them is charged;
//   * the credential exemption is read at the END of the name (`..._TOKEN`), so a knob whose name merely
//     contains the word (`GEN_TOKEN_BUDGET`) is a knob;
//   * an edit that adds another read to a line that already had one is charged for the surplus.
// A binary file is rule 023's finding.

import { pass, fail } from '../lib/result.mjs';
import { introducedMatches } from '../lib/context.mjs';
import { GOVERNED } from '../governance/skill-map.mjs';

// Rule 017 targets TUNING KNOBS (behavior-changing config), not CREDENTIALS. Credentials/secrets
// (API keys, DB URL, tokens) legitimately read from env at point of use and cannot be named
// constants in a config module — flagging them was an over-broad false-positive (caught in CI on
// canonical-pipeline.ts credential reads). A line is a violation only if it reads a NON-credential
// env var (a knob). Credential-shaped names are exempt, by their ENDING.
const CREDENTIAL_RE = /(?:API_KEY|ANON_KEY|SERVICE_ROLE_KEY|_SECRET|_TOKEN|_PASSWORD|_PASS|SUPABASE_URL|WORKER_SECRET|DATABASE_URL)$|^NEXT_PUBLIC_/;

const ENV = String.raw`(?:process\s*(?:\?\.|\.)\s*env|import\s*\.\s*meta\s*\.\s*env)`;
// process.env.NAME, process?.env?.NAME, process.env["NAME"], import.meta.env.NAME
const NAMED_RE = new RegExp(String.raw`${ENV}\s*(?:\?\.\s*|\.\s*)([A-Za-z_][A-Za-z0-9_]*)`, 'g');
const BRACKET_NAMED_RE = new RegExp(String.raw`${ENV}\s*(?:\?\.\s*)?\[\s*["'\x60]([A-Za-z_][A-Za-z0-9_]*)["'\x60]\s*\]`, 'g');
const COMPUTED_RE = new RegExp(String.raw`${ENV}\s*(?:\?\.\s*)?\[\s*(?!["'\x60]\s*[A-Za-z_][A-Za-z0-9_]*\s*["'\x60]\s*\])`);
const DESTRUCTURE_RE = new RegExp(String.raw`\{([^{}]*)\}\s*=\s*${ENV}\b(?!\s*(?:\?\.|\.|\[))`);
const ALIAS_RE = new RegExp(String.raw`(?:=\s*|\.\.\.)${ENV}\s*(?:;|,|\)|\}|$)`);

// The identifiers of the env reads on a line (names, plus <alias> and <computed> for the forms that cannot
// be resolved). Credential names are included here; knobEnvReads filters them.
function envReads(line) {
  const text = String(line);
  const out = [];
  for (const m of text.matchAll(NAMED_RE)) out.push(m[1]);
  for (const m of text.matchAll(BRACKET_NAMED_RE)) out.push(m[1]);
  const d = DESTRUCTURE_RE.exec(text);
  if (d) {
    for (const part of d[1].split(',')) {
      const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(part);
      if (name) out.push(name[1]);
    }
  }
  if (!d && ALIAS_RE.test(text)) out.push('<whole-env alias>');
  if (COMPUTED_RE.test(text)) out.push('<computed key>');
  return out;
}

// Returns the non-credential (knob) env identifiers read on a line, or [] if none.
function knobEnvReads(line) {
  return envReads(line).filter((ident) => ident.startsWith('<') || !CREDENTIAL_RE.test(ident));
}

const hasKnobRead = (line) => knobEnvReads(line).length > 0;

// Generation files: derived from the governance skill-map, the one list the commit rules and the PreToolUse
// gate share. G-class entries under src/lib/agent/ are the generation logic; the config module is the ONE
// place env is allowed to be read and surfaced as named constants.
const CONFIG_FILE = 'fsi-app/src/lib/agent/generation-config.ts';
const GEN_PATTERNS = GOVERNED
  .filter((g) => g.classes.includes('G'))
  .flatMap((g) => g.files)
  .filter((f) => f.startsWith('fsi-app/src/lib/agent/'));
const GEN_EXT_RE = /\.(ts|tsx|mts|mjs|js|cjs)$/;
const TEST_FILE_RE = /\.(test|spec|npmtest|selftest|golden)\.[a-z]+$/;

function norm(p) { return (p || '').replaceAll('\\', '/'); }
function isGenFile(p) {
  const n = norm(p);
  if (n === CONFIG_FILE) return false;
  if (!GEN_EXT_RE.test(n) || TEST_FILE_RE.test(n)) return false;
  return GEN_PATTERNS.some((pat) => (pat.endsWith('/') ? n.startsWith(pat) : n === pat));
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
    const locations = [];
    for (const f of relevant(ctx)) {
      for (const pair of introducedMatches(ctx.introducedLines(f.path), hasKnobRead, knobEnvReads)) {
        violations.push(`${norm(f.path)}:${pair.line} (${knobEnvReads(pair.added).join(', ')})`);
        locations.push({ path: norm(f.path), line: pair.line });
      }
    }
    if (violations.length === 0) return pass();
    return fail({
      locations,
      message: `Raw process.env KNOB read(s) in generation logic (${violations.length}) — tuning knobs must live in generation-config.ts (credentials are exempt).`,
      remediation: [
        'Move the env-driven knob into src/lib/agent/generation-config.ts as a named export, then import it.',
        'This makes a behavior change a reviewable G-diff (an env-only change is invisible to review).',
        'An alias of process.env or a computed key cannot be told from a knob read: read the named variable instead.',
        'Locations:',
        ...violations.map((v) => `    ${v}`),
        'Bypass (sparingly): git commit --no-verify',
      ].join('\n  '),
    });
  },
};
