// The viewer of a Community read (DFIX-1, 2026-10-08, SEC-5 residual): who is reading, and whether they are a
// platform admin. The admin answer is read once and only when an author id is actually withheld from a
// non-author (identity.mjs viewerAdminIfNeeded), through the viewer own session (readOwnPlatformAdmin). The
// one home for the block the posts, replies, post and entity-threads routes all need.

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
