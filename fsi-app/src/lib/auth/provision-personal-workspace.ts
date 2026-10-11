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
