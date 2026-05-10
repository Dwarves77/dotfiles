-- ════════════════════════════════════════════════════════════════════
-- Migration 056 — sources.access_method extension.
--
-- Wave 1a foundation: extends the access_method enum from
-- ('api','rss','scrape','gazette','manual') to add 'html_scrape' as a
-- distinct value while keeping 'scrape' as a legacy alias for the
-- transition period. The agent/run access_method routing switch reads
-- both 'scrape' and 'html_scrape' as the Browserless render path.
--
-- Also adds the api_* metadata columns referenced by the api-fetch
-- helper.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- Drop the old CHECK and re-add with html_scrape included.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_access_method_check;
ALTER TABLE sources ADD CONSTRAINT sources_access_method_check
  CHECK (access_method IN ('api', 'rss', 'html_scrape', 'scrape', 'gazette', 'manual'));

-- API metadata columns. Nullable because most sources are not API.
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS api_endpoint_url TEXT,
  ADD COLUMN IF NOT EXISTS api_auth_method TEXT,
  ADD COLUMN IF NOT EXISTS api_response_format TEXT;

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_api_auth_method_check;
ALTER TABLE sources ADD CONSTRAINT sources_api_auth_method_check
  CHECK (api_auth_method IS NULL OR api_auth_method IN
    ('none', 'api_key_header', 'api_key_query', 'bearer', 'basic', 'oauth2'));

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_api_response_format_check;
ALTER TABLE sources ADD CONSTRAINT sources_api_response_format_check
  CHECK (api_response_format IS NULL OR api_response_format IN
    ('json', 'xml', 'rss', 'atom', 'html', 'text'));

COMMENT ON COLUMN sources.api_endpoint_url IS
  'Concrete API endpoint URL when access_method=api. Distinct from sources.url which is the human-facing landing page.';

COMMENT ON COLUMN sources.api_auth_method IS
  'Authentication scheme expected by api_endpoint_url. The api-fetch helper reads this to assemble headers.';

COMMENT ON COLUMN sources.api_response_format IS
  'Expected MIME-style response format. Drives parser selection in the api-fetch helper.';
