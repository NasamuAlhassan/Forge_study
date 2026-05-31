// Supabase auth middleware removed. See src/services/auth.ts for the auth abstraction.
// TODO: implement real server-side token validation using your chosen auth provider.
//   Replace the stub context with a real userId derived from a validated JWT.

import { createMiddleware } from "@tanstack/react-start";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    // TODO: validate Bearer token from request headers
    // TODO: decode JWT and extract user ID + claims
    console.warn(
      "requireSupabaseAuth: using stub middleware — no auth validation. Implement in src/services/auth.ts."
    );
    return next({
      context: {
        userId: "stub-user-id",
        claims: {} as Record<string, unknown>,
      },
    });
  }
);
