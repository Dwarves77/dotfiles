/**
 * Shared types for the Phase C community shell.
 *
 * The /community page server component fetches data into these shapes,
 * then passes them to CommunityShell (client) which threads them down
 * to CommunitySidebar / CommunityMasthead / CommunityRegionTabs.
 *
 * Posts, group detail, threads — all out of scope for this shell PR.
 */

export type CommunityRegionCode =
  | "EU"
  | "UK"
  | "US"
  | "LATAM"
  | "APAC"
  | "HK"
  | "MEA"
  | "GLOBAL";

export interface CommunityRegion {
  code: CommunityRegionCode | string;
  label: string;
}

export interface CommunityGroupSummary {
  id: string;
  name: string;
  slug: string;
  region: string;
  privacy: "public" | "private";
  member_count: number;
  weekly_post_count: number;
  last_active_at: string;
}

export interface CommunityMembership {
  group_id: string;
  role: "admin" | "moderator" | "member";
  starred: boolean;
  muted: boolean;
  joined_at: string;
  group: CommunityGroupSummary;
}

export interface CommunityInvitation {
  id: string;
  group_id: string;
  inviter_user_id: string | null;
  created_at: string;
  group: Pick<
    CommunityGroupSummary,
    "id" | "name" | "slug" | "region" | "privacy"
  >;
}

export interface CommunityTopicSummary {
  id: string;
  label: string;
  group_count: number;
}

export interface CommunityCurrentUser {
  id: string;
  email: string;
  name: string;
  headshotUrl: string | null;
  employer: string;
  /** True when the user is a platform admin — sourced from
   * user_profiles.is_platform_admin (migration 027). Read by C6's
   * PromotePostButton to enable the kind='direct' radio option, and
   * by C8's ModerationQueue to widen the report set. Optional so
   * older callers that haven't been updated still type-check. */
  isPlatformAdmin?: boolean;
}
