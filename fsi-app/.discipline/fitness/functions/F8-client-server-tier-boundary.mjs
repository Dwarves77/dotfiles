// F8: Client-server tier boundary. Client-side code must not assign to tier-shaped
// fields in fetch/POST/PUT request bodies. Tier handling occurs server-side only.
// Source: OBS-62 (Phase 1.5 architectural-decision-in-docstring gap) + Sprint
// Architecture dispatch (operator-specified).
//
// Rationale: Phase 1.5 closure preserved the server-centric dual-write design
// (server reads body.tier, writes both base_tier + effective_tier columns) via
// documentation comments only. Absent F8, future client code could write
// body.tier or body.base_tier or body.effective_tier directly, bypassing the
// server-side dual-write mechanism. F8 closes that gap mechanically.
//
// Scope (client-side files; server routes excluded):
//   - fsi-app/src/components/**/*.{ts,tsx}
//   - fsi-app/src/app/**/*.tsx     (page components only; .ts files in app/api/ skipped)
//   - fsi-app/src/stores/**/*.ts
//   - fsi-app/src/hooks/**/*.ts
//
// EXCLUDED:
//   - fsi-app/src/app/api/**/*.ts (server route handlers; allowed to dual-write)
//   - fsi-app/src/lib/**/*.ts (server library code; allowed to dual-write)
//
// Check pattern: forbid assignments to body.tier, body.base_tier, body.effective_tier
//                AND object literals containing tier/base_tier/effective_tier keys
//                that are passed to fetch/POST/PUT request bodies.
//
// Override: trailing `// fitness-allow: F8 (reason)` on the matching line.

import { violation, PASS } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';

// Match direct assignments: body.tier = ...; body.base_tier = ...; body.effective_tier = ...
const BODY_TIER_ASSIGNMENT_RE = /\bbody\.(tier|base_tier|effective_tier)\s*=/g;

// Match object-literal keys (in JSON.stringify, fetch body, etc.):
// { tier: ..., }  or  { base_tier: ... }  or  { effective_tier: ... }
// Heuristic: a key-value pair followed by comma or close-brace, on a line that also looks
// like it's inside an object passed to fetch/POST.
// Simpler heuristic: any `{ ... tier: ..., ... }` inside a JSON.stringify or fetch body call.
// Even simpler for v1: flag any object-literal property assignment to tier|base_tier|effective_tier
// that appears within 5 lines of a fetch/POST/PUT/JSON.stringify call.

const OBJECT_LITERAL_TIER_RE = /\{[^{}]*\b(tier|base_tier|effective_tier)\s*:[^{}]*\}/g;

export const fitnessFunction = {
  id: 'F8',
  name: 'client-server-tier-boundary',
  description: 'Client-side code must not write tier-shaped fields to request bodies. Server (API routes) handles base_tier + effective_tier dual-write; client sends operator-chosen value via a semantically named field.',
  source: 'OBS-62 (Phase 1.5 architectural-decision-in-docstring gap) + Sprint Architecture dispatch',

  enumerate() {
    const candidates = globFiles([
      'fsi-app/src/components/**/*.{ts,tsx}',
      'fsi-app/src/app/**/*.tsx',
      'fsi-app/src/stores/**/*.ts',
      'fsi-app/src/hooks/**/*.ts',
    ]);
    // Defensive: exclude any file that ended up matching but is under app/api/
    return candidates.filter((p) => !p.startsWith('fsi-app/src/app/api/'));
  },

  check(filepath, content) {
    const violations = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isOverridden(line, 'F8')) continue;

      // Strip line comments to avoid false-positives on commentary mentioning body.tier
      const codePart = line.split('//')[0];

      // Pattern 1: direct assignment
      BODY_TIER_ASSIGNMENT_RE.lastIndex = 0;
      let m1;
      while ((m1 = BODY_TIER_ASSIGNMENT_RE.exec(codePart)) !== null) {
        violations.push(violation(
          i + 1,
          `Client-side assignment to body.${m1[1]}. Client must not write tier-shaped fields; tier handling is server-side only. Send a semantically-named field (e.g., body.assignedTier or body.classifierTier) and update the corresponding server handler to read the new field. Override: trailing \`// fitness-allow: F8 (reason)\`.`,
        ));
      }

      // Pattern 2: object literal with tier key, near a fetch/post call
      // To reduce false-positives, only flag if a fetch/POST/PUT/JSON.stringify
      // appears within 5 lines after the object literal.
      OBJECT_LITERAL_TIER_RE.lastIndex = 0;
      let m2;
      while ((m2 = OBJECT_LITERAL_TIER_RE.exec(codePart)) !== null) {
        const nearbyContext = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (/\bfetch\(|\bJSON\.stringify\(|\bmethod\s*:\s*['"](POST|PUT|PATCH)['"]/i.test(nearbyContext)) {
          violations.push(violation(
            i + 1,
            `Object literal contains tier-shaped field "${m2[1]}" near a fetch/POST/PUT/JSON.stringify call. Client must not include tier fields in request bodies. Override: trailing \`// fitness-allow: F8 (reason)\`.`,
          ));
        }
      }
    }

    // De-dupe violations on same line (pattern 1 and pattern 2 could both fire)
    const seen = new Set();
    return violations.filter((v) => {
      const key = `${v.line}:${v.message.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
};
