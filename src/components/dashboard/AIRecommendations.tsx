import { Sparkles, Brain, Coffee, Sun, Calendar, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useSchedule } from "@/hooks/use-schedule";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Rec = {
  icon: React.ElementType;
  title: string;
  desc: string;
  // CSS color string for the icon container gradient
  from: string;
  to: string;
};

function buildRecs(
  events: ReturnType<typeof useSchedule>["events"],
  subjects: ReturnType<typeof useSchedule>["subjects"],
): Rec[] {
  if (events.length === 0) {
    return [
      {
        icon: Brain,
        title: "Import your timetable",
        desc: "Add your class schedule so Forge can generate recommendations tuned to your real week.",
        from: "oklch(0.62 0.21 285 / 0.25)",
        to:   "oklch(0.55 0.23 250 / 0.12)",
      },
      {
        icon: Sun,
        title: "Set up your subjects",
        desc: "Head to Settings to add your subjects with difficulty levels. Forge prioritises your toughest courses.",
        from: "oklch(0.55 0.22 250 / 0.25)",
        to:   "oklch(0.65 0.22 200 / 0.12)",
      },
    ];
  }

  const recs: Rec[] = [];
  const todayDow = (new Date().getDay() + 6) % 7;

  // 1. Upcoming exam this week
  const examEvents = events.filter((e) => e.type === "exam");
  if (examEvents.length > 0) {
    const soonExam = examEvents
      .map((e) => ({ e, daysAway: (e.day - todayDow + 7) % 7 }))
      .sort((a, b) => a.daysAway - b.daysAway)[0];
    const subj = subjects.find((s) => s.id === soonExam.e.subjectId);
    const name = subj?.name ?? soonExam.e.title;
    const when = soonExam.daysAway === 0 ? "today" : soonExam.daysAway === 1 ? "tomorrow" : `in ${soonExam.daysAway} days (${DAY_NAMES[soonExam.e.day]})`;
    recs.push({
      icon: Calendar,
      title: `Prepare for ${name}`,
      desc: `${name} exam ${when}. Make sure your revision sessions are scheduled and your notes are consolidated.`,
      from: "oklch(0.65 0.24 25 / 0.28)",
      to:   "oklch(0.72 0.22 40 / 0.12)",
    });
  }

  // 2. Hard/very-hard subject with least study time
  const hardSubjects = subjects.filter((s) => s.difficulty === "hard" || s.difficulty === "very_hard");
  if (hardSubjects.length > 0) {
    const studyMinsBySubj = new Map<string, number>();
    for (const e of events.filter((ev) => ev.type === "study")) {
      studyMinsBySubj.set(e.subjectId, (studyMinsBySubj.get(e.subjectId) ?? 0) + (e.end - e.start));
    }
    const leastStudied = hardSubjects.slice().sort(
      (a, b) => (studyMinsBySubj.get(a.id) ?? 0) - (studyMinsBySubj.get(b.id) ?? 0),
    )[0];
    const studyH = ((studyMinsBySubj.get(leastStudied.id) ?? 0) / 60).toFixed(1);
    const diff = leastStudied.difficulty!.replace("_", " ");
    recs.push({
      icon: Brain,
      title: `Front-load ${leastStudied.name}`,
      desc: `${leastStudied.name} is rated ${diff} but only has ${studyH}h blocked. Add more focus sessions before the week gets away from you.`,
      from: "oklch(0.62 0.21 285 / 0.25)",
      to:   "oklch(0.55 0.23 250 / 0.12)",
    });
  }

  // 3. Busiest day — suggest prepping the evening before
  const dayLoads = DAY_NAMES.map((name, i) => ({
    name,
    i,
    mins: events.filter((e) => e.day === i).reduce((s, e) => s + e.end - e.start, 0),
  })).filter((d) => d.mins > 0).sort((a, b) => b.mins - a.mins);

  if (dayLoads.length >= 2) {
    const busiest = dayLoads[0];
    const busiestH = (busiest.mins / 60).toFixed(1);
    const prevDay = DAY_NAMES[(busiest.i - 1 + 7) % 7];
    recs.push({
      icon: Coffee,
      title: `Heavy day on ${busiest.name} — prep ahead`,
      desc: `${busiest.name} has ${busiestH}h scheduled. Block 20 min on ${prevDay} evening to review materials so you start ready.`,
      from: "oklch(0.82 0.18 70 / 0.22)",
      to:   "oklch(0.72 0.22 40 / 0.1)",
    });
  }

  // 4. Lightest study day
  const studyByDay = DAY_NAMES.map((name, i) => ({
    name,
    mins: events.filter((e) => e.day === i && e.type === "study").reduce((s, e) => s + e.end - e.start, 0),
  })).filter((d) => d.mins > 0).sort((a, b) => a.mins - b.mins);

  if (studyByDay.length >= 2 && studyByDay[0].mins < 90) {
    const light = studyByDay[0];
    const lightH = (light.mins / 60).toFixed(1);
    recs.push({
      icon: Zap,
      title: `Extend your ${light.name} study`,
      desc: `${light.name} only has ${lightH}h of study. Another 30–45 min review session would keep your consistency solid.`,
      from: "oklch(0.60 0.18 160 / 0.25)",
      to:   "oklch(0.65 0.17 175 / 0.1)",
    });
  }

  // Fallback
  if (recs.length < 2 && subjects.length > 0) {
    const totalStudyH = events.filter((e) => e.type === "study").reduce((s, e) => s + e.end - e.start, 0) / 60;
    if (totalStudyH > 0) {
      recs.push({
        icon: Sun,
        title: "Schedule is looking balanced",
        desc: `${totalStudyH.toFixed(1)}h of study across ${subjects.length} subject${subjects.length !== 1 ? "s" : ""}. Use the Study Plan generator to fine-tune intensity.`,
        from: "oklch(0.55 0.22 250 / 0.22)",
        to:   "oklch(0.65 0.22 200 / 0.1)",
      });
    }
  }

  return recs.slice(0, 3);
}

