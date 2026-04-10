import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearResolvedAccountAccess,
  ensureResolvedAccountAccess,
  setResolvedAccountAccess,
} from "@/lib/account-access";
import {
  clearStoredLogoutReason,
  getStoredLogoutReason,
  setStoredLogoutReason,
} from "@/lib/session-security";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  default_translation: string | null;
  preferred_dashboard_campus_id: string | null;
  plan_tier: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  avatar_url: string | null;
}

interface SubscriptionInfo {
  subscribed: boolean;
  product_id: string | null;
  price_id: string | null;
  billing_interval: "monthly" | "annual" | null;
  plan_label: string | null;
  plan_tier: string | null;
  subscription_end: string | null;
  cancel_at_period_end: boolean;
  subscription_status: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  subscription: SubscriptionInfo;
  subscriptionChecked: boolean;
  accountId: string | null;
  signOut: (options?: { userInitiated?: boolean }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SUBSCRIPTION_FALLBACK_REFRESH_MS = 6 * 60 * 60 * 1000;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    subscribed: false,
    product_id: null,
    price_id: null,
    billing_interval: null,
    plan_label: null,
    plan_tier: null,
    subscription_end: null,
    cancel_at_period_end: false,
    subscription_status: null,
  });
  const userInitiatedSignOutRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const pendingSubscriptionCheckRef = useRef<Promise<void> | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setProfile(data as unknown as Profile);
    }
  };

  const fetchAccountId = async (userId: string) => {
    const { data } = await supabase.rpc('get_user_account_id', { _user_id: userId });
    const nextAccountId = data || null;
    setAccountId(nextAccountId);
    setResolvedAccountAccess({ userId, accountId: nextAccountId });
    return nextAccountId;
  };

  const checkSubscription = useCallback(async () => {
    if (pendingSubscriptionCheckRef.current) {
      return pendingSubscriptionCheckRef.current;
    }

    pendingSubscriptionCheckRef.current = (async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) {
          setSubscriptionChecked(true);
          return;
        }

        const { data, error } = await supabase.functions.invoke("check-subscription", {
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        });

        if (!error && data) {
          setSubscription({
            subscribed: data.subscribed || false,
            product_id: data.product_id || null,
            price_id: data.price_id || null,
            billing_interval: data.billing_interval || null,
            plan_label: data.plan_label || null,
            plan_tier: data.plan_tier || null,
            subscription_end: data.subscription_end || null,
            cancel_at_period_end: data.cancel_at_period_end || false,
            subscription_status: data.subscription_status || null,
          });
        }
      } catch (err) {
        console.error("Error checking subscription:", err);
      } finally {
        setSubscriptionChecked(true);
        pendingSubscriptionCheckRef.current = null;
      }
    })();

    return pendingSubscriptionCheckRef.current;
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
      const access = await ensureResolvedAccountAccess();
      setAccountId(access.accountId);
      setResolvedAccountAccess({ userId: user.id, accountId: access.accountId });
      await checkSubscription();
    }
  };

  const signOut = async (options?: { userInitiated?: boolean }) => {
    const userInitiated = options?.userInitiated ?? true;
    userInitiatedSignOutRef.current = userInitiated;
    if (userInitiated) {
      clearStoredLogoutReason();
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setAccountId(null);
    clearResolvedAccountAccess();
    setSubscriptionChecked(false);
    setSubscription({
      subscribed: false,
      product_id: null,
      price_id: null,
      billing_interval: null,
      plan_label: null,
      plan_tier: null,
      subscription_end: null,
      cancel_at_period_end: false,
      subscription_status: null,
    });
  };

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setTimeout(() => {
            fetchProfile(newSession.user.id);
            fetchAccountId(newSession.user.id);
            checkSubscription();
          }, 0);
        } else {
          setProfile(null);
          setAccountId(null);
          clearResolvedAccountAccess();
          setSubscriptionChecked(false);
          setSubscription({
            subscribed: false,
            product_id: null,
            price_id: null,
            billing_interval: null,
            plan_label: null,
            plan_tier: null,
            subscription_end: null,
            cancel_at_period_end: false,
            subscription_status: null,
          });
        }

        if (event === "SIGNED_OUT") {
          if (lastUserIdRef.current && !userInitiatedSignOutRef.current && !getStoredLogoutReason()) {
            setStoredLogoutReason("security");
          }
          setProfile(null);
          setAccountId(null);
          clearResolvedAccountAccess();
          lastUserIdRef.current = null;
          userInitiatedSignOutRef.current = false;
        } else if (newSession?.user?.id) {
          lastUserIdRef.current = newSession.user.id;
          userInitiatedSignOutRef.current = false;
          setResolvedAccountAccess({
            userId: newSession.user.id,
            accountId: null,
          });
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        lastUserIdRef.current = initialSession.user.id;
        setResolvedAccountAccess({
          userId: initialSession.user.id,
          accountId: null,
        });
        fetchProfile(initialSession.user.id);
        fetchAccountId(initialSession.user.id);
        checkSubscription();
      } else {
        lastUserIdRef.current = null;
        clearResolvedAccountAccess();
        setSubscriptionChecked(true);
      }
      setLoading(false);
    });

    return () => authSub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void checkSubscription();
    }, SUBSCRIPTION_FALLBACK_REFRESH_MS);
    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, subscription, subscriptionChecked, accountId, signOut, refreshProfile, checkSubscription }}
    >
      {children}
    </AuthContext.Provider>
  );
};
