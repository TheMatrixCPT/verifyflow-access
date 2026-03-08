
-- Create storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Allow anyone to upload to documents bucket (no auth required)
CREATE POLICY "Anyone can upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Anyone can view documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Anyone can delete documents" ON storage.objects FOR DELETE USING (bucket_id = 'documents');

-- Sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_documents INTEGER NOT NULL DEFAULT 0,
  processed_documents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'has-issues'))
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can create sessions" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.sessions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete sessions" ON public.sessions FOR DELETE USING (true);

-- Candidates table (auto-extracted from documents)
CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  id_number TEXT,
  score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pass', 'warning', 'fail')),
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view candidates" ON public.candidates FOR SELECT USING (true);
CREATE POLICY "Anyone can create candidates" ON public.candidates FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update candidates" ON public.candidates FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete candidates" ON public.candidates FOR DELETE USING (true);

-- Documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  document_type TEXT,
  candidate_name_extracted TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'processing', 'pass', 'warning', 'fail')),
  validation_details JSONB DEFAULT '{}',
  confidence_score NUMERIC(5,2) DEFAULT 0,
  issues TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view documents" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Anyone can create documents" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update documents" ON public.documents FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete documents" ON public.documents FOR DELETE USING (true);

-- Trigger for updated_at on sessions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
