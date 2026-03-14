import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  default_translation: string | null;
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
  billing_interval: "month" | "year" | null;
  plan_label: string | null;
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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    subscription_end: null,
    cancel_at_period_end: false,
    subscription_status: null,
  });

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
    setAccountId(data || null);
  };

  const checkSubscription = useCallback(async () => {
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
          subscription_end: data.subscription_end || null,
          cancel_at_period_end: data.cancel_at_period_end || false,
          subscription_status: data.subscription_status || null,
        });
      }
    } catch (err) {
      console.error("Error checking subscription:", err);
    } finally {
      setSubscriptionChecked(true);
    }
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
      await fetchAccountId(user.id);
      await checkSubscription();
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setAccountId(null);
    setSubscriptionChecked(false);
    setSubscription({
      subscribed: false,
      product_id: null,
      price_id: null,
      billing_interval: null,
      plan_label: null,
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
          setSubscriptionChecked(false);
          setSubscription({
            subscribed: false,
            product_id: null,
            price_id: null,
            billing_interval: null,
            plan_label: null,
            subscription_end: null,
            cancel_at_period_end: false,
            subscription_status: null,
          });
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setAccountId(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        fetchProfile(initialSession.user.id);
        fetchAccountId(initialSession.user.id);
        checkSubscription();
      } else {
      setSubscriptionChecked(true);
      }
      setLoading(false);
    });

    return () => authSub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(checkSubscription, 60000);
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
