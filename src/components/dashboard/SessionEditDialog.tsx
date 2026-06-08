import { useEffect, useState, type CSSProperties } from "react";
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
import { Trash2 } from "lucide-react";

export type EditableSession = {
  day: string;
  start: string;
  end: string;
  subject: string;
  focus: string;
  intensity: "light" | "moderate" | "deep";
  venue: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SessionEditDialog({
  open,
  initial,
  title = "Edit session",
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial: EditableSession | null;
  title?: string;
  onClose: () => void;
  onSave: (s: EditableSession) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<EditableSession | null>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(initial), [initial]);

  if (!draft) return null;

  const set = <K extends keyof EditableSession>(k: K, v: EditableSession[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
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
      <DialogContent className="border-0 p-6" style={DIALOG_STYLE}>
        <DialogHeader className="mb-1">
          <DialogTitle className="text-[17px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Subject</Label>
            <Input
              value={draft.subject}
              onChange={(e) => set("subject", e.target.value)}
              className="border-0 text-[13px]"
              style={inputStyle}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Focus</Label>
            <Input
              value={draft.focus}
              onChange={(e) => set("focus", e.target.value)}
              placeholder="What to work on"
              className="border-0 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Day</Label>
              <Select value={draft.day} onValueChange={(v) => set("day", v)}>
                <SelectTrigger className="border-0 text-[13px]" style={inputStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d} value={d}>
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
            <Label className="text-[11px] text-muted-foreground">Venue / Location</Label>
            <Input
              value={draft.venue}
              onChange={(e) => set("venue", e.target.value)}
              placeholder="e.g. Room 204, Main Hall"
              className="border-0 text-[13px]"
              style={inputStyle}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Intensity</Label>
            <Select
              value={draft.intensity}
              onValueChange={(v) => set("intensity", v as EditableSession["intensity"])}
            >
              <SelectTrigger className="border-0 text-[13px]" style={inputStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="deep">Deep</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          {onDelete && (
            <button
              onClick={remove}
              disabled={busy}
              className="mr-auto flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium transition-all duration-150 hover:bg-rose-500/10 active:scale-[0.97] disabled:opacity-50"
              style={{ color: "oklch(0.65 0.24 25)" }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            className="h-9 px-4 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
            style={{ border: "1px solid color-mix(in oklch, var(--foreground) 9%, transparent)" }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white relative overflow-hidden hover:brightness-110 active:scale-[0.97] disabled:opacity-50 transition-all duration-150"
            style={{
              background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
              boxShadow: "0 1px 0 oklch(1 0 0 / 0.2) inset",
            }}
          >
            Save changes
            <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
