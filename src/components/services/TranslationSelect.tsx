import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { getAvailableTranslations } from "@/lib/translations";

interface TranslationSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Adds a "use the service default" choice, stored as null. */
  allowDefault?: boolean;
  id?: string;
}

const DEFAULT_VALUE = "__service_default__";

export function TranslationSelect({ value, onChange, allowDefault = false, id }: TranslationSelectProps) {
  const { canUseEsv } = useAuth();
  const options = getAvailableTranslations(canUseEsv);
  return (
    <Select value={value ?? DEFAULT_VALUE} onValueChange={(v) => onChange(v === DEFAULT_VALUE ? null : v)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowDefault && <SelectItem value={DEFAULT_VALUE}>Service default</SelectItem>}
        {options.map((t) => (
          <SelectItem key={t.code} value={t.code}>
            {t.code} · {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
