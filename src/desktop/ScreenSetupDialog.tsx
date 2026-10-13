import { useEffect, useState } from "react";
import { Loader2, MonitorUp, ScanEye, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PresenterWindowKind, ScreenSetup, SspDesktop } from "./bridge";

const NONE = "none";

interface ScreenSetupDialogProps {
  desktop: SspDesktop;
  open: boolean;
  onClose: () => void;
}

/** Screens > Set Up Screens: pick which plugged-in screen is the main screen and which is the stage display. */
export function ScreenSetupDialog({ desktop, open, onClose }: ScreenSetupDialogProps) {
  const [setup, setSetup] = useState<ScreenSetup | null>(null);

  useEffect(() => {
    if (!open) return;
    setSetup(null);
    void desktop.screens.get().then(setSetup);
    return desktop.screens.onChanged(() => void desktop.screens.get().then(setSetup));
  }, [open, desktop]);

  const choose = async (kind: PresenterWindowKind, value: string) => {
    const next = await desktop.screens.set(kind, value === NONE ? null : value);
    if (next) setSetup(next);
  };

  const row = (kind: PresenterWindowKind) => {
    if (!setup) return null;
    const entry = setup[kind];
    const missing = entry.saved && !entry.connectedId;
    const Icon = kind === "main" ? MonitorUp : Tv;
    const title = kind === "main" ? "Main screen" : "Stage display";
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`screen-${kind}`} className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </Label>
        <Select value={entry.connectedId ?? NONE} onValueChange={(v) => void choose(kind, v)}>
          <SelectTrigger id={`screen-${kind}`} aria-label={title}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Ask me each time</SelectItem>
            {setup.displays.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label} ({d.width} x {d.height}){d.isCurrent ? ", this screen" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {missing && (
          <p className="text-xs text-amber-600">
            Saved as {entry.saved!.label}, which isn't plugged in right now. Plug it in, or pick another screen.
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up screens</DialogTitle>
          <DialogDescription>
            Pick the screen for each output. This is saved on this computer, so Main screen and Stage display open in the right place every time.
          </DialogDescription>
        </DialogHeader>
        {!setup ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4 py-1">
            {row("main")}
            {row("stage")}
            {setup.displays.length < 2 && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Only one screen is connected. If a TV or projector is plugged in, check that your computer is set to extend
                the displays, not mirror them. Mirrored screens show the same picture and count as one.
              </p>
            )}
            {setup.displays.length === 2 && (
              <p className="text-xs text-muted-foreground">
                Two screens are connected, counting this one. For both a main screen and a stage display, you need a third.
              </p>
            )}
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => void desktop.screens.identify()}>
            <ScanEye className="h-4 w-4" /> Identify screens
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
