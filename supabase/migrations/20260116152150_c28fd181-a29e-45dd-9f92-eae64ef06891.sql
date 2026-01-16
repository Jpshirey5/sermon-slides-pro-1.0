-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view invites by token" ON public.account_invites;

-- Create a secure SELECT policy that only allows account members to view their account's invites
CREATE POLICY "Account members can view their account invites"
ON public.account_invites
FOR SELECT
USING (is_account_member(auth.uid(), account_id));

-- Create a secure function for token-based invite lookup (for invite acceptance flow)
-- This allows unauthenticated users to validate an invite by token without exposing all invite data
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS TABLE (
    id uuid,
    account_id uuid,
    email text,
    expires_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, account_id, email, expires_at
    FROM public.account_invites
    WHERE token = _token
    AND expires_at > now()
    LIMIT 1
$$;