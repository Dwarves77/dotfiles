"use client";

/**
 * authed-fetch: THE one way a browser module calls a requireAuth-guarded
 * `/api/*` route (lane TAGS-401, 2026-09-08, train 61).
 *
 * WHY THIS EXISTS. `requireAuth` (src/lib/api/auth.ts) reads the caller's
 * identity from ONE place and one place only: the `Authorization: Bearer
 * <jwt>` request header. It never looks at a cookie, so `credentials:
 * "include"` buys a caller nothing. Before this module there were five
 * hand-rolled ways to build that header (useWorkspaceBootstrap.ts inline,
 * useAdminAttention.ts inline, useListOrder.ts `authHeader()`,
 * CorpusTurnPanel.tsx `authHeaders()`, SourceTierAuditPanel.tsx
 * `authHeader()`, plus inline copies in WatchButton.tsx and
 * CoverageCatalogueView.tsx) and one whole feature that built no header at
 * all: src/lib/tags/client.ts and src/lib/tags/useWorkspaceTagsFacet.ts
 * sent `credentials: "include"` and a Content-Type, so every one of the
 * seven workspace-tags fetches returned 401 for every signed-in user from
 * the day the feature landed. Production evidence: the 2026-09-08
 * click-through audit read 23 `GET /api/workspace/tags 401` on a signed-in
 * session in three hours while `/api/auth/identity`,
 * `/api/workspace/bootstrap` and `/api/admin/attention` returned 200 on the
 * same page loads.
 *
 * THE NULL-TOKEN CASE, which the copies disagreed about. Four of the seven
 * hand-rolled builders interpolated the token unconditionally,
 * `Bearer ${session?.access_token || ""}` or, worse,
 * `Bearer ${session?.access_token}` (literally the string "Bearer
 * undefined"), which sends a well-formed-looking header carrying no
 * identity. requireAuth's `startsWith("Bearer ")` check passes, getClaims()
 * then fails, and the caller gets an indistinguishable 401 on the first
 * render before the session resolves. This module never does that: no
 * token means NO REQUEST, and a synthetic 401 whose body is byte-identical
 * to requireAuth's own (`{ error: "Authentication required" }`) so every
 * caller's existing `!res.ok` / `res.status === 401` branch behaves exactly
 * as it would against the live route.
 *
 * ENFORCEMENT. F40 (.discipline/fitness/functions/F40-authed-api-fetch.mjs)
 * fails any module under src/ that calls `fetch()` on a literal `/api/`
 * path whose route calls requireAuth without going through this module.
 * That is what makes the class unreintroducible, not this file's existence.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

/** The subset of a Supabase client this module needs, narrow enough to
 *  substitute in a test without constructing a real client, matching
 *  auth.ts's own ClaimsVerifier pattern. */
export interface SessionSource {
  auth: {
    getSession: () => Promise<{
      data: { session: { access_token?: string | null } | null };
    }>;
  };
}

/** Injectable seams, both defaulted to the real thing. Same rationale as
 *  src/lib/watchlist/membership.ts's client half: the decision logic is
 *  provable with `node --test` and no browser. */
export interface AuthedFetchDeps {
  client?: SessionSource;
  fetchImpl?: typeof fetch;
}

/** requireAuth's own 401 body, verbatim, so a caller cannot tell a
 *  short-circuited request from a rejected one. */
export const AUTH_REQUIRED_ERROR = "Authentication required";

/**
 * Resolve the current session's access token, or null when there is none.
 * `getSession()` (not `getUser()`) is deliberate and is what all five prior
 * copies used: it reads the persisted session and refreshes an expired one
 * through the browser client's own autoRefreshToken machinery, without a
 * network round trip on the common path.
 */
export async function resolveAccessToken(client: SessionSource): Promise<string | null> {
  const {
    data: { session },
  } = await client.auth.getSession();
  const token = session?.access_token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** The synthetic 401 returned when there is no session token. A real
 *  `Response`, so callers `await res.json()` it like any other. */
export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: AUTH_REQUIRED_ERROR }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The headers for one authenticated call, or null when the viewer has no
 * session. Callers that need the headers themselves (a component building
 * one options object it reuses) use this; callers making a single request
 * use `authedFetch` below.
 */
export async function authHeaders(
  extra: Record<string, string> = {},
  deps: AuthedFetchDeps = {}
): Promise<Record<string, string> | null> {
  const client = deps.client ?? createSupabaseBrowserClient();
  const token = await resolveAccessToken(client);
  if (!token) return null;
  return { ...extra, Authorization: `Bearer ${token}` };
}

/** Merge a bearer token into a RequestInit's headers without dropping the
 *  headers the caller already set. Pure; exported for its own unit test. */
export function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const existing = new Headers(init?.headers ?? {});
  existing.set("Authorization", `Bearer ${token}`);
  const merged: Record<string, string> = {};
  existing.forEach((value, key) => {
    merged[key] = value;
  });
  return { ...init, headers: merged };
}

/**
 * `fetch` for a requireAuth-guarded route. Attaches the session bearer
 * token; when there is no session it makes NO request and resolves the
 * synthetic 401 above.
 */
export async function authedFetch(
  input: string,
  init?: RequestInit,
  deps: AuthedFetchDeps = {}
): Promise<Response> {
  const client = deps.client ?? createSupabaseBrowserClient();
  const doFetch = deps.fetchImpl ?? fetch;
  const token = await resolveAccessToken(client);
  if (!token) return unauthorizedResponse();
  return doFetch(input, withBearer(init, token));
}
