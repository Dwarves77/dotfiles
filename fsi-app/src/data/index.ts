// ── Data Barrel Export ──
// Re-exports all seed data with type conversions for the Dashboard

import { SEED_RESOURCES, AUDIT_DATE } from "./seed-resources";
import { CHANGE_LOG } from "./seed-changelog";
import { SEED_DISPUTES } from "./seed-disputes";
import { XREF_PAIRS } from "./seed-xrefs";
import { SUPERSESSIONS } from "./seed-supersessions";
import { SEED_ARC } from "./seed-archive";
import { CLUSTERS } from "./seed-clusters";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";

// Convert changelog format: Record<string, ChangeEntry[]> → Record<string, ChangeLogEntry[]>
export const changelog: Record<string, ChangeLogEntry[]> = Object.fromEntries(
  Object.entries(CHANGE_LOG).map(([id, entries]) => [
    id,
    entries.map((e) => ({
      id,
      date: AUDIT_DATE,
      type: "UPDATED" as const,
      fields: [e.field],
      prev: e.prev,
      now: e.now,
      impact: e.impact,
    })),
  ])
);

// Convert disputes format
export const disputes: Record<string, Dispute> = Object.fromEntries(
  Object.entries(SEED_DISPUTES).map(([id, d]) => [
    id,
    {
      resource: id,
      note: d.note,
      sources: d.sources.map((s) => ({ name: s, url: "" })),
    },
  ])
);

// Convert xref pairs
export const xrefPairs: [string, string][] = XREF_PAIRS.map((pair) => [pair[0], pair[1]]);

// Convert supersessions — agent-created format uses different field names
export const supersessions: Supersession[] = SUPERSESSIONS.map((s) => ({
  old: s.id,
  new: s.newId,
  date: s.date,
  severity: s.severity,
  note: s.what,
}));

// Resources
export const resources: Resource[] = SEED_RESOURCES;

// Archived (convert format)
export const archived: Resource[] = SEED_ARC.map((a) => ({
  id: a.id,
  cat: a.cat,
  sub: "",
  title: a.title,
  url: "",
  note: a.note,
  type: "",
  priority: "LOW" as const,
  added: a.archivedDate,
  reasoning: "",
  tags: [],
  whatIsIt: "",
  whyMatters: "",
  keyData: [],
  isArchived: true,
  archiveReason: a.reason,
  archiveNote: a.note,
  archivedDate: a.archivedDate,
  replacedBy: a.replacement || undefined,
}));

export { AUDIT_DATE, CLUSTERS };
