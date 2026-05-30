// Sprint 4 Block 1 task 1.15 — recommendSourceTier (UNVERIFIED-PENDING-RUNTIME).
//
// Haiku-backed source-tier RECOMMENDATION for the Phase 1.5 source-tier audit.
// Per the integrity rule (decision log 2026-05-29): Haiku RECOMMENDS a tier with
// rationale + confidence and a FACT-vs-INFERENCE framing; it does NOT assert the
// tier as fact. The operator tick is the authority. A genuinely ambiguous tier
// returns confidence "low" so it surfaces for operator decision, not a guess.
//
// DO NOT RUN A TIER PASS IN BLOCK 1. This function is written + wired only; it is
// invoked during Phase 1.5 (after HC1), per-source, operator-paced.

import { createClient } from "@supabase/supabase-js";

export interface SourceTierRecommendation {
  recommended_tier: number;
  confidence: "high" | "medium" | "low";
  rationale: string;
  kind: "recommendation"; // never "fact" — Haiku recommends; operator decides
}

// source-credibility-model tier definitions (mirrors the source-type hierarchy).
const TIER_DEFINITIONS = `Tier 1 — binding law/regulation (Official Journal, Federal Register, national gazette)
Tier 2 — regulator guidance/interpretation (EU Commission FAQ, EPA rule summary)
Tier 3 — intergovernmental body position (IMO MEPC, ICAO resolution)
Tier 4 — industry body interpretation (FIATA, CLECAT, ICCT) — labeled
Tier 5 — news reporting (Reuters, FreightWaves, Lloyd's List) — labeled
Tier 6 — analysis/opinion (think tanks, academic papers) — labeled
Tier 7 — uncategorized / insufficient signal`;

export async function recommendSourceTier(sourceId: string): Promise<SourceTierRecommendation> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
  const { data: src } = await supabase
    .from("sources")
    .select("id, name, url, publisher, base_tier, source_role")
    .eq("id", sourceId)
    .maybeSingle();
  if (!src) throw new Error(`source ${sourceId} not found`);

  // Best-effort content excerpt for grounding the recommendation.
  let excerpt = "(source content unreachable)";
  try {
    const r = await fetch(src.url as string, { signal: AbortSignal.timeout(8000) });
    if (r.ok) excerpt = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
  } catch {
    /* leave the unreachable sentinel; Haiku must reflect low confidence */
  }

  const system = `You are a source-tier auditor for a freight-sustainability intelligence platform. You RECOMMEND a credibility tier for a source; you do NOT assert it as fact. Tier definitions:
${TIER_DEFINITIONS}

INTEGRITY RULE: when the correct tier is genuinely ambiguous or the content was unreachable, return confidence "low" and say so in the rationale — never guess with false confidence. Your output is a recommendation an operator will accept, override, or flag.

Return ONLY JSON: {"recommended_tier": <1-7>, "confidence": "high|medium|low", "rationale": "<1-2 sentences>"}`;

  const user = `SOURCE:
- name: ${src.name}
- url: ${src.url}
- publisher: ${src.publisher ?? "(unknown)"}
- current base_tier: ${src.base_tier ?? "(null)"}
- source_role: ${src.source_role ?? "(unknown)"}

CONTENT EXCERPT:
${excerpt}

Recommend the tier.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Haiku ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error("no JSON object in Haiku response");
  const parsed = JSON.parse(m[0]);
  const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low";
  return {
    recommended_tier: Number(parsed.recommended_tier),
    confidence,
    rationale: String(parsed.rationale || ""),
    kind: "recommendation",
  };
}
