import { supabase } from "@/integrations/supabase/client";

export type AdminApiAction =
  | "me"
  | "bootstrap"
  | "overview"
  | "overview_revenue"
  | "customers"
  | "customer_detail"
  | "customer_update"
  | "customer_request_email_change"
  | "support_list"
  | "support_complete"
  | "support_email_contacted_update"
  | "notifications_list"
  | "notifications_mark_read"
  | "notifications_mark_all_read"
  | "notifications_clear_all"
  | "messages_list"
  | "messages_customer_options"
  | "messages_create"
  | "messages_update"
  | "messages_delete"
  | "admin_users"
  | "admin_invite"
  | "admin_invite_resend"
  | "admin_invite_accept"
  | "admin_deactivate"
  | "password_reset"
  | "billing_list"
  | "refund_invoice_charge"
  | "overview_activity"
  | "customer_remove_member"
  | "customer_transfer_owner"
  | "customer_schedule_org_deletion"
  | "customer_hard_delete_org"
  | "customer_beta_update";

export const adminApi = async <T = any>(action: AdminApiAction, body: Record<string, unknown> = {}): Promise<T> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("admin-api", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: { action, ...body },
  });

  if (error) {
    const context = (error as any).context;
    if (context) {
      try {
        const payload = await context.json();
        if (payload?.error) throw new Error(payload.error);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== "Body is unusable") {
          throw parseError;
        }
      }
    }
    throw new Error(error.message || "Admin request failed");
  }

  if (data?.error) throw new Error(data.error);
  return data as T;
};

export const formatMoney = (amount: number | null | undefined, currency = "usd") => {
  if (typeof amount !== "number") return "Unavailable";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
};

export const formatAdminDate = (value: string | number | null | undefined) => {
  if (!value) return "Unavailable";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
