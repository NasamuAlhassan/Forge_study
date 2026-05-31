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

const typeChip: Record<EventBlock["type"], { bg: string; label: string }> = {
  class:  { bg: "bg-gradient-to-r from-indigo-500/70 to-violet-500/70",     label: "text-white" },
  study:  { bg: "bg-gradient-to-r from-violet-500/70 to-fuchsia-500/70",    label: "text-white" },
  exam:   { bg: "bg-gradient-to-r from-rose-500/80 to-orange-500/70",       label: "text-white" },
  break:  { bg: "",                                                            label: "" },
};

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
        style={{ borderBottom: "1px solid oklch(1 0 0 / 0.07)", background: "oklch(1 0 0 / 0.02)" }}
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
            style={{ borderBottom: wi < weeks.length - 1 ? "1px solid oklch(1 0 0 / 0.05)" : "none" }}
          >
            {week.map((date, di) => {
              if (!date) {
                return (
                  <div
                    key={di}
                    className="min-h-[88px]"
                    style={{ borderRight: di < 6 ? "1px solid oklch(1 0 0 / 0.05)" : "none", background: "oklch(0 0 0 / 0.02)" }}
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
                  style={{ borderRight: di < 6 ? "1px solid oklch(1 0 0 / 0.05)" : "none" }}
                >
                  <span
                    className={cn(
                      "text-[13px] font-semibold w-7 h-7 grid place-items-center rounded-full transition-all duration-150",
                      isToday
                        ? "bg-gradient-primary text-white shadow-glow text-[12px]"
                        : "group-hover:bg-white/[0.08]",
                    )}
                    style={!isToday ? { color: "oklch(0.80 0.02 280)" } : undefined}
                  >
                    {date.getDate()}
                  </span>
                  <div className="space-y-0.5 flex-1">
                    {shown.map((e) => {
                      const s = subjectById(e.subjectId);
                      const chip = typeChip[e.type];
                      const isBreak = e.type === "break";
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-md truncate relative overflow-hidden",
                            isBreak ? "text-muted-foreground/60" : "text-white",
                            !isBreak && (e.type !== "exam" ? `bg-gradient-to-r ${s.color}` : chip.bg),
                          )}
                          style={isBreak ? { background: "oklch(1 0 0 / 0.06)", border: "1px solid oklch(1 0 0 / 0.08)" } : {}}
                        >
                          {!isBreak && (
                            <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
                          )}
                          <span className="relative">{e.title}</span>
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <div
                        className="text-[10px] px-1"
                        style={{ color: "oklch(0.62 0.12 285)" }}
                      >
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
