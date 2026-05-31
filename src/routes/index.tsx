import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/forge/Navbar";
import { Hero } from "@/components/forge/Hero";
import { Features } from "@/components/forge/Features";
import { HowItWorks } from "@/components/forge/HowItWorks";
import { Testimonials } from "@/components/forge/Testimonials";
import { Pricing } from "@/components/forge/Pricing";
import { FAQ } from "@/components/forge/FAQ";
import { CTA } from "@/components/forge/CTA";
import { Footer } from "@/components/forge/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forge — AI study plans from any timetable" },
      { name: "description", content: "Forge turns screenshots, PDFs, and routines into personalized study plans students actually follow. The AI academic OS." },
      { property: "og:title", content: "Forge — AI study plans from any timetable" },
      { property: "og:description", content: "Turn chaotic schedules into structured study systems with AI." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
