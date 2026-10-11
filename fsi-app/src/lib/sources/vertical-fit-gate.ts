import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyInstitutionalType, isOffVerticalByIdentity } from "@/lib/sources/vertical-fit";

export interface VerticalFitGateResult {
  allow: boolean;
  reason: string;
  /** soft signal: classified a general-legislature portal (kept by default; informational). */
  flaggedLegislature: boolean;
}

function hostOf(url: string | null | undefined): string | null {
  try {
    return new URL(url || "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Gate a would-be new source against the off-vertical negative list. Returns allow:false when the
 * source's host was deliberately retired as off-vertical (so re-adds are conscious, not silent).
 * Legislatures are otherwise allowed (kept by default). Fail-open on DB error.
 */
export async function checkVerticalFitGate(
  supabase: SupabaseClient,
  source: { name?: string | null; url?: string | null; sourceRole?: string | null }
): Promise<VerticalFitGateResult> {
  const itype = classifyInstitutionalType(source.name, source.url, source.sourceRole as never);
  const flaggedLegislature = isOffVerticalByIdentity(itype);

  const host = hostOf(source.url);
  if (!host) return { allow: true, reason: "no parseable host — nothing to gate", flaggedLegislature };

  // Negative list: hosts of sources retired as off-vertical (suspend-not-delete).
  const { data, error } = await supabase
    .from("sources")
    .select("url")
    .eq("status", "suspended")
    .ilike("notes", "%off_vertical_suspended%");
  if (error) {
    console.warn(`[vertical-fit-gate] negative-list query failed, failing OPEN: ${error.message}`);
    return { allow: true, reason: `negative-list check unavailable (${error.message})`, flaggedLegislature };
  }

  const retiredHosts = new Set((data ?? []).map((r) => hostOf(r.url)).filter(Boolean));
  if (retiredHosts.has(host)) {
    return {
      allow: false,
      reason: `host "${host}" is on the off-vertical negative list (deliberately retired as off-vertical); re-add requires explicit re-authorization`,
      flaggedLegislature,
    };
  }
  return { allow: true, reason: "not on off-vertical negative list", flaggedLegislature };
}
