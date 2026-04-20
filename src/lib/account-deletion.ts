import { supabase } from "@/integrations/supabase/client";

export type AccountDeletionRequest = {
  id: string;
  accountId: string;
  accountName: string | null;
  cancelableUntil: string;
  scheduledDeleteAt: string;
  subscriptionPeriodEnd: string | null;
  status: string;
};

export const isDeletionCancelable = (request: AccountDeletionRequest | null) => {
  if (!request || request.status !== "pending") return false;
  return new Date(request.cancelableUntil).getTime() > Date.now();
};

export const getActiveAccountDeletionRequest = async (
  accountId: string
): Promise<AccountDeletionRequest | null> => {
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("id, account_id, account_name, cancelable_until, scheduled_delete_at, subscription_period_end, status")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    id: data.id,
    accountId: data.account_id,
    accountName: data.account_name,
    cancelableUntil: data.cancelable_until,
    scheduledDeleteAt: data.scheduled_delete_at,
    subscriptionPeriodEnd: data.subscription_period_end,
    status: data.status,
  };
};

export const formatDeletionDate = (value: string | null) => {
  if (!value) return "Unavailable";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};
