import { ArrowUpRight, Brain, Clock, Flame, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useSchedule } from "@/hooks/use-schedule";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_SHORT  = ["M", "T", "W", "T", "F", "S", "S"];

const SUBJECT_GRADIENTS = [
  "from-indigo-500 to-purple-500",
  "from-blue-500 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
  "from-violet-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

const tooltipStyle = {
  contentStyle: {
    background: "oklch(0.20 0.04 275)",
    border: "1px solid oklch(1 0 0 / 0.08)",
    borderRadius: 12,
    fontSize: 12,
  },
};

function fmtH(mins: number) {
  const h = mins / 60;
  return h < 0.1 ? "0h" : `${parseFloat(h.toFixed(1))}h`;
}

function r1(n: number) {
  return Math.round(n * 10) / 10;
}

// ── types ─────────────────────────────────────────────────────────────────────

type DailyRow = { d: string; study: number; class: number };
type SubjectHoursRow = { name: string; h: number; ci: number };
type SubjectSessionRow = { name: string; study: number; total: number; ci: number };
type StreakCell = { active: boolean; today: boolean };

type Computed = {
  studyMins: number;
  classMins: number;
  totalMins: number;
  activeDays: number;
  studySessions: number;
  totalEvents: number;
  focusScore: number;
  streak: number;
  bestStreak: number;
  dailyHours: DailyRow[];
  subjectStudyHours: SubjectHoursRow[];
  subjectSessions: SubjectSessionRow[];
  streakGrid: StreakCell[][];
};

// ── detail panels ─────────────────────────────────────────────────────────────

function StudyHoursDetail({ daily, subjHours }: { daily: DailyRow[]; subjHours: SubjectHoursRow[] }) {
  const chartData = daily.map((d) => ({ d: d.d, h: d.study }));
  const max = Math.max(...subjHours.map((s) => s.h), 0.01);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Study hours per day</p>
        <div className="h-44">
          <ResponsiveContainer>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.74 0.19 295)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="oklch(0.62 0.21 285)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
              <XAxis dataKey="d" stroke="oklch(0.72 0.03 280)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="oklch(0.72 0.03 280)" fontSize={11} tickLine={false} axisLine={false} unit="h" />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}h`, "Study"]} />
              <Area type="monotone" dataKey="h" stroke="oklch(0.74 0.19 295)" strokeWidth={2} fill="url(#hg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {subjHours.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">Subject breakdown</p>
          <div className="space-y-2.5">
            {subjHours.map((s) => (
              <div key={s.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate mr-2">{s.name}</span>
                  <span className="text-muted-foreground shrink-0">{s.h}h</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", SUBJECT_GRADIENTS[s.ci % SUBJECT_GRADIENTS.length])}
                    style={{ width: `${(s.h / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {subjHours.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No study sessions scheduled yet.</p>
      )}
    </div>
  );
}

function StreakDetail({ streak, bestStreak, activeDays, grid }: {
  streak: number; bestStreak: number; activeDays: number; grid: StreakCell[][];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 text-center">
        {[
          { label: "Current streak", value: `${streak} day${streak !== 1 ? "s" : ""}` },
          { label: "Best streak",    value: `${bestStreak} day${bestStreak !== 1 ? "s" : ""}` },
          { label: "Active this week", value: `${activeDays} / 7` },
        ].map((item) => (
          <div key={item.label} className="glass rounded-xl p-3">
            <div className="text-xl font-semibold font-display">{item.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-3">Past 3 weeks</p>
        <div className="space-y-1.5">
          <div className="grid grid-cols-7 gap-1.5 mb-1">
            {DAY_SHORT.map((d, i) => (
              <div key={i} className="text-center text-[10px] text-muted-foreground">{d}</div>
            ))}
          </div>
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1.5">
              {week.map((cell, di) => (
                <div
                  key={di}
                  className={cn(
                    "h-8 rounded-lg transition-all",
                    cell.today
                      ? "ring-2 ring-primary bg-gradient-primary"
                      : cell.active
                      ? "bg-gradient-to-br from-amber-500 to-rose-500"
                      : "bg-white/5"
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="glass rounded-xl p-4 text-center">
        {streak === 0 ? (
          <p className="text-sm text-muted-foreground">Add events to start your streak 🔥</p>
        ) : bestStreak > streak ? (
          <>
            <p className="text-sm font-medium">Next milestone: <span className="text-primary-glow">{bestStreak + 1} days 🔥</span></p>
            <p className="text-xs text-muted-foreground mt-1">{bestStreak - streak + 1} more day{bestStreak - streak + 1 !== 1 ? "s" : ""} to beat your best</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">🔥 You're matching your best streak!</p>
            <p className="text-xs text-muted-foreground mt-1">Keep going to set a new record</p>
          </>
        )}
      </div>
    </div>
  );
}

function FocusScoreDetail({ focusScore, daily, studyMins, classMins }: {
  focusScore: number; daily: DailyRow[]; studyMins: number; classMins: number;
}) {
  const studyH = r1(studyMins / 60);
  const classH = r1(classMins / 60);
  const total  = studyH + classH || 0.01;
  const breakdown = [
    { label: "Study time", pct: Math.round((studyH / total) * 100), color: "from-indigo-500 to-purple-500" },
    { label: "Class time", pct: Math.round((classH / total) * 100), color: "from-blue-500 to-cyan-500" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Study vs class per day</p>
        <div className="h-44">
          <ResponsiveContainer>
            <BarChart data={daily} barCategoryGap="30%">
              <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
              <XAxis dataKey="d" stroke="oklch(0.72 0.03 280)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="oklch(0.72 0.03 280)" fontSize={11} tickLine={false} axisLine={false} unit="h" />
              <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`${v}h`, name]} />
              <Bar dataKey="class" name="Class" stackId="a" fill="oklch(0.74 0.19 295)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="study" name="Study" stackId="a" fill="oklch(0.62 0.21 285)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">Time allocation</p>
          <span className="text-2xl font-bold font-display">{focusScore}<span className="text-sm font-normal text-muted-foreground">/100</span></span>
        </div>
        <div className="space-y-3">
          {breakdown.map((b) => (
            <div key={b.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{b.label}</span>
                <span className="text-muted-foreground">{b.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r", b.color)}
                  style={{ width: `${b.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionsDetail({ sessions }: { sessions: SubjectSessionRow[] }) {
  const barData = sessions.map((s) => ({
    name: s.name.length > 8 ? s.name.split(" ")[0] : s.name,
    study: s.study,
    other: s.total - s.study,
  }));
  return (
    <div className="space-y-6">
      {barData.length > 0 ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Sessions by subject</p>
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={barData} barSize={20}>
                <CartesianGrid stroke="oklch(1 0 0 / 0.06)" vertical={false} />
                <XAxis dataKey="name" stroke="oklch(0.72 0.03 280)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.72 0.03 280)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="study" name="Study" stackId="a" fill="oklch(0.62 0.21 285)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" name="Class/Other" stackId="a" fill="oklch(0.74 0.19 295 / 0.35)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">No sessions scheduled yet.</p>
      )}
      {sessions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">Per-subject breakdown</p>
          <div className="space-y-2.5">
            {sessions.map((s) => (
              <div key={s.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate mr-2">{s.name}</span>
                  <span className="text-muted-foreground shrink-0">{s.study} study · {s.total} total</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", SUBJECT_GRADIENTS[s.ci % SUBJECT_GRADIENTS.length])}
                    style={{ width: `${s.total > 0 ? (s.study / s.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── stat card config ───────────────────────────────────────────────────────────

const STAT_CONFIGS = [
  { label: "Study hours this week", icon: Clock,  accent: "from-indigo-500 to-purple-500", dialogTitle: "Study Hours",    dialogDesc: "Daily breakdown and subject distribution" },
  { label: "Streak",                icon: Flame,  accent: "from-amber-500 to-rose-500",   dialogTitle: "Study Streak",   dialogDesc: "Consistency calendar and milestones" },
  { label: "Focus score",           icon: Target, accent: "from-blue-500 to-cyan-500",    dialogTitle: "Focus Score",    dialogDesc: "Study vs class time balance" },
  { label: "Sessions this week",    icon: Brain,  accent: "from-violet-500 to-fuchsia-500", dialogTitle: "Study Sessions", dialogDesc: "Session count per subject" },
] as const;

// ── component ─────────────────────────────────────────────────────────────────

export function StatsGrid() {
  const [open, setOpen] = useState<number | null>(null);
  const { events, subjects, hasData } = useSchedule();

  const computed = useMemo((): Computed | null => {
    if (!hasData) return null;

    const studyMins  = events.filter((e) => e.type === "study").reduce((s, e) => s + e.end - e.start, 0);
    const classMins  = events.filter((e) => e.type === "class").reduce((s, e) => s + e.end - e.start, 0);
    const totalMins  = events.reduce((s, e) => s + e.end - e.start, 0);
    const activeDaySet = new Set(events.map((e) => e.day));
    const activeDays = activeDaySet.size;
    const studySessions = events.filter((e) => e.type === "study").length;
    const totalEvents = events.length;
    const focusScore = studyMins + classMins > 0
      ? Math.round((studyMins / (studyMins + classMins)) * 100)
      : 0;

    const todayDow = (new Date().getDay() + 6) % 7;

    // Streak: consecutive days backwards from today with any event
    let streak = 0;
    for (let i = 0; i < 7; i++) {
      if (activeDaySet.has((todayDow - i + 7) % 7)) streak++;
      else break;
    }

    // Best streak: longest consecutive run in the 7-day cycle
    let bestStreak = 0;
    for (let start = 0; start < 7; start++) {
      let run = 0;
      for (let i = 0; i < 7; i++) {
        if (activeDaySet.has((start + i) % 7)) run++;
        else break;
      }
      bestStreak = Math.max(bestStreak, run);
    }

    // Daily study + class hours
    const dailyHours: DailyRow[] = DAY_LABELS.map((d, i) => {
      const de = events.filter((e) => e.day === i);
      return {
        d,
        study: r1(de.filter((e) => e.type === "study").reduce((s, e) => s + e.end - e.start, 0) / 60),
        class: r1(de.filter((e) => e.type === "class").reduce((s, e) => s + e.end - e.start, 0) / 60),
      };
    });

    // Study hours per subject
    const studyBySubj = new Map<string, number>();
    for (const e of events.filter((ev) => ev.type === "study")) {
      studyBySubj.set(e.subjectId, (studyBySubj.get(e.subjectId) ?? 0) + (e.end - e.start));
    }
    const subjectStudyHours: SubjectHoursRow[] = subjects
      .map((s, i) => ({ name: s.name, h: r1((studyBySubj.get(s.id) ?? 0) / 60), ci: i }))
      .filter((s) => s.h > 0)
      .sort((a, b) => b.h - a.h);

    // Sessions (study + total) per subject
    const sessionsBySubj = new Map<string, { study: number; total: number }>();
    for (const e of events) {
      if (!sessionsBySubj.has(e.subjectId)) sessionsBySubj.set(e.subjectId, { study: 0, total: 0 });
      const cur = sessionsBySubj.get(e.subjectId)!;
      cur.total++;
      if (e.type === "study") cur.study++;
    }
    const subjectSessions: SubjectSessionRow[] = subjects
      .map((s, i) => {
        const c = sessionsBySubj.get(s.id) ?? { study: 0, total: 0 };
        return { name: s.name, study: c.study, total: c.total, ci: i };
      })
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    // 3-week streak grid (schedule is weekly recurring, so same pattern per week)
    const streakGrid: StreakCell[][] = Array.from({ length: 3 }, (_, wi) =>
      Array.from({ length: 7 }, (__, di) => ({
        active: activeDaySet.has(di),
        today: wi === 2 && di === todayDow,
      }))
    );

    return { studyMins, classMins, totalMins, activeDays, studySessions, totalEvents, focusScore, streak, bestStreak, dailyHours, subjectStudyHours, subjectSessions, streakGrid };
  }, [events, subjects, hasData]);

  const cards = computed
    ? [
        { value: fmtH(computed.studyMins),   delta: `of ${fmtH(computed.totalMins)} total scheduled` },
        { value: `${computed.streak} day${computed.streak !== 1 ? "s" : ""}`, delta: `${computed.activeDays} of 7 days active` },
        { value: String(computed.focusScore), delta: `${fmtH(computed.studyMins)} study / ${fmtH(computed.classMins)} class` },
        { value: `${computed.studySessions} / ${computed.totalEvents}`, delta: `${computed.totalEvents > 0 ? Math.round((computed.studySessions / computed.totalEvents) * 100) : 0}% are study blocks` },
      ]
    : [
        { value: "—", delta: "No schedule yet" },
        { value: "—", delta: "Add events to start" },
        { value: "—", delta: "Import a timetable" },
        { value: "—", delta: "No sessions yet" },
      ];

  const activeConfig = open !== null ? STAT_CONFIGS[open] : null;

  const DIALOG_STYLE: React.CSSProperties = {
    background: "oklch(0.18 0.04 275 / 0.97)",
    backdropFilter: "blur(40px) saturate(200%)",
    WebkitBackdropFilter: "blur(40px) saturate(200%)",
    border: "1px solid oklch(1 0 0 / 0.1)",
    boxShadow:
      "0 1px 0 oklch(1 0 0 / 0.14) inset, 0 32px 80px -16px oklch(0.04 0.02 275 / 0.88)",
    borderRadius: "20px",
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {STAT_CONFIGS.map((cfg, i) => (
          <button
            key={cfg.label}
            onClick={() => setOpen(i)}
            aria-label={`View ${cfg.label} details`}
            className="ring-gradient glass hover-lift rounded-2xl p-4 sm:p-5 text-left w-full group relative overflow-hidden active:scale-[0.97] transition-all duration-200"
          >
            {/* Specular highlight */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: "radial-gradient(ellipse 70% 35% at 20% 0%, oklch(1 0 0 / 0.06) 0%, transparent 55%)",
              }}
            />

            <div className="flex items-center justify-between relative">
              <div
                className={cn("h-9 w-9 rounded-xl bg-gradient-to-br grid place-items-center relative overflow-hidden shadow-glow", cfg.accent)}
              >
                <cfg.icon className="h-[15px] w-[15px] text-white" aria-hidden="true" />
                {/* Icon specular */}
                <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/25 to-transparent" />
              </div>
              <ArrowUpRight
                className="h-[13px] w-[13px] text-muted-foreground/50 group-hover:text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </div>

            <div
              className="mt-4 text-[22px] sm:text-[26px] font-semibold font-display relative"
              style={{ letterSpacing: "-0.03em" }}
            >
              {cards[i].value}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 relative">{cfg.label}</div>
            <div className="mt-1 text-[11px] font-medium relative" style={{ color: "oklch(0.74 0.19 295 / 0.8)" }}>
              {cards[i].delta}
            </div>
          </button>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        {activeConfig && computed && (
          <DialogContent className="max-w-lg border-0 p-6" style={DIALOG_STYLE}>
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn("h-9 w-9 rounded-xl bg-gradient-to-br grid place-items-center shadow-glow relative overflow-hidden", activeConfig.accent)}
                >
                  <activeConfig.icon className="h-[15px] w-[15px] text-white" />
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
                </div>
                <div>
                  <DialogTitle
                    className="text-[15px] font-semibold"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {activeConfig.dialogTitle}
                  </DialogTitle>
                  <p className="text-[11px] text-muted-foreground">{activeConfig.dialogDesc}</p>
                </div>
              </div>
            </DialogHeader>

            {open === 0 && <StudyHoursDetail daily={computed.dailyHours} subjHours={computed.subjectStudyHours} />}
            {open === 1 && <StreakDetail streak={computed.streak} bestStreak={computed.bestStreak} activeDays={computed.activeDays} grid={computed.streakGrid} />}
            {open === 2 && <FocusScoreDetail focusScore={computed.focusScore} daily={computed.dailyHours} studyMins={computed.studyMins} classMins={computed.classMins} />}
            {open === 3 && <SessionsDetail sessions={computed.subjectSessions} />}
          </DialogContent>
        )}
        {activeConfig && !computed && (
          <DialogContent className="max-w-lg border-0 p-6" style={DIALOG_STYLE}>
            <DialogHeader>
              <DialogTitle className="text-[15px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
                {activeConfig.dialogTitle}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-10 text-center">
              Import a timetable to see your data here.
            </p>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
