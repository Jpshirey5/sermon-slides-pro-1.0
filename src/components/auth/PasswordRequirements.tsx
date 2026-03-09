import { CheckCircle2, Circle } from "lucide-react";
import { getPasswordChecks } from "@/lib/password";

interface PasswordRequirementsProps {
  password: string;
}

const PasswordRequirements = ({ password }: PasswordRequirementsProps) => {
  const checks = getPasswordChecks(password);

  return (
    <div className="rounded-lg border border-border/70 bg-white/60 p-3">
      <p className="text-xs font-medium text-foreground mb-2">Password requirements</p>
      <div className="space-y-1.5">
        {checks.map((check) => (
          <div key={check.id} className="flex items-center gap-2 text-xs">
            {check.met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className={check.met ? "text-green-700" : "text-muted-foreground"}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordRequirements;
