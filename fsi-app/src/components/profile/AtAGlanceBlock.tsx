"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import { Calendar, Briefcase, ShieldCheck, Clock, AlertCircle } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// AtAGlanceBlock (PR-L Profile restoration — Decision #15, F6)
//
// Compact rail showing key user-facing stats:
//   - Member since (auth.users.created_at via user_profiles.created_at)
//   - Workspace memberships (org_memberships count + role labels)
//   - Verifier status (user_profiles.verifier_status)
//   - Admin attention (only for owners/admins; reuses useAdminAttention)
//
// Reuses existing data sources — no new RPCs, no new tables. Fields with
// no data render an honest empty-state ("Not yet set") rather than a
// placeholder.
// ───────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  verifierStatus: string | null;
  profileCreatedAt?: string | null;
}

interface MembershipRow {
  org_id: string;
  role: string;
  created_at: string;
  org_name: string | null;
}

export function AtAGlanceBlock({ userId, verifierStatus, profileCreatedAt }: Props) {
  const userRole = useWorkspaceStore((s) => s.userRole);
  const orgName = useWorkspaceStore((s) => s.orgName);
  const isAdmin = userRole === "owner" || userRole === "admin";
  const { total: adminAttentionTotal } = useAdminAttention();

  const [memberships, setMemberships] = useState<MembershipRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("org_memberships")
        .select("org_id, role, created_at, organizations(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (!error && data) {
        setMemberships(
          data.map((row) => {
            // The Supabase typed embed returns an array OR a single row
            // depending on the relation cardinality; normalize to a name string.
            const organizations = (row as unknown as { organizations: { name?: string } | { name?: string }[] | null })
              .organizations;
            const org_name = Array.isArray(organizations)
              ? organizations[0]?.name ?? null
              : organizations?.name ?? null;
            return {
              org_id: row.org_id,
              role: row.role,
              created_at: row.created_at,
              org_name,
            };
          })
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const memberSince = formatMemberSince(profileCreatedAt);
  const verifierLabel = labelForVerifier(verifierStatus);

  return (
    <section
      className="rounded-lg border"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <header
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <h3
          className="text-[10px] font-bold uppercase"
          style={{
            letterSpacing: "0.14em",
            color: "var(--color-text-muted)",
          }}
        >
          At a glance
        </h3>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--color-border-subtle)" }}>
        <Row
          icon={<Calendar size={14} />}
          label="Member since"
          value={memberSince}
        />
        <Row
          icon={<Briefcase size={14} />}
          label="Workspace"
          value={
            loading
              ? "…"
              : memberships && memberships.length > 0
                ? memberships
                    .map((m) => `${m.org_name || "Workspace"} · ${m.role}`)
                    .join(" · ")
                : orgName
                  ? `${orgName}${userRole ? ` · ${userRole}` : ""}`
                  : "No workspace yet"
          }
        />
        <Row
          icon={<ShieldCheck size={14} />}
          label="Verifier"
          value={verifierLabel}
          accent={verifierStatus === "active" ? "success" : undefined}
        />
        {isAdmin && (
          <Row
            icon={
              adminAttentionTotal > 0 ? (
                <AlertCircle size={14} />
              ) : (
                <Clock size={14} />
              )
            }
            label="Admin attention"
            value={
              adminAttentionTotal > 0
                ? `${adminAttentionTotal} item${
                    adminAttentionTotal === 1 ? "" : "s"
                  } awaiting review`
                : "Inbox clear"
            }
            accent={adminAttentionTotal > 0 ? "warn" : undefined}
            href={adminAttentionTotal > 0 ? "/admin" : undefined}
          />
        )}
      </ul>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "success" | "warn";
  href?: string;
}) {
  const accentColor =
    accent === "success"
      ? "var(--color-success)"
      : accent === "warn"
        ? "var(--color-error)"
        : "var(--color-text-primary)";

  const body = (
    <>
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-md"
        style={{
          backgroundColor: "var(--color-surface-overlay)",
          color: "var(--color-text-secondary)",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="text-[10px] font-bold uppercase"
          style={{
            letterSpacing: "0.12em",
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </div>
        <div
          className="text-sm truncate"
          style={{ color: accentColor }}
        >
          {value}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <li>
        <a
          href={href}
          className="flex items-center gap-3 px-4 py-3 transition-colors"
          style={{ color: "inherit" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
              "var(--color-surface-raised)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
              "transparent";
          }}
        >
          {body}
        </a>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {body}
    </li>
  );
}

function formatMemberSince(iso: string | null | undefined): string {
  if (!iso) return "Not yet set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not yet set";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function labelForVerifier(status: string | null): string {
  switch (status) {
    case "active":
      return "Verified contributor";
    case "approved":
      return "Verified contributor";
    case "pending":
      return "Application under review";
    case "revoked":
      return "Revoked";
    case "rejected":
      return "Application not approved";
    default:
      return "Not a verifier";
  }
}
