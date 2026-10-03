// F69: model-id literal. No hardcoded Anthropic model-id string literal ("claude-haiku-...",
// "claude-sonnet-...", "claude-opus-...") may exist outside the single shared home
// (src/lib/llm/model-ids.mjs) and metered-gate.mjs's OWN security allowlist. Source: lane MODEL-IDS
// (2026-10-02), following lane L8's extraction of HAIKU_MODEL. A repo-wide grep found the SAME literal
// hand-typed independently in haiku-classify.ts, first-fetch-classify.ts, verification.ts,
// recommend-source-tier.ts, canonical-pipeline.ts, spend-client.ts (x3), two-pass-generate.mjs,
// generation-config.ts, three admin classification routes, spot-check/recurring/route.ts, ask/route.ts
// (x2), and two review-card display fallbacks: fourteen independent drift points for two string
// constants. This is the remediation-discipline class fix (fsi-app/.claude/skills/remediation-discipline):
// extract the primitive (model-ids.mjs), convert every known instance, then gate the class so a fifteenth
// copy cannot land unnoticed.
//
// metered-gate.mjs's METERED_MODEL_ALLOWLIST / SCOPED_MODEL_AMENDMENTS are a DELIBERATE exception: a
// security allowlist names its own values so it cannot silently widen if model-ids.mjs's constants ever
// changed (see that file's own header comment). metered-gate.test.mjs asserts the two stay in agreement.

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// A quoted Anthropic model-id literal: "claude-haiku-...", "claude-sonnet-...", "claude-opus-...", in
// either quote style. Matches the literal wherever it appears on a line (an assignment, a call argument,
// a default, a template-literal fallback). The point is ANY hardcoded copy outside the sanctioned homes.
export const MODEL_ID_LITERAL_RE = /["'`]claude-(?:haiku|sonnet|opus)-[a-z0-9.-]+["'`]/i;

// The single shared home. Declares the literals once; everything else imports them.
export const CANONICAL_HOME = 'fsi-app/src/lib/llm/model-ids.mjs';

// metered-gate.mjs: a DELIBERATE security-allowlist exception (own values, never imported). See header.
export const SECURITY_ALLOWLIST_FILES = new Set([
  'fsi-app/src/lib/llm/metered-gate.mjs',
]);

/** Lines (1-indexed) in `content` that carry a hardcoded model-id literal, ignoring comment/JSDoc lines
 *  and lines carrying an F69 override. A comment line is excluded because the literal there is prose
 *  (a drift note, a cost-estimate doc comment), never a live value a caller reads. */
export function modelIdLiteralLines(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (MODEL_ID_LITERAL_RE.test(line) && !isOverridden(line, 'F69')) out.push(i + 1);
  }
  return out;
}

export const fitnessFunction = {
  id: 'F69',
  name: 'model-id-literal',
  description: 'No hardcoded Anthropic model-id string literal outside src/lib/llm/model-ids.mjs and metered-gate.mjs\'s own security allowlist. Import HAIKU_MODEL / SONNET_MODEL instead. Override (single line): `// fitness-allow: F69 (reason)`.',
  source: 'lane MODEL-IDS (2026-10-02), remediation-discipline class fix following lane L8\'s HAIKU_MODEL extraction',

  enumerate() {
    // Test files construct model-id-looking strings as fixtures (metered-gate.test.mjs, spend-client
    // .npmtest.mjs, first-fetch-classify.npmtest.mjs, spend-health.test.mjs). The portability + fixture
    // conventions already govern those; F15's sibling gate excludes them for the identical reason.
    return globFiles(['fsi-app/src/lib/**/*.{ts,tsx,mjs}', 'fsi-app/src/app/**/*.{ts,tsx}', 'fsi-app/src/components/**/*.{ts,tsx}', 'fsi-app/scripts/**/*.mjs'])
      .filter((p) => !/\.(test|selftest|npmtest)\.(ts|tsx|mjs)$/.test(p))
      .filter((p) => p !== CANONICAL_HOME);
  },

  check(filepath, content) {
    if (SECURITY_ALLOWLIST_FILES.has(filepath)) return [];
    return modelIdLiteralLines(content).map((ln) =>
      violation(
        ln,
        `Hardcoded Anthropic model-id literal outside the shared home. Import HAIKU_MODEL / SONNET_MODEL from ${CANONICAL_HOME} instead. Override (single line): \`// fitness-allow: F69 (reason)\`.`,
      ),
    );
  },
};
