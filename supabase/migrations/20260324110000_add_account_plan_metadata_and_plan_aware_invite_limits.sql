ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS plan_tier text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS max_additional_users integer DEFAULT 0;

UPDATE public.accounts
SET
  plan_tier = COALESCE(plan_tier, 'free'),
  max_additional_users = COALESCE(max_additional_users, 0)
WHERE plan_tier IS NULL OR max_additional_users IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_account_invite_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  non_owner_member_count integer;
  active_pending_invite_count integer;
  account_plan_tier text;
BEGIN
  SELECT plan_tier
  INTO account_plan_tier
  FROM public.accounts
  WHERE id = NEW.account_id;

  account_plan_tier := COALESCE(account_plan_tier, 'free');

  IF account_plan_tier IN ('free', 'pro') THEN
    RAISE EXCEPTION 'account invite limit reached'
      USING ERRCODE = 'P0001',
            DETAIL = 'Your current plan does not include collaborative user invites.';
  END IF;

  IF account_plan_tier = 'enterprise' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO non_owner_member_count
  FROM public.account_members
  WHERE account_id = NEW.account_id
    AND role = 'member';

  SELECT COUNT(*)
  INTO active_pending_invite_count
  FROM public.account_invites
  WHERE account_id = NEW.account_id
    AND expires_at > now();

  IF non_owner_member_count + active_pending_invite_count >= 2 THEN
    RAISE EXCEPTION 'account invite limit reached'
      USING ERRCODE = 'P0001',
            DETAIL = 'Team plans include up to 2 additional users, including active pending invites.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_account_invite_limit_before_insert ON public.account_invites;

CREATE TRIGGER enforce_account_invite_limit_before_insert
BEFORE INSERT ON public.account_invites
FOR EACH ROW
EXECUTE FUNCTION public.enforce_account_invite_limit();
