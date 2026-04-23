import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, Crown, MapPin, RotateCcw, ShieldAlert, Sparkles, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { adminApi, formatAdminDate, formatMoney } from "@/lib/admin-api";
import { formatBetaTrialCountdown, getBetaTrialDaysRemaining } from "@/lib/beta";
import { toast } from "sonner";

const memberName = (member: any) => member?.profile?.full_name || "Unnamed";
const memberEmail = (member: any) => member?.profile?.email || member?.invited_email || "No email";

const formatNextInvoiceSummary = (nextInvoice?: any) => {
  if (nextInvoice?.status === "not_applicable") return "Not applicable";
  if (!nextInvoice || nextInvoice.status === "none") return "No upcoming invoice";
  if (nextInvoice.status === "unavailable") return "Unavailable";
  const amount = typeof nextInvoice.amountDue === "number"
    ? formatMoney(nextInvoice.amountDue, nextInvoice.currency || "usd")
    : "Amount unavailable";
  const date = formatAdminDate(nextInvoice.nextInvoiceAt);
  return `${amount} · ${date}`;
};

type CustomerEditState = {
  ownerFullName: string;
  ownerChurchRole: string;
  accountName: string;
  city: string;
  state: string;
};

const getCustomerEditState = (customer: any): CustomerEditState => ({
  ownerFullName: customer?.owner?.profiles?.full_name || "",
  ownerChurchRole: customer?.owner?.profiles?.church_role || "",
  accountName: customer?.account?.name || "",
  city: customer?.account?.city || "",
  state: customer?.account?.state || "",
});

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const AdminCustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [ownerToTransfer, setOwnerToTransfer] = useState<any>(null);
  const [replacementOwnerId, setReplacementOwnerId] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeleteConfirmation, setHardDeleteConfirmation] = useState("");
  const [requestedOwnerEmail, setRequestedOwnerEmail] = useState("");
  const [editValues, setEditValues] = useState<CustomerEditState>({
    ownerFullName: "",
    ownerChurchRole: "",
    accountName: "",
    city: "",
    state: "",
  });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await adminApi("customer_detail", { accountId: id }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!data) return;
    setEditValues(getCustomerEditState(data));
    setRequestedOwnerEmail(data.pendingEmailChangeRequest?.requested_email || "");
  }, [data]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied.");
  };

  const sendReset = async (email?: string) => {
    if (!email) return;
    setActionLoading(`reset-${email}`);
    try {
      await adminApi("password_reset", { email });
      toast.success("Password reset email sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send reset email.");
    } finally {
      setActionLoading(null);
    }
  };

  const refund = async (paymentIntentId: string) => {
    if (!window.confirm("Issue a full refund for this payment? This cannot be undone.")) return;
    setActionLoading(paymentIntentId);
    try {
      await adminApi("refund_invoice_charge", { accountId: id, paymentIntentId });
      toast.success("Refund issued.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const removeMember = async () => {
    if (!id || !memberToRemove) return;
    setActionLoading(`remove-${memberToRemove.user_id}`);
    try {
      await adminApi("customer_remove_member", { accountId: id, targetUserId: memberToRemove.user_id });
      toast.success("Team member removed. Organization presentations were preserved.");
      setMemberToRemove(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove team member.");
    } finally {
      setActionLoading(null);
    }
  };

  const transferOwner = async () => {
    if (!id || !ownerToTransfer || !replacementOwnerId) return;
    setActionLoading(`transfer-${ownerToTransfer.user_id}`);
    try {
      await adminApi("customer_transfer_owner", {
        accountId: id,
        previousOwnerUserId: ownerToTransfer.user_id,
        newOwnerUserId: replacementOwnerId,
      });
      toast.success("Organization owner updated.");
      setOwnerToTransfer(null);
      setReplacementOwnerId("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not transfer ownership.");
    } finally {
      setActionLoading(null);
    }
  };

  const scheduleDeletion = async () => {
    if (!id) return;
    setActionLoading("schedule-delete");
    try {
      await adminApi("customer_schedule_org_deletion", { accountId: id });
      toast.success("Organization offboarding scheduled.");
      setScheduleOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule deletion.");
    } finally {
      setActionLoading(null);
    }
  };

  const hardDeleteOrg = async () => {
    if (!id || !data?.account) return;
    setActionLoading("hard-delete");
    try {
      await adminApi("customer_hard_delete_org", {
        accountId: id,
        confirmation: hardDeleteConfirmation,
      });
      toast.success("Organization hard deleted.");
      navigate("/admin/customers", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not hard delete organization.");
    } finally {
      setActionLoading(null);
    }
  };

  const updateBetaStatus = async (enabled: boolean) => {
    if (!id) return;
    setActionLoading("beta");
    try {
      await adminApi("customer_beta_update", { accountId: id, enabled });
      toast.success(enabled ? "Beta access enabled for 30 days." : "Beta label removed.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update beta status.");
    } finally {
      setActionLoading(null);
    }
  };

  const savedEditValues = useMemo(() => getCustomerEditState(data), [data]);
  const changedFields = useMemo(() => {
    const changes: Record<string, string> = {};

    if (editValues.ownerFullName.trim() !== savedEditValues.ownerFullName.trim()) {
      changes.ownerFullName = editValues.ownerFullName.trim();
    }
    if (editValues.ownerChurchRole.trim() !== savedEditValues.ownerChurchRole.trim()) {
      changes.ownerChurchRole = editValues.ownerChurchRole.trim();
    }
    if (editValues.accountName.trim() !== savedEditValues.accountName.trim()) {
      changes.accountName = editValues.accountName.trim();
    }
    if (editValues.city.trim() !== savedEditValues.city.trim()) {
      changes.city = editValues.city.trim();
    }
    if (editValues.state.trim() !== savedEditValues.state.trim()) {
      changes.state = editValues.state.trim();
    }

    return changes;
  }, [editValues, savedEditValues]);

  const hasEditChanges = Object.keys(changedFields).length > 0;

  const handleEditChange = (field: keyof CustomerEditState, value: string) => {
    setEditValues((current) => ({ ...current, [field]: value }));
  };

  const resetEditValues = () => {
    setEditValues(savedEditValues);
  };

  const saveCustomerChanges = async () => {
    if (!id || !hasEditChanges) return;
    if ("accountName" in changedFields && !changedFields.accountName.trim()) {
      toast.error("Organization name is required.");
      return;
    }

    setActionLoading("save-customer");
    try {
      const updated = await adminApi("customer_update", {
        accountId: id,
        changes: changedFields,
      });
      setData(updated);
      toast.success("Customer changes saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save customer changes.");
    } finally {
      setActionLoading(null);
    }
  };

  const requestOwnerEmailChange = async () => {
    if (!id) return;
    const normalizedEmail = requestedOwnerEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Enter a new owner email address.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      toast.error("Enter a valid owner email address.");
      return;
    }
    if (normalizedEmail === (ownerProfile?.email || "").trim().toLowerCase()) {
      toast.error("That already matches the current owner email.");
      return;
    }

    setActionLoading("request-email-change");
    try {
      const updated = await adminApi("customer_request_email_change", {
        accountId: id,
        requestedEmail: normalizedEmail,
      });
      setData(updated);
      toast.success("Confirmation request sent to the new email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the confirmation request.");
    } finally {
      setActionLoading(null);
    }
  };

  const availableReplacementOwners = useMemo(
    () => (data?.members || []).filter((member: any) => member.user_id !== ownerToTransfer?.user_id),
    [data?.members, ownerToTransfer?.user_id],
  );

  if (loading) return <p className="text-muted-foreground">Loading customer...</p>;
  if (!data) return <p className="text-muted-foreground">Customer not found.</p>;

  const account = data.account;
  const ownerProfile = data.owner?.profiles;
  const invoices = data.stripeContext?.invoices || [];
  const members = data.members || [];
  const nextInvoice = data.nextInvoice || data.stripeContext?.nextInvoice || null;
  const organizationName = account.name || "";
  const canHardDelete = hardDeleteConfirmation.trim().toLowerCase() === organizationName.trim().toLowerCase();
  const betaCountdown = formatBetaTrialCountdown(getBetaTrialDaysRemaining(account.beta_trial_ends_at));
  const activeDeletionRequest = data.activeDeletionRequest;
  const offboardingDateLabel = data.offboardingPhase === "grace" ? "Grace period ends" : "Access ends";
  const pendingEmailChangeRequest = data.pendingEmailChangeRequest;
  const normalizedRequestedOwnerEmail = requestedOwnerEmail.trim().toLowerCase();
  const canRequestEmailChange =
    normalizedRequestedOwnerEmail.length > 0 &&
    isValidEmail(normalizedRequestedOwnerEmail) &&
    normalizedRequestedOwnerEmail !== (ownerProfile?.email || "").trim().toLowerCase() &&
    actionLoading !== "request-email-change";
  const emailRequestButtonLabel =
    pendingEmailChangeRequest?.requested_email &&
    pendingEmailChangeRequest.requested_email.toLowerCase() === normalizedRequestedOwnerEmail
      ? "Resend Confirmation Request"
      : "Send Confirmation Request";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl font-bold">{organizationName}</h1>
            {account.is_beta_user && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Beta
              </span>
            )}
          </div>
          <p className="text-muted-foreground">{ownerProfile?.email || account.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={account.is_beta_user ? "outline" : "hero"}
            onClick={() => updateBetaStatus(!account.is_beta_user)}
            disabled={actionLoading === "beta"}
          >
            <Sparkles className="h-4 w-4" />
            {account.is_beta_user ? "Remove Beta" : "Mark Beta"}
          </Button>
          <Button variant="outline" onClick={() => setScheduleOpen(true)}>
            Schedule Offboarding
          </Button>
          <Button variant="destructive" onClick={() => setHardDeleteOpen(true)}>
            <ShieldAlert className="h-4 w-4" /> Hard Delete Org
          </Button>
        </div>
      </div>

      {activeDeletionRequest && (
        <section className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-destructive">Canceled / Offboarding</p>
              <p className="text-sm text-muted-foreground">
                {data.offboardingPhase === "grace"
                  ? "This customer is still inside the 7-day save window."
                  : "The grace period has ended. They keep access until the paid term ends."}
              </p>
            </div>
            <div className="text-sm md:text-right">
              <p className="text-muted-foreground">{offboardingDateLabel}</p>
              <p className="font-medium text-foreground">{formatAdminDate(data.offboardingDate)}</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl glass-panel p-5 lg:col-span-2">
          <h2 className="font-serif text-xl font-semibold mb-4">Account Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-account-name">Church Name</Label>
              <Input
                id="customer-account-name"
                value={editValues.accountName}
                onChange={(event) => handleEditChange("accountName", event.target.value)}
                disabled={actionLoading === "save-customer"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-owner-name">Owner Full Name</Label>
              <Input
                id="customer-owner-name"
                value={editValues.ownerFullName}
                onChange={(event) => handleEditChange("ownerFullName", event.target.value)}
                disabled={actionLoading === "save-customer"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-owner-email">Current Owner Email</Label>
              <Input
                id="customer-owner-email"
                type="email"
                value={ownerProfile?.email || ""}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-owner-role">Role at Church</Label>
              <Input
                id="customer-owner-role"
                value={editValues.ownerChurchRole}
                onChange={(event) => handleEditChange("ownerChurchRole", event.target.value)}
                disabled={actionLoading === "save-customer"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-city">City</Label>
              <Input
                id="customer-city"
                value={editValues.city}
                onChange={(event) => handleEditChange("city", event.target.value)}
                disabled={actionLoading === "save-customer"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-state">State</Label>
              <Input
                id="customer-state"
                value={editValues.state}
                onChange={(event) => handleEditChange("state", event.target.value)}
                disabled={actionLoading === "save-customer"}
              />
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-border/70 bg-white/55 p-4">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Owner Email Change</p>
                <p className="text-sm text-muted-foreground">
                  Send a confirmation request to the new address. The current login email will stay active until the customer confirms the change.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="customer-requested-owner-email">New Owner Email</Label>
                  <Input
                    id="customer-requested-owner-email"
                    type="email"
                    value={requestedOwnerEmail}
                    onChange={(event) => setRequestedOwnerEmail(event.target.value)}
                    disabled={actionLoading === "request-email-change"}
                  />
                </div>
                <Button
                  onClick={requestOwnerEmailChange}
                  disabled={!canRequestEmailChange}
                >
                  {actionLoading === "request-email-change" ? "Sending..." : emailRequestButtonLabel}
                </Button>
              </div>
              {pendingEmailChangeRequest && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Pending change to <span className="font-medium">{pendingEmailChangeRequest.requested_email}</span> · Requested {formatAdminDate(pendingEmailChangeRequest.created_at)} · Expires {formatAdminDate(pendingEmailChangeRequest.expires_at)}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={resetEditValues}
              disabled={!hasEditChanges || actionLoading === "save-customer"}
            >
              Cancel
            </Button>
            <Button
              onClick={saveCustomerChanges}
              disabled={!hasEditChanges || actionLoading === "save-customer"}
            >
              {actionLoading === "save-customer" ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          <div className="mt-6 grid gap-4 border-t border-border/70 pt-5 md:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Church Location</p><p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {data.location?.label || "Unavailable"}</p></div>
            <div><p className="text-xs text-muted-foreground">Plan</p><p className="capitalize">{account.plan_tier || "free"}</p></div>
            <div><p className="text-xs text-muted-foreground">Beta Program</p><p>{account.is_beta_user ? betaCountdown : "Not beta"}</p></div>
            <div><p className="text-xs text-muted-foreground">Subscription</p><p>{data.adminSubscriptionStatusLabel || account.subscription_status}</p></div>
            {activeDeletionRequest && (
              <div><p className="text-xs text-muted-foreground">{offboardingDateLabel}</p><p>{formatAdminDate(data.offboardingDate)}</p></div>
            )}
            <div><p className="text-xs text-muted-foreground">Next Invoice</p><p>{formatNextInvoiceSummary(nextInvoice)}</p></div>
            <div><p className="text-xs text-muted-foreground">Presentations</p><p>{data.presentationCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Created</p><p>{formatAdminDate(account.created_at)}</p></div>
            <div><p className="text-xs text-muted-foreground">Team Members</p><p>{members.length}</p></div>
          </div>
        </section>

        <section className="rounded-2xl glass-panel p-5">
          <h2 className="font-serif text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => copy(account.id)}>
              <Copy className="h-4 w-4" /> Copy Account ID
            </Button>
            {account.stripe_customer_id && (
              <Button variant="outline" className="w-full justify-start" onClick={() => copy(account.stripe_customer_id)}>
                <Copy className="h-4 w-4" /> Copy Stripe ID
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => sendReset(ownerProfile?.email)}
              disabled={actionLoading === `reset-${ownerProfile?.email}` || !ownerProfile?.email}
            >
              <RotateCcw className="h-4 w-4" /> Reset Owner Password
            </Button>
          </div>
        </section>
      </div>

      <Accordion type="multiple" className="space-y-4">
        <AccordionItem value="team" className="rounded-2xl glass-panel border-0 px-5">
          <AccordionTrigger className="py-5 text-left hover:no-underline">
            <span className="font-serif text-xl font-semibold">Team Members</span>
            <span className="ml-3 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {members.length}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <div className="space-y-3">
              {members.map((member: any) => (
                <div key={member.id} className="rounded-xl border border-border/70 bg-white/65 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{memberName(member)}</p>
                        {member.role === "owner" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            <Crown className="h-3 w-3" /> Owner
                          </span>
                        )}
                        {member.profile?.church_role && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {member.profile.church_role}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{memberEmail(member)}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {formatAdminDate(member.accepted_at || member.created_at)} · Account role: {member.role}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendReset(member.profile?.email)}
                        disabled={!member.profile?.email || actionLoading === `reset-${member.profile?.email}`}
                      >
                        <RotateCcw className="h-4 w-4" /> Reset
                      </Button>
                      {member.role === "owner" ? (
                        <Button size="sm" variant="outline" onClick={() => {
                          setOwnerToTransfer(member);
                          setReplacementOwnerId("");
                        }}>
                          <Crown className="h-4 w-4" /> Transfer Owner
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => {
                            setOwnerToTransfer(data.owner ? {
                              user_id: data.owner.user_id,
                              profile: data.owner.profiles,
                            } : null);
                            setReplacementOwnerId(member.user_id);
                          }}>
                            Make Owner
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setMemberToRemove(member)}>
                            <UserMinus className="h-4 w-4" /> Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="invoices" className="rounded-2xl glass-panel border-0 px-5">
          <AccordionTrigger className="py-5 text-left hover:no-underline">
            <span className="font-serif text-xl font-semibold">Recent Invoices and Refunds</span>
            <span className="ml-3 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {invoices.length}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            {data.stripeContext?.error && <p className="text-sm text-red-600">{data.stripeContext.error}</p>}
            <div className="space-y-3">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Stripe invoices available.</p>
              ) : invoices.map((invoice: any) => (
                <div key={invoice.id} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-white/65 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{invoice.number || invoice.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.status} · {formatMoney(invoice.amount_paid, invoice.currency)} · {formatAdminDate(invoice.created)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {invoice.hosted_invoice_url && (
                      <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">Open</Button>
                      </a>
                    )}
                    {invoice.payment_intent && invoice.amount_paid > 0 && (
                      <Button size="sm" variant="destructive" onClick={() => refund(invoice.payment_intent)} disabled={actionLoading === invoice.payment_intent}>
                        Refund
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="support" className="rounded-2xl glass-panel border-0 px-5">
          <AccordionTrigger className="py-5 text-left hover:no-underline">
            <span className="font-serif text-xl font-semibold">Linked Support Requests</span>
            <span className="ml-3 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {(data.supportRequests || []).length}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            {(data.supportRequests || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No open support requests for this organization.</p>
            ) : data.supportRequests.map((request: any) => (
              <div key={request.id} className="rounded-xl border border-border/70 bg-white/65 p-3 mb-3">
                <p className="font-medium">{request.subject}</p>
                <p className="text-xs text-muted-foreground">{formatAdminDate(request.created_at)}</p>
                <p className="text-sm text-muted-foreground mt-1">{request.message}</p>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog open={Boolean(memberToRemove)} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {memberToRemove ? memberName(memberToRemove) : "this user"}’s login and removes only their access to {organizationName}. Organization presentations and billing remain with the church.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Member</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={removeMember}>
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(ownerToTransfer)} onOpenChange={(open) => !open && setOwnerToTransfer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer organization owner?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the team member who should become the owner. The current owner will become a regular member and can then be removed if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="replacement-owner">New owner</Label>
            <select
              id="replacement-owner"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={replacementOwnerId}
              onChange={(event) => setReplacementOwnerId(event.target.value)}
            >
              <option value="">Choose a replacement owner</option>
              {availableReplacementOwners.map((member: any) => (
                <option key={member.user_id} value={member.user_id}>
                  {memberName(member)} · {memberEmail(member)}
                </option>
              ))}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={transferOwner} disabled={!replacementOwnerId}>
              Transfer Owner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule organization offboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates the existing 7-day deletion request, schedules Stripe cancellation for the end of the billing period when possible, and keeps access through the paid term.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={scheduleDeletion} disabled={actionLoading === "schedule-delete"}>
              Schedule Offboarding
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={hardDeleteOpen} onOpenChange={setHardDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hard delete organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This is immediate and destructive. It deletes the organization, team access, presentations, and attempts to cancel/delete Stripe customer context. Type the organization name exactly to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hard-delete-confirm">Type {organizationName}</Label>
            <Input
              id="hard-delete-confirm"
              value={hardDeleteConfirmation}
              onChange={(event) => setHardDeleteConfirmation(event.target.value)}
              placeholder={organizationName}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={hardDeleteOrg}
              disabled={!canHardDelete || actionLoading === "hard-delete"}
            >
              Hard Delete Organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCustomerDetail;
