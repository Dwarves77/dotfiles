"use client";

import { useEffect, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Chip, FieldLabel } from "@/components/account/AccountPrimitives";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  ORG_ROLES,
  ORG_SIZE_DIMENSIONS,
  PROFILE_JSON_KEYS,
  parseOrgProfile,
  validateProfileInput,
} from "@/lib/profile/profile-contract.mjs";

// profile-contract.mjs is plain JS (no TS types to import), same convention as
// src/lib/workspace/profile.ts, which defines its own WorkspaceProfile interface rather than
// importing one from relevance.mjs.
interface OrgProfile {
  orgRoles: string[];
  orgSize: {
    headcount_band: string | null;
    revenue_band: string | null;
    shipment_volume_band: string | null;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// OrganisationProfileSection, Account · Settings · General (workstream 7,
// ADR-034 decision points 1-2, lane W2-E).
//
// Extends the EXISTING settings surface where workspace_settings.profile is
// edited today (this file's own FreightSectorsCard sibling in
// SettingsPage.tsx, and BriefingScheduleSection's alert_config sibling) ,
// no new page, per the lane brief. Same read-modify-write jsonb pattern as
// BriefingScheduleSection: workspace_settings.profile already carries OTHER
// keys (roles/transport_modes/trade_lanes/... from migration 251), so a
// save here reads the current row first and merges in only org_roles/org_size,
// never overwriting sibling keys.
//
// Plain-language labels (ADR-034 point 4: "outputs must be readable without
// a specialist"): role and size labels are the same phrasing a non-lawyer
// operator would use, not a regulatory term of art.
//
// RENDERING GUARD FIX (2026-10-02, PR #883 red run, job 37018932976): wraps the card in
// `SectionCard` + `SectionHeading`, not `AccountCard`. `AccountCard`'s title renders an inline
// `<span style={{fontFamily:"var(--font-display)"}}>` with no `data-guard-display` attribute,
// which is pre-existing, baseline-excused L7 (Anton-allowlist) debt on every OTHER settings card
// (layout-guard/baseline.json), and the layout guard forbids adding a NEW card to that baseline.
// `SectionHeading`'s own `<h2 data-guard-display="card-title">` is the ALREADY-SANCTIONED way to
// render an Anton card title (ANTON_ALLOWLIST, layout-guard/allowlists.mjs) ,  same precedent this
// file's sibling "Assumption register" card already used (SettingsPage.tsx) ,  so this card gets
// the house look with zero new L7 debt and no edit to AccountPrimitives (shared, out of this
// lane's write set).
// ───────────────────────────────────────────────────────────────────────────

const SIZE_DIMENSION_ORDER: Array<keyof typeof ORG_SIZE_DIMENSIONS> = ["headcount", "revenue", "shipment_volume"];

function sameProfile(a: OrgProfile, b: OrgProfile): boolean {
  const rolesEqual =
    a.orgRoles.length === b.orgRoles.length && a.orgRoles.every((r) => b.orgRoles.includes(r));
  const sizeEqual =
    a.orgSize.headcount_band === b.orgSize.headcount_band &&
    a.orgSize.revenue_band === b.orgSize.revenue_band &&
    a.orgSize.shipment_volume_band === b.orgSize.shipment_volume_band;
  return rolesEqual && sizeEqual;
}

const EMPTY_PROFILE: OrgProfile = {
  orgRoles: [],
  orgSize: { headcount_band: null, revenue_band: null, shipment_volume_band: null },
};

export function OrganisationProfileSection() {
  const orgId = useWorkspaceStore((s) => s.orgId);
  const userRole = useWorkspaceStore((s) => s.userRole);
  const orgName = useWorkspaceStore((s) => s.orgName);
  const canEdit = userRole === "owner" || userRole === "admin";

  const [profile, setProfile] = useState<OrgProfile>(EMPTY_PROFILE);
  const [baseline, setBaseline] = useState<OrgProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error: fetchError } = await supabase
        .from("workspace_settings")
        .select("profile")
        .eq("org_id", orgId)
        .maybeSingle();
      if (cancelled) return;
      if (fetchError) setError(fetchError.message);
      const loaded = parseOrgProfile(data?.profile);
      setProfile(loaded);
      setBaseline(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const dirty = !sameProfile(profile, baseline);

  const toggleRole = (id: string) => {
    setSaved(false);
    setProfile((p) => ({
      ...p,
      orgRoles: p.orgRoles.includes(id) ? p.orgRoles.filter((r) => r !== id) : [...p.orgRoles, id],
    }));
  };

  const setSizeBand = (dimension: keyof typeof ORG_SIZE_DIMENSIONS, bandId: string | null) => {
    setSaved(false);
    setProfile((p) => ({ ...p, orgSize: { ...p.orgSize, [`${dimension}_band`]: bandId } }));
  };

  const save = async () => {
    if (!orgId || !canEdit || !dirty) return;
    const { valid, errors } = validateProfileInput(profile);
    if (!valid) {
      setError(errors.join("; "));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: row } = await supabase
        .from("workspace_settings")
        .select("profile")
        .eq("org_id", orgId)
        .maybeSingle();
      const existing = (row?.profile ?? {}) as Record<string, unknown>;
      const { error: saveError } = await supabase
        .from("workspace_settings")
        .update({
          profile: {
            ...existing,
            [PROFILE_JSON_KEYS.orgRoles]: profile.orgRoles,
            [PROFILE_JSON_KEYS.orgSize]: profile.orgSize,
          },
        })
        .eq("org_id", orgId);
      if (saveError) {
        setError(saveError.message);
        return;
      }
      setBaseline(profile);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const canSave = dirty && canEdit && !!orgId && !saving;

  return (
    <SectionCard dataAudit="settings-organisation-profile">
      <SectionHeading title="Organisation profile" aside="Role & size" />
      <div style={{ padding: "0 16px 16px" }}>
        {loading ? (
          <p style={{ fontSize: "11.5px", color: "var(--color-text-muted)", margin: 0 }}>Loading…</p>
        ) : !orgId ? (
          <p style={{ fontSize: "11.5px", color: "var(--color-text-muted)", margin: 0 }}>
            Join or create a workspace to set an organisation profile.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: "11.5px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
              Which roles you hold and your organisation's size, used to show whether a regulation
              applies to you.
            </p>
            <div>
              <FieldLabel>What does your organisation do? Select every role that applies</FieldLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ORG_ROLES.map((role) => (
                  <Chip
                    key={role.id}
                    label={role.label}
                    on={profile.orgRoles.includes(role.id)}
                    onClick={() => canEdit && toggleRole(role.id)}
                  />
                ))}
              </div>
            </div>

            {SIZE_DIMENSION_ORDER.map((dimKey) => {
              const dim = ORG_SIZE_DIMENSIONS[dimKey];
              const bandKey = `${dimKey}_band` as keyof OrgProfile["orgSize"];
              return (
                <div key={dimKey}>
                  <FieldLabel>{dim.label}</FieldLabel>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {dim.bands.map((band) => (
                      <Chip
                        key={band.id}
                        label={band.label}
                        on={profile.orgSize[bandKey] === band.id}
                        onClick={() =>
                          canEdit &&
                          setSizeBand(dimKey, profile.orgSize[bandKey] === band.id ? null : band.id)
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {error && (
              <p style={{ fontSize: "11.5px", color: "var(--color-error)", margin: 0 }}>{error}</p>
            )}

            <SaveControl saving={saving} canSave={canSave} onSave={save} showConfirmation={saved && !dirty} orgName={orgName} />

            <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              A regulation that only applies to a role or size you have not set will show what
              information it still needs from you, rather than guessing.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// Save button + inline confirmation, factored out of the render body so the profile-editing tab's
// only non-trivial JSX block is the control itself, not a copy of BriefingScheduleSection's inline
// styling, same 44px-floor / immediate-feedback contract (UX laws 2, 6), independent expression.
function SaveControl({
  saving,
  canSave,
  onSave,
  showConfirmation,
  orgName,
}: {
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  showConfirmation: boolean;
  orgName: string;
}) {
  const tone = canSave
    ? { border: "var(--color-primary)", bg: "var(--color-primary)", fg: "#FFFFFF" }
    : { border: "var(--color-border)", bg: "rgba(0,0,0,0.08)", fg: "var(--color-text-muted)" };
  return (
    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10 }}>
      <button
        disabled={!canSave}
        onClick={onSave}
        style={{
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          borderRadius: 6,
          color: tone.fg,
          cursor: canSave ? "pointer" : "default",
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          fontWeight: 700,
          minHeight: 44,
          padding: "8px 14px",
          whiteSpace: "nowrap",
        }}
        type="button"
      >
        {saving ? "Saving…" : "Save organisation profile"}
      </button>
      {showConfirmation ? (
        <span style={{ color: "var(--color-success)", fontSize: "11.5px", fontWeight: 700 }}>
          {`Saved to ${orgName || "workspace"}.`}
        </span>
      ) : null}
    </div>
  );
}
