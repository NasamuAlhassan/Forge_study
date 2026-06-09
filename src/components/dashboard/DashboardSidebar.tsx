import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarRange,
  Brain,
  Upload,
  Mic,
  BarChart3,
  Settings,
  Sparkles,
  Flame,
  TimerReset,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useEffect, useMemo, useState } from "react";
import { useSchedule } from "@/hooks/use-schedule";

const items = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/calendar", label: "Calendar", icon: CalendarRange },
  { to: "/dashboard/study-plan", label: "Study plan", icon: Brain },
  { to: "/dashboard/import", label: "Import timetable", icon: Upload },
  { to: "/dashboard/voice", label: "Voice scheduling", icon: Mic },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
];

function SidebarNav({ onNavigate, onFocus }: { onNavigate?: () => void; onFocus?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { events, hasData } = useSchedule();

  const streak = useMemo(() => {
    if (!hasData) return 0;
    const todayDow = (new Date().getDay() + 6) % 7;
    let count = 0;
    for (let d = todayDow; d >= 0; d--) {
      if (events.some((e) => e.day === d)) count++;
      else break;
    }
    return count;
  }, [events, hasData]);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <Link
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-3 px-5 h-[60px] shrink-0 group"
        style={{ borderBottom: "1px solid color-mix(in oklch, var(--foreground) 6%, transparent)" }}
      >
        <div className="relative h-8 w-8 rounded-xl bg-gradient-primary grid place-items-center shadow-glow shrink-0 transition-transform duration-300 group-hover:scale-105 group-active:scale-95">
          <Sparkles className="h-4 w-4 text-white" />
          {/* Specular highlight on logo icon */}
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
        </div>
        <span
          className="font-display text-[17px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.025em" }}
        >
          Forge
        </span>
      </Link>

      {/* Nav items */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
        {items.map((item, i) => {
          const active = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              style={{ animationDelay: `${i * 30}ms` }}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 min-h-[44px] text-sm font-medium",
                "transition-all duration-200",
                active
                  ? "glass-active-nav text-foreground"
                  : [
                      "rounded-xl text-muted-foreground",
                      "hover:text-foreground hover:bg-white/[0.06]",
                      "active:scale-[0.98] active:bg-white/[0.09]",
                    ].join(" "),
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 transition-colors duration-200" />
              <span className={active ? "font-semibold" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div
        className="px-2.5 pb-3 space-y-1.5 shrink-0"
        style={{ borderTop: "1px solid color-mix(in oklch, var(--foreground) 6%, transparent)" }}
      >
        {/* Streak card */}
        <div className="ring-gradient glass rounded-xl p-3.5 mt-3">
          <div className="flex items-center gap-2">
            <Flame
              className={cn(
                "h-4 w-4 shrink-0",
                streak > 0
                  ? "text-amber-400 drop-shadow-[0_0_6px_oklch(0.82_0.18_70/0.8)]"
                  : "text-muted-foreground",
              )}
            />
            <span className="text-sm font-semibold">
              {streak > 0 ? `${streak}-day streak` : "No streak yet"}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {streak >= 5
              ? "You're on fire. Keep going."
              : streak > 0
                ? "Good start. Show up tomorrow."
                : "Add events to start your streak."}
          </p>
          {/* Streak progress dots */}
          {streak > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {Array.from({ length: Math.min(7, streak) }).map((_, i) => (
                <span
                  key={i}
                  className="h-1 rounded-full bg-amber-400/70"
                  style={{ width: `${100 / Math.min(7, streak)}%` }}
                />
              ))}
              {Array.from({ length: Math.max(0, 7 - streak) }).map((_, i) => (
                <span key={`e-${i}`} className="h-1 flex-1 rounded-full bg-white/10" />
              ))}
            </div>
          )}
        </div>

        {/* Focus mode button */}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onFocus?.();
          }}
          className="btn-primary btn-primary-full flex items-center gap-2.5 px-3 min-h-[44px] rounded-xl text-sm"
        >
          <TimerReset className="h-4 w-4 shrink-0 relative z-10" />
          <span className="relative z-10">Focus mode</span>
        </button>

        {/* Settings link */}
        <Link
          to="/dashboard/settings"
          onClick={onNavigate}
          className={[
            "flex items-center gap-2.5 px-3 py-2.5 min-h-[44px]",
            "rounded-xl text-sm font-medium text-muted-foreground",
            "hover:text-foreground hover:bg-white/[0.06]",
            "active:scale-[0.98] active:bg-white/[0.09]",
            "transition-all duration-200",
          ].join(" ")}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </div>
  );
}

export function DashboardSidebar({ onFocus }: { onFocus?: () => void }) {
  const [open, setOpen] = useState(false);

  // Listen for the open event dispatched by the hamburger inside Topbar
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("sidebar:open", handler);
    return () => window.removeEventListener("sidebar:open", handler);
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 glass-sidebar" style={{ borderRadius: "0 16px 16px 0" }}>
        <SidebarNav onFocus={onFocus} />
      </aside>

      {/* Mobile drawer — triggered by the hamburger inside Topbar */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="p-0 flex flex-col w-[260px] border-r-0 bg-transparent glass-sidebar"
          style={{ borderRadius: "0 16px 16px 0" }}
        >
          <SidebarNav onNavigate={() => setOpen(false)} onFocus={onFocus} />
        </SheetContent>
      </Sheet>
    </>
  );
}
