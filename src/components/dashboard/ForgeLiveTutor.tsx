import { useState, useRef, useCallback, useEffect } from "react";
import { X, Pause, Play, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { streamLiveLesson } from "@/lib/forge-ai";

// ── Types ─────────────────────────────────────────────────────────────────────

type BoardLine =
  | { type: "title";   content: string; id: number }
  | { type: "text";    content: string; id: number }
  | { type: "math";    content: string; id: number }
  | { type: "diagram"; content: string; id: number }
  | { type: "space";   id: number };

type ConvMsg   = { role: "user" | "assistant"; content: string };
type Turn      = { role: "forge" | "user"; text: string };
type AvatarState = "idle" | "speaking" | "thinking" | "writing";

interface Props {
  topic: string;
  webContent: string;
  memory?: string;
  studentName?: string;
  onClose: () => void;
}

const LT_MIN_W = 600;
const LT_MIN_H = 460;

// How long (seconds) to animate writing a line — scales with content length
function getWriteDur(line: BoardLine): number {
  if (line.type === "space" || line.type === "diagram") return 0;
  return Math.max(0.55, Math.min(3.6, line.content.length * 0.030));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function parseRaw(raw: string): { speech: string; lines: BoardLine[]; numClears: number } {
  const parts = raw.split(/(\[B:[^\]]*\])/);
  let speech = "";
  const lines: BoardLine[] = [];
  let id = 0, numClears = 0;
  for (const part of parts) {
    if (/^\[B:[^\]]*\]$/.test(part)) {
      const inner = part.slice(3, -1);
      const pi = inner.indexOf("|");
      const type = (pi === -1 ? inner : inner.slice(0, pi)).trim();
      const content = pi === -1 ? "" : inner.slice(pi + 1);
      switch (type) {
        case "clear":   lines.length = 0; id = 0; numClears++; break;
        case "title":   lines.push({ type: "title",   content, id: id++ }); break;
        case "write":   lines.push({ type: "text",    content, id: id++ }); break;
        case "math":    lines.push({ type: "math",    content, id: id++ }); break;
        case "diagram": lines.push({ type: "diagram", content, id: id++ }); break;
        case "space":   lines.push({ type: "space",            id: id++ }); break;
      }
    } else { speech += part; }
  }
  const inc = speech.lastIndexOf("[B:");
  if (inc !== -1 && !speech.slice(inc).includes("]")) speech = speech.slice(0, inc);
  return { speech, lines, numClears };
}

// ── TTS ───────────────────────────────────────────────────────────────────────

function createTTSQueue(rateRef: React.MutableRefObject<number>) {
  const queue: string[] = [];
  let speaking = false;
  function pick() {
    const vs = window.speechSynthesis.getVoices();
    return vs.find((v) => v.lang.startsWith("en") && /google/i.test(v.name))
      || vs.find((v) => v.lang === "en-US" && !v.localService)
      || vs.find((v) => v.lang.startsWith("en")) || null;
  }
  function next() {
    if (!queue.length) { speaking = false; return; }
    speaking = true;
    const utt = new SpeechSynthesisUtterance(queue.shift()!);
    utt.rate = rateRef.current; utt.pitch = 1.0;
    const v = pick(); if (v) utt.voice = v;
    utt.onend = utt.onerror = next;
    window.speechSynthesis.speak(utt);
  }
  return {
    enqueue(t: string) { if (t.trim()) { queue.push(t); if (!speaking) next(); } },
    clear()  { queue.length = 0; speaking = false; window.speechSynthesis?.cancel(); },
  };
}

// ── Mermaid ───────────────────────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const uid = useRef(`lt-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    let live = true;
    import("mermaid")
      .then((m) => { m.default.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" }); return m.default.render(uid.current, code.trim()); })
      .then(({ svg: s }) => { if (live) setSvg(s); })
      .catch(() => { if (live) setSvg(`<p style="color:#f87171;font-size:11px">Diagram error</p>`); });
    return () => { live = false; };
  }, [code]);
  if (!svg) return <div className="text-white/30 text-xs animate-pulse py-2">Rendering…</div>;
  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ── Marker cursor — glowing dot that sweeps left→right during writing ─────────

