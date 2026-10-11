export interface SupabaseLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

/** Minimal shape of the Supabase client surface this module touches. Structural — the real
 *  SupabaseClient satisfies this without any adaptation. */
export interface MinimalSupabaseClient {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: SupabaseLikeError | null }>;
  };
}

/** The `opinion_source` CHECK constraint's literal values (migration 091 + 309). Every INSERT must use
 *  one of these — the DB itself rejects anything else. */
export type TierOpinionSource =
  | "haiku_brief_classifier"
  | "haiku_verification"
  | "operator_review"
  | "host_class_table";

export interface TierOpinionInput {
  /** The source the opinion is ABOUT — must be a PRE-EXISTING sources.id (never a source just
   *  minted by this same registration pass; the table exists to preserve REPEAT opinions about an
   *  already-known source, per migration 091's Q3 design). */
  targetSourceId: string;
  /** The agent's tier estimate (1-7) for targetSourceId, from the brief's "New Sources Identified"
   *  table. Caller must not call this with a null/undefined estimate. */
  opinedTier: number;
  /** The source whose brief-generation run produced this estimate. Nullable — not always available
   *  to the caller. */
  opiningSourceId?: string | null;
  /** The intelligence_items row whose generation produced this estimate. Nullable. */
  intelligenceItemId?: string | null;
  /** Which process formed this opinion (migration 091's `opinion_source` CHECK). Defaults to
   *  `"haiku_brief_classifier"` — the original, pre-existing caller (`source-growth.ts`) never has to
   *  pass this. A deterministic caller (e.g. `scripts/maintenance/tier-opinions.mjs`) passes
   *  `"host_class_table"` explicitly (migration 309 added that literal to the CHECK constraint). */
  opinionSource?: TierOpinionSource;
}

/** Renders a Postgrest-shaped error's full diagnostic surface (message + details + hint + code).
 *  Mirrors src/lib/supabase-server.ts's local (non-exported) describeSupabaseError helper — inlined
 *  here since that helper isn't importable from this import-free module. */
export function describeTierOpinionError(error: SupabaseLikeError): string {
  return [
    `message=${error.message ?? "unknown"}`,
    `details=${error.details ?? "none"}`,
    `hint=${error.hint ?? "none"}`,
    `code=${error.code ?? "none"}`,
  ].join(" | ");
}

/**
 * Best-effort insert into public.source_tier_opinions. NEVER throws: registerCitedSources runs
 * inside brief generation (canonical-pipeline.ts), and opinion recording is purely observational —
 * a failed insert here must not fail a regeneration. Any error (including a future UNIQUE-constraint
 * duplicate, e.g. Postgres code 23505) is caught, logged with full detail, and swallowed.
 *
 * Caller contract (enforced by the caller, not here): only invoke this when an opined tier is
 * present and the matched source already existed BEFORE this registration pass.
 */
export async function recordTierOpinion(
  supabase: MinimalSupabaseClient,
  input: TierOpinionInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("source_tier_opinions").insert({
      target_source_id: input.targetSourceId,
      opined_tier: input.opinedTier,
      opinion_source: input.opinionSource ?? "haiku_brief_classifier",
      opining_source_id: input.opiningSourceId ?? null,
      intelligence_item_id: input.intelligenceItemId ?? null,
    });
    if (error) {
      const detail = describeTierOpinionError(error);
      console.warn(
        `[source-growth] tier-opinion insert failed for source ${input.targetSourceId} (opined_tier=${input.opinedTier}): ${detail}`
      );
      return { ok: false, error: detail };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[source-growth] tier-opinion insert threw for source ${input.targetSourceId} (opined_tier=${input.opinedTier}): ${msg}`
    );
    return { ok: false, error: msg };
  }
}
