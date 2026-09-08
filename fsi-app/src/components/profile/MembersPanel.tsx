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
 * Ban is ORG-SCOPED (operator ruling 2026-07-07 — NOT a platform-wide
 * account ban): it removes the member AND records a block-rejoin so the
 * account cannot re-join THIS workspace (enforced in accept_invitation,
 * migration 156). The Ban control opens a typed confirmation and POSTs to
 * /api/orgs/[org_id]/members. The account is unaffected in every other
 * workspace.
 *
 * Member identity renders the server-resolved display_name
 * (full_name ?? display_name ?? email ?? short id) — never a raw UUID.
 *
 * Composition, lane admin60 (2026-09-08), against dc.html p14 / artboard 14:
 * the member list is the artboard's TABLE, the shared `RowTable` under
 * MEMBER / JOINED / ROLE column headers with the trailing 44px overflow cell,
 * not the flex rows it used to draw; Remove and Ban moved off the row as text
 * buttons and into that overflow menu (ruling R7's precedent for row-level
 * secondary actions, the overlay styling left exactly as RowTable ships it, per
 * "overlays: unchanged and undesigned, do not invent"); the invite row gained
 * the artboard's "INVITE BY EMAIL" field label, its "name@company.com"
 * placeholder and its "Send invite" button; and the artboard's seat foot strip
 * is built from real workspace data where it exists (it does not: no seats /
 * seat_limit / max_members column exists in the schema or in any /api/orgs
 * payload, so the seat clause renders the Absence convention with reason
 * "connect data" and no "Manage seats" link is drawn, there being no seats
 * route, logged in DEVIATION-LOG.md).
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { AccountCard, FieldLabel, TextInput, InkButton } from "@/components/account/AccountPrimitives";
import { RowTable, RowTableOverflow } from "@/components/ui/RowTable";
import { StateNote } from "@/components/ui/StateNote";
import { Absence } from "@/components/ui/Absence";
import { formatLocaleDate } from "@/lib/format";

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

interface EmailDelivery {
  delivered: boolean;
  configured: boolean;
  reason?: string;
}

interface MembersPanelProps {
  orgId: string | null;
  callerUserId: string;
  /**
   * The signed-in reader's own email. dc.html p14's first row reads
   * "you · jasonlosh@hotmail.com" on its second line; /api/orgs/[id]/members
   * returns a resolved display_name and no email column, so the caller's own
   * address is passed in from the page (which already has it) rather than
   * guessed. Omitted = the second line reads "you" alone.
   */
  callerEmail?: string;
}

