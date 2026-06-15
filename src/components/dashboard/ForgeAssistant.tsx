import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GraduationCap,
  GripHorizontal,
  ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Search,
  Send,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
import { useSchedule, broadcastScheduleUpdate } from "@/hooks/use-schedule";
import { useAuth } from "@/hooks/use-auth";
import { useVoicePersonality, buildVoiceContext, speedToRate } from "@/hooks/use-voice-personality";
import { sendForgeMessage, transcribeAudio, isForgeConfigured, searchWeb, teachFromContent, generateImageUrl, analyzeWithVision, generateLesson } from "@/lib/forge-ai";
import type { ChatMessage, TutoringLesson } from "@/lib/forge-ai";
import { ForgeWhiteboard } from "@/components/dashboard/ForgeWhiteboard";
import {
  buildAssistantDateContext,
  buildEventInsert,
  describeEventTime,
  displayTimeFromMinutes,
  normalizeForgeAction,
  timeStringToMinutes,
  type ForgeAction,
} from "@/lib/forge-ai-actions";
import { supabase } from "@/integrations/supabase/client";
import type { EventBlock, Subject } from "@/lib/demo-data";

// ─── Web Speech API minimal typings ──────────────────────────────────────────
interface SRResult { readonly transcript: string; readonly isFinal: boolean; }
interface SRResultList { readonly length: number; [i: number]: { readonly length: number; [j: number]: SRResult; readonly isFinal: boolean }; }
interface SREvent extends Event { readonly results: SRResultList; readonly resultIndex: number; }
interface SRErrorEvent extends Event { readonly error: string; }
interface SR {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult:  (e: SREvent) => void;
  onend:     () => void;
  onerror:   (e: SRErrorEvent) => void;
  start():   void;
  stop():    void;
  abort():   void;
}
type SRCtor = new () => SR;

const PANEL_W = 360;
const PANEL_H = 520;
const MIN_W = 280;
const MIN_H = 380;
const MAX_W = 720;
const MAX_H = 900;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

interface Message {
  id: number;
  role: Role;
  content: string;
  sources?: string[];
  image?: { url: string; caption: string; source?: string };
  downloadable?: { filename: string; format: "pdf" | "md" };
  attachmentPreview?: { type: "image" | "file"; dataUrl?: string; filename: string };
  /** Extracted text from an uploaded PDF/text file — persisted so follow-up turns can re-inject it */
  fileContext?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(mins: number) {
  return displayTimeFromMinutes(mins);
}

function formatSchedule(events: EventBlock[], subjects: Subject[]): string {
  if (events.length === 0) return "No events scheduled yet.";

  const now = new Date();
  const p2 = (n: number) => n.toString().padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;

  const lines: string[] = [
    `Subjects: ${subjects.map((s) =>
      `${s.name} (code:${s.code}, id:${s.id}${s.difficulty ? `, difficulty:${s.difficulty}` : ""})`
    ).join(" | ")}`,
    "",
  ];

  // ── Recurring events grouped by weekday ───────────────────────────────────
  const recurring = events.filter((e) => !e.date);
  for (let d = 0; d < 7; d++) {
    const day = recurring.filter((e) => e.day === d).sort((a, b) => a.start - b.start);
    if (!day.length) continue;
    lines.push(`${DAYS[d]}:`);
    for (const e of day) {
      const subj = subjects.find((s) => s.id === e.subjectId);
      lines.push(
        `  [id:${e.id}] ${e.title} (${e.type}) ${fmt(e.start)}-${fmt(e.end)}${e.venue ? ` @${e.venue}` : ""}${subj ? ` [${subj.code}]` : ""}`,
      );
    }
  }

  // ── Upcoming one-time events sorted chronologically ───────────────────────
  const upcoming = events
    .filter((e) => e.date && e.date >= todayStr)
    .sort((a, b) => (a.date! > b.date! ? 1 : -1));
  if (upcoming.length > 0) {
    lines.push("", "Upcoming one-time events:");
    for (const e of upcoming) {
      const subj = subjects.find((s) => s.id === e.subjectId);
      lines.push(
        `  [id:${e.id}] ${e.title} (${e.type}) on ${e.date} ${fmt(e.start)}-${fmt(e.end)}${e.venue ? ` @${e.venue}` : ""}${subj ? ` [${subj.code}]` : ""}`,
      );
    }
  }

  // ── Weekly academic hours per subject (workload awareness) ────────────────
  const subjectMins: Record<string, number> = {};
  for (const e of recurring) {
    if (e.type !== "study" && e.type !== "class") continue;
    const subj = subjects.find((s) => s.id === e.subjectId);
    if (!subj) continue;
    subjectMins[subj.name] = (subjectMins[subj.name] ?? 0) + (e.end - e.start);
  }
  const entries = Object.entries(subjectMins).sort((a, b) => b[1] - a[1]);
  if (entries.length > 0) {
    lines.push("", "Weekly academic hours per subject:");
    for (const [name, mins] of entries) {
      lines.push(`  ${name}: ${(mins / 60).toFixed(1)}h/week`);
    }
  }

  return lines.join("\n");
}

function describeAction(action: ForgeAction, subjects: Subject[], events: EventBlock[]): string {
  if (action.action === "add_event") {
    const { event: e } = action;
    const subj = subjects.find((s) => s.id === e.subjectId);
    return `Add "${e.title}" (${e.type}) on ${describeEventTime(e)}${subj ? ` · ${subj.name}` : ""}`;
  }
  if (action.action === "edit_event") {
    const target = events.find((e) => e.id === action.eventId);
    const p = action.patch;
    const parts: string[] = [];
    if (p.day !== undefined) parts.push(`→ ${DAYS_SHORT[p.day]}`);
    if (p.startTime !== undefined && p.endTime !== undefined)
      parts.push(`${p.startTime}-${p.endTime}`);
    else if (p.startTime !== undefined) parts.push(`starts ${p.startTime}`);
    return `Edit "${target?.title ?? action.eventId}" ${parts.join(" ")}`;
  }
  const target = events.find((e) => e.id === action.eventId);
  return `Remove "${target?.title ?? action.eventId}" from the schedule`;
}

// ─── Teaching intent detection ────────────────────────────────────────────────

const TEACH_RE = /^(teach me|explain|what is|what are|what's|what was|what were|how does|how do|how is|how are|help me understand|i don't understand|i dont understand|break down|walk me through|tell me about|describe|why is|why are|why does|why do)/i;
const SCHEDULE_RE = /schedule|timetable|calendar|add event|remove event|delete event|move event|edit event|my class|my lecture|my exam/i;
const WHITEBOARD_RE = /\b(whiteboard|visual\s+lesson|visual\s+explanation|full\s+lesson|live\s+lesson|interactive\s+lesson|teach.*visually|draw.*out|step.by.step\s+lesson|open\s+(the\s+)?board|start\s+a\s+lesson)\b/i;

function extractTopic(text: string): string {
  return text
    .replace(/^(teach me (about)?|explain( me| what| how)?|what (is|are|was|were)|what's|how (does|do|is|are|was|were)|help me understand( about)?|i (don't|dont) understand|break (down|it down)|walk me through|tell me about|describe|why (is|are|does|do))\s*/i, "")
    .replace(/[?.]$/, "")
    .trim();
}

// ─── Offline / unconfigured fallback ─────────────────────────────────────────

