import { useState, useEffect, useRef, useCallback } from "react";
import { X, Pause, Play, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { streamLiveLesson } from "@/lib/forge-ai";

// ── Types ──────────────────────────────────────────────────────────────────────

type BoardLine =
  | { type: "title"; content: string; id: number }
  | { type: "text";  content: string; id: number }
  | { type: "math";  content: string; id: number }
  | { type: "diagram"; content: string; id: number }
  | { type: "space"; id: number };

type ConvMsg = { role: "user" | "assistant"; content: string };
type SpeechTurn = { role: "forge" | "user"; content: string };
type AvatarState = "idle" | "speaking" | "thinking" | "done";

interface Props {
  topic: string;
  webContent: string;
  memory?: string;
  onClose: () => void;
}

const LT_MIN_W = 580;
const LT_MIN_H = 460;

// ── TTS queue ──────────────────────────────────────────────────────────────────

function createTTSQueue() {
  const queue: string[] = [];
  let speaking = false;

  function pickVoice() {
    const vs = window.speechSynthesis.getVoices();
    return (
      vs.find((v) => v.lang.startsWith("en") && /google/i.test(v.name)) ||
      vs.find((v) => v.lang === "en-US" && !v.localService) ||
      vs.find((v) => v.lang.startsWith("en-US")) ||
      vs.find((v) => v.lang.startsWith("en")) ||
      null
    );
  }

  function next() {
    if (queue.length === 0) { speaking = false; return; }
    speaking = true;
    const text = queue.shift()!;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.93;
    utt.pitch = 1.0;
    const v = pickVoice();
    if (v) utt.voice = v;
    utt.onend = next;
    utt.onerror = next;
    window.speechSynthesis.speak(utt);
  }

  return {
    enqueue(text: string) {
      if (!text.trim()) return;
      queue.push(text);
      if (!speaking) next();
    },
    clear() {
      queue.length = 0;
      speaking = false;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
  };
}

// ── Mermaid diagram ────────────────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const uid = useRef(`lt-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let live = true;
    import("mermaid")
      .then((m) => {
        m.default.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
        return m.default.render(uid.current, code.trim());
      })
      .then(({ svg: s }) => { if (live) setSvg(s); })
      .catch(() => { if (live) setSvg(`<p style="color:#f87171;font-size:11px">Diagram error</p>`); });
    return () => { live = false; };
  }, [code]);

  if (!svg) return <div className="text-white/30 text-xs animate-pulse py-2">Rendering diagram…</div>;
  return <div className="overflow-x-auto max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ── Robot avatar ───────────────────────────────────────────────────────────────

