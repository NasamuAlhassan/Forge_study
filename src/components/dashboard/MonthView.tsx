import { EVENTS, SUBJECTS, type EventBlock, type Subject } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventOccursOn(e: EventBlock, date: Date): boolean {
  const dayIdx = (date.getDay() + 6) % 7;
  return e.date ? e.date === dateString(date) : e.day === dayIdx;
}

const typeChip: Record<EventBlock["type"], string> = {
  class: "bg-gradient-to-r from-indigo-500/70 to-violet-500/70",
  study: "bg-gradient-to-r from-violet-500/70 to-fuchsia-500/70",
  exam: "bg-gradient-to-r from-rose-500/80 to-orange-500/70",
  break: "", // handled by breakChipGradient
};

/** Semantic color for break chips in the month grid. */
function breakChipGradient(title: string): string {
  const t = title.toLowerCase();
  if (/sleep|night|bed/.test(t)) return "bg-gradient-to-r from-slate-600/85 to-slate-800/80";
  if (/siesta|nap/.test(t)) return "bg-gradient-to-r from-violet-500/80 to-purple-700/75";
  if (/meal|lunch|dinner|breakfast|cook|eat|food|snack/.test(t))
    return "bg-gradient-to-r from-amber-500/85 to-orange-600/80";
  if (/gym|exercise|walk|run|jog|workout|sport/.test(t))
    return "bg-gradient-to-r from-emerald-500/85 to-teal-600/80";
  if (/social|friend|chill|hang|party|call/.test(t))
    return "bg-gradient-to-r from-pink-500/80 to-rose-600/75";
  if (/free|leisure|scroll|relax|tv|game|movie/.test(t))
    return "bg-gradient-to-r from-sky-500/75 to-cyan-600/70";
  if (/morning|routine|prep|prayer|meditat/.test(t))
    return "bg-gradient-to-r from-amber-400/80 to-yellow-500/75";
  if (/wind.?down|evening|rest/.test(t))
    return "bg-gradient-to-r from-indigo-500/75 to-blue-700/70";
  return "bg-gradient-to-r from-slate-500/80 to-slate-600/75";
}

export function MonthView({
  anchor,
  events = EVENTS,
  subjects = SUBJECTS,
  onDayClick,
}: {
  anchor: Date;
  events?: EventBlock[];
  subjects?: Subject[];
  onDayClick?: (date: Date) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const todayStr = new Date().toDateString();

  const firstDay = new Date(year, month, 1);
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<Date | null> = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const subjectById = (id: string) =>
    subjects.find((s) => s.id === id) ?? {
      id: "",
      name: "",
      code: "",
      color: "from-indigo-500 to-purple-500",
    };

  const eventsForDate = (d: Date) => events.filter((e) => eventOccursOn(e, d));

  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="ring-gradient glass rounded-2xl overflow-hidden">
      {/* Day-of-week header */}
      <div
        className="grid grid-cols-7"
        style={{
          borderBottom: "1px solid color-mix(in oklch, var(--foreground) 7%, transparent)",
          background: "color-mix(in oklch, var(--foreground) 2%, transparent)",
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-3 text-center text-[11px] font-medium tracking-wide"
            style={{ color: "oklch(0.65 0.04 280)", letterSpacing: "0.04em" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ borderTop: "none" }}>
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7"
            style={{
              borderBottom:
                wi < weeks.length - 1
                  ? "1px solid color-mix(in oklch, var(--foreground) 5%, transparent)"
                  : "none",
            }}
          >
            {week.map((date, di) => {
              if (!date) {
                return (
                  <div
                    key={di}
                    className="min-h-[88px]"
                    style={{
                      borderRight:
                        di < 6
                          ? "1px solid color-mix(in oklch, var(--foreground) 5%, transparent)"
                          : "none",
                      background: "oklch(0 0 0 / 0.02)",
                    }}
                  />
                );
              }
              const isToday = date.toDateString() === todayStr;
              const allEvts = eventsForDate(date);
              const shown = allEvts.slice(0, 3);
              const overflow = allEvts.length - 3;
              return (
                <button
                  key={di}
                  onClick={() => onDayClick?.(date)}
                  className="min-h-[88px] p-2 text-left transition-colors duration-150 flex flex-col gap-1 hover:bg-white/[0.04] group"
                  style={{
                    borderRight:
                      di < 6
                        ? "1px solid color-mix(in oklch, var(--foreground) 5%, transparent)"
                        : "none",
                  }}
                >
                  <span
                    className={cn(
                      "text-[13px] font-semibold w-7 h-7 grid place-items-center rounded-full transition-all duration-150",
                      isToday
                        ? "bg-gradient-primary text-white shadow-glow text-[12px]"
                        : "group-hover:bg-white/[0.08]",
                    )}
                    style={
                      !isToday
                        ? { color: "color-mix(in oklch, var(--foreground) 80%, transparent)" }
                        : undefined
                    }
                  >
                    {date.getDate()}
                  </span>
                  <div className="space-y-0.5 flex-1">
                    {shown.map((e) => {
                      const s = subjectById(e.subjectId);
                      const isBreak = e.type === "break";
                      const chipClass = isBreak
                        ? breakChipGradient(e.title)
                        : e.type !== "exam"
                          ? cn("bg-gradient-to-r", s.color)
                          : typeChip[e.type];
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-md truncate relative overflow-hidden text-white",
                            chipClass,
                          )}
                        >
                          <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
                          <span className="relative">{e.title}</span>
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <div className="text-[10px] px-1" style={{ color: "oklch(0.62 0.12 285)" }}>
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