export function AIRecommendations() {
  const { events, subjects } = useSchedule();
  const recs = useMemo(() => buildRecs(events, subjects), [events, subjects]);

  return (
    <div className="ring-gradient glass hover-lift rounded-2xl p-5 relative overflow-hidden">
      {/* Specular highlight */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 35% at 20% 0%, oklch(1 0 0 / 0.055) 0%, transparent 60%)",
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 relative">
        <div className="h-8 w-8 rounded-xl bg-gradient-primary grid place-items-center shadow-glow shrink-0 relative overflow-hidden">
          <Sparkles className="h-[14px] w-[14px] text-white" aria-hidden="true" />
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
        </div>
        <div className="min-w-0">
          <h3
            className="text-[14px] font-semibold leading-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            AI recommendations
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Based on your schedule &amp; subjects</p>
        </div>
      </div>

      {/* Recommendation cards */}
      <div className="space-y-2 relative">
        {recs.map((r, i) => (
          <div
            key={r.title}
            className="flex gap-3 p-3.5 rounded-xl relative overflow-hidden group"
            style={{
              background: `linear-gradient(135deg, ${r.from}, ${r.to})`,
              border: "1px solid oklch(1 0 0 / 0.07)",
              transition: "border-color 200ms ease, background 200ms ease",
              animationDelay: `${i * 60}ms`,
            }}
          >
            {/* Icon */}
            <div
              className="h-8 w-8 rounded-xl shrink-0 grid place-items-center mt-0.5 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${r.from.replace("/ 0.25", "/ 0.55").replace("/ 0.22", "/ 0.5")}, ${r.to.replace("/ 0.12", "/ 0.3").replace("/ 0.1", "/ 0.25")})`,
                border: "1px solid oklch(1 0 0 / 0.1)",
                boxShadow: "0 1px 0 oklch(1 0 0 / 0.15) inset",
              }}
            >
              <r.icon className="h-[14px] w-[14px] text-white/90" aria-hidden="true" />
              <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
            </div>

            <div className="min-w-0">
              <p
                className="text-[13px] font-semibold leading-snug"
                style={{ letterSpacing: "-0.01em" }}
              >
                {r.title}
              </p>
              <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                {r.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
