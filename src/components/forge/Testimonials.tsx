const quotes = [
  {
    quote: "I uploaded a blurry photo of my timetable and Forge built my whole semester in a minute. Wild.",
    name: "Amara O.",
    role: "CS undergrad, 2nd year",
  },
  {
    quote: "Finally a planner that actually understands students. The AI study plan literally saved my finals.",
    name: "Daniel K.",
    role: "Med school, year 3",
  },
  {
    quote: "It feels like Linear and Notion had a baby — but for school. The voice input is magic.",
    name: "Priya S.",
    role: "Engineering, MSc",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-24 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium text-primary-glow">Loved by students</p>
          <h2 className="mt-2 text-3xl sm:text-5xl font-semibold">
            Built with the people <span className="text-gradient">who live it.</span>
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          {quotes.map((q) => (
            <figure key={q.name} className="ring-gradient glass rounded-2xl p-6">
              <blockquote className="text-base leading-relaxed">“{q.quote}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-primary grid place-items-center text-primary-foreground text-sm font-semibold">
                  {q.name[0]}
                </div>
                <div>
                  <div className="text-sm font-medium">{q.name}</div>
                  <div className="text-xs text-muted-foreground">{q.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
