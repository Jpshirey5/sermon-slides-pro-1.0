-- Create a view that excludes the sensitive invited_email field
CREATE VIEW public.account_members_public
WITH (security_invoker=on) AS
  SELECT id, account_id, user_id, role, invited_at, created_at, accepted_at
  FROM public.account_members;
  -- Excludes invited_email to protect member privacy

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Members can view their account members" ON public.account_members;

-- Create a restrictive SELECT policy - only owners can see full data (including emails)
CREATE POLICY "Only owners can view full account member data"
ON public.account_members
FOR SELECT
USING (is_account_owner(auth.uid(), account_id));

-- Grant SELECT on the view to authenticated users (RLS on base table still applies via security_invoker)
GRANT SELECT ON public.account_members_public TO authenticated;