import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const PENDING_SERMON_KEY = "pending_payment_sermon_id";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read the pending presentation ID from localStorage
    const pendingSermonId = localStorage.getItem(PENDING_SERMON_KEY);

    if (pendingSermonId) {
      // Clear the pending key
      localStorage.removeItem(PENDING_SERMON_KEY);
      
      // Redirect to the editor with payment success parameter
      navigate(`/editor/${pendingSermonId}?payment=success`, { replace: true });
    } else {
      // No pending sermon found - show error or redirect home
      setError("Could not find your presentation. Please return to your editor manually.");
      
      // Auto-redirect to home after 3 seconds
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 3000);
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">Redirecting to home...</p>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Payment successful! Redirecting to your presentation...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
