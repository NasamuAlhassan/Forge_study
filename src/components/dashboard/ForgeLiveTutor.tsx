import { useState, useEffect, useRef, useCallback } from "react";
import { X, Pause, Play, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { streamLiveLesson } from "@/lib/forge-ai";

// ── Types ──────────────────────────────────────────────────────────────────────

type BoardLine =
  | { type: "title";   content: string; id: number }
  | { type: "text";    content: string; id: number }
  | { type: "math";    content: string; id: number }
  | { type: "diagram"; content: string; id: number }
  | { type: "space";   id: number };

type ConvMsg   = { role: "user" | "assistant"; content: string };
type Turn      = { role: "forge" | "user"; text: string };
type AvatarState = "idle" | "speaking" | "thinking";

interface Props {
  topic: string;
  webContent: string;
  memory?: string;
  studentName?: string;
  onClose: () => void;
}

const LT_MIN_W = 600;
const LT_MIN_H = 460;

// ── Helpers ────────────────────────────────────────────────────────────────────

function stripLatexForTTS(text: string): string {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]*?\$/g, "")
    .replace(/\\\([^)]*?\\\)/g, "")
    .replace(/\\\[[^\]]*?\\\]/g, "")
    .replace(/\[B:[^\]]*\]/g, "")
    .replace(/[\\{}^_]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Splits raw stream into [speech_text, board_command, speech_text, ...] parts.
// Board commands that are still incomplete (no closing ]) are removed from speech.
function parseRaw(raw: string): { speech: string; lines: BoardLine[] } {
  // Split on complete board commands only: [B:...] where content has no ]
  const parts = raw.split(/(\[B:[^\]]*\])/);

  let speech = "";
  const lines: BoardLine[] = [];
  let id = 0;

  for (const part of parts) {
    if (/^\[B:[^\]]*\]$/.test(part)) {
      const inner   = part.slice(3, -1);
      const pipeIdx = inner.indexOf("|");
      const type    = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
      const content = pipeIdx === -1 ? "" : inner.slice(pipeIdx + 1);

      switch (type) {
        case "clear":
          lines.length = 0;
          id = 0;
          break;
        case "title":   lines.push({ type: "title",   content, id: id++ }); break;
        case "write":   lines.push({ type: "text",    content, id: id++ }); break;
        case "math":    lines.push({ type: "math",    content, id: id++ }); break;
        case "diagram": lines.push({ type: "diagram", content, id: id++ }); break;
        case "space":   lines.push({ type: "space",            id: id++ }); break;
      }
    } else {
      speech += part;
    }
  }

  // Remove any INCOMPLETE board command still open at the end of speech
  const incIdx = speech.lastIndexOf("[B:");
  if (incIdx !== -1 && !speech.slice(incIdx).includes("]")) {
    speech = speech.slice(0, incIdx);
  }

  return { speech, lines };
}

// ── TTS queue ──────────────────────────────────────────────────────────────────

function createTTSQueue() {
  const queue: string[] = [];
  let   speaking = false;

  function pickVoice() {
    const vs = window.speechSynthesis.getVoices();
    return (
      vs.find((v) => v.lang.startsWith("en") && /google/i.test(v.name)) ||
      vs.find((v) => v.lang === "en-US" && !v.localService)             ||
      vs.find((v) => v.lang.startsWith("en"))                           ||
      null
    );
  }

  function next() {
    if (queue.length === 0) { speaking = false; return; }
    speaking = true;
    const text = queue.shift()!;
    const utt  = new SpeechSynthesisUtterance(text);
    utt.rate  = 0.9;
    utt.pitch = 1.0;
    const v = pickVoice();
    if (v) utt.voice = v;
    utt.onend  = next;
    utt.onerror = next;
    window.speechSynthesis.speak(utt);
  }

  return {
    enqueue(text: string) { if (text.trim()) { queue.push(text); if (!speaking) next(); } },
    clear()  { queue.length = 0; speaking = false; if ("speechSynthesis" in window) window.speechSynthesis.cancel(); },
  };
}

