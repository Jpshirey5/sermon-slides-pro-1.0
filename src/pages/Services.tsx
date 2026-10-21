import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, LayoutTemplate, ListMusic, Loader2, MonitorPlay, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createService, createServiceFromTemplate, deleteService, listServices, listTemplates, type ServiceSummary } from "@/lib/services";
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
  const [templates, setTemplates] = useState<ServiceSummary[]>([]);
  const [startFrom, setStartFrom] = useState<string>("new");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Sunday Service");
  const [date, setDate] = useState(nextSunday);
  const [translation, setTranslation] = useState(profile?.default_translation || DEFAULT_TRANSLATION);
  const [deleting, setDeleting] = useState<ServiceSummary | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  useEffect(() => {
    listServices()
      .then(setServices)
      .catch((error) => {
        setServices([]);
        toast.error("Could not load your services", { description: error.message });
      });
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const input = { title, serviceDate: date || null, defaultTranslationId: translation };
      const id = startFrom === "new" ? await createService(input) : await createServiceFromTemplate(startFrom, input);
      navigate(`/dashboard/services/${id}`);
    } catch (error) {
      toast.error("Could not create the service", { description: (error as Error).message });
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteService(deleting.id);
      setServices((list) => list?.filter((s) => s.id !== deleting.id) ?? null);
      setTemplates((list) => list.filter((s) => s.id !== deleting.id));
      if (startFrom === deleting.id) setStartFrom("new");
      toast.success(`Deleted "${deleting.title}"`);
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete the service", { description: (error as Error).message });
    } finally {
      setDeletingBusy(false);
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
              Put your sermon, songs, readings, and logo screens in order, then run the whole service from here.
            </p>
          </div>
          <div className="flex gap-2">
          <Link to="/dashboard/songs">
            <Button variant="outline">
              <ListMusic className="w-4 h-4" />
              Songs
            </Button>
          </Link>
          <Button variant="hero" onClick={() => { setStartFrom("new"); setShowCreate(true); }}>
            <Plus className="w-4 h-4" />
            New Service
          </Button>
          </div>
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
                    <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/services/${s.id}`)}>
                      <MonitorPlay className="w-4 h-4" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting(s)}
                      aria-label={`Delete ${s.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {templates.length > 0 && (
          <section className="mt-10" aria-labelledby="templates-heading">
            <h2 id="templates-heading" className="font-serif text-xl font-semibold text-foreground">Templates</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Pick one under New Service to start with the same order. Sermons and songs start empty so you can choose this week's.
            </p>
            <ul className="space-y-3">
              {templates.map((t) => (
                <li key={t.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <p className="flex min-w-0 flex-1 items-center gap-2 font-medium text-foreground">
                        <LayoutTemplate className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{t.title}</span>
                      </p>
                      <Button variant="outline" size="sm" onClick={() => { setStartFrom(t.id); setTitle("Sunday Service"); setShowCreate(true); }}>
                        <Plus className="w-4 h-4" />
                        Use
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/dashboard/services/${t.id}`)}>
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(t)}
                        aria-label={`Delete template ${t.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !deletingBusy && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleting?.isTemplate ? "Delete this template?" : "Delete this service?"}</DialogTitle>
            <DialogDescription>
              {deleting?.isTemplate
                ? `"${deleting?.title}" will be removed. Services you already made from it stay. This can't be undone.`
                : `"${deleting?.title}" and its order of items will be removed. This can't be undone. Your sermons, songs, and videos stay in your library.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingBusy}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingBusy}>
              {deletingBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleting?.isTemplate ? "Delete template" : "Delete service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={(open) => !creating && setShowCreate(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New service</DialogTitle>
            <DialogDescription>
              {startFrom === "new" ? "You can add your sermon, songs, and slides next." : "Same order as the template. Pick this week's sermon and songs next."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="service-start">Start from</Label>
                <Select value={startFrom} onValueChange={setStartFrom}>
                  <SelectTrigger id="service-start"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New blank service</SelectItem>
                    {templates.map((t) => <SelectItem key={t.id} value={t.id}>Template: {t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
