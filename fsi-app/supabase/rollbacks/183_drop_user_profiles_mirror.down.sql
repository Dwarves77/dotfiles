-- Rollback for migration 183 — recreates the user_profiles mirror table, its indexes, constraints,
-- RLS policies, both mirror trigger functions, and all three triggers, from live definitions captured
-- 2026-07-11. Then re-seeds user_profiles from profiles (the surviving authoritative store) so the
-- mirror is populated. Apply to undo migration 183 ONLY. (Run rollback 182 AFTER this if you also want
-- the policy arms pointed back at user_profiles — but that is optional; the 182-repointed policies keep
-- working against profiles regardless.)

BEGIN;

CREATE TABLE public.user_profiles (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name               text,
  headshot_url       text,
  bio                text,
  timezone           text NOT NULL DEFAULT 'UTC',
  sectors            text[] NOT NULL DEFAULT '{}',
  jurisdictions      text[] NOT NULL DEFAULT '{}',
  transport_modes    text[] NOT NULL DEFAULT '{}',
  verifier_status    text NOT NULL DEFAULT 'none'
                       CHECK (verifier_status = ANY (ARRAY['none','pending','active','revoked'])),
  verifier_since     timestamptz,
  is_platform_admin  boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_profiles_platform_admin ON public.user_profiles (is_platform_admin) WHERE is_platform_admin = true;
CREATE INDEX idx_user_profiles_verifier_status ON public.user_profiles (verifier_status) WHERE verifier_status = 'active';

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_insert_self ON public.user_profiles FOR INSERT
  WITH CHECK ((user_id = auth.uid()) AND (is_platform_admin = false));
CREATE POLICY user_profiles_read_authenticated ON public.user_profiles FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY user_profiles_service_role ON public.user_profiles FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY user_profiles_update_self ON public.user_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK ((user_id = auth.uid()) AND (is_platform_admin = (
    SELECT up.is_platform_admin FROM user_profiles up WHERE up.user_id = auth.uid())));

CREATE OR REPLACE FUNCTION public._mirror_user_profiles_to_profiles()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, full_name, avatar_url, bio, timezone,
    sector_overrides, jurisdiction_overrides, transport_mode_overrides,
    verifier_status, verifier_since, is_platform_admin, created_at, updated_at
  ) VALUES (
    NEW.user_id, NEW.name, NEW.headshot_url, NEW.bio, COALESCE(NEW.timezone, 'UTC'),
    COALESCE(NEW.sectors, '{}'::text[]), COALESCE(NEW.jurisdictions, '{}'::text[]),
    COALESCE(NEW.transport_modes, '{}'::text[]), COALESCE(NEW.verifier_status, 'none'),
    NEW.verifier_since, COALESCE(NEW.is_platform_admin, false),
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name                = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url               = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    bio                      = COALESCE(EXCLUDED.bio, public.profiles.bio),
    timezone                 = COALESCE(EXCLUDED.timezone, public.profiles.timezone),
    sector_overrides         = COALESCE(EXCLUDED.sector_overrides, public.profiles.sector_overrides),
    jurisdiction_overrides   = COALESCE(EXCLUDED.jurisdiction_overrides, public.profiles.jurisdiction_overrides),
    transport_mode_overrides = COALESCE(EXCLUDED.transport_mode_overrides, public.profiles.transport_mode_overrides),
    verifier_status          = COALESCE(EXCLUDED.verifier_status, public.profiles.verifier_status),
    verifier_since           = COALESCE(EXCLUDED.verifier_since, public.profiles.verifier_since),
    is_platform_admin        = EXCLUDED.is_platform_admin,
    updated_at               = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._mirror_profiles_to_user_profiles()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF (
    NEW.full_name              IS NOT DISTINCT FROM OLD.full_name AND
    NEW.avatar_url             IS NOT DISTINCT FROM OLD.avatar_url AND
    NEW.bio                    IS NOT DISTINCT FROM OLD.bio AND
    NEW.timezone               IS NOT DISTINCT FROM OLD.timezone AND
    NEW.sector_overrides       IS NOT DISTINCT FROM OLD.sector_overrides AND
    NEW.jurisdiction_overrides IS NOT DISTINCT FROM OLD.jurisdiction_overrides AND
    NEW.transport_mode_overrides IS NOT DISTINCT FROM OLD.transport_mode_overrides AND
    NEW.verifier_status        IS NOT DISTINCT FROM OLD.verifier_status AND
    NEW.verifier_since         IS NOT DISTINCT FROM OLD.verifier_since AND
    NEW.is_platform_admin      IS NOT DISTINCT FROM OLD.is_platform_admin
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (
    user_id, name, headshot_url, bio, timezone,
    sectors, jurisdictions, transport_modes,
    verifier_status, verifier_since, is_platform_admin, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.full_name, NEW.avatar_url, NEW.bio, COALESCE(NEW.timezone, 'UTC'),
    COALESCE(NEW.sector_overrides, '{}'::text[]), COALESCE(NEW.jurisdiction_overrides, '{}'::text[]),
    COALESCE(NEW.transport_mode_overrides, '{}'::text[]), COALESCE(NEW.verifier_status, 'none'),
    NEW.verifier_since, COALESCE(NEW.is_platform_admin, false), now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    name              = COALESCE(EXCLUDED.name, public.user_profiles.name),
    headshot_url      = COALESCE(EXCLUDED.headshot_url, public.user_profiles.headshot_url),
    bio               = COALESCE(EXCLUDED.bio, public.user_profiles.bio),
    timezone          = COALESCE(EXCLUDED.timezone, public.user_profiles.timezone),
    sectors           = COALESCE(EXCLUDED.sectors, public.user_profiles.sectors),
    jurisdictions     = COALESCE(EXCLUDED.jurisdictions, public.user_profiles.jurisdictions),
    transport_modes   = COALESCE(EXCLUDED.transport_modes, public.user_profiles.transport_modes),
    verifier_status   = COALESCE(EXCLUDED.verifier_status, public.user_profiles.verifier_status),
    verifier_since    = COALESCE(EXCLUDED.verifier_since, public.user_profiles.verifier_since),
    is_platform_admin = EXCLUDED.is_platform_admin,
    updated_at        = now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_profiles_mirror_to_profiles
  AFTER INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION _mirror_user_profiles_to_profiles();
CREATE TRIGGER profiles_mirror_to_user_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION _mirror_profiles_to_user_profiles();

-- Re-seed the mirror from the surviving authoritative store (profiles). Mirror trigger is AFTER
-- INSERT so this INSERT ... SELECT also keeps profiles consistent; harmless idempotent round-trip.
INSERT INTO public.user_profiles (
  user_id, name, headshot_url, bio, timezone, sectors, jurisdictions, transport_modes,
  verifier_status, verifier_since, is_platform_admin, created_at, updated_at)
SELECT p.id, p.full_name, p.avatar_url, p.bio, COALESCE(p.timezone,'UTC'),
       COALESCE(p.sector_overrides,'{}'::text[]), COALESCE(p.jurisdiction_overrides,'{}'::text[]),
       COALESCE(p.transport_mode_overrides,'{}'::text[]), COALESCE(p.verifier_status,'none'),
       p.verifier_since, COALESCE(p.is_platform_admin,false), COALESCE(p.created_at,now()), now()
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
