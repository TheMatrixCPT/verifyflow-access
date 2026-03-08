CREATE POLICY "Allow public read access to documents bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');