// Shared authentication for worker/cron routes.
//
// SECURITY (DEEP-AUDIT S1-4, P0-1): every worker/cron route previously read
//   const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";
// so a deploy that forgot to set WORKER_SECRET silently accepted the public
// string "dev-worker-secret" (printed in the repo). This helper removes the
// fallback entirely and FAILS CLOSED: an unset WORKER_SECRET authenticates
// nothing (500 + loud log), and a wrong secret is 401. Comparison is
// constant-time (crypto.timingSafeEqual) so the check does not leak the secret
// byte-by-byte via timing.
//
// Fail-closed is evaluated at REQUEST time, not module load, on purpose: a
// module-load throw would break `next build` on any deploy whose build step
// lacks WORKER_SECRET. Request-time evaluation gives the identical security
// outcome (no public default ever authenticates) without a build-time landmine.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** Constant-time secret comparison. Length mismatch → false (timingSafeEqual
 *  throws on unequal-length buffers, so we guard the length first). */
function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Guard a worker/cron request. Returns a NextResponse to send back when the
 * request is NOT authorized (401), or when the server is misconfigured (500),
 * and returns `null` when the request is authorized and the handler may proceed.
 *
 * Accepts the `x-worker-secret` header. When `allowBearer` is set it also
 * accepts `Authorization: Bearer <secret>` (the Vercel Cron convention). Both
 * paths compare against the single WORKER_SECRET value. (The former
 * /api/admin/q7-daily-recompute route was the last allowBearer caller; it was
 * purged 2026-07-18 (dormant-systems P-7). The parameter is retained for any
 * future Bearer-cron route.)
 *
 * Usage in a route handler:
 *   const denied = workerAuthGuard(request);
 *   if (denied) return denied;
 */
export function workerAuthGuard(
  request: Request,
  opts?: { allowBearer?: boolean }
): NextResponse | null {
  const expected = process.env.WORKER_SECRET;
  if (!expected) {
    console.error(
      "[worker-auth] WORKER_SECRET is not set — refusing all worker/cron requests (fail-closed)."
    );
    return NextResponse.json(
      { error: "Server misconfigured: WORKER_SECRET is not set." },
      { status: 500 }
    );
  }

  const presented: string[] = [];
  const headerSecret = request.headers.get("x-worker-secret");
  if (headerSecret) presented.push(headerSecret);
  if (opts?.allowBearer) {
    const auth = request.headers.get("authorization");
    if (auth && auth.startsWith("Bearer ")) presented.push(auth.slice("Bearer ".length));
  }

  const authorized = presented.some((p) => secretsMatch(p, expected));
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
