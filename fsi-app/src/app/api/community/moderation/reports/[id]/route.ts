// /api/community/moderation/reports/[id]
//
// GET  — single report detail with the reported post embedded.
// POST — take an action on a report. Supported actions:
//          dismiss      — mark resolved with no side effect.
//          remove_post  — delete the target post (hard delete; the
//                         community_posts table has no deleted_at column,
//                         see CLAUDE.md migration ledger). RLS on
//                         community_posts.DELETE gates this to admins/
//                         moderators of the group.
//          warn_user    — insert a notification (kind='moderation') to
//                         the post author. Notifications RLS is
//                         service-role-only on INSERT (see migration
//                         032), so this single write uses the service
//                         client — same pattern as
//                         /api/community/invitations/[id]/accept.
//          mute_user    — Phase D. The community_group_members table
//                         has no muted_until field. The handler accepts
//                         the action, falls back to warn_user, and
//                         records action_taken='mute_user_phase_d_stub'
//                         in the response so the UI can disclose the
//                         degraded behaviour.
//          ban_user     — DELETE the user's community_group_members row
//                         for the post's group. RLS allows this for
//                         group admins. A best-effort warn-style
//                         notification is emitted alongside.
//
// The handler is idempotent: re-deciding a closed report (status !=
// 'open') returns 409.
//
// Schema reality (migration 032) — moderation_reports has no
// action_taken or notes column. We persist the action by suffixing the
// reason text on the existing reason column with a trailing
// "||action=<verb>; notes=<text>" sentinel. Read-back logic in
// reports/route.ts decodes only the reporter portion (the leading
// reason|body); admin read-back in this file decodes the action suffix.
//
// Auth: cookie session (RLS-aware client) for the report read/update.
// Service role used narrowly for notifications insert.
// Rate limit: 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Action =
  | "dismiss"
  | "remove_post"
  | "warn_user"
  | "mute_user"
  | "ban_user";

const ACTIONS = new Set<Action>([
  "dismiss",
  "remove_post",
  "warn_user",
  "mute_user",
  "ban_user",
]);

// reason column encoding (see route.ts for the reporter-side encoding):
//   "<reason>"                       — reason only
//   "<reason>|<body>"                — reason + body
//   "<...>||action=<v>;notes=<t>"    — appended on resolve
function appendActionSentinel(
  storedReason: string | null,
  action: Action,
  notes: string | null
): string {
  const base = storedReason ?? "other";
  const sentinel = `||action=${action}${
    notes ? `;notes=${notes.replace(/[\r\n]+/g, " ").slice(0, 1000)}` : ""
  }`;
  return base + sentinel;
}

function decodeReasonAndAction(stored: string | null): {
  reason: string;
  body: string | null;
  action: Action | null;
  notes: string | null;
} {
  if (!stored) return { reason: "other", body: null, action: null, notes: null };
  const sentIdx = stored.indexOf("||");
  const head = sentIdx >= 0 ? stored.slice(0, sentIdx) : stored;
  const tail = sentIdx >= 0 ? stored.slice(sentIdx + 2) : "";
  const pipe = head.indexOf("|");
  const reason = pipe >= 0 ? head.slice(0, pipe) : head;
  const body = pipe >= 0 ? head.slice(pipe + 1) : null;
  let action: Action | null = null;
  let notes: string | null = null;
  if (tail) {
    const m = /^action=([a-z_]+)(?:;notes=(.*))?$/.exec(tail);
    if (m && ACTIONS.has(m[1] as Action)) {
      action = m[1] as Action;
      notes = m[2] || null;
    }
  }
  return { reason, body, action, notes };
}

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ───────────────────────────────────────────────────────────────────
// GET — single report detail
// ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Valid report id required" },
      { status: 400 }
    );
  }

  type ReportRow = {
    id: string;
    target_kind: string;
    target_id: string;
    reporter_user_id: string | null;
    reason: string | null;
    status: string;
    created_at: string;
    resolved_at: string | null;
    resolved_by_user_id: string | null;
  };
  const { data: rawReport, error } = await auth.supabase
    .from("moderation_reports")
    .select(
      "id, target_kind, target_id, reporter_user_id, reason, status, " +
        "created_at, resolved_at, resolved_by_user_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const report = rawReport as unknown as ReportRow | null;
  if (!report) {
    // RLS hides unreachable rows; report it as 404 to avoid leaking
    // existence to non-admin callers.
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  let post: {
    id: string;
    group_id: string;
    author_user_id: string | null;
    title: string | null;
    body: string;
    created_at: string;
  } | null = null;
  if (report.target_kind === "post") {
    const { data } = await auth.supabase
      .from("community_posts")
      .select("id, group_id, author_user_id, title, body, created_at")
      .eq("id", report.target_id)
      .maybeSingle();
    post = data ?? null;
  }

  const decoded = decodeReasonAndAction(report.reason);

  return NextResponse.json(
    {
      report: {
        id: report.id,
        target_kind: report.target_kind,
        target_id: report.target_id,
        reporter_user_id: report.reporter_user_id,
        reason: decoded.reason,
        body: decoded.body,
        action_taken: decoded.action,
        notes: decoded.notes,
        status: report.status,
        created_at: report.created_at,
        resolved_at: report.resolved_at,
        resolved_by_user_id: report.resolved_by_user_id,
        post: post
          ? {
              id: post.id,
              group_id: post.group_id,
              author_user_id: post.author_user_id,
              title: post.title,
              body: post.body,
              created_at: post.created_at,
            }
          : null,
      },
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// ───────────────────────────────────────────────────────────────────
// POST — take action on a report
// ───────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Valid report id required" },
      { status: 400 }
    );
  }

  let payload: { action?: string; notes?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = (payload.action || "").trim() as Action;
  const notes = (payload.notes || "").trim() || null;
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `action must be one of ${[...ACTIONS].join(", ")}` },
      { status: 400 }
    );
  }

  // Read the report — RLS will hide it from non-eligible reviewers.
  const { data: report, error: rErr } = await auth.supabase
    .from("moderation_reports")
    .select("id, target_kind, target_id, reason, status")
    .eq("id", id)
    .maybeSingle();
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Idempotency: closed reports are immutable from the API.
  if (report.status !== "open") {
    return NextResponse.json(
      {
        error: `Report is ${report.status}; re-decisions are not allowed`,
        status: report.status,
      },
      { status: 409 }
    );
  }

  // Look up the target post — needed for remove/warn/mute/ban side
  // effects. Dismiss does not need it but reading is harmless and gives
  // us the author for notification copy.
  let post: {
    id: string;
    group_id: string;
    author_user_id: string | null;
  } | null = null;
  if (report.target_kind === "post") {
    const { data } = await auth.supabase
      .from("community_posts")
      .select("id, group_id, author_user_id")
      .eq("id", report.target_id)
      .maybeSingle();
    post = data ?? null;
  }

  // Effective action — recorded as-requested. The Phase D `mute_user`
  // path falls back to a warning notification but we still record the
  // requested action so the audit trail captures the reviewer's
  // intent (and so a later migration can replay the decision).
  const effectiveAction: Action = action;
  const sideEffectErrors: string[] = [];
  let phaseDStub = false;

  // Branch on action. Each branch may emit a side effect; failures
  // there are treated as soft-errors (the report still resolves) but
  // returned in the response so the admin UI can surface them.
  if (action === "dismiss") {
    // No side effect.
  } else if (action === "remove_post") {
    if (!post) {
      sideEffectErrors.push("Target post no longer exists; nothing to remove");
    } else {
      // No deleted_at column on community_posts — hard delete. RLS
      // gates DELETE to author or group admin/moderator. The reviewer
      // here is by definition a group admin/mod (or platform admin
      // bypassing RLS via the service role; we do not bypass — we use
      // the reviewer's RLS client so the operation fails cleanly if
      // the reviewer somehow isn't authorised).
      const { error: dErr } = await auth.supabase
        .from("community_posts")
        .delete()
        .eq("id", post.id);
      if (dErr) sideEffectErrors.push(`remove_post failed: ${dErr.message}`);
    }
  } else if (action === "warn_user") {
    if (!post?.author_user_id) {
      sideEffectErrors.push("No post author to warn");
    } else {
      const err = await emitModerationNotification({
        userId: post.author_user_id,
        kind: "warn",
        groupId: post.group_id,
        postId: post.id,
        reportId: report.id,
        notes,
      });
      if (err) sideEffectErrors.push(`warn_user notification failed: ${err}`);
    }
  } else if (action === "mute_user") {
    // Phase D — community_group_members has no muted_until column.
    // We surface the action as taken but fall back to a warning
    // notification so the user is at least informed.
    phaseDStub = true;
    if (post?.author_user_id) {
      const err = await emitModerationNotification({
        userId: post.author_user_id,
        kind: "mute_phase_d",
        groupId: post.group_id,
        postId: post.id,
        reportId: report.id,
        notes,
      });
      if (err) sideEffectErrors.push(`mute_user fallback failed: ${err}`);
    }
  } else if (action === "ban_user") {
    if (!post?.author_user_id || !post.group_id) {
      sideEffectErrors.push("No post author/group to ban from");
    } else {
      // RLS on community_group_members.DELETE allows group admins to
      // delete other members. Use the reviewer's RLS client so a
      // moderator-only reviewer fails cleanly (only admins ban).
      const { error: bErr } = await auth.supabase
        .from("community_group_members")
        .delete()
        .eq("group_id", post.group_id)
        .eq("user_id", post.author_user_id);
      if (bErr) sideEffectErrors.push(`ban_user failed: ${bErr.message}`);
      const err = await emitModerationNotification({
        userId: post.author_user_id,
        kind: "ban",
        groupId: post.group_id,
        postId: post.id,
        reportId: report.id,
        notes,
      });
      if (err) sideEffectErrors.push(`ban_user notification failed: ${err}`);
    }
  }

  // Resolve / dismiss the report. Dismiss action -> status=dismissed;
  // every other action -> status=resolved. This mirrors how moderation
  // queues conventionally split "no action" from "action taken".
  const newStatus = action === "dismiss" ? "dismissed" : "resolved";
  const newReason = appendActionSentinel(
    report.reason,
    effectiveAction,
    notes
  );
  const { error: uErr } = await auth.supabase
    .from("moderation_reports")
    .update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: auth.userId,
      reason: newReason,
    })
    .eq("id", id)
    .eq("status", "open"); // double-guard against races
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      report_id: id,
      status: newStatus,
      action_taken: effectiveAction,
      phase_d_stub: phaseDStub,
      side_effect_errors: sideEffectErrors,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

// ───────────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────────

async function emitModerationNotification(args: {
  userId: string;
  kind: "warn" | "mute_phase_d" | "ban";
  groupId: string;
  postId: string | null;
  reportId: string;
  notes: string | null;
}): Promise<string | null> {
  // notifications.INSERT is service-role-only by RLS (migration 032).
  // This is the same trade-off documented in
  // /api/community/invitations/[id]/accept — the only legitimate insert
  // path the schema allows is service-role. Keep the surface narrow:
  // one insert, here, with a structured payload.
  try {
    const service = getServiceClient();
    const { error } = await service.from("notifications").insert({
      user_id: args.userId,
      kind: "moderation",
      payload: {
        moderation_kind: args.kind,
        group_id: args.groupId,
        post_id: args.postId,
        report_id: args.reportId,
        notes: args.notes,
      },
    });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : "unknown error";
  }
}
