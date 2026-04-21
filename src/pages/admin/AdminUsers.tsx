import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { toast } from "sonner";

const AdminUsers = () => {
  const [admins, setAdmins] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi<{ admins: any[]; invites: any[] }>("admin_users");
      setAdmins(data.admins);
      setInvites(data.invites);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async () => {
    setActionLoading("invite");
    try {
      await adminApi("admin_invite", { email });
      toast.success("Admin invite sent.");
      setEmail("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not invite admin.");
    } finally {
      setActionLoading(null);
    }
  };

  const resend = async (id: string) => {
    setActionLoading(id);
    try {
      await adminApi("admin_invite_resend", { id });
      toast.success("Invite resent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resend invite.");
    } finally {
      setActionLoading(null);
    }
  };

  const deactivate = async (id: string) => {
    if (!window.confirm("Deactivate this admin's access?")) return;
    setActionLoading(id);
    try {
      await adminApi("admin_deactivate", { id });
      toast.success("Admin access deactivated.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not deactivate admin.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Admin Users</h1>
        <p className="text-muted-foreground mt-1">Invite and manage internal admin access.</p>
      </div>

      <div className="rounded-2xl glass-panel p-5">
        <h2 className="font-serif text-xl font-semibold mb-4">Invite Admin</h2>
        <div className="flex gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@sermonslidepro.com" />
          <Button onClick={invite} disabled={!email.trim() || actionLoading === "invite"}>Invite</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl glass-panel p-5">
          <h2 className="font-serif text-xl font-semibold mb-4">Current Admins</h2>
          {loading ? <p className="text-muted-foreground">Loading...</p> : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-white/65 p-3">
                  <div>
                    <p className="font-medium">{admin.email}</p>
                    <p className="text-xs text-muted-foreground">{admin.status} · {formatAdminDate(admin.created_at)}</p>
                  </div>
                  {admin.status === "active" && (
                    <Button variant="outline" size="sm" onClick={() => deactivate(admin.id)} disabled={actionLoading === admin.id}>
                      Deactivate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl glass-panel p-5">
          <h2 className="font-serif text-xl font-semibold mb-4">Invites</h2>
          <div className="space-y-3">
            {invites.length === 0 ? <p className="text-muted-foreground">No invites yet.</p> : invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-white/65 p-3">
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">{invite.status} · Expires {formatAdminDate(invite.expires_at)}</p>
                </div>
                {invite.status === "pending" && (
                  <Button variant="outline" size="sm" onClick={() => resend(invite.id)} disabled={actionLoading === invite.id}>
                    Resend
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminUsers;
