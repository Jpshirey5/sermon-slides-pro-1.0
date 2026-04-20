CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  requester_user_id UUID,
  requester_email TEXT,
  requester_full_name TEXT,
  account_name TEXT,
  requester_role TEXT NOT NULL DEFAULT 'owner',
  plan_tier TEXT,
  billing_interval TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  reason TEXT NOT NULL,
  additional_feedback TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelable_until TIMESTAMPTZ NOT NULL,
  subscription_period_end TIMESTAMPTZ,
  scheduled_delete_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'canceled', 'completed', 'failed')),
  canceled_at TIMESTAMPTZ,
  canceled_by UUID,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  alert_email_sent BOOLEAN NOT NULL DEFAULT false,
  alert_email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_account_status
  ON public.account_deletion_requests(account_id, status, scheduled_delete_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_requests_one_pending_per_account
  ON public.account_deletion_requests(account_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.touch_account_deletion_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_account_deletion_requests_updated_at
ON public.account_deletion_requests;

CREATE TRIGGER touch_account_deletion_requests_updated_at
BEFORE UPDATE ON public.account_deletion_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_account_deletion_requests_updated_at();

CREATE POLICY "Account members can view deletion requests"
ON public.account_deletion_requests
FOR SELECT
TO authenticated
USING (public.is_account_member(auth.uid(), account_id));

CREATE POLICY "Only service role can insert deletion requests"
ON public.account_deletion_requests
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Only service role can update deletion requests"
ON public.account_deletion_requests
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Only service role can delete deletion requests"
ON public.account_deletion_requests
FOR DELETE
TO authenticated
USING (false);
