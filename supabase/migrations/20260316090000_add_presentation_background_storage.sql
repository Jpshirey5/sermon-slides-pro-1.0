INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'presentation-backgrounds',
  'presentation-backgrounds',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Members can view presentation backgrounds" ON storage.objects;
CREATE POLICY "Members can view presentation backgrounds"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'presentation-backgrounds'
  AND (storage.foldername(name))[1] = 'account'
  AND public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Members can upload presentation backgrounds" ON storage.objects;
CREATE POLICY "Members can upload presentation backgrounds"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'presentation-backgrounds'
  AND (storage.foldername(name))[1] = 'account'
  AND public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Members can update presentation backgrounds" ON storage.objects;
CREATE POLICY "Members can update presentation backgrounds"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'presentation-backgrounds'
  AND (storage.foldername(name))[1] = 'account'
  AND public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
)
WITH CHECK (
  bucket_id = 'presentation-backgrounds'
  AND (storage.foldername(name))[1] = 'account'
  AND public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Members can delete presentation backgrounds" ON storage.objects;
CREATE POLICY "Members can delete presentation backgrounds"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'presentation-backgrounds'
  AND (storage.foldername(name))[1] = 'account'
  AND public.is_account_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);
