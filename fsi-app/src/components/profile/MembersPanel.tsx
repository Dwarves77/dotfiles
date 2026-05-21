"use client";

/**
 * MembersPanel — UserProfilePage Members & roles tab.
 *
 * Lists every org_membership for the caller's org with the joined
 * profile (display name + avatar). Owner can change role per row
 * (owner / admin / member / viewer) and revoke a membership. Server
 * guards against demoting / revoking the only owner and against the
 * owner revoking self.
 *
 * Backed by /api/orgs/[org_id]/members (GET + PATCH + DELETE).
 *
 * Per DP-1 every related decision on a single member row is reachable
 * inline: role picker, save, revoke, inline status banner. No tab
 * switches.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserMinus, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelative, toDate } from "@/lib/relative-time";

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
  display_name: string;
  avatar_url: string | null;
}

interface MembersResponse {
  members: Member[];
  caller_role: "owner" | "admin" | "member" | "viewer";
  caller_membership_id: string;
}

interface MembersPanelProps {
  orgId: string | null;
  callerUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function MembersPanel({ orgId, callerUserId }: MembersPanelProps) {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 5000);
  }

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`, { credentials: "include" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(payload as MembersResponse);
        // Reset drafts to match server state on every reload.
        const drafts: Record<string, string> = {};
        for (const m of (payload as MembersResponse).members) drafts[m.id] = m.role;
        setRoleDrafts(drafts);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveRole(member: Member) {
    if (!orgId) return;
    const nextRole = roleDrafts[member.id];
    if (!nextRole || nextRole === member.role) return;
    setPendingId(member.id);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: member.id, role: nextRole }),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        flash("ok", `Role updated to ${ROLE_LABELS[nextRole]}`);
        await load();
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function revoke(member: Member) {
    if (!orgId) return;
    if (
      !window.confirm(
        `Revoke ${member.display_name}'s membership? They will lose access to this organization.`
      )
    ) {
      return;
    }
    setPendingId(member.id);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members?membership_id=${encodeURIComponent(member.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        flash("ok", `Revoked ${member.display_name}`);
        await load();
      }
    } catch (e: any) {
      flash("err", e.message || "Network error");
    } finally {
      setPendingId(null);
    }
  }

  if (!orgId) {
    return (
      <Card title="Members & roles" meta="No active workspace">
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          You are not yet a member of any organization. Member management
          appears once you join one.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Members & roles" meta="Loading...">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading members...
        </p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Members & roles" meta="Error">
        <p className="text-sm" style={{ color: "var(--color-error)" }}>
          {error || "Failed to load members"}
        </p>
      </Card>
    );
  }

  const isOwner = data.caller_role === "owner";

  return (
    <Card title="Members & roles" meta={`${data.members.length} members on this org`}>
      <p
        className="text-xs mb-4"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {isOwner
          ? "Change role inline or revoke a member. You cannot revoke your own membership; promote another owner first if you need to leave."
          : `View only. Owner role required to change roles or revoke. Your role is ${ROLE_LABELS[data.caller_role]}.`}
      </p>

      {status && (
        <div
          className="text-[11px] p-2 rounded mb-3"
          style={{
            color:
              status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
            backgroundColor:
              status.kind === "ok"
                ? "rgba(22,163,74,0.04)"
                : "rgba(220,38,38,0.04)",
            border:
              status.kind === "ok"
                ? "1px solid rgba(22,163,74,0.2)"
                : "1px solid rgba(220,38,38,0.2)",
          }}
        >
          {status.text}
        </div>
      )}

      <ul className="space-y-2">
        {data.members.map((m) => {
          const isPending = pendingId === m.id;
          const draftRole = roleDrafts[m.id] || m.role;
          const isSelf = m.user_id === callerUserId;
          const joined = toDate(m.joined_at);
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-md border"
              style={{
                borderColor: "var(--color-border-subtle)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar_url}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                    style={{
                      backgroundColor: "var(--color-surface-raised)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {m.display_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {m.display_name}
                    {isSelf && (
                      <span
                        className="ml-1.5 text-[10px] font-bold uppercase"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        (you)
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Joined {joined ? formatRelative(joined) : m.joined_at}
                  </div>
                </div>
              </div>

              {isOwner ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={draftRole}
                    onChange={(e) =>
                      setRoleDrafts((s) => ({ ...s, [m.id]: e.target.value }))
                    }
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded border"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isPending || draftRole === m.role}
                    onClick={() => saveRole(m)}
                  >
                    {isPending ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Save size={11} />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isPending || isSelf}
                    title={isSelf ? "Owners cannot revoke their own membership" : "Revoke"}
                    onClick={() => revoke(m)}
                  >
                    <UserMinus size={11} />
                    Revoke
                  </Button>
                </div>
              ) : (
                <span
                  className="text-[11px] font-bold uppercase px-2 py-0.5 rounded"
                  style={{
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border-subtle)",
                  }}
                >
                  {ROLE_LABELS[m.role]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Local card mirrors UserProfilePage's idiom ──

function Card({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border mb-5"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <header
        className="flex items-baseline justify-between gap-3 flex-wrap px-5 py-4 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </h3>
        {meta && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {meta}
          </span>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
