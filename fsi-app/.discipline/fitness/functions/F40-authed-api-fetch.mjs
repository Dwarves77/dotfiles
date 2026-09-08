// F40: A GUARDED /api/ ROUTE IS CALLED THROUGH THE ONE AUTHENTICATED FETCHER, NEVER A HAND-ROLLED
// HEADER. `requireAuth` (src/lib/api/auth.ts) reads the caller's identity from ONE place, the
// `Authorization: Bearer <jwt>` request header, and from nowhere else. A browser module that calls a
// requireAuth-guarded route without that header gets a 401 on every request from every signed-in
// user, and nothing in the build sees it: the route returns a well-formed JSON error, the component
// fails soft, and every mount-with-fixtures test still passes. That is exactly what happened to the
// whole workspace-tags feature (src/lib/tags/client.ts + useWorkspaceTagsFacet.ts sent
// `credentials: "include"` and a Content-Type, so the + Tag popover, the detail tag row and the list
// rail's facet were dead in production from the day they landed; the 2026-09-08 click-through audit
// read 23 `GET /api/workspace/tags 401` in three hours on a signed-in session).
//
// TWO RULES, both purely lexical and both decidable:
//
//   (a) NO HAND-ROLLED BEARER. No module under src/ may build the header itself, i.e. contain the
//       literal `Bearer ${`. Only src/lib/api/authed-fetch.ts (the shared builder) and the SERVER
//       side under src/app/api/ + src/lib/api/{auth,community-auth}.ts (which construct a Supabase
//       client FROM a token they already verified, the opposite direction) may. This is the rule
//       that kills the class: four of the deleted copies interpolated the token unconditionally
//       (`Bearer ${session?.access_token || ""}`, or literally the string "Bearer undefined"), which
//       passes requireAuth's `startsWith("Bearer ")` check and then 401s on any read that fires
//       before the session resolves.
//
//   (b) A GUARDED FETCH GOES THROUGH THE HELPER. A `fetch(` on a string/template literal beginning
//       `/api/` whose route file calls `requireAuth` must either be `authedFetch(...)` or sit in a
//       file that imports from "@/lib/api/authed-fetch" (the `authHeaders()` form, for the callers
//       that need the headers object itself — a singleton hook distinguishing "signed out" from
//       "request failed", or a call whose headers are threaded through an injected `fetchImpl`).
//
// WHAT IS NOT DECIDABLE HERE, stated plainly rather than faked. Rule (b) cannot prove that the
// `headers` value a bare `fetch()` receives actually came from `authHeaders()` — that needs dataflow
// this engine does not have. Rule (a) is what closes that hole: the only way to produce a bearer
// header in this codebase is `authHeaders`/`authedFetch`, because writing one by hand is itself RED.
// A dynamically-built path (`fetch(url)` where `url` is a variable) is likewise invisible to (b);
// (a) still binds it, and the route's own requireAuth still rejects it, so the failure is loud at
// the call rather than silent.
//
// Source: production defect TAGS-401 (click-through audit 2026-09-08, train 61). Companion proof:
// F40-authed-api-fetch.test.mjs (red-then-green + a LIVE CENSUS of the whole src tree).

import { violation } from '../lib/result.mjs';
import { globFiles } from '../lib/glob.mjs';
import { isOverridden } from '../lib/file-content.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRepoRoot } from '../../lib/context.mjs';

/** The one module allowed to build the header, plus the two server-side modules that build a
 *  Supabase client from an ALREADY-VERIFIED token (inbound, not outbound). */
export const BEARER_BUILDER_ALLOWLIST = new Set([
  'fsi-app/src/lib/api/authed-fetch.ts',
  'fsi-app/src/lib/api/auth.ts',
  'fsi-app/src/lib/api/community-auth.ts',
]);

const HELPER_IMPORT = '@/lib/api/authed-fetch';

