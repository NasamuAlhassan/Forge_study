import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CalendarPlus,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { generateStudyPlan } from "@/lib/ai.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSchedule, persistStudySessions, minutesToTime } from "@/hooks/use-schedule";
import { supabase } from "@/integrations/supabase/client";
import { SessionEditDialog, type EditableSession } from "@/components/dashboard/SessionEditDialog";
import { transcribeAudio } from "@/lib/forge-ai";

import type { LifeCategory, StudyPlanOption } from "@/services/ai";

type Session = {
  day: string;
  start: string;
  end: string;
  subject: string;
  focus: string;
  intensity: "light" | "moderate" | "deep";
  venue: string;
  category: LifeCategory;
};

// Study sessions: coloured by intensity
const intensityConfig: Record<Session["intensity"], { from: string; to: string; label: string }> = {
  light: {
    from: "oklch(0.60 0.18 160 / 0.22)",
    to: "oklch(0.65 0.17 175 / 0.1)",
    label: "oklch(0.72 0.15 160)",
  },
  moderate: {
    from: "oklch(0.55 0.22 250 / 0.22)",
    to: "oklch(0.62 0.21 285 / 0.1)",
    label: "oklch(0.74 0.19 295)",
  },
  deep: {
    from: "oklch(0.62 0.21 285 / 0.25)",
    to: "oklch(0.55 0.23 250 / 0.1)",
    label: "oklch(0.74 0.19 295)",
  },
};

// Life blocks: coloured by category
const categoryConfig: Record<
  Exclude<LifeCategory, "study">,
  { from: string; to: string; accent: string; tag: string }
> = {
  sleep: {
    from: "oklch(0.20 0.05 265 / 0.5)",
    to: "oklch(0.16 0.03 275 / 0.18)",
    accent: "oklch(0.62 0.10 265)",
    tag: "Sleep",
  },
  meal: {
    from: "oklch(0.60 0.19 55 / 0.24)",
    to: "oklch(0.64 0.16 44 / 0.09)",
    accent: "oklch(0.72 0.18 55)",
    tag: "Meal",
  },
  nap: {
    from: "oklch(0.48 0.13 280 / 0.24)",
    to: "oklch(0.44 0.10 270 / 0.09)",
    accent: "oklch(0.68 0.12 280)",
    tag: "Rest",
  },
  exercise: {
    from: "oklch(0.56 0.21 142 / 0.24)",
    to: "oklch(0.60 0.18 158 / 0.09)",
    accent: "oklch(0.70 0.19 144)",
    tag: "Exercise",
  },
  social: {
    from: "oklch(0.60 0.20 20 / 0.24)",
    to: "oklch(0.64 0.17 32 / 0.09)",
    accent: "oklch(0.72 0.19 22)",
    tag: "Social",
  },
  leisure: {
    from: "oklch(0.56 0.16 196 / 0.24)",
    to: "oklch(0.60 0.13 208 / 0.09)",
    accent: "oklch(0.70 0.15 198)",
    tag: "Leisure",
  },
  personal: {
    from: "oklch(0.50 0.09 242 / 0.24)",
    to: "oklch(0.46 0.07 252 / 0.09)",
    accent: "oklch(0.65 0.09 244)",
    tag: "Personal",
  },
};

function plansKey(userId: string) {
  return `forge-study-plans:${userId}`;
}

