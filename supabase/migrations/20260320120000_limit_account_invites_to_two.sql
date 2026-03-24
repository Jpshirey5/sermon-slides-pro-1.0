CREATE OR REPLACE FUNCTION public.enforce_account_invite_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  non_owner_member_count integer;
  active_pending_invite_count integer;
BEGIN
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
            DETAIL = 'Each account can have up to 2 additional collaborative users, including active pending invites.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_account_invite_limit_before_insert ON public.account_invites;

CREATE TRIGGER enforce_account_invite_limit_before_insert
BEFORE INSERT ON public.account_invites
FOR EACH ROW
EXECUTE FUNCTION public.enforce_account_invite_limit();
