import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatFinancialCurrency, type FinancialTransaction } from "@/hooks/useFinancialData";

type TransactionRowProps = {
  transaction: FinancialTransaction;
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const TransactionRow = ({ transaction }: TransactionRowProps) => {
  const isIncome = transaction.type === "income";

  return (
    <div className="grid gap-3 rounded-2xl border border-border/70 bg-white/65 px-4 py-3 sm:grid-cols-[minmax(0,1.5fr)_auto_auto_auto] sm:items-center">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-10 w-10 border border-border/60">
          <AvatarFallback
            className={cn(
              "text-xs font-semibold",
              isIncome ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700",
            )}
          >
            {getInitials(transaction.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{transaction.name}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(transaction.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="sm:justify-self-start">
        <Badge variant={transaction.status === "paid" ? "default" : "secondary"}>
          {transaction.status === "paid" ? "Paid" : "Pending"}
        </Badge>
      </div>

      <p className="text-sm font-medium text-muted-foreground capitalize">{transaction.type}</p>

      <p
        className={cn(
          "text-sm font-semibold sm:justify-self-end",
          isIncome ? "text-emerald-600" : "text-rose-600",
        )}
      >
        {isIncome ? "+" : "-"}
        {formatFinancialCurrency(transaction.amountCents)}
      </p>
    </div>
  );
};

export default TransactionRow;

