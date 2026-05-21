"use client";

/**
 * GroupModals — modal surfaces for the GroupHeader actions.
 *
 * Three modals, each toggled by a parent-owned open-flag:
 *
 *   - MembersModal     directory of members for the group, leave action.
 *                      Admin/moderator sees the full roster; rank-and-file
 *                      sees their own row only (RLS scopes the read).
 *
 *   - SettingsModal    admin-only. Rename, description, privacy edits.
 *                      Privacy downgrade is permitted but UI surfaces a
 *                      warning that historical posts widen visibility.
 *
 *   - InviteModal      admin-only. Search invitable candidates, send
 *                      invitations, list and revoke pending invitations.
 *
 * All three share the same chromeless modal shell + toast hook so the
 * surface stays coherent. No external modal library (the app does not
 * have one configured yet); we render a plain <div> overlay with
 * focus-trap behaviour limited to first-focus-on-open. Escape closes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, Users, Settings, UserPlus, AlertCircle } from "lucide-react";

// ════════════════════════════════════════════════════════════════
// Shared modal shell
// ════════════════════════════════════════════════════════════════

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  icon?: ReactNode;
  width?: number;
}

function ModalShell({ title, onClose, children, icon, width = 560 }: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // First-focus on the dialog itself so screen readers announce the
    // title and Escape lands the keystroke. Full focus-trap is out of
    // scope for Build 10; the modal contains its own focusable controls
    // and the page underneath is overlaid.
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px",
        zIndex: 60,
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          width: "100%",
          maxWidth: width,
          maxHeight: "84vh",
          display: "flex",
          flexDirection: "column",
          outline: "none",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          {icon}
          <h2
            style={{
              flex: 1,
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </header>
        <div
          style={{
            overflowY: "auto",
            padding: "16px 18px 18px",
            flex: 1,
            minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MembersModal
// ════════════════════════════════════════════════════════════════

interface MemberRow {
  user_id: string;
  role: "admin" | "moderator" | "member";
  joined_at: string;
  name: string | null;
  headshot_url: string | null;
  is_self: boolean;
}

interface MembersModalProps {
  groupId: string;
  groupName: string;
  callerRole: "admin" | "moderator" | "member" | null;
  onClose: () => void;
  onToast?: (message: string) => void;
  /** Called after a successful leave so the parent can navigate away. */
  onAfterLeave?: () => void;
}

