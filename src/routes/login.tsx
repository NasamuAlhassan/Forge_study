import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/hooks/use-theme";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Forge" },
      { name: "description", content: "Sign in to your Forge AI academic dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading, signIn, signUp } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signUp(email, password, name || email.split("@")[0]);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. You're in.");
    navigate({ to: "/dashboard" });
  };

  const handleGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined"
          ? `${window.location.origin}/dashboard`
          : "/dashboard",
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message ?? "Google sign-in failed");
    }
    // On success the browser redirects — no need to navigate manually.
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-16 bg-background overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-radial opacity-60" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/20 blur-3xl -z-10" />

      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-semibold">Forge</span>
        </Link>

        <div className="ring-gradient glass rounded-2xl p-6 shadow-elegant">
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl font-semibold">Welcome to Forge</h1>
            <p className="text-sm text-muted-foreground mt-1">Your AI academic operating system</p>
          </div>

          <Button
            onClick={handleGoogle}
            disabled={busy}
            variant="outline"
            className="w-full gap-2 bg-white/5 hover:bg-white/10 active:bg-white/15 active:scale-[0.99] border-white/10 transition-all duration-150 h-11"
          >
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-white/10" /> or <div className="h-px flex-1 bg-white/10" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full bg-white/5">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                <Field label="Email" id="si-email">
                  <Input
                    id="si-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    className="h-11"
                  />
                </Field>
                <Field label="Password" id="si-pass">
                  <Input
                    id="si-pass"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11"
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-gradient-primary hover:opacity-90 active:opacity-80 active:scale-[0.99] shadow-glow transition-all duration-150 h-11"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                <Field label="Name" id="su-name">
                  <Input
                    id="su-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Chen"
                    className="h-11"
                  />
                </Field>
                <Field label="Email" id="su-email">
                  <Input
                    id="su-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    className="h-11"
                  />
                </Field>
                <Field label="Password" id="su-pass">
                  <Input
                    id="su-pass"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="h-11"
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-gradient-primary hover:opacity-90 active:opacity-80 active:scale-[0.99] shadow-glow transition-all duration-150 h-11"
                >
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to Forge's terms and privacy policy.
        </p>
      </div>
      <Toaster theme={theme} position="top-center" />
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}
