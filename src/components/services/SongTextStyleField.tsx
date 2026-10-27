import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SLIDE_FONTS } from "@/lib/fonts";
import type { SongTextStyle } from "@/lib/songs";

const INHERIT = "inherit";

export const POSITION_LABELS = { top: "Upper third", center: "Center", bottom: "Lower third" } as const;
const SIZE_LABELS = { auto: "Fit the song", small: "Small", medium: "Medium", large: "Large", xlarge: "Extra large" } as const;

interface SongTextStyleFieldProps {
  idPrefix: string;
  value: SongTextStyle;
  onChange: (next: SongTextStyle) => void;
  /** What an unset choice falls back to, e.g. "Church default" or "Default". */
  inheritLabel: string;
}

/** Font, size, color, and position for song words. Every slide of a song uses the same settings. */
export function SongTextStyleField({ idPrefix, value, onChange, inheritLabel }: SongTextStyleFieldProps) {
  const set = <K extends keyof SongTextStyle>(key: K, v: string) => {
    const next = { ...value };
    if (v === INHERIT) delete next[key];
    else next[key] = v as SongTextStyle[K];
    onChange(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-font`}>Font</Label>
        <Select value={value.fontFamily ?? INHERIT} onValueChange={(v) => set("fontFamily", v)}>
          <SelectTrigger id={`${idPrefix}-font`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>
            {SLIDE_FONTS.map((f) => <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-size`}>Size</Label>
        <Select value={value.size ?? INHERIT} onValueChange={(v) => set("size", v)}>
          <SelectTrigger id={`${idPrefix}-size`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>
            {(Object.keys(SIZE_LABELS) as Array<keyof typeof SIZE_LABELS>).map((k) => <SelectItem key={k} value={k}>{SIZE_LABELS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-position`}>Position</Label>
        <Select value={value.position ?? INHERIT} onValueChange={(v) => set("position", v)}>
          <SelectTrigger id={`${idPrefix}-position`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>
            {(Object.keys(POSITION_LABELS) as Array<keyof typeof POSITION_LABELS>).map((k) => <SelectItem key={k} value={k}>{POSITION_LABELS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-color`}>Text color</Label>
        <div className="flex items-center gap-2">
          <input
            id={`${idPrefix}-color`}
            type="color"
            value={value.textColor ?? "#ffffff"}
            onChange={(e) => set("textColor", e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent"
          />
          {value.textColor ? (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set("textColor", INHERIT)}>Use {inheritLabel.toLowerCase()}</button>
          ) : (
            <span className="text-xs text-muted-foreground">{inheritLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}