function RobotAvatar({ state }: { state: AvatarState }) {
  const speaking = state === "speaking";
  const thinking = state === "thinking";

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <svg
        viewBox="0 0 100 145"
        width="88"
        height="127"
        style={{
          animation: speaking
            ? "lt-float 2.8s ease-in-out infinite"
            : thinking
            ? "lt-think 1s ease-in-out infinite"
            : "lt-float 4s ease-in-out infinite",
          filter: "drop-shadow(0 4px 18px rgba(99,102,241,0.30))",
        }}
      >
        {/* Antenna */}
        <line x1="50" y1="8" x2="50" y2="18" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
        <circle
          cx="50" cy="5" r="4.5"
          fill={speaking ? "#fbbf24" : "#f0c27f"}
          style={speaking ? { animation: "lt-antenna 0.55s ease-in-out infinite alternate" } : undefined}
        />

        {/* Head */}
        <rect x="18" y="18" width="64" height="52" rx="11" fill="#4338ca" />

        {/* Eye sockets */}
        <circle cx="37" cy="40" r="10" fill="#1e1b4b" />
        <circle cx="63" cy="40" r="10" fill="#1e1b4b" />
        {/* Iris */}
        <circle cx="37" cy="40" r="7" fill={thinking ? "#fbbf24" : "#818cf8"} />
        <circle cx="63" cy="40" r="7" fill={thinking ? "#fbbf24" : "#818cf8"} />
        {/* Glint */}
        <circle cx="38.5" cy="38.5" r="2.5" fill="white" opacity="0.9" />
        <circle cx="64.5" cy="38.5" r="2.5" fill="white" opacity="0.9" />

        {/* Mouth */}
        {speaking ? (
          <ellipse cx="50" cy="57" rx="7" ry="3.5" fill="#312e81" stroke="#a5b4fc" strokeWidth="1.5" />
        ) : (
          <path d="M37 56 Q50 63 63 56" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" fill="none" />
        )}

        {/* Side ears */}
        <rect x="7" y="30" width="11" height="18" rx="5.5" fill="#3730a3" />
        <rect x="82" y="30" width="11" height="18" rx="5.5" fill="#3730a3" />

        {/* Neck */}
        <rect x="44" y="70" width="12" height="10" rx="4" fill="#3730a3" />

        {/* Body */}
        <rect x="14" y="80" width="72" height="58" rx="13" fill="#3730a3" />

        {/* Chest screen */}
        <rect x="22" y="88" width="56" height="36" rx="7" fill="#0f0f1a" />

        {/* EQ bars — animate only when speaking */}
        {([
          { x: 28, baseH: 16, delay: "0s" },
          { x: 35, baseH: 10, delay: "0.12s" },
          { x: 42, baseH: 22, delay: "0.06s" },
          { x: 49, baseH: 14, delay: "0.18s" },
          { x: 56, baseH: 20, delay: "0.03s" },
          { x: 63, baseH: 12, delay: "0.15s" },
        ] as const).map(({ x, baseH, delay }, i) => (
          <rect
            key={i}
            x={x}
            y={112 - baseH / 2}
            width="4.5"
            height={baseH}
            rx="2"
            fill={i % 2 === 0 ? "#6366f1" : "#818cf8"}
            style={
              speaking
                ? { animation: "lt-eq 0.48s ease-in-out infinite alternate", animationDelay: delay }
                : { opacity: 0.25 }
            }
          />
        ))}

        {/* Arms */}
        <rect
          x="2" y="84" width="12" height="44" rx="6" fill="#4338ca"
          style={speaking ? { animation: "lt-arm-l 1.5s ease-in-out infinite" } : undefined}
        />
        <rect
          x="86" y="84" width="12" height="44" rx="6" fill="#4338ca"
          style={speaking ? { animation: "lt-arm-r 1.5s ease-in-out infinite alternate" } : undefined}
        />

        {/* Feet */}
        <rect x="26" y="136" width="20" height="9" rx="4.5" fill="#312e81" />
        <rect x="54" y="136" width="20" height="9" rx="4.5" fill="#312e81" />
      </svg>

      <div
        className="text-[10px] font-medium px-2.5 py-0.5 rounded-full"
        style={{
          background: speaking ? "rgba(99,102,241,0.14)" : "rgba(255,255,255,0.05)",
          color: speaking ? "#818cf8" : thinking ? "#fbbf24" : "rgba(255,255,255,0.28)",
          border: `1px solid ${speaking ? "rgba(99,102,241,0.22)" : thinking ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.07)"}`,
        }}
      >
        {state === "idle" ? "Ready" : state === "speaking" ? "Teaching…" : state === "thinking" ? "Thinking…" : "Done"}
      </div>
    </div>
  );
}

// ── Board panel ────────────────────────────────────────────────────────────────

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 leading-relaxed text-white/82 text-[13px]">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-[#f0c27f] font-semibold">{children}</strong>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="text-orange-300 bg-white/8 px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>
  ),
};

