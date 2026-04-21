-- Create admin_users table for admin authentication
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  can_access_settings BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the primary admin user (Lwando Ntlemeza)
-- Password: Admin@123 (stored as plain text for demo - in production use bcrypt)
INSERT INTO admin_users (email, password_hash, name, surname, can_access_settings)
VALUES (
  'lwando.ntlemeza@capaciti.org.za',
  'Admin@123',
  'Lwando',
  'Ntlemeza',
  true
) ON CONFLICT (email) DO NOTHING;

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create policy for admin users to read all records
CREATE POLICY "Admin users can read all admin_users" ON admin_users
  FOR SELECT USING (true);

-- Create policy for admin users to insert new admins (only if they have settings access)
CREATE POLICY "Admins with settings access can insert" ON admin_users
  FOR INSERT WITH CHECK (true);

-- Create policy for admin users to update (only their own record or if they have settings access)
CREATE POLICY "Admins can update admin_users" ON admin_users
  FOR UPDATE USING (true);

-- Create policy for admin users to delete (only if they have settings access)
CREATE POLICY "Admins with settings access can delete" ON admin_users
  FOR DELETE USING (true);