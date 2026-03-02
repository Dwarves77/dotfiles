import type { Supersession, Resource } from "@/types/resource";

// ── Regulatory Lineage ──
// Walks the supersession chain backward and forward from a resource

export interface LineageNode {
  id: string;
  title: string;
  date: string;
  severity: string;
  note: string;
  isCurrent: boolean;
}

export function getLineage(
  resourceId: string,
  supersessions: Supersession[],
  resourceMap: Map<string, Resource>
): LineageNode[] {
  const chain: LineageNode[] = [];
  const visited = new Set<string>();

  // Walk backward (predecessors)
  let currentId = resourceId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const pred = supersessions.find((s) => s.new === currentId);
    if (!pred) break;
    const res = resourceMap.get(pred.old);
    chain.unshift({
      id: pred.old,
      title: res?.title || pred.old,
      date: pred.date,
      severity: pred.severity,
      note: pred.note,
      isCurrent: false,
    });
    currentId = pred.old;
  }

  // Add current resource
  const current = resourceMap.get(resourceId);
  chain.push({
    id: resourceId,
    title: current?.title || resourceId,
    date: current?.added || "",
    severity: "",
    note: "",
    isCurrent: true,
  });

  // Walk forward (successors)
  visited.clear();
  visited.add(resourceId);
  currentId = resourceId;
  while (currentId) {
    const succ = supersessions.find((s) => s.old === currentId);
    if (!succ || visited.has(succ.new)) break;
    visited.add(succ.new);
    const res = resourceMap.get(succ.new);
    chain.push({
      id: succ.new,
      title: res?.title || succ.new,
      date: succ.date,
      severity: succ.severity,
      note: succ.note,
      isCurrent: false,
    });
    currentId = succ.new;
  }

  return chain;
}
