// TODO: replace with your real auth provider (Firebase Auth, Auth.js, Clerk, custom JWT, etc.)
// This stub persists a mock user to localStorage and simulates auth flows.

export type User = {
  id: string;
  email: string;
  user_metadata: { display_name?: string };
};

export type Session = {
  user: User;
};

const SESSION_KEY = "forge_session";

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const authService = {
  async signIn(
    email: string,
    _password: string
  ): Promise<{ user: User; error: null } | { user: null; error: Error }> {
    // TODO: POST to your auth API and validate credentials
    const user: User = {
      id: generateId(),
      email,
      user_metadata: { display_name: email.split("@")[0] },
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }
    return { user, error: null };
  },

  async signUp(
    email: string,
    _password: string,
    displayName?: string
  ): Promise<{ user: User; error: null } | { user: null; error: Error }> {
    // TODO: POST to your auth API to create an account
    const user: User = {
      id: generateId(),
      email,
      user_metadata: { display_name: displayName ?? email.split("@")[0] },
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    }
    return { user, error: null };
  },

  async signOut(): Promise<void> {
    // TODO: call your auth API sign-out endpoint
    if (typeof window !== "undefined") {
      localStorage.removeItem(SESSION_KEY);
    }
  },

  async signInWithOAuth(
    _provider: "google" | "apple" | "microsoft" | string,
    _opts?: { redirect_uri?: string }
  ): Promise<{ error: null } | { error: Error }> {
    // TODO: integrate OAuth flow (Google, Apple, etc.)
    console.warn("OAuth sign-in not implemented. See src/services/auth.ts.");
    return {
      error: new Error(
        "OAuth sign-in is not yet configured. Implement it in src/services/auth.ts."
      ),
    };
  },

  getStoredUser(): User | null {
    // TODO: validate session token against your auth API
    try {
      if (typeof window === "undefined") return null;
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
};
