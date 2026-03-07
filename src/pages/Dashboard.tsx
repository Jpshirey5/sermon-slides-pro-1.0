import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  LogOut,
  Presentation,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Clock,
  User,
} from "lucide-react";
import {
  getPresentations,
  deletePresentation,
  type SermonPresentation,
} from "@/lib/presentations";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, signOut, checkSubscription } = useAuth();
  const [presentations, setPresentations] = useState<SermonPresentation[]>([]);
  const [loading, setLoading] = useState(true);

  // Handle returning from Stripe checkout
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      checkSubscription();
      toast.success("Subscription activated! Welcome to SermonSlides Pro.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const loadPresentations = async () => {
    setLoading(true);
    const data = await getPresentations();
    setPresentations(data);
    setLoading(false);
  };

  useEffect(() => {
    loadPresentations();
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleDeletePresentation = async (id: string) => {
    await deletePresentation(id);
    await loadPresentations();
    toast.success("Presentation deleted");
  };

  const displayName = profile?.full_name || user?.email || "User";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-serif text-lg font-semibold text-foreground">
                SermonSlides
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/account">
                <Button variant="ghost" size="sm">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Account</span>
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Log Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
            Welcome back
          </h1>
          <p className="text-muted-foreground">{displayName}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {/* Sermon Slide Creator Card */}
          <div className="max-w-lg mx-auto rounded-2xl border border-border bg-card p-8 flex flex-col items-center text-center mb-14">
            <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-5">
              <Presentation className="w-6 h-6 text-primary-foreground" />
            </div>
            <h2 className="font-serif text-xl font-semibold text-foreground mb-2">
              Sermon Slide Creator
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Create sermon presentations with auto scripture lookup and export
              to PowerPoint & ProPresenter.
            </p>
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <Link to="/dashboard/create">
                <Button variant="hero" className="w-full">
                  <Plus className="w-4 h-4" />
                  Create New Presentation
                </Button>
              </Link>
            </div>
          </div>

          {/* Presentations List */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-2xl font-semibold text-foreground">
                My Presentations
              </h2>
              <Link to="/dashboard/create">
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4" />
                  New
                </Button>
              </Link>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
                <p className="text-muted-foreground">Loading presentations...</p>
              </div>
            ) : presentations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
                <Presentation className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No presentations yet. Create your first one!
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {presentations.map((p) => (
                  <div key={p.id} className="rounded-xl border border-border bg-card p-5 hover:shadow-soft transition-shadow group">
                    <div className="cursor-pointer" onClick={() => navigate(`/editor/${p.id}`, { state: { from: "dashboard" } })}>
                      <h3 className="font-serif font-semibold text-foreground mb-1 group-hover:text-primary transition-colors truncate">
                        {p.title || "Untitled"}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {p.date}</span>
                        <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {p.slides} slides</span>
                      </div>
                      <p className="text-xs text-muted-foreground"><Clock className="w-3 h-3 inline mr-1" />{p.lastModified}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeletePresentation(p.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
