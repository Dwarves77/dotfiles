import { createClient, SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClient: SupabaseClient<any, "public", any> | null = null;

export function getAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  // Use `any` for the Database generic since we don't have generated types.
  // This matches the pattern used in src/lib/supabase-server.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient = createClient<any>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
