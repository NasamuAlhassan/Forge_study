import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Student",
    price: "Free",
    desc: "Everything you need to plan your semester.",
    features: ["Unlimited timetable imports", "AI study plan generator", "Calendar & streaks", "Mobile responsive"],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$6",
    suffix: "/mo",
    desc: "For students who want the full Forge experience.",
    features: ["Everything in Student", "Voice scheduling unlimited", "Adaptive optimization", "Google / Apple Calendar sync", "AI study coach chat"],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Campus",
    price: "Custom",
    desc: "Bring Forge to your school or program.",
    features: ["Org admin dashboard", "Bulk onboarding", "Priority support", "Custom integrations"],
    cta: "Contact sales",
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium text-primary-glow">Pricing</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold">
            Free to start. <span className="text-gradient">Built to scale with you.</span>
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl p-7 ring-gradient ${
                t.highlight ? "glass-strong shadow-elegant" : "glass"
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] tracking-widest font-semibold uppercase rounded-full bg-gradient-primary px-3 py-1 text-primary-foreground shadow-glow">
                  Most popular
                </div>
              )}
              <div className="text-sm text-muted-foreground">{t.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <div className="text-4xl font-semibold font-display">{t.price}</div>
                {t.suffix && <span className="text-sm text-muted-foreground">{t.suffix}</span>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              <Button
                className={`mt-6 w-full ${t.highlight ? "bg-gradient-primary hover:opacity-90 shadow-glow" : ""}`}
                variant={t.highlight ? "default" : "outline"}
              >
                {t.cta}
              </Button>
              <ul className="mt-6 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary-glow mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