// ── Mermaid diagram ────────────────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg]   = useState("");
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

  if (!svg) return <div className="text-white/30 text-xs animate-pulse py-2">Rendering…</div>;
  return <div className="overflow-x-auto max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ── Board panel ────────────────────────────────────────────────────────────────

const mdCmps = {
  p:      ({ children }: { children?: React.ReactNode }) =>
    <p className="mb-1 leading-relaxed text-white/82 text-[13px]">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) =>
    <strong className="text-[#f0c27f] font-semibold">{children}</strong>,
  code:   ({ children }: { children?: React.ReactNode }) =>
    <code className="text-orange-300 bg-white/8 px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>,
};

function BoardPanel({ lines, isStreaming }: { lines: BoardLine[]; isStreaming: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [lines.length]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
      {lines.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 select-none">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" opacity="0.15">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12px] text-white/15 font-medium">
            {isStreaming ? "Writing on the board…" : "Board is ready"}
          </span>
        </div>
      ) : (
        lines.map((line) => {
          if (line.type === "space") return <div key={line.id} className="h-3" />;
          return (
            <div key={line.id} style={{ animation: "lt-write 0.22s ease-out both" }}>
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
                      components={mdCmps as Record<string, unknown>}
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
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={mdCmps as Record<string, unknown>}>
                    {`$$${line.content}$$`}
                  </ReactMarkdown>
                </div>
              )}
              {line.type === "diagram" && (
                <div className="my-2 overflow-x-auto"><MermaidDiagram code={line.content} /></div>
              )}
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Robot avatar ───────────────────────────────────────────────────────────────

function RobotAvatar({ state }: { state: AvatarState }) {
  const speaking = state === "speaking";
  const thinking = state === "thinking";

  return (
    <svg
      viewBox="0 0 110 185"
      width="88"
      height="148"
      style={{
        animation:  speaking ? "lt-float 2.6s ease-in-out infinite" : thinking ? "lt-think 1.1s ease-in-out infinite" : "lt-float 4s ease-in-out infinite",
        filter:     "drop-shadow(0 6px 20px rgba(99,102,241,0.32))",
        overflow:   "visible",
      }}
    >
      {/* Antenna */}
      <line x1="55" y1="7" x2="55" y2="18" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="55" cy="4" r="4.5" fill={speaking ? "#fbbf24" : "#f0c27f"}
        style={speaking ? { animation: "lt-antenna 0.55s ease-in-out infinite alternate" } : undefined} />

      {/* Head */}
      <rect x="18" y="18" width="74" height="54" rx="12" fill="#4338ca" />

      {/* Eye sockets */}
      <circle cx="39" cy="42" r="11" fill="#1e1b4b" />
      <circle cx="71" cy="42" r="11" fill="#1e1b4b" />
      {/* Iris */}
      <circle cx="39" cy="42" r="7.5" fill={thinking ? "#fbbf24" : "#818cf8"} />
      <circle cx="71" cy="42" r="7.5" fill={thinking ? "#fbbf24" : "#818cf8"} />
      {/* Glint */}
      <circle cx="41" cy="40" r="2.8" fill="white" opacity="0.9" />
      <circle cx="73" cy="40" r="2.8" fill="white" opacity="0.9" />

      {/* Mouth */}
      {speaking
        ? <ellipse cx="55" cy="59" rx="8" ry="4" fill="#312e81" stroke="#a5b4fc" strokeWidth="1.5" />
        : <path d="M40 58 Q55 66 70 58" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" fill="none" />}

      {/* Side panels */}
      <rect x="6"  y="32" width="12" height="20" rx="6" fill="#3730a3" />
      <rect x="92" y="32" width="12" height="20" rx="6" fill="#3730a3" />

      {/* Neck */}
      <rect x="47" y="72" width="16" height="10" rx="5" fill="#3730a3" />

      {/* Body */}
      <rect x="14" y="82" width="82" height="66" rx="14" fill="#3730a3" />

      {/* Chest screen */}
      <rect x="24" y="92" width="62" height="40" rx="8" fill="#0f0f1a" />

      {/* EQ bars */}
      {([
        { x: 30, h: 16, delay: "0s"    },
        { x: 38, h: 10, delay: "0.12s" },
        { x: 46, h: 22, delay: "0.06s" },
        { x: 54, h: 14, delay: "0.18s" },
        { x: 62, h: 20, delay: "0.03s" },
        { x: 70, h: 12, delay: "0.15s" },
      ] as const).map(({ x, h, delay }, i) => (
        <rect key={i} x={x} y={117 - h / 2} width="5" height={h} rx="2.5"
          fill={i % 2 === 0 ? "#6366f1" : "#818cf8"}
          style={speaking
            ? { animation: "lt-eq 0.48s ease-in-out infinite alternate", animationDelay: delay, transformOrigin: `${x + 2.5}px 117px` }
            : { opacity: 0.22 }}
        />
      ))}

      {/* Left arm — normal */}
      <rect x="1" y="88" width="13" height="48" rx="6.5" fill="#4338ca"
        style={speaking ? { animation: "lt-arm-l 1.6s ease-in-out infinite" } : undefined} />
      <circle cx="7.5" cy="140" r="7" fill="#3730a3" />

      {/* Right arm — EXTENDED outward (pointing right at the board) */}
      <g style={speaking ? { animation: "lt-arm-r 1.6s ease-in-out infinite alternate" } : undefined}
         transform-origin="96 110">
        <rect x="96" y="88" width="13" height="30" rx="6.5" fill="#4338ca" />
        {/* Forearm extended right */}
        <rect x="104" y="108" width="34" height="10" rx="5" fill="#4338ca"
          transform="rotate(-20 104 113)" />
        {/* Hand */}
        <circle cx="135" cy="100" r="7.5" fill="#3730a3" />
        {/* Pointing finger */}
        <rect x="139" y="96" width="16" height="5" rx="2.5" fill="#4338ca"
          transform="rotate(-15 139 98)" />
      </g>

      {/* Feet */}
      <rect x="26" y="148" width="24" height="10" rx="5" fill="#312e81" />
      <rect x="60" y="148" width="24" height="10" rx="5" fill="#312e81" />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ForgeLiveTutor({ topic, webContent, memory, studentName, onClose }: Props) {
  // Board state — derived from parsed raw stream
  const [boardLines, setBoardLines] = useState<BoardLine[]>([]);

  // Speech turns — chat-style display of conversation
  const [turns, setTurns]         = useState<Turn[]>([]);
  const currentForgeIdx = useRef(0); // index of the CURRENT forge turn in turns[]

  // Teaching state
  const [isStreaming,  setIsStreaming]  = useState(false);
  const [avatarState,  setAvatarState]  = useState<AvatarState>("idle");
  const [paused,       setPaused]       = useState(false);
  const pausedRef = useRef(false);

  // Conversation history for multi-turn (what goes back to the API)
  const [conversationHistory, setConversationHistory] = useState<ConvMsg[]>([]);
  const accumRef = useRef(""); // raw text for the current assistant turn (for history)

  // Streaming processing
  const rawRef         = useRef(""); // full raw accumulated text from current stream
  const rafRef         = useRef<number | null>(null);
  const abortRef       = useRef<AbortController | null>(null);

  // TTS
  const ttsRef         = useRef(createTTSQueue());
  const pendingTTSRef  = useRef("");
  const ttsPosRef      = useRef(0); // how many chars of speech text we've queued for TTS

  // Interrupt input
  const [interruptInput, setInterruptInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll refs
  const speechScrollRef = useRef<HTMLDivElement>(null);

  // Resize
  const [panelSize, setPanelSize] = useState(() => ({
    w: Math.min(Math.max(window.innerWidth * 0.90, LT_MIN_W), 1100),
    h: Math.min(Math.max(window.innerHeight * 0.88, LT_MIN_H), 820),
  }));
  const resizing    = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, pw: 0, ph: 0 });

  // Auto-scroll speech
  useEffect(() => {
    if (speechScrollRef.current) {
      speechScrollRef.current.scrollTop = speechScrollRef.current.scrollHeight;
    }
  }, [turns]);

  // ── Reparse accumulated raw stream → board + speech ─────────────────────────

  const reparse = useCallback(() => {
    const { speech, lines } = parseRaw(rawRef.current);

    setBoardLines(lines);

    // Update the current forge turn's text in the turns array
    setTurns((prev) => {
      if (prev.length === 0) return [{ role: "forge", text: speech }];
      const idx = currentForgeIdx.current;
      if (idx >= prev.length) return [...prev, { role: "forge", text: speech }];
      const updated = [...prev];
      updated[idx] = { role: "forge", text: speech };
      return updated;
    });

    // Queue new TTS sentences
    if (speech.length > ttsPosRef.current) {
      const newText = speech.slice(ttsPosRef.current);
      ttsPosRef.current = speech.length;
      pendingTTSRef.current += newText;

      let text = pendingTTSRef.current;
      let i = 0;
      while (i < text.length) {
        const c = text[i];
        if ((c === "." || c === "!" || c === "?") && i < text.length - 1 && (text[i + 1] === " " || text[i + 1] === "\n")) {
          const sentence = text.slice(0, i + 1).trim();
          if (sentence.length > 4) {
            const clean = stripLatexForTTS(sentence);
            if (clean.trim()) ttsRef.current.enqueue(clean);
          }
          text = text.slice(i + 2);
          i = 0;
          continue;
        }
        i++;
      }
      pendingTTSRef.current = text;
    }
  }, []);

  // ── Start / restart stream ────────────────────────────────────────────────────

  const startStream = useCallback(
    async (history: ConvMsg[], appendTurns: Turn[]) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      rawRef.current        = "";
      accumRef.current      = "";
      pendingTTSRef.current = "";
      ttsPosRef.current     = 0;
      ttsRef.current.clear();
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

      // Add a new blank forge turn
      const newTurns = [...appendTurns, { role: "forge" as const, text: "" }];
      currentForgeIdx.current = newTurns.length - 1;
      setTurns(newTurns);

      setIsStreaming(true);
      setAvatarState("speaking");

      const processChunk = (chunk: string) => {
        rawRef.current   += chunk;
        accumRef.current += chunk;

        // Schedule a reparse via RAF (deduped)
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          reparse();
        });
      };

      try {
        await streamLiveLesson(
          { topic, studentName, conversationHistory: history, webContent, memory },
          processChunk,
          abortRef.current.signal,
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setTurns((prev) => {
            const updated = [...prev];
            const idx = currentForgeIdx.current;
            if (idx < updated.length) updated[idx] = { ...updated[idx], text: updated[idx].text + "\n\n[Stream ended — ask a question to continue]" };
            return updated;
          });
        }
      } finally {
        // Final reparse
        reparse();
        // Flush trailing TTS
        if (pendingTTSRef.current.trim()) {
          const clean = stripLatexForTTS(pendingTTSRef.current.trim());
          if (clean) ttsRef.current.enqueue(clean);
          pendingTTSRef.current = "";
        }
        setIsStreaming(false);
        setAvatarState("idle");

        // Save completed assistant turn to history
        const fullText = parseRaw(rawRef.current).speech.trim();
        if (fullText) {
          setConversationHistory((prev) => [...prev, { role: "assistant", content: fullText }]);
        }
        accumRef.current = "";
      }
    },
    [topic, studentName, webContent, memory, reparse],
  );

  // Auto-start
  useEffect(() => {
    startStream([], []);
    return () => { abortRef.current?.abort(); ttsRef.current.clear(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Interrupt ────────────────────────────────────────────────────────────────

  const sendInterrupt = useCallback(() => {
    const q = interruptInput.trim();
    if (!q) return;
    setInterruptInput("");

    abortRef.current?.abort();
    ttsRef.current.clear();

    // Build history: current conv + partial assistant turn + user question
    const partialForge = parseRaw(rawRef.current).speech.trim();
    const newHistory: ConvMsg[] = [
      ...conversationHistory,
      ...(partialForge ? [{ role: "assistant" as const, content: partialForge }] : []),
      { role: "user" as const, content: q },
    ];
    setConversationHistory(newHistory);

    // Add user turn to display
    const baseTurns: Turn[] = [
      ...turns.slice(0, currentForgeIdx.current),
      { role: "forge", text: partialForge },
      { role: "user",  text: q },
    ];

    setAvatarState("thinking");
    setTimeout(() => startStream(newHistory, baseTurns), 380);
  }, [interruptInput, conversationHistory, turns, startStream]);

  // ── Pause / resume ────────────────────────────────────────────────────────────

  const togglePause = useCallback(() => {
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      const partialForge = parseRaw(rawRef.current).speech.trim();
      const resumeHistory: ConvMsg[] = [
        ...conversationHistory,
        ...(partialForge ? [{ role: "assistant" as const, content: partialForge }] : []),
        { role: "user" as const, content: "Please continue the lesson." },
      ];
      const baseTurns: Turn[] = [
        ...turns.slice(0, currentForgeIdx.current),
        { role: "forge", text: partialForge },
      ];
      startStream(resumeHistory, baseTurns);
    } else {
      pausedRef.current = true;
      setPaused(true);
      abortRef.current?.abort();
      ttsRef.current.clear();
      setIsStreaming(false);
      setAvatarState("idle");
    }
  }, [conversationHistory, turns, startStream]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.code === "Escape" && tag !== "INPUT") { abortRef.current?.abort(); ttsRef.current.clear(); onClose(); }
      if (e.code === "Space"  && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); togglePause(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, togglePause]);

  // ── Resize ────────────────────────────────────────────────────────────────────

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current   = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, pw: panelSize.w, ph: panelSize.h };
    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      setPanelSize({
        w: Math.max(LT_MIN_W, Math.min(window.innerWidth  - 20, resizeStart.current.pw + ev.clientX - resizeStart.current.mx)),
        h: Math.max(LT_MIN_H, Math.min(window.innerHeight - 20, resizeStart.current.ph + ev.clientY - resizeStart.current.my)),
      });
    };
    const onUp = () => { resizing.current = false; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  // Current forge turn text (for speech bubble near robot)
  const currentForgeText = turns[currentForgeIdx.current]?.text ?? "";
  const recentSpeech = currentForgeText.slice(-420).trimStart();

  return (
    <>
      <style>{`
        @keyframes lt-float   { 0%,100%{transform:translateY(0)}       50%{transform:translateY(-5px)} }
        @keyframes lt-think   { 0%,100%{transform:rotate(-3deg)}        50%{transform:rotate(3deg)} }
        @keyframes lt-antenna { from{r:4} to{r:6.5} }
        @keyframes lt-eq      { from{transform:scaleY(0.45)}            to{transform:scaleY(1.4)} }
        @keyframes lt-arm-l   { 0%,100%{transform:rotate(0deg)}         50%{transform:rotate(-10deg) translateY(-2px)} }
        @keyframes lt-arm-r   { 0%,100%{transform:rotate(0deg)}         50%{transform:rotate(8deg) translateY(-2px)} }
        @keyframes lt-write   { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        @keyframes lt-blink   { 0%,90%,100%{opacity:1} 95%{opacity:0} }
        @keyframes lt-cursor  { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      {/* Backdrop */}
      <div className="fixed inset-0 z-[190]" style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }} />

      {/* Panel */}
      <div
        className="fixed z-[200] flex flex-col rounded-2xl overflow-hidden"
        style={{
          width:     panelSize.w,
          height:    panelSize.h,
          top:       "50%",
          left:      "50%",
          transform: "translate(-50%,-50%)",
          background: "rgba(7,7,13,0.99)",
          border:     "1px solid rgba(255,255,255,0.07)",
          boxShadow:  "0 40px 130px rgba(0,0,0,0.82), 0 0 0 0.5px rgba(255,255,255,0.03) inset",
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-white/22 font-medium">Live Lesson</div>
            <div className="text-[13px] font-semibold text-white/88 truncate leading-tight">{topic}</div>
          </div>
          {isStreaming && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" style={{ animation: "lt-blink 1.4s ease-in-out infinite" }} />
              <span className="text-[10px] text-white/30">Live</span>
            </div>
          )}
          <button onClick={togglePause} className="h-7 w-7 rounded-lg grid place-items-center hover:bg-white/10 transition-all" title={paused ? "Resume (Space)" : "Pause (Space)"}>
            {paused ? <Play className="h-3.5 w-3.5 text-white/55" /> : <Pause className="h-3.5 w-3.5 text-white/55" />}
          </button>
          <button onClick={() => { abortRef.current?.abort(); ttsRef.current.clear(); onClose(); }} className="h-7 w-7 rounded-lg grid place-items-center hover:bg-white/10 transition-all" title="Close (Esc)">
            <X className="h-3.5 w-3.5 text-white/55" />
          </button>
        </div>

        {/* ── Body: ROBOT LEFT | BOARD RIGHT ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── LEFT: Robot + speech ── */}
          <div
            className="flex flex-col items-center justify-between py-4 px-2 shrink-0"
            style={{
              width: "30%",
              minWidth: 180,
              borderRight: "1px solid rgba(255,255,255,0.055)",
              background:  "rgba(3,3,9,0.75)",
            }}
          >
            {/* Speech scroll (previous turns) */}
            <div ref={speechScrollRef} className="flex-1 w-full overflow-y-auto space-y-2 px-1 pb-2">
              {turns.map((turn, i) => {
                const isCurrentForge = turn.role === "forge" && i === currentForgeIdx.current;
                const isLast = i === turns.length - 1;

                if (turn.role === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div
                        className="max-w-[90%] px-2.5 py-1.5 rounded-2xl rounded-br-sm text-[11px] leading-relaxed"
                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.18)" }}
                      >
                        {turn.text}
                      </div>
                    </div>
                  );
                }

                // Forge turn — show only last 360 chars for current, full for past
                const displayText = isCurrentForge
                  ? (isStreaming ? recentSpeech : turn.text.slice(-360).trimStart())
                  : turn.text.slice(-120).trimStart();

                return (
                  <div key={i} className="text-[11.5px] leading-relaxed text-white/65 w-full">
                    {displayText}
                    {isCurrentForge && isStreaming && isLast && (
                      <span className="inline-block w-0.5 h-3 bg-[#6366f1] ml-0.5 align-middle rounded-sm" style={{ animation: "lt-cursor 0.85s step-end infinite" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Robot avatar */}
            <div className="shrink-0 flex flex-col items-center gap-1 pt-2">
              <RobotAvatar state={avatarState} />
              <div
                className="text-[9.5px] font-medium px-2 py-0.5 rounded-full mt-0.5"
                style={{
                  background: avatarState === "speaking" ? "rgba(99,102,241,0.14)" : "rgba(255,255,255,0.04)",
                  color:      avatarState === "speaking" ? "#818cf8" : avatarState === "thinking" ? "#fbbf24" : "rgba(255,255,255,0.25)",
                  border:     `1px solid ${avatarState === "speaking" ? "rgba(99,102,241,0.20)" : "rgba(255,255,255,0.07)"}`,
                }}
              >
                {avatarState === "idle" ? "Ready" : avatarState === "speaking" ? "Teaching…" : "Thinking…"}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Board ── */}
          <div className="flex flex-col flex-1 min-w-0">
            <div
              className="flex items-center gap-2 px-4 py-1.5 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.045)", background: "rgba(255,255,255,0.01)" }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#6366f1", opacity: 0.65 }} />
              <span className="text-[10px] text-white/22 tracking-widest uppercase">Board</span>
            </div>
            <BoardPanel lines={boardLines} isStreaming={isStreaming} />
          </div>
        </div>

        {/* ── Interrupt input ── */}
        <div
          className="px-4 py-2.5 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}
        >
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={interruptInput}
              onChange={(e) => setInterruptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && interruptInput.trim()) { e.preventDefault(); sendInterrupt(); } }}
              placeholder="Ask a question to interrupt the lesson…"
              className="flex-1 text-[12px] text-white/82 placeholder:text-white/22 outline-none rounded-xl px-3 py-2 transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
              onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.22)")}
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
          <p className="text-[9px] text-white/15 text-center mt-1 select-none">Enter to interrupt · Space to pause · Esc to close</p>
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={onResizeDown}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-18 hover:opacity-50 transition-opacity"
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
