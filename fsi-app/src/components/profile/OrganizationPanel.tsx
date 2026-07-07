"use client";

/**
 * OrganizationPanel — Account · Profile · Organization (redesign T10).
 *
 * Rebuilt against "Pages - 10 Account". Shows the org identity as a
 * compact table (name / slug / plan / members / created) plus the
 * workspace-scope footnote. The owner name/slug editor is preserved
 * below the table (owner-only) so the redesign loses no capability.
 *
 * Backed by /api/orgs/[org_id] (GET + owner PATCH).
 *
 * Honesty note: the mock's "Last activity" column would need per-org
 * activity events (HANDOFF §7, not yet shipped), so the last column
 * renders the real created date labelled "Created" rather than a
 * fabricated activity timestamp.
 */

import { useCallback, useEffect, useState } from "react";
import { AccountCard, FieldLabel, TextInput, InkButton } from "@/components/account/AccountPrimitives";

interface OrgPayload {
  org: { id: string; name: string; slug: string; plan: string; created_at: string };
  caller_role: "owner" | "admin" | "member" | "viewer";
  owner: { user_id: string; display_name: string; owner_since: string } | null;
  member_count: number;
}

export function OrganizationPanel({ orgId }: { orgId: string | null }) {
  const [data, setData] = useState<OrgPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [slugDraft, setSlugDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !data || data.caller_role !== "owner") return;
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
      if (!res.ok) flash("err", payload?.error || `HTTP ${res.status}`);
      else {
        flash("ok", "Organization updated");
        await load();
      }
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!orgId) {
    return (
      <AccountCard title="Organization" maxWidth={720}>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          You are not yet a member of any workspace. Create one from onboarding, or accept an invitation, to
          populate this tab.
        </p>
      </AccountCard>
    );
  }
  if (loading) {
    return (
      <AccountCard title="Organization" meta="Loading…">
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>Loading organization…</p>
      </AccountCard>
    );
  }
  if (error || !data) {
    return (
      <AccountCard title="Organization" meta="Error">
        <p style={{ fontSize: 13, color: "var(--color-error)", margin: 0 }}>{error || "Failed to load organization"}</p>
      </AccountCard>
    );
  }

  const isOwner = data.caller_role === "owner";
  const created = new Date(data.org.created_at);
  const createdStr = Number.isNaN(created.getTime())
    ? "—"
    : created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  const cols = "1.4fr 1fr 0.8fr 0.7fr 0.9fr";

  return (
    <section
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
          background: "var(--color-surface-raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <span style={{ fontSize: "12.5px", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
          Organization
        </span>
      </div>

      {/* Table (scrolls horizontally on narrow viewports) */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, minWidth: 560 }}>
          {["Name", "Slug", "Plan", "Members", "Created"].map((h, i) => (
            <span
              key={h}
              style={{
                fontSize: "9.5px",
                fontWeight: 800,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                padding: i === 0 ? "10px 14px 10px 20px" : "10px 14px",
                background: "var(--color-background)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {h}
            </span>
          ))}
          <span style={{ fontSize: 13, fontWeight: 800, padding: "12px 14px 12px 20px", color: "var(--color-text-primary)" }}>
            {data.org.name}
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "12px 14px", fontFamily: "monospace" }}>
            {data.org.slug}
          </span>
          <span style={{ padding: "12px 14px" }}>
            <span
              style={{
                fontSize: "9.5px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--accent-blue)",
                border: "1px solid rgba(37,99,235,0.35)",
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              {data.org.plan}
            </span>
          </span>
          <span style={{ fontSize: "12.5px", fontWeight: 700, padding: "12px 14px", color: "var(--color-text-primary)" }}>
            {data.member_count}
            {data.owner ? (
              <span style={{ fontWeight: 500, color: "var(--color-text-muted)" }}> · owner {data.owner.display_name}</span>
            ) : null}
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "12px 20px 12px 14px" }}>{createdStr}</span>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0, padding: "10px 20px", background: "var(--color-background)", borderTop: "1px solid var(--color-border-subtle)" }}>
        Workspace-scoped settings (briefing schedule, jurisdiction weights) persist to this organization.
        Billing and plan changes are owner-only.
      </p>

      {/* Owner editor — preserved capability (name / slug) */}
      {isOwner && (
        <form onSubmit={submit} style={{ padding: "16px 20px", borderTop: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, margin: "0 0 12px" }}>
            <div>
              <FieldLabel>Organization name</FieldLabel>
              <TextInput value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} disabled={submitting} placeholder="Your organization name" />
            </div>
            <div>
              <FieldLabel>Slug</FieldLabel>
              <TextInput value={slugDraft} onChange={(e) => setSlugDraft(e.target.value.toLowerCase())} disabled={submitting} placeholder="org-slug" />
            </div>
          </div>
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
          <InkButton type="submit" disabled={submitting || (nameDraft.trim() === data.org.name && slugDraft.trim().toLowerCase() === data.org.slug)}>
            {submitting ? "Saving…" : "Save organization"}
          </InkButton>
        </form>
      )}
    </section>
  );
}
