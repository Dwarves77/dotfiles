"use client";

/**
 * MembersPanel — redesign TEMPLATE 08 (HANDOFF §6.8) "Current workspace ·
 * members" card. Member rows carry a role chip (Owner ▾), a Remove verb, and
 * a rust Ban verb. Destructive actions are WORDS, never icons.
 *
 * Member management (role change / remove / ban with typed confirmation +
 * last-owner guard) is KNOWN NEW BACKEND (HANDOFF §7): a committed migration
 * file + honest-pending only. This component ships the full UI affordances and
 * the client-side guards, but the mutations are HONEST-PENDING — the endpoints
 * are not wired yet, so each action surfaces an honest "lands when member
 * management ships" message rather than faking a write.
 *
 * Guards that ARE live client-side:
 *   - Last owner is immovable: Remove + Ban disabled on the sole remaining
 *     owner (a workspace can never be left owner-less).
 *   - Ban requires a TYPED confirmation (keyboard-operable dialog) — no
 *     one-click destructive action.
 *
 * Display-name chain (DO-NOT-REVERT): full_name ?? display_name ?? email ??
 * uuid-slice. NO raw UUIDs render in member rows.
 */

import { useEffect, useRef, useState } from "react";

type MemberUser = {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

type MemberRow = {
  id: string;
  org_id: string;
  user_id: string | null;
  role: string | null;
  created_at: string | null;
  user?: MemberUser | null;
};

export interface MembersPanelProps {
  members: MemberRow[];
  /** Add a teammate by email — reuses the parent's existing add flow. */
  onAddMember: (email: string) => void;
  /** Surface an honest toast (add/role/remove/ban all route here). */
  onToast: (msg: string) => void;
}

const ROLES = ["Owner", "Member", "Viewer"] as const;

// HONEST-PENDING copy — one string, reused across the three governed
// mutations so the surface never implies a write happened.
const PENDING_MSG = "Member management lands when the member role / remove / ban backend ships.";

/** Display-name chain: full_name ?? display_name ?? email ?? uuid-slice. */
function memberDisplayName(m: MemberRow): string {
  const u = m.user;
  const full = u?.full_name?.trim();
  if (full) return full;
  const display = u?.display_name?.trim();
  if (display) return display;
  const email = u?.email?.trim();
  if (email) return email;
  if (m.user_id) return `${m.user_id.slice(0, 8)}…`;
  return "(no profile)";
}

export function MembersPanel({ members, onAddMember, onToast }: MembersPanelProps) {
  const [email, setEmail] = useState("");
  const [banTarget, setBanTarget] = useState<MemberRow | null>(null);
  const banTriggerRef = useRef<HTMLButtonElement | null>(null);

  const ownerCount = members.filter(
    (m) => (m.role || "").toLowerCase() === "owner"
  ).length;

  const isLastOwner = (m: MemberRow) =>
    (m.role || "").toLowerCase() === "owner" && ownerCount <= 1;

  const submitAdd = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    onAddMember(trimmed);
    setEmail("");
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          background: "var(--raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          Current workspace · members
        </span>
      </div>

      <div style={{ padding: "14px 20px" }}>
        {/* Add by email */}
        <div style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
          <label htmlFor="member-add-email" className="sr-only">
            Email address to add a member
          </label>
          <input
            id="member-add-email"
            type="email"
            value={email}
            placeholder="Email address"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAdd();
            }}
            style={{
              flex: 1,
              fontFamily: "inherit",
              fontSize: 12.5,
              padding: "9px 12px",
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              outline: "none",
              background: "var(--color-background)",
              color: "var(--text)",
            }}
          />
          <button
            type="button"
            onClick={submitAdd}
            style={{
              fontFamily: "inherit",
              fontSize: 11.5,
              fontWeight: 800,
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary)",
              color: "#FFFFFF",
              cursor: "pointer",
            }}
          >
            + Add
          </button>
        </div>

        {members.length === 0 ? (
          <div
            style={{
              border: "1px solid var(--color-border-medium)",
              borderRadius: 6,
              padding: 14,
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 3px", color: "var(--text)" }}>
              No workspace members yet.
            </p>
            <p style={{ fontSize: 11.5, color: "var(--text-2)", margin: 0 }}>
              Add a teammate above — they join with the role you pick.
            </p>
          </div>
        ) : (
          members.map((m) => {
            const lastOwner = isLastOwner(m);
            return (
              <MemberRowView
                key={m.id}
                member={m}
                displayName={memberDisplayName(m)}
                lastOwner={lastOwner}
                onRole={() => onToast(PENDING_MSG)}
                onRemove={() => {
                  if (lastOwner) return;
                  onToast(PENDING_MSG);
                }}
                onBan={(triggerEl) => {
                  if (lastOwner) return;
                  banTriggerRef.current = triggerEl;
                  setBanTarget(m);
                }}
              />
            );
          })
        )}

        <p
          style={{
            fontSize: 10.5,
            color: "var(--text-2)",
            lineHeight: 1.55,
            margin: "10px 0 0",
            borderTop: "1px solid var(--color-border-subtle)",
            paddingTop: 10,
          }}
        >
          Role chip changes role in place (Owner / Member / Viewer).{" "}
          <b>Remove</b> detaches from this workspace; <b>Ban</b> blocks the account
          platform-wide and requires a typed confirmation — destructive actions are
          words, never icons. The last owner cannot be removed. These mutations land
          when the member-management backend ships.
        </p>
      </div>

      {banTarget && (
        <TypedConfirmDialog
          title="Ban this account"
          body={
            <>
              Banning <b>{memberDisplayName(banTarget)}</b> blocks the account
              platform-wide, not just from this workspace. This is destructive and
              cannot be undone from here.
            </>
          }
          phrase={memberDisplayName(banTarget)}
          confirmLabel="Ban account"
          onCancel={() => {
            setBanTarget(null);
            banTriggerRef.current?.focus();
          }}
          onConfirm={() => {
            setBanTarget(null);
            banTriggerRef.current?.focus();
            onToast(PENDING_MSG);
          }}
        />
      )}
    </div>
  );
}

