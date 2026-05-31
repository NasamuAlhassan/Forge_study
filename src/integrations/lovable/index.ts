// Lovable Cloud Auth removed. OAuth is now delegated to src/services/auth.ts.
// TODO: integrate a real OAuth provider (Google, Apple, etc.) in src/services/auth.ts.

import { authService } from "@/services/auth";

export const lovable = {
  auth: {
    signInWithOAuth: authService.signInWithOAuth.bind(authService),
  },
};
