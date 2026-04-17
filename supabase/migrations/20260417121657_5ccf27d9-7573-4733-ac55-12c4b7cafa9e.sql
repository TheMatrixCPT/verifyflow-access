
-- Ensure pgcrypto is installed in the standard 'extensions' schema
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, public;

-- Recreate verify_admin_login with extensions in search_path
CREATE OR REPLACE FUNCTION public.verify_admin_login(_email TEXT, _password TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  surname TEXT,
  can_access_settings BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.email, a.name, a.surname, a.can_access_settings
  FROM public.admin_users a
  WHERE a.email = lower(trim(_email))
    AND a.password_hash = extensions.crypt(_password, a.password_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_user(
  _email TEXT,
  _name TEXT,
  _surname TEXT,
  _password TEXT,
  _can_access_settings BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF length(_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  INSERT INTO public.admin_users (email, name, surname, password_hash, can_access_settings)
  VALUES (
    lower(trim(_email)),
    _name,
    _surname,
    extensions.crypt(_password, extensions.gen_salt('bf', 10)),
    COALESCE(_can_access_settings, true)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_user(
  _id UUID,
  _name TEXT,
  _surname TEXT,
  _can_access_settings BOOLEAN,
  _password TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.admin_users
  SET name = _name,
      surname = _surname,
      can_access_settings = _can_access_settings,
      password_hash = CASE
        WHEN _password IS NOT NULL AND length(_password) >= 8
          THEN extensions.crypt(_password, extensions.gen_salt('bf', 10))
        ELSE password_hash
      END
  WHERE id = _id;
END;
$$;

-- Re-seed the admin password using the extensions-qualified crypt
UPDATE public.admin_users
SET password_hash = extensions.crypt('Admin@123', extensions.gen_salt('bf', 10))
WHERE email = 'lwando.ntlemeza@capaciti.org.za';
