import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Kinds are a subset of the notifications_kind_check CHECK constraint. 'promote' is retired from code
// (ADR-041, Community is social only); the DB CHECK still allows it until the owed migration.
// 'archive' added by migration 235 (dual-scope archive): a workspace archive
// fans out to the item's watchers and its assigned owner.
// 'assignment' added by migration 359 (lane S8-A): a member assigned an item in their workspace is told once.
export type NotificationKind =
  | "reply"
  | "invite"
  | "moderation"
  | "mention"
  | "archive"
  | "assignment";

interface DispatchArgs {
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
