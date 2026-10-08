import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Image as ImageIcon,
  Loader2,
  MonitorPlay,
  Pencil,
  Plus,
  Presentation,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ServicesHeader } from "@/components/services/ServicesHeader";
import { TranslationSelect } from "@/components/services/TranslationSelect";
import { formatDateOnlyForDisplay } from "@/lib/date-format";
import {
  addServiceItem,
  deleteService,
  describeScripture,
  formatReference,
  getService,
  listSermonOptions,
  moveItem,
  parseReferenceList,
  readScripturePayload,
  removeServiceItem,
  reorderServiceItems,
  type ScriptureLayout,
  type SermonOption,
  type ServiceDetail,
  type ServiceItem,
  updateService,
  updateServiceItem,
} from "@/lib/services";

const ITEM_ICON = { sermon: Presentation, scripture: BookOpen, blank: Square, logo: ImageIcon } as const;

interface ScriptureDraft {
  itemId: string | null;
  text: string;
  translation: string | null;
  layout: ScriptureLayout;
}

const ServiceBuilder = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceDetail | null | undefined>(undefined);
  const [sermons, setSermons] = useState<SermonOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [showSermonPicker, setShowSermonPicker] = useState(false);
  const [scriptureDraft, setScriptureDraft] = useState<ScriptureDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = useCallback(async () => {
    try {
      const next = await getService(id);
      setService(next);
      if (next) setTitle(next.title);
    } catch (error) {
      toast.error("Could not load the service", { description: (error as Error).message });
      setService(null);
    }
  }, [id]);

  useEffect(() => {
    void reload();
    listSermonOptions().then(setSermons).catch(() => setSermons([]));
  }, [reload]);

  const sermonTitles = useMemo(() => new Map(sermons.map((s) => [s.id, s.title])), [sermons]);

  /** Run a change, then reload. One at a time, so quick clicks cannot interleave. */
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (error) {
      toast.error(label, { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (service === undefined) {
    return (
      <div className="app-shell">
        <ServicesHeader backTo="/dashboard/services" backLabel="Services" />
        <div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      </div>
    );
  }

  if (service === null) {
    return (
      <div className="app-shell">
        <ServicesHeader backTo="/dashboard/services" backLabel="Services" />
        <main className="container mx-auto px-4 py-16 max-w-xl text-center">
          <p className="font-medium text-foreground">We could not find that service.</p>
          <p className="text-sm text-muted-foreground mt-1">It may have been deleted, or it belongs to another church.</p>
        </main>
      </div>
    );
  }

  const describe = (item: ServiceItem): { title: string; detail: string } => {
    switch (item.type) {
      case "sermon":
        return {
          title: item.label || (item.sermonId ? sermonTitles.get(item.sermonId) : null) || "Sermon",
          detail: item.sermonId ? "Sermon slides" : "This sermon was deleted",
        };
      case "scripture": {
        const p = readScripturePayload(item.payload);
        const translation = p.translation_id || service.defaultTranslationId || "default";
        return { title: item.label || describeScripture(item.payload), detail: `Scripture · ${translation} · ${p.layout === "verse_by_verse" ? "one verse per slide" : "full passage"}` };
      }
      case "logo":
        return { title: item.label || "Logo screen", detail: "Shows your church logo" };
      default:
        return { title: item.label || "Black screen", detail: "Nothing on screen" };
    }
  };

  const ids = service.items.map((i) => i.id);
  const draftParse = scriptureDraft ? parseReferenceList(scriptureDraft.text) : null;

  const saveScripture = () => {
    if (!scriptureDraft || !draftParse || draftParse.passages.length === 0 || draftParse.unreadable.length > 0) return;
    const payload = { passages: draftParse.passages, translation_id: scriptureDraft.translation, layout: scriptureDraft.layout };
    const draft = scriptureDraft;
    setScriptureDraft(null);
    void run("Could not save the reading", () =>
      draft.itemId ? updateServiceItem(draft.itemId, { payload }) : addServiceItem(service, { type: "scripture", payload }));
  };

  return (
    <div className="app-shell">
      <ServicesHeader backTo="/dashboard/services" backLabel="Services" />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="min-w-0 flex-1 space-y-3">
            <Input
              aria-label="Service name"
              className="font-serif text-2xl font-semibold h-auto py-1 border-transparent hover:border-input focus:border-input px-2 -ml-2"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() && title.trim() !== service.title) void run("Could not rename the service", () => updateService(service.id, { title }));
                else setTitle(service.title);
              }}
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="builder-date" className="text-xs text-muted-foreground">Date</Label>
                <Input
                  id="builder-date"
                  type="date"
                  className="w-44"
                  value={service.serviceDate ?? ""}
                  onChange={(e) => void run("Could not change the date", () => updateService(service.id, { serviceDate: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1 w-64">
                <Label htmlFor="builder-translation" className="text-xs text-muted-foreground">Default translation</Label>
                <TranslationSelect
                  id="builder-translation"
                  value={service.defaultTranslationId}
                  onChange={(v) => void run("Could not change the translation", () => updateService(service.id, { defaultTranslationId: v }))}
                />
              </div>
            </div>
          </div>
          <Button variant="hero" size="lg" onClick={() => navigate(`/present/${service.id}`)} disabled={service.items.length === 0}>
            <MonitorPlay className="w-5 h-5" />
            Present
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {service.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Add your sermon, readings, and logo or black screens below.</p>
            ) : (
              <ol className="divide-y divide-border">
                {service.items.map((item, index) => {
                  const Icon = ITEM_ICON[item.type] ?? Square;
                  const { title: itemTitle, detail } = describe(item);
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{itemTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">{detail}</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {item.type === "scripture" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit reading"
                            disabled={busy}
                            onClick={() => {
                              const p = readScripturePayload(item.payload);
                              setScriptureDraft({ itemId: item.id, text: p.passages.map(formatReference).join("; "), translation: p.translation_id, layout: p.layout });
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Move up" disabled={busy || index === 0}
                          onClick={() => void run("Could not move the item", () => reorderServiceItems(service.id, moveItem(ids, index, -1)))}>
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Move down" disabled={busy || index === ids.length - 1}
                          onClick={() => void run("Could not move the item", () => reorderServiceItems(service.id, moveItem(ids, index, 1)))}>
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Remove" disabled={busy}
                          onClick={() => void run("Could not remove the item", () => removeServiceItem(item.id))}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="outline" disabled={busy} onClick={() => setShowSermonPicker(true)}>
            <Plus className="w-4 h-4" /> Sermon
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setScriptureDraft({ itemId: null, text: "", translation: null, layout: "passage" })}>
            <Plus className="w-4 h-4" /> Reading
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void run("Could not add the item", () => addServiceItem(service, { type: "logo" }))}>
            <Plus className="w-4 h-4" /> Logo screen
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void run("Could not add the item", () => addServiceItem(service, { type: "blank" }))}>
            <Plus className="w-4 h-4" /> Black screen
          </Button>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" /> Delete this service
          </Button>
        </div>
      </main>

      <Dialog open={showSermonPicker} onOpenChange={setShowSermonPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a sermon</DialogTitle>
            <DialogDescription>Its slides play in the order you built them.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto -mx-2">
            {sermons.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-6 text-center">You have no sermons yet. Create one from the dashboard first.</p>
            ) : (
              sermons.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left rounded-md px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none"
                  onClick={() => {
                    setShowSermonPicker(false);
                    void run("Could not add the sermon", () => addServiceItem(service, { type: "sermon", sermonId: s.id }));
                  }}
                >
                  <p className="font-medium text-foreground">{s.title}</p>
                  {s.presentationDate && <p className="text-xs text-muted-foreground">{formatDateOnlyForDisplay(s.presentationDate)}</p>}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scriptureDraft !== null} onOpenChange={(open) => !open && setScriptureDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{scriptureDraft?.itemId ? "Edit reading" : "Add a reading"}</DialogTitle>
            <DialogDescription>We fetch the text when you present, so it is always current.</DialogDescription>
          </DialogHeader>
          {scriptureDraft && draftParse && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reading-refs">References</Label>
                <Textarea
                  id="reading-refs"
                  rows={3}
                  placeholder="John 3:16-18; Romans 8:28"
                  value={scriptureDraft.text}
                  onChange={(e) => setScriptureDraft({ ...scriptureDraft, text: e.target.value })}
                />
                {draftParse.unreadable.length > 0 ? (
                  <p className="text-xs text-destructive">We could not read: {draftParse.unreadable.join("; ")}. Try a form like John 3:16-18.</p>
                ) : draftParse.passages.length > 0 ? (
                  <p className="text-xs text-muted-foreground">{draftParse.passages.map(formatReference).join("; ")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">One passage per line, or separate them with semicolons.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Translation</Label>
                <TranslationSelect allowDefault value={scriptureDraft.translation} onChange={(v) => setScriptureDraft({ ...scriptureDraft, translation: v })} />
              </div>
              <div className="space-y-2">
                <Label>Slides</Label>
                <RadioGroup
                  value={scriptureDraft.layout}
                  onValueChange={(v) => setScriptureDraft({ ...scriptureDraft, layout: v as ScriptureLayout })}
                  className="grid gap-2"
                >
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="passage" /> Full passage</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="verse_by_verse" /> One verse per slide</label>
                </RadioGroup>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScriptureDraft(null)}>Cancel</Button>
            <Button onClick={saveScripture} disabled={!draftParse || draftParse.passages.length === 0 || draftParse.unreadable.length > 0}>
              {scriptureDraft?.itemId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this service?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the service and its order. Your sermons are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteService(service.id);
                  navigate("/dashboard/services");
                } catch (error) {
                  toast.error("Could not delete the service", { description: (error as Error).message });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ServiceBuilder;