export function MembersModal({
  groupId,
  groupName,
  callerRole,
  onClose,
  onToast,
  onAfterLeave,
}: MembersModalProps) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/community/groups/${groupId}/members`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(j?.error ?? `Failed (${res.status})`);
          return;
        }
        setMembers(j.members ?? []);
      } catch {
        if (!cancelled) setError("Network error loading members");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const sortedMembers = useMemo(
    () =>
      (members ?? []).slice().sort((a, b) => {
        // Admins, then moderators, then members; stable on name.
        const order = { admin: 0, moderator: 1, member: 2 } as const;
        const ra = order[a.role];
        const rb = order[b.role];
        if (ra !== rb) return ra - rb;
        return (a.name ?? "").localeCompare(b.name ?? "");
      }),
    [members]
  );

  const onLeave = useCallback(async () => {
    if (leaving) return;
    const confirmed = window.confirm(
      `Leave ${groupName}? You will lose access to private posts. You can rejoin only by invitation if this is a private group.`
    );
    if (!confirmed) return;
    setLeaving(true);
    try {
      const res = await fetch(
        `/api/community/groups/${groupId}/members`,
        { method: "DELETE" }
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        onToast?.(j?.error ?? `Could not leave (${res.status})`);
        setLeaving(false);
        return;
      }
      onToast?.("Left group");
      onAfterLeave?.();
      onClose();
    } catch {
      onToast?.("Network error");
      setLeaving(false);
    }
  }, [leaving, groupId, groupName, onClose, onToast, onAfterLeave]);

  return (
    <ModalShell
      title={`Members of ${groupName}`}
      onClose={onClose}
      icon={<Users size={16} color="var(--color-text-muted)" />}
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {members === null && !error && <SkeletonRows count={4} />}
      {members && members.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {sortedMembers.map((m) => (
            <MemberRowItem key={m.user_id} member={m} />
          ))}
        </ul>
      )}
      {members && members.length === 0 && !error && (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          No members visible to your role.
        </p>
      )}
      {callerRole && (
        <footer
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onLeave}
            disabled={leaving}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              color: "var(--color-critical, #b91c1c)",
              padding: "7px 14px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: 4,
              cursor: leaving ? "wait" : "pointer",
              opacity: leaving ? 0.6 : 1,
            }}
          >
            {leaving ? "Leaving…" : "Leave group"}
          </button>
        </footer>
      )}
    </ModalShell>
  );
}

function MemberRowItem({ member }: { member: MemberRow }) {
  const initials =
    (member.name ?? "?")
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg-base)",
        borderRadius: 4,
      }}
    >
      {member.headshot_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.headshot_url}
          alt=""
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "var(--color-primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {member.name ?? "Unknown user"}
          {member.is_self && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 10,
                fontWeight: 700,
                color: "var(--color-text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              You
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Joined {new Date(member.joined_at).toLocaleDateString()}
        </div>
      </div>
      <RolePill role={member.role} />
    </li>
  );
}

function RolePill({ role }: { role: "admin" | "moderator" | "member" }) {
  const config = {
    admin: {
      bg: "var(--color-text-primary)",
      fg: "var(--color-bg-base)",
      label: "Admin",
    },
    moderator: {
      bg: "transparent",
      fg: "var(--color-text-secondary)",
      label: "Moderator",
    },
    member: {
      bg: "transparent",
      fg: "var(--color-text-muted)",
      label: "Member",
    },
  }[role];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 3,
        border:
          role === "admin" ? "0" : "1px solid var(--color-border)",
        background: config.bg,
        color: config.fg,
      }}
    >
      {config.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════
// SettingsModal
// ════════════════════════════════════════════════════════════════

interface GroupSnapshot {
  id: string;
  name: string;
  description: string | null;
  privacy: "public" | "private";
}

interface SettingsModalProps {
  group: GroupSnapshot;
  onClose: () => void;
  onToast?: (message: string) => void;
  /** Called with the patched group so the page can update in place. */
  onSaved?: (next: GroupSnapshot) => void;
}

const MAX_NAME = 80;
const MAX_DESCRIPTION = 600;

export function SettingsModal({
  group,
  onClose,
  onToast,
  onSaved,
}: SettingsModalProps) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [privacy, setPrivacy] = useState<"public" | "private">(group.privacy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== group.name ||
    description !== (group.description ?? "") ||
    privacy !== group.privacy;

  const downgrading = group.privacy === "private" && privacy === "public";

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (name.trim() !== group.name) body.name = name.trim();
      if (description !== (group.description ?? ""))
        body.description = description.length > 0 ? description : null;
      if (privacy !== group.privacy) body.privacy = privacy;

      const res = await fetch(
        `/api/community/groups/${group.id}/settings`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      onToast?.("Settings saved");
      onSaved?.(j.group ?? { ...group, ...body });
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }, [dirty, saving, name, description, privacy, group, onClose, onSaved, onToast]);

  return (
    <ModalShell
      title="Group settings"
      onClose={onClose}
      icon={<Settings size={16} color="var(--color-text-muted)" />}
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field
          label="Name"
          hint={`${name.length}/${MAX_NAME}`}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
            style={inputStyle}
          />
        </Field>
        <Field
          label="Description"
          hint={`${description.length}/${MAX_DESCRIPTION}`}
        >
          <textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, MAX_DESCRIPTION))
            }
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>
        <Field label="Privacy">
          <div style={{ display: "flex", gap: 10 }}>
            <PrivacyRadio
              value="private"
              current={privacy}
              onChange={setPrivacy}
              title="Private"
              subtitle="Members only. Posts hidden from non-members."
            />
            <PrivacyRadio
              value="public"
              current={privacy}
              onChange={setPrivacy}
              title="Public"
              subtitle="Anyone with an account can read and join."
            />
          </div>
          {downgrading && (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: "10px 12px",
                background: "var(--color-warning-bg, #fffbeb)",
                border: "1px solid var(--color-warning-border, #fde68a)",
                color: "var(--color-warning-text, #92400e)",
                borderRadius: 4,
                fontSize: 12,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Downgrading to public widens visibility for existing posts.
                Past private discussions become readable by any authenticated
                user. This cannot be retro-redacted.
              </span>
            </div>
          )}
        </Field>
      </div>
      <footer
        style={{
          marginTop: 22,
          paddingTop: 14,
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          style={secondaryButtonStyle}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          style={{
            ...primaryButtonStyle,
            opacity: !dirty || saving ? 0.6 : 1,
            cursor: !dirty || saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </footer>
    </ModalShell>
  );
}

function PrivacyRadio({
  value,
  current,
  onChange,
  title,
  subtitle,
}: {
  value: "public" | "private";
  current: "public" | "private";
  onChange: (next: "public" | "private") => void;
  title: string;
  subtitle: string;
}) {
  const selected = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={selected}
      style={{
        flex: 1,
        textAlign: "left",
        background: selected ? "var(--color-bg-base)" : "transparent",
        border: selected
          ? "1px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        borderRadius: 4,
        padding: "10px 12px",
        cursor: "pointer",
        color: "var(--color-text-primary)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-text-muted)",
          marginTop: 2,
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// InviteModal
// ════════════════════════════════════════════════════════════════

interface Candidate {
  user_id: string;
  name: string | null;
  headshot_url: string | null;
}

interface PendingInvitation {
  id: string;
  invitee_user_id: string;
  inviter_user_id: string | null;
  created_at: string;
  invitee_name: string | null;
  invitee_avatar: string | null;
  can_revoke: boolean;
}

interface InviteModalProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onToast?: (message: string) => void;
}

export function InviteModal({
  groupId,
  groupName,
  onClose,
  onToast,
}: InviteModalProps) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<PendingInvitation[] | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [revokingFor, setRevokingFor] = useState<string | null>(null);

  // Load pending invitations once on open. Refresh after each send/revoke.
  const loadPending = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/community/groups/${groupId}/invitations`,
        { cache: "no-store" }
      );
      const j = await res.json();
      if (!res.ok) {
        onToast?.(j?.error ?? "Could not load invitations");
        return;
      }
      setPending(j.invitations ?? []);
    } catch {
      onToast?.("Network error loading invitations");
    }
  }, [groupId, onToast]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Debounced candidate search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/community/groups/${groupId}/invite-candidates?q=${encodeURIComponent(
            query.trim()
          )}`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          onToast?.(j?.error ?? "Could not search candidates");
          setCandidates([]);
          return;
        }
        setCandidates(j.candidates ?? []);
      } catch {
        if (!cancelled) onToast?.("Network error searching candidates");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, groupId, onToast]);

  const sendInvite = useCallback(
    async (candidate: Candidate) => {
      if (sendingFor) return;
      setSendingFor(candidate.user_id);
      try {
        const res = await fetch(
          `/api/community/groups/${groupId}/invite`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ invitee_user_id: candidate.user_id }),
          }
        );
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          onToast?.(j?.error ?? `Could not invite (${res.status})`);
          return;
        }
        onToast?.(`Invited ${candidate.name ?? "user"}`);
        // Optimistic: remove from candidates, refetch pending.
        setCandidates((prev) =>
          prev.filter((c) => c.user_id !== candidate.user_id)
        );
        loadPending();
      } catch {
        onToast?.("Network error sending invitation");
      } finally {
        setSendingFor(null);
      }
    },
    [sendingFor, groupId, onToast, loadPending]
  );

  const revokeInvite = useCallback(
    async (invitation: PendingInvitation) => {
      if (revokingFor) return;
      const ok = window.confirm(
        `Revoke invitation to ${invitation.invitee_name ?? "this user"}?`
      );
      if (!ok) return;
      setRevokingFor(invitation.id);
      try {
        const res = await fetch(
          `/api/community/invitations/${invitation.id}/revoke`,
          { method: "POST" }
        );
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          onToast?.(j?.error ?? `Could not revoke (${res.status})`);
          return;
        }
        onToast?.("Invitation revoked");
        setPending((prev) =>
          (prev ?? []).filter((p) => p.id !== invitation.id)
        );
      } catch {
        onToast?.("Network error revoking invitation");
      } finally {
        setRevokingFor(null);
      }
    },
    [revokingFor, onToast]
  );

  return (
    <ModalShell
      title={`Invite to ${groupName}`}
      onClose={onClose}
      icon={<UserPlus size={16} color="var(--color-text-muted)" />}
      width={640}
    >
      <section>
        <label
          htmlFor="invite-search"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            display: "block",
            marginBottom: 6,
          }}
        >
          Find member
        </label>
        <input
          id="invite-search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          style={inputStyle}
        />
        <div style={{ minHeight: 72, marginTop: 10 }}>
          {searching && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Searching…
            </p>
          )}
          {!searching && query.trim().length >= 2 && candidates.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              No matching users (excluding existing members and pending invites).
            </p>
          )}
          {candidates.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {candidates.map((c) => (
                <li
                  key={c.user_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    background: "var(--color-bg-base)",
                  }}
                >
                  <Avatar name={c.name} headshotUrl={c.headshot_url} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "var(--color-text-primary)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name ?? "Unknown user"}
                  </span>
                  <button
                    type="button"
                    onClick={() => sendInvite(c)}
                    disabled={sendingFor === c.user_id}
                    style={{
                      ...primaryButtonStyle,
                      padding: "6px 12px",
                      opacity: sendingFor === c.user_id ? 0.6 : 1,
                      cursor:
                        sendingFor === c.user_id ? "wait" : "pointer",
                    }}
                  >
                    {sendingFor === c.user_id ? "Inviting…" : "Invite"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: "0 0 8px",
          }}
        >
          Pending invitations {pending ? `(${pending.length})` : ""}
        </h3>
        {pending === null && <SkeletonRows count={2} />}
        {pending && pending.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            No pending invitations.
          </p>
        )}
        {pending && pending.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {pending.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  background: "var(--color-bg-base)",
                }}
              >
                <Avatar
                  name={p.invitee_name}
                  headshotUrl={p.invitee_avatar}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {p.invitee_name ?? "Unknown user"}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                  >
                    Invited {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
                {p.can_revoke && (
                  <button
                    type="button"
                    onClick={() => revokeInvite(p)}
                    disabled={revokingFor === p.id}
                    style={{
                      ...secondaryButtonStyle,
                      color: "var(--color-critical, #b91c1c)",
                      padding: "6px 12px",
                      opacity: revokingFor === p.id ? 0.6 : 1,
                    }}
                  >
                    {revokingFor === p.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════
// Shared bits
// ════════════════════════════════════════════════════════════════

function Avatar({
  name,
  headshotUrl,
}: {
  name: string | null;
  headshotUrl: string | null;
}) {
  if (headshotUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl}
        alt=""
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  const initials =
    (name ?? "?")
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <div
      aria-hidden
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: "var(--color-primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{label}</span>
        {hint && (
          <span
            style={{
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: "0.04em",
              color: "var(--color-text-muted)",
              textTransform: "none",
            }}
          >
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 40,
            borderRadius: 4,
            background:
              "linear-gradient(90deg, var(--color-bg-base) 0%, var(--color-bg-raised, #f3f4f6) 50%, var(--color-bg-base) 100%)",
            backgroundSize: "200% 100%",
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  );
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        background: "var(--color-critical-bg, #fef2f2)",
        border: "1px solid var(--color-critical-border, #fecaca)",
        color: "var(--color-critical-text, #991b1b)",
        padding: "8px 12px",
        borderRadius: 4,
        fontSize: 12,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-base)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  padding: "8px 11px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  fontFamily: "inherit",
  outline: 0,
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "var(--color-invert-bg, var(--color-text-primary))",
  color: "var(--color-invert-text, var(--color-bg-base))",
  border: 0,
  borderRadius: 4,
  padding: "7px 14px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  padding: "7px 14px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
};