function getFallbackReply(text: string): string {
  const t = text.toLowerCase();
  if (/(hi|hello|hey|good (morning|afternoon|evening))/i.test(t))
    return "Hey! I'm Forge AI, your study assistant. Ask me about your schedule, study tips, or anything on your mind.";
  if (/(schedule|timetable|calendar|class|lecture|event)/i.test(t))
    return "Your schedule is on the dashboard. Head to the calendar view to see all your events, or go to Settings → Subjects to manage your courses.";
  if (/(study|revision|exam|test|quiz)/i.test(t))
    return "For exam prep, active recall beats passive re-reading every time. Block 60–90 min sessions in the morning for hard subjects and review notes the same evening.";
  if (/(stress|overwhelm|tired|burnout|anxious)/i.test(t))
    return "Take a short break — even 10 minutes helps reset focus. Pomodoro (25 min work, 5 min break) works well when you're feeling overwhelmed.";
  if (/(motivat|inspire|encour)/i.test(t))
    return "You're doing great by showing up every day. Consistency beats intensity — small daily progress compounds into big results by exam time.";
  if (/(add|create|book|put)/i.test(t))
    return "You can add events directly in the calendar on your dashboard. What would you like to schedule?";
  if (/(tip|advice|help|how)/i.test(t))
    return "Top tip: review your notes within 24 hours of a lecture — it boosts retention by up to 80%. Want more specific advice?";
  return "I'm Forge AI, your study assistant. Ask me anything about your schedule, study strategies, or your courses.";
}

const GREETING: Message = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm Forge AI. Ask me anything about your schedule, or tell me what you'd like to add or change.",
};

// ─── Math-aware message renderer ─────────────────────────────────────────────

function normalizeMath(text: string): string {
  // Convert LaTeX delimiters \(...\) and \[...\] to $ and $$ for remark-math
  return text
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$");
}

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-1.5 pl-1">{children}</ol>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-1.5 pl-1">{children}</ul>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children }) => (
          <code className="px-1 py-0.5 rounded text-[11px] font-mono" style={{ background: "rgba(255,255,255,0.10)" }}>
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-1.5 p-2 rounded-xl text-[11px] font-mono overflow-x-auto" style={{ background: "rgba(0,0,0,0.25)" }}>
            {children}
          </pre>
        ),
      }}
    >
      {normalizeMath(content)}
    </ReactMarkdown>
  );
}

