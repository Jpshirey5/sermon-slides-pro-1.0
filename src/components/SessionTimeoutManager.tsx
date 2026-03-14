import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 10 * 1000;
const STORAGE_LAST_ACTIVITY_KEY = "ssp_last_activity_at";
const STORAGE_FORCED_LOGOUT_KEY = "ssp_forced_logout_at";

const SessionTimeoutManager = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(WARNING_MS / 1000));
  const lastActivityRef = useRef(Date.now());
  const lastRecordedRef = useRef(0);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setWarningOpen(false);
      loggingOutRef.current = false;
      return;
    }

    const storedActivity = Number(localStorage.getItem(STORAGE_LAST_ACTIVITY_KEY));
    const initialActivity = Number.isFinite(storedActivity) && storedActivity > 0 ? storedActivity : Date.now();
    lastActivityRef.current = initialActivity;
    localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, String(initialActivity));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecordedRef.current < 1000) return;
      lastRecordedRef.current = now;
      lastActivityRef.current = now;
      localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, String(now));
      setWarningOpen(false);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        recordActivity();
      }
    };

    const handleStorage = async (event: StorageEvent) => {
      if (event.key === STORAGE_LAST_ACTIVITY_KEY && event.newValue) {
        const nextValue = Number(event.newValue);
        if (Number.isFinite(nextValue)) {
          lastActivityRef.current = nextValue;
          setWarningOpen(false);
        }
      }

      if (event.key === STORAGE_FORCED_LOGOUT_KEY && event.newValue && !loggingOutRef.current) {
        loggingOutRef.current = true;
        await signOut();
        navigate("/login?reason=inactive", { replace: true, state: { from: location.pathname } });
      }
    };

    const events: Array<keyof WindowEventMap> = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "focus"];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("storage", handleStorage);

    const interval = window.setInterval(async () => {
      const remainingMs = IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current);

      if (remainingMs <= WARNING_MS && remainingMs > 0) {
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
        setWarningOpen(true);
      }

      if (remainingMs <= 0 && !loggingOutRef.current) {
        loggingOutRef.current = true;
        localStorage.setItem(STORAGE_FORCED_LOGOUT_KEY, String(Date.now()));
        await signOut();
        navigate("/login?reason=inactive", { replace: true, state: { from: location.pathname } });
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
    };
  }, [location.pathname, navigate, signOut, user]);

  const handleStaySignedIn = () => {
    const now = Date.now();
    lastRecordedRef.current = now;
    lastActivityRef.current = now;
    localStorage.setItem(STORAGE_LAST_ACTIVITY_KEY, String(now));
    setWarningOpen(false);
  };

  return (
    <AlertDialog open={warningOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            For security, you will be signed out in {secondsRemaining} seconds unless you choose to stay signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleStaySignedIn}>Stay Signed In</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default SessionTimeoutManager;
