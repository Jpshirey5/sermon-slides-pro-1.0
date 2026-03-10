ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_translation text DEFAULT 'KJV';

UPDATE public.profiles
SET default_translation = 'KJV'
WHERE default_translation IS NULL;
