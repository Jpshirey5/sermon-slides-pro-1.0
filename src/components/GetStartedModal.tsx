import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Crown, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface GetStartedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GetStartedModal = ({ open, onOpenChange }: GetStartedModalProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [proLoading, setProLoading] = useState(false);

  const handlePayPerExport = () => {
    onOpenChange(false);
    navigate("/create");
  };

  const handleAccountSetup = () => {
    setProLoading(true);
    onOpenChange(false);
    navigate(user ? "/account" : "/signup");
    setProLoading(false);
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
          <button
            onClick={handlePayPerExport}
            className="group relative flex flex-col items-center text-center rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-soft transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-foreground" />
            </div>
            <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
              Pay Per Export
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your presentation first and pay only when you are ready to export.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
              Start Creating <ArrowRight className="w-4 h-4" />
            </span>
          </button>

          <button
            onClick={handleAccountSetup}
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
              Account Setup
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose Pro, Team, or Enterprise and unlock the full account experience.
            </p>
            {proLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                Continue <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GetStartedModal;
