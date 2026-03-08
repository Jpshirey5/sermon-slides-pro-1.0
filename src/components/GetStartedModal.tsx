import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Crown, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GetStartedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GetStartedModal = ({ open, onOpenChange }: GetStartedModalProps) => {
  const navigate = useNavigate();
  const [proLoading, setProLoading] = useState(false);

  const handlePayPerSermon = () => {
    onOpenChange(false);
    navigate("/create");
  };

  const handleGoPro = async () => {
    setProLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-guest-checkout", {
        body: { origin: window.location.origin },
      });
      if (error || !data?.url) {
        toast.error("Could not start checkout. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setProLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="font-serif text-2xl text-center">
            How would you like to get started?
          </DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 p-6 pt-2">
          {/* Pay Per Sermon */}
          <button
            onClick={handlePayPerSermon}
            className="group relative flex flex-col items-center text-center rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-soft transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
              Pay Per Sermon
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create slides for free. Pay $9 only when you export.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
              Start Creating <ArrowRight className="w-4 h-4" />
            </span>
          </button>

          {/* Go Pro */}
          <button
            onClick={handleGoPro}
            disabled={proLoading}
            className="group relative flex flex-col items-center text-center rounded-xl border-2 border-primary bg-card p-6 hover:shadow-glow transition-all disabled:opacity-70"
          >
            <div className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
              Best Value
            </div>
            <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-4 shadow-glow">
              <Crown className="w-6 h-6 text-primary-foreground" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
              Go Pro
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              $30/month — unlimited exports, dashboard & more.
            </p>
            {proLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                Subscribe Now <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GetStartedModal;