function MarkerCursor({ dur }: { dur: number }) {
  return (
    <span
      className="pointer-events-none absolute top-0 bottom-0 flex items-center"
      style={{ left: 0, animation: `lt-cur-move ${dur}s ease-out forwards`, zIndex: 5 }}
    >
      <span className="block rounded-full" style={{ width: 8, height: 8, background: "#ef4444", boxShadow: "0 0 10px 4px rgba(239,68,68,0.6)" }} />
    </span>
  );
}

// ── Board panel ───────────────────────────────────────────────────────────────

const mdCmps = {
  p:      ({ children }: { children?: React.ReactNode }) => <p className="mb-1 leading-relaxed text-white/82 text-[13px]">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="text-[#f0c27f] font-semibold">{children}</strong>,
  code:   ({ children }: { children?: React.ReactNode }) => <code className="text-orange-300 bg-white/8 px-1 py-0.5 rounded text-[12px] font-mono">{children}</code>,
};

function BoardPanel({
  lines, writingId, writingDur, onWriteDone, isStreaming,
}: {
  lines: BoardLine[]; writingId: number | null; writingDur: number;
  onWriteDone: () => void; isStreaming: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [lines.length]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
      {lines.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center gap-3 select-none">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.2" opacity="0.15">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] text-white/15">{isStreaming ? "Writing on the board…" : "Board is ready"}</span>
        </div>
      )}

      {lines.map((line) => {
        const isWriting = line.id === writingId;
        // The clip-path sweep is what makes it look like writing (smooth left→right reveal)
        const sweepStyle = isWriting
          ? { animation: `lt-write-sweep ${writingDur}s ease-out forwards` }
          : undefined;

        if (line.type === "space")   return <div key={line.id} className="h-3" />;
        if (line.type === "diagram") return (
          <div key={line.id} className="my-2" style={{ animation: "lt-fadein 0.4s ease both" }}>
            <MermaidDiagram code={line.content} />
          </div>
        );

        if (line.type === "title") return (
          <div key={line.id} className="relative overflow-hidden"
            style={{ animation: isWriting ? undefined : "lt-fadein 0.2s ease both" }}>
            <div
              className="text-[15px] font-bold pb-1.5 border-b mb-1 relative"
              style={{ color: "#f0c27f", borderColor: "rgba(240,194,127,0.20)", ...sweepStyle }}
              onAnimationEnd={isWriting ? onWriteDone : undefined}
            >
              {line.content}
              {isWriting && <MarkerCursor dur={writingDur} />}
            </div>
          </div>
        );

        if (line.type === "text") return (
          <div key={line.id} className="flex gap-2 items-start"
            style={{ animation: isWriting ? undefined : "lt-fadein 0.2s ease both" }}>
            <span className="shrink-0 mt-[4px] text-[9px]" style={{ color: "#6366f1" }}>▸</span>
            <div
              className="text-[13px] text-white/82 leading-relaxed relative overflow-hidden flex-1"
              style={sweepStyle}
              onAnimationEnd={isWriting ? onWriteDone : undefined}
            >
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={mdCmps as Record<string, unknown>}>
                {line.content}
              </ReactMarkdown>
              {isWriting && <MarkerCursor dur={writingDur} />}
            </div>
          </div>
        );

        if (line.type === "math") return (
          <div key={line.id}
            className="px-4 py-3 rounded-xl my-1 text-center relative overflow-hidden"
            style={{
              background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.14)",
              ...(isWriting ? sweepStyle : { animation: "lt-fadein 0.2s ease both" }),
            }}
            onAnimationEnd={isWriting ? onWriteDone : undefined}
          >
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={mdCmps as Record<string, unknown>}>
              {`$$${line.content}$$`}
            </ReactMarkdown>
            {isWriting && <MarkerCursor dur={writingDur} />}
          </div>
        );

        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Robot SVG — holds a marker, writing arm animation ────────────────────────

function RobotAvatar({ state }: { state: AvatarState }) {
  const writing  = state === "writing";
  const speaking = state === "speaking";
  const thinking = state === "thinking";
  return (
    <svg viewBox="0 0 170 185" width="112" height="148"
      style={{
        overflow: "visible",
        filter: "drop-shadow(0 6px 22px rgba(99,102,241,0.30))",
        animation: writing  ? "lt-body-write 0.75s ease-in-out infinite"
                 : speaking ? "lt-float 2.6s ease-in-out infinite"
                 : thinking ? "lt-think 1.1s ease-in-out infinite"
                 : "lt-float 4s ease-in-out infinite",
      }}
    >
      {/* Antenna */}
      <line x1="55" y1="7" x2="55" y2="18" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="55" cy="4" r="4.5"
        fill={writing ? "#ef4444" : speaking ? "#fbbf24" : "#f0c27f"}
        style={(writing || speaking) ? { animation: "lt-antenna 0.55s ease-in-out infinite alternate" } : undefined} />

      {/* Head */}
      <rect x="18" y="18" width="74" height="54" rx="12" fill="#4338ca" />
      <circle cx="39" cy="42" r="11" fill="#1e1b4b" />
      <circle cx="71" cy="42" r="11" fill="#1e1b4b" />
      <circle cx="39" cy="42" r="7.5" fill={thinking ? "#fbbf24" : writing ? "#ef4444" : "#818cf8"} />
      <circle cx="71" cy="42" r="7.5" fill={thinking ? "#fbbf24" : writing ? "#ef4444" : "#818cf8"} />
      <circle cx="41" cy="40" r="2.8" fill="white" opacity="0.9" />
      <circle cx="73" cy="40" r="2.8" fill="white" opacity="0.9" />
      {(speaking || writing)
        ? <ellipse cx="55" cy="59" rx="8" ry="4" fill="#312e81" stroke="#a5b4fc" strokeWidth="1.5" />
        : <path d="M40 58 Q55 66 70 58" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" fill="none" />}
      <rect x="6"  y="32" width="12" height="20" rx="6" fill="#3730a3" />
      <rect x="92" y="32" width="12" height="20" rx="6" fill="#3730a3" />

      {/* Neck */}
      <rect x="47" y="72" width="16" height="10" rx="5" fill="#3730a3" />

      {/* Body */}
      <rect x="14" y="82" width="82" height="66" rx="14" fill="#3730a3" />
      <rect x="24" y="92" width="62" height="40" rx="8" fill="#0f0f1a" />

      {/* EQ bars */}
      {([
        { x: 30, h: 16, d: "0s"    }, { x: 38, h: 10, d: "0.12s" },
        { x: 46, h: 22, d: "0.06s" }, { x: 54, h: 14, d: "0.18s" },
        { x: 62, h: 20, d: "0.03s" }, { x: 70, h: 12, d: "0.15s" },
      ] as const).map(({ x, h, d }, i) => (
        <rect key={i} x={x} y={117 - h / 2} width="5" height={h} rx="2.5"
          fill={i % 2 === 0 ? "#6366f1" : "#818cf8"}
          style={(speaking || writing)
            ? { animation: "lt-eq 0.48s ease-in-out infinite alternate", animationDelay: d, transformOrigin: `${x + 2.5}px 117px` }
            : { opacity: 0.22 }} />
      ))}

      {/* Left arm (idle) */}
      <rect x="1" y="88" width="13" height="48" rx="6.5" fill="#4338ca"
        style={speaking ? { animation: "lt-arm-l 1.6s ease-in-out infinite" } : undefined} />
      <circle cx="7.5" cy="140" r="7" fill="#3730a3" />

      {/* Right arm + marker — animates as writing strokes when writing */}
      <g style={{ transformOrigin: "97px 95px", animation: writing ? "lt-write-stroke 0.7s ease-in-out infinite" : undefined }}>
        {/* Upper arm */}
        <rect x="96" y="84" width="13" height="32" rx="6.5" fill="#4338ca" />
        {/* Forearm extended toward board */}
        <rect x="102" y="110" width="38" height="11" rx="5.5" fill="#4338ca" transform="rotate(-22 102 115)" />
        {/* Hand */}
        <ellipse cx="132" cy="95" rx="8.5" ry="7.5" fill="#3730a3" />

        {/* Marker barrel */}
        <rect x="136" y="87" width="30" height="9" rx="4.5" fill="#111827" transform="rotate(-18 151 91)" />
        {/* Cap */}
        <rect x="136" y="88" width="10" height="7" rx="4" fill="#374151" transform="rotate(-18 141 91)" />
        {/* Colour stripe */}
        <rect x="148" y="88.5" width="14" height="6" rx="1.5" fill="#4f46e5" opacity="0.85" transform="rotate(-18 155 91)" />
        {/* Tip */}
        <path d="M162 84 L169 88 L162 92 Z" fill="#ef4444" transform="rotate(-18 165 88)" />
        {/* Tip glow when writing */}
        {writing && <circle cx="168" cy="87" r="4.5" fill="#ef4444" opacity="0.35" style={{ animation: "lt-tipglow 0.38s ease-in-out infinite alternate" }} />}
      </g>

      {/* Feet */}
      <rect x="26" y="148" width="24" height="10" rx="5" fill="#312e81" />
      <rect x="60" y="148" width="24" height="10" rx="5" fill="#312e81" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ForgeLiveTutor({ topic, webContent, memory, studentName, onClose }: Props) {
  // Board — lines appear one at a time with a writing reveal
  const [boardLines,  setBoardLines]  = useState<BoardLine[]>([]);
  const [writingId,   setWritingId]   = useState<number | null>(null);
  const [writingDur,  setWritingDur]  = useState(1.5);

  // Writing queue
  const writeQueueRef    = useRef<BoardLine[]>([]);
  const writingActiveRef = useRef(false);
  const streamDoneRef    = useRef(false);

  // Board parse tracking
  const enqueuedCountRef    = useRef(0);
  const numClearsHandledRef = useRef(0);

  // Conversation
  const [turns,               setTurns]               = useState<Turn[]>([]);
  const [conversationHistory, setConversationHistory]  = useState<ConvMsg[]>([]);
  const currentForgeIdx = useRef(0);

  // Streaming
  const [isStreaming, setIsStreaming] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const rawRef   = useRef("");
  const accumRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const rafRef   = useRef<number | null>(null);

  // TTS
  const [ttsRate,      setTtsRate]     = useState(0.9);
  const ttsRateRef    = useRef(0.9);
  const ttsRef        = useRef(createTTSQueue(ttsRateRef));
  const pendingTTSRef = useRef("");
  const ttsPosRef     = useRef(0);
  useEffect(() => { ttsRateRef.current = ttsRate; }, [ttsRate]);

  // UI
  const [paused,         setPaused]        = useState(false);
  const [interruptInput, setInterruptInput] = useState("");
  const pausedRef       = useRef(false);
  const speechScrollRef = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLInputElement>(null);

  const [panelSize, setPanelSize] = useState(() => ({
    w: Math.min(Math.max(window.innerWidth * 0.90, LT_MIN_W), 1100),
    h: Math.min(Math.max(window.innerHeight * 0.88, LT_MIN_H), 820),
  }));
  const resizing    = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, pw: 0, ph: 0 });

  useEffect(() => {
    if (speechScrollRef.current)
      speechScrollRef.current.scrollTop = speechScrollRef.current.scrollHeight;
  }, [turns]);

  // ── Writing engine — dequeues lines one at a time and shows the board ──────

  // Kick off writing the next line in the queue (called after each line finishes)
  const startNextWrite = useCallback(() => {
    if (writingActiveRef.current) return;
    if (writeQueueRef.current.length === 0) {
      if (streamDoneRef.current) setAvatarState("idle");
      return;
    }
    const next = writeQueueRef.current.shift()!;
    // Spaces and diagrams appear instantly (no sweep animation)
    if (next.type === "space" || next.type === "diagram") {
      setBoardLines((prev) => [...prev, next]);
      setTimeout(startNextWrite, 30);
      return;
    }
    const dur = getWriteDur(next);
    setBoardLines((prev) => [...prev, next]);
    setWritingId(next.id);
    setWritingDur(dur);
    setAvatarState("writing");
    writingActiveRef.current = true;
  }, []);

  // Called by onAnimationEnd on each board line's sweep div
  const onWriteDone = useCallback(() => {
    writingActiveRef.current = false;
    setWritingId(null);
    // Small gap between lines (feels more natural)
    setTimeout(startNextWrite, 60);
  }, [startNextWrite]);

  // ── Reparse full raw stream → board lines + speech ────────────────────────

  const reparse = useCallback(() => {
    const { speech, lines, numClears } = parseRaw(rawRef.current);

    // Handle board clear command
    if (numClears > numClearsHandledRef.current) {
      numClearsHandledRef.current = numClears;
      enqueuedCountRef.current    = 0;
      writeQueueRef.current       = [];
      writingActiveRef.current    = false;
      setBoardLines([]);
      setWritingId(null);
    }

    // Enqueue newly parsed lines for writing
    const newLines = lines.slice(enqueuedCountRef.current);
    if (newLines.length > 0) {
      enqueuedCountRef.current = lines.length;
      writeQueueRef.current.push(...newLines);
      startNextWrite();
    }

    // Update speech turn text
    setTurns((prev) => {
      if (prev.length === 0) return [{ role: "forge", text: speech }];
      const idx = currentForgeIdx.current;
      if (idx >= prev.length) return [...prev, { role: "forge", text: speech }];
      const updated = [...prev];
      updated[idx]  = { role: "forge", text: speech };
      return updated;
    });

    // TTS sentence queue
    if (speech.length > ttsPosRef.current) {
      pendingTTSRef.current += speech.slice(ttsPosRef.current);
      ttsPosRef.current      = speech.length;
      let text = pendingTTSRef.current, i = 0;
      while (i < text.length) {
        const c = text[i];
        if ((c === "." || c === "!" || c === "?") && i < text.length - 1 && (text[i + 1] === " " || text[i + 1] === "\n")) {
          const s = stripLatexForTTS(text.slice(0, i + 1).trim());
          if (s.length > 4) ttsRef.current.enqueue(s);
          text = text.slice(i + 2); i = 0; continue;
        }
        i++;
      }
      pendingTTSRef.current = text;
    }
  }, [startNextWrite]);

  // ── Start/restart stream ──────────────────────────────────────────────────

  const startStream = useCallback(async (history: ConvMsg[], appendTurns: Turn[]) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    rawRef.current   = ""; accumRef.current = "";
    pendingTTSRef.current = ""; ttsPosRef.current = 0;
    streamDoneRef.current = false;

    // Reset board for fresh stream
    enqueuedCountRef.current    = 0;
    numClearsHandledRef.current = 0;
    writeQueueRef.current       = [];
    writingActiveRef.current    = false;
    setBoardLines([]); setWritingId(null);

    ttsRef.current.clear();
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    const newTurns = [...appendTurns, { role: "forge" as const, text: "" }];
    currentForgeIdx.current = newTurns.length - 1;
    setTurns(newTurns); setIsStreaming(true); setAvatarState("speaking");

    try {
      await streamLiveLesson(
        { topic, studentName, conversationHistory: history, webContent, memory },
        (chunk) => {
          rawRef.current += chunk; accumRef.current += chunk;
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => { rafRef.current = null; reparse(); });
        },
        abortRef.current.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setTurns((prev) => { const u = [...prev]; const i = currentForgeIdx.current; if (i < u.length) u[i] = { ...u[i], text: u[i].text + "\n\n[Stream ended]" }; return u; });
      }
    } finally {
      reparse();
      if (pendingTTSRef.current.trim()) { const c = stripLatexForTTS(pendingTTSRef.current.trim()); if (c) ttsRef.current.enqueue(c); pendingTTSRef.current = ""; }
      streamDoneRef.current = true;
      setIsStreaming(false);
      if (!writingActiveRef.current && writeQueueRef.current.length === 0) setAvatarState("idle");
      const fullText = parseRaw(rawRef.current).speech.trim();
      if (fullText) setConversationHistory((prev) => [...prev, { role: "assistant", content: fullText }]);
      accumRef.current = "";
    }
  }, [topic, studentName, webContent, memory, reparse]);

  useEffect(() => {
    startStream([], []);
    return () => { abortRef.current?.abort(); ttsRef.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Interrupt ─────────────────────────────────────────────────────────────

  const sendInterrupt = useCallback(() => {
    const q = interruptInput.trim(); if (!q) return;
    setInterruptInput("");
    abortRef.current?.abort(); ttsRef.current.clear();
    const pf = parseRaw(rawRef.current).speech.trim();
    const nh: ConvMsg[] = [...conversationHistory, ...(pf ? [{ role: "assistant" as const, content: pf }] : []), { role: "user" as const, content: q }];
    setConversationHistory(nh);
    const bt: Turn[] = [...turns.slice(0, currentForgeIdx.current), { role: "forge", text: pf }, { role: "user", text: q }];
    setAvatarState("thinking");
    setTimeout(() => startStream(nh, bt), 380);
  }, [interruptInput, conversationHistory, turns, startStream]);

  // ── Pause ─────────────────────────────────────────────────────────────────

  const togglePause = useCallback(() => {
    if (pausedRef.current) {
      pausedRef.current = false; setPaused(false);
      const pf = parseRaw(rawRef.current).speech.trim();
      const rh: ConvMsg[] = [...conversationHistory, ...(pf ? [{ role: "assistant" as const, content: pf }] : []), { role: "user" as const, content: "Please continue the lesson." }];
      const bt: Turn[] = [...turns.slice(0, currentForgeIdx.current), { role: "forge", text: pf }];
      startStream(rh, bt);
    } else {
      pausedRef.current = true; setPaused(true);
      abortRef.current?.abort(); ttsRef.current.clear();
      setIsStreaming(false); setAvatarState("idle");
    }
  }, [conversationHistory, turns, startStream]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.code === "Escape" && tag !== "INPUT") { abortRef.current?.abort(); ttsRef.current.clear(); onClose(); }
      if (e.code === "Space"  && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); togglePause(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, togglePause]);

  // ── Resize ────────────────────────────────────────────────────────────────

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault(); resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, pw: panelSize.w, ph: panelSize.h };
    const mv = (ev: PointerEvent) => {
      if (!resizing.current) return;
      setPanelSize({ w: Math.max(LT_MIN_W, Math.min(window.innerWidth - 20, resizeStart.current.pw + ev.clientX - resizeStart.current.mx)), h: Math.max(LT_MIN_H, Math.min(window.innerHeight - 20, resizeStart.current.ph + ev.clientY - resizeStart.current.my)) });
    };
    const up = () => { resizing.current = false; window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const recentSpeech = (turns[currentForgeIdx.current]?.text ?? "").slice(-420).trimStart();

  return (
    <>
      <style>{`
        @keyframes lt-float       { 0%,100%{transform:translateY(0)}        50%{transform:translateY(-5px)} }
        @keyframes lt-think       { 0%,100%{transform:rotate(-3deg)}         50%{transform:rotate(3deg)} }
        @keyframes lt-body-write  { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-2px) rotate(0.7deg)} }
        @keyframes lt-antenna     { from{r:4} to{r:6.5} }
        @keyframes lt-eq          { from{transform:scaleY(0.45)} to{transform:scaleY(1.4)} }
        @keyframes lt-arm-l       { 0%,100%{transform:rotate(0)} 50%{transform:rotate(-10deg) translateY(-2px)} }
        @keyframes lt-write-stroke {
          0%   { transform: translateX(0px) rotate(0deg); }
          20%  { transform: translateX(6px) rotate(-4deg); }
          45%  { transform: translateX(-4px) rotate(2deg); }
          70%  { transform: translateX(8px) rotate(-3deg); }
          100% { transform: translateX(0px) rotate(0deg); }
        }
        @keyframes lt-tipglow     { from{opacity:0.25} to{opacity:0.75} }
        @keyframes lt-write-sweep { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0% 0 0)} }
        @keyframes lt-cur-move    { from{left:0%} to{left:calc(100% - 8px)} }
        @keyframes lt-fadein      { from{opacity:0;transform:translateY(2px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lt-blink       { 0%,90%,100%{opacity:1} 95%{opacity:0} }
        @keyframes lt-cursor      { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      <div className="fixed inset-0 z-[190]" style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }} />

      <div className="fixed z-[200] flex flex-col rounded-2xl overflow-hidden"
        style={{ width: panelSize.w, height: panelSize.h, top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(7,7,13,0.99)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 40px 130px rgba(0,0,0,0.82)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-white/22 font-medium">Live Lesson</div>
            <div className="text-[13px] font-semibold text-white/88 truncate leading-tight">{topic}</div>
          </div>
          {isStreaming && <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" style={{ animation: "lt-blink 1.4s ease-in-out infinite" }} />
            <span className="text-[10px] text-white/30">Live</span>
          </div>}
          <button onClick={togglePause} className="h-7 w-7 rounded-lg grid place-items-center hover:bg-white/10 transition-all" title={paused ? "Resume (Space)" : "Pause (Space)"}>
            {paused ? <Play className="h-3.5 w-3.5 text-white/55" /> : <Pause className="h-3.5 w-3.5 text-white/55" />}
          </button>
          <button onClick={() => { abortRef.current?.abort(); ttsRef.current.clear(); onClose(); }} className="h-7 w-7 rounded-lg grid place-items-center hover:bg-white/10 transition-all">
            <X className="h-3.5 w-3.5 text-white/55" />
          </button>
        </div>

        {/* Body: robot LEFT | board RIGHT */}
        <div className="flex flex-1 min-h-0">

          {/* Robot column */}
          <div className="flex flex-col items-center justify-between py-3 px-2 shrink-0"
            style={{ width: "28%", minWidth: 175, borderRight: "1px solid rgba(255,255,255,0.055)", background: "rgba(3,3,9,0.75)" }}>

            {/* Speech scroll */}
            <div ref={speechScrollRef} className="flex-1 w-full overflow-y-auto space-y-2 px-1 pb-2">
              {turns.map((turn, i) => {
                const isCurrent = turn.role === "forge" && i === currentForgeIdx.current;
                const isLast = i === turns.length - 1;
                if (turn.role === "user") return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[90%] px-2.5 py-1.5 rounded-2xl rounded-br-sm text-[11px] leading-relaxed"
                      style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.18)" }}>
                      {turn.text}
                    </div>
                  </div>
                );
                const dt = isCurrent ? (isStreaming ? recentSpeech : turn.text.slice(-360).trimStart()) : turn.text.slice(-120).trimStart();
                return (
                  <div key={i} className="text-[11.5px] leading-relaxed text-white/65 w-full">
                    {dt}
                    {isCurrent && isStreaming && isLast && (
                      <span className="inline-block w-0.5 h-3 bg-[#6366f1] ml-0.5 align-middle rounded-sm" style={{ animation: "lt-cursor 0.85s step-end infinite" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Robot */}
            <div className="shrink-0 flex flex-col items-center gap-1 pt-2" style={{ overflow: "visible" }}>
              <RobotAvatar state={avatarState} />
              <div className="text-[9.5px] font-medium px-2.5 py-0.5 rounded-full mt-0.5"
                style={{
                  background: avatarState === "writing" ? "rgba(239,68,68,0.12)" : avatarState === "speaking" ? "rgba(99,102,241,0.14)" : "rgba(255,255,255,0.04)",
                  color:      avatarState === "writing" ? "#f87171" : avatarState === "speaking" ? "#818cf8" : avatarState === "thinking" ? "#fbbf24" : "rgba(255,255,255,0.25)",
                  border: `1px solid ${avatarState === "writing" ? "rgba(239,68,68,0.18)" : avatarState === "speaking" ? "rgba(99,102,241,0.20)" : "rgba(255,255,255,0.07)"}`,
                }}>
                {avatarState === "idle" ? "Ready" : avatarState === "speaking" ? "Explaining…" : avatarState === "thinking" ? "Thinking…" : "Writing…"}
              </div>
            </div>
          </div>

          {/* Board column */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 px-4 py-1.5 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.045)", background: "rgba(255,255,255,0.01)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: "#6366f1", opacity: 0.65 }} />
              <span className="text-[10px] text-white/22 tracking-widest uppercase flex-1">Board</span>
              {writingId !== null && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ animation: "lt-blink 0.5s ease-in-out infinite" }} />
                  <span className="text-[9px] text-red-400/60">Writing…</span>
                </div>
              )}
            </div>
            <BoardPanel lines={boardLines} writingId={writingId} writingDur={writingDur} onWriteDone={onWriteDone} isStreaming={isStreaming} />
          </div>
        </div>

        {/* Input + TTS speed */}
        <div className="px-4 py-2.5 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}>
          <div className="flex gap-2 items-center">
            <input ref={inputRef} value={interruptInput}
              onChange={(e) => setInterruptInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && interruptInput.trim()) { e.preventDefault(); sendInterrupt(); } }}
              placeholder="Ask a question to interrupt the lesson…"
              className="flex-1 text-[12px] text-white/82 placeholder:text-white/22 outline-none rounded-xl px-3 py-2 transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
              onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.22)")}
              onBlur={(e)  => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)")} />

            {/* Voice speed presets */}
            <div className="flex items-center gap-1 shrink-0">
              {([0.75, 1.0, 1.5] as const).map((r) => (
                <button key={r} onClick={() => setTtsRate(r)}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg transition-all"
                  title="Voice speed"
                  style={{
                    background: Math.abs(ttsRate - r) < 0.01 ? "rgba(99,102,241,0.22)" : "rgba(255,255,255,0.05)",
                    color:      Math.abs(ttsRate - r) < 0.01 ? "#a5b4fc" : "rgba(255,255,255,0.28)",
                    border: `1px solid ${Math.abs(ttsRate - r) < 0.01 ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                  {r === 0.75 ? "0.75×" : r === 1.0 ? "1×" : "1.5×"}
                </button>
              ))}
            </div>

            <button onClick={sendInterrupt} disabled={!interruptInput.trim()}
              className="h-8 w-8 rounded-xl grid place-items-center disabled:opacity-25 transition-all active:scale-95"
              style={{ background: "rgba(99,102,241,0.14)", border: "1px solid rgba(99,102,241,0.20)" }}>
              <Send className="h-3.5 w-3.5" style={{ color: "#818cf8" }} />
            </button>
          </div>
          <p className="text-[9px] text-white/15 text-center mt-1 select-none">Enter to interrupt · Space to pause · Esc to close</p>
        </div>

        {/* Resize handle */}
        <div onPointerDown={onResizeDown}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-18 hover:opacity-50 transition-opacity"
          style={{ touchAction: "none" }}>
          <svg viewBox="0 0 14 14" fill="none" className="w-full h-full">
            <path d="M2 12L12 2M7 12L12 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </>
  );
}
