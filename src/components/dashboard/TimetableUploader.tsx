import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Upload, Loader2, FileImage, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { extractTimetable } from "@/lib/ai.functions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { persistTimetableEntries } from "@/hooks/use-schedule";

type Entry = {
  course: string;
  code?: string;
  lecturer?: string;
  venue?: string;
  day: string;
  start: string;
  end: string;
};

const DAY_ABBR: Record<string, string> = {
  Monday: "Mo",
  Tuesday: "Tu",
  Wednesday: "We",
  Thursday: "Th",
  Friday: "Fr",
  Saturday: "Sa",
  Sunday: "Su",
  Mon: "Mo",
  Tue: "Tu",
  Wed: "We",
  Thu: "Th",
  Fri: "Fr",
  Sat: "Sa",
  Sun: "Su",
};

export function TimetableUploader() {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "extracting" | "done" | "error" | "saving"
  >("idle");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extract = extractTimetable;
  const { user } = useAuth();
  const navigate = useNavigate();

  const save = async () => {
    if (!user) return toast.error("Please sign in first");
    if (entries.length === 0) return;
    setStatus("saving");
    try {
      await persistTimetableEntries(user.id, entries);
      toast.success(
        `Added ${entries.length} class${entries.length === 1 ? "" : "es"} to your calendar`,
      );
      navigate({ to: "/dashboard/calendar" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
      setStatus("done");
    }
  };

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setStatus("uploading");
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        setStatus("extracting");
        try {
          const res = await extract(dataUrl);
          setEntries(res.entries);
          setStatus("done");
          toast.success(
            `Extracted ${res.entries.length} class${res.entries.length === 1 ? "" : "es"}`,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Extraction failed";
          setError(msg);
          setStatus("error");
          toast.error(msg);
        }
      };
      reader.readAsDataURL(file);
    },
    [extract],
  );

  const reset = () => {
    setPreview(null);
    setEntries([]);
    setStatus("idle");
    setError(null);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className="ring-gradient glass hover-lift rounded-2xl p-8 text-center relative overflow-hidden transition-all duration-300"
        style={
          dragOver
            ? {
                boxShadow:
                  "0 0 48px -8px oklch(0.62 0.21 285 / 0.6), 0 1px 0 oklch(1 0 0 / 0.14) inset",
                transform: "scale(1.01)",
              }
            : undefined
        }
      >
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 35% at 20% 0%, oklch(1 0 0 / 0.055) 0%, transparent 60%)",
          }}
        />

        {!preview ? (
          <div className="flex flex-col items-center relative">
            <div
              className="mx-auto h-16 w-16 rounded-2xl grid place-items-center"
              style={{
                background:          "var(--glass-bg-btn-dark)",
                backdropFilter:      "blur(var(--glass-blur))",
                WebkitBackdropFilter:"blur(var(--glass-blur))",
                border:              "1px solid var(--glass-border-dark)",
                boxShadow:           "0 1px 0 rgba(255,255,255,0.12) inset",
                animation:           "float 3s ease-in-out infinite",
              }}
            >
              <Upload className="h-7 w-7 opacity-80 relative z-10" style={{ color: "var(--foreground)" }} />
            </div>

            <h3 className="mt-5 text-[17px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Drop your timetable
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground max-w-[260px] leading-relaxed">
              PNG, JPG, or screenshot. Forge reads every class in seconds.
            </p>

            <button className="btn-primary mt-6 h-10 px-5 rounded-xl text-[13px]" onClick={() => inputRef.current?.click()}>
              <FileImage className="h-4 w-4 relative z-10" />
              <span className="relative z-10">Choose file</span>
            </button>

            <p className="mt-3 text-[11px] text-muted-foreground/40">or drag and drop here</p>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        ) : (
          <div className="text-left relative">
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid color-mix(in oklch, var(--foreground) 10%, transparent)",
              }}
            >
              <img
                src={preview}
                alt="Uploaded timetable"
                className="w-full max-h-80 object-contain"
                style={{ background: "oklch(0 0 0 / 0.2)" }}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[13px] px-1">
              {status === "extracting" && (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin shrink-0"
                    style={{ color: "oklch(0.74 0.19 295)" }}
                  />
                  <span className="text-muted-foreground">AI is reading your timetable...</span>
                </>
              )}
              {status === "done" && (
                <>
                  <CheckCircle2
                    className="h-4 w-4 shrink-0"
                    style={{ color: "oklch(0.72 0.17 160)" }}
                  />
                  <span>
                    Extracted {entries.length} {entries.length === 1 ? "entry" : "entries"}
                  </span>
                </>
              )}
              {status === "error" && (
                <>
                  <AlertCircle
                    className="h-4 w-4 shrink-0"
                    style={{ color: "oklch(0.65 0.24 25)" }}
                  />
                  <span style={{ color: "oklch(0.65 0.24 25)" }}>{error}</span>
                </>
              )}
              <button
                onClick={reset}
                className="ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
                style={{
                  border: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)",
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ring-gradient glass hover-lift rounded-2xl p-5 relative overflow-hidden">
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 35% at 80% 0%, oklch(1 0 0 / 0.045) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <h3 className="text-[15px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
            Extracted classes
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Review and confirm before adding to your calendar.
          </p>
        </div>

        <div className="mt-4 space-y-2 max-h-[28rem] overflow-y-auto pr-1 relative">
          {entries.length === 0 && status !== "extracting" && (
            <div
              className="text-[13px] text-muted-foreground/50 py-16 text-center rounded-2xl"
              style={{
                border: "1px dashed color-mix(in oklch, var(--foreground) 9%, transparent)",
              }}
            >
              Upload a timetable to see extracted entries here.
            </div>
          )}
          {status === "extracting" &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[60px] rounded-xl animate-pulse"
                style={{
                  background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          {entries.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl relative overflow-hidden"
              style={{
                background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                border: "1px solid color-mix(in oklch, var(--foreground) 7%, transparent)",
                boxShadow: "0 1px 0 oklch(1 0 0 / 0.07) inset",
              }}
            >
              <div
                className="h-9 w-9 rounded-xl grid place-items-center text-[12px] font-bold shrink-0"
                style={{
                  background:   "var(--glass-bg-btn-dark)",
                  border:       "1px solid var(--glass-border-dark)",
                  letterSpacing:"-0.01em",
                  color:        "var(--foreground)",
                }}
              >
                {DAY_ABBR[e.day] ?? e.day.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-medium truncate"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {e.course}
                  </span>
                  {e.code && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                      style={{
                        background: "var(--glass-bg-btn-dark)",
                        border:     "1px solid var(--glass-border-dark)",
                        color:      "var(--muted-foreground)",
                      }}
                    >
                      {e.code}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                  {e.start}
                  {e.end ? ` - ${e.end}` : ""}
                  {e.venue ? ` - ${e.venue}` : ""}
                  {e.lecturer ? ` - ${e.lecturer}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>

        {entries.length > 0 && (
          <button onClick={save} disabled={status === "saving"} className="btn-primary btn-primary-full mt-4 h-10 rounded-xl text-[13px]">
            {status === "saving" ? (
              <><Loader2 className="h-4 w-4 animate-spin relative z-10" /><span className="relative z-10">Saving…</span></>
            ) : (
              <span className="relative z-10">Add {entries.length} {entries.length === 1 ? "class" : "classes"} to calendar</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
