-- 241_source_health_flags_sweep1_dead_urls.sql
-- Session C (discovery lane), 2026-07-19. Operator ruling on sweep 1's flagged findings: the 2
-- dead-authoritative_url 404s (coverage_gap_candidates rank 76 Sweden Naturvardsverket, rank 82
-- Freightos FBX) are corpus-facing findings regardless of census outcome and file as source-health
-- integrity flags now. Neither URL corresponds to a registered `sources` row (both are still
-- coverage_gap_candidates-only, unregistered), so subject_type='system' with a coverage_gap_candidates
-- rank reference, rather than subject_type='source' (which per the CLAUDE.md contract implies a
-- resolvable sources.id).

INSERT INTO public.integrity_flags
  (category, subject_type, subject_ref, description, recommended_actions, status, created_by)
VALUES
('source_issue', 'system', 'coverage_gap_candidates:rank=76',
 'coverage_gap_candidates rank 76 (Sweden EPR packaging producer-responsibility reporting, Naturvardsverket) carries an authoritative_url that returns HTTP 404 as of the 2026-07-19 sweep-1 fetch-light census. The registered URL no longer resolves; the correct current URL was not re-derived this pass (out of sweep-1 scope, which audits registered URLs as-is).',
 '[{"action":"Re-verify and correct the authoritative_url on coverage_gap_candidates rank 76 via a fresh web search for the Swedish EPA''s current EPR packaging guidance page.","rationale":"A dead URL on a still-undispositioned free-feed candidate silently degrades the census; correcting it restores the row''s usability for future dispositioning."}]'::jsonb,
 'open', 'session-c-census-sweep1'),

('source_issue', 'system', 'coverage_gap_candidates:rank=82',
 'coverage_gap_candidates rank 82 (Freightos Baltic Index, FBX) carries an authoritative_url that returns HTTP 404 as of the 2026-07-19 sweep-1 fetch-light census. The registered URL no longer resolves; the correct current URL was not re-derived this pass (out of sweep-1 scope, which audits registered URLs as-is).',
 '[{"action":"Re-verify and correct the authoritative_url on coverage_gap_candidates rank 82 via a fresh web search for Freightos'' current FBX index landing page.","rationale":"A dead URL on a still-undispositioned free-feed candidate silently degrades the census; correcting it restores the row''s usability for future dispositioning."}]'::jsonb,
 'open', 'session-c-census-sweep1');
