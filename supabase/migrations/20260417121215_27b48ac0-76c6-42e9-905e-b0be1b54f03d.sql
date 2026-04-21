
-- Enable pgcrypto for secure password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Admin users table
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  can_access_settings BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Lock down the table: no direct access from anon/auth clients.
-- All access goes through SECURITY DEFINER functions below.
REVOKE ALL ON public.admin_users FROM anon, authenticated;

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER update_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Verify password and return safe admin info (no hash)
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.email, a.name, a.surname, a.can_access_settings
  FROM public.admin_users a
  WHERE a.email = lower(trim(_email))
    AND a.password_hash = crypt(_password, a.password_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO anon, authenticated;

-- List admins (safe: no hash) for Settings page
CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  surname TEXT,
  can_access_settings BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, email, name, surname, can_access_settings, created_at
  FROM public.admin_users
  ORDER BY created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO anon, authenticated;

-- Create a new admin (hashes password server-side)
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
SET search_path = public
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
    crypt(_password, gen_salt('bf', 10)),
    COALESCE(_can_access_settings, true)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_admin_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

-- Update an admin (optional password change)
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
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_users
  SET name = _name,
      surname = _surname,
      can_access_settings = _can_access_settings,
      password_hash = CASE
        WHEN _password IS NOT NULL AND length(_password) >= 8
          THEN crypt(_password, gen_salt('bf', 10))
        ELSE password_hash
      END
  WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_user(UUID, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- Delete an admin
CREATE OR REPLACE FUNCTION public.delete_admin_user(_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_users WHERE id = _id;
$$;

GRANT EXECUTE ON FUNCTION public.delete_admin_user(UUID) TO anon, authenticated;

-- Seed initial admin user
INSERT INTO public.admin_users (email, name, surname, password_hash, can_access_settings)
VALUES (
  'lwando.ntlemeza@capaciti.org.za',
  'Lwando',
  'Ntlemeza',
  crypt('Admin@123', gen_salt('bf', 10)),
  true
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = crypt('Admin@123', gen_salt('bf', 10)),
      name = EXCLUDED.name,
      surname = EXCLUDED.surname,
      can_access_settings = true;
