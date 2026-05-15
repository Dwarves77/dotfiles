"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Mail, Plus, AlertCircle, Loader2 } from "lucide-react";

// NoWorkspaceLanding — the "you have no workspace yet" page that renders
// when an authenticated user has no org_memberships row.
//
// Three CTAs:
//   1. "Pending invitations" panel (renders if /api/invitations/mine returns rows)
//   2. "Accept by token" — paste an invitation URL or token
//   3. "Create your own workspace" — POST /api/orgs and redirect to /
//
// Chrome is intentionally minimal per dispatch decision I.3 — operator-functional,
// not visually polished. Workstream B (Multi-Tenant Foundation) — 2026-05-15.

interface PendingInvitation {
  id: string;
  org_id: string;
  org_name: string | null;
  org_slug: string | null;
  proposed_role: string;
  status: string;
  created_at: string;
  expires_at: string;
  token: string;
}

interface Props {
  userId: string;
  userEmail: string;
}

export function NoWorkspaceLanding({ userEmail }: Props) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Token-paste path
  const [token, setToken] = useState("");
  const [acceptingPaste, setAcceptingPaste] = useState(false);

  // Create-org path
  const [orgName, setOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/invitations/mine");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) setInvitations(json.invitations ?? []);
        else setInvitations([]);
      } catch {
        if (!cancelled) setInvitations([]);
      } finally {
        if (!cancelled) setLoadingInvites(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const acceptInvitation = async (inviteToken: string) => {
    setError(null);
    const cleanToken = inviteToken.trim().split("/").pop() || inviteToken.trim();
    const res = await fetch(`/api/invitations/${cleanToken}/accept`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not accept invitation.");
      return;
    }
    // Hard reload so server-bootstrap re-resolves the new org membership.
    window.location.href = "/";
  };

  const declineInvitation = async (inviteToken: string) => {
    setError(null);
    const res = await fetch(`/api/invitations/${inviteToken}/decline`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not decline invitation.");
      return;
    }
    setInvitations((prev) => prev?.filter((i) => i.token !== inviteToken) ?? []);
  };

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setAcceptingPaste(true);
    await acceptInvitation(token);
    setAcceptingPaste(false);
  };

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setCreatingOrg(true);
    setError(null);
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: orgName.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not create workspace.");
      setCreatingOrg(false);
      return;
    }
    // Hard reload so server-bootstrap re-resolves the new org membership,
    // then route to onboarding for sector profile setup.
    router.refresh();
    window.location.href = "/onboarding";
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
        <p
          className="text-xs uppercase tracking-wide mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Caro&apos;s Ledge · Setup
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          You don&apos;t have a workspace yet
        </h1>
        <p
          className="text-sm mt-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Signed in as {userEmail}. Either accept an invitation from your team,
          or create your own workspace.
        </p>

        {error && (
          <div
            className="mt-5 flex items-start gap-2 p-3 rounded-md text-sm"
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

        {/* Panel 1 — pending invitations addressed to this email */}
        <Section
          title="Pending invitations"
          icon={<Mail size={14} />}
        >
          {loadingInvites ? (
            <p className="text-xs flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
              <Loader2 size={12} className="animate-spin" /> Looking for invitations...
            </p>
          ) : !invitations || invitations.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              No pending invitations for {userEmail}.
            </p>
          ) : (
            <ul className="space-y-2">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-md border p-3 flex items-center justify-between gap-3"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {inv.org_name || inv.org_slug || "(unnamed workspace)"}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Role: {inv.proposed_role} · Expires{" "}
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      onClick={() => acceptInvitation(inv.token)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => declineInvitation(inv.token)}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Panel 2 — paste an invitation URL or token */}
        <Section title="Have an invitation URL?">
          <form onSubmit={submitToken} className="flex items-center gap-2">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your invitation URL or token here"
              className="flex-1 px-3 py-2 text-sm rounded-md border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
            <Button variant="primary" type="submit" disabled={!token.trim() || acceptingPaste}>
              {acceptingPaste ? "Accepting..." : "Accept"}
            </Button>
          </form>
        </Section>

        {/* Panel 3 — create your own workspace */}
        <Section title="Or start your own workspace" icon={<Plus size={14} />}>
          <form onSubmit={createOrg} className="space-y-3">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Workspace name (e.g. your company)"
              className="w-full px-3 py-2 text-sm rounded-md border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            />
            <div className="flex items-center gap-3">
              <Button variant="primary" type="submit" disabled={!orgName.trim() || creatingOrg}>
                {creatingOrg ? "Creating..." : "Create workspace"}
              </Button>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                You become the owner. You can invite teammates after.
              </span>
            </div>
          </form>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mt-6 rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <h2
        className="text-sm font-semibold mb-3 inline-flex items-center gap-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
