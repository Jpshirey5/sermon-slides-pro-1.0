CREATE TABLE IF NOT EXISTS public.exit_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID,
  requester_email TEXT,
  account_id UUID,
  was_owner BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL,
  additional_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exit_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own exit survey"
ON public.exit_surveys
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "No direct read access to exit surveys"
ON public.exit_surveys
FOR SELECT
TO authenticated
USING (false);
