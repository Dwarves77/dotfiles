"use client";

/**
 * ProfileForm — self-service verified-pseudonymous identity (spec 05 §2, §5 component 1; lane
 * COMMUNITY-C, 2026-09-03). The gap this component closes: nothing could write org_type/role/sector/
 * region or start corporate-email verification for a member — the benchmark response route (and the
 * whole write path) is gated behind exactly this.
 *
 * ONE PRIMARY GOAL: declare (or update) your community identity and, separately, verify a corporate
 * email — the precondition for contributing to the house benchmark (spec 05 §1, §3). Two dominant
 * actions live in two separate sections (declare vs. verify) rather than competing on one screen (law
 * 7); "Save profile" is primary in the first, "Verify" is primary in the second.
 *
 * Pseudonymity is explained in one line, right under the heading (law 14 — explain requirements before
 * submission): "Other members see your role, sector and region — never your name, email or company."
 *
 * Async feedback: both actions set a pending state synchronously (law 6, within 400 ms), disable their
 * own button while pending, and show a clear success or error state (law 15 — errors explain what went
 * wrong and preserve whatever was already typed; the save form never clears on error).
 */

import { useEffect, useState } from "react";
import { getOwnProfile, updateOwnProfile, verifyOwnProfile } from "./api-client";
import type { CommunityProfile } from "./api-client";
import { ORG_TYPES } from "@/lib/community/identity.mjs";
import { REGIONS } from "@/lib/community/profile-policy.mjs";

const ORG_TYPE_LABELS: Record<string, string> = {
  forwarder: "Freight forwarder",
  carrier: "Carrier",
  shipper: "Shipper",
  "customs-broker": "Customs broker",
  "3pl": "3PL",
  regulator: "Regulator",
  ngo: "NGO",
  analyst: "Analyst",
  other: "Other",
};

const REGION_LABELS: Record<string, string> = {
  EU: "EU / Europe",
  UK: "United Kingdom",
  US: "United States",
  LATAM: "Latin America",
  APAC: "Asia Pacific",
  HK: "Hong Kong",
  MEA: "Middle East & Africa",
  GLOBAL: "Global / Cross-jurisdictional",
};

type LoadStatus = "loading" | "loaded" | "error";
type SaveStatus = "idle" | "pending" | "success" | "error";
type VerifyStatus = "idle" | "pending" | "success" | "error";

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  fontSize: 14,
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  background: "var(--color-bg-surface)",
  color: "var(--color-text-primary)",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
};

const primaryButtonStyle = (pending: boolean): React.CSSProperties => ({
  height: 44,
  minWidth: 120,
  padding: "0 18px",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--color-bg-surface)",
  background: pending ? "var(--color-text-muted)" : "var(--color-text-primary)",
  border: "none",
  borderRadius: 4,
  cursor: pending ? "default" : "pointer",
});

export function ProfileForm() {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [profile, setProfile] = useState<CommunityProfile | null>(null);

  const [orgType, setOrgType] = useState("");
  const [role, setRole] = useState("");
  const [sector, setSector] = useState("");
  const [region, setRegion] = useState("");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getOwnProfile();
      if (cancelled) return;
      if (!result.ok) {
        setLoadStatus("error");
        return;
      }
      setProfile(result.profile);
      setOrgType(result.profile.orgType ?? "");
      setRole(result.profile.role ?? "");
      setSector(result.profile.sector ?? "");
      setRegion(result.profile.region ?? "");
      setLoadStatus("loaded");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgType) {
      setSaveStatus("error");
      setSaveError("Choose your organisation type before saving.");
      return;
    }
    setSaveStatus("pending");
    setSaveError(null);

    const result = await updateOwnProfile({
      org_type: orgType,
      role: role.trim() || null,
      sector: sector.trim() || null,
      region: region || null,
    });

    if (!result.ok) {
      setSaveStatus("error");
      setSaveError(result.error);
      return;
    }
    setSaveStatus("success");
    setProfile(result.profile);
  }

  async function handleVerify() {
    setVerifyStatus("pending");
    setVerifyError(null);
    const result = await verifyOwnProfile();
    if (!result.ok) {
      setVerifyStatus("error");
      setVerifyError(result.error);
      return;
    }
    setVerifyStatus("success");
    setProfile(result.profile);
  }

  if (loadStatus === "loading") {
    return (
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "24px 0" }}>
        Loading your profile…
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div role="alert" style={{ fontSize: 13, color: "var(--color-high, #b45309)", padding: "16px 0" }}>
        Could not load your profile. Reload the page to try again.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 520 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
        }}
      >
        Other members see your role, sector and region — never your name, email or company. The
        platform knows exactly who you are; the room does not.
      </p>

      {/* ── Section 1: declare (primary action: Save profile) ──────────────────────────────── */}
      <form
        aria-label="Community profile"
        onSubmit={handleSave}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <h3
          data-guard-title
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}
        >
          Your community identity
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="profile-org-type" style={labelStyle}>
            Organisation type
          </label>
          <select
            id="profile-org-type"
            value={orgType}
            onChange={(e) => setOrgType(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select one…</option>
            {ORG_TYPES.map((t: string) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="profile-role" style={labelStyle}>
            Role (optional)
          </label>
          <input
            id="profile-role"
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Trade lane manager"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="profile-sector" style={labelStyle}>
            Sector (optional)
          </label>
          <input
            id="profile-sector"
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="e.g. cold-chain"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="profile-region" style={labelStyle}>
            Region (optional)
          </label>
          <select
            id="profile-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={inputStyle}
          >
            <option value="">No region set</option>
            {REGIONS.map((r: string) => (
              <option key={r} value={r}>
                {REGION_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="submit" disabled={saveStatus === "pending"} style={primaryButtonStyle(saveStatus === "pending")}>
            {saveStatus === "pending" ? "Saving…" : "Save profile"}
          </button>
          <div role="status" aria-live="polite" style={{ fontSize: 12 }}>
            {saveStatus === "success" ? (
              <span style={{ color: "var(--color-text-secondary)" }}>Saved.</span>
            ) : null}
            {saveStatus === "error" ? (
              <span role="alert" style={{ color: "var(--color-high, #b45309)" }}>
                {saveError}
              </span>
            ) : null}
          </div>
        </div>
      </form>

      {/* ── Section 2: verify (primary action: Verify) ──────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14, borderTop: "1px solid var(--color-border)" }}>
        <h3
          data-guard-title
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}
        >
          Corporate-email verification
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55 }}>
          Verification uses the email already on your account — a company domain on a confirmed account
          address is the verification itself, no second email is sent. Required before your submissions
          to the house benchmark are counted (spec 05 §1).
        </p>

        {profile?.verified ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-text-primary)", fontWeight: 600 }}>
            ✓ Verified via corporate email{profile.verifiedAt ? ` on ${profile.verifiedAt.slice(0, 10)}` : ""}.
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifyStatus === "pending"}
              style={primaryButtonStyle(verifyStatus === "pending")}
            >
              {verifyStatus === "pending" ? "Verifying…" : "Verify"}
            </button>
            <div role="status" aria-live="polite" style={{ fontSize: 12 }}>
              {verifyStatus === "error" ? (
                <span role="alert" style={{ color: "var(--color-high, #b45309)" }}>
                  {verifyError}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
