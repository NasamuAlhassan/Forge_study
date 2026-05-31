import { Upload, Mic, Brain, CalendarRange, Flame, LineChart } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Smart timetable import",
    desc: "Drop a screenshot, PDF, or photo. Forge extracts every class — course, lecturer, venue, time — in seconds.",
  },
  {
    icon: Mic,
    title: "Voice-first scheduling",
    desc: "Just say it: “I have Calculus on Monday from 8 to 10.” Forge transcribes and structures it instantly.",
  },
  {
    icon: Brain,
    title: "AI study plan generator",
    desc: "Balanced sessions tuned to your free periods, exam dates, sleep, and focus style — not generic templates.",
  },
  {
    icon: CalendarRange,
    title: "Beautiful interactive calendar",
    desc: "Drag, resize, recur. Color-coded subjects, free-time highlighting, weekly + daily views.",
  },
  {
    icon: Flame,
    title: "Streaks & focus stats",
    desc: "Stay consistent with study streaks, completed sessions, and weekly productivity trends.",
  },
  {
    icon: LineChart,
    title: "Adaptive optimization",
    desc: "Forge re-balances your week as exams approach, life shifts, and your energy patterns evolve.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary-glow">Built for students</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold">
            Everything you need to <span className="text-gradient">study smarter.</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Forge replaces messy notes, missed deadlines, and burnout with a calm, intelligent
            system designed around how students actually live.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative ring-gradient rounded-2xl glass p-6 hover:-translate-y-1 transition-transform duration-500 ease-out"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-11 w-11 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
