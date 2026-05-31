import { EVENTS, SUBJECTS, type EventBlock, type Subject } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6..22
const HOUR_PX = 64;
const DAY_START = 6 * 60;

const typeStyle: Record<EventBlock["type"], string> = {
  class: "bg-gradient-to-br shadow-glow",
  study: "bg-gradient-to-br opacity-90",
  break: "",
  exam: "bg-gradient-to-br from-rose-500 to-orange-500 shadow-glow",
};

function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventOccursOn(e: EventBlock, date: Date, dayIdx: number): boolean {
  return e.date ? e.date === dateString(date) : e.day === dayIdx;
}

export function DayView({
  date,
  events = EVENTS,
  subjects = SUBJECTS,
  onEventClick,
  onSlotClick,
}: {
  date: Date;
  events?: EventBlock[];
  subjects?: Subject[];
  onEventClick?: (e: EventBlock) => void;
  onSlotClick?: (day: number, startMinute: number) => void;
}) {
  const dayIdx = (date.getDay() + 6) % 7;
  const dayEvents = events.filter((e) => eventOccursOn(e, date, dayIdx));
  const subjectById = (id: string) =>
    subjects.find((s) => s.id === id) ?? {
      id: "",
      name: "",
      code: "",
      color: "from-indigo-500 to-purple-500",
    };

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = date.toDateString() === new Date().toDateString();
  const nowTop = isToday ? ((nowMins - DAY_START) / 60) * HOUR_PX : null;

  return (
    <div className="ring-gradient glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid oklch(1 0 0 / 0.07)", background: "oklch(1 0 0 / 0.02)" }}
      >
        <div
          className="h-12 w-12 rounded-2xl grid place-items-center shrink-0"
          style={
            isToday
              ? {
                  background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
                  boxShadow: "0 0 20px -4px oklch(0.62 0.21 285 / 0.5), 0 1px 0 oklch(1 0 0 / 0.2) inset",
                  color: "white",
                }
              : {
                  background: "oklch(1 0 0 / 0.05)",
                  border: "1px solid oklch(1 0 0 / 0.09)",
                  boxShadow: "0 1px 0 oklch(1 0 0 / 0.08) inset",
                }
          }
        >
          <span
            className="font-display font-bold text-lg leading-none"
            style={{ letterSpacing: "-0.02em" }}
          >
            {date.getDate()}
          </span>
        </div>
        <div>
          <div
            className="text-[17px] font-semibold font-display"
            style={{ letterSpacing: "-0.02em" }}
          >
            {date.toLocaleDateString("en-US", { weekday: "long" })}
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            {date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
        </div>
        <div
          className="ml-auto text-[12px] px-2.5 py-1 rounded-lg"
          style={{
            background: "oklch(1 0 0 / 0.05)",
            color: "oklch(0.68 0.03 280)",
            border: "1px solid oklch(1 0 0 / 0.08)",
          }}
        >
          {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
        <div className="relative flex" style={{ height: HOURS.length * HOUR_PX }}>
          {/* Hour labels */}
          <div
            className="w-16 shrink-0 relative"
            style={{ borderRight: "1px solid oklch(1 0 0 / 0.06)" }}
          >
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ top: (h - 6) * HOUR_PX }}
                className="absolute right-2 text-[10px] text-muted-foreground/45 -translate-y-2"
              >
                {h.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Events column */}
          <div className="flex-1 relative">
            {/* Hour grid lines */}
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ top: (h - 6) * HOUR_PX, height: HOUR_PX, borderBottom: "1px solid oklch(1 0 0 / 0.05)" }}
                onClick={() => onSlotClick?.(dayIdx, h * 60)}
                className={`absolute inset-x-0 transition-colors ${onSlotClick ? "cursor-pointer hover:bg-white/[0.05]" : "hover:bg-white/[0.02]"}`}
              />
            ))}

            {/* Current time line */}
            {nowTop !== null && nowTop >= 0 && (
              <div
                style={{ top: nowTop }}
                className="absolute inset-x-0 z-10 flex items-center pointer-events-none"
              >
                <div
                  className="h-2.5 w-2.5 rounded-full -ml-1.5 shrink-0"
                  style={{
                    background: "oklch(0.65 0.22 285)",
                    boxShadow: "0 0 8px oklch(0.65 0.22 285 / 0.7)",
                  }}
                />
                <div
                  className="flex-1 h-px"
                  style={{ background: "oklch(0.65 0.22 285 / 0.6)" }}
                />
              </div>
            )}

            {/* Events */}
            {dayEvents.map((e) => {
              const top = ((e.start - DAY_START) / 60) * HOUR_PX;
              const height = Math.max(((e.end - e.start) / 60) * HOUR_PX - 4, 28);
              const subj = subjectById(e.subjectId);
              const isBreak = e.type === "break";
              return (
                <div
                  key={e.id}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onEventClick?.(e);
                  }}
                  style={{
                    top,
                    height,
                    ...(isBreak
                      ? {
                          background: "oklch(1 0 0 / 0.05)",
                          border: "1px solid oklch(1 0 0 / 0.08)",
                        }
                      : {}),
                  }}
                  className={cn(
                    "absolute left-2 right-2 rounded-xl p-3 text-xs text-white overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.005] group",
                    !isBreak && typeStyle[e.type],
                    e.type !== "break" && e.type !== "exam" && subj.color,
                  )}
                >
                  {/* Specular overlay */}
                  {!isBreak && (
                    <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/18 to-transparent pointer-events-none" />
                  )}
                  <div
                    className="font-semibold text-[13px] truncate relative"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {e.title}
                  </div>
                  <div className="opacity-80 mt-0.5 text-[11px] relative">
                    {Math.floor(e.start / 60).toString().padStart(2, "0")}
                    :{(e.start % 60).toString().padStart(2, "0")}
                    {" – "}
                    {Math.floor(e.end / 60).toString().padStart(2, "0")}
                    :{(e.end % 60).toString().padStart(2, "0")}
                    {e.venue ? ` · ${e.venue}` : ""}
                  </div>
                </div>
              );
            })}

            {dayEvents.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-[13px] text-muted-foreground/50">No events scheduled for this day</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
