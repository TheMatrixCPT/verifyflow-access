-- Add password verification function
CREATE OR REPLACE FUNCTION verify_admin_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_admin admin_users%ROWTYPE;
BEGIN
  -- Get the admin user by email
  SELECT * INTO v_admin
  FROM admin_users
  WHERE email = LOWER(TRIM(p_email));

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Simple password comparison for demo
  -- In production, use bcrypt via a proper extension
  IF v_admin.password_hash = p_password THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;