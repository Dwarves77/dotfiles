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
   * user_profiles.is_platform_admin (migration 027). Read by
   * PromotePostButton to allow promoting (staging) a post, and by C8's
   * ModerationQueue to widen the report set. Optional so older callers
   * that haven't been updated still type-check. */
  isPlatformAdmin?: boolean;
}

// ── Wave 3 (2026-09-03) additions — entity binding, pseudonymous identity, promotion, benchmarks ──
// Consumed alongside COMMUNITY-A's guard-enforced contract (see api-client.ts for the fetch
// wrappers). Additive only: nothing above this line changed shape.

/** A spine entity a thread binds to (corridor / jurisdiction / instrument / technology /
 * organisation — src/lib/entities/entity-id.mjs KINDS, read-only from this lane). */
export interface CommunityEntityRef {
  entity_id: string;
  kind: string;
  canonical_name: string;
}

/** Verified-backing, pseudonymous-display identity (spec 05 §2): org type + role + sector + region,
 * plus a verification mark. Never a name or company — that is the whole point of the projection. */
export interface CommunityAuthorIdentity {
  orgType?: string | null;
  role?: string | null;
  sector?: string | null;
  region?: string | null;
  verified?: boolean;
}

/** The five promotion-machine states (spec 05 §4), kept as a plain string union rather than an enum
 * so a state this lane doesn't yet know about still type-checks and renders verbatim (see
 * identity-format.ts's promotionStateLabel). */
export type CommunityPromotionState =
  | "community"
  | "community-corroborated"
  | "under-review"
  | "verified"
  | "retired"
  | (string & {});

export { type EntityThread as CommunityEntityThread } from "./api-client";
export { type ThreadCorroboration as CommunityThreadCorroboration } from "./api-client";
export { type Benchmark as CommunityBenchmark } from "./api-client";
export { type GuardAggregateRoute as CommunityGuardAggregateRoute } from "./api-client";
