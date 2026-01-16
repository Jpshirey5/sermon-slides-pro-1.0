-- ============================================
-- FIX 1: accounts table - hide billing info from non-owners
-- ============================================

-- Create a view for members that excludes billing information
CREATE VIEW public.accounts_public
WITH (security_invoker=on) AS
  SELECT id, name, created_at, updated_at, subscription_status
  FROM public.accounts;
  -- Excludes: stripe_customer_id, stripe_subscription_id, subscription_period_end

-- Drop the existing SELECT policy that exposes all data to members
DROP POLICY IF EXISTS "Users can view their own account" ON public.accounts;

-- Create a policy that only allows owners to see full account data (including billing)
CREATE POLICY "Only owners can view full account data"
ON public.accounts
FOR SELECT
USING (is_account_owner(auth.uid(), id));

-- Grant SELECT on the public view to authenticated users
GRANT SELECT ON public.accounts_public TO authenticated;

-- ============================================
-- FIX 2: account_invites - restrict to owners only
-- ============================================

-- Drop the current policy that allows all members to view
DROP POLICY IF EXISTS "Account members can view their account invites" ON public.account_invites;

-- Create a policy that only allows owners to view invites
CREATE POLICY "Only owners can view account invites"
ON public.account_invites
FOR SELECT
USING (is_account_owner(auth.uid(), account_id));

-- ============================================
-- FIX 3: account_members_public view - ensure members can access it
-- ============================================

-- The view uses security_invoker=on, so it respects RLS on the base table.
-- But we changed base table to owner-only. We need a different approach.
-- Create a function that members can use to get their account members safely.

CREATE OR REPLACE FUNCTION public.get_account_members_for_user(_user_id uuid)
RETURNS TABLE (
    id uuid,
    account_id uuid,
    user_id uuid,
    role text,
    invited_at timestamp with time zone,
    created_at timestamp with time zone,
    accepted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        am.id, 
        am.account_id, 
        am.user_id, 
        am.role::text, 
        am.invited_at, 
        am.created_at, 
        am.accepted_at
    FROM public.account_members am
    WHERE am.account_id IN (
        SELECT account_id FROM public.account_members WHERE user_id = _user_id
    )
$$;

-- Drop the problematic view and recreate with proper security
DROP VIEW IF EXISTS public.account_members_public;

-- Recreate the view backed by the secure function approach
-- Actually, we should add a member SELECT policy that excludes email
-- This is simpler and more maintainable

-- Add back a member SELECT policy that doesn't expose invited_email
-- We'll use column-level approach via the function above instead