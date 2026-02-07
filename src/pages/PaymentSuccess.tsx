import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Get the sermon ID that was pending payment
    const sermonId = localStorage.getItem('pending_payment_sermon_id');
    
    if (sermonId) {
      // Unlock export for this presentation
      localStorage.setItem(`export_unlocked:${sermonId}`, "true");
      // Clear the pending flag
      localStorage.removeItem('pending_payment_sermon_id');
    }
  }, []);
  
  const handleContinue = () => {
    const sermonId = localStorage.getItem('pending_payment_sermon_id');
    if (sermonId) {
      navigate(`/editor/${sermonId}?payment=success`);
    } else {
      // Check if we already unlocked it
      const keys = Object.keys(localStorage);
      const unlockedKey = keys.find(k => k.startsWith('export_unlocked:'));
      if (unlockedKey) {
        const id = unlockedKey.replace('export_unlocked:', '');
        navigate(`/editor/${id}`);
      } else {
        navigate('/');
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-serif">Payment Successful!</h1>
          <p className="text-muted-foreground">
            Thank you for your purchase. Your presentation export has been unlocked.
          </p>
        </div>
        
        <Button onClick={handleContinue} variant="hero" size="lg">
          Continue to Export
        </Button>
      </div>
    </div>
  );
};

export default PaymentSuccess;
