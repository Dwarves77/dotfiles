/**
 * AUTO-PROVISION-ORG-ON-SIGNUP — personal workspace creation.
 *
 * Sprint 3 Track 2 (2026-05-28). When a user lands on /auth/callback
 * without an existing `org_memberships` row, this helper creates:
 *   - a `profiles` row (defense-in-depth idempotent upsert)
 *   - a `Personal — {emailLocal}` organization
 *   - a `workspace_settings` row with platform-default values
 *   - an owner-role `org_memberships` row
 *
 * Idempotent: if the user already has any org_membership, returns the
 * existing org_id without writing anything. Safe to call on every auth
 * callback invocation.
 *
 * Failure-tolerant: any sub-step failure returns null and logs a
 * warning. Auth flow proceeds regardless. The defense-in-depth
 * `null_orgId` seed-fallback branch in `getAppData()` still catches
 * users whose provisioning silently failed.
 *
 * Operator decision (chat 2026-05-28): default scope is personal
 * workspace, NOT invitation-only. New users get their own org + owner
 * role on first sign-in. Admin can later move them into a shared org
 * by editing membership.
 */

import { createClient } from "@supabase/supabase-js";

interface ProvisionResult {
  orgId: string | null;
  created: boolean;
}

const DEFAULT_HOME_SECTIONS = {
  dueThisQuarter: true,
  summaryStrip: true,
  supersessions: true,
  topUrgency: true,
  weeklyBriefing: true,
  whatChanged: true,
} as const;

const DEFAULT_ALERT_CONFIG = {
  priorities: ["CRITICAL", "HIGH"],
} as const;

export async function ensurePersonalWorkspace(
  userId: string,
  email: string
): Promise<ProvisionResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.warn("[provision] env missing; skipping personal workspace provision");
    return { orgId: null, created: false };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  try {
    // 1. Idempotent: short-circuit if membership already exists.
    const { data: existing } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing?.org_id) {
      return { orgId: existing.org_id, created: false };
    }

    // 2. Profiles row — upsert so a partial prior state doesn't block
    //    the org_memberships FK (org_memberships.user_id → profiles.id).
    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        role: "member",
        settings: {},
      },
      { onConflict: "id" }
    );
    if (profileErr) {
      console.warn(
        "[provision] profiles upsert failed:",
        profileErr.message
      );
      return { orgId: null, created: false };
    }

    // 3. Personal organization.
    const emailLocal = (email.split("@")[0] || "user").slice(0, 32);
    const slug = `personal-${userId.slice(0, 8)}`;
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: `Personal — ${emailLocal}`,
        slug,
        plan: "free",
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      console.warn(
        "[provision] organizations insert failed:",
        orgErr?.message
      );
      return { orgId: null, created: false };
    }

    // 4. workspace_settings — populate with platform defaults so the
    //    user lands on a usable home dashboard immediately.
    const { error: settingsErr } = await supabase
      .from("workspace_settings")
      .insert({
        org_id: org.id,
        sector_profile: [],
        jurisdiction_weights: {},
        default_filters: {},
        alert_config: DEFAULT_ALERT_CONFIG,
        home_sections: DEFAULT_HOME_SECTIONS,
        default_export_format: "html",
      });
    if (settingsErr) {
      console.warn(
        "[provision] workspace_settings insert failed:",
        settingsErr.message
      );
      // Continue — workspace_settings has sensible row-level defaults
      // and the membership write below is what unblocks the user.
    }

    // 5. Owner membership.
    const { error: membershipErr } = await supabase
      .from("org_memberships")
      .insert({
        org_id: org.id,
        user_id: userId,
        role: "owner",
      });
    if (membershipErr) {
      console.warn(
        "[provision] org_memberships insert failed:",
        membershipErr.message
      );
      return { orgId: null, created: false };
    }

    return { orgId: org.id, created: true };
  } catch (e) {
    console.warn(
      "[provision] unexpected exception:",
      e instanceof Error ? e.message : String(e)
    );
    return { orgId: null, created: false };
  }
}
