import { ArrowUpRight, Clock, MapPin, BookOpen, GraduationCap, Coffee, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { EVENTS, SUBJECTS, type EventBlock, type Subject } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fmt = (m: number) =>
  `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;

const dur = (e: EventBlock) => {
  const mins = e.end - e.start;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const typeIcon: Record<EventBlock["type"], React.ElementType> = {
  class: GraduationCap,
  study: BookOpen,
  break: Coffee,
  exam:  AlertTriangle,
};

const typeBadge: Record<EventBlock["type"], { bg: string; text: string }> = {
  class: { bg: "oklch(0.55 0.22 250 / 0.15)", text: "oklch(0.72 0.18 250)" },
  study: { bg: "oklch(0.62 0.21 285 / 0.15)", text: "oklch(0.74 0.19 295)" },
  break: { bg: "oklch(1 0 0 / 0.06)",          text: "oklch(0.68 0.03 280)" },
  exam:  { bg: "oklch(0.65 0.24 25 / 0.15)",   text: "oklch(0.72 0.22 25)" },
};

function AgendaItem({ e, subjectById }: { e: EventBlock; subjectById: (id: string) => Subject }) {
  const s = subjectById(e.subjectId);
  const badge = typeBadge[e.type];
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const isNow  = e.start <= nowMins && e.end > nowMins;
  const isPast = e.end <= nowMins;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 min-h-[52px] rounded-xl",
        "transition-all duration-200 relative overflow-hidden",
        isNow
          ? "bg-primary/[0.08] ring-1 ring-primary/20"
          : "hover:bg-white/[0.05] active:bg-white/[0.08]",
        isPast && !isNow && "opacity-45"
      )}
    >
      {/* Left color bar with glow */}
      <div
        className={cn(
          "h-9 w-[3px] rounded-full shrink-0 bg-gradient-to-b",
          s.color
        )}
        style={{
          boxShadow: isNow ? "0 0 8px -1px currentColor" : undefined,
        }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium truncate">{e.title}</span>
          {isNow && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
              style={{
                background: "oklch(0.62 0.21 285 / 0.2)",
                color: "oklch(0.74 0.19 295)",
                border: "1px solid oklch(0.62 0.21 285 / 0.25)",
                letterSpacing: "0.04em",
              }}
            >
              NOW
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground mt-0.5">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-[10px] w-[10px] opacity-60" />
            {fmt(e.start)}–{fmt(e.end)}
          </span>
          {e.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-[10px] w-[10px] opacity-60" />
              {e.venue}
            </span>
          )}
        </div>
      </div>

      <span
        className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
        style={{
          background: badge.bg,
          color: badge.text,
          letterSpacing: "0.05em",
        }}
      >
        {e.type.toUpperCase()}
      </span>
    </div>
  );
}

function AgendaDetail({
  today,
  dayName,
  subjectById,
}: {
  today: EventBlock[];
  dayName: string;
  subjectById: (id: string) => Subject;
}) {
  const totalMins = today.reduce((sum, e) => sum + (e.end - e.start), 0);
  const studyMins = today.filter((e) => e.type === "study").reduce((sum, e) => sum + (e.end - e.start), 0);
  const classMins = today.filter((e) => e.type === "class").reduce((sum, e) => sum + (e.end - e.start), 0);

  const fmtH = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
  };

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const done     = today.filter((e) => e.end <= nowMins).length;
  const upcoming = today.filter((e) => e.start > nowMins).length;
  const current  = today.find((e) => e.start <= nowMins && e.end > nowMins);

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Scheduled", value: totalMins > 0 ? fmtH(totalMins) : "—" },
          { label: "Study",     value: studyMins > 0 ? fmtH(studyMins) : "—" },
          { label: "Class",     value: classMins > 0 ? fmtH(classMins) : "—" },
        ].map((item) => (
          <div
            key={item.label}
            className="text-center py-3 rounded-xl"
            style={{
              background: "oklch(1 0 0 / 0.04)",
              border: "1px solid oklch(1 0 0 / 0.07)",
              boxShadow: "0 1px 0 oklch(1 0 0 / 0.08) inset",
            }}
          >
            <div className="text-[17px] font-semibold font-display" style={{ letterSpacing: "-0.02em" }}>
              {item.value}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Progress row */}
      {today.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="text-foreground font-semibold">{done}</span> done ·
          <span className="text-foreground font-semibold">{upcoming}</span> upcoming
          {current && (
            <span className="ml-auto flex items-center gap-1.5 text-primary-glow text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-glow animate-pulse" />
              {current.title}
            </span>
          )}
        </div>
      )}

      {/* Full list */}
      <div className="space-y-0.5">
        {today.length === 0 ? (
          <div
            className="text-sm text-muted-foreground/70 py-10 text-center rounded-2xl"
            style={{ border: "1px dashed oklch(1 0 0 / 0.1)" }}
          >
            Nothing scheduled for {dayName}.
          </div>
        ) : (
          today.map((e) => {
            const isPast = e.end <= nowMins;
            const isNow  = e.start <= nowMins && e.end > nowMins;
            const TypeIcon = typeIcon[e.type];
            const s = subjectById(e.subjectId);
            const badge = typeBadge[e.type];
            return (
              <div
                key={e.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl transition-all duration-200",
                  isNow  ? "ring-1 ring-primary/20" : "hover:bg-white/[0.04]",
                  isPast && !isNow && "opacity-40"
                )}
                style={isNow ? { background: "oklch(0.62 0.21 285 / 0.08)" } : undefined}
              >
                <div
                  className={cn("h-8 w-8 rounded-xl bg-gradient-to-br grid place-items-center shrink-0 mt-0.5", s.color)}
                >
                  <TypeIcon className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate">{e.title}</span>
                    {isNow && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                        style={{
                          background: "oklch(0.62 0.21 285 / 0.2)",
                          color: "oklch(0.74 0.19 295)",
                          border: "1px solid oklch(0.62 0.21 285 / 0.25)",
                        }}
                      >
                        NOW
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-[10px] w-[10px] opacity-60" />
                      {fmt(e.start)} – {fmt(e.end)}
                    </span>
                    <span className="opacity-60">{dur(e)}</span>
                    {e.venue && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-[10px] w-[10px] opacity-60" />
                        {e.venue}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0 mt-0.5"
                  style={{ background: badge.bg, color: badge.text, letterSpacing: "0.05em" }}
                >
                  {e.type.toUpperCase()}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function TodaysAgenda({
  events = EVENTS,
  subjects = SUBJECTS,
}: {
  events?: EventBlock[];
  subjects?: Subject[];
}) {
  const [open, setOpen] = useState(false);

  const todayIdx = (new Date().getDay() + 6) % 7;
  const today    = events.filter((e) => e.day === todayIdx).sort((a, b) => a.start - b.start);
  const dayName  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][todayIdx];
  const subjectById = (id: string) =>
    subjects.find((s) => s.id === id) ?? { id: "", name: "", code: "", color: "from-indigo-500 to-purple-500" };

  return (
    <>
      <div className="ring-gradient glass hover-lift rounded-2xl p-5 relative">
        {/* Specular highlight */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 35% at 25% 0%, oklch(1 0 0 / 0.055) 0%, transparent 60%)",
          }}
        />

        <div className="flex items-center justify-between mb-4 relative">
          <div>
            <h3
              className="text-[15px] font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              Today's agenda
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {dayName} · {today.length} block{today.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className={[
              "flex items-center gap-1 text-[12px] font-medium",
              "text-muted-foreground hover:text-foreground",
              "px-2.5 py-1.5 rounded-lg",
              "hover:bg-white/[0.07] active:scale-[0.96]",
              "transition-all duration-150",
            ].join(" ")}
            aria-label="Expand today's agenda"
          >
            View all <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
          </button>
        </div>

        <div className="space-y-0.5 relative">
          {today.length === 0 && (
            <div
              className="text-[13px] text-muted-foreground/60 py-9 text-center rounded-xl"
              style={{ border: "1px dashed oklch(1 0 0 / 0.09)" }}
            >
              Nothing scheduled today.
            </div>
          )}
          {today.slice(0, 4).map((e) => (
            <AgendaItem key={e.id} e={e} subjectById={subjectById as (id: string) => Subject} />
          ))}
          {today.length > 4 && (
            <button
              onClick={() => setOpen(true)}
              className={[
                "w-full text-[12px] text-muted-foreground/60 hover:text-muted-foreground",
                "py-2.5 text-center rounded-xl",
                "hover:bg-white/[0.04] active:scale-[0.99]",
                "transition-all duration-150",
              ].join(" ")}
            >
              +{today.length - 4} more blocks
            </button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg border-0 p-6 max-h-[85vh] overflow-y-auto"
          style={{
            background: "oklch(0.19 0.04 275 / 0.96)",
            backdropFilter: "blur(40px) saturate(200%)",
            WebkitBackdropFilter: "blur(40px) saturate(200%)",
            border: "1px solid oklch(1 0 0 / 0.1)",
            boxShadow:
              "0 1px 0 oklch(1 0 0 / 0.14) inset, 0 32px 80px -16px oklch(0.04 0.02 275 / 0.85)",
            borderRadius: "20px",
          }}
        >
          <DialogHeader className="mb-4">
            <DialogTitle
              className="text-[17px] font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              Today's agenda
            </DialogTitle>
            <p className="text-[12px] text-muted-foreground">
              {dayName} · {today.length} block{today.length === 1 ? "" : "s"}
            </p>
          </DialogHeader>
          <AgendaDetail
            today={today}
            dayName={dayName}
            subjectById={subjectById as (id: string) => Subject}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
