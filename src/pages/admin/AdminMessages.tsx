import { useEffect, useState } from "react";
import { Calendar, Megaphone, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { toast } from "sonner";

type AudienceType = "all" | "account";

const defaultForm = {
  title: "",
  body: "",
  audienceType: "all" as AudienceType,
  targetAccountId: "",
  startsOn: "",
  endsOn: "",
  ctaLabel: "",
  ctaUrl: "",
};

const dateToIso = (date: string, endOfDay = false) => {
  if (!date) return null;
  return new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
};

const audienceLabel = (message: any) => {
  if (message.audience_type === "all") return "All customers";
  return message.targetAccount?.name || "Selected customer";
};

const AdminMessages = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ items: any[] }>("messages_list");
      setMessages(result.items || []);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async (search = "") => {
    const result = await adminApi<{ items: any[] }>("messages_customer_options", { search });
    setCustomers(result.items || []);
  };

  useEffect(() => {
    void loadMessages();
    void loadCustomers();
  }, []);

  const updateForm = (key: keyof typeof defaultForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi("messages_create", {
        title: form.title,
        body: form.body,
        audienceType: form.audienceType,
        targetAccountId: form.audienceType === "account" ? form.targetAccountId : null,
        startsAt: dateToIso(form.startsOn),
        endsAt: dateToIso(form.endsOn, true),
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        status: "active",
      });
      toast.success("Message created.");
      setForm(defaultForm);
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create message.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (message: any) => {
    const nextStatus = message.status === "active" ? "inactive" : "active";
    setActionLoading(`status-${message.id}`);
    try {
      await adminApi("messages_update", { id: message.id, status: nextStatus });
      toast.success(nextStatus === "active" ? "Message activated." : "Message deactivated.");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update message.");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteMessage = async (message: any) => {
    if (!window.confirm(`Delete "${message.title}"? This removes it from customer dashboards.`)) return;
    setActionLoading(`delete-${message.id}`);
    try {
      await adminApi("messages_delete", { id: message.id });
      toast.success("Message deleted.");
      await loadMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete message.");
    } finally {
      setActionLoading(null);
    }
  };

  const searchCustomers = async () => {
    await loadCustomers(customerSearch);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Messages</h1>
        <p className="text-muted-foreground mt-1">
          Create dashboard modal announcements for all customers or a specific organization.
        </p>
      </div>

      <section className="rounded-2xl glass-panel p-5">
        <div className="mb-5 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-xl font-semibold">Create Message</h2>
        </div>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="message-title">Title</Label>
              <Input
                id="message-title"
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="New feature available"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select value={form.audienceType} onValueChange={(value) => updateForm("audienceType", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  <SelectItem value="account">Single customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.audienceType === "account" && (
            <div className="rounded-xl border border-border/70 bg-white/60 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void searchCustomers();
                      }
                    }}
                    className="pl-9"
                    placeholder="Search organization name"
                  />
                </div>
                <Button type="button" variant="outline" onClick={searchCustomers}>Search</Button>
              </div>
              <Select value={form.targetAccountId} onValueChange={(value) => updateForm("targetAccountId", value)}>
                <SelectTrigger><SelectValue placeholder="Choose customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}{[customer.city, customer.state].filter(Boolean).length ? ` · ${[customer.city, customer.state].filter(Boolean).join(", ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="message-body">Message</Label>
            <Textarea
              id="message-body"
              value={form.body}
              onChange={(event) => updateForm("body", event.target.value)}
              rows={5}
              placeholder="Tell customers what changed, what they should know, or what to try next."
              required
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="message-start">Start date optional</Label>
              <Input id="message-start" type="date" value={form.startsOn} onChange={(event) => updateForm("startsOn", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message-end">End date optional</Label>
              <Input id="message-end" type="date" value={form.endsOn} onChange={(event) => updateForm("endsOn", event.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cta-label">CTA label optional</Label>
              <Input id="cta-label" value={form.ctaLabel} onChange={(event) => updateForm("ctaLabel", event.target.value)} placeholder="View plans" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cta-url">CTA URL optional</Label>
              <Input id="cta-url" value={form.ctaUrl} onChange={(event) => updateForm("ctaUrl", event.target.value)} placeholder="/account or https://..." />
            </div>
          </div>

          <Button
            type="submit"
            variant="hero"
            disabled={saving || !form.title.trim() || !form.body.trim() || (form.audienceType === "account" && !form.targetAccountId)}
          >
            {saving ? "Creating..." : "Create Message"}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl glass-panel p-5">
        <h2 className="font-serif text-xl font-semibold mb-4">Active and Past Messages</h2>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading messages...</p>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-white/60 p-8 text-center">
            <p className="font-medium text-foreground">No messages yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Create one above when you want to announce something on customer dashboards.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className="rounded-xl border border-border/70 bg-white/65 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{message.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${message.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {message.status}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {audienceLabel(message)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{message.body}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Starts {formatAdminDate(message.starts_at)}</span>
                      <span>Ends {formatAdminDate(message.ends_at)}</span>
                      {message.cta_label && message.cta_url && <span>CTA: {message.cta_label}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatus(message)}
                      disabled={actionLoading === `status-${message.id}`}
                    >
                      {message.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMessage(message)}
                      disabled={actionLoading === `delete-${message.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminMessages;
