"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Mail, AlertCircle, Loader2, Check, X } from "lucide-react";

// InvitationLandingPage — the per-token accept/decline page rendered
// at /invitations/[token].
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

interface InvitationDetails {
  id: string;
  org_id: string;
  org_name: string;
  invited_email: string;
  proposed_role: string;
  status: string;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
}

interface Props {
  token: string;
  userEmail: string;
}

export function InvitationLandingPage({ token, userEmail }: Props) {
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) setInvitation(json.invitation);
        else setError(json.error || "Could not load invitation.");
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    setError(null);
    setActing("accept");
    const res = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setActing(null);
    if (!res.ok) {
      setError(json.error || "Could not accept invitation.");
      return;
    }
    setDone("accepted");
    setTimeout(() => {
      window.location.href = "/";
    }, 800);
  };

  const decline = async () => {
    setError(null);
    setActing("decline");
    const res = await fetch(`/api/invitations/${token}/decline`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setActing(null);
    if (!res.ok) {
      setError(json.error || "Could not decline invitation.");
      return;
    }
    setDone("declined");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div
        className="w-full max-w-md rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border-subtle)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Mail
            size={16}
            style={{ color: "var(--color-text-secondary)" }}
          />
          <p
            className="text-xs uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Workspace invitation
          </p>
        </div>

        {loading && (
          <p
            className="text-sm flex items-center gap-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Loader2 size={14} className="animate-spin" />
            Loading invitation...
          </p>
        )}

        {error && !loading && (
          <div
            className="flex items-start gap-2 p-3 rounded-md text-sm"
            style={{
              backgroundColor: "rgba(220, 38, 38, 0.06)",
              border: "1px solid rgba(220, 38, 38, 0.15)",
              color: "var(--color-error)",
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {invitation && !loading && !done && (
          <>
            <h1
              className="text-xl font-bold mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Join {invitation.org_name}
            </h1>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--color-text-secondary)" }}
            >
              You&apos;ve been invited to join <b>{invitation.org_name}</b> as{" "}
              <b>{invitation.proposed_role}</b>.
            </p>

            <dl
              className="text-xs mb-5 grid grid-cols-[120px_1fr] gap-y-1 gap-x-3"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <dt style={{ color: "var(--color-text-muted)" }}>Invited email:</dt>
              <dd>{invitation.invited_email}</dd>
              <dt style={{ color: "var(--color-text-muted)" }}>You&apos;re signed in as:</dt>
              <dd>{userEmail}</dd>
              <dt style={{ color: "var(--color-text-muted)" }}>Sent:</dt>
              <dd>{new Date(invitation.created_at).toLocaleString()}</dd>
              <dt style={{ color: "var(--color-text-muted)" }}>Expires:</dt>
              <dd>{new Date(invitation.expires_at).toLocaleString()}</dd>
              <dt style={{ color: "var(--color-text-muted)" }}>Status:</dt>
              <dd className="capitalize">{invitation.status}</dd>
            </dl>

            {invitation.invited_email.toLowerCase() !== userEmail.toLowerCase() && (
              <div
                className="mb-4 flex items-start gap-2 p-3 rounded-md text-xs"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.06)",
                  border: "1px solid rgba(245, 158, 11, 0.15)",
                  color: "var(--color-warning, #92400e)",
                }}
              >
                <AlertCircle size={12} />
                This invitation was sent to a different email address. Sign in
                with the matching account to accept.
              </div>
            )}

            {invitation.status === "pending" && !invitation.is_expired && (
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={accept}
                  disabled={
                    !!acting ||
                    invitation.invited_email.toLowerCase() !== userEmail.toLowerCase()
                  }
                >
                  {acting === "accept" ? "Accepting..." : "Accept"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={decline}
                  disabled={!!acting}
                >
                  {acting === "decline" ? "Declining..." : "Decline"}
                </Button>
              </div>
            )}

            {(invitation.status !== "pending" || invitation.is_expired) && (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                This invitation is no longer actionable.
              </p>
            )}
          </>
        )}

        {done === "accepted" && (
          <div className="space-y-2 text-center">
            <Check size={28} className="mx-auto" style={{ color: "var(--color-success, #22c55e)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              You&apos;re in
            </h2>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Redirecting to your dashboard...
            </p>
          </div>
        )}

        {done === "declined" && (
          <div className="space-y-2 text-center">
            <X size={28} className="mx-auto" style={{ color: "var(--color-text-muted)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Invitation declined
            </h2>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              You can close this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
