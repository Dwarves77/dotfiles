"use client";

/**
 * OrganizationPanel — Account · Profile · Organization (redesign T10).
 *
 * dc.html p14 / artboard 14 draws this card as a head plus ONE row: the
 * ORGANIZATION NAME and SLUG fields with Save. That is what the card body is
 * now (lane admin60, 2026-09-08). The org identity table (name / slug / plan /
 * members / created) and the workspace-scope footnote, which used to sit ABOVE
 * those fields where the artboard has nothing, are kept and moved below them as
 * a card-foot disclosure under ruling R7.
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
import { RowTable } from "@/components/ui/RowTable";
import { formatLocaleDate } from "@/lib/format";

interface OrgPayload {
  org: { id: string; name: string; slug: string; plan: string; created_at: string };
  caller_role: "owner" | "admin" | "member" | "viewer";
  owner: { user_id: string; display_name: string; owner_since: string } | null;
  member_count: number;
}

/** The R7 disclosure's track list, the same admin RowTable anatomy. */
const ORG_COLUMNS = [
  { label: "Name", width: "1fr" },
  { label: "Slug", width: "120px" },
  { label: "Plan", width: "110px" },
  { label: "Members", width: "160px" },
  { label: "Created", width: "120px" },
];

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
    : formatLocaleDate(created, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <AccountCard
      title="Organization"
      meta="Workspace-scoped settings persist to this org"
      bodyPad={false}
    >
      {/* dc.html p14's ORGANIZATION body: two labelled fields and Save on one
          row (1fr 1fr auto, aligned to the field baselines). */}
      <form data-audit="org-fields-row" onSubmit={submit} style={{ padding: "14px 16px 16px", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <FieldLabel>Organization name</FieldLabel>
          <TextInput
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            disabled={submitting || !isOwner}
            placeholder="Your organization name"
          />
        </div>
        <div>
          <FieldLabel>Slug</FieldLabel>
          <TextInput
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value.toLowerCase())}
            disabled={submitting || !isOwner}
            placeholder="org-slug"
          />
        </div>
        <InkButton
          type="submit"
          disabled={
            !isOwner ||
            submitting ||
            (nameDraft.trim() === data.org.name && slugDraft.trim().toLowerCase() === data.org.slug)
          }
        >
          {submitting ? "Saving…" : "Save"}
        </InkButton>
      </form>

      {status && (
        <div
          role="status"
          style={{
            fontSize: 11,
            padding: "8px 10px",
            borderRadius: 6,
            margin: "0 16px 12px",
            color: status.kind === "ok" ? "var(--color-success)" : "var(--color-error)",
            background: status.kind === "ok" ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
            border: `1px solid ${status.kind === "ok" ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}`,
          }}
        >
          {status.text}
        </div>
      )}

      {/* Ruling R7: the org identity table (name / slug / plan / members /
          created) and the workspace-scope footnote are real features artboard 14
          does not draw. They are not removed and not restyled, they move BELOW
          the designed region, as a card-foot disclosure, which is where R7's own
          precedents put an undesigned block that sits where a designed one must
          go. Lane admin60, 2026-09-08. */}
      <details data-audit="org-record-disclosure" style={{ borderTop: "1px solid var(--line-2)" }}>
        <summary
          style={{
            padding: "10px 16px",
            background: "var(--page)",
            fontSize: "var(--fs-12)",
            fontWeight: 600,
            color: "var(--ink-3)",
            cursor: "pointer",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
          }}
        >
          Workspace record
        </summary>
        <div>
          <RowTable
            columns={ORG_COLUMNS}
            rows={[
              {
                key: data.org.id,
                cells: [
                  <span key="name" style={{ display: "block", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {data.org.name}
                  </span>,
                  <span
                    key="slug"
                    style={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-115)", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {data.org.slug}
                  </span>,
                  <span
                    key="plan"
                    style={{
                      display: "inline-block",
                      maxWidth: "100%",
                      padding: "4px 9px",
                      borderRadius: 4,
                      background: "var(--tag)",
                      fontWeight: 600,
                      fontSize: "var(--fs-105)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {data.org.plan}
                  </span>,
                  <span key="members" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {data.member_count}
                    {data.owner ? ` · owner ${data.owner.display_name}` : ""}
                  </span>,
                  <span key="created" style={{ display: "block", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {createdStr}
                  </span>,
                ],
              },
            ]}
          />
          <p
            style={{
              margin: 0,
              padding: "10px 16px",
              borderTop: "1px solid var(--line-2)",
              background: "var(--page)",
              fontSize: "var(--fs-11)",
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            Workspace-scoped settings (briefing schedule, jurisdiction weights) persist to this organization.
            Billing and plan changes are owner-only.
          </p>
        </div>
      </details>
    </AccountCard>
  );
}
