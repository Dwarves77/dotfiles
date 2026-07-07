"use client";

/**
 * MembersPanel — Account · Profile · Members & roles (redesign T10).
 *
 * Rebuilt against "Pages - 10 Account". Role change (PATCH) and remove
 * (DELETE) are wired to /api/orgs/[org_id]/members; invite is wired to
 * /api/orgs/[org_id]/invitations (email-stub — returns an invite URL).
 * The last-owner / self-revoke guards are enforced server-side (same
 * controls as Admin → Workspaces).
 *
 * Ban is a KNOWN NEW BACKEND action (HANDOFF §7) — the platform-wide ban
 * is NOT yet built. Rather than fake it, the Ban control opens a typed
 * confirmation that renders the honest-pending state: the design's typed
 * confirm is shown, but the destructive action is disabled until the
 * member-management backend ships.
 *
 * Member identity renders the server-resolved display_name
 * (full_name ?? display_name ?? email ?? short id) — never a raw UUID.
 */

import { useCallback, useEffect, useState } from "react";
import { AccountCard, TextInput } from "@/components/account/AccountPrimitives";

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
  const [pendingInvites, setPendingInvites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const [banTarget, setBanTarget] = useState<Member | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setStatus({ kind, text });
    setTimeout(() => setStatus(null), 6000);
  }

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`/api/orgs/${orgId}/members`, { credentials: "include" }),
        fetch(`/api/orgs/${orgId}/invitations`, { credentials: "include" }).catch(() => null),
      ]);
      const payload = await mRes.json();
      if (!mRes.ok) {
        setError(payload?.error || `HTTP ${mRes.status}`);
        setData(null);
      } else {
        setData(payload as MembersResponse);
      }
      if (iRes && iRes.ok) {
        const inv = await iRes.json();
        const list = Array.isArray(inv?.invitations) ? inv.invitations : [];
        setPendingInvites(list.filter((x: { status?: string }) => x.status === "pending").length);
      } else {
        setPendingInvites(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(member: Member, nextRole: string) {
    if (!orgId || nextRole === member.role) return;
    setPendingId(member.id);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: member.id, role: nextRole }),
      });
      const payload = await res.json();
      if (!res.ok) flash("err", payload?.error || `HTTP ${res.status}`);
      else {
        flash("ok", `${member.display_name} is now ${ROLE_LABELS[nextRole]}`);
        await load();
      }
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(member: Member) {
    if (!orgId) return;
    if (!window.confirm(`Remove ${member.display_name} from this workspace? They lose access to it.`)) return;
    setPendingId(member.id);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members?membership_id=${encodeURIComponent(member.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const payload = await res.json();
      if (!res.ok) flash("err", payload?.error || `HTTP ${res.status}`);
      else {
        flash("ok", `Removed ${member.display_name}`);
        await load();
      }
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function invite() {
    if (!orgId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteUrl(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: "member" }),
      });
      const payload = await res.json();
      if (!res.ok) flash("err", payload?.error || `HTTP ${res.status}`);
      else {
        flash("ok", `Invitation created for ${inviteEmail.trim()}`);
        setInviteUrl(payload?.invitation?.invite_url ?? null);
        setInviteEmail("");
        await load();
      }
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Network error");
    } finally {
      setInviting(false);
    }
  }

  if (!orgId) {
    return (
      <AccountCard title="Members & roles" maxWidth={720}>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          You are not yet a member of any workspace. Member management appears once you join one.
        </p>
      </AccountCard>
    );
  }

  if (loading) {
    return (
      <AccountCard title="Members & roles" meta="Loading…" maxWidth={720}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>Loading members…</p>
      </AccountCard>
    );
  }

  if (error || !data) {
    return (
      <AccountCard title="Members & roles" meta="Error" maxWidth={720}>
        <p style={{ fontSize: 13, color: "var(--color-error)", margin: 0 }}>{error || "Failed to load members"}</p>
      </AccountCard>
    );
  }

  const isOwner = data.caller_role === "owner";
  const invitedMeta = pendingInvites != null ? ` · ${pendingInvites} invited` : "";

  return (
    <>
      <AccountCard
        title="Members & roles"
        meta={`${data.members.length} member${data.members.length === 1 ? "" : "s"}${invitedMeta}`}
        maxWidth={720}
      >
        {/* Invite row (owner/admin) */}
        {isOwner && (
          <div style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
            <TextInput
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              style={{ flex: 1, fontSize: "12.5px", padding: "9px 12px" }}
            />
            <button
              type="button"
              onClick={invite}
              disabled={inviting || !inviteEmail.trim()}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "11.5px",
                fontWeight: 800,
                padding: "9px 16px",
                borderRadius: 6,
                border: "1px solid var(--color-primary)",
                background: "var(--color-primary)",
                color: "#FFFFFF",
                cursor: inviting || !inviteEmail.trim() ? "not-allowed" : "pointer",
                opacity: inviting || !inviteEmail.trim() ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {inviting ? "Inviting…" : "Invite"}
            </button>
          </div>
        )}

        {inviteUrl && (
          <div
            style={{
              fontSize: 11,
              padding: "8px 12px",
              borderRadius: 6,
              margin: "0 0 12px",
              background: "var(--color-bg-ai-strip)",
              border: "1px solid var(--color-active-border)",
              color: "var(--color-text-secondary)",
              wordBreak: "break-all",
            }}
          >
            Invitation link (email delivery pending): <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>{inviteUrl}</span>
          </div>
        )}

        {status && (
          <div
            role="status"
            style={{
              fontSize: 11,
              padding: "8px 10px",
              borderRadius: 6,
              margin: "0 0 12px",
              color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
              background: status.kind === "ok" ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
              border: `1px solid ${status.kind === "ok" ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}`,
            }}
          >
            {status.text}
          </div>
        )}

        {data.members.map((m) => {
          const isPending = pendingId === m.id;
          const isSelf = m.user_id === callerUserId;
          const joined = new Date(m.joined_at);
          const joinedStr = Number.isNaN(joined.getTime()) ? m.joined_at : joined.toLocaleDateString("en-US");
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid var(--color-border-subtle)",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "12.5px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>
                  {m.display_name}
                  {isSelf && (
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--color-text-muted)", marginLeft: 6 }}>
                      you
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "1px 0 0" }}>
                  {ROLE_LABELS[m.role].toLowerCase()} · joined {joinedStr}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {isOwner ? (
                  <select
                    value={m.role}
                    disabled={isPending}
                    onChange={(e) => changeRole(m, e.target.value)}
                    aria-label={`Role for ${m.display_name}`}
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "9.5px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--color-primary)",
                      background: "var(--surface)",
                      border: "1px solid var(--color-active-border)",
                      borderRadius: 4,
                      padding: "3px 6px",
                      cursor: isPending ? "default" : "pointer",
                    }}
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    style={{
                      fontSize: "9.5px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--color-primary)",
                      border: "1px solid var(--color-active-border)",
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}
                  >
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
                {isOwner && (
                  <>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      disabled={isPending || isSelf}
                      title={isSelf ? "You cannot remove your own membership" : "Remove from workspace"}
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--color-text-secondary)",
                        background: "none",
                        border: "none",
                        cursor: isPending || isSelf ? "not-allowed" : "pointer",
                        opacity: isSelf ? 0.4 : 1,
                        padding: 2,
                      }}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setBanTarget(m)}
                      disabled={isSelf}
                      title={isSelf ? "You cannot ban yourself" : "Ban platform-wide"}
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--destructive-quiet, #9A3412)",
                        background: "none",
                        border: "none",
                        cursor: isSelf ? "not-allowed" : "pointer",
                        opacity: isSelf ? 0.4 : 1,
                        padding: 2,
                      }}
                    >
                      Ban
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        <p
          style={{
            fontSize: "10.5px",
            color: "var(--color-text-muted)",
            lineHeight: 1.55,
            margin: "10px 0 0",
            borderTop: "1px solid var(--color-border-subtle)",
            paddingTop: 10,
          }}
        >
          The role chip changes role in place (Owner / Admin / Member / Viewer). <b>Remove</b> detaches the
          member from this workspace; <b>Ban</b> blocks the account platform-wide behind a typed confirmation.
          The last owner cannot be removed. Same controls as Admin → Workspaces.
        </p>
      </AccountCard>

      {banTarget && (
        <BanDialog member={banTarget} onClose={() => setBanTarget(null)} />
      )}
    </>
  );
}

