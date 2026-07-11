// First-party error capture (Wave-β R0.2) — the "Sentry or equivalent" with
// no external service. Writes error GROUPS to the error_events table
// (migration 195) keyed by (stack_hash, release, side, route), incrementing
// `count` on repeat occurrences.
//
// FAIL-OPEN, DELIBERATELY: a failed capture must NEVER break the request it
// observes. Every path here swallows its own failures with console.error.
// This is the CORRECT use of a swallow: the forbidden error-swallow class
// (agent/run post-mortem, D3 living-set entry 1) is swallowing errors on
// WRITE-CONSEQUENCE paths — where the swallowed error silently disables a
// gate or loses a customer-facing write. Telemetry loss has no write
// consequence for the observed request; the console.error keeps the loss
// itself observable in Vercel logs. Do not "fix" these catches.

import { getServiceSupabase } from "@/lib/supabase-server";
import { stackHash } from "@/lib/telemetry/stack-hash.mjs";

// Bounded payload limits — mirror the CHECK constraints in migration 195
// (defense in depth: clamp before write so an oversized message degrades to a
// truncated capture instead of a constraint-rejected one).
const MESSAGE_MAX = 1000;
const STACK_EXCERPT_MAX = 4000;
const ROUTE_MAX = 300;

export interface CaptureErrorInput {
  side: "server" | "client";
  /** Route path (e.g. "/api/agent/run" or the client pathname). */
  route: string;
  /** The thrown value, or a pre-extracted message. */
  error: unknown;
  /** Optional raw stack when `error` isn't an Error (client payloads). */
  stack?: string | null;
  /** Org id ONLY (nullable). Never a user id/email/IP — no raw PII by design. */
  userScope?: string | null;
}

/** Release tag: the deployed git sha, 'dev' outside Vercel. */
export function releaseTag(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || "dev";
}

function envTag(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || "Error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, MESSAGE_MAX);
  } catch {
    return String(error);
  }
}

function extractStack(error: unknown, fallback?: string | null): string {
  if (error instanceof Error && error.stack) return error.stack;
  return fallback ?? "";
}

/**
 * Record one error occurrence. Dedup: try INSERT first; on unique-violation
 * (23505 on idx_error_events_dedup) increment the existing group's count.
 * The increment is a read-modify-write (two round trips) — racy under
 * concurrent captures of the same group, which is ACCEPTABLE for telemetry
 * (an undercounted `count` still surfaces the group; the DDL stays simple
 * per the R0.2 brief).
 */
export async function captureError(input: CaptureErrorInput): Promise<void> {
  try {
    const message = extractMessage(input.error).slice(0, MESSAGE_MAX);
    const stack = extractStack(input.error, input.stack);
    const route = (input.route || "").slice(0, ROUTE_MAX);
    const release = releaseTag();
    const hash = stackHash({ side: input.side, message, stack });

    const supabase = getServiceSupabase();
    const row = {
      release,
      env: envTag(),
      side: input.side,
      route,
      message,
      stack_hash: hash,
      stack_excerpt: stack ? stack.slice(0, STACK_EXCERPT_MAX) : null,
      user_scope: input.userScope ?? null,
    };

    const { error: insertError } = await supabase.from("error_events").insert(row);
    if (!insertError) return;

    if (insertError.code === "23505") {
      // Existing group — increment count + bump last_seen_at.
      const { data: existing, error: selectError } = await supabase
        .from("error_events")
        .select("id, count")
        .eq("stack_hash", hash)
        .eq("release", release)
        .eq("side", input.side)
        .eq("route", route)
        .maybeSingle();
      if (selectError || !existing) {
        console.error("[capture-error] dedup select failed:", selectError?.message);
        return;
      }
      const { error: updateError } = await supabase
        .from("error_events")
        .update({
          count: (existing.count ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updateError) {
        console.error("[capture-error] dedup increment failed:", updateError.message);
      }
      return;
    }

    // Table missing (migration 195 not applied yet) or any other failure:
    // log-and-continue. Telemetry loss is observable in logs, never fatal.
    console.error("[capture-error] insert failed:", insertError.message);
  } catch (e) {
    // See module header: telemetry swallows are the permitted class.
    console.error("[capture-error] capture threw:", e);
  }
}

/**
 * Wrapper for API route handlers: captures any thrown error against the
 * given route name, then RETHROWS so the route's existing failure behavior
 * (Next.js 500) is unchanged — capture observes, it never alters semantics.
 *
 * Usage:
 *   async function handlePOST(request: NextRequest) { ... }
 *   export const POST = withErrorCapture("/api/agent/run", handlePOST);
 */
export function withErrorCapture<Req extends Request, Ctx = unknown>(
  route: string,
  handler: (request: Req, context: Ctx) => Promise<Response>
): (request: Req, context: Ctx) => Promise<Response> {
  return async (request: Req, context: Ctx) => {
    try {
      return await handler(request, context);
    } catch (error) {
      await captureError({ side: "server", route, error });
      throw error;
    }
  };
}
