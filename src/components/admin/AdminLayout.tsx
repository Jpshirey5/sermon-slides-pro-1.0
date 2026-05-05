import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, Bell, BookOpen, CheckCheck, CreditCard, Inbox, Landmark, LogOut, MessageSquareText, Shield, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminApi, formatAdminDate } from "@/lib/admin-api";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/admin", label: "Overview", icon: BarChart3 },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/support", label: "Support", icon: Inbox },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/financials", label: "Financials", icon: Landmark },
  { to: "/admin/messages", label: "Messages", icon: MessageSquareText },
  { to: "/admin/users", label: "Admin Users", icon: Shield },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    try {
      const result = await adminApi<{ items: any[]; unreadCount: number }>("notifications_list", { limit: 8 });
      setNotifications(result.items || []);
      setUnreadCount(result.unreadCount || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    document.title = "Admin Center | Sermon Slide Pro  ";
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 60_000);
    return () => {
      window.clearInterval(interval);
      document.title = "Sermon Slide Pro";
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  const openNotification = async (notification: any) => {
    try {
      await adminApi("notifications_mark_read", { id: notification.id });
    } finally {
      void loadNotifications();
      navigate(notification.targetUrl || "/admin");
    }
  };

  const markAllRead = async () => {
    await adminApi("notifications_mark_all_read");
    await loadNotifications();
  };

  const clearNotifications = async () => {
    await adminApi("notifications_clear_all");
    await loadNotifications();
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border/60 bg-white/75 backdrop-blur-md lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-border/60 px-5">
          <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-serif font-semibold text-foreground">Sermon Slide Pro</p>
            <p className="text-xs text-muted-foreground">Internal Admin</p>
          </div>
        </div>
        <nav className="space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-white/70 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between px-4 lg:px-8">
            <Link to="/admin" className="font-serif text-lg font-semibold text-foreground lg:hidden">
              Admin
            </Link>
            <div className="hidden lg:block">
              <p className="text-sm text-muted-foreground">Internal operations dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu onOpenChange={(open) => open && loadNotifications()}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Admin notifications">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-96 p-2">
                  <div className="flex items-center justify-between px-2 py-1">
                    <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={markAllRead}
                        disabled={unreadCount === 0}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Read
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={clearNotifications}
                        disabled={notifications.length === 0}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </Button>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No admin notifications yet.
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <DropdownMenuItem
                        key={notification.id}
                        className="block cursor-pointer rounded-xl p-3"
                        onSelect={(event) => {
                          event.preventDefault();
                          void openNotification(notification);
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {!notification.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary" />}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{notification.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {formatAdminDate(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>
        <main className="px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
