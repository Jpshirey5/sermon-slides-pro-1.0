import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface PickerOption {
  id: string;
  title: string;
  detail?: string;
}

interface PickerDialogProps {
  open: boolean;
  title: string;
  description: string;
  options: PickerOption[] | null;
  emptyText: string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** Extra action under the list, for example "New song". */
  footer?: ReactNode;
}

/** A searchable list for picking a sermon or a song. */
export function PickerDialog({ open, title, description, options, emptyText, onPick, onClose, footer }: PickerDialogProps) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const q = query.trim().toLowerCase();
  const shown = (options ?? []).filter((o) => !q || o.title.toLowerCase().includes(q) || o.detail?.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search" placeholder="Search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="-mx-2 max-h-80 overflow-y-auto">
          {options === null ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{options.length === 0 ? emptyText : "Nothing matches that search."}</p>
          ) : (
            shown.map((o) => (
              <button
                key={o.id}
                type="button"
                className="w-full rounded-md px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => onPick(o.id)}
              >
                <p className="font-medium text-foreground">{o.title}</p>
                {o.detail && <p className="text-xs text-muted-foreground">{o.detail}</p>}
              </button>
            ))
          )}
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