// ─── Loading dots ─────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-[5px] px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-muted-foreground/50"
          style={{
            animation: "forge-dot-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Inline image (Pollinations.ai) ─────────────────────────────────────────

function ImageBlock({ image }: { image: NonNullable<Message["image"]> }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);
  if (error) return null;
  return (
    <div className="mt-2">
      {!loaded && (
        <div
          className="flex items-center gap-2 text-[11px] text-muted-foreground/60 rounded-xl px-3 py-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          Generating image…
        </div>
      )}
      <img
        src={image.url}
        alt={image.caption}
        className={cn("w-full rounded-xl object-cover", !loaded && "hidden")}
        style={{ maxHeight: 280 }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {loaded && (
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-[10px] text-muted-foreground/50">{image.caption}</span>
          {image.source && (
            <a
              href={image.source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] transition-colors"
              style={{ color: "oklch(0.65 0.16 255 / 0.60)" }}
            >
              Source ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Download button ─────────────────────────────────────────────────────────

function DownloadButton({ content, filename, format }: { content: string; filename: string; format: "pdf" | "md" }) {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const doc  = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const W    = doc.internal.pageSize.getWidth();
        const H    = doc.internal.pageSize.getHeight();
        const mx   = 56;
        const cw   = W - mx * 2;
        let   y    = 64;

        const addPage = () => { doc.addPage(); y = 64; };

        for (const raw of content.split("\n")) {
          if (y > H - 64) addPage();
          const line = raw.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/`([^`]+)`/g, "$1");

          if (raw.startsWith("# ")) {
            doc.setFontSize(18); doc.setFont("helvetica", "bold");
            const wrapped = doc.splitTextToSize(line.replace(/^# /, ""), cw);
            if (y + wrapped.length * 22 > H - 64) addPage();
            doc.text(wrapped, mx, y); y += wrapped.length * 22 + 6;
          } else if (raw.startsWith("## ")) {
            doc.setFontSize(14); doc.setFont("helvetica", "bold");
            const wrapped = doc.splitTextToSize(line.replace(/^## /, ""), cw);
            if (y + wrapped.length * 18 > H - 64) addPage();
            doc.text(wrapped, mx, y); y += wrapped.length * 18 + 4;
          } else if (raw.startsWith("### ")) {
            doc.setFontSize(12); doc.setFont("helvetica", "bold");
            const wrapped = doc.splitTextToSize(line.replace(/^### /, ""), cw);
            if (y + wrapped.length * 16 > H - 64) addPage();
            doc.text(wrapped, mx, y); y += wrapped.length * 16 + 4;
          } else if (/^[-*•]\s/.test(raw)) {
            doc.setFontSize(11); doc.setFont("helvetica", "normal");
            const wrapped = doc.splitTextToSize("• " + line.replace(/^[-*•]\s/, ""), cw - 14);
            if (y + wrapped.length * 14 > H - 64) addPage();
            doc.text(wrapped, mx + 10, y); y += wrapped.length * 14 + 2;
          } else if (raw.trim() === "") {
            y += 6;
          } else {
            doc.setFontSize(11); doc.setFont("helvetica", "normal");
            const wrapped = doc.splitTextToSize(line, cw);
            if (y + wrapped.length * 14 > H - 64) addPage();
            doc.text(wrapped, mx, y); y += wrapped.length * 14 + 2;
          }
        }
        doc.save(`${filename}.pdf`);
      } else {
        const blob = new Blob([content], { type: "text/markdown" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `${filename}.md`; a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={busy}
      className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-all duration-150 active:scale-[0.96]"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "var(--foreground)",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : format === "pdf"
          ? <FileText className="h-3 w-3" />
          : <Download className="h-3 w-3" />}
      {busy ? "Generating…" : `Download ${format.toUpperCase()}`}
    </button>
  );
}

// ─── PDF text extraction (lazy — only loaded when a PDF is uploaded) ──────────

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  // Use the bundled worker via Vite's asset handling
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf   = await getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter((it) => "str" in it)
        .map((it) => (it as unknown as { str: string }).str)
        .join(" "),
    );
  }
  return pages.join("\n\n");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ForgeAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchStep, setSearchStep] = useState<"searching" | "composing" | null>(null);
  const [searchTopic, setSearchTopic] = useState("");
  const [pendingActions, setPendingActions] = useState<ForgeAction[]>([]);
  const [pendingActionsTotal, setPendingActionsTotal] = useState(0);

  // Draggable position for the panel (null = not yet initialised)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  // Resizable panel size
  const [panelSize, setPanelSize] = useState({ w: PANEL_W, h: PANEL_H });
  const resizing = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, w: PANEL_W, h: PANEL_H });

  // Minimized — shows only the header bar
  const [minimized, setMinimized] = useState(false);

  // Whiteboard lesson state
  const [whiteboardLesson,  setWhiteboardLesson]  = useState<TutoringLesson | null>(null);
  const [showWhiteboard,    setShowWhiteboard]    = useState(false);
  const [pendingWhiteboard, setPendingWhiteboard] = useState(false);
  const [wbLoading,         setWbLoading]         = useState(false);

  // Draggable position for the bubble button
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const bubbleDragging = useRef(false);
  const bubbleOrigin = useRef({ px: 0, py: 0, bx: 0, by: 0 });
  const bubbleDidDrag = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  // Pending file/image attachment
  const [attachment, setAttachment] = useState<{
    type: "image" | "pdf" | "text";
    filename: string;
    data: string;       // base64 for images, extracted text for pdf/txt
    mimeType: string;
    previewUrl?: string; // object URL for image thumbnail
  } | null>(null);

  // Mobile detection — bottom-sheet vs floating panel
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  // User identity — needed by callbacks below
  const { user } = useAuth();
  const userName =
    (user?.user_metadata?.full_name as string)?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  // Voice personality settings (tone, expressiveness, reply length, speech speed)
  const { personality } = useVoicePersonality();

  // Voice input via MediaRecorder + Gemini transcription (existing)
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Speech-to-speech voice mode (NEW) ───────────────────────────────────────
  const [voiceMode, setVoiceMode]           = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [speaking, setSpeaking]             = useState(false);
  const srRef            = useRef<SR | null>(null);
  const voiceModeRef     = useRef(false);   // stale-closure-safe copy
  const loadingRef       = useRef(false);   // stale-closure-safe copy
  const speakingRef      = useRef(false);   // stale-closure-safe copy — prevents restart while TTS is playing
  // forward refs so callbacks can call each other without circular deps
  const startListeningRef = useRef<() => void>(() => {});
  const sendVoiceRef      = useRef<(text: string) => void>(() => {});

  const toggleVoice = useCallback(async () => {
    // Stop if already recording
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) return; // too short, ignore
        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) {
            setInput(text);
            if (textareaRef.current) {
              textareaRef.current.style.height = "auto";
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 96)}px`;
              textareaRef.current.focus();
            }
          }
        } catch (err) {
          console.error("Transcription error:", err);
          toast.error(err instanceof Error ? err.message : "Couldn't transcribe audio");
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [listening]);

  // Keep stale-closure-safe refs up to date
  useEffect(() => { voiceModeRef.current  = voiceMode; }, [voiceMode]);
  useEffect(() => { loadingRef.current    = loading;   }, [loading]);
  useEffect(() => { speakingRef.current   = speaking;  }, [speaking]);

  // ── Text-to-speech ─────────────────────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    // Strip markdown + action blocks so speech sounds natural
    const clean = text
      .replace(/\[FORGE_ACTION[\s\S]*?\]/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`[^`]+`/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) return;

    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate  = speedToRate(personality.speechSpeed);
    utter.pitch = 1.0;
    utter.volume = 1.0;

    // Pick the most natural-sounding English voice available
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const voice  =
        voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("google")) ||
        voices.find((v) => v.lang === "en-US" && !v.localService)  ||
        voices.find((v) => v.lang.startsWith("en-US"))              ||
        voices.find((v) => v.lang.startsWith("en"));
      if (voice) utter.voice = voice;
    };
    loadVoice();
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener("voiceschanged", loadVoice, { once: true });
    }

    utter.onstart = () => setSpeaking(true);
    utter.onend   = () => {
      setSpeaking(false);
      // Auto-restart listening after Forge finishes speaking (if still in voice mode)
      if (voiceModeRef.current && !loadingRef.current) {
        startListeningRef.current();
      }
    };
    utter.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utter);
  }, [personality.speechSpeed]);

  // ── SpeechRecognition ──────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SRCtor = (
      (window as unknown as { SpeechRecognition?: SRCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition
    );
    if (!SRCtor) {
      toast.error("Voice recognition isn't supported in this browser");
      return;
    }

    // Don't start if already listening or AI is loading/speaking
    if (loadingRef.current) return;

    const sr = new SRCtor();
    sr.continuous     = false;  // stop after a natural pause
    sr.interimResults = true;
    sr.lang           = "en-US";

    let finalText = "";

    sr.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setVoiceTranscript((finalText + interim).trim());
    };

    sr.onend = () => {
      setVoiceListening(false);
      const said = finalText.trim();
      if (said && voiceModeRef.current) {
        setVoiceTranscript("");
        sendVoiceRef.current(said);
      } else if (voiceModeRef.current && !loadingRef.current && !speakingRef.current) {
        // Nothing heard — restart listening automatically to keep the loop going
        setTimeout(() => startListeningRef.current(), 300);
      }
    };

    sr.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("SpeechRecognition error:", e.error);
      }
      setVoiceListening(false);
      // Auto-restart on no-speech so the user doesn't have to tap again
      if (voiceModeRef.current && !loadingRef.current && !speakingRef.current) {
        setTimeout(() => startListeningRef.current(), 300);
      }
    };

    srRef.current = sr;
    try {
      sr.start();
      setVoiceListening(true);
      setVoiceTranscript("");
    } catch {
      /* already started or not permitted */
    }
  }, []);

  // Keep forward refs in sync
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── Toggle voice mode ──────────────────────────────────────────────────────
  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      // --- turn OFF ---
      srRef.current?.abort();
      window.speechSynthesis?.cancel();
      setVoiceMode(false);
      setVoiceListening(false);
      setVoiceTranscript("");
      setSpeaking(false);
    } else {
      // --- turn ON ---
      setVoiceMode(true);
      // Small delay so voiceModeRef updates, then greet by name.
      // speakText's onend auto-starts listening when done.
      setTimeout(() => speakText(`Hey ${userName}, what's on your mind?`), 120);
    }
  }, [voiceMode, userName, speakText]);

  // Stop TTS + recognition when panel closes
  useEffect(() => {
    if (!open) {
      srRef.current?.abort();
      window.speechSynthesis?.cancel();
      setVoiceMode(false);
      setVoiceListening(false);
      setVoiceTranscript("");
      setSpeaking(false);
    }
  }, [open]);

  const { events, subjects, refetch } = useSchedule();

  // Initialise panel position bottom-right on first open
  useEffect(() => {
    if (open && pos === null) {
      setPos({
        x: Math.max(0, window.innerWidth - panelSize.w - 24),
        y: Math.max(0, window.innerHeight - panelSize.h - 24),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Listen for external open trigger (e.g. Topbar Sparkles button)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("forge:open", handler);
    return () => window.removeEventListener("forge:open", handler);
  }, []);

  // ── Drag (mouse) ────────────────────────────────────────────────────────────

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!pos) return;
      dragging.current = true;
      dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      e.preventDefault();
    },
    [pos],
  );

  const onHeaderTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!pos) return;
      const t = e.touches[0];
      dragging.current = true;
      dragOffset.current = { dx: t.clientX - pos.x, dy: t.clientY - pos.y };
    },
    [pos],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (resizing.current) {
        const dw = e.clientX - resizeStart.current.mx;
        const dh = e.clientY - resizeStart.current.my;
        setPanelSize({
          w: Math.max(MIN_W, Math.min(MAX_W, resizeStart.current.w + dw)),
          h: Math.max(MIN_H, Math.min(MAX_H, resizeStart.current.h + dh)),
        });
        return;
      }
      if (!dragging.current) return;
      setPanelSize((sz) => {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - sz.w, e.clientX - dragOffset.current.dx)),
          y: Math.max(0, Math.min(window.innerHeight - sz.h, e.clientY - dragOffset.current.dy)),
        });
        return sz;
      });
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      setPanelSize((sz) => {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - sz.w, t.clientX - dragOffset.current.dx)),
          y: Math.max(0, Math.min(window.innerHeight - sz.h, t.clientY - dragOffset.current.dy)),
        });
        return sz;
      });
    };
    const stopAll = () => {
      dragging.current = false;
      resizing.current = false;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopAll);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", stopAll);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stopAll);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", stopAll);
    };
  }, []);

  // ── Drag (bubble button) ─────────────────────────────────────────────────────

  useEffect(() => {
    const BUBBLE = 56;
    const onMove = (e: PointerEvent) => {
      if (!bubbleDragging.current) return;
      const dx = e.clientX - bubbleOrigin.current.px;
      const dy = e.clientY - bubbleOrigin.current.py;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) bubbleDidDrag.current = true;
      setBubblePos({
        x: Math.max(8, Math.min(window.innerWidth - BUBBLE - 8, bubbleOrigin.current.bx + dx)),
        y: Math.max(8, Math.min(window.innerHeight - BUBBLE - 8, bubbleOrigin.current.by + dy)),
      });
    };
    const onUp = () => {
      bubbleDragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Keep isMobile in sync with viewport resizes
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── File / image attachment handler ─────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const isImage = file.type.startsWith("image/");
    const isPdf   = file.type === "application/pdf";

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64  = dataUrl.split(",")[1];
        setAttachment({ type: "image", filename: file.name, data: base64, mimeType: file.type, previewUrl: dataUrl });
      };
      reader.readAsDataURL(file);
    } else if (isPdf) {
      try {
        const text = await extractPdfText(file);
        setAttachment({ type: "pdf", filename: file.name, data: text, mimeType: "text/plain" });
      } catch {
        toast.error("Couldn't read that PDF — try a different file.");
      }
    } else {
      // Plain text / markdown / other
      const text = await file.text();
      setAttachment({ type: "text", filename: file.name, data: text, mimeType: "text/plain" });
    }
  };

  // ── Chat logic ───────────────────────────────────────────────────────────────

  const scheduleContext = useMemo(() => formatSchedule(events, subjects), [events, subjects]);

  // ── Persistent memory ────────────────────────────────────────────────────────
  const memoryKey = `forge_memory_${user?.id ?? "anon"}`;
  const [forgeMemory, setForgeMemory] = useState<string>(() => {
    try { return localStorage.getItem(`forge_memory_${user?.id ?? "anon"}`) ?? ""; } catch { return ""; }
  });
  // Reload memory if user ID resolves after mount
  useEffect(() => {
    try { setForgeMemory(localStorage.getItem(memoryKey) ?? ""); } catch { /* ignore */ }
  }, [memoryKey]);
  const saveMemory = useCallback((text: string) => {
    try { localStorage.setItem(memoryKey, text); } catch { /* ignore */ }
    setForgeMemory(text);
  }, [memoryKey]);

  /**
   * Core message handler — shared by text input and voice mode.
   * speakReply: if true, reads the AI response aloud (voice mode).
   */
  const processMessage = async (text: string, speakReply: boolean) => {
    // Snapshot and clear attachment before async work to avoid stale state
    const currentAttachment = attachment;
    setAttachment(null);

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: text,
      attachmentPreview: currentAttachment
        ? {
            type: currentAttachment.type === "image" ? "image" : "file",
            filename: currentAttachment.filename,
            dataUrl: currentAttachment.previewUrl,
          }
        : undefined,
      // Persist extracted text so follow-up turns can still reference it
      fileContext: currentAttachment && currentAttachment.type !== "image"
        ? `=== UPLOADED FILE: ${currentAttachment.filename} ===\n${currentAttachment.data.slice(0, 6000)}\n=== END FILE ===`
        : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // ── Image attachment → vision pipeline ────────────────────────────────────
    if (currentAttachment?.type === "image") {
      try {
        const history: ChatMessage[] = [...messages, userMsg]
          .filter((m) => m.id !== 0)
          .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), parts: m.content }));
        const reply = await analyzeWithVision(
          currentAttachment.data,
          currentAttachment.mimeType,
          text,
          history,
          buildAssistantDateContext(new Date()),
          forgeMemory || undefined,
        );
        setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: reply }]);
        if (speakReply && voiceModeRef.current) speakText(reply);
      } catch {
        const err = "I couldn't analyse that image — try again.";
        setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: err }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isForgeConfigured()) {
      await new Promise<void>((r) => setTimeout(r, 700));
      const reply = getFallbackReply(text);
      setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: reply }]);
      if (speakReply && voiceModeRef.current) speakText(reply);
      setLoading(false);
      return;
    }

    // ── Whiteboard lesson pipeline ─────────────────────────────────────────
    const isWhiteboardIntent = WHITEBOARD_RE.test(text) || pendingWhiteboard;
    if (isWhiteboardIntent) {
      setPendingWhiteboard(false);
      const topic = extractTopic(text.replace(WHITEBOARD_RE, "").trim()) || text.replace(WHITEBOARD_RE, "").trim() || text;
      const introId = Date.now() + 1;
      setMessages((prev) => [...prev, {
        id: introId,
        role: "assistant",
        content: `Opening whiteboard for **${topic}**… Searching and building your lesson — this takes a moment.`,
      }]);
      setWbLoading(true);
      setLoading(false);
      try {
        const { content: webContent } = await searchWeb(topic).catch(() => ({ content: "", sources: [] }));
        const lesson = await generateLesson(topic, webContent, forgeMemory || undefined);
        setWhiteboardLesson(lesson);
        setShowWhiteboard(true);
        setMessages((prev) => prev.map((m) =>
          m.id === introId
            ? { ...m, content: `Lesson ready! The whiteboard is now open. Use the sidebar to navigate sections, Space to pause, and click any completed section to re-explain it.` }
            : m,
        ));
      } catch {
        setMessages((prev) => prev.map((m) =>
          m.id === introId
            ? { ...m, content: "Couldn't generate the lesson right now — try again in a moment." }
            : m,
        ));
      } finally {
        setWbLoading(false);
      }
      return;
    }

    // ── Teaching pipeline ──────────────────────────────────────────────────
    const isTeachIntent = TEACH_RE.test(text.trim()) && !SCHEDULE_RE.test(text);
    if (isTeachIntent) {
      const topic = extractTopic(text) || text;
      setSearching(true);
      setSearchTopic(topic);
      setSearchStep("searching");
      try {
        const history: ChatMessage[] = [...messages, userMsg]
          .filter((m) => m.id !== 0)
          .map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("model" as const),
            parts: m.content,
          }));

        // Agent 1 — Perplexity Sonar: search the web
        let webContent = "";
        let sources: string[] = [];
        try {
          const result = await searchWeb(topic);
          webContent = result.content;
          sources = result.sources;
        } catch { /* fall through — teach from training data */ }

        // Agent 2 — GPT-4o-mini: compose the lesson
        setSearchStep("composing");
        const { text: reply } = await teachFromContent(
          webContent,
          history,
          buildAssistantDateContext(new Date()),
          forgeMemory || undefined,
        );

        setMessages((prev) => [...prev, {
          id: Date.now(),
          role: "assistant",
          content: reply,
          sources: sources.length > 0 ? sources : undefined,
        }]);
        if (speakReply && voiceModeRef.current) speakText(reply);
      } catch {
        const errMsg = "Couldn't reach the search agent right now — try again in a moment.";
        setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: errMsg }]);
        if (speakReply && voiceModeRef.current) speakText(errMsg);
      } finally {
        setSearching(false);
        setSearchStep(null);
        setSearchTopic("");
        setLoading(false);
      }
      return;
    }

    try {
      const history: ChatMessage[] = [...messages, userMsg]
        .filter((m) => m.id !== 0)
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("model" as const),
          parts: m.content,
        }));

      // Inject uploaded PDF/text as extra context.
      // Image attachments are handled via early return above.
      // For follow-up questions we re-use fileContext stored on the original user message.
      const recentFileCtx =
        userMsg.fileContext ??
        [...messages].reverse().find((m) => m.role === "user" && m.fileContext)?.fileContext;
      const fileCtx = recentFileCtx ? `\n\n${recentFileCtx}` : "";

      // When in voice mode, inject personality-driven instructions
      const ctx = speakReply
        ? scheduleContext + fileCtx + "\n\n" + buildVoiceContext(personality, userName)
        : scheduleContext + fileCtx;

      const { text, rawActions } = await sendForgeMessage(
        history,
        ctx,
        buildAssistantDateContext(new Date()),
        forgeMemory || undefined,
      );

      // Extract and save any memory update before displaying
      const MEMORY_RE = /\[FORGE_MEMORY:\s*([\s\S]*?)\s*\]/;
      const memMatch = text.match(MEMORY_RE);
      if (memMatch) saveMemory(memMatch[1].trim());

      // Parse [FORGE_IMAGE:{...}] — inline generated image
      const IMAGE_BLOCK_RE = /\[FORGE_IMAGE:\s*(\{[\s\S]*?\})\s*\]/g;
      let imageData: Message["image"] | undefined;
      for (const m of text.matchAll(IMAGE_BLOCK_RE)) {
        try {
          const parsed = JSON.parse(m[1]) as { prompt: string; caption: string; source?: string };
          imageData = { url: generateImageUrl(parsed.prompt), caption: parsed.caption, source: parsed.source };
        } catch { /* skip malformed */ }
        break; // one image per message
      }

      // Parse [FORGE_DOWNLOAD:{...}] — downloadable file offer
      const DOWNLOAD_BLOCK_RE = /\[FORGE_DOWNLOAD:\s*(\{[\s\S]*?\})\s*\]/g;
      let downloadData: Message["downloadable"] | undefined;
      for (const m of text.matchAll(DOWNLOAD_BLOCK_RE)) {
        try {
          const parsed = JSON.parse(m[1]) as { filename: string; format: "pdf" | "md" };
          downloadData = { filename: parsed.filename, format: parsed.format };
        } catch { /* skip malformed */ }
        break;
      }

      // Strip all action/media blocks and memory from display text
      const clean = text
        .replace(/\[FORGE_ACTION:[\s\S]*?\]/g, "")
        .replace(/\[APP_ACTION:[\s\S]*?\]/g, "")
        .replace(/\[FORGE_IMAGE:[\s\S]*?\]/g, "")
        .replace(/\[FORGE_DOWNLOAD:[\s\S]*?\]/g, "")
        .replace(MEMORY_RE, "")
        .trim();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: clean,
          image: imageData,
          downloadable: downloadData,
        },
      ]);

      // ── Speak the reply in voice mode ───────────────────────────────────
      if (speakReply && voiceModeRef.current) speakText(clean);

      if (rawActions.length > 0) {
        const parsed: ForgeAction[] = [];
        for (const rawAction of rawActions) {
          try {
            parsed.push(normalizeForgeAction(
              rawAction as Parameters<typeof normalizeForgeAction>[0],
              new Date(),
            ));
          } catch {
            // skip malformed actions
          }
        }

        if (parsed.length > 0) {
          // Client-side conflict guard
          const confirmed: ForgeAction[] = [];
          const conflictNotes: string[] = [];

          for (const action of parsed) {
            if (action.action === "add_event") {
              const e = action.event;
              const newStart = timeStringToMinutes(e.startTime);
              const newEnd = timeStringToMinutes(e.endTime);
              const conflict = events.find(
                (ex) => ex.day === e.day && ex.start < newEnd && ex.end > newStart,
              );
              if (conflict) {
                conflictNotes.push(
                  `Heads up — there's already "${conflict.title}" (${fmt(conflict.start)}–${fmt(conflict.end)}) in that slot on ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][e.day]}. Want me to move it, pick a different time, or replace it?`,
                );
              } else {
                confirmed.push(action);
              }
            } else {
              confirmed.push(action);
            }
          }

          if (conflictNotes.length > 0) {
            const note = conflictNotes[0];
            setMessages((prev) => [
              ...prev,
              { id: Date.now() + 1, role: "assistant", content: note },
            ]);
            if (speakReply && voiceModeRef.current) speakText(note);
          }
          if (confirmed.length > 0) {
            setPendingActions(confirmed);
            setPendingActionsTotal(confirmed.length);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("rate") || msg.includes("busy");
      toast.error(isQuota ? "All models are busy — try again in a moment" : "Forge AI is unavailable right now");
      const errContent = isQuota
        ? "Hmm, all models are a bit busy right now — give me a second and try again."
        : "Sorry, I ran into an issue. Please try again.";
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "assistant", content: errContent },
      ]);
      if (speakReply && voiceModeRef.current) speakText(errContent);
    } finally {
      setLoading(false);
    }
  };

  // Text-input send (unchanged behaviour)
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await processMessage(text, voiceMode);
  };

  // Voice send — called from startListening's onend
  const sendVoice = useCallback((text: string) => {
    if (!text || loadingRef.current) return;
    processMessage(text, true);
  // processMessage is re-created each render, but that's fine —
  // sendVoiceRef always points to the latest version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { sendVoiceRef.current = sendVoice; }, [sendVoice]);

  const applyAction = async () => {
    if (pendingActions.length === 0 || !user) return;
    const action = pendingActions[0];
    const remaining = pendingActions.length - 1;
    try {
      if (action.action === "add_event") {
        const { error } = await supabase
          .from("events")
          .insert(buildEventInsert(action.event, user.id));
        if (error) throw error;
      } else if (action.action === "edit_event") {
        const p = action.patch;
        const patch = {
          ...(p.day !== undefined && { day_of_week: p.day }),
          ...(p.date !== undefined && { event_date: p.date }),
          ...(p.startTime !== undefined && { start_minute: timeStringToMinutes(p.startTime) }),
          ...(p.endTime !== undefined && { end_minute: timeStringToMinutes(p.endTime) }),
          ...(p.title !== undefined && { title: p.title }),
          ...(p.venue !== undefined && { venue: p.venue }),
        };
        const { error, data } = await supabase
          .from("events")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(patch as any)
          .eq("id", action.eventId)
          .eq("user_id", user.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error(`Event not found: ${action.eventId}`);
      } else {
        const { error } = await supabase
          .from("events")
          .delete()
          .eq("id", action.eventId)
          .eq("user_id", user.id);
        if (error) throw error;
      }

      // Refresh the schedule in this panel and broadcast to all mounted calendar views
      broadcastScheduleUpdate();
      await refetch();

      setPendingActions((prev) => prev.slice(1));
      if (remaining === 0) {
        toast.success("Schedule updated");
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content: "Done! Your schedule has been updated." },
        ]);
      } else {
        toast.success(`Added (${pendingActionsTotal - remaining} of ${pendingActionsTotal})`);
      }
    } catch (err) {
      console.error("Forge schedule update failed:", err);
      const message = "Sorry, I couldn't update that. Try asking again?";
      toast.error(message);
      setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: message }]);
      setPendingActions((prev) => prev.slice(1));
    }
  };

  const rejectAction = () => {
    setPendingActions((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) {
        setMessages((m) => [
          ...m,
          { id: Date.now(), role: "assistant", content: "No problem, I've discarded that change." },
        ]);
      }
      return next;
    });
  };

  // ── Render: bubble (closed) ───────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onPointerDown={(e) => {
          bubbleDidDrag.current = false;
          const r = e.currentTarget.getBoundingClientRect();
          bubbleOrigin.current = { px: e.clientX, py: e.clientY, bx: r.left, by: r.top };
          bubbleDragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onClick={() => {
          if (!bubbleDidDrag.current) setOpen(true);
        }}
        className="z-50 h-14 w-14 rounded-[18px] grid place-items-center active:scale-[0.92]"
        style={{
          position:            "fixed",
          ...(bubblePos ? { left: bubblePos.x, top: bubblePos.y } : { bottom: 24, right: 24 }),
          cursor:              "grab",
          background:          "var(--glass-bg-btn-dark)",
          backdropFilter:      "blur(var(--glass-blur))",
          WebkitBackdropFilter:"blur(var(--glass-blur))",
          border:              "1px solid var(--glass-border-dark)",
          boxShadow:           "0 1px 0 rgba(255,255,255,0.14) inset, var(--glass-shadow)",
          transition:          "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease",
          touchAction:         "none",
          userSelect:          "none",
        }}
        aria-label="Open Forge AI assistant"
      >
        <Sparkles className="h-5 w-5 text-white relative z-10" aria-hidden="true" />
      </button>
    );
  }

  // ── Render: panel (open) ──────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe for typing dots + voice animations */}
      <style>{`
        @keyframes forge-dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes forge-voice-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%       { opacity: 0.3; transform: scale(0.75); }
        }
        @keyframes forge-voice-ring {
          0%   { opacity: 0.6; transform: scale(1);   }
          100% { opacity: 0;   transform: scale(1.9); }
        }
        @keyframes forge-voice-bars {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1.0); }
        }
      `}</style>

      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className="fixed inset-0 z-40"
          style={{
            background: "oklch(0 0 0 / 0.5)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className="glass-panel fixed z-50 flex flex-col overflow-hidden"
        style={
          isMobile
            ? {
                bottom: 0,
                left: 0,
                right: 0,
                height: "min(85svh, 580px)",
                borderBottom: "none",
                borderRadius: "24px 24px 0 0",
                backdropFilter: `blur(var(--glass-blur)) saturate(180%)`,
                WebkitBackdropFilter: `blur(var(--glass-blur)) saturate(180%)`,
              }
            : {
                ...(pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 24 }),
                width: panelSize.w,
                height: minimized ? "auto" : panelSize.h,
                borderRadius: "24px",
                backdropFilter: `blur(var(--glass-blur)) saturate(180%)`,
                WebkitBackdropFilter: `blur(var(--glass-blur)) saturate(180%)`,
                transition: "height 0.22s cubic-bezier(0.23,1,0.32,1)",
              }
        }
      >
        {/* Resize handle — bottom-right corner (desktop only, hidden when minimized) */}
        {!isMobile && !minimized && (
          <div
            onMouseDown={(e) => {
              resizing.current = true;
              resizeStart.current = { mx: e.clientX, my: e.clientY, w: panelSize.w, h: panelSize.h };
              e.preventDefault();
              e.stopPropagation();
            }}
            className="absolute bottom-0 right-0 z-10 flex items-end justify-end p-2 cursor-nwse-resize"
            style={{ width: 28, height: 28, touchAction: "none" }}
            aria-hidden="true"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
              style={{ opacity: 0.35, color: "var(--foreground)" }}>
              <circle cx="8.5" cy="8.5" r="1.1" />
              <circle cx="5"   cy="8.5" r="1.1" />
              <circle cx="8.5" cy="5"   r="1.1" />
            </svg>
          </div>
        )}

        {/* Specular highlight — top-left light hit */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: isMobile ? "24px 24px 0 0" : "24px",
            background:
              "radial-gradient(ellipse 80% 40% at 20% 0%, oklch(1 0 0 / 0.07) 0%, transparent 60%)",
          }}
        />

        {/* Mobile drag pill */}
        {isMobile && (
          <div className="flex justify-center pt-3 pb-0 shrink-0">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
          </div>
        )}

        {/* Header / drag handle */}
        <div
          onMouseDown={!isMobile ? onHeaderMouseDown : undefined}
          onTouchStart={!isMobile ? onHeaderTouchStart : undefined}
          className={cn(
            "flex items-center justify-between px-4 py-3 select-none shrink-0 relative",
            !isMobile && "cursor-grab active:cursor-grabbing",
          )}
          style={{
            borderBottom: "1px solid var(--glass-border-dark)",
            background:   "var(--glass-bg-btn-dark)",
          }}
        >
          <div className="flex items-center gap-2.5">
            {/* Logo mark */}
            <div
              className="h-7 w-7 rounded-[10px] grid place-items-center relative overflow-hidden shrink-0"
              style={{
                background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.56 0.23 250))",
                boxShadow: "0 1px 0 oklch(1 0 0 / 0.2) inset",
              }}
            >
              <Sparkles className="h-[13px] w-[13px] text-white relative z-10" aria-hidden="true" />
              <span className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            </div>
            <div>
              <p
                className="text-[13px] font-semibold leading-none"
                style={{ letterSpacing: "-0.01em" }}
              >
                Forge AI
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Your study assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isMobile && (
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/25" aria-hidden="true" />
            )}
            {/* Whiteboard button */}
            <button
              onClick={() => {
                if (showWhiteboard && whiteboardLesson) {
                  // Re-open existing lesson
                  setShowWhiteboard(true);
                } else {
                  // Enter pending-whiteboard mode — next send triggers lesson generation
                  setPendingWhiteboard((p) => !p);
                }
              }}
              className="h-7 w-7 rounded-xl grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.08] active:scale-[0.93] transition-all duration-150"
              style={{
                border:     pendingWhiteboard || showWhiteboard ? "1px solid rgba(240,194,127,0.45)" : "1px solid var(--border)",
                background: pendingWhiteboard || showWhiteboard ? "rgba(240,194,127,0.08)" : undefined,
              }}
              aria-label="Open whiteboard lesson"
              title={pendingWhiteboard ? "Whiteboard mode on — type a topic and send" : "Start whiteboard lesson"}
            >
              {wbLoading
                ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#f0c27f" }} />
                : <GraduationCap className="h-3.5 w-3.5" style={{ color: pendingWhiteboard || showWhiteboard ? "#f0c27f" : undefined }} />}
            </button>

            <button
              onClick={() => setMinimized((m) => !m)}
              className="h-7 w-7 rounded-xl grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.08] active:scale-[0.93] transition-all duration-150"
              style={{ border: "1px solid var(--border)" }}
              aria-label={minimized ? "Restore assistant" : "Minimise assistant"}
            >
              {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-xl grid place-items-center text-muted-foreground hover:text-foreground hover:bg-white/[0.08] active:scale-[0.93] transition-all duration-150"
              style={{
                border: "1px solid var(--border)",
              }}
              aria-label="Close assistant"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body — hidden when minimized */}
        {!minimized && <>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0" style={{ background: "transparent" }}>
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start") + " w-full"}>
                {m.role === "assistant" && (
                  <div
                    className="h-5 w-5 rounded-lg grid place-items-center shrink-0 mr-2 mt-1"
                    style={{
                      background: "var(--glass-bg-btn-dark)",
                      border:     "1px solid var(--glass-border-dark)",
                    }}
                  >
                    <Sparkles className="h-[9px] w-[9px] opacity-70" style={{ color: "var(--foreground)" }} aria-hidden="true" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    m.role === "user" ? "rounded-tr-sm relative overflow-hidden whitespace-pre-wrap" : "rounded-tl-sm",
                  )}
                  style={
                    m.role === "user"
                      ? {
                          background:           "var(--glass-bg-active-dark)",
                          backdropFilter:       "blur(var(--glass-blur))",
                          WebkitBackdropFilter: "blur(var(--glass-blur))",
                          border:               "1px solid var(--glass-border-dark)",
                          boxShadow:            "0 1px 0 rgba(255,255,255,0.12) inset",
                          color:                "var(--foreground)",
                        }
                      : {
                          background:           "var(--glass-bg-dark)",
                          backdropFilter:       "blur(var(--glass-blur))",
                          WebkitBackdropFilter: "blur(var(--glass-blur))",
                          border:               "1px solid var(--glass-border-dark)",
                          color:                "var(--foreground)",
                        }
                  }
                >
                  {m.role === "user" && (
                    <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none rounded-2xl" />
                  )}
                  {/* Attachment preview inside user bubble */}
                  {m.role === "user" && m.attachmentPreview && (
                    <div className="mb-1.5 relative">
                      {m.attachmentPreview.type === "image" && m.attachmentPreview.dataUrl ? (
                        <img
                          src={m.attachmentPreview.dataUrl}
                          alt={m.attachmentPreview.filename}
                          className="rounded-xl w-full object-cover"
                          style={{ maxHeight: 180 }}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg"
                          style={{ background: "rgba(255,255,255,0.10)" }}>
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{m.attachmentPreview.filename}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <span className="relative">
                    {m.role === "assistant" ? <MessageContent content={m.content} /> : m.content}
                  </span>
                  {/* Inline generated image */}
                  {m.role === "assistant" && m.image && (
                    <ImageBlock image={m.image} />
                  )}
                  {/* Download button */}
                  {m.role === "assistant" && m.downloadable && (
                    <DownloadButton
                      content={m.content}
                      filename={m.downloadable.filename}
                      format={m.downloadable.format}
                    />
                  )}
                </div>
              </div>

              {/* Sources — shown below assistant teaching messages */}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-wider">Sources</span>
                  {m.sources.map((url, i) => {
                    let host = url;
                    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] transition-colors duration-150"
                        style={{ color: "oklch(0.65 0.16 255 / 0.65)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.72 0.18 255)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "oklch(0.65 0.16 255 / 0.65)")}
                      >
                        [{i + 1}] {host}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start items-start gap-2">
              <div
                className="h-5 w-5 rounded-lg grid place-items-center shrink-0 mt-0.5"
                style={{
                  background: "var(--glass-bg-btn-dark)",
                  border:     "1px solid var(--glass-border-dark)",
                }}
              >
                {searching
                  ? <Search className="h-[9px] w-[9px] text-white/70" aria-hidden="true" />
                  : <Sparkles className="h-[9px] w-[9px] text-white/70" aria-hidden="true" />
                }
              </div>

              {searching ? (
                /* ── Animated search steps ── */
                <div
                  className="rounded-2xl rounded-tl-sm px-3 py-2.5 space-y-2"
                  style={{
                    background:           "var(--glass-bg-dark)",
                    backdropFilter:       "blur(var(--glass-blur))",
                    WebkitBackdropFilter: "blur(var(--glass-blur))",
                    border:               "1px solid var(--glass-border-dark)",
                    minWidth: 200,
                  }}
                >
                  {/* Step 1 — Search */}
                  <div className="flex items-center gap-2">
                    {searchStep === "searching" ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/60" />
                    ) : (
                      <Check className="h-3 w-3 shrink-0" style={{ color: "oklch(0.72 0.17 140)" }} />
                    )}
                    <span className="text-[11px] text-muted-foreground/80">
                      {searchStep === "searching"
                        ? `Searching for "${searchTopic}"…`
                        : `Searched "${searchTopic}"`}
                    </span>
                  </div>
                  {/* Step 2 — Compose */}
                  {searchStep === "composing" && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/60" />
                      <span className="text-[11px] text-muted-foreground/80">Composing your lesson…</span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-2xl rounded-tl-sm px-3 py-2.5"
                  style={{
                    background:           "var(--glass-bg-dark)",
                    backdropFilter:       "blur(var(--glass-blur))",
                    WebkitBackdropFilter: "blur(var(--glass-blur))",
                    border:               "1px solid var(--glass-border-dark)",
                  }}
                >
                  <TypingDots />
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Pending action confirmation */}
        {pendingActions.length > 0 && (
          <div
            className="mx-3 mb-2 p-3 rounded-2xl shrink-0 relative overflow-hidden"
            style={{
              background: "color-mix(in oklch, var(--primary) 10%, var(--card))",
              border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
            }}
          >
            {/* Subtle gradient overlay */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.74 0.19 295 / 0.06) 0%, transparent 70%)",
              }}
            />
            <div className="flex items-center justify-between mb-1 relative">
              <p className="text-[11px] font-semibold" style={{ color: "oklch(0.74 0.19 295)" }}>
                Proposed change
              </p>
              {pendingActionsTotal > 1 && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                  style={{
                    background: "oklch(0.62 0.21 285 / 0.15)",
                    color: "oklch(0.74 0.19 295)",
                  }}
                >
                  {pendingActionsTotal - pendingActions.length + 1} of {pendingActionsTotal}
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground mb-3 leading-snug relative">
              {describeAction(pendingActions[0], subjects, events)}
            </p>
            <div className="flex gap-2 relative">
              <button
                onClick={applyAction}
                className="btn-primary flex-1 h-8 rounded-xl text-[12px]"
              >
                <Check className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">Accept</span>
              </button>
              <button
                onClick={rejectAction}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[12px] font-semibold hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                <XCircle className="h-3.5 w-3.5 opacity-60" />
                <span>Skip</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Voice mode status strip ─────────────────────────────────────── */}
        {voiceMode && (
          <div
            className="mx-3 mb-2 px-3 py-2.5 rounded-xl shrink-0"
            style={{
              background: "var(--glass-bg-dark)",
              border:     "1px solid var(--glass-border-dark)",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
            }}
          >
            <div className="flex items-center gap-2">
              {/* Animated status indicator */}
              {voiceListening ? (
                /* pulsing bars when listening */
                <div className="flex items-center gap-[3px] shrink-0" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full"
                      style={{
                        height: 14,
                        background: "var(--foreground)",
                        opacity: 0.7,
                        animation: `forge-voice-bars 0.9s ease-in-out infinite`,
                        animationDelay: `${i * 0.15}s`,
                        transformOrigin: "center",
                      }}
                    />
                  ))}
                </div>
              ) : speaking ? (
                /* sound wave when Forge is speaking */
                <div className="flex items-center gap-[3px] shrink-0" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full"
                      style={{
                        height: 14,
                        background: "var(--foreground)",
                        opacity: 0.55,
                        animation: `forge-voice-bars 0.7s ease-in-out infinite`,
                        animationDelay: `${i * 0.1}s`,
                        transformOrigin: "center",
                      }}
                    />
                  ))}
                </div>
              ) : (
                /* idle dot */
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: "var(--glass-border-dark)" }}
                />
              )}

              <span className="text-[11px] font-medium text-muted-foreground">
                {loading
                  ? "Thinking…"
                  : speaking
                  ? "Forge is speaking…"
                  : voiceListening
                  ? "Listening…"
                  : "Tap the mic to speak"}
              </span>

              {/* Interrupt / stop speaking */}
              {speaking && (
                <button
                  onClick={() => { window.speechSynthesis.cancel(); setSpeaking(false); }}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Stop speaking"
                >
                  stop
                </button>
              )}
            </div>

            {/* Live transcript */}
            {voiceTranscript && (
              <p
                className="mt-1.5 text-[12px] leading-snug italic"
                style={{ color: "var(--foreground)", opacity: 0.75 }}
              >
                "{voiceTranscript}"
              </p>
            )}
          </div>
        )}

        {/* Input area */}
        <div
          className="p-3 shrink-0 relative"
          style={{
            borderTop: "1px solid var(--border)",
            background: "transparent",
          }}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.csv"
            onChange={handleFileSelect}
          />

          {/* Whiteboard pending banner */}
          {pendingWhiteboard && (
            <div
              className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-xl text-[11px]"
              style={{
                background: "rgba(240,194,127,0.07)",
                border:     "1px solid rgba(240,194,127,0.22)",
                color:      "#f0c27f",
              }}
            >
              <GraduationCap className="h-3 w-3 shrink-0" />
              <span className="flex-1">Whiteboard mode — type a topic and send to open a lesson</span>
              <button onClick={() => setPendingWhiteboard(false)} className="opacity-50 hover:opacity-100 transition-opacity">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Attachment chip — shown when a file is staged */}
          {attachment && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <div
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg max-w-[80%]"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "var(--foreground)",
                }}
              >
                {attachment.type === "image"
                  ? <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  : <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate opacity-80">{attachment.filename}</span>
              </div>
              <button
                onClick={() => setAttachment(null)}
                className="h-5 w-5 rounded-full grid place-items-center text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
                }}
                placeholder={
                  listening ? "Listening…" : transcribing ? "Transcribing…" : "Ask Forge anything…"
                }
                rows={1}
                className="w-full resize-none rounded-xl px-3 py-2 text-[13px] placeholder:text-muted-foreground/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 min-h-[36px] max-h-24 transition-all duration-200"
                style={{
                  background: "var(--input)",
                  border: listening
                    ? "1px solid oklch(0.65 0.24 25 / 0.6)"
                    : "1px solid var(--border)",
                  color: "inherit",
                  transition: "border-color 200ms ease",
                }}
              />
              {/* Mic pulse ring when listening */}
              {listening && (
                <span
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{
                    boxShadow: "0 0 0 2px oklch(0.65 0.24 25 / 0.35)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              )}
            </div>

            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="h-9 w-9 rounded-xl grid place-items-center transition-all duration-150 shrink-0"
              style={{
                background: attachment ? "var(--glass-bg-btn-dark)" : "var(--glass-bg-dark)",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                border: attachment
                  ? "1px solid rgba(255,255,255,0.25)"
                  : "1px solid var(--glass-border-dark)",
              }}
              aria-label="Attach file or image"
            >
              <Paperclip
                className="h-3.5 w-3.5"
                style={{ color: attachment ? "var(--foreground)" : undefined, opacity: attachment ? 0.9 : undefined }}
              />
            </button>

            {/* Mic button */}
            <button
              onClick={toggleVoice}
              disabled={transcribing}
              className="h-9 w-9 rounded-xl grid place-items-center transition-all duration-150 shrink-0 relative overflow-hidden"
              style={
                listening
                  ? {
                      background:          "var(--glass-bg-active-dark)",
                      backdropFilter:      "blur(var(--glass-blur))",
                      WebkitBackdropFilter:"blur(var(--glass-blur))",
                      border:              "1px solid rgba(255,255,255,0.30)",
                      boxShadow:           "0 0 16px rgba(255,255,255,0.12), 0 1px 0 rgba(255,255,255,0.14) inset",
                    }
                  : transcribing
                    ? {
                        background:  "var(--glass-bg-dark)",
                        border:      "1px solid var(--glass-border-dark)",
                        opacity:     0.5,
                        cursor:      "not-allowed",
                      }
                    : {
                        background:          "var(--glass-bg-dark)",
                        backdropFilter:      "blur(var(--glass-blur))",
                        WebkitBackdropFilter:"blur(var(--glass-blur))",
                        border:              "1px solid var(--glass-border-dark)",
                      }
              }
              aria-label={listening ? "Stop recording" : "Start voice input"}
            >
              {transcribing ? (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              ) : listening ? (
                <MicOff className="h-3.5 w-3.5" style={{ color: "var(--foreground)" }} />
              ) : (
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              {listening && (
                <span className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
              )}
            </button>

            {/* ── Voice conversation mode toggle ─────────────────────── */}
            <button
              onClick={toggleVoiceMode}
              className="h-9 w-9 rounded-xl grid place-items-center transition-all duration-200 shrink-0 relative"
              style={
                voiceMode
                  ? {
                      background:           "var(--glass-bg-active-dark)",
                      backdropFilter:       "blur(var(--glass-blur))",
                      WebkitBackdropFilter: "blur(var(--glass-blur))",
                      border:               "1px solid rgba(255,255,255,0.28)",
                      boxShadow:            voiceListening
                        ? "0 0 18px rgba(255,255,255,0.18), 0 1px 0 rgba(255,255,255,0.14) inset"
                        : "0 1px 0 rgba(255,255,255,0.12) inset",
                    }
                  : {
                      background:           "var(--glass-bg-dark)",
                      backdropFilter:       "blur(var(--glass-blur))",
                      WebkitBackdropFilter: "blur(var(--glass-blur))",
                      border:               "1px solid var(--glass-border-dark)",
                    }
              }
              aria-label={voiceMode ? "End voice conversation" : "Start voice conversation"}
              title={voiceMode ? "End conversation" : "Talk to Forge"}
            >
              {/* Expanding ring while listening */}
              {voiceMode && voiceListening && (
                <span
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{
                    animation: "forge-voice-ring 1.4s ease-out infinite",
                    border:    "1px solid rgba(255,255,255,0.35)",
                  }}
                />
              )}
              <AudioLines
                className="h-3.5 w-3.5"
                style={{
                  color:     voiceMode ? "var(--foreground)" : undefined,
                  opacity:   voiceMode ? 0.9 : undefined,
                  animation: voiceMode && (voiceListening || speaking)
                    ? "forge-voice-bars 0.8s ease-in-out infinite"
                    : "none",
                }}
              />
            </button>

            {/* Send button */}
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="h-9 w-9 rounded-xl grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.93] transition-all duration-150 shrink-0"
              style={{
                background:              "var(--glass-bg-btn-dark)",
                backdropFilter:          "blur(var(--glass-blur))",
                WebkitBackdropFilter:    "blur(var(--glass-blur))",
                border:                  "1px solid var(--glass-border-dark)",
                boxShadow:               "0 1px 0 rgba(255,255,255,0.10) inset",
              }}
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5 relative z-10" style={{ color: "var(--foreground)" }} />
            </button>
          </div>

          <p className="mt-2 text-[10px] text-muted-foreground/35 text-center tracking-wide">
            {voiceMode ? "Listening for your voice · tap the waveform to end" : "Enter to send · Shift+Enter for new line · tap waveform to talk"}
          </p>
        </div>

        </>}
      </div>

      {/* Whiteboard overlay */}
      {showWhiteboard && whiteboardLesson && (
        <ForgeWhiteboard
          lesson={whiteboardLesson}
          onClose={() => setShowWhiteboard(false)}
        />
      )}
    </>
  );
}