/** `Authorization: \`Bearer ${...}\`` in any spelling: the hand-rolled-header shape rule (a) bans. */
const HAND_ROLLED_BEARER = /`Bearer \$\{/;

/** A fetch call whose first argument is a string or template literal starting `/api/`. Captures the
 *  callee name so `authedFetch(` and `fetch(` are told apart. */
const API_FETCH = /\b(\w*[Ff]etch)\(\s*(['"`])(\/api\/[^'"`]*)\2/g;

/** Route files under src/app/api that actually CALL requireAuth (not merely mention it in a
 *  comment — /api/obligations/upcoming's header says "Public: no requireAuth" and is public).
 *  Returns a Set of route paths relative to src/app/api, e.g. "workspace/tags/[id]/items". */
export function guardedRoutes(files) {
  const root = getRepoRoot();
  const out = new Set();
  const list = files ?? globFiles(['fsi-app/src/app/api/**/route.ts']);
  for (const f of list) {
    let content;
    try { content = readFileSync(resolve(root, f), 'utf8'); } catch { continue; }
    if (!/\bawait requireAuth\(/.test(stripComments(content))) continue;
    out.add(f.replace(/^fsi-app\/src\/app\/api\//, '').replace(/\/route\.ts$/, ''));
  }
  return out;
}

/** Line and block comments removed, so a route that only NAMES requireAuth in prose is not counted
 *  as guarded. String literals are left alone; no route writes "await requireAuth(" inside one. */
export function stripComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Does a `/api/...` request path match a guarded route? Segment-wise, with `[id]`-style dynamic
 *  segments matching anything and a `${...}` interpolation in the caller matching anything. */
export function matchesGuardedRoute(requestPath, guarded) {
  const clean = requestPath.replace(/^\/api\//, '').split('?')[0].split('#')[0];
  const segs = clean.split('/').filter(Boolean);
  for (const route of guarded) {
    const rs = route.split('/');
    if (rs.length !== segs.length) continue;
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i].startsWith('[')) continue;          // dynamic route segment
      if (segs[i].includes('${')) continue;          // interpolated caller segment
      if (rs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return route;
  }
  return null;
}

function lineOf(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

export const fitnessFunction = {
  id: 'F40',
  name: 'authed-api-fetch',
  description:
    'A requireAuth-guarded /api/ route is called through src/lib/api/authed-fetch.ts, and no module under src/ hand-rolls an `Authorization: Bearer` header. Kills the class that made the whole workspace-tags feature 401 for every signed-in user while every gate stayed green.',
  source: 'production defect TAGS-401 (click-through audit 2026-09-08, train 61); requireAuth reads the Authorization header and nothing else',

  enumerate() {
    return globFiles(['fsi-app/src/**/*.{ts,tsx}']).filter(
      (p) =>
        !p.includes('/__tests__/') &&
        !/\.(test|selftest|npmtest)\.(ts|tsx|mjs)$/.test(p)
    );
  },

  check(filepath, content) {
    const out = [];
    const lines = content.split(/\r?\n/);

    // ── (a) no hand-rolled bearer header ──────────────────────────────────────────────────────
    if (!BEARER_BUILDER_ALLOWLIST.has(filepath) && !filepath.startsWith('fsi-app/src/app/api/')) {
      const stripped = stripComments(content);
      const m = HAND_ROLLED_BEARER.exec(stripped);
      if (m) {
        // Report against the real file (the stripped copy keeps line count: only content is blanked
        // inside block comments, so find the first live occurrence in the original).
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (HAND_ROLLED_BEARER.test(lines[i]) && !lines[i].trim().startsWith('*') && !lines[i].trim().startsWith('//')) { idx = i; break; }
        }
        const line = idx >= 0 ? idx + 1 : 1;
        if (!isOverridden(lines[line - 1] || '', 'F40')) {
          out.push(violation(
            line,
            'Hand-rolled `Authorization: Bearer` header. The session token is attached in ONE place: `authedFetch`/`authHeaders` from "@/lib/api/authed-fetch". Building it here reintroduces the TAGS-401 class (a `Bearer ` or `Bearer undefined` carrying no identity passes requireAuth\'s startsWith check and 401s). Override: trailing `// fitness-allow: F40 (reason)`.',
          ));
        }
      }
    }

    // ── (b) a guarded /api/ fetch goes through the helper ─────────────────────────────────────
    if (filepath.startsWith('fsi-app/src/app/api/')) return out;
    const guarded = guardedRoutes();
    const usesHelper = content.includes(HELPER_IMPORT);
    API_FETCH.lastIndex = 0;
    let m;
    while ((m = API_FETCH.exec(content)) !== null) {
      const [, callee, , path] = m;
      if (callee === 'authedFetch') continue;
      const route = matchesGuardedRoute(path, guarded);
      if (!route) continue;
      const line = lineOf(content, m.index);
      if (usesHelper) continue; // authHeaders() form; rule (a) proves the header is not hand-built
      if (isOverridden(lines[line - 1] || '', 'F40')) continue;
      out.push(violation(
        line,
        `fetch("${path}") calls /api/${route}, which is guarded by requireAuth, without the shared authenticated fetcher. Use \`authedFetch\` (or \`authHeaders\`) from "@/lib/api/authed-fetch" — requireAuth reads the Authorization header and nothing else, so a bare fetch here 401s for every signed-in user and fails soft, invisibly. Override: trailing \`// fitness-allow: F40 (reason)\`.`,
      ));
    }
    return out;
  },
};