/** dc.html p14's MEMBERS & ROLES track list, verbatim. */
const MEMBER_COLUMNS = [
  { label: "Member", width: "1fr" },
  { label: "Joined", width: "120px" },
  { label: "Role", width: "150px" },
  { label: "", width: "44px" },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function MembersPanel({ orgId, callerUserId, callerEmail }: MembersPanelProps) {
  const [data, setData] = useState<MembersResponse | null>(null);
  const [pendingInvites, setPendingInvites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteDelivery, setInviteDelivery] = useState<EmailDelivery | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

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

  async function ban(member: Member) {
    if (!orgId) return;
    setPendingId(member.id);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: member.id }),
      });
      const payload = await res.json();
      if (!res.ok) flash("err", payload?.error || `HTTP ${res.status}`);
      else {
        flash("ok", `Banned ${member.display_name} from this workspace`);
        setBanTarget(null);
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
    setInviteDelivery(null);
    setInviteCopied(false);
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
        setInviteDelivery(payload?.email_delivery ?? null);
        setInviteEmail("");
        await load();
      }
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Network error");
    } finally {
      setInviting(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // ignore — clipboard API unavailable; the field is still selectable/copyable by hand.
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
        meta={`${data.members.length} member${data.members.length === 1 ? "" : "s"}${invitedMeta} · role changes apply immediately`}
        bodyPad={false}
      >
        {/* Invite row, dc.html p14: a labelled "INVITE BY EMAIL" field and a
            "Send invite" ink button on one baseline row, inside the card's own
            16px gutter. */}
        {isOwner && (
          <div data-audit="members-invite-row" style={{ padding: "14px 16px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
            <div>
              <FieldLabel>Invite by email</FieldLabel>
              <TextInput
                type="email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
              />
            </div>
            <InkButton type="button" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? "Inviting…" : "Send invite"}
            </InkButton>
          </div>
        )}

        {inviteUrl && (
          <div
            style={{
              fontSize: 11,
              padding: "10px 12px",
              borderRadius: 6,
              margin: "12px 16px 0",
              background: "var(--color-bg-ai-strip)",
              border: "1px solid var(--color-active-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
              {inviteDelivery?.delivered ? (
                <>An email was sent to the invitee. You can also share this link directly:</>
              ) : inviteDelivery && inviteDelivery.configured ? (
                <>
                  <b>Email delivery failed</b>
                  {inviteDelivery.reason ? <> — {inviteDelivery.reason}</> : null}. Copy this link
                  and send it to the invitee:
                </>
              ) : (
                <>
                  <b>Email is not configured</b> on this deployment — copy this link and send it to
                  the invitee:
                </>
              )}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "6px 8px",
                  borderRadius: 4,
                  background: "var(--surface)",
                  color: "var(--color-primary)",
                  fontWeight: 700,
                  fontSize: 11,
                  wordBreak: "break-all",
                }}
              >
                {inviteUrl}
              </code>
              <button
                type="button"
                onClick={copyInviteUrl}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "6px 10px",
                  borderRadius: 5,
                  border: "1px solid var(--color-border-medium)",
                  background: "var(--surface)",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {inviteCopied ? <Check size={11} /> : <Copy size={11} />}
                {inviteCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {status && (
          <div
            role="status"
            style={{
              fontSize: 11,
              padding: "8px 10px",
              borderRadius: 6,
              margin: "12px 16px 0",
              color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
              background: status.kind === "ok" ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
              border: `1px solid ${status.kind === "ok" ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}`,
            }}
          >
            {status.text}
          </div>
        )}

        {/* The member table, dc.html p14's own track list, verbatim. */}
        <div data-audit="members-table" style={{ marginTop: 10 }}>
          <RowTable
            columns={MEMBER_COLUMNS}
            rows={data.members.map((m) => {
              const isPending = pendingId === m.id;
              const isSelf = m.user_id === callerUserId;
              const joined = new Date(m.joined_at);
              const joinedStr = Number.isNaN(joined.getTime()) ? m.joined_at : formatJoined(joined);
              return {
                key: m.id,
                cells: [
                  <span key="member" style={{ display: "block", minWidth: 0 }}>
                    <b style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.display_name}
                    </b>
                    {/* dc.html p14's second line: "you · <email>" on the reader's
                        own row, nothing on anyone else's. The role is NOT repeated
                        here; it has its own column. */}
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--fs-11)",
                        color: "var(--ink-3)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {isSelf ? (callerEmail ? `you · ${callerEmail}` : "you") : "\u00a0"}
                    </span>
                  </span>,
                  <span
                    key="joined"
                    style={{ display: "block", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {joinedStr}
                  </span>,
                  isOwner ? (
                    <select
                      key="role"
                      value={m.role}
                      disabled={isPending}
                      onChange={(e) => changeRole(m, e.target.value)}
                      aria-label={`Role for ${m.display_name}`}
                      style={{
                        fontFamily: "inherit",
                        width: "100%",
                        minHeight: 44,
                        fontSize: "var(--fs-125)",
                        fontWeight: 600,
                        color: "var(--ink)",
                        background: "var(--surface)",
                        border: "1px solid rgba(0,0,0,.25)",
                        borderRadius: 6,
                        padding: "5px 8px",
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
                    <span key="role" style={{ display: "block", fontWeight: 600 }}>
                      {ROLE_LABELS[m.role]}
                    </span>
                  ),
                  isOwner ? (
                    <RowTableOverflow
                      key="more"
                      label={`More actions for ${m.display_name}`}
                      items={
                        isSelf
                          ? []
                          : [
                              { key: "remove", label: "Remove from workspace", onSelect: () => remove(m) },
                              { key: "ban", label: "Ban from this workspace", onSelect: () => setBanTarget(m) },
                            ]
                      }
                      extra={
                        isSelf ? (
                          <span style={{ display: "block", padding: "8px 10px", fontSize: "var(--fs-115)", color: "var(--ink-3)", lineHeight: 1.5 }}>
                            You cannot remove or ban your own membership.
                          </span>
                        ) : undefined
                      }
                    />
                  ) : (
                    <span key="more" aria-hidden="true" />
                  ),
                ],
              };
            })}
          />
        </div>

        {/* Legend foot, dc.html p14's own foot strip. */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--line-2)",
            background: "var(--page)",
            fontSize: "var(--fs-12)",
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          Owner · Admin · Member · Viewer. Remove detaches from this workspace; Ban blocks re-joining and
          asks for typed confirmation. The last owner cannot be removed.
        </div>

        {/* Seat strip, dc.html p14 draws "Workspace · you are the owner · 3 of 5
            seats used" with a "Manage seats" link. The seat clause has no data
            path (see the docblock), so it renders the Absence convention, and the
            link is not drawn because no seats route exists: a dead control is a
            defect (ruling 1.1). */}
        <div data-audit="members-seat-strip" style={{ margin: "0 16px 14px" }}>
          <StateNote>
            <b>Workspace</b> · you are {isOwner ? "the owner" : `a ${ROLE_LABELS[data.caller_role].toLowerCase()}`} · seat limit{" "}
            <Absence reason="connect data" />
          </StateNote>
        </div>
      </AccountCard>

      {banTarget && (
        <BanDialog
          member={banTarget}
          pending={pendingId === banTarget.id}
          onConfirm={() => ban(banTarget)}
          onClose={() => setBanTarget(null)}
        />
      )}
    </>
  );
}

/**
 * The artboard's JOINED cell reads "Apr 4 2026", month, day, year with no
 * comma. `formatLocaleDate`'s locale-pinned output for those parts carries the
 * comma, so it is dropped here rather than a second date formatter being
 * introduced (F36 keeps ONE locale-pinned formatter).
 */
function formatJoined(d: Date): string {
  return formatLocaleDate(d, { month: "short", day: "numeric", year: "numeric" }).replace(",", "");
}

// ── Ban dialog — org-scoped ban (typed confirmation → POST) ─────────────────

function BanDialog({
  member,
  pending,
  onConfirm,
  onClose,
}: {
  member: Member;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
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
          Ban {member.display_name} from this workspace
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>
          This removes {member.display_name} from the workspace <b>and</b> blocks the account from re-joining
          it — a fresh invitation will not let them back in until the ban is lifted. Their account is
          unaffected in every other workspace. Requires typed confirmation.
        </p>
        <p style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 6px" }}>
          Type “{member.display_name}” to confirm
        </p>
        <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={member.display_name} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
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
            disabled={!matches || pending}
            aria-disabled={!matches || pending}
            onClick={onConfirm}
            title={matches ? "Ban from this workspace" : "Type the name to confirm"}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "12.5px",
              fontWeight: 800,
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid var(--destructive-quiet, #9A3412)",
              background: matches ? "var(--destructive-quiet, #9A3412)" : "transparent",
              color: matches ? "#FFFFFF" : "var(--destructive-quiet, #9A3412)",
              cursor: !matches || pending ? "not-allowed" : "pointer",
              opacity: !matches || pending ? 0.6 : 1,
            }}
          >
            {pending ? "Banning…" : `Ban ${member.display_name.split(" ")[0]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
