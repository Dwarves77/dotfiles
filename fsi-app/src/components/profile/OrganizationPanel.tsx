"use client";

/**
 * OrganizationPanel — UserProfilePage Organization tab.
 *
 * Three-layer tenant model (ADR-001) places the org IS-blueprint-core
 * (between auth user and workspace). This surface shows the caller's
 * org identity (name, slug, owner, created date, member count) and
 * lets the owner edit the name + slug.
 *
 * Backed by /api/orgs/[org_id]:
 *   - GET returns org identity + owner + member_count + caller_role.
 *   - PATCH owner-only updates name and/or slug; the server validates
 *     slug shape and surfaces 23505 (slug taken) as 409.
 *
 * Per DP-1 the panel inlines every related action on the single org
 * row: view, owner identity, member count, edit form, save / cancel,
 * inline status banner. No tab switches.
 */

import { useCallback, useEffect, useState } from "react";
import { Save, Loader2, Crown, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelative, toDate } from "@/lib/relative-time";

interface OrgPayload {
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    created_at: string;
  };
  caller_role: "owner" | "admin" | "member" | "viewer";
  owner: {
    user_id: string;
    display_name: string;
    owner_since: string;
  } | null;
  member_count: number;
}

interface OrganizationPanelProps {
  orgId: string | null;
}

export function OrganizationPanel({ orgId }: OrganizationPanelProps) {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [slugDraft, setSlugDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
      const res = await fetch(`/api/orgs/${orgId}`, { credentials: "include" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload?.error || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(payload as OrgPayload);
        setNameDraft((payload as OrgPayload).org.name);
        setSlugDraft((payload as OrgPayload).org.slug);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !data) return;
    if (data.caller_role !== "owner") return;
    const trimmedName = nameDraft.trim();
    const trimmedSlug = slugDraft.trim().toLowerCase();
    const nameChanged = trimmedName !== data.org.name;
    const slugChanged = trimmedSlug !== data.org.slug;
    if (!nameChanged && !slugChanged) {
      flash("err", "Nothing to save");
      return;
    }
    setSubmitting(true);
    try {
      const body: { name?: string; slug?: string } = {};
      if (nameChanged) body.name = trimmedName;
      if (slugChanged) body.slug = trimmedSlug;
      const res = await fetch(`/api/orgs/${orgId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        flash("err", payload?.error || `HTTP ${res.status}`);
      } else {
        flash("ok", "Organization updated");
        await load();
      }
    } catch (err: any) {
      flash("err", err.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!orgId) {
    return (
      <Card title="Workspace organization" meta="No active workspace">
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          You are not yet a member of any organization. Create one from the
          onboarding flow, or accept an invitation, to populate this tab.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Workspace organization" meta="Loading...">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading organization details...
        </p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Workspace organization" meta="Error">
        <p className="text-sm" style={{ color: "var(--color-error)" }}>
          {error || "Failed to load organization"}
        </p>
      </Card>
    );
  }

  const isOwner = data.caller_role === "owner";
  const createdRelative = formatRelative(toDate(data.org.created_at) ?? new Date());

  return (
    <Card title="Workspace organization" meta="Three-layer tenant model (ADR-001)">
      {/* Read-only identity strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Stat label="Plan">
          <span
            className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase"
            style={{
              color: "var(--color-text-primary)",
              backgroundColor: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            {data.org.plan}
          </span>
        </Stat>
        <Stat label="Created">
          <span
            className="text-sm tabular-nums"
            style={{ color: "var(--color-text-primary)" }}
          >
            {new Date(data.org.created_at).toLocaleDateString()}
          </span>
          <span
            className="text-[11px] ml-1.5"
            style={{ color: "var(--color-text-muted)" }}
          >
            ({createdRelative})
          </span>
        </Stat>
        <Stat label="Owner">
          {data.owner ? (
            <div className="flex items-center gap-1.5">
              <Crown size={12} style={{ color: "var(--color-primary)" }} />
              <span
                className="text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                {data.owner.display_name}
              </span>
            </div>
          ) : (
            <span
              className="text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              (no owner assigned)
            </span>
          )}
        </Stat>
        <Stat label="Members">
          <div className="flex items-center gap-1.5">
            <Users size={12} style={{ color: "var(--color-text-secondary)" }} />
            <span
              className="text-sm tabular-nums"
              style={{ color: "var(--color-text-primary)" }}
            >
              {data.member_count}
            </span>
          </div>
        </Stat>
      </div>

      {/* Edit form — owner only */}
      <form onSubmit={submit} className="space-y-3">
        <Field label="Organization name">
          <Input
            value={nameDraft}
            onChange={setNameDraft}
            disabled={!isOwner || submitting}
            placeholder="Your organization name"
          />
        </Field>
        <Field label="Slug">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              /
            </span>
            <Input
              value={slugDraft}
              onChange={(v) => setSlugDraft(v.toLowerCase())}
              disabled={!isOwner || submitting}
              placeholder="org-slug"
            />
          </div>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Lowercase letters, digits, hyphens. 2-60 characters. Used in URLs
            and invitation links.
          </p>
        </Field>

        {!isOwner && (
          <div
            className="text-[11px] p-2 rounded"
            style={{
              color: "var(--color-text-secondary)",
              backgroundColor: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            Only the org owner can edit name and slug. Your role on this org
            is {data.caller_role}.
          </div>
        )}

        {status && (
          <div
            className="text-[11px] p-2 rounded"
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

        {isOwner && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              type="submit"
              disabled={
                submitting ||
                (nameDraft.trim() === data.org.name &&
                  slugDraft.trim().toLowerCase() === data.org.slug)
              }
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {submitting ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={submitting}
              onClick={() => {
                setNameDraft(data.org.name);
                setSlugDraft(data.org.slug);
              }}
            >
              Reset
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

// ── Shared bits (mirror the local Card/Field/Input idiom in UserProfilePage) ──

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-[10px] font-semibold uppercase mb-1.5"
        style={{
          letterSpacing: "0.12em",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm rounded-md border outline-none disabled:cursor-not-allowed"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text-primary)",
        opacity: disabled ? 0.7 : 1,
      }}
    />
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--color-border-subtle)",
        backgroundColor: "var(--color-surface-raised)",
      }}
    >
      <div
        className="text-[10px] font-bold uppercase mb-1"
        style={{
          letterSpacing: "0.12em",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
