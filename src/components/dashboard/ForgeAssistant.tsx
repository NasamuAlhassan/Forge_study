import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  GripHorizontal,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/hooks/use-schedule";
import { useAuth } from "@/hooks/use-auth";
import { sendForgeMessage, transcribeAudio } from "@/lib/forge-ai";
import type { ChatMessage } from "@/lib/forge-ai";
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
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

interface Message {
  id: number;
  role: Role;
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(mins: number) {
  return displayTimeFromMinutes(mins);
}

function formatSchedule(events: EventBlock[], subjects: Subject[]): string {
  if (events.length === 0) return "No events scheduled yet.";

  const lines: string[] = [
    `Subjects: ${subjects.map((s) => `${s.name} (code:${s.code}, id:${s.id}${s.difficulty ? `, difficulty:${s.difficulty}` : ""})`).join(" | ")}`,
    "",
  ];

  for (let d = 0; d < 7; d++) {
    const day = events.filter((e) => e.day === d).sort((a, b) => a.start - b.start);
    if (!day.length) continue;
    lines.push(`${DAYS[d]}:`);
    for (const e of day) {
      const subj = subjects.find((s) => s.id === e.subjectId);
      lines.push(
        `  [id:${e.id}] ${e.title} (${e.type}) ${fmt(e.start)}-${fmt(e.end)}${e.date ? ` on ${e.date}` : ""}${e.venue ? ` @${e.venue}` : ""}${subj ? ` [${subj.code}]` : ""}`,
      );
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

const GREETING: Message = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm Forge AI. Ask me anything about your schedule, or tell me what you'd like to add or change.",
};

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ForgeAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<ForgeAction[]>([]);
  const [pendingActionsTotal, setPendingActionsTotal] = useState(0);

  // Draggable position for the panel (null = not yet initialised)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  // Draggable position for the bubble button
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const bubbleDragging = useRef(false);
  const bubbleOrigin = useRef({ px: 0, py: 0, bx: 0, by: 0 });
  const bubbleDidDrag = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mobile detection — bottom-sheet vs floating panel
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

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
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { loadingRef.current   = loading;   }, [loading]);

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
    utter.rate  = 1.08;
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
  }, []);

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
      }
    };

    sr.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("SpeechRecognition error:", e.error);
      }
      setVoiceListening(false);
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
      // Small delay so voiceModeRef updates before recognition starts
      setTimeout(() => startListeningRef.current(), 120);
    }
  }, [voiceMode]);

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
  const { user } = useAuth();

  // Initialise panel position bottom-right on first open
  useEffect(() => {
    if (open && pos === null) {
      setPos({
        x: Math.max(0, window.innerWidth - PANEL_W - 24),
        y: Math.max(0, window.innerHeight - PANEL_H - 24),
      });
    }
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
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - PANEL_W, e.clientX - dragOffset.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - PANEL_H, e.clientY - dragOffset.current.dy)),
      });
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - PANEL_W, t.clientX - dragOffset.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - PANEL_H, t.clientY - dragOffset.current.dy)),
      });
    };
    const stopDrag = () => {
      dragging.current = false;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDrag);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", stopDrag);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stopDrag);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", stopDrag);
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

  // ── Chat logic ───────────────────────────────────────────────────────────────

  const scheduleContext = useMemo(() => formatSchedule(events, subjects), [events, subjects]);

  /**
   * Core message handler — shared by text input and voice mode.
   * speakReply: if true, reads the AI response aloud (voice mode).
   */
  const processMessage = async (text: string, speakReply: boolean) => {
    const userMsg: Message = { id: Date.now(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history: ChatMessage[] = [...messages, userMsg]
        .filter((m) => m.id !== 0)
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("model" as const),
          parts: m.content,
        }));

      // When in voice mode, nudge towards short conversational replies
      const ctx = speakReply
        ? scheduleContext +
          "\n\n[Voice mode active: reply conversationally and keep it brief — like a smart friend talking, not writing. Short sentences read better aloud.]"
        : scheduleContext;

      const raw = await sendForgeMessage(
        history,
        ctx,
        buildAssistantDateContext(new Date()),
      );

      // Strip ALL action blocks before displaying; collect them all
      const ACTION_RE = /\[FORGE_ACTION:\s*(\{[\s\S]*?\})\s*\]/g;
      const allMatches = Array.from(raw.matchAll(ACTION_RE));
      const clean = raw.replace(/\[FORGE_ACTION:\s*\{[\s\S]*?\}\s*\]/g, "").trim();

      setMessages((prev) => [...prev, { id: Date.now(), role: "assistant", content: clean }]);

      // ── Speak the reply in voice mode ───────────────────────────────────
      if (speakReply && voiceModeRef.current) speakText(clean);

      if (allMatches.length > 0) {
        const parsed: ForgeAction[] = [];
        for (const match of allMatches) {
          try {
            parsed.push(normalizeForgeAction(JSON.parse(match[1]), new Date()));
          } catch {
            // skip malformed individual blocks
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
      const msg = err instanceof Error ? err.message : "";
      const isQuota = msg.includes("429") || msg.includes("quota");
      toast.error(
        isQuota
          ? "API quota exceeded — check your Gemini plan"
          : "Forge AI is unavailable right now",
      );
      const errContent = isQuota
        ? "I've hit the API rate limit. Please wait a minute or check your Gemini API quota at aistudio.google.com."
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
    await processMessage(text, false);
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
        const { error } = await supabase
          .from("events")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(patch as any)
          .eq("id", action.eventId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("events")
          .delete()
          .eq("id", action.eventId)
          .eq("user_id", user.id);
        if (error) throw error;
      }
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
      const message = "Sorry, I couldn't add that to your schedule. Try again?";
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
              }
            : {
                ...(pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 24 }),
                width: PANEL_W,
                height: PANEL_H,
                borderRadius: "24px",
              }
        }
      >
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
            background:   "var(--glass-bg-active-dark)",
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
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
                  "max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user" ? "rounded-tr-sm relative overflow-hidden" : "rounded-tl-sm",
                )}
                style={
                  m.role === "user"
                    ? {
                        background:          "var(--glass-bg-active-dark)",
                        backdropFilter:      "blur(var(--glass-blur))",
                        WebkitBackdropFilter:"blur(var(--glass-blur))",
                        border:              "1px solid var(--glass-border-dark)",
                        boxShadow:           "0 1px 0 rgba(255,255,255,0.12) inset",
                        color:               "var(--foreground)",
                      }
                    : {
                        background:          "var(--glass-bg-dark)",
                        backdropFilter:      "blur(var(--glass-blur))",
                        WebkitBackdropFilter:"blur(var(--glass-blur))",
                        border:              "1px solid var(--glass-border-dark)",
                      }
                }
              >
                {m.role === "user" && (
                  <span className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none rounded-2xl" />
                )}
                <span className="relative">{m.content}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start items-end gap-2">
              <div
                className="h-5 w-5 rounded-lg grid place-items-center shrink-0"
                style={{
                  background: "var(--glass-bg-btn-dark)",
                  border:     "1px solid var(--glass-border-dark)",
                }}
              >
                <Sparkles className="h-[9px] w-[9px] text-white/70" aria-hidden="true" />
              </div>
              <div
                className="rounded-2xl rounded-tl-sm px-3 py-2.5"
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                <TypingDots />
              </div>
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
              aria-label={voiceMode ? "Stop voice conversation mode" : "Start voice conversation mode"}
              title={voiceMode ? "Exit voice mode" : "Voice conversation mode"}
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
              {voiceMode && speaking ? (
                <VolumeX
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--foreground)", opacity: 0.85 }}
                />
              ) : voiceMode ? (
                <Mic
                  className="h-3.5 w-3.5"
                  style={{
                    color:     "var(--foreground)",
                    opacity:   0.9,
                    animation: voiceListening ? "forge-voice-pulse 1.2s ease-in-out infinite" : "none",
                  }}
                />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              )}
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
            {voiceMode ? "Voice mode on — tap 🎤 to speak · tap again to stop" : "Enter to send · Shift+Enter for new line · 🔊 for voice mode"}
          </p>
        </div>
      </div>
    </>
  );
}
