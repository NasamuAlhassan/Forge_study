import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE } from "@/lib/demo-data";

export type { Session, User };

// ─── Demo mode bypass ─────────────────────────────────────────────────────────
const DEMO_USER_ID = "demo-user-id";

const DEMO_USER = {
  id: DEMO_USER_ID,
  email: "demo@forge.app",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { full_name: "Alex Chen" },
  app_metadata: { provider: "demo" },
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
} as unknown as User;

const DEMO_SESSION = {
  access_token: "demo-access-token",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  refresh_token: "demo-refresh-token",
  user: DEMO_USER,
} as unknown as Session;

function seedDemoStreak(): void {
  const key = `forge-activity-log:${DEMO_USER_ID}`;
  if (localStorage.getItem(key)) return;
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  localStorage.setItem(key, JSON.stringify(dates.sort()));
}
// ──────────────────────────────────────────────────────────────────────────────

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(DEMO_MODE ? DEMO_SESSION : null);
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) {
      seedDemoStreak();
      return;
    }
    // Subscribe to auth state changes first, then hydrate from existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (DEMO_MODE) return { error: null };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    if (DEMO_MODE) return { error: null };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/dashboard` : "/dashboard",
        data: { display_name: displayName ?? email.split("@")[0] },
      },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    if (DEMO_MODE) return;
    await supabase.auth.signOut();
  }, []);

  return (
    <Ctx.Provider
      value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