export function StudyPlanGenerator() {
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<StudyPlanOption[]>([]);
  const [selectedOption, setSelectedOption] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const generate = generateStudyPlan;
  const { user } = useAuth();
  const { subjects, events, refetch } = useSchedule();

  // Restore previously generated plans from localStorage on mount
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(plansKey(user.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as StudyPlanOption[];
      if (parsed.length > 0) {
        setOptions(parsed);
        const bi = parsed.findIndex((o) => o.name === "Balanced");
        setSelectedOption(bi >= 0 ? bi : 0);
      }
    } catch {
      /* ignore corrupt data */
    }
  }, [user?.id]);

  // Derived: the currently viewed plan
  const activePlan = options[selectedOption] ?? null;
  const sessions: Session[] = (activePlan?.sessions ?? []).map((s) => ({ ...s, venue: "" }));

  // ── Voice input ──────────────────────────────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const toggleVoice = async () => {
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) return;
        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) setContext((prev) => (prev ? `${prev}\n${text}` : text));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't transcribe audio");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const buildScheduleContext = () => {
    const lines: string[] = [];
    if (subjects.length > 0) {
      lines.push("STUDENT SUBJECTS (use ONLY these for study blocks):");
      subjects.forEach((s) => {
        const diff = s.difficulty ? ` — difficulty: ${s.difficulty.replace("_", " ")}` : "";
        const code = s.code ? ` [${s.code}]` : "";
        lines.push(`- ${s.name}${code}${diff}`);
      });
      lines.push("");
    }
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // Pass ALL existing events — never overlap any of them
    if (events.length > 0) {
      lines.push(
        "EXISTING CALENDAR (never place any block — study or life — over these time slots):",
      );
      for (let d = 0; d < 7; d++) {
        const dayEvents = events.filter((e) => e.day === d).sort((a, b) => a.start - b.start);
        if (dayEvents.length === 0) continue;
        const slots = dayEvents
          .map((e) => `${e.title} [${e.type}] ${minutesToTime(e.start)}–${minutesToTime(e.end)}`)
          .join(", ");
        lines.push(`${DAY_NAMES[d]}: ${slots}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  };

  const run = async () => {
    setLoading(true);
    setOptions([]);
    setSelectedOption(0);
    try {
      const scheduleContext = buildScheduleContext();
      const fullContext = scheduleContext
        ? `${scheduleContext}STUDENT'S ADDITIONAL NOTES:\n${context || "(none provided)"}`
        : context;
      const res = await generate(fullContext);
      const opts = res.options ?? [];
      setOptions(opts);
      // Default to Balanced if available
      const balancedIdx = opts.findIndex((o) => o.name === "Balanced");
      setSelectedOption(balancedIdx >= 0 ? balancedIdx : 0);
      // Persist so switching pages doesn't lose the plans
      if (user?.id && opts.length > 0) {
        try {
          localStorage.setItem(plansKey(user.id), JSON.stringify(opts));
        } catch {
          /* ignore quota errors */
        }
      }
      toast.success("Three plan options are ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const saveToCalendar = async () => {
    if (!user) return toast.error("Please sign in first");
    if (!activePlan || sessions.length === 0) return;
    setSaving(true);
    try {
      // Replace all existing study + break events with this plan.
      // Class events (from the timetable import) are left untouched.
      await supabase.from("events").delete().eq("user_id", user.id).in("type", ["study", "break"]);

      await persistStudySessions(user.id, sessions, subjects);
      await refetch();
      toast.success(
        `Calendar replaced with the ${activePlan.name} plan — ${sessions.length} blocks applied`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
      {/* Left: input panel */}
      <div className="ring-gradient glass hover-lift rounded-2xl p-5 relative overflow-hidden">
        {/* Specular */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 35% at 20% 0%, oklch(1 0 0 / 0.055) 0%, transparent 60%)",
          }}
        />

        <div className="flex items-center gap-3 relative">
          <div
            className="h-8 w-8 rounded-xl grid place-items-center relative overflow-hidden shrink-0"
            style={{
              background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
              boxShadow: "0 1px 0 oklch(1 0 0 / 0.2) inset",
            }}
          >
            <Brain className="h-[14px] w-[14px] text-white relative z-10" />
            <span className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-[14px] font-semibold leading-tight"
              style={{ letterSpacing: "-0.02em" }}
            >
              Tell Forge about your life
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sleep, meals, gym, social life, study goals — the full picture.
            </p>
          </div>

          {/* Mic button */}
          <button
            type="button"
            onClick={toggleVoice}
            disabled={transcribing}
            title={listening ? "Stop recording" : "Speak your context"}
            className="h-9 w-9 rounded-xl grid place-items-center transition-all duration-200 shrink-0 relative overflow-hidden"
            style={
              listening
                ? {
                    background: "linear-gradient(135deg, oklch(0.65 0.24 25), oklch(0.58 0.26 15))",
                    boxShadow:
                      "0 0 16px -4px oklch(0.65 0.24 25 / 0.6), 0 1px 0 oklch(1 0 0 / 0.2) inset",
                    border: "1px solid oklch(1 0 0 / 0.12)",
                  }
                : transcribing
                  ? {
                      background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)",
                      opacity: 0.5,
                      cursor: "wait",
                    }
                  : {
                      background: "color-mix(in oklch, var(--foreground) 5%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--foreground) 9%, transparent)",
                      boxShadow: "0 1px 0 oklch(1 0 0 / 0.1) inset",
                    }
            }
          >
            {transcribing ? (
              <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            ) : listening ? (
              <MicOff className="h-3.5 w-3.5 text-white" />
            ) : (
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {listening && (
              <span className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
            )}
          </button>
        </div>

        {listening && (
          <p
            className="mt-2 text-[11px] flex items-center gap-1.5 relative"
            style={{ color: "oklch(0.65 0.24 25)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full inline-block"
              style={{
                background: "oklch(0.65 0.24 25)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
            Recording — tap the mic to stop
          </p>
        )}

        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={12}
          placeholder={
            "Describe your week — e.g.\n\nCourses: Calculus II (hard), Data Structures (medium).\nSleep: 11pm–7am. Wake up: 6:30am. Best focus: mornings.\nGoal: 20h study/week. Exam in 3 weeks: Calculus II.\nLife: gym Mon/Wed/Fri at 6pm, lunch with friends on Wed,\n  usually cook dinner, like to scroll in the evening.\n  Need downtime — don't pack every hour."
          }
          className="mt-4 w-full rounded-xl p-3 text-[13px] outline-none resize-none placeholder:text-muted-foreground/40 transition-all duration-200 relative"
          style={{
            background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
            border: "1px solid color-mix(in oklch, var(--foreground) 9%, transparent)",
            boxShadow: "0 1px 0 oklch(1 0 0 / 0.07) inset",
            color: "inherit",
          }}
          onFocus={(e) => {
            e.currentTarget.style.border = "1px solid oklch(0.62 0.21 285 / 0.5)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px oklch(0.62 0.21 285 / 0.12), 0 1px 0 oklch(1 0 0 / 0.07) inset";
          }}
          onBlur={(e) => {
            e.currentTarget.style.border =
              "1px solid color-mix(in oklch, var(--foreground) 9%, transparent)";
            e.currentTarget.style.boxShadow = "0 1px 0 oklch(1 0 0 / 0.07) inset";
          }}
        />

        <button
          onClick={run}
          disabled={loading}
          className="mt-4 w-full h-10 rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold text-white relative overflow-hidden hover:brightness-110 active:scale-[0.98] disabled:opacity-60 transition-all duration-150"
          style={{
            background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
            boxShadow: loading
              ? "none"
              : "0 0 24px -6px oklch(0.62 0.21 285 / 0.55), 0 1px 0 oklch(1 0 0 / 0.2) inset",
          }}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" /> Generate study plan
            </>
          )}
          <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
        </button>
      </div>

      {/* Right: generated sessions */}
      <div className="ring-gradient glass hover-lift rounded-2xl p-5 relative overflow-hidden">
        {/* Specular */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 35% at 80% 0%, oklch(1 0 0 / 0.045) 0%, transparent 60%)",
          }}
        />

        {/* Header row */}
        <div className="flex items-center justify-between gap-2 relative">
          <h3 className="text-[15px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
            Generated sessions
          </h3>
          {options.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={run}
                disabled={loading}
                className="h-8 px-3 rounded-xl text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] disabled:opacity-50 transition-all duration-150"
                style={{
                  border: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)",
                }}
              >
                Regenerate
              </button>
              <button
                onClick={saveToCalendar}
                disabled={saving || sessions.length === 0}
                className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[12px] font-semibold text-white relative overflow-hidden hover:brightness-110 active:scale-[0.97] disabled:opacity-60 transition-all duration-150"
                style={{
                  background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
                  boxShadow: "0 1px 0 oklch(1 0 0 / 0.2) inset",
                }}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <CalendarPlus className="h-3.5 w-3.5" /> Apply to calendar
                  </>
                )}
                <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
              </button>
            </div>
          )}
        </div>

        {/* Plan option selector tabs */}
        {options.length > 1 && (
          <div
            className="mt-3 flex gap-1.5 relative p-1 rounded-xl"
            style={{
              background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
              border: "1px solid color-mix(in oklch, var(--foreground) 7%, transparent)",
            }}
          >
            {options.map((opt, idx) => {
              const isActive = idx === selectedOption;
              const labelColor =
                opt.name === "Intensive"
                  ? "oklch(0.70 0.19 25)"
                  : opt.name === "Balanced"
                    ? "oklch(0.74 0.19 295)"
                    : "oklch(0.72 0.15 160)";
              return (
                <button
                  key={opt.name}
                  onClick={() => setSelectedOption(idx)}
                  className="flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all duration-200 relative overflow-hidden"
                  style={
                    isActive
                      ? {
                          background: "oklch(0.62 0.21 285 / 0.18)",
                          border: "1px solid oklch(0.62 0.21 285 / 0.28)",
                          color: labelColor,
                          boxShadow: "0 1px 0 oklch(1 0 0 / 0.12) inset",
                        }
                      : {
                          background: "transparent",
                          border: "1px solid transparent",
                          color: "color-mix(in oklch, var(--foreground) 40%, transparent)",
                        }
                  }
                >
                  {opt.name}
                  {isActive && (
                    <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Active plan rationale */}
        {activePlan?.rationale && (
          <div
            className="mt-3 p-3 rounded-xl relative overflow-hidden"
            style={{
              background: "oklch(0.62 0.21 285 / 0.06)",
              border: "1px solid oklch(0.62 0.21 285 / 0.15)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="h-3 w-3 shrink-0" style={{ color: "oklch(0.74 0.19 295)" }} />
              <span className="text-[11px] font-semibold" style={{ color: "oklch(0.74 0.19 295)" }}>
                Why this plan
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {activePlan.rationale}
            </p>
          </div>
        )}

        <div className="mt-3 space-y-2 max-h-[22rem] overflow-y-auto pr-1 relative">
          {options.length === 0 && !loading && (
            <div
              className="text-[13px] text-muted-foreground/50 py-16 text-center rounded-2xl"
              style={{
                border: "1px dashed color-mix(in oklch, var(--foreground) 9%, transparent)",
              }}
            >
              Your AI study plans will appear here.
            </div>
          )}

          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] rounded-xl animate-pulse"
                style={{
                  background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}

          {sessions.map((s, i) => {
            const isStudy = !s.category || s.category === "study";
            const studyCfg = isStudy ? intensityConfig[s.intensity] : null;
            const lifeCfg = !isStudy
              ? categoryConfig[s.category as Exclude<LifeCategory, "study">]
              : null;
            const fromColor = studyCfg?.from ?? lifeCfg?.from ?? intensityConfig.moderate.from;
            const toColor = studyCfg?.to ?? lifeCfg?.to ?? intensityConfig.moderate.to;
            const accentColor =
              studyCfg?.label ?? lifeCfg?.accent ?? intensityConfig.moderate.label;

            return (
              <div
                key={`${selectedOption}-${i}`}
                className="group relative p-3 rounded-xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${fromColor}, ${toColor})`,
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  boxShadow: "0 1px 0 oklch(1 0 0 / 0.1) inset",
                }}
              >
                <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

                <div className="flex items-center justify-between text-[11px] relative">
                  <span
                    className="font-bold uppercase tracking-wider"
                    style={{ letterSpacing: "0.06em", color: accentColor }}
                  >
                    {s.day}
                  </span>
                  <span className="text-muted-foreground">
                    {s.start}–{s.end}
                  </span>
                </div>
                <div
                  className="mt-1 text-[13px] font-semibold relative"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {s.subject}
                </div>
                <div className="text-[12px] text-muted-foreground relative">{s.focus}</div>
                <div
                  className="mt-1 text-[10px] uppercase tracking-wider relative"
                  style={{ color: accentColor, letterSpacing: "0.07em", opacity: 0.7 }}
                >
                  {isStudy ? `${s.intensity} focus` : (lifeCfg?.tag ?? s.category)}
                </div>

                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {isStudy && (
                    <button
                      onClick={() => setEditIdx(i)}
                      className="h-7 w-7 grid place-items-center rounded-lg transition-all duration-150 hover:scale-105 active:scale-95"
                      style={{ background: "oklch(0 0 0 / 0.3)", backdropFilter: "blur(8px)" }}
                      aria-label="Edit session"
                    >
                      <Pencil className="h-3 w-3 text-white/80" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setOptions((prev) =>
                        prev.map((opt, oi) =>
                          oi === selectedOption
                            ? { ...opt, sessions: opt.sessions.filter((_, si) => si !== i) }
                            : opt,
                        ),
                      );
                    }}
                    className="h-7 w-7 grid place-items-center rounded-lg transition-all duration-150 hover:scale-105 active:scale-95"
                    style={{ background: "oklch(0 0 0 / 0.3)", backdropFilter: "blur(8px)" }}
                    aria-label="Remove block"
                  >
                    <Trash2 className="h-3 w-3 text-rose-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SessionEditDialog
        open={editIdx !== null}
        initial={editIdx !== null ? sessions[editIdx] : null}
        title="Edit study session"
        onClose={() => setEditIdx(null)}
        onSave={(updated: EditableSession) => {
          setOptions((prev) =>
            prev.map((opt, oi) =>
              oi === selectedOption
                ? {
                    ...opt,
                    sessions: opt.sessions.map((s, si) =>
                      si === editIdx ? { ...s, ...updated } : s,
                    ),
                  }
                : opt,
            ),
          );
          toast.success("Session updated");
        }}
        onDelete={() => {
          setOptions((prev) =>
            prev.map((opt, oi) =>
              oi === selectedOption
                ? { ...opt, sessions: opt.sessions.filter((_, si) => si !== editIdx) }
                : opt,
            ),
          );
          toast.success("Session removed");
        }}
      />
    </div>
  );
}
