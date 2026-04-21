import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { toast } from "sonner";

const AdminSupport = () => {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ items: any[] }>("support_list", { search });
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const complete = async (id: string) => {
    if (!window.confirm("Mark this support request completed? This deletes it from the active queue.")) return;
    setCompletingId(id);
    try {
      await adminApi("support_complete", { id });
      toast.success("Support request completed and removed.");
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete support request.");
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Support Queue</h1>
        <p className="text-muted-foreground mt-1">Active contact form submissions. Completed requests are deleted.</p>
      </div>

      <div className="rounded-2xl glass-panel p-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="pl-9" placeholder="Search support..." />
          </div>
          <Button variant="outline" onClick={load}>Search</Button>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading support requests...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Support queue is empty.</p>
          ) : items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/70 bg-white/65 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.email} · {item.organization || "No organization"}</p>
                    <p className="text-xs text-muted-foreground">{formatAdminDate(item.created_at)} · {item.phone || "No phone"}</p>
                  </div>
                  {item.account && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                      <p className="font-medium text-foreground">Linked organization: {item.account.name}</p>
                      <p className="text-muted-foreground">
                        {[item.account.city, item.account.state].filter(Boolean).join(", ") || "Location unavailable"}
                      </p>
                      <Link to={`/admin/customers/${item.account.id}`} className="mt-1 inline-block text-primary hover:underline">
                        Open customer record
                      </Link>
                    </div>
                  )}
                  {!item.notification_sent && (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Email notification failed or was skipped. Request is safely stored here.
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-foreground">{item.message}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => complete(item.id)} disabled={completingId === item.id}>
                  <Trash2 className="h-4 w-4" />
                  Complete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminSupport;
