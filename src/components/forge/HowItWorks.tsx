import { Upload, Sparkles, CalendarCheck } from "lucide-react";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Drop your timetable",
    desc: "Snap a photo, upload a PDF, or simply talk. Forge accepts whatever chaos you have.",
  },
  {
    icon: Sparkles,
    step: "02",
    title: "AI extracts & organizes",
    desc: "Courses, venues, lecturers, recurrence — parsed and structured into a clean weekly grid.",
  },
  {
    icon: CalendarCheck,
    step: "03",
    title: "Your study plan, ready",
    desc: "Personalized blocks fit around free periods, sleep, and exams. Edit anything, regenerate anytime.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative py-24 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium text-primary-glow">How it works</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold">
            From screenshot to <span className="text-gradient">study system</span> in 60 seconds.
          </h2>
        </div>

        <div className="relative mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          {steps.map((s) => (
            <div key={s.step} className="relative ring-gradient rounded-2xl glass p-7 text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow relative z-10">
                <s.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="mt-4 text-xs tracking-widest text-muted-foreground">STEP {s.step}</div>
              <h3 className="mt-1 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
