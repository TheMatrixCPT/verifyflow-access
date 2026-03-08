CREATE POLICY "Anyone can update documents in storage"
ON storage.objects FOR UPDATE
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');