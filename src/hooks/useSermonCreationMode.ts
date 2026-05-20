// QUICK BUILD ADDITION — reads/writes profiles.user_sermon_creation_mode

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { SermonCreationMode } from "@/lib/quick-build/types";

export function useSermonCreationMode() {
  const { user, profile, refreshProfile } = useAuth();
  const mode = ((profile as any)?.user_sermon_creation_mode ?? null) as SermonCreationMode | null;

  const setMode = useCallback(
    async (next: SermonCreationMode) => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ user_sermon_creation_mode: next } as any)
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
    },
    [user, refreshProfile],
  );

  return { mode, setMode };
}
