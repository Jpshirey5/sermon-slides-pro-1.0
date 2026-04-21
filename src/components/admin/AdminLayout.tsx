import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, CreditCard, Inbox, LogOut, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/admin", label: "Overview", icon: BarChart3 },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/support", label: "Support", icon: Inbox },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/users", label: "Admin Users", icon: Shield },
];

const AdminLayout = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
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
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
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
