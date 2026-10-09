import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, Loader2, MonitorPlay, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServicesHeader } from "@/components/services/ServicesHeader";
import { TranslationSelect } from "@/components/services/TranslationSelect";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateOnlyForDisplay } from "@/lib/date-format";
import { createService, listServices, type ServiceSummary } from "@/lib/services";
import { DEFAULT_TRANSLATION } from "@/lib/translations";

const nextSunday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const Services = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Sunday Service");
  const [date, setDate] = useState(nextSunday);
  const [translation, setTranslation] = useState(profile?.default_translation || DEFAULT_TRANSLATION);

  useEffect(() => {
    listServices()
      .then(setServices)
      .catch((error) => {
        setServices([]);
        toast.error("Could not load your services", { description: error.message });
      });
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const id = await createService({ title, serviceDate: date || null, defaultTranslationId: translation });
      navigate(`/dashboard/services/${id}`);
    } catch (error) {
      toast.error("Could not create the service", { description: (error as Error).message });
      setCreating(false);
    }
  };

  return (
    <div className="app-shell">
      <ServicesHeader backTo="/dashboard" backLabel="Dashboard" />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-foreground">Services</h1>
            <p className="text-muted-foreground mt-1">
              Put your sermon, scripture readings, and logo screens in order, then present the whole service from here.
            </p>
          </div>
          <Button variant="hero" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            New Service
          </Button>
        </div>

        {services === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : services.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MonitorPlay className="w-8 h-8 mx-auto text-primary mb-3" />
              <p className="font-medium text-foreground">No services yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-5">Create one for this Sunday to get started.</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" />
                New Service
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {services.map((s) => (
              <li key={s.id}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <Link to={`/dashboard/services/${s.id}`} className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{s.title}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {s.serviceDate ? formatDateOnlyForDisplay(s.serviceDate) : "No date"}
                      </p>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/present/${s.id}`)}>
                      <MonitorPlay className="w-4 h-4" />
                      Present
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={showCreate} onOpenChange={(open) => !creating && setShowCreate(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New service</DialogTitle>
            <DialogDescription>You can add your sermon and readings next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="service-title">Name</Label>
              <Input id="service-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-date">Date</Label>
              <Input id="service-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bible translation</Label>
              <TranslationSelect value={translation} onChange={(v) => setTranslation(v ?? DEFAULT_TRANSLATION)} />
              <p className="text-xs text-muted-foreground">Used for readings unless you pick a different one.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !title.trim()}>
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Services;
