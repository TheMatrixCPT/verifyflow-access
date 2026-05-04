
-- 1. Drop dead/leaky credential columns
ALTER TABLE public.settings DROP COLUMN IF EXISTS api_key_encrypted;
ALTER TABLE public.settings DROP COLUMN IF EXISTS email_api_key_encrypted;

-- 2. Remove permissive public policies on settings
DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON public.settings;

-- (RLS stays enabled — no policies = no direct access. Access is via SECURITY DEFINER RPCs below.)

-- 3. Safe read function — exposes only non-secret settings
CREATE OR REPLACE FUNCTION public.get_app_settings()
RETURNS TABLE (
  id uuid,
  confidence_threshold integer,
  stamp_validity_months integer,
  strict_mode boolean,
  from_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, confidence_threshold, stamp_validity_months, strict_mode, from_email
  FROM public.settings
  ORDER BY created_at ASC
  LIMIT 1;
$$;

-- 4. Safe update function — only updates non-secret settings
CREATE OR REPLACE FUNCTION public.update_app_settings(
  _confidence_threshold integer,
  _stamp_validity_months integer,
  _strict_mode boolean,
  _from_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM public.settings ORDER BY created_at ASC LIMIT 1;

  IF existing_id IS NULL THEN
    INSERT INTO public.settings (confidence_threshold, stamp_validity_months, strict_mode, from_email)
    VALUES (
      COALESCE(_confidence_threshold, 80),
      COALESCE(_stamp_validity_months, 3),
      COALESCE(_strict_mode, false),
      _from_email
    );
  ELSE
    UPDATE public.settings
    SET confidence_threshold = COALESCE(_confidence_threshold, confidence_threshold),
        stamp_validity_months = COALESCE(_stamp_validity_months, stamp_validity_months),
        strict_mode = COALESCE(_strict_mode, strict_mode),
        from_email = COALESCE(_from_email, from_email),
        updated_at = now()
    WHERE id = existing_id;
  END IF;
END;
$$;
