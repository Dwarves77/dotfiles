// Shapes the admin corrections screen reads (lane G7-UI, 2026-10-06). The correction row mirrors the list route's
// response in src/lib/corrections/admin-api/logic.mjs; the item targets are what the item screen's server load
// hands the panel (load-item-targets.ts).

export type TargetKind = "fact" | "tag" | "connection" | "section_text" | "full_brief";
export type CorrectionOp = "suppress" | "add" | "remove" | "replace";

export interface CorrectionData {
  id: string;
  item_id: string;
  target_kind: TargetKind;
  target_ref: string;
  op: CorrectionOp;
  value: Record<string, unknown> | null;
  machine_value: Record<string, unknown> | null;
  reason: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by?: string | null;
  revoked_reason?: string | null;
  active: boolean;
  superseded?: boolean;
  orphaned?: boolean;
  latest_machine_value?: Record<string, unknown> | null;
  machine_observed_count?: number;
  machine_observed_at?: string | null;
  /** Tab only: the item's title, so the list reads in words. */
  item_title?: string | null;
}

export interface ItemTargetClaim {
  id: string;
  claim_text: string;
  source_span: string | null;
}

export interface ItemTargetSection {
  section_key: string;
  content_md: string;
}

export interface ItemTargetConnection {
  other_item_id: string;
  other_title: string;
  relationship: string;
}

export interface ItemTargets {
  item_id: string;
  title: string;
  full_brief: string;
  tags: { topic_tags: string[]; operational_scenario_tags: string[]; compliance_object_tags: string[] };
  facts: ItemTargetClaim[];
  sections: ItemTargetSection[];
  connections: ItemTargetConnection[];
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
