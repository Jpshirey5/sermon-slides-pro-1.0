import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, ArrowRight } from "lucide-react";

interface StructuredBuilderInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StructuredBuilderInfoModal = ({ open, onOpenChange }: StructuredBuilderInfoModalProps) => {
  const navigate = useNavigate();

  const handleSignUp = () => {
    onOpenChange(false);
    navigate("/signup");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-2">
            <FileText className="w-6 h-6 text-foreground" />
          </div>
          <DialogTitle className="font-serif text-2xl">
            You're in the Structured Builder
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          The Structured Builder is our manual building tool — add your points and
          scripture references one at a time for full control over every slide. Pay
          only when you're ready to export.
        </p>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold">Want AI to do the work?</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Our AI Quick Build extracts your points and scripture automatically from
            an uploaded manuscript. It's available when you subscribe and sign up for
            an account.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end pt-2">
          <Button variant="hero" onClick={() => onOpenChange(false)}>
            Continue Building
          </Button>
          <Button variant="outline" onClick={handleSignUp}>
            Unlock AI Quick Build
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StructuredBuilderInfoModal;
