// The single seed audit-date constant, isolated from seed-resources.ts so the 1.23 MB seed-resources.json
// is NOT pulled into the bundle just to read this one string (T7, 2026-07-12). See src/lib/data.ts.
export const AUDIT_DATE = "2026-03-01";
