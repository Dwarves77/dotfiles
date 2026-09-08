// Account-page-composition-only stub for @/lib/workspace/profile's getWorkspaceProfile (lane
// compose-other, 2026-09-08). UserProfilePage.tsx's Sector-profile tab and the rail's "Sectors
// followed" stat both read this — the real function resolves a workspace_settings row over
// Supabase, which this sandbox has none of (DEVIATION-LOG.md). Returns a fixture verticals list so
// the mount shows populated data instead of "No sectors selected".
export async function getWorkspaceProfile() {
  return {
    roles: ["freight operator"],
    transportModes: ["ocean", "air"],
    tradeLanes: ["worldwide"],
    products: [],
    operationalBaseline: [],
    officeFootprint: "",
    regulationScope: "freight-forwarding, import/export, and freight-sustainability regulation",
    verticals: ["fine-art", "live-events", "luxury-goods"],
    jurisdictions: { eu: 1, us: 1, uk: 0.5 },
  };
}
