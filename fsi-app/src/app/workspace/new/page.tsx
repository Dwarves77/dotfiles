import { redirect } from "next/navigation";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { NoWorkspaceLanding } from "@/components/onboarding/NoWorkspaceLanding";

// /workspace/new — the "you have no workspace yet" landing page.
//
// Three-state onboarding state machine (per dispatch decision I.3):
//   1. Authenticated, no membership          -> render NoWorkspaceLanding
//   2. Authenticated, has membership         -> redirect to /
//   3. Authenticated, with pending invitation -> NoWorkspaceLanding renders
//      the invitation banner (it fetches /api/invitations/mine on mount).
//
// Workstream B (Multi-Tenant Foundation) — 2026-05-15.

export default async function NewWorkspacePage() {
  const bootstrap = await resolveServerBootstrap();
  if (!bootstrap.user) {
    redirect("/login?redirect=/workspace/new");
  }
  if (bootstrap.orgId) {
    // User already has a workspace, send them home.
    redirect("/");
  }
  return (
    <NoWorkspaceLanding
      userId={bootstrap.user.id}
      userEmail={bootstrap.user.email || ""}
    />
  );
}