function BoardPanel({ lines }: { lines: BoardLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-2">
      {lines.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 opacity-25 select-none">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12px] text-white/40">Board is ready</span>
        </div>
      ) : (
        lines.map((line) => {
          if (line.type === "space") return <div key={line.id} className="h-3" />;

          return (
            <div
              key={line.id}
              style={{ animation: "lt-write 0.26s ease-out both" }}
            >
              {line.type === "title" && (
                <div
                  className="text-[15px] font-bold pb-1.5 border-b mb-2"
                  style={{ color: "#f0c27f", borderColor: "rgba(240,194,127,0.20)" }}
                >
                  {line.content}
                </div>
              )}

              {line.type === "text" && (
                <div className="flex gap-2 items-start">
                  <span className="shrink-0 mt-[3px] text-[10px]" style={{ color: "#6366f1" }}>▸</span>
                  <div className="text-[13px] text-white/82 leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={mdComponents as Record<string, unknown>}
                    >
                      {line.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {line.type === "math" && (
                <div
                  className="px-4 py-3 rounded-xl my-1 text-center overflow-x-auto"
                  style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.14)" }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={mdComponents as Record<string, unknown>}
                  >
                    {`$$${line.content}$$`}
                  </ReactMarkdown>
                </div>
              )}

              {line.type === "diagram" && (
                <div className="my-2 overflow-x-auto">
                  <MermaidDiagram code={line.content} />
                </div>
              )}
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ForgeLiveTutor({ topic, webContent, memory, onClose }: Props) {
  // Board
  const [boardLines, setBoardLines] = useState<BoardLine[]>([]);
  const lineCounterRef = useRef(0);

  // Speech turns
  const [speechTurns, setSpeechTurns] = useState<SpeechTurn[]>([]);
  const speechScrollRef = useRef<HTMLDivElement>(null);

  // Teaching state
  const [isStreaming, setIsStreaming] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  // Conversation history for multi-turn
  const [conversationHistory, setConversationHistory] = useState<ConvMsg[]>([]);
  const accumRef = useRef(""); // current assistant turn accumulator

  // Interrupt input
  const [interruptInput, setInterruptInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Streaming refs
  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef(""); // incomplete board command buffer
  const pendingTTSRef = useRef("");
  const ttsRef = useRef(createTTSQueue());

  // Resize
  const [panelSize, setPanelSize] = useState(() => ({
    w: Math.min(Math.max(window.innerWidth * 0.90, LT_MIN_W), 1100),
    h: Math.min(Math.max(window.innerHeight * 0.88, LT_MIN_H), 820),
  }));
  const resizing = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, pw: 0, ph: 0 });

  // Auto-scroll speech
  useEffect(() => {
    if (speechScrollRef.current) {
      speechScrollRef.current.scrollTop = speechScrollRef.current.scrollHeight;
    }
  }, [speechTurns]);

  // ── Start stream ─────────────────────────────────────────────────────────────

  const startStream = useCallback(
    async (history: ConvMsg[]) => {
      const abort = new AbortController();
      abortRef.current = abort;
      bufferRef.current = "";
      pendingTTSRef.current = "";
      ttsRef.current.clear();
      accumRef.current = "";

      setIsStreaming(true);
      setAvatarState("speaking");

      const processChunk = (chunk: string) => {
        bufferRef.current += chunk;
        let buf = bufferRef.current;
        let speech = "";

        // Parse board commands from stream
        while (true) {
          const start = buf.indexOf("[B:");
          if (start === -1) { speech += buf; buf = ""; break; }
          const end = buf.indexOf("]", start);
          if (end === -1) { speech += buf.slice(0, start); buf = buf.slice(start); break; }

          speech += buf.slice(0, start);
          const cmd = buf.slice(start + 3, end);
          buf = buf.slice(end + 1);

          const pipeIdx = cmd.indexOf("|");
          const type = (pipeIdx === -1 ? cmd : cmd.slice(0, pipeIdx)).trim();
          const content = pipeIdx === -1 ? "" : cmd.slice(pipeIdx + 1);

          setBoardLines((prev) => {
            const id = ++lineCounterRef.current;
            switch (type) {
              case "clear":   return [];
              case "title":   return [...prev, { type: "title", content, id }];
              case "write":   return [...prev, { type: "text", content, id }];
              case "math":    return [...prev, { type: "math", content, id }];
              case "diagram": return [...prev, { type: "diagram", content, id }];
              case "space":   return [...prev, { type: "space", id }];
              default:        return prev;
            }
          });
        }

        bufferRef.current = buf;

        if (speech) {
          // Append to the last forge turn (or start a new one)
          setSpeechTurns((prev) => {
            if (prev.length === 0 || prev[prev.length - 1].role !== "forge") {
              return [...prev, { role: "forge", content: speech }];
            }
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...last, content: last.content + speech }];
          });

          accumRef.current += speech;

          // Sentence-by-sentence TTS
          pendingTTSRef.current += speech;
          let text = pendingTTSRef.current;
          let i = 0;
          while (i < text.length) {
            const c = text[i];
            if (
              (c === "." || c === "!" || c === "?") &&
              i < text.length - 1 &&
              (text[i + 1] === " " || text[i + 1] === "\n")
            ) {
              const sentence = text.slice(0, i + 1).trim();
              if (sentence.length > 4) ttsRef.current.enqueue(sentence);
              text = text.slice(i + 2);
              i = 0;
              continue;
            }
            i++;
          }
          pendingTTSRef.current = text;
        }
      };

      try {
        await streamLiveLesson(
          { topic, conversationHistory: history, webContent, memory },
          processChunk,
          abort.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSpeechTurns((prev) => [
            ...prev,
            { role: "forge", content: "\n[Stream ended unexpectedly — try asking a question to continue]" },
          ]);
        }
      } finally {
        // Flush trailing TTS
        if (pendingTTSRef.current.trim()) {
          ttsRef.current.enqueue(pendingTTSRef.current.trim());
          pendingTTSRef.current = "";
        }
        setIsStreaming(false);
        setAvatarState("idle");

        if (accumRef.current.trim()) {
          setConversationHistory((prev) => [
            ...prev,
            { role: "assistant", content: accumRef.current.trim() },
          ]);
          accumRef.current = "";
        }
      }
    },
    [topic, webContent, memory],
  );

  // Auto-start on mount
  useEffect(() => {
    startStream([]);
    return () => {
      abortRef.current?.abort();
      ttsRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Interrupt ────────────────────────────────────────────────────────────────

  const sendInterrupt = useCallback(() => {
    const q = interruptInput.trim();
    if (!q) return;
    setInterruptInput("");

    // Stop current stream and TTS
    abortRef.current?.abort();
    ttsRef.current.clear();

    // Build new history including whatever was being said
    const newHistory: ConvMsg[] = [
      ...conversationHistory,
      ...(accumRef.current.trim()
        ? [{ role: "assistant" as const, content: accumRef.current.trim() }]
        : []),
      { role: "user" as const, content: q },
    ];
    accumRef.current = "";
    setConversationHistory(newHistory);

    // Add user turn to display
    setSpeechTurns((prev) => [...prev, { role: "user", content: q }]);

    setAvatarState("thinking");
    setTimeout(() => startStream(newHistory), 350);
  }, [interruptInput, conversationHistory, startStream]);

  // ── Pause / resume ────────────────────────────────────────────────────────────

  const togglePause = useCallback(() => {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);

      // Resume: tell AI to continue from where it was
      const resumeHistory: ConvMsg[] = [
        ...conversationHistory,
        ...(accumRef.current.trim()
          ? [{ role: "assistant" as const, content: accumRef.current.trim() }]
          : []),
        { role: "user" as const, content: "Please continue the lesson." },
      ];
      accumRef.current = "";
      startStream(resumeHistory);
    } else {
      pausedRef.current = true;
      setPaused(true);
      abortRef.current?.abort();
      ttsRef.current.clear();
      setIsStreaming(false);
      setAvatarState("idle");
    }
  }, [conversationHistory, startStream]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape" && document.activeElement?.tagName !== "INPUT") {
        abortRef.current?.abort();
        ttsRef.current.clear();
        onClose();
      }
      if (e.code === "Space" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, togglePause]);

  // ── Resize handle ─────────────────────────────────────────────────────────────

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, pw: panelSize.w, ph: panelSize.h };
    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      setPanelSize({
        w: Math.max(LT_MIN_W, Math.min(window.innerWidth - 20, resizeStart.current.pw + ev.clientX - resizeStart.current.mx)),
        h: Math.max(LT_MIN_H, Math.min(window.innerHeight - 20, resizeStart.current.ph + ev.clientY - resizeStart.current.my)),
      });
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const narrowLayout = panelSize.w < 680;

  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes lt-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes lt-think { 0%,100%{transform:rotate(-3deg)} 50%{transform:rotate(3deg)} }
        @keyframes lt-antenna { from{r:4} to{r:6.5} }
        @keyframes lt-eq { from{transform:scaleY(0.45)} to{transform:scaleY(1.4)} }
        @keyframes lt-arm-l { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-10deg) translateY(-2px)} }
        @keyframes lt-arm-r { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(10deg) translateY(-2px)} }
        @keyframes lt-write { from{opacity:0;transform:translateX(-5px)} to{opacity:1;transform:translateX(0)} }
        @keyframes lt-blink { 0%,90%,100%{opacity:1} 95%{opacity:0} }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[190]"
        style={{ background: "rgba(0,0,0,0.70)", backdropFilter: "blur(10px)" }}
      />

      {/* Panel */}
      <div
        className="fixed z-[200] flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: panelSize.w,
          height: panelSize.h,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(8,8,14,0.99)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.80), 0 0 0 0.5px rgba(255,255,255,0.03) inset",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-white/25 font-medium">Live Lesson</div>
            <div className="text-[13px] font-semibold text-white/88 truncate leading-tight">{topic}</div>
          </div>

          {/* Live indicator */}
          {isStreaming && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#6366f1", animation: "lt-blink 1.4s ease-in-out infinite" }}
              />
              <span className="text-[10px] text-white/30">Live</span>
            </div>
          )}

          {/* Pause/resume */}
          <button
            onClick={togglePause}
            className="h-7 w-7 rounded-lg grid place-items-center hover:bg-white/10 transition-all shrink-0"
            title={paused ? "Resume (Space)" : "Pause (Space)"}
          >
            {paused
              ? <Play className="h-3.5 w-3.5 text-white/55" />
              : <Pause className="h-3.5 w-3.5 text-white/55" />}
          </button>

          {/* Close */}
          <button
            onClick={() => { abortRef.current?.abort(); ttsRef.current.clear(); onClose(); }}
            className="h-7 w-7 rounded-lg grid place-items-center hover:bg-white/10 transition-all shrink-0"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5 text-white/55" />
          </button>
        </div>

        {/* Body */}
        <div className={`flex flex-1 min-h-0 ${narrowLayout ? "flex-col" : ""}`}>

          {/* ── LEFT: Board ── */}
          <div
            className="flex flex-col"
            style={{
              width: narrowLayout ? "100%" : "58%",
              height: narrowLayout ? "55%" : "100%",
              borderRight: narrowLayout ? "none" : "1px solid rgba(255,255,255,0.055)",
              borderBottom: narrowLayout ? "1px solid rgba(255,255,255,0.055)" : "none",
              background: "rgba(3,3,8,0.80)",
            }}
          >
            {/* Board header */}
            <div
              className="flex items-center gap-2 px-4 py-1.5 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.045)", background: "rgba(255,255,255,0.01)" }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#6366f1", opacity: 0.7 }} />
              <span className="text-[10px] text-white/25 tracking-widest uppercase">Board</span>
            </div>

            <BoardPanel lines={boardLines} />
          </div>

          {/* ── RIGHT: Teacher ── */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">

            {/* Avatar area */}
            <div
              className="flex items-center justify-center py-4 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.045)" }}
            >
              <RobotAvatar state={avatarState} />
            </div>

            {/* Speech turns */}
            <div
              ref={speechScrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth"
            >
              {speechTurns.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[12px] text-white/22 animate-pulse select-none">
                  Starting lesson…
                </div>
              ) : (
                speechTurns.map((turn, i) => (
                  <div key={i} className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    {turn.role === "user" ? (
                      <div
                        className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-sm text-[12px] leading-relaxed"
                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.20)" }}
                      >
                        {turn.content}
                      </div>
                    ) : (
                      <div className="text-[12.5px] leading-relaxed text-white/72 max-w-full">
                        {turn.content}
                        {/* Cursor on last forge turn while streaming */}
                        {isStreaming && i === speechTurns.length - 1 && (
                          <span
                            className="inline-block w-0.5 h-3.5 bg-[#6366f1] ml-0.5 align-middle rounded-sm"
                            style={{ animation: "lt-blink 0.9s step-end infinite" }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Interrupt input */}
            <div
              className="px-3 py-2.5 shrink-0"
              style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}
            >
              <div className="flex gap-2 items-center">
                <input
                  ref={inputRef}
                  value={interruptInput}
                  onChange={(e) => setInterruptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && interruptInput.trim()) {
                      e.preventDefault();
                      sendInterrupt();
                    }
                  }}
                  placeholder="Ask a question to interrupt…"
                  className="flex-1 text-[12px] text-white/82 placeholder:text-white/22 outline-none rounded-xl px-3 py-2 transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.20)")}
                  onBlur={(e)  => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)")}
                />
                <button
                  onClick={sendInterrupt}
                  disabled={!interruptInput.trim()}
                  className="h-8 w-8 rounded-xl grid place-items-center disabled:opacity-25 transition-all active:scale-95"
                  style={{ background: "rgba(99,102,241,0.14)", border: "1px solid rgba(99,102,241,0.20)" }}
                >
                  <Send className="h-3.5 w-3.5" style={{ color: "#818cf8" }} />
                </button>
              </div>
              <p className="text-[9.5px] text-white/18 text-center mt-1.5 select-none">
                Enter to interrupt · Space to pause · Esc to close
              </p>
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={onResizeDown}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-20 hover:opacity-50 transition-opacity"
          style={{ touchAction: "none" }}
        >
          <svg viewBox="0 0 14 14" fill="none" className="w-full h-full">
            <path d="M2 12L12 2M7 12L12 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </>
  );
}
