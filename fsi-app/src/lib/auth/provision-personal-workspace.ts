/**
 * PROFILE PROVISIONING (lane AUTH-2, 2026-10-06; replaces the 2026-05-28 AUTO-PROVISION-ORG-ON-SIGNUP).
 *
 * The file keeps its original name only because renaming it moves two governance files outside this
 * lane's write set (.discipline/governance/exemptions.mjs and the generated coverage-report.json);
 * see the lane's session-log entry for the rename follow-up.
 *
 * What it does now: `ensureProfile(userId, email)` creates the caller's `profiles` row when it is
 * missing and does nothing else. It never creates an organisation, a workspace_settings row or a
 * membership. A signed-in user with no membership is routed to onboarding (/workspace/new), where
 * they accept an invitation or create an organisation with a name, sector, size and region.
 * The silent "Personal - <email>" workspace of 2026-05-28 is retired: it gave every user an
 * organisation they never described, so the sector profile the specs seed at workspace creation was
 * always empty.
 *
 * Why a profile row at all: org_memberships.user_id has a foreign key to profiles.id (migration 075),
 * and create_org_for_self() (migration 076) inserts the owner membership without creating a profile.
 * A user with no profile therefore cannot create an organisation and cannot accept an invitation.
 *
 * One mechanism, three entry points, all idempotent:
 *   - /auth/callback after a successful code exchange (confirmation completed in the same browser);
 *   - the server bootstrap (server-bootstrap.ts resolveServerBootstrapWithHeal), the first time any
 *     signed-in session, by any sign-in path, meets the app without a profile;
 *   - POST /api/orgs, as a guard before the organisation RPC.
 *
 * Existing rows are never written: an existing profile is returned untouched, so platform-admin and
 * every other column stay exactly as they are. Failure is never silent: it is logged and counted in
 * error_events (route "auth/ensure-profile").
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface EnsureProfileResult {
  /** True when this call inserted the row. */
  created: boolean;
  /** True when a profile row exists after the call. */
  exists: boolean;
  /** Set when a step failed, naming the step. */
  failedStep?: string;
}

/** The client surface this module uses; the real supabase-js client satisfies it. */
export type ProvisionClient = SupabaseClient;

export interface EnsureProfileDeps {
  /** Injected for tests; the default is a service-role client built from env. */
  client?: ProvisionClient;
  /** Counts a failure. The default records it in error_events via captureError. Never throws. */
  reportFailure?: (step: string, message: string) => Promise<void> | void;
}

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

async function defaultReportFailure(step: string, message: string): Promise<void> {
  try {
    const { captureError } = await import("@/lib/telemetry/capture-error");
    await captureError({
      side: "server",
      route: "auth/ensure-profile",
      error: new Error(`ensure-profile failed at ${step}: ${message}`),
    });
  } catch (e) {
    console.error("[ensure-profile] failure counter threw:", e);
  }
}

export async function ensureProfile(
  userId: string,
  email: string | null | undefined,
  deps: EnsureProfileDeps = {}
): Promise<EnsureProfileResult> {
  let db = deps.client;
  if (!db) {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.warn("[ensure-profile] env missing; skipping profile provision");
      return { created: false, exists: false, failedStep: "env_missing" };
    }
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  const client = db;
  const report = deps.reportFailure ?? defaultReportFailure;

  const fail = async (step: string, message: string): Promise<EnsureProfileResult> => {
    console.warn(`[ensure-profile] ${step} failed:`, message);
    await report(step, message);
    return { created: false, exists: false, failedStep: step };
  };

  const readExisting = async () =>
    client.from("profiles").select("id").eq("id", userId).maybeSingle();

  try {
    const { data: existing, error: readErr } = await readExisting();
    if (readErr) return await fail("profiles_read", readErr.message);
    if (existing?.id) return { created: false, exists: true };

    // Plain insert, never an upsert: an existing row must not be overwritten. Only id, email and the
    // schema's own defaults are written; is_platform_admin is not in the payload.
    const { error: insertErr } = await client.from("profiles").insert({
      id: userId,
      email: email || null,
      role: "member",
      settings: {},
    });
    if (!insertErr) return { created: true, exists: true };

    if (insertErr.code === UNIQUE_VIOLATION) {
      // A concurrent call may have inserted it; re-read before calling this a failure.
      const { data: again, error: againErr } = await readExisting();
      if (!againErr && again?.id) return { created: false, exists: true };
    }
    return await fail("profiles_insert", insertErr.message);
  } catch (e) {
    return await fail("unexpected_exception", e instanceof Error ? e.message : String(e));
  }
}
