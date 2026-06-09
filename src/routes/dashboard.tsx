import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { ForgeAssistant } from "@/components/dashboard/ForgeAssistant";
import { FocusMode } from "@/components/dashboard/FocusMode";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useEventAlerts } from "@/hooks/use-notifications";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Forge" },
      { name: "description", content: "Your AI academic operating system." },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { session, loading } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [focusOpen, setFocusOpen] = useState(false);
  useEventAlerts(); // fires OS notifications at lesson time

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div
        className="min-h-screen grid place-items-center"
        aria-label="Loading workspace"
        role="status"
      >
        <div className="flex flex-col items-center gap-5">
          {/* Branded loader */}
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
              <Sparkles className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full bg-background grid place-items-center">
              <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            </span>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold font-display text-foreground">
              Loading your workspace
            </p>
            <p className="text-xs text-muted-foreground">Setting up your AI academic OS…</p>
          </div>
          {/* Skeleton bars */}
          <div className="w-48 space-y-2 opacity-40">
            <div className="h-1.5 rounded-full bg-primary/30 animate-shimmer bg-[length:200%_100%]" />
            <div
              className="h-1.5 rounded-full bg-primary/20 w-3/4 animate-shimmer bg-[length:200%_100%]"
              style={{ animationDelay: "0.2s" }}
            />
            <div
              className="h-1.5 rounded-full bg-primary/15 w-1/2 animate-shimmer bg-[length:200%_100%]"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex text-foreground">
      <DashboardSidebar onFocus={() => setFocusOpen(true)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>
      <Toaster theme={theme} position="top-right" />
      <ForgeAssistant />
      <FocusMode open={focusOpen} onClose={() => setFocusOpen(false)} />
    </div>
  );
}
