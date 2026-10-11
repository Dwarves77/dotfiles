import type { SupabaseClient } from "@supabase/supabase-js";
import { viewerAdminIfNeeded } from "@/lib/community/identity.mjs";
import { readOwnPlatformAdmin } from "@/lib/auth/platform-admin-gate";

export interface CommunityViewer {
  userId: string;
  isAdmin?: boolean;
}

export async function communityViewer(
  auth: { userId: string; supabase: SupabaseClient },
  rows: Array<{ author_user_id?: string | null; anonymous?: boolean | null }>,
  identitiesById: Map<string, unknown>
): Promise<CommunityViewer> {
  return {
    userId: auth.userId,
    isAdmin: await viewerAdminIfNeeded({
      rows,
      viewerUserId: auth.userId,
      identitiesById,
      readAdmin: async () => (await readOwnPlatformAdmin(auth.supabase)).admin,
    }),
  };
}
