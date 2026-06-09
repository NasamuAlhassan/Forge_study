import { useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Subject } from "@/lib/demo-data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type NewEventDraft = {
  title: string;
  type: "class" | "study" | "break" | "exam";
  day: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  subjectId: string;
  venue: string;
};

function minsToTime(m: number) {
  return `${Math.floor(m / 60)
    .toString()
    .padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

const EMPTY: NewEventDraft = {
  title: "",
  type: "class",
  day: 0,
  start: "08:00",
  end: "09:00",
  subjectId: "",
  venue: "",
};

export function EventCreateDialog({
  open,
  initial,
  subjects,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: { day: number; startMinute: number } | null;
  subjects: Subject[];
  onClose: () => void;
  onSave: (draft: NewEventDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<NewEventDraft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const end = Math.min(initial.startMinute + 60, 23 * 60);
      setDraft({
        ...EMPTY,
        day: initial.day,
        start: minsToTime(initial.startMinute),
        end: minsToTime(end),
      });
    } else {
      setDraft(EMPTY);
    }
  }, [open, initial]);

  const set = <K extends keyof NewEventDraft>(k: K, v: NewEventDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const valid = draft.title.trim().length > 0 && draft.start < draft.end;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave(draft);
      onClose(); // only close on success
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Failed to add event");
      // keep dialog open on error
    } finally {
      setBusy(false);
    }
  };

  const DIALOG_STYLE: CSSProperties = {
    background: "color-mix(in oklch, var(--popover) 96%, transparent)",
    backdropFilter: "blur(40px) saturate(200%)",
    WebkitBackdropFilter: "blur(40px) saturate(200%)",
    border: "1px solid var(--border)",
    boxShadow: "0 1px 0 oklch(1 0 0 / 0.14) inset, 0 32px 80px -16px oklch(0.04 0.02 275 / 0.85)",
    borderRadius: "20px",
  };

  const inputStyle: CSSProperties = {
    background: "var(--input)",
    border: "1px solid var(--border)",
    boxShadow: "0 1px 0 oklch(1 0 0 / 0.08) inset",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-0 p-6 max-w-sm" style={DIALOG_STYLE}>
        <DialogHeader className="mb-1">
          <DialogTitle className="text-[17px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
            Add calendar block
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Title</Label>
            <Input
              autoFocus
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. MATH 201 Lecture"
              className="border-0 text-[13px]"
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Type</Label>
            <Select
              value={draft.type}
              onValueChange={(v) => set("type", v as NewEventDraft["type"])}
            >
              <SelectTrigger className="border-0 text-[13px]" style={inputStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Class</SelectItem>
                <SelectItem value="study">Study session</SelectItem>
                <SelectItem value="exam">Exam</SelectItem>
                <SelectItem value="break">Break</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {subjects.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Subject (optional)</Label>
              <Select
                value={draft.subjectId || "__none__"}
                onValueChange={(v) => set("subjectId", v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="border-0 text-[13px]" style={inputStyle}>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Day</Label>
              <Select value={String(draft.day)} onValueChange={(v) => set("day", Number(v))}>
                <SelectTrigger className="border-0 text-[13px]" style={inputStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Start</Label>
              <Input
                type="time"
                value={draft.start}
                onChange={(e) => set("start", e.target.value)}
                className="border-0 text-[13px]"
                style={inputStyle}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">End</Label>
              <Input
                type="time"
                value={draft.end}
                onChange={(e) => set("end", e.target.value)}
                className="border-0 text-[13px]"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Venue (optional)</Label>
            <Input
              value={draft.venue}
              onChange={(e) => set("venue", e.target.value)}
              placeholder="e.g. Room 204"
              className="border-0 text-[13px]"
              style={inputStyle}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-9 px-4 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
            style={{ border: "1px solid color-mix(in oklch, var(--foreground) 9%, transparent)" }}
          >
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !valid} className="btn-primary h-9 px-4 rounded-xl text-[13px]">
            <span className="relative z-10">Add block</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
