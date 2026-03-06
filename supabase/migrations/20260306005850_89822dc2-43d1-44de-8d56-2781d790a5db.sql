
-- Add city and state columns to accounts table
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS state text;

-- Allow authenticated users to insert into accounts (needed for signup trigger)
-- The handle_new_user trigger runs as SECURITY DEFINER so it can insert directly,
-- but we also need members to be able to read their own account
CREATE POLICY "Members can view their account"
ON public.accounts FOR SELECT
TO authenticated
USING (is_account_member(auth.uid(), id));

-- Update handle_new_user to create account + account_member on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invite_token text;
  _invite_account_id uuid;
  _new_account_id uuid;
BEGIN
    -- Create profile
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email);

    -- Check if user signed up via invite
    _invite_token := NEW.raw_user_meta_data ->> 'invite_token';
    
    IF _invite_token IS NOT NULL AND _invite_token != '' THEN
      -- Look up the invite
      SELECT account_id INTO _invite_account_id
      FROM public.account_invites
      WHERE token = _invite_token AND expires_at > now()
      LIMIT 1;
      
      IF _invite_account_id IS NOT NULL THEN
        -- Add user as member of existing account
        INSERT INTO public.account_members (account_id, user_id, role, accepted_at)
        VALUES (_invite_account_id, NEW.id, 'member', now());
        
        -- Delete the used invite
        DELETE FROM public.account_invites WHERE token = _invite_token;
        
        RETURN NEW;
      END IF;
    END IF;

    -- No valid invite — create a new account for this user
    INSERT INTO public.accounts (name, city, state)
    VALUES (
      COALESCE(NEW.raw_user_meta_data ->> 'org_name', 'My Church'),
      NEW.raw_user_meta_data ->> 'org_city',
      NEW.raw_user_meta_data ->> 'org_state'
    )
    RETURNING id INTO _new_account_id;

    -- Make user the owner of the new account
    INSERT INTO public.account_members (account_id, user_id, role, accepted_at)
    VALUES (_new_account_id, NEW.id, 'owner', now());

    RETURN NEW;
END;
$function$;

-- Create trigger if it doesn't exist (drop and recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
