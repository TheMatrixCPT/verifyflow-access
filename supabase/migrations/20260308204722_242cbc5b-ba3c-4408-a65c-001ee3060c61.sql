
-- Settings table (single row for the company)
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  confidence_threshold INTEGER NOT NULL DEFAULT 80,
  stamp_validity_months INTEGER NOT NULL DEFAULT 3,
  strict_mode BOOLEAN NOT NULL DEFAULT false,
  api_key_encrypted TEXT,
  email_api_key_encrypted TEXT,
  from_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert settings" ON public.settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update settings" ON public.settings FOR UPDATE USING (true);

-- Insert default settings row
INSERT INTO public.settings (confidence_threshold, stamp_validity_months, strict_mode) VALUES (80, 3, false);

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
