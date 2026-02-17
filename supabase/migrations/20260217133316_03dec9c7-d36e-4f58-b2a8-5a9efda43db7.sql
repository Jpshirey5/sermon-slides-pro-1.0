
-- Add missing columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Update handle_new_user to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email);
    RETURN NEW;
END;
$$;
