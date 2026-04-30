import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  IDLE_TIMEOUT_MS,
  WARNING_MS,
  STORAGE_LAST_ACTIVITY_KEY,
  STORAGE_FORCED_LOGOUT_KEY,
  resetSessionInactivityTracking,
  setStoredLogoutReason,
} from "@/lib/session-security";

const SessionTimeoutManager = () => {
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(WARNING_MS / 1000));
  const lastActivityRef = useRef(Date.now());
  const lastRecordedRef = useRef(0);
  const loggingOutRef = useRef(false);
  const locationPathRef = useRef(location.pathname);

  useEffect(() => {
    if (!userId) {
      setWarningOpen(false);
      setSecondsRemaining(Math.ceil(WARNING_MS / 1000));
      loggingOutRef.current = false;
      return;
    }

    const now = resetSessionInactivityTracking();
    lastRecordedRef.current = now;
    lastActivityRef.current = now;
    loggingOutRef.current = false;
    setWarningOpen(false);
    setSecondsRemaining(Math.ceil(WARNING_MS / 1000));
  }, [userId]);

  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!userId) return;

    const getRemainingMs = () => IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current);

    const signOutForInactivity = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      setWarningOpen(false);
      setStoredLogoutReason("inactive");
      localStorage.setItem(STORAGE_FORCED_LOGOUT_KEY, String(Date.now()));
      await signOut({ userInitiated: false });
      navigate("/login?reason=inactive", { replace: true, state: { from: locationPathRef.current } });
    };

    const recordActivity = () => {
      if (loggingOutRef.current) return;
      if (getRemainingMs() <= 0) {
        void signOutForInactivity();
        return;
      }

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
        setStoredLogoutReason("inactive");
        await signOut({ userInitiated: false });
        navigate("/login?reason=inactive", { replace: true, state: { from: locationPathRef.current } });
      }
    };

    const events: Array<keyof WindowEventMap> = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "focus"];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("storage", handleStorage);

    const interval = window.setInterval(async () => {
      const remainingMs = getRemainingMs();

      if (remainingMs <= WARNING_MS && remainingMs > 0) {
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
        setWarningOpen(true);
      }

      if (remainingMs <= 0) {
        await signOutForInactivity();
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
    };
  }, [navigate, signOut, userId]);

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
            For security, your session will expire in {secondsRemaining} seconds unless you choose to stay signed in.
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
