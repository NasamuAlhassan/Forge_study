import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  { q: "How does Forge extract my timetable?", a: "Upload a screenshot, photo, or PDF. Our AI vision pipeline parses course names, lecturers, venues, and times — then lets you confirm before saving." },
  { q: "Can I use voice instead of typing?", a: "Yes. Tap the mic and speak naturally — Forge transcribes, structures, and adds events to your calendar automatically." },
  { q: "Does the AI plan adapt over time?", a: "It does. As exams approach or your week shifts, Forge rebalances study sessions to keep you on track without burnout." },
  { q: "Will it sync with Google or Apple Calendar?", a: "Yes — export ICS files or connect Google, Apple, and Outlook calendars on the Pro plan." },
  { q: "Is it really free?", a: "The Student plan is free forever. Pro unlocks unlimited voice scheduling, adaptive optimization, calendar sync, and the AI study coach." },
];

export function FAQ() {
  return (
    <section id="faq" className="relative py-24 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-medium text-primary-glow">FAQ</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold">Questions, answered.</h2>
        </div>
        <Accordion type="single" collapsible className="mt-10 ring-gradient glass rounded-2xl px-6">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-white/5 last:border-0">
              <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
