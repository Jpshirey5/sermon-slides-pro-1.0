import { Progress } from "@/components/ui/progress";
import { formatFinancialCurrency, type FinancialBucket } from "@/hooks/useFinancialData";

type BucketCardProps = {
  bucket: FinancialBucket;
};

const BucketCard = ({ bucket }: BucketCardProps) => {
  return (
    <div className="rounded-2xl border border-border/70 bg-white/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{bucket.label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatFinancialCurrency(bucket.amountCents)}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {bucket.allocationPercent}%
        </span>
      </div>

      <Progress value={bucket.allocationPercent} className="mt-4 h-2.5 bg-primary/10 [&>div]:bg-primary" />

      <p className="mt-3 text-xs text-muted-foreground">
        Allocation target: {bucket.allocationPercent}% of monthly income.
      </p>
    </div>
  );
};

export default BucketCard;

