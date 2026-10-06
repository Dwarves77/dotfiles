"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Mail, Plus, AlertCircle, Loader2 } from "lucide-react";
import { formatLocaleDate } from "@/lib/format";
import { ALL_SECTORS } from "@/lib/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ORG_SIZE_DIMENSIONS } from "@/lib/profile/profile-contract.mjs";
import { REGIONS } from "@/lib/community/profile-policy.mjs";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

// NoWorkspaceLanding — the "you have no workspace yet" page that renders
// when an authenticated user has no org_memberships row. UI system handoff
// 2026-09-06 (README screen 17 "Onboarding"): this is step 1 ("Workspace")
// of the 4-step onboarding stepper shared with /onboarding — no separate
// artboard exists for this step's own panel content, so AuthFrame +
// OnboardingStepper (both artboard-specified) wrap the pre-existing
// three-CTA content, whose functionality is unchanged.
//
// Lane AUTH-2 (2026-10-06): this is where a signed-in user with no membership lands (AppShell redirects
// here on a resolved no-workspace answer). Signup asks only for email and password, so the questions the
// specs need are asked once, here, never before email confirmation:
//   0. "Your job title": saved on the user's own profile in BOTH paths (the spec 05 pseudonymous
//      display reads it).
//   1. Pending invitations for the user's email come first. Accepting joins with the role the INVITER
//      granted; the user never picks a role.
//   2. "Have an invitation URL?": paste a link or token (also invitation-only).
//   3. "Create your organisation": name, sectors, company size, region. POST /api/orgs; the creator
//      becomes owner. There is deliberately no way to pick an existing organisation by name: joining
//      is by invitation only, otherwise anyone could enter any workspace.
//
// Workstream B (Multi-Tenant Foundation) 2026-05-15; reworked by AUTH-2.

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

export function NoWorkspaceLanding({ userId, userEmail }: Props) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Token-paste path
  const [token, setToken] = useState("");
  const [acceptingPaste, setAcceptingPaste] = useState(false);

  // Job title (both paths)
  const [jobTitle, setJobTitle] = useState("");

  // Create-org path
  const [orgName, setOrgName] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [headcountBand, setHeadcountBand] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
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

  // Saves the typed job title on the user's own profile (self-write policy, migration 165). Used by the
  // accept path; the create path sends it with POST /api/orgs. Returns false after showing the error.
  const saveJobTitle = async (): Promise<boolean> => {
    const title = jobTitle.trim();
    if (!title) return true;
    const supabase = createSupabaseBrowserClient();
    const { error: titleError } = await supabase
      .from("profiles")
      .update({ job_title: title, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (titleError) {
      setError("Your job title could not be saved. Check it and try again, or clear it to continue without one.");
      return false;
    }
    return true;
  };

  const acceptInvitation = async (inviteToken: string) => {
    setError(null);
    if (!(await saveJobTitle())) return;
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
      body: JSON.stringify({
        name: orgName.trim(),
        sectors,
        headcount_band: headcountBand || undefined,
        regions,
        job_title: jobTitle.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not create your organisation. Check the details and try again.");
      setCreatingOrg(false);
      return;
    }
    // Hard reload so server-bootstrap re-resolves the new org membership,
    // then route to onboarding for sector profile setup.
    router.refresh();
    window.location.href = "/onboarding";
  };

  return (
    <AuthFrame>
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 18 }}>
        <OnboardingStepper current={1} />
        <h1
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 24,
            lineHeight: 1.1,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Set up your workspace
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)", marginTop: -8 }}
        >
          Signed in as {userEmail}. Accept an invitation from your team, or
          create your organisation. You become its owner and can invite
          teammates after.
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

        {/* Job title: saved on your profile whichever way you continue. */}
        <Section title="Your job title">
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            maxLength={120}
            aria-label="Your job title"
            placeholder="e.g. Head of operations (optional)"
            className="w-full px-3 py-2 text-sm rounded-md border outline-none"
            style={{ ...FIELD_STYLE, minHeight: 44 }}
          />
        </Section>

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
                      {formatLocaleDate(new Date(inv.expires_at))}
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

        {/* Panel 3: create your organisation */}
        <Section title="Or create your organisation" icon={<Plus size={14} />}>
          <form onSubmit={createOrg} className="space-y-4">
            <label className="block text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Organisation name
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                maxLength={200}
                placeholder="Your company"
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border outline-none"
                style={{ ...FIELD_STYLE, minHeight: 44 }}
              />
            </label>

            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
                Industry or sector (choose all that apply)
              </legend>
              <div className="flex flex-wrap gap-2">
                {ALL_SECTORS.map((sec) => (
                  <ChoiceChip
                    key={sec.id}
                    label={sec.label}
                    pressed={sectors.includes(sec.id)}
                    onToggle={() => setSectors((prev) => toggle(prev, sec.id))}
                  />
                ))}
              </div>
            </fieldset>

            <label className="block text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
              Company size
              <select
                value={headcountBand}
                onChange={(e) => setHeadcountBand(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border outline-none"
                style={{ ...FIELD_STYLE, minHeight: 44 }}
              >
                <option value="">Prefer not to say</option>
                {ORG_SIZE_DIMENSIONS.headcount.bands.map((band: { id: string; label: string }) => (
                  <option key={band.id} value={band.id}>
                    {band.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
                Region (choose all that apply)
              </legend>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((code: string) => (
                  <ChoiceChip
                    key={code}
                    label={REGION_LABELS[code] ?? code}
                    pressed={regions.includes(code)}
                    onToggle={() => setRegions((prev) => toggle(prev, code))}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Button variant="primary" type="submit" className="min-h-[44px]" disabled={!orgName.trim() || creatingOrg}>
                {creatingOrg ? "Creating your organisation..." : "Create organisation"}
              </Button>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                You become the owner. Sector, size and region tailor what you see, and you can change
                them later in Settings.
              </span>
            </div>
          </form>
        </Section>
      </div>
    </AuthFrame>
  );
}

const FIELD_STYLE: React.CSSProperties = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text-primary)",
};

const REGION_LABELS: Record<string, string> = {
  EU: "European Union",
  UK: "United Kingdom",
  US: "United States",
  LATAM: "Latin America",
  APAC: "Asia Pacific",
  HK: "Hong Kong",
  MEA: "Middle East and Africa",
  GLOBAL: "Global",
};

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function ChoiceChip({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="px-3 text-xs rounded-md border"
      style={{
        minHeight: 44,
        borderColor: pressed ? "var(--color-text-primary)" : "var(--color-border)",
        backgroundColor: pressed ? "var(--color-text-primary)" : "var(--color-surface)",
        color: pressed ? "var(--color-surface)" : "var(--color-text-primary)",
      }}
    >
      {label}
    </button>
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
