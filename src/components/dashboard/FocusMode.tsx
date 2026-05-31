import { useEffect, useRef, useState, useCallback } from "react";
import { X, Play, Pause, RotateCcw, Coffee, Brain, ChevronRight } from "lucide-react";
import { useSchedule } from "@/hooks/use-schedule";
import { cn } from "@/lib/utils";

const WORK_MINS       = 25;
const BREAK_MINS      = 5;
const LONG_BREAK_MINS = 15;
const LONG_BREAK_AFTER = 4;

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

interface FocusModeProps {
  open: boolean;
  onClose: () => void;
}

export function FocusMode({ open, onClose }: FocusModeProps) {
  const [phase, setPhase]               = useState<Phase>("work");
  const [secondsLeft, setSecondsLeft]   = useState(WORK_MINS * 60);
  const [running, setRunning]           = useState(false);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { events, subjects } = useSchedule();

  const phaseDuration = useCallback((p: Phase) => {
    if (p === "work") return WORK_MINS * 60;
    if (p === "long-break") return LONG_BREAK_MINS * 60;
    return BREAK_MINS * 60;
  }, []);

  const nextEvent = (() => {
    const now      = new Date();
    const todayApp = jsDayToApp(now.getDay());
    const nowMins  = now.getHours() * 60 + now.getMinutes();
    return events
      .filter((e) => e.day === todayApp && e.end > nowMins)
      .sort((a, b) => a.start - b.start)[0] ?? null;
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, phase, pomodoroCount, phaseDuration]);

  const reset = () => {
    setRunning(false);
    setPhase("work");
    setSecondsLeft(WORK_MINS * 60);
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

  const cfg     = PHASE_CONFIG[phase];
  const total   = phaseDuration(phase);
  const progress = (total - secondsLeft) / total;
  const radius  = 108;
  const circ    = 2 * Math.PI * radius;
  const offset  = circ * (1 - progress);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      style={{
        background: "oklch(0.10 0.03 275 / 0.97)",
        backdropFilter: "blur(48px) saturate(160%)",
        WebkitBackdropFilter: "blur(48px) saturate(160%)",
      }}
    >
      {/* Ambient glow behind ring */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(40% 50% at 50% 50%, ${cfg.glow} 0%, transparent 70%)`,
          transition: "background 600ms ease",
        }}
      />

      {/* Close button */}
      <button
        onClick={onClose}
        className={[
          "absolute top-5 right-5 z-10",
          "h-10 w-10 rounded-2xl grid place-items-center",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-white/[0.09] active:scale-[0.93]",
          "transition-all duration-150",
        ].join(" ")}
        style={{
          background: "oklch(1 0 0 / 0.05)",
          border: "1px solid oklch(1 0 0 / 0.08)",
          boxShadow: "0 1px 0 oklch(1 0 0 / 0.1) inset",
        }}
        aria-label="Exit focus mode"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Pomodoro progress dots */}
      <div className="flex items-center gap-2 mb-9 relative z-10">
        {Array.from({ length: LONG_BREAK_AFTER }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-all duration-500",
              i < pomodoroCount % LONG_BREAK_AFTER
                ? `${cfg.dot} scale-125`
                : "bg-white/15"
            )}
          />
        ))}
      </div>

      {/* Phase label */}
      <div className="flex items-center gap-2 mb-5 relative z-10">
        <cfg.icon className="h-4 w-4 text-muted-foreground" />
        <span
          className="text-xs font-semibold text-muted-foreground tracking-widest uppercase"
          style={{ letterSpacing: "0.12em" }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Timer ring */}
      <div className="relative flex items-center justify-center mb-8 z-10">
        <svg
          width="280"
          height="280"
          className="-rotate-90"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="arcWork" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="oklch(0.74 0.19 295)" />
              <stop offset="100%" stopColor="oklch(0.55 0.23 250)" />
            </linearGradient>
            {/* Glow filter for arc */}
            <filter id="arcGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Track */}
          <circle
            cx="140" cy="140" r={radius}
            fill="none"
            stroke={cfg.trackColor}
            strokeWidth="10"
          />

          {/* Shadow arc (glow effect) */}
          {progress > 0 && (
            <circle
              cx="140" cy="140" r={radius}
              fill="none"
              stroke={typeof cfg.arcGradient === "string" && cfg.arcGradient.startsWith("#") ? cfg.arcGradient : "oklch(0.65 0.22 285)"}
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
            cx="140" cy="140" r={radius}
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
            style={{ letterSpacing: "-0.03em", lineHeight: 1 }}
          >
            {formatSeconds(secondsLeft)}
          </span>
          {nextSubjectName && (
            <span className="text-[11px] text-muted-foreground/70 max-w-[130px] text-center truncate mt-1">
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
          className={[
            "h-12 w-12 rounded-2xl grid place-items-center",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-white/[0.08] active:scale-[0.93]",
            "transition-all duration-150",
          ].join(" ")}
          style={{
            background: "oklch(1 0 0 / 0.05)",
            border: "1px solid oklch(1 0 0 / 0.09)",
            boxShadow: "0 1px 0 oklch(1 0 0 / 0.12) inset",
          }}
        >
          <RotateCcw className="h-4.5 w-4.5" />
        </button>

        {/* Play/Pause — main action */}
        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? "Pause timer" : "Start timer"}
          className={[
            "h-[68px] w-[68px] rounded-[22px] grid place-items-center relative overflow-hidden",
            "active:scale-[0.94]",
            "transition-all duration-200",
            running
              ? "hover:brightness-110"
              : "hover:brightness-110 hover:shadow-[0_0_28px_-4px_oklch(0.62_0.21_285/0.55)]",
          ].join(" ")}
          style={{
            background: running
              ? "oklch(1 0 0 / 0.1)"
              : "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
            boxShadow: running
              ? "0 1px 0 oklch(1 0 0 / 0.15) inset, 0 8px 24px -8px oklch(0.06 0.02 275 / 0.5)"
              : "0 0 40px -8px oklch(0.62 0.21 285 / 0.55), 0 1px 0 oklch(1 0 0 / 0.2) inset",
            border: "1px solid oklch(1 0 0 / 0.12)",
          }}
        >
          {running
            ? <Pause className="h-6 w-6 text-foreground" />
            : <Play  className="h-6 w-6 text-white ml-0.5" />}
          <span className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
        </button>

        {/* Skip */}
        <button
          onClick={skip}
          aria-label={phase === "work" ? "Skip to break" : "Skip to work session"}
          className={[
            "h-12 w-12 rounded-2xl grid place-items-center",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-white/[0.08] active:scale-[0.93]",
            "transition-all duration-150",
          ].join(" ")}
          style={{
            background: "oklch(1 0 0 / 0.05)",
            border: "1px solid oklch(1 0 0 / 0.09)",
            boxShadow: "0 1px 0 oklch(1 0 0 / 0.12) inset",
          }}
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Stats card */}
      <div
        className={cn("flex items-center gap-5 px-7 py-4 rounded-2xl relative z-10 bg-gradient-to-br", cfg.bg)}
        style={{
          background: undefined,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid oklch(1 0 0 / 0.08)",
          boxShadow: "0 1px 0 oklch(1 0 0 / 0.1) inset, 0 8px 24px -8px oklch(0.06 0.02 275 / 0.45)",
        }}
      >
        <div className="text-center">
          <p className="text-3xl font-semibold font-display" style={{ letterSpacing: "-0.03em" }}>
            {pomodoroCount}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5" style={{ letterSpacing: "0.1em" }}>
            sessions
          </p>
        </div>

        <div className="w-px h-8" style={{ background: "oklch(1 0 0 / 0.1)" }} />

        <div className="text-center">
          <p className="text-3xl font-semibold font-display" style={{ letterSpacing: "-0.03em" }}>
            {pomodoroCount * WORK_MINS}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5" style={{ letterSpacing: "0.1em" }}>
            min focused
          </p>
        </div>

        {nextEvent && (
          <>
            <div className="w-px h-8" style={{ background: "oklch(1 0 0 / 0.1)" }} />
            <div className="min-w-0 max-w-[120px]">
              <p className="text-sm font-medium truncate">{nextSubjectName}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {minutesToTime(nextEvent.start)}–{minutesToTime(nextEvent.end)}
              </p>
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground/40 relative z-10 tracking-wide">
        {running ? "Stay locked in." : "Press play to start."}
      </p>
    </div>
  );
}
