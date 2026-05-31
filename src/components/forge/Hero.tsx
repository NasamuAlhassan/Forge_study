import { ArrowRight, Upload, Mic, Calendar } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import dashboardPreview from "@/assets/dashboard-preview.jpg";

export function Hero() {
  return (
    <section className="relative pt-36 pb-24 overflow-hidden bg-hero">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[640px] w-[640px] rounded-full bg-primary/30 blur-3xl animate-glow-pulse" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-accent/30 blur-3xl animate-glow-pulse" style={{ animationDelay: "1.5s" }} />
      <div className="absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />

      <div className="relative mx-auto max-w-6xl px-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs text-muted-foreground animate-fade-up">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-glow animate-pulse" />
          AI academic operating system · for students
        </div>

        <h1 className="mt-6 font-display text-4xl sm:text-6xl lg:text-7xl font-semibold leading-[1.05] animate-fade-up" style={{ animationDelay: "0.1s" }}>
          Turn chaotic schedules into{" "}
          <span className="text-gradient">structured study systems.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground animate-fade-up" style={{ animationDelay: "0.2s" }}>
          Forge uses AI to transform screenshots, PDFs, and routines into personalized
          academic plans students can actually follow.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: "0.3s" }}>
          <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow" asChild>
            <Link to="/dashboard">
              Start forging — it's free
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="glass border-white/10" asChild>
            <Link to="/dashboard">Watch demo</Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground animate-fade-up" style={{ animationDelay: "0.4s" }}>
          <span className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload timetables</span>
          <span className="flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" /> Speak your routine</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> AI-generated study plans</span>
        </div>

        {/* Dashboard preview */}
        <div className="relative mt-16 animate-fade-up" style={{ animationDelay: "0.5s" }}>
          <div className="absolute -inset-8 bg-gradient-primary/30 blur-3xl rounded-full" />
          <div className="relative ring-gradient rounded-2xl overflow-hidden shadow-elegant">
            <img
              src={dashboardPreview}
              alt="Forge dashboard preview showing AI-generated weekly study plan"
              width={1920}
              height={1080}
              className="w-full h-auto"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>

          {/* Floating badges */}
          <div className="hidden md:flex absolute -left-6 top-1/3 glass-strong rounded-xl px-4 py-3 items-center gap-3 animate-float shadow-elegant">
            <div className="h-9 w-9 rounded-lg bg-gradient-primary grid place-items-center"><Upload className="h-4 w-4 text-primary-foreground" /></div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground">Imported timetable</div>
              <div className="text-sm font-medium">12 classes detected</div>
            </div>
          </div>
          <div className="hidden md:flex absolute -right-6 bottom-1/4 glass-strong rounded-xl px-4 py-3 items-center gap-3 animate-float shadow-elegant" style={{ animationDelay: "1.2s" }}>
            <div className="h-9 w-9 rounded-lg bg-accent grid place-items-center"><Calendar className="h-4 w-4 text-accent-foreground" /></div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground">Generated plan</div>
              <div className="text-sm font-medium">18h deep focus / week</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