// ── Ban dialog — honest-pending (§7 member-management backend) ──────────────

function BanDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === member.display_name;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ban ${member.display_name}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          width: "min(440px, 100%)",
          padding: "20px 22px",
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", color: "var(--destructive-quiet, #9A3412)" }}>
          Ban {member.display_name} platform-wide
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>
          A platform-wide ban blocks this account across every workspace — a heavier action than removing them
          from this one. It requires typed confirmation.
        </p>
        <p style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 6px" }}>
          Type “{member.display_name}” to confirm
        </p>
        <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={member.display_name} />

        <div
          style={{
            fontSize: 11,
            lineHeight: 1.55,
            color: "var(--brass, #8A6A2A)",
            background: "var(--color-background)",
            border: "1px dashed rgba(0,0,0,0.25)",
            borderRadius: 6,
            padding: "10px 12px",
            margin: "12px 0 14px",
          }}
        >
          <b>Ban is not available yet.</b> The platform-wide ban action ships with the member-management
          backend (HANDOFF §7). Removing the member from this workspace works today.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              fontWeight: 700,
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid var(--color-border-medium)",
              background: "var(--surface)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Available when the member-management backend ships"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              fontWeight: 800,
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid var(--destructive-quiet, #9A3412)",
              background: matches ? "rgba(154,52,18,0.08)" : "transparent",
              color: "var(--destructive-quiet, #9A3412)",
              cursor: "not-allowed",
              opacity: 0.6,
            }}
          >
            Ban {member.display_name.split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}
