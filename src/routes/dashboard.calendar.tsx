import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { WeekCalendar } from "@/components/dashboard/WeekCalendar";
import { DayView } from "@/components/dashboard/DayView";
import { MonthView } from "@/components/dashboard/MonthView";
import { SessionEditDialog, type EditableSession } from "@/components/dashboard/SessionEditDialog";
import { EventCreateDialog, type NewEventDraft } from "@/components/dashboard/EventCreateDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSchedule,
  updateEvent,
  deleteEvent,
  dayToIndex,
  timeToMinutes,
  minutesToTime,
  indexToDay,
} from "@/hooks/use-schedule";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import type { EventBlock } from "@/lib/demo-data";
import { exportICS, exportPNG, exportPDF } from "@/lib/export";

export const Route = createFileRoute("/dashboard/calendar")({
  component: CalendarPage,
});

type View = "day" | "week" | "month";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function CalendarPage() {
  const { events, subjects, hasData, refetch } = useSchedule();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<EventBlock | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSlot, setCreateSlot] = useState<{ day: number; startMinute: number } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupMode, setDupMode] = useState<"day" | "week">("day");
  const [srcDay, setSrcDay] = useState("0");
  const [tgtDay, setTgtDay] = useState("1");

  const calEvents = events;
  const calSubjects = subjects;

  // ── navigation ─────────────────────────────────────────────────────────────
  const shift = (dir: 1 | -1) => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (view === "day") d.setDate(d.getDate() + dir);
      if (view === "week") d.setDate(d.getDate() + dir * 7);
      if (view === "month") d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const goToday = () => setAnchor(new Date());

  const periodLabel = useMemo(() => {
    if (view === "day") {
      return anchor.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const mon = getMonday(anchor);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(mon)} – ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [view, anchor]);

  // ── reset ───────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!user) return;
    try {
      await supabase.from("events").delete().eq("user_id", user.id);
      await supabase.from("subjects").delete().eq("user_id", user.id);
      await refetch();
      toast.success("Calendar cleared");
    } catch {
      toast.error("Failed to reset calendar");
    } finally {
      setResetOpen(false);
    }
  };

  // ── duplicate ───────────────────────────────────────────────────────────────
  const openDuplicate = (mode: "day" | "week") => {
    setDupMode(mode);
    if (mode === "day") {
      const todayDow = String((new Date().getDay() + 6) % 7);
      setSrcDay(todayDow);
      setTgtDay(String((Number(todayDow) + 1) % 7));
    }
    setDupOpen(true);
  };

  const handleDuplicate = async () => {
    if (!user) return;
    try {
      if (dupMode === "day") {
        const src = calEvents.filter((e) => e.day === Number(srcDay));
        if (src.length === 0) {
          toast.error(`No events on ${DAY_NAMES[Number(srcDay)]}`);
          return;
        }
        const rows = src.map((e) => ({
          user_id: user.id,
          subject_id: e.subjectId || null,
          title: e.title,
          type: e.type,
          day_of_week: Number(tgtDay),
          start_minute: e.start,
          end_minute: e.end,
          venue: e.venue ?? null,
        }));
        const { error } = await supabase.from("events").insert(rows);
        if (error) throw error;
        toast.success(`${DAY_NAMES[Number(srcDay)]} → ${DAY_NAMES[Number(tgtDay)]} copied`);
      } else {
        // Duplicate week: copy all events creating new rows (same day_of_week)
        if (calEvents.length === 0) {
          toast.error("No events to duplicate");
          return;
        }
        const rows = calEvents.map((e) => ({
          user_id: user.id,
          subject_id: e.subjectId || null,
          title: e.title,
          type: e.type,
          day_of_week: e.day,
          start_minute: e.start,
          end_minute: e.end,
          venue: e.venue ?? null,
        }));
        const { error } = await supabase.from("events").insert(rows);
        if (error) throw error;
        toast.success("Week schedule duplicated");
      }
      await refetch();
    } catch {
      toast.error("Duplication failed");
    } finally {
      setDupOpen(false);
    }
  };

  // ── export ──────────────────────────────────────────────────────────────────
  const weekStart = getMonday(anchor);

  const handleExport = (format: "ics" | "png" | "pdf") => {
    if (!hasData) {
      toast.error("No schedule to export — import a timetable first.");
      return;
    }
    const label = periodLabel;
    try {
      if (format === "ics") {
        exportICS(events, subjects);
        toast.success(
          "Calendar file downloaded — import it into Google Calendar, Apple Calendar, or Outlook.",
        );
      } else if (format === "png") {
        exportPNG(events, subjects, weekStart, label, theme === "dark");
        toast.success("Timetable image saved as PNG.");
      } else {
        exportPDF(events, subjects, weekStart, label);
        toast.success('Print window opened — choose "Save as PDF" to download.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed. Please try again.");
    }
  };

  // ── edit helpers ─────────────────────────────────────────────────────────────
  const intensityFromNotes = (n?: string | null): EditableSession["intensity"] =>
    n === "deep" || n === "moderate" || n === "light" ? n : "moderate";

  const initial: EditableSession | null = editing
    ? {
        day: indexToDay(editing.day),
        start: minutesToTime(editing.start),
        end: minutesToTime(editing.end),
        subject: subjects.find((s) => s.id === editing.subjectId)?.name ?? editing.title,
        focus: editing.title,
        intensity: intensityFromNotes((editing as EventBlock & { notes?: string }).notes),
        venue: editing.venue ?? "",
      }
    : null;

  const handleEventClick = (e: EventBlock) => setEditing(e);
  const handleSlotClick = (day: number, startMinute: number) => {
    setCreateSlot({ day, startMinute });
    setCreateOpen(true);
  };

  const handleCreate = async (draft: NewEventDraft) => {
    if (!user) return;
    const [sh, sm] = draft.start.split(":").map(Number);
    const [eh, em] = draft.end.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      subject_id: draft.subjectId || null,
      title: draft.title.trim(),
      type: draft.type,
      day_of_week: draft.day,
      start_minute: startMin,
      end_minute: endMin,
      venue: draft.venue.trim() || null,
    });
    if (error) throw new Error(error.message);
    await refetch();
    toast.success("Event added");
  };

  return (
    <>
      <Topbar
        title="Calendar"
        subtitle={
          hasData ? "Click any block to edit it." : "Import a timetable to see your own schedule."
        }
      />
      <main className="p-4 sm:p-6 space-y-4">
        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View switcher */}
          <div
            className="flex items-center rounded-xl p-1 gap-0.5"
            style={{
              background: "color-mix(in oklch, var(--muted) 60%, transparent)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 0 oklch(1 0 0 / 0.06) inset",
            }}
          >
            {(["day", "week", "month"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[13px] font-medium capitalize transition-all duration-150 relative overflow-hidden",
                  view === v
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06] active:scale-[0.97]",
                )}
                style={
                  view === v
                    ? {
                        background:
                          "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
                        boxShadow:
                          "0 0 12px -3px oklch(0.62 0.21 285 / 0.5), 0 1px 0 oklch(1 0 0 / 0.2) inset",
                      }
                    : undefined
                }
              >
                {view === v && (
                  <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
                )}
                <span className="relative">{v}</span>
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => shift(-1)}
              aria-label="Previous period"
              className="h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.93] transition-all duration-150"
              style={{ border: "1px solid var(--border)" }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
              style={{ border: "1px solid var(--border)" }}
            >
              Today
            </button>
            <button
              onClick={() => shift(1)}
              aria-label="Next period"
              className="h-8 w-8 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.93] transition-all duration-150"
              style={{ border: "1px solid var(--border)" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Period label */}
          <span
            className="text-[13px] font-medium text-foreground hidden sm:block"
            style={{ letterSpacing: "-0.01em" }}
          >
            {periodLabel}
          </span>

          {/* Actions — pushed right */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                setCreateSlot(null);
                setCreateOpen(true);
              }}
              className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[12px] font-semibold text-white relative overflow-hidden hover:brightness-110 active:scale-[0.97] transition-all duration-150"
              style={{
                background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
                boxShadow:
                  "0 0 16px -4px oklch(0.62 0.21 285 / 0.5), 0 1px 0 oklch(1 0 0 / 0.2) inset",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add event</span>
              <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
                  style={{
                    border: "1px solid var(--border)",
                    background: "color-mix(in oklch, var(--muted) 60%, transparent)",
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openDuplicate("day")}>
                  Duplicate a day
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openDuplicate("week")}>
                  Duplicate whole week
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!hasData}
                  className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid var(--border)",
                    background: "color-mix(in oklch, var(--muted) 60%, transparent)",
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem onClick={() => handleExport("ics")} className="gap-2">
                  <Calendar className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
                  <div>
                    <div className="text-[13px] font-medium">Calendar file (.ics)</div>
                    <div className="text-[11px] text-muted-foreground">Google, Apple, Outlook…</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("png")} className="gap-2">
                  <Image className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
                  <div>
                    <div className="text-[13px] font-medium">Image (.png)</div>
                    <div className="text-[11px] text-muted-foreground">Share or save this week</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")} className="gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
                  <div>
                    <div className="text-[13px] font-medium">PDF</div>
                    <div className="text-[11px] text-muted-foreground">Print or save as PDF</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={() => setResetOpen(true)}
              disabled={!hasData}
              className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[12px] font-medium transition-all duration-150 hover:bg-rose-500/10 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                color: "oklch(0.65 0.24 25)",
                border: "1px solid oklch(0.65 0.24 25 / 0.25)",
                background: "oklch(0.65 0.24 25 / 0.06)",
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>

        {/* Period label on mobile */}
        <p className="text-sm font-medium sm:hidden">{periodLabel}</p>

        {/* ── Calendar view ────────────────────────────────────────────── */}
        {view === "week" && (
          <WeekCalendar
            events={calEvents}
            subjects={calSubjects}
            weekStart={getMonday(anchor)}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        )}
        {view === "day" && (
          <DayView
            date={anchor}
            events={calEvents}
            subjects={calSubjects}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
          />
        )}
        {view === "month" && (
          <MonthView
            anchor={anchor}
            events={calEvents}
            subjects={calSubjects}
            onDayClick={(d) => {
              setAnchor(d);
              setView("day");
            }}
          />
        )}
      </main>

      {/* ── Reset confirm ─────────────────────────────────────────────── */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="glass border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all your events and subjects. You'll need to re-import your
              timetable to restore them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReset}
            >
              Yes, clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Duplicate dialog ──────────────────────────────────────────── */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="glass border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dupMode === "day" ? "Duplicate a day" : "Duplicate whole week"}
            </DialogTitle>
          </DialogHeader>
          {dupMode === "day" ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Copy from</label>
                <Select value={srcDay} onValueChange={setSrcDay}>
                  <SelectTrigger className="glass border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Copy to</label>
                <Select value={tgtDay} onValueChange={setTgtDay}>
                  <SelectTrigger className="glass border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((d, i) => (
                      <SelectItem key={i} value={String(i)} disabled={i === Number(srcDay)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              This will create a copy of all {calEvents.length} events in your weekly schedule. The
              copies are independent and can be edited or deleted separately.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="glass border-white/10"
              onClick={() => setDupOpen(false)}
            >
              Cancel
            </Button>
            <Button className="bg-gradient-primary" onClick={handleDuplicate}>
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit block dialog ─────────────────────────────────────────── */}
      <SessionEditDialog
        open={!!editing}
        initial={initial}
        title="Edit calendar block"
        onClose={() => setEditing(null)}
        onSave={async (updated) => {
          if (!editing) return;
          try {
            await updateEvent(editing.id, {
              title: updated.focus || updated.subject,
              day_of_week: dayToIndex(updated.day),
              start_minute: timeToMinutes(updated.start),
              end_minute: timeToMinutes(updated.end),
              notes: updated.intensity,
              venue: updated.venue || null,
            });
            await refetch();
            toast.success("Calendar updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update");
          }
        }}
        onDelete={async () => {
          if (!editing) return;
          try {
            await deleteEvent(editing.id);
            await refetch();
            toast.success("Block removed");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete");
          }
        }}
      />

      {/* ── Create block dialog ───────────────────────────────────────── */}
      <EventCreateDialog
        open={createOpen}
        initial={createSlot}
        subjects={calSubjects}
        onClose={() => {
          setCreateOpen(false);
          setCreateSlot(null);
        }}
        onSave={handleCreate}
      />
    </>
  );
}
