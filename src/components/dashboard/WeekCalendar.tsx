import { Upload } from "lucide-react";
import {
  DAYS,
  EVENTS,
  SUBJECTS,
  subjectById as demoSubjectById,
  type EventBlock,
  type Subject,
} from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7..23
const HOUR_PX = 56;
const DAY_START = 7 * 60;

const typeStyle: Record<EventBlock["type"], string> = {
  class: "bg-gradient-to-br shadow-glow",
  study: "bg-gradient-to-br opacity-90",
  break: "bg-gradient-to-br",
  exam: "bg-gradient-to-br from-rose-500 to-orange-500 shadow-glow",
};

/** Maps a break event title to a readable, semantically appropriate gradient. */
function breakGradient(title: string): string {
  const t = title.toLowerCase();
  if (/sleep|night|bed/.test(t)) return "from-slate-600/90 to-slate-800/85";
  if (/siesta|nap/.test(t)) return "from-violet-500/85 to-purple-700/80";
  if (/meal|lunch|dinner|breakfast|cook|eat|food|snack/.test(t))
    return "from-amber-500/90 to-orange-600/85";
  if (/gym|exercise|walk|run|jog|workout|sport/.test(t))
    return "from-emerald-500/90 to-teal-600/85";
  if (/social|friend|chill|hang|party|call/.test(t)) return "from-pink-500/85 to-rose-600/80";
  if (/free|leisure|scroll|relax|tv|game|movie/.test(t)) return "from-sky-500/80 to-cyan-600/75";
  if (/morning|routine|prep|prayer|meditat/.test(t)) return "from-amber-400/85 to-yellow-500/80";
  if (/wind.?down|evening|rest/.test(t)) return "from-indigo-500/80 to-blue-700/75";
  return "from-slate-500/85 to-slate-600/80";
}

function getMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventOccursOn(e: EventBlock, date: Date): boolean {
  const dayIdx = (date.getDay() + 6) % 7;
  return e.date ? e.date === dateString(date) : e.day === dayIdx;
}

export function WeekCalendar({
  events = EVENTS,
  subjects = SUBJECTS,
  onEventClick,
  onSlotClick,
  weekStart,
}: {
  events?: EventBlock[];
  subjects?: Subject[];
  onEventClick?: (e: EventBlock) => void;
  onSlotClick?: (day: number, startMinute: number) => void;
  weekStart?: Date;
}) {
  const subjectById = (id: string) =>
    subjects.find((s) => s.id === id) ??
    demoSubjectById(id) ??
    subjects[0] ?? { id: "", name: "", code: "", color: "from-indigo-500 to-purple-500" };

  const monday = weekStart
    ? (() => {
        const m = new Date(weekStart);
        m.setHours(0, 0, 0, 0);
        return m;
      })()
    : getMonday(new Date());
  const weekDates = DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const todayStr = new Date().toDateString();

  return (
    <div className="ring-gradient glass rounded-2xl overflow-hidden">
      {/* Single scroll container — scrolls both X and Y, header sticks at top */}
      <div className="overflow-auto relative" style={{ maxHeight: "min(65vh, 600px)" }}>
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 grid grid-cols-[60px_repeat(7,1fr)] min-w-[520px]"
          style={{
            borderBottom: "1px solid var(--glass-border-dark)",
            background:   "var(--glass-bg-dark)",
            backdropFilter:        "blur(12px)",
            WebkitBackdropFilter:  "blur(12px)",
          }}
        >
          <div />
          {DAYS.map((d, i) => {
            const isToday = weekDates[i].toDateString() === todayStr;
            return (
              <div key={d} className="px-2 py-3 text-center">
                <div
                  className="text-[11px] font-medium tracking-wide"
                  style={{
                    color: isToday ? "oklch(0.74 0.19 295)" : "oklch(0.68 0.03 280)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {d}
                </div>
                <div
                  className={cn(
                    "text-[15px] font-semibold font-display mt-0.5",
                    isToday
                      ? "h-7 w-7 rounded-full bg-gradient-primary text-white grid place-items-center mx-auto text-[13px] shadow-glow"
                      : "text-foreground",
                  )}
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {weekDates[i].getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state overlay */}
        {events.length === 0 && (
          <div className="absolute inset-x-0 top-[30%] flex flex-col items-center justify-center gap-3 py-10 pointer-events-none z-10">
            <div
              className="h-12 w-12 rounded-2xl grid place-items-center"
              style={{
                background: "oklch(0.62 0.21 285 / 0.1)",
                border: "1px solid oklch(0.62 0.21 285 / 0.18)",
              }}
            >
              <Upload className="h-5 w-5 text-primary/60" aria-hidden="true" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-medium text-foreground/60">No schedule yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Import a timetable to see your week
              </p>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="relative grid grid-cols-[60px_repeat(7,1fr)] min-w-[520px]">
          {/* Hours column */}
          <div style={{ borderRight: "1px solid var(--border)" }}>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_PX }}
                className="text-[10px] text-muted-foreground/50 text-right pr-2 pt-1"
              >
                {h.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((_, dayIdx) => (
            <div
              key={dayIdx}
              className="relative last:border-r-0 overflow-hidden"
              style={{ borderRight: "1px solid var(--border)" }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{ height: HOUR_PX, borderBottom: "1px solid var(--border)" }}
                  onClick={() => onSlotClick?.(dayIdx, h * 60)}
                  className={`transition-colors duration-150 ${onSlotClick ? "cursor-pointer hover:bg-white/[0.05]" : "hover:bg-white/[0.02]"}`}
                />
              ))}
              {events
                .filter((e) => {
                  if (!eventOccursOn(e, weekDates[dayIdx])) return false;
                  const top = ((e.start - DAY_START) / 60) * HOUR_PX;
                  const height = ((e.end - e.start) / 60) * HOUR_PX - 4;
                  // Skip events before/after the grid or with invalid times
                  return top >= 0 && height > 4;
                })
                .map((e) => {
                  const top = ((e.start - DAY_START) / 60) * HOUR_PX;
                  const height = ((e.end - e.start) / 60) * HOUR_PX - 4;
                  const subj = subjectById(e.subjectId);
                  const isBreak = e.type === "break";
                  const isExam = e.type === "exam";

                  // Determine gradient classes
                  return (
                    <div
                      key={e.id}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onEventClick?.(e);
                      }}
                      style={{ top, height, position: "absolute", left: "3px", right: "3px" }}
                      className="glass-event-tile p-1.5 group"
                    >
                      {/* Specular overlay */}
                      <span className="absolute inset-0 rounded-[8px] bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                      <div
                        className="font-semibold truncate text-[11px] relative leading-tight"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {e.title}
                      </div>
                      {height > 24 && (
                        <div className="truncate text-[10px] relative opacity-60 mt-0.5">
                          {Math.floor(e.start / 60).toString().padStart(2, "0")}
                          :{(e.start % 60).toString().padStart(2, "0")}
                          {e.venue ? ` · ${e.venue}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
