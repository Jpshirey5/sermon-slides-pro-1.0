import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { toast } from "sonner";

type SupportTab = "active" | "archived";

const AdminSupport = () => {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<SupportTab>("active");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [contactUpdatingIds, setContactUpdatingIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ items: any[] }>("support_list", { search, status: tab });
      setItems(result.items);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds(new Set());
    void load();
  }, [tab]);

  const complete = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const label = uniqueIds.length === 1 ? "this support request" : `${uniqueIds.length} support requests`;
    if (!window.confirm(`Mark ${label} completed? Completed tickets move to the 7-day archive for reference.`)) return;

    setCompletingIds(new Set(uniqueIds));
    try {
      await adminApi("support_complete", uniqueIds.length === 1 ? { id: uniqueIds[0] } : { ids: uniqueIds });
      toast.success(uniqueIds.length === 1 ? "Support request archived for 7 days." : "Selected support requests archived for 7 days.");
      setItems((current) => current.filter((item) => !uniqueIds.includes(item.id)));
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete support request.");
    } finally {
      setCompletingIds(new Set());
    }
  };

  const activeIds = items.map((item) => item.id);
  const allSelected = tab === "active" && activeIds.length > 0 && activeIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(activeIds) : new Set());
  };

  const updateEmailContacted = async (id: string, contacted: boolean) => {
    setContactUpdatingIds((current) => new Set(current).add(id));
    try {
      const result = await adminApi<{ item: any }>("support_email_contacted_update", { id, contacted });
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...result.item } : item)));
      toast.success(contacted ? "Marked as emailed." : "Email contact mark removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update email contact status.");
    } finally {
      setContactUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const messagePreview = (message: string) => {
    const cleanMessage = String(message || "").replace(/\s+/g, " ").trim();
    return cleanMessage.length > 140 ? `${cleanMessage.slice(0, 140)}...` : cleanMessage;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Support Queue</h1>
        <p className="text-muted-foreground mt-1">Active support tickets with a 7-day archive after completion.</p>
      </div>

      <div className="rounded-2xl glass-panel p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex rounded-full border border-border/70 bg-white/60 p-1">
            <Button
              type="button"
              size="sm"
              variant={tab === "active" ? "hero" : "ghost"}
              className="rounded-full"
              onClick={() => setTab("active")}
            >
              Active
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "archived" ? "hero" : "ghost"}
              className="rounded-full"
              onClick={() => setTab("archived")}
            >
              Archived
            </Button>
          </div>

          <div className="flex flex-1 gap-2 xl:max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="pl-9" placeholder="Search support..." />
            </div>
            <Button variant="outline" onClick={load}>Search</Button>
          </div>
        </div>

        {tab === "active" && selectedCount > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-foreground">
              {selectedCount} ticket{selectedCount === 1 ? "" : "s"} selected
            </p>
            <Button size="sm" onClick={() => complete(Array.from(selectedIds))} disabled={completingIds.size > 0}>
              <CheckCircle2 className="h-4 w-4" />
              Complete Selected
            </Button>
          </div>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading support requests...</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <Archive className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="font-medium text-foreground">
              {tab === "active" ? "No active support tickets." : "No archived tickets in the last 7 days."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "active"
                ? "New contact and dashboard support requests will appear here."
                : "Completed tickets stay here briefly, then purge automatically."}
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-white/65">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  {tab === "active" && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => toggleAll(checked === true)}
                        aria-label="Select all support tickets"
                      />
                    </TableHead>
                  )}
                  <TableHead>Requester</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>{tab === "archived" ? "Completed" : "Created"}</TableHead>
                  <TableHead>Email Contacted</TableHead>
                  {tab === "active" ? <TableHead className="text-right">Actions</TableHead> : <TableHead>Archived Until</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isCompleting = completingIds.has(item.id);
                  const isEmailContacted = Boolean(item.email_contacted_at);
                  const isContactUpdating = contactUpdatingIds.has(item.id);
                  return (
                    <TableRow key={item.id} data-state={isSelected ? "selected" : undefined}>
                      {tab === "active" && (
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => toggleOne(item.id, checked === true)}
                            aria-label={`Select support ticket from ${item.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="min-w-48">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.email}</p>
                          {item.phone && <p className="text-xs text-muted-foreground">{item.phone}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        {item.account ? (
                          <div className="space-y-1">
                            <Link to={`/admin/customers/${item.account.id}`} className="font-medium text-primary hover:underline">
                              {item.account.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {[item.account.city, item.account.state].filter(Boolean).join(", ") || "Location unavailable"}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{item.organization || "No organization"}</p>
                            <p className="text-xs text-muted-foreground">Public contact request</p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{item.subject || "Support Request"}</p>
                          <p className="text-sm text-muted-foreground" title={item.message}>{messagePreview(item.message)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatAdminDate(tab === "archived" ? item.completed_at : item.created_at)}
                      </TableCell>
                      <TableCell>
                        {tab === "active" ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={isEmailContacted}
                              disabled={isContactUpdating}
                              onCheckedChange={(checked) => updateEmailContacted(item.id, checked === true)}
                              aria-label={`Mark ${item.name} as contacted by email`}
                            />
                            <span className="text-xs text-muted-foreground">
                              {isEmailContacted ? "Emailed" : "Not emailed"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {isEmailContacted ? "Emailed" : "Not marked"}
                          </span>
                        )}
                      </TableCell>
                      {tab === "active" ? (
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => complete([item.id])} disabled={isCompleting}>
                            <CheckCircle2 className="h-4 w-4" />
                            Complete
                          </Button>
                        </TableCell>
                      ) : (
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatAdminDate(item.archived_until)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSupport;
