import { supabase } from "@/integrations/supabase/client";

export interface ResolvedAccountAccess {
  userId: string | null;
  accountId: string | null;
  ready: boolean;
}

let resolvedAccountAccess: ResolvedAccountAccess = {
  userId: null,
  accountId: null,
  ready: false,
};

let pendingAccountAccessResolution: Promise<ResolvedAccountAccess> | null = null;

export function setResolvedAccountAccess(access: {
  userId: string | null;
  accountId: string | null;
}) {
  resolvedAccountAccess = {
    userId: access.userId,
    accountId: access.accountId,
    ready: true,
  };
}

export function clearResolvedAccountAccess() {
  resolvedAccountAccess = {
    userId: null,
    accountId: null,
    ready: false,
  };
  pendingAccountAccessResolution = null;
}

export function getResolvedAccountAccess(): ResolvedAccountAccess {
  return resolvedAccountAccess;
}

export async function ensureResolvedAccountAccess(): Promise<ResolvedAccountAccess> {
  if (resolvedAccountAccess.ready) {
    return resolvedAccountAccess;
  }

  if (pendingAccountAccessResolution) {
    return pendingAccountAccessResolution;
  }

  pendingAccountAccessResolution = (async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const guestAccess = { userId: null, accountId: null, ready: true };
      resolvedAccountAccess = guestAccess;
      return guestAccess;
    }

    const { data } = await supabase.rpc("get_user_account_id", { _user_id: user.id });
    const nextAccess = {
      userId: user.id,
      accountId: data || null,
      ready: true,
    };

    resolvedAccountAccess = nextAccess;
    return nextAccess;
  })();

  try {
    return await pendingAccountAccessResolution;
  } finally {
    pendingAccountAccessResolution = null;
  }
}
