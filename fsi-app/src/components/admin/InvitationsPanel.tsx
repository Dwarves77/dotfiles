"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Mail, Plus, Loader2, AlertCircle, X, Copy, Check } from "lucide-react";

// InvitationsPanel — admin chrome for org invitation management.
//
// Mounted by AdminDashboard. Reads/writes via the /api/orgs/[org_id]/invitations
// endpoints. Workstream B (Multi-Tenant Foundation) — 2026-05-15.
//
// Features:
//   * List pending + recent invitations for the active org
//   * Create a new invitation (email + role)
//   * Revoke a pending invitation
//   * Copy invite URL to clipboard (real email sending is out of scope per
//     dispatch I.4)

interface Props {
  orgId: string;
}

interface Invitation {
  id: string;
  invited_email: string;
  proposed_role: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  invited_by_user_id: string | null;
  invite_url?: string; // present only on freshly-created invitations
}

const ROLES = ["member", "admin", "viewer"] as const;

export function InvitationsPanel({ orgId }: Props) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin" | "viewer">("member");
  const [creating, setCreating] = useState(false);
  const [recentInvite, setRecentInvite] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/invitations`);
      const json = await res.json();
      if (res.ok) setInvitations(json.invitations ?? []);
      else setError(json.error || "Could not load invitations");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setCreating(true);
    setError(null);
    setRecentInvite(null);
    setCopied(false);
    const res = await fetch(`/api/orgs/${orgId}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
    });
    const json = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(json.error || "Could not create invitation");
      return;
    }
    setRecentInvite(json.invitation);
    setNewEmail("");
    load();
  };

  const revoke = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/orgs/${orgId}/invitations/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Could not revoke");
      return;
    }
    load();
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <section
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <h2
        className="text-base font-semibold mb-3 inline-flex items-center gap-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        <Mail size={14} />
        Invitations
      </h2>

      {error && (
        <div
          className="mb-3 p-3 rounded-md text-sm flex items-start gap-2"
          style={{
            backgroundColor: "rgba(220, 38, 38, 0.06)",
            border: "1px solid rgba(220, 38, 38, 0.15)",
            color: "var(--color-error)",
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <form onSubmit={create} className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex-1 min-w-[200px]">
          <span
            className="block text-[10px] font-semibold uppercase mb-1"
            style={{ letterSpacing: "0.12em", color: "var(--color-text-muted)" }}
          >
            Email
          </span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          />
        </label>
        <label>
          <span
            className="block text-[10px] font-semibold uppercase mb-1"
            style={{ letterSpacing: "0.12em", color: "var(--color-text-muted)" }}
          >
            Role
          </span>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as typeof newRole)}
            className="px-3 py-2 text-sm rounded-md border outline-none"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" type="submit" disabled={creating || !newEmail.trim()}>
          <Plus size={14} />
          {creating ? "Sending..." : "Invite"}
        </Button>
      </form>

      {recentInvite?.invite_url && (
        <div
          className="mb-4 p-3 rounded-md text-xs"
          style={{
            backgroundColor: "var(--color-active-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        >
          <p className="mb-2">
            <b>Invitation created.</b> Email delivery is not yet wired —
            copy this URL and send it to the invitee:
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 px-2 py-1 text-[11px] rounded font-mono break-all"
              style={{
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-secondary)",
              }}
            >
              {recentInvite.invite_url}
            </code>
            <button
              type="button"
              onClick={() => copyUrl(recentInvite.invite_url!)}
              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p
          className="text-xs flex items-center gap-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          <Loader2 size={12} className="animate-spin" /> Loading...
        </p>
      ) : invitations.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          No invitations yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-3 p-3 rounded border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <div className="min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {inv.invited_email}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {inv.proposed_role} · {inv.status} ·
                  {inv.status === "pending"
                    ? ` expires ${new Date(inv.expires_at).toLocaleDateString()}`
                    : inv.status === "accepted"
                      ? ` accepted ${inv.accepted_at ? new Date(inv.accepted_at).toLocaleString() : ""}`
                      : inv.status === "declined"
                        ? ` declined ${inv.declined_at ? new Date(inv.declined_at).toLocaleString() : ""}`
                        : inv.status === "revoked"
                          ? ` revoked ${inv.revoked_at ? new Date(inv.revoked_at).toLocaleString() : ""}`
                          : ""}
                </p>
              </div>
              {inv.status === "pending" && (
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                  title="Revoke invitation"
                >
                  <X size={11} />
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
