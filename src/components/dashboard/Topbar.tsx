import { Bell, BookOpen, CalendarClock, Clock, LogOut, Moon, Search, Sparkles, Sun, Swords } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useNotifications, type NotifLevel } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const levelStyle: Record<NotifLevel, string> = {
  now:      "text-rose-400",
  soon:     "text-amber-400",
  today:    "text-primary",
  tomorrow: "text-muted-foreground",
  exam:     "text-orange-400",
};

const levelIcon: Record<NotifLevel, React.ReactNode> = {
  now:      <Clock className="h-3.5 w-3.5" />,
  soon:     <Clock className="h-3.5 w-3.5" />,
  today:    <CalendarClock className="h-3.5 w-3.5" />,
  tomorrow: <CalendarClock className="h-3.5 w-3.5" />,
  exam:     <Swords className="h-3.5 w-3.5" />,
};

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { notifications, urgentCount } = useNotifications();

  const isDark = theme === "dark";

  const initial = (
    user?.user_metadata?.full_name ??
    user?.user_metadata?.display_name ??
    user?.email ??
    "?"
  )
    .toString()
    .charAt(0)
    .toUpperCase();

  const dropdownStyle = {
    background: isDark
      ? "oklch(0.19 0.04 275 / 0.96)"
      : "oklch(0.99 0.005 280 / 0.97)",
    backdropFilter: "blur(40px) saturate(200%)",
    WebkitBackdropFilter: "blur(40px) saturate(200%)",
    border: isDark
      ? "1px solid oklch(1 0 0 / 0.1)"
      : "1px solid oklch(0 0 0 / 0.08)",
    boxShadow: isDark
      ? "0 1px 0 oklch(1 0 0 / 0.13) inset, 0 24px 64px -16px oklch(0.04 0.02 275 / 0.8)"
      : "0 1px 0 oklch(1 1 0 / 0.7) inset, 0 24px 64px -16px oklch(0 0 0 / 0.14)",
    borderRadius: "16px",
  };

  const iconBtn = [
    "grid place-items-center rounded-xl",
    "h-9 w-9 shrink-0",
    "text-muted-foreground hover:text-foreground",
    isDark
      ? "hover:bg-white/[0.08] active:bg-white/[0.11]"
      : "hover:bg-black/[0.05] active:bg-black/[0.08]",
    "active:scale-[0.93]",
    "transition-all duration-150",
  ].join(" ");

  return (
    <header
      className="sticky top-0 z-30 pl-12 lg:pl-6 pr-4 sm:pr-5 flex items-center justify-between gap-4"
      style={{
        height: "60px",
        background: isDark
          ? "oklch(0.13 0.03 275 / 0.92)"
          : "oklch(0.98 0.005 280 / 0.92)",
        backdropFilter: "blur(32px) saturate(180%)",
        WebkitBackdropFilter: "blur(32px) saturate(180%)",
        borderBottom: isDark
          ? "1px solid oklch(1 0 0 / 0.07)"
          : "1px solid oklch(0 0 0 / 0.07)",
        boxShadow: isDark
          ? "0 1px 0 oklch(1 0 0 / 0.09) inset"
          : "0 1px 0 oklch(1 1 0 / 0.8) inset, 0 2px 12px oklch(0 0 0 / 0.05)",
      }}
    >
      {/* Page title */}
      <div className="min-w-0">
        <h1
          className="font-display font-semibold truncate leading-tight text-[17px] sm:text-[19px] lg:text-[21px]"
          style={{ letterSpacing: "-0.025em" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate mt-0.5 leading-snug">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-1.5">

        {/* Search — md+ only */}
        <div
          className={[
            "hidden md:flex items-center gap-2 px-3 py-[7px]",
            "rounded-xl text-sm text-muted-foreground",
            "w-44 lg:w-60",
            "transition-all duration-200",
            isDark
              ? "focus-within:ring-1 focus-within:ring-primary/25"
              : "focus-within:ring-2 focus-within:ring-primary/20",
          ].join(" ")}
          style={{
            background: isDark ? "oklch(1 0 0 / 0.04)" : "oklch(0 0 0 / 0.04)",
            border: isDark
              ? "1px solid oklch(1 0 0 / 0.07)"
              : "1px solid oklch(0 0 0 / 0.09)",
          }}
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
          <input
            placeholder="Search…"
            aria-label="Search schedule, subjects, sessions"
            className="bg-transparent outline-none flex-1 placeholder:text-muted-foreground/45 min-w-0 text-sm"
          />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className={iconBtn}
        >
          {isDark
            ? <Sun  className="h-[15px] w-[15px]" aria-hidden="true" />
            : <Moon className="h-[15px] w-[15px]" aria-hidden="true" />}
        </button>

        {/* Notification bell — sm+ */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Notifications"
              className={cn("hidden sm:grid relative", iconBtn)}
            >
              <Bell className="h-[15px] w-[15px]" aria-hidden="true" />
              {urgentCount > 0 && (
                <span className="absolute top-[7px] right-[7px] h-[7px] w-[7px] rounded-full bg-rose-500 ring-[1.5px] ring-background animate-pulse" />
              )}
              {urgentCount === 0 && notifications.length > 0 && (
                <span className="absolute top-[7px] right-[7px] h-[7px] w-[7px] rounded-full bg-primary/80 ring-[1.5px] ring-background" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border-0 p-0 overflow-hidden" style={dropdownStyle}>
            <div
              className="px-4 py-3"
              style={{
                borderBottom: isDark
                  ? "1px solid oklch(1 0 0 / 0.06)"
                  : "1px solid oklch(0 0 0 / 0.06)",
              }}
            >
              <p className="text-[13px] font-semibold">Notifications</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {notifications.length === 0
                  ? "All clear — nothing urgent."
                  : `${notifications.length} upcoming event${notifications.length > 1 ? "s" : ""}`}
              </p>
            </div>

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 py-8 px-4 text-center">
                <BookOpen className="h-7 w-7 text-muted-foreground/25" />
                <p className="text-xs text-muted-foreground/60">Nothing today or tomorrow.</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.05]">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors duration-150",
                      isDark ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.03]"
                    )}
                  >
                    <div className={cn("mt-0.5 shrink-0 opacity-75", levelStyle[n.level])}>
                      {levelIcon[n.level]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{n.title}</p>
                      <p className={cn("text-[11px] mt-0.5", levelStyle[n.level])}>{n.subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Ask Forge — pill on sm+, icon-only on xs */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("forge:open"))}
          aria-label="Ask Forge AI"
          className={[
            "hidden sm:flex items-center gap-1.5",
            "h-9 px-3.5 rounded-xl",
            "text-[13px] font-semibold text-white",
            "hover:brightness-110 active:scale-[0.96] active:brightness-95",
            "transition-all duration-150 relative overflow-hidden",
          ].join(" ")}
          style={{
            background: "linear-gradient(135deg, oklch(0.72 0.2 285), oklch(0.55 0.23 250))",
            boxShadow: "0 4px 16px oklch(0.62 0.21 285 / 0.3), 0 1px 0 oklch(1 0 0 / 0.2) inset",
            letterSpacing: "-0.01em",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ask Forge</span>
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/16 to-transparent pointer-events-none" />
        </button>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent("forge:open"))}
          aria-label="Ask Forge AI"
          className={[
            "sm:hidden grid place-items-center",
            "h-9 w-9 rounded-xl shrink-0",
            "text-white",
            "active:scale-[0.93] transition-all duration-150 relative overflow-hidden",
          ].join(" ")}
          style={{
            background: "linear-gradient(135deg, oklch(0.72 0.2 285), oklch(0.55 0.23 250))",
            boxShadow: "0 4px 16px oklch(0.62 0.21 285 / 0.3), 0 1px 0 oklch(1 0 0 / 0.2) inset",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/16 to-transparent pointer-events-none" />
        </button>

        {/* Avatar + user menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`User menu for ${user?.email ?? "account"}`}
              className={[
                "h-9 w-9 rounded-full shrink-0",
                "grid place-items-center",
                "text-[13px] font-bold text-white",
                "bg-gradient-primary shadow-glow",
                "ring-2 ring-background hover:ring-primary/40",
                "active:scale-[0.93] transition-all duration-150 relative overflow-hidden",
              ].join(" ")}
            >
              {initial}
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 border-0"
            style={{ ...dropdownStyle, borderRadius: "14px" }}
          >
            <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground font-normal">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator
              style={{
                background: isDark ? "oklch(1 0 0 / 0.07)" : "oklch(0 0 0 / 0.07)",
              }}
            />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive gap-2 text-[13px]"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
