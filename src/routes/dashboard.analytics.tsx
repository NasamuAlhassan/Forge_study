import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Topbar } from "@/components/dashboard/Topbar";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { useSchedule } from "@/hooks/use-schedule";
import { useTheme } from "@/hooks/use-theme";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, BookOpen, Clock, Zap } from "lucide-react";

export const Route = createFileRoute("/dashboard/analytics")({
  component: AnalyticsPage,
});

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_COLORS: Record<string, string> = {
  class: "oklch(0.74 0.19 295)",
  study: "oklch(0.62 0.21 285)",
  exam: "oklch(0.65 0.22 25)",
  break: "oklch(0.60 0.06 280)",
};

const SUBJECT_COLORS = [
  "oklch(0.74 0.19 295)",
  "oklch(0.62 0.21 285)",
  "oklch(0.72 0.18 200)",
  "oklch(0.68 0.20 145)",
  "oklch(0.70 0.22 50)",
  "oklch(0.65 0.22 25)",
  "oklch(0.78 0.16 320)",
];

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3">
      <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center">
        <CalendarDays className="h-6 w-6 text-primary/60" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        No schedule data yet.
        <br />
        Import a timetable to see analytics.
      </p>
    </div>
  );
}

function AnalyticsPage() {
  const { events, subjects, hasData } = useSchedule();
  const { theme } = useTheme();

  const tooltipStyle = {
    background: theme === "light" ? "oklch(0.98 0.01 280)" : "oklch(0.20 0.04 275)",
    border: `1px solid ${theme === "light" ? "oklch(0.88 0.03 280)" : "oklch(1 0 0 / 0.08)"}`,
    borderRadius: 12,
    color: theme === "light" ? "oklch(0.20 0.04 275)" : "oklch(0.95 0.01 280)",
  };

  const axisColor = theme === "light" ? "oklch(0.45 0.03 280)" : "oklch(0.72 0.03 280)";
  const gridColor = theme === "light" ? "oklch(0.88 0.02 280)" : "oklch(1 0 0 / 0.06)";

  const computed = useMemo(() => {
    if (!hasData || events.length === 0) return null;

    // Hours per day of week (class + study stacked)
    const hoursByDay = DAY_LABELS.map((label, dow) => {
      const dayEvents = events.filter((e) => e.day === dow);
      const classH = round1(
        dayEvents.filter((e) => e.type === "class").reduce((s, e) => s + e.end - e.start, 0) / 60,
      );
      const studyH = round1(
        dayEvents.filter((e) => e.type === "study").reduce((s, e) => s + e.end - e.start, 0) / 60,
      );
      const totalH = round1(dayEvents.reduce((s, e) => s + e.end - e.start, 0) / 60);
      return { d: label, class: classH, study: studyH, total: totalH };
    });

    // Subject distribution
    const subjectMap = new Map<string, number>();
    for (const e of events) {
      if (e.type === "class" || e.type === "study") {
        subjectMap.set(e.subjectId, (subjectMap.get(e.subjectId) ?? 0) + (e.end - e.start));
      }
    }
    const subjectHours = Array.from(subjectMap.entries())
      .map(([id, mins]) => {
        const subj = subjects.find((s) => s.id === id);
        return {
          s: subj?.code ?? subj?.name ?? id.slice(0, 6),
          name: subj?.name ?? id,
          h: round1(mins / 60),
        };
      })
      .sort((a, b) => b.h - a.h)
      .slice(0, 7);

    // Type breakdown for pie
    const typeMins: Record<string, number> = { class: 0, study: 0, exam: 0, break: 0 };
    for (const e of events) {
      typeMins[e.type] = (typeMins[e.type] ?? 0) + (e.end - e.start);
    }
    const typeBreakdown = Object.entries(typeMins)
      .filter(([, mins]) => mins > 0)
      .map(([type, mins]) => ({
        name: type.charAt(0).toUpperCase() + type.slice(1),
        type,
        value: round1(mins / 60),
      }));

    // Summary metrics
    const totalMins = events.reduce((s, e) => s + e.end - e.start, 0);
    const studyMins = events
      .filter((e) => e.type === "study")
      .reduce((s, e) => s + e.end - e.start, 0);
    const activeDays = new Set(events.map((e) => e.day)).size;
    const studySessions = events.filter((e) => e.type === "study").length;

    return {
      hoursByDay,
      subjectHours,
      typeBreakdown,
      totalMins,
      studyMins,
      activeDays,
      studySessions,
    };
  }, [events, subjects, hasData]);

  const summaryCards = computed
    ? [
        { label: "Total scheduled", value: `${round1(computed.totalMins / 60)}h`, icon: Clock },
        { label: "Active days", value: `${computed.activeDays} / 7`, icon: CalendarDays },
        { label: "Subjects", value: String(subjects.length), icon: BookOpen },
        { label: "Study sessions", value: String(computed.studySessions), icon: Zap },
      ]
    : [];

  return (
    <>
      <Topbar title="Analytics" subtitle="Your focus, consistency & study trends." />
      <main className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <StatsGrid />

        {computed && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summaryCards.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="ring-gradient glass hover-lift rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(ellipse 80% 50% at 15% 0%, oklch(1 0 0 / 0.05) 0%, transparent 65%)",
                  }}
                />
                <div
                  className="h-9 w-9 rounded-xl grid place-items-center shrink-0"
                  style={{
                    background: "var(--glass-bg-btn-dark)",
                    border:     "1px solid var(--glass-border-dark)",
                    boxShadow:  "0 1px 0 rgba(255,255,255,0.08) inset",
                  }}
                >
                  <Icon className="h-4 w-4 opacity-70" aria-hidden="true" style={{ color: "var(--foreground)" }} />
                </div>
                <div className="relative">
                  <div
                    className="text-[20px] font-semibold font-display leading-none"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {value}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Hours by day of week */}
          <div className="ring-gradient glass rounded-2xl p-5">
            <h3 className="text-base font-semibold">Hours per day of week</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Class + study time stacked</p>
            <div className="h-64 mt-4">
              {computed ? (
                <ResponsiveContainer>
                  <BarChart data={computed.hoursByDay} barCategoryGap="30%">
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="d"
                      stroke={axisColor}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={axisColor}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [`${value}h`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="class"
                      name="Class"
                      stackId="a"
                      fill={TYPE_COLORS.class}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="study"
                      name="Study"
                      stackId="a"
                      fill={TYPE_COLORS.study}
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </div>
          </div>

          {/* Subject distribution */}
          <div className="ring-gradient glass rounded-2xl p-5">
            <h3 className="text-base font-semibold">Subject distribution</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hours per subject (class + study)
            </p>
            <div className="h-64 mt-4">
              {computed && computed.subjectHours.length > 0 ? (
                <ResponsiveContainer>
                  <BarChart data={computed.subjectHours} layout="vertical" barCategoryGap="25%">
                    <CartesianGrid stroke={gridColor} horizontal={false} />
                    <XAxis
                      type="number"
                      stroke={axisColor}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                    />
                    <YAxis
                      type="category"
                      dataKey="s"
                      stroke={axisColor}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(
                        value: number,
                        _name: string,
                        props: { payload?: { name: string } },
                      ) => [`${value}h`, props.payload?.name ?? "Subject"]}
                    />
                    <Bar dataKey="h" radius={[0, 6, 6, 0]}>
                      {computed.subjectHours.map((_, i) => (
                        <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </div>
          </div>

          {/* Study hours area chart */}
          <div className="ring-gradient glass rounded-2xl p-5">
            <h3 className="text-base font-semibold">Study hours trend</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Dedicated study time by day</p>
            <div className="h-64 mt-4">
              {computed ? (
                <ResponsiveContainer>
                  <AreaChart data={computed.hoursByDay}>
                    <defs>
                      <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={TYPE_COLORS.study} stopOpacity={0.6} />
                        <stop offset="100%" stopColor={TYPE_COLORS.study} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="d"
                      stroke={axisColor}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={axisColor}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`${value}h`, "Study"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="study"
                      stroke={TYPE_COLORS.study}
                      strokeWidth={2}
                      fill="url(#studyGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </div>
          </div>

          {/* Activity type breakdown pie */}
          <div className="ring-gradient glass rounded-2xl p-5">
            <h3 className="text-base font-semibold">Activity breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Time split by event type</p>
            <div className="h-64 mt-4">
              {computed && computed.typeBreakdown.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={computed.typeBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      label={({ name, value }) => `${name} ${value}h`}
                      labelLine={false}
                    >
                      {computed.typeBreakdown.map((entry, i) => (
                        <Cell key={i} fill={TYPE_COLORS[entry.type] ?? SUBJECT_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`${value}h`, "Hours"]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
