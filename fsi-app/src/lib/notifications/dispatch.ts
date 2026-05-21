// Shared notification fan-out helper. Wired at each event-origin point
// (reply, invite, moderation, future: mention, promote) to insert a row
// into the per-user `notifications` table that the bell + list components
// read at /api/community/notifications.
//
// Why service-role: notifications.INSERT is service-role-only by RLS
// (migration 032). User-session clients cannot write to other users'
// inboxes; this is the only legitimate insert path the schema allows.
// Keep the surface narrow: one helper, called intentionally.
//
// Failures are returned (not thrown). Notification dispatch is a
// side-effect of the originating operation; if it fails we want the
// originating route to log + continue rather than abort the user-facing
// operation (a successful reply or invitation must persist even if the
// recipient's notification fails to write).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type NotificationKind =
  | "reply"
  | "invite"
  | "moderation"
  | "promote"
  | "mention";

export interface DispatchArgs {
  userId: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
}

// Module-scoped lazy singleton; avoid re-creating the client on every
// invocation since the helper is called from per-request handlers.
let cachedClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "dispatchNotification: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set"
    );
  }
  cachedClient = createClient(url, key);
  return cachedClient;
}

// Returns null on success, error message on failure. Callers should log
// the error but not abort the originating user operation.
export async function dispatchNotification(
  args: DispatchArgs
): Promise<string | null> {
  try {
    const service = getServiceClient();
    const { error } = await service.from("notifications").insert({
      user_id: args.userId,
      kind: args.kind,
      payload: args.payload,
    });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : "unknown error";
  }
}
