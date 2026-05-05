import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatabaseZap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinancialIntegration } from "@/hooks/useFinancialData";

type ConnectCardProps = {
  integration: FinancialIntegration;
};

const ConnectCard = ({ integration }: ConnectCardProps) => {
  return (
    <div className="rounded-2xl border border-border/70 bg-white/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl border",
              integration.isConnected
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/60 bg-muted/60 text-muted-foreground",
            )}
          >
            <DatabaseZap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{integration.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{integration.description}</p>
          </div>
        </div>

        <Badge variant={integration.isConnected ? "default" : "secondary"}>
          {integration.isConnected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {integration.isConnected
            ? "Configuration detected. Live sync can be enabled through a secure server-backed integration."
            : "Connect this integration later without changing the Financials layout."}
        </p>
        <Button variant={integration.isConnected ? "outline" : "hero"} size="sm">
          {integration.isConnected ? "Manage" : "Connect"}
        </Button>
      </div>
    </div>
  );
};

export default ConnectCard;

