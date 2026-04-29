ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz;