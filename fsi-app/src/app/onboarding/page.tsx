import { redirect } from "next/navigation";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { getWorkspaceAggregates } from "@/lib/data";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

// UI system handoff 2026-09-06 (README screen 17 "Onboarding"): three steps
// that produce the three things every page is scoped by — workspace (done
// at /workspace/new before this route is reached), modes + jurisdictions,
// sectors — plus a fourth "Briefing" step per the artboard's own 4-pill
// stepper. See OnboardingWizard.tsx's header for what this replaces and why.
//
// orgId requirement: the sectors step writes to workspace_settings.sector_profile
// (the workspace-anchored destination the dashboard reads). Users without a
// workspace are bounced to /workspace/new to create one first, then back here.

export default async function OnboardingPage() {
  const bootstrap = await resolveServerBootstrap();

  if (!bootstrap.user) redirect("/login?redirect=/onboarding");
  if (!bootstrap.orgId) redirect("/workspace/new");

  // Same cached, migration-068-backed accessor the dashboard reads — the
  // step-2 preview panel's real band counts, not a fabricated demo number.
  const aggregates = await getWorkspaceAggregates();

  return (
    <OnboardingWizard
      userId={bootstrap.user.id}
      userEmail={bootstrap.user.email || ""}
      orgId={bootstrap.orgId}
      aggregates={aggregates}
    />
  );
}
