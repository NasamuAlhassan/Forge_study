import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Loader2, FileImage, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function TimetableUploader() {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "extracting" | "done" | "error" | "saving">("idle");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractTimetable);
  const { user } = useAuth();
  const navigate = useNavigate();

  const save = async () => {
    if (!user) return toast.error("Please sign in first");
    if (entries.length === 0) return;
    setStatus("saving");
    try {
      await persistTimetableEntries(user.id, entries);
      toast.success(`Added ${entries.length} class${entries.length === 1 ? "" : "es"} to your calendar`);
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
          const res = await extract({ data: { imageDataUrl: dataUrl } });
          setEntries(res.entries);
          setStatus("done");
          toast.success(`Extracted ${res.entries.length} class${res.entries.length === 1 ? "" : "es"}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Extraction failed";
          setError(msg);
          setStatus("error");
          toast.error(msg);
        }
      };
      reader.readAsDataURL(file);
    },
    [extract]
  );

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
        className={`ring-gradient glass rounded-2xl p-8 text-center transition-all ${
          dragOver ? "scale-[1.01] shadow-glow" : ""
        }`}
      >
        {!preview ? (
          <>
            <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow animate-float">
              <Upload className="h-7 w-7 text-primary-foreground" />
            </div>
            <h3 className="mt-5 text-lg font-semibold">Drop your timetable</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              PNG, JPG, or screenshot. Forge will read every class in seconds.
            </p>
            <Button
              className="mt-6 bg-gradient-primary hover:opacity-90 shadow-glow"
              onClick={() => inputRef.current?.click()}
            >
              <FileImage className="h-4 w-4 mr-1" /> Choose file
            </Button>
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
          </>
        ) : (
          <div className="text-left">
            <img src={preview} alt="Uploaded timetable" className="rounded-xl w-full max-h-80 object-contain bg-black/20" />
            <div className="mt-4 flex items-center gap-2 text-sm">
              {status === "extracting" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary-glow" />
                  <span className="text-muted-foreground">AI is reading your timetable…</span>
                </>
              )}
              {status === "done" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Extracted {entries.length} entries</span>
                </>
              )}
              {status === "error" && (
                <>
                  <AlertCircle className="h-4 w-4 text-rose-400" />
                  <span className="text-rose-400">{error}</span>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setPreview(null);
                  setEntries([]);
                  setStatus("idle");
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="ring-gradient glass rounded-2xl p-5">
        <h3 className="text-base font-semibold">Extracted classes</h3>
        <p className="text-xs text-muted-foreground">Review and confirm before adding to your calendar.</p>
        <div className="mt-4 space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {entries.length === 0 && status !== "extracting" && (
            <div className="text-sm text-muted-foreground py-12 text-center border border-dashed border-white/10 rounded-xl">
              Upload a timetable to see extracted entries here.
            </div>
          )}
          {status === "extracting" &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04]">
              <div className="h-9 w-9 rounded-lg bg-gradient-primary grid place-items-center text-xs font-semibold text-primary-foreground">
                {e.day.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {e.course} {e.code && <span className="text-muted-foreground">· {e.code}</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {e.start}–{e.end}
                  {e.venue ? ` · ${e.venue}` : ""}
                  {e.lecturer ? ` · ${e.lecturer}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
        {entries.length > 0 && (
          <Button onClick={save} disabled={status === "saving"} className="mt-4 w-full bg-gradient-primary hover:opacity-90 shadow-glow">
            {status === "saving" ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</>) : "Add to my calendar"}
          </Button>
        )}
      </div>
    </div>
  );
}