function MemberRowView({
  member,
  displayName,
  lastOwner,
  onRole,
  onRemove,
  onBan,
}: {
  member: MemberRow;
  displayName: string;
  lastOwner: boolean;
  onRole: () => void;
  onRemove: () => void;
  onBan: (triggerEl: HTMLButtonElement) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const role = (member.role || "member").toLowerCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const joined = member.created_at
    ? new Date(member.created_at).toLocaleDateString()
    : "—";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderTop: "1px solid var(--color-border-subtle)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: "var(--text)" }}>
          {displayName}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-2)", margin: "1px 0 0" }}>
          {roleLabel.toLowerCase()} · joined {joined}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
        {/* Role chip — opens an in-place role menu (honest-pending mutation). */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-primary)",
            border: "1px solid var(--color-active-border)",
            borderRadius: 4,
            padding: "2px 8px",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {roleLabel} ▾
        </button>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 20,
              minWidth: 120,
              background: "var(--surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {ROLES.map((r) => (
              <button
                key={r}
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRole();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: r.toLowerCase() === role ? 800 : 600,
                  color: "var(--text)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onRemove}
          disabled={lastOwner}
          title={lastOwner ? "The last owner cannot be removed." : undefined}
          style={{
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 700,
            color: lastOwner ? "var(--text-disabled)" : "var(--text-2)",
            background: "none",
            border: "none",
            cursor: lastOwner ? "not-allowed" : "pointer",
            padding: 2,
            opacity: lastOwner ? 0.5 : 1,
          }}
        >
          Remove
        </button>

        <button
          type="button"
          onClick={(e) => onBan(e.currentTarget)}
          disabled={lastOwner}
          title={lastOwner ? "The last owner cannot be banned." : undefined}
          style={{
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 700,
            color: lastOwner ? "var(--text-disabled)" : "var(--destructive-quiet)",
            background: "none",
            border: "none",
            cursor: lastOwner ? "not-allowed" : "pointer",
            padding: 2,
            opacity: lastOwner ? 0.5 : 1,
          }}
        >
          Ban
        </button>
      </div>
    </div>
  );
}

/**
 * TypedConfirmDialog — keyboard-operable typed-confirmation modal. The confirm
 * button stays disabled until the operator types the exact phrase. Escape
 * cancels; focus starts on the input and returns to the trigger on close.
 */
function TypedConfirmDialog({
  title,
  body,
  phrase,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  phrase: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const match = typed.trim() === phrase.trim();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ban-dialog-title"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: 22,
        }}
      >
        <h3
          id="ban-dialog-title"
          style={{
            fontSize: 15,
            fontWeight: 800,
            margin: "0 0 8px",
            color: "var(--text)",
          }}
        >
          {title}
        </h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-2)", margin: "0 0 14px" }}>
          {body}
        </p>
        <label
          htmlFor="ban-confirm-input"
          style={{ display: "block", fontSize: 11.5, color: "var(--text-2)", margin: "0 0 6px" }}
        >
          Type <b style={{ color: "var(--text)" }}>{phrase}</b> to confirm
        </label>
        <input
          id="ban-confirm-input"
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && match) onConfirm();
          }}
          style={{
            width: "100%",
            fontFamily: "inherit",
            fontSize: 12.5,
            padding: "9px 12px",
            border: "1px solid var(--color-border-medium)",
            borderRadius: 6,
            outline: "none",
            background: "var(--color-background)",
            color: "var(--text)",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--color-border-medium)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!match}
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid var(--destructive-quiet)",
              background: match ? "var(--destructive-quiet)" : "transparent",
              color: match ? "#FFFFFF" : "var(--text-disabled)",
              cursor: match ? "pointer" : "not-allowed",
              opacity: match ? 1 : 0.6,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
