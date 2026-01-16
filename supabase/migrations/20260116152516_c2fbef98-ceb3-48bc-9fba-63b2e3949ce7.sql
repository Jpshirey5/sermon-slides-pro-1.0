-- Create a function to check if two users share an account
CREATE OR REPLACE FUNCTION public.users_share_account(_user_id_1 uuid, _user_id_2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.account_members am1
        INNER JOIN public.account_members am2 ON am1.account_id = am2.account_id
        WHERE am1.user_id = _user_id_1 AND am2.user_id = _user_id_2
    )
$$;

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create a restrictive SELECT policy - users can only view profiles of:
-- 1. Their own profile
-- 2. Users who share an account with them
CREATE POLICY "Users can view own profile and account member profiles"
ON public.profiles
FOR SELECT
USING (
    auth.uid() = id 
    OR users_share_account(auth.uid(), id)
);