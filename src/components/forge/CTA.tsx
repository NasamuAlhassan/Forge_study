import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="relative py-24 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden ring-gradient rounded-3xl glass-strong p-10 sm:p-16 text-center shadow-elegant">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/40 blur-3xl" />
          <div className="absolute -bottom-32 right-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-semibold">
              Build a semester you can <span className="text-gradient">actually keep up with.</span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Join thousands of students using Forge to organize life, reduce stress, and study smarter.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow">
                Start free <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="glass border-white/10">
                Book a demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
