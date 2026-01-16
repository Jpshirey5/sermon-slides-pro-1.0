import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Stripe product/price IDs
export const STRIPE_CONFIG = {
  payPerSermon: {
    priceId: 'price_1SqEznP2Yr0z0IcsXrxP90T7',
    productId: 'prod_TnqhEey12IfCOF',
    price: 9,
  },
  unlimited: {
    priceId: 'price_1SqEzyP2Yr0z0IcsN8lN68kU',
    productId: 'prod_TnqhnQ7zEQScWe',
    price: 49,
  },
};

export type Tier = 'guest' | 'pay_per_sermon' | 'unlimited';

interface SubscriptionStatus {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
}

interface AccountInfo {
  id: string;
  name: string;
  subscriptionStatus: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  tier: Tier;
  subscriptionStatus: SubscriptionStatus;
  accountInfo: AccountInfo | null;
  isAccountOwner: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
  });
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [isAccountOwner, setIsAccountOwner] = useState(false);

  // Determine tier based on subscription status
  const tier: Tier = subscriptionStatus.subscribed ? 'unlimited' : user ? 'pay_per_sermon' : 'guest';

  // Check subscription status
  const checkSubscription = async () => {
    if (!session) {
      setSubscriptionStatus({ subscribed: false, productId: null, subscriptionEnd: null });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        return;
      }

      setSubscriptionStatus({
        subscribed: data?.subscribed || false,
        productId: data?.product_id || null,
        subscriptionEnd: data?.subscription_end || null,
      });
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  // Fetch account info
  const fetchAccountInfo = async () => {
    if (!user) {
      setAccountInfo(null);
      setIsAccountOwner(false);
      return;
    }

    try {
      // Get user's account via the secure function
      const { data: accountId } = await supabase.rpc('get_user_account_id', { _user_id: user.id });
      
      if (accountId) {
        // Check if user is owner
        const { data: isOwner } = await supabase.rpc('is_account_owner', { 
          _user_id: user.id, 
          _account_id: accountId 
        });
        setIsAccountOwner(isOwner || false);

        // Get account info (uses the public view which only shows non-sensitive data)
        const { data: account } = await supabase
          .from('accounts')
          .select('id, name, subscription_status')
          .eq('id', accountId)
          .single();

        if (account) {
          setAccountInfo({
            id: account.id,
            name: account.name,
            subscriptionStatus: account.subscription_status,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching account info:', error);
    }
  };

  // Sign in
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  // Sign up - creates user, profile, account, and account membership
  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return { error: error as Error };
    }

    // If signup successful and user exists, create account and membership
    if (data.user) {
      try {
        // Create account for the user
        const { data: accountData, error: accountError } = await supabase
          .from('accounts')
          .insert({ name: `${fullName}'s Church` })
          .select()
          .single();

        if (accountError) {
          console.error('Error creating account:', accountError);
        } else if (accountData) {
          // Create account membership as owner
          const { error: memberError } = await supabase
            .from('account_members')
            .insert({
              account_id: accountData.id,
              user_id: data.user.id,
              role: 'owner',
              accepted_at: new Date().toISOString(),
            });

          if (memberError) {
            console.error('Error creating account membership:', memberError);
          }
        }
      } catch (err) {
        console.error('Error in signup flow:', err);
      }
    }

    return { error: null };
  };

  // Sign out
  const signOut = async () => {
    await supabase.auth.signOut();
    setSubscriptionStatus({ subscribed: false, productId: null, subscriptionEnd: null });
    setAccountInfo(null);
    setIsAccountOwner(false);
  };

  // Set up auth state listener
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Defer Supabase calls with setTimeout to prevent deadlock
      if (session?.user) {
        setTimeout(() => {
          checkSubscription();
          fetchAccountInfo();
        }, 0);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        setTimeout(() => {
          checkSubscription();
          fetchAccountInfo();
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Periodically check subscription status (every minute)
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      checkSubscription();
    }, 60000);

    return () => clearInterval(interval);
  }, [session]);

  const value = {
    user,
    session,
    loading,
    tier,
    subscriptionStatus,
    accountInfo,
    isAccountOwner,
    signIn,
    signUp,
    signOut,
    checkSubscription,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
