import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  ChevronRight,
  Settings2,
  Plus,
  Minus,
  Sun,
  Moon,
} from "lucide-react";
import { useSchedule } from "@/hooks/use-schedule";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const DEFAULT_WORK_MINS = 25;
const DEFAULT_BREAK_MINS = 5;
const DEFAULT_LONG_BREAK_MINS = 15;
const LONG_BREAK_AFTER = 4;

const STORAGE_KEY = "forge-focus-settings";

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { workMins: number; breakMins: number; longBreakMins: number };
    if (s.workMins && s.breakMins && s.longBreakMins) return s;
  } catch {
    /* ignore */
  }
  return null;
}

type Phase = "work" | "break" | "long-break";

function jsDayToApp(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatSeconds(secs: number): string {
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

const PHASE_CONFIG = {
  work: {
    label: "Focus",
    icon: Brain,
    trackColor: "oklch(0.62 0.21 285 / 0.15)",
    arcGradient: "url(#arcWork)",
    glow: "oklch(0.62 0.21 285 / 0.4)",
    bg: "from-primary/[0.07] to-violet-500/[0.04]",
    dot: "bg-primary",
  },
  break: {
    label: "Break",
    icon: Coffee,
    trackColor: "oklch(0.60 0.18 160 / 0.15)",
    arcGradient: "#34d399",
    glow: "oklch(0.60 0.18 160 / 0.35)",
    bg: "from-emerald-500/[0.07] to-teal-500/[0.04]",
    dot: "bg-emerald-400",
  },
  "long-break": {
    label: "Long break",
    icon: Coffee,
    trackColor: "oklch(0.82 0.18 70 / 0.15)",
    arcGradient: "#fbbf24",
    glow: "oklch(0.82 0.18 70 / 0.35)",
    bg: "from-amber-500/[0.07] to-orange-500/[0.04]",
    dot: "bg-amber-400",
  },
} as const;

/** +/- stepper for one duration field */
function DurationStepper({
  label,
  value,
  min = 1,
  max = 90,
  onChange,
  isDark,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  isDark: boolean;
}) {
  const btnCls = [
    "h-7 w-7 rounded-lg grid place-items-center shrink-0",
    isDark
      ? "text-white/60 hover:text-white hover:bg-white/[0.1]"
      : "text-foreground/50 hover:text-foreground hover:bg-black/[0.08]",
    "active:scale-[0.9] transition-all duration-100 disabled:opacity-30 disabled:pointer-events-none",
  ].join(" ");

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className="text-[10px] uppercase tracking-widest"
        style={{
          letterSpacing: "0.1em",
          color: isDark ? "oklch(0.65 0.03 280)" : "oklch(0.45 0.03 280)",
        }}
      >
        {label}
      </span>
      <div
        className="flex items-center gap-1"
        style={{
          background: isDark ? "oklch(1 0 0 / 0.05)" : "oklch(0 0 0 / 0.05)",
          border: `1px solid ${isDark ? "oklch(1 0 0 / 0.1)" : "oklch(0 0 0 / 0.1)"}`,
          borderRadius: "12px",
          padding: "3px",
        }}
      >
        <button
          className={btnCls}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span
          className="w-8 text-center text-sm font-semibold tabular-nums"
          style={{ letterSpacing: "-0.01em" }}
        >
          {value}
        </span>
        <button
          className={btnCls}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <span
        className="text-[9px]"
        style={{ color: isDark ? "oklch(0.55 0.02 280)" : "oklch(0.55 0.03 280)" }}
      >
        min
      </span>
    </div>
  );
}

interface FocusModeProps {
  open: boolean;
  onClose: () => void;
}

export function FocusMode({ open, onClose }: FocusModeProps) {
  // App-level theme + toggle
  const { theme, toggle: toggleAppTheme } = useTheme();
  // Focus mode tracks the app theme by default but allows an in-session override
  const [localDark, setLocalDark] = useState<boolean | null>(null);
  const isDark = localDark !== null ? localDark : theme === "dark";

  // Sync local override when the overlay first opens
  useEffect(() => {
    if (open) setLocalDark(null); // reset to follow app theme each time it opens
  }, [open]);

  const toggleTheme = () => {
    // If overriding locally, toggle local state
    setLocalDark((prev) => (prev === null ? theme !== "dark" : !prev));
    // Also toggle the app-level theme so the rest of the app follows
    toggleAppTheme();
  };

  // --- settings ---
  const saved = loadSettings();
  const [workMins, setWorkMins] = useState(saved?.workMins ?? DEFAULT_WORK_MINS);
  const [breakMins, setBreakMins] = useState(saved?.breakMins ?? DEFAULT_BREAK_MINS);
  const [longBreakMins, setLongBreakMins] = useState(
    saved?.longBreakMins ?? DEFAULT_LONG_BREAK_MINS,
  );
  const [showSettings, setShowSettings] = useState(false);

  // --- timer state ---
  const [phase, setPhase] = useState<Phase>("work");
  const [secondsLeft, setSecondsLeft] = useState(workMins * 60);
  const [running, setRunning] = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { events, subjects } = useSchedule();

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workMins, breakMins, longBreakMins }));
  }, [workMins, breakMins, longBreakMins]);

  const phaseDuration = useCallback(
    (p: Phase) => {
      if (p === "work") return workMins * 60;
      if (p === "long-break") return longBreakMins * 60;
      return breakMins * 60;
    },
    [workMins, breakMins, longBreakMins],
  );

  // When a setting changes while the timer is idle on "work", sync secondsLeft
  const isWorkPhaseIdle = phase === "work" && !running;
  useEffect(() => {
    if (isWorkPhaseIdle) setSecondsLeft(workMins * 60);
  }, [workMins, isWorkPhaseIdle]);

  const nextEvent = (() => {
    const now = new Date();
    const todayApp = jsDayToApp(now.getDay());
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return (
      events
        .filter((e) => e.day === todayApp && e.end > nowMins)
        .sort((a, b) => a.start - b.start)[0] ?? null
    );
  })();

  const nextSubjectName = nextEvent
    ? (subjects.find((s) => s.id === nextEvent.subjectId)?.name ?? nextEvent.title)
    : null;

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            setRunning(false);
            if (phase === "work") {
              const next = pomodoroCount + 1;
              setPomodoroCount(next);
              const nextPhase: Phase = next % LONG_BREAK_AFTER === 0 ? "long-break" : "break";
              setPhase(nextPhase);
              return phaseDuration(nextPhase);
            } else {
              setPhase("work");
              return phaseDuration("work");
            }
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, phase, pomodoroCount, phaseDuration]);

  const reset = () => {
    setRunning(false);
    setPhase("work");
    setSecondsLeft(workMins * 60);
    setPomodoroCount(0);
  };

  const skip = () => {
    setRunning(false);
    if (phase === "work") {
      const next = pomodoroCount + 1;
      setPomodoroCount(next);
      const nextPhase: Phase = next % LONG_BREAK_AFTER === 0 ? "long-break" : "break";
      setPhase(nextPhase);
      setSecondsLeft(phaseDuration(nextPhase));
    } else {
      setPhase("work");
      setSecondsLeft(phaseDuration("work"));
    }
  };

  // Apply a settings change: pause + reset timer to new duration
  const applyWorkMins = (v: number) => {
    setWorkMins(v);
    if (phase === "work") {
      setRunning(false);
      setSecondsLeft(v * 60);
    }
  };
  const applyBreakMins = (v: number) => {
    setBreakMins(v);
    if (phase === "break") {
      setRunning(false);
      setSecondsLeft(v * 60);
    }
  };
  const applyLongBreakMins = (v: number) => {
    setLongBreakMins(v);
    if (phase === "long-break") {
      setRunning(false);
      setSecondsLeft(v * 60);
    }
  };

  const cfg = PHASE_CONFIG[phase];
  const total = phaseDuration(phase);
  const progress = (total - secondsLeft) / total;
  const radius = 108;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - progress);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  // ── Theme-derived colors ────────────────────────────────────────────────────
  const overlayBg = isDark ? "rgba(4, 4, 16, 0.92)" : "rgba(240, 238, 255, 0.94)";

  const iconBtnStyle: React.CSSProperties = {
    background:  "var(--glass-bg-dark)",
    border:      "1px solid var(--glass-border-dark)",
    boxShadow:   "0 1px 0 rgba(255,255,255,0.08) inset",
  };

  const iconBtnCls = [
    "h-10 w-10 rounded-2xl grid place-items-center",
    isDark
      ? "text-white/50 hover:text-white hover:bg-white/[0.09]"
      : "text-foreground/50 hover:text-foreground hover:bg-black/[0.06]",
    "active:scale-[0.93] transition-all duration-150",
  ].join(" ");

  const statCardStyle: React.CSSProperties = {
    backdropFilter:        "blur(var(--glass-blur))",
    WebkitBackdropFilter:  "blur(var(--glass-blur))",
    border:                "1px solid var(--glass-border-dark)",
    boxShadow:             "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px -8px rgba(0,0,0,0.35)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      style={{
        background: overlayBg,
        backdropFilter: "blur(48px) saturate(160%)",
        WebkitBackdropFilter: "blur(48px) saturate(160%)",
        transition: "background 400ms ease",
      }}
    >
      {/* Ambient glow behind ring */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(40% 50% at 50% 50%, ${cfg.glow} 0%, transparent 70%)`,
          transition: "background 600ms ease",
          opacity: isDark ? 1 : 0.6,
        }}
      />

      {/* Top-left: Settings */}
      <button
        onClick={() => setShowSettings((s) => !s)}
        className={cn(iconBtnCls, "absolute top-5 left-5 z-10")}
        style={{
          ...iconBtnStyle,
          background: showSettings
            ? isDark
              ? "oklch(1 0 0 / 0.1)"
              : "oklch(0 0 0 / 0.08)"
            : iconBtnStyle.background,
          border: showSettings
            ? `1px solid ${isDark ? "oklch(1 0 0 / 0.15)" : "oklch(0 0 0 / 0.12)"}`
            : iconBtnStyle.border,
          color: showSettings ? "var(--foreground)" : undefined,
        }}
        aria-label="Timer settings"
        aria-expanded={showSettings}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {/* Top-center: Theme toggle */}
      <button
        onClick={toggleTheme}
        className={cn(iconBtnCls, "absolute top-5 z-10")}
        style={iconBtnStyle}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {/* Top-right: Close */}
      <button
        onClick={onClose}
        className={cn(iconBtnCls, "absolute top-5 right-5 z-10")}
        style={iconBtnStyle}
        aria-label="Exit focus mode"
      >
        <X className="h-4 w-4" />
      </button>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div
          className="glass-panel absolute top-[72px] left-5 z-20 flex flex-col gap-4 p-5 rounded-2xl"
        >
          <p
            className="text-[11px] uppercase tracking-widest text-center"
            style={{
              letterSpacing: "0.12em",
              color: isDark ? "oklch(0.55 0.03 280)" : "oklch(0.45 0.03 280)",
            }}
          >
            Timer settings
          </p>
          <div className="flex items-start gap-5">
            <DurationStepper
              label="Focus"
              value={workMins}
              min={1}
              max={90}
              onChange={applyWorkMins}
              isDark={isDark}
            />
            <DurationStepper
              label="Short break"
              value={breakMins}
              min={1}
              max={30}
              onChange={applyBreakMins}
              isDark={isDark}
            />
            <DurationStepper
              label="Long break"
              value={longBreakMins}
              min={1}
              max={60}
              onChange={applyLongBreakMins}
              isDark={isDark}
            />
          </div>
          <p
            className="text-[9px] text-center"
            style={{ color: isDark ? "oklch(0.45 0.02 280)" : "oklch(0.55 0.03 280)" }}
          >
            Changes take effect immediately
          </p>
        </div>
      )}

      {/* Pomodoro progress dots */}
      <div className="flex items-center gap-2 mb-9 relative z-10">
        {Array.from({ length: LONG_BREAK_AFTER }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-all duration-500"
            style={{
              background: i < pomodoroCount % LONG_BREAK_AFTER
                ? "rgba(255,255,255,0.75)"
                : "rgba(255,255,255,0.15)",
              transform: i < pomodoroCount % LONG_BREAK_AFTER ? "scale(1.25)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Phase label */}
      <div className="flex items-center gap-2 mb-5 relative z-10">
        <cfg.icon
          className="h-4 w-4"
          style={{ color: isDark ? "oklch(0.60 0.03 280)" : "oklch(0.45 0.03 280)" }}
        />
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{
            letterSpacing: "0.12em",
            color: isDark ? "oklch(0.60 0.03 280)" : "oklch(0.45 0.03 280)",
          }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Timer ring */}
      <div className="relative flex items-center justify-center mb-8 z-10">
        <svg width="280" height="280" className="-rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id="arcWork" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.74 0.19 295)" />
              <stop offset="100%" stopColor="oklch(0.55 0.23 250)" />
            </linearGradient>
            <filter id="arcGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Track */}
          <circle
            cx="140"
            cy="140"
            r={radius}
            fill="none"
            stroke={cfg.trackColor}
            strokeWidth="10"
          />

          {/* Shadow arc (glow effect) */}
          {progress > 0 && (
            <circle
              cx="140"
              cy="140"
              r={radius}
              fill="none"
              stroke={
                typeof cfg.arcGradient === "string" && cfg.arcGradient.startsWith("#")
                  ? cfg.arcGradient
                  : "oklch(0.65 0.22 285)"
              }
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              opacity="0.2"
              filter="url(#arcGlow)"
              style={{ transition: "stroke-dashoffset 0.95s cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          )}

          {/* Main arc */}
          <circle
            cx="140"
            cy="140"
            r={radius}
            fill="none"
            stroke={cfg.arcGradient}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.95s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <span
            className="font-mono text-6xl font-semibold tabular-nums"
            style={{
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "var(--foreground)",
            }}
          >
            {formatSeconds(secondsLeft)}
          </span>
          {nextSubjectName && (
            <span
              className="text-[11px] max-w-[130px] text-center truncate mt-1"
              style={{ color: isDark ? "oklch(0.60 0.03 280)" : "oklch(0.45 0.03 280)" }}
            >
              {nextSubjectName}
              {nextEvent && ` · ${minutesToTime(nextEvent.start)}`}
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-8 relative z-10">
        {/* Reset */}
        <button
          onClick={reset}
          aria-label="Reset timer"
          className={cn(iconBtnCls, "h-12 w-12")}
          style={iconBtnStyle}
        >
          <RotateCcw className="h-4.5 w-4.5" />
        </button>

        {/* Play/Pause — main action */}
        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? "Pause timer" : "Start timer"}
          className={[
            "h-[68px] w-[68px] rounded-[22px] grid place-items-center relative overflow-hidden",
            "active:scale-[0.94] transition-all duration-200",
            running ? "hover:brightness-110" : "hover:brightness-110",
          ].join(" ")}
          style={{
            background:           running ? "var(--glass-bg-active-dark)" : "var(--glass-bg-btn-dark)",
            backdropFilter:       "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            border:               "1px solid var(--glass-border-dark)",
            boxShadow:            "0 1px 0 rgba(255,255,255,0.14) inset, var(--glass-shadow)",
          }}
        >
          {running ? (
            <Pause className="h-6 w-6 text-white/80" />
          ) : (
            <Play className="h-6 w-6 text-white/90 ml-0.5" />
          )}
          <span className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
        </button>

        {/* Skip */}
        <button
          onClick={skip}
          aria-label={phase === "work" ? "Skip to break" : "Skip to work session"}
          className={cn(iconBtnCls, "h-12 w-12")}
          style={iconBtnStyle}
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Stats card */}
      <div
        className={cn(
          "flex items-center gap-5 px-7 py-4 rounded-2xl relative z-10 bg-gradient-to-br",
          cfg.bg,
        )}
        style={statCardStyle}
      >
        <div className="text-center">
          <p
            className="text-3xl font-semibold font-display"
            style={{ letterSpacing: "-0.03em", color: "var(--foreground)" }}
          >
            {pomodoroCount}
          </p>
          <p
            className="text-[10px] uppercase tracking-widest mt-0.5"
            style={{
              letterSpacing: "0.1em",
              color: isDark ? "oklch(0.55 0.03 280)" : "oklch(0.45 0.03 280)",
            }}
          >
            sessions
          </p>
        </div>

        <div
          className="w-px h-8"
          style={{ background: isDark ? "oklch(1 0 0 / 0.1)" : "oklch(0 0 0 / 0.1)" }}
        />

        <div className="text-center">
          <p
            className="text-3xl font-semibold font-display"
            style={{ letterSpacing: "-0.03em", color: "var(--foreground)" }}
          >
            {pomodoroCount * workMins}
          </p>
          <p
            className="text-[10px] uppercase tracking-widest mt-0.5"
            style={{
              letterSpacing: "0.1em",
              color: isDark ? "oklch(0.55 0.03 280)" : "oklch(0.45 0.03 280)",
            }}
          >
            min focused
          </p>
        </div>

        {nextEvent && (
          <>
            <div
              className="w-px h-8"
              style={{ background: isDark ? "oklch(1 0 0 / 0.1)" : "oklch(0 0 0 / 0.1)" }}
            />
            <div className="min-w-0 max-w-[120px]">
              <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                {nextSubjectName}
              </p>
              <p
                className="text-[11px] truncate mt-0.5"
                style={{ color: isDark ? "oklch(0.55 0.03 280)" : "oklch(0.45 0.03 280)" }}
              >
                {minutesToTime(nextEvent.start)}–{minutesToTime(nextEvent.end)}
              </p>
            </div>
          </>
        )}
      </div>

      <p
        className="mt-6 text-[11px] relative z-10 tracking-wide"
        style={{ color: isDark ? "oklch(0.45 0.02 280)" : "oklch(0.55 0.03 280)" }}
      >
        {running ? "Stay locked in." : "Press play to start."}
      </p>
    </div>
  );
}
