import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Pause, Play, ChevronLeft, ChevronRight, RotateCcw, GraduationCap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { TutoringLesson, LessonSection } from "@/lib/forge-ai";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAR_SPEED_MS: Record<LessonSection["type"], number> = {
  text: 20,
  math: 14,
  code: 10,
  diagram: 0,
};
const WB_MIN_W = 460;
const WB_MIN_H = 380;

// ── TTS helpers (self-contained, no props needed) ─────────────────────────────

function wbSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = 0.93;
  utt.pitch = 1.0;
  const pick = () => {
    const vs = window.speechSynthesis.getVoices();
    const v  =
      vs.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("google")) ||
      vs.find((v) => v.lang === "en-US" && !v.localService) ||
      vs.find((v) => v.lang.startsWith("en-US")) ||
      vs.find((v) => v.lang.startsWith("en"));
    if (v) utt.voice = v;
  };
  pick();
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener("voiceschanged", pick, { once: true });
  }
  window.speechSynthesis.speak(utt);
}

function wbStopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// ── Mermaid diagram ───────────────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg]     = useState("");
  const [failed, setFail] = useState(false);
  const uid = useRef(`wb-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let live = true;
    import("mermaid")
      .then((m) => {
        m.default.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
        return m.default.render(uid.current, code.trim());
      })
      .then(({ svg }) => { if (live) setSvg(svg); })
      .catch(() => { if (live) setFail(true); });
    return () => { live = false; };
  }, [code]);

  if (failed) return (
    <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap p-3 rounded-lg border border-red-400/20 opacity-70">
      {code}
    </pre>
  );
  if (!svg) return (
    <div className="flex items-center justify-center h-24 text-sm text-white/30 animate-pulse">
      Rendering diagram…
    </div>
  );
  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// ── Board content renderer ─────────────────────────────────────────────────────

function BoardContent({ section, revealed }: { section: LessonSection; revealed: string }) {
  const mdComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-[22px] font-bold mb-4 text-white/95 leading-snug">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-[18px] font-semibold mb-3 text-white/88 leading-snug">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-[15px] font-semibold mb-2 text-white/82 leading-snug">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-3 leading-[1.7] text-white/78 text-[14px]">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-inside space-y-1.5 mb-3 ml-2">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal list-inside space-y-1.5 mb-3 ml-2">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="text-white/78 text-[14px] leading-relaxed">{children}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="text-[#f0c27f] font-semibold">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="text-white/65 not-italic border-b border-white/20">{children}</em>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-2 border-[#f0c27f]/50 pl-4 py-1 mb-3 text-white/65 text-[13px] italic bg-white/[0.03] rounded-r-lg">
        {children}
      </blockquote>
    ),
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; inline?: boolean }) => {
      const isBlock = !!className;
      if (isBlock) {
        const lang = className.replace("language-", "");
        return (
          <div className="mb-3">
            {lang && (
              <div className="text-[10px] uppercase tracking-widest text-orange-400/60 mb-1 font-mono px-1">
                {lang}
              </div>
            )}
            <pre className="bg-black/50 rounded-xl p-4 overflow-x-auto border border-white/8">
              <code className="text-[13px] font-mono text-emerald-300 leading-relaxed" {...props}>
                {children}
              </code>
            </pre>
          </div>
        );
      }
      return (
        <code className="text-[13px] font-mono text-orange-300 bg-white/[0.07] px-1 py-0.5 rounded" {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };

  if (section.type === "diagram") {
    const match = section.boardContent.match(/```(?:mermaid)?\n?([\s\S]+?)```/);
    return <MermaidDiagram code={match ? match[1] : section.boardContent} />;
  }

  return (
    <div>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={mdComponents as Record<string, unknown>}
      >
        {revealed}
      </ReactMarkdown>
      {revealed.length < section.boardContent.length && (
        <span
          className="inline-block w-0.5 h-[1.1em] bg-white/70 ml-0.5 align-middle"
          style={{ animation: "wb-blink 0.9s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}

// ── Type labels ────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<LessonSection["type"], string> = {
  text: "#60a5fa",
  math: "#c084fc",
  diagram: "#34d399",
  code: "#fb923c",
};
const TYPE_LABEL: Record<LessonSection["type"], string> = {
  text: "📝",
  math: "∑",
  diagram: "◈",
  code: "</>",
};

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  lesson: TutoringLesson;
  onClose: () => void;
}

type Phase = "intro" | "typing" | "paused" | "questioning" | "complete";

export function ForgeWhiteboard({ lesson, onClose }: Props) {
  const [phase,        setPhase]        = useState<Phase>("intro");
  const [sectionIdx,   setSectionIdx]   = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [completed,    setCompleted]    = useState<Set<number>>(new Set());
  const [questionAns,  setQuestionAns]  = useState("");
  const [ansSubmitted, setAnsSubmitted] = useState(false);
  const [panelSize,    setPanelSize]    = useState(() => ({
    w: Math.min(window.innerWidth  * 0.88, 920),
    h: Math.min(window.innerHeight * 0.88, 720),
  }));
  const resizing    = useRef(false);
  const resizeStart = useRef({ mx: 0, my: 0, pw: 0, ph: 0 });
  const boardRef    = useRef<HTMLDivElement>(null);

  const currentSection = lesson.sections[sectionIdx];
  const isLastSection  = sectionIdx === lesson.sections.length - 1;
  const isSectionDone  = displayedChars >= (currentSection?.boardContent.length ?? 0);

  // Auto-scroll board as content appears
  useEffect(() => {
    if (boardRef.current) {
      boardRef.current.scrollTop = boardRef.current.scrollHeight;
    }
  }, [displayedChars]);

  // ── Intro phase ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "intro") return;
    wbSpeak(lesson.intro);
    const delay = Math.min(lesson.intro.length * 58 + 900, 4000);
    const t = setTimeout(() => { setPhase("typing"); }, delay);
    return () => clearTimeout(t);
  }, [phase, lesson.intro]);

  // ── TTS when section starts ──────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "typing" || !currentSection) return;
    wbSpeak(currentSection.narration);
  // Only re-fire when the section index changes while in typing phase
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIdx, phase]);

  // ── Typewriter ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "typing" || !currentSection) return;
    if (currentSection.type === "diagram") {
      // Diagram is rendered whole — skip typewriter
      setDisplayedChars(currentSection.boardContent.length);
      return;
    }
    if (displayedChars >= currentSection.boardContent.length) return;
    const t = setTimeout(() => setDisplayedChars((n) => n + 1), CHAR_SPEED_MS[currentSection.type]);
    return () => clearTimeout(t);
  }, [displayedChars, phase, currentSection]);

  // ── Section completion ───────────────────────────────────────────────────────

  const advanceSection = useCallback(() => {
    setSectionIdx((i) => {
      const next = i + 1;
      if (next >= lesson.sections.length) {
        setPhase("complete");
        wbSpeak(lesson.closingQuestion);
        return i;
      }
      setDisplayedChars(0);
      setPhase("typing");
      return next;
    });
  }, [lesson.sections.length, lesson.closingQuestion]);

  useEffect(() => {
    if (!isSectionDone || phase !== "typing" || !currentSection) return;
    const hasQ = !!currentSection.checkQuestion;
    const t = setTimeout(() => {
      setCompleted((prev) => new Set([...prev, sectionIdx]));
      if (hasQ) {
        setPhase("questioning");
      } else {
        advanceSection();
      }
    }, hasQ ? 900 : 650);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSectionDone, phase, currentSection, sectionIdx]);

  // ── Controls ─────────────────────────────────────────────────────────────────

  const reexplain = useCallback((idx: number) => {
    wbStopSpeech();
    setSectionIdx(idx);
    setDisplayedChars(0);
    setQuestionAns("");
    setAnsSubmitted(false);
    setPhase("typing");
  }, []);

  const skip = () => {
    wbStopSpeech();
    setCompleted((prev) => new Set([...prev, sectionIdx]));
    if (isLastSection) { setPhase("complete"); wbSpeak(lesson.closingQuestion); }
    else { setSectionIdx((i) => i + 1); setDisplayedChars(0); setPhase("typing"); }
  };

  const togglePause = useCallback(() => {
    if (phase === "paused") {
      setPhase("typing");
      if (currentSection) wbSpeak(currentSection.narration);
    } else {
      wbStopSpeech();
      setPhase("paused");
    }
  }, [phase, currentSection]);

  const submitAnswer = () => {
    setAnsSubmitted(true);
    setTimeout(() => {
      setAnsSubmitted(false);
      setQuestionAns("");
      advanceSection();
    }, 1600);
  };

  const restart = () => {
    wbStopSpeech();
    setSectionIdx(0);
    setDisplayedChars(0);
    setCompleted(new Set());
    setQuestionAns("");
    setAnsSubmitted(false);
    setPhase("intro");
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space")      { e.preventDefault(); togglePause(); }
      if (e.code === "Escape")     { wbStopSpeech(); onClose(); }
      if (e.code === "ArrowRight") skip();
      if (e.code === "ArrowLeft" && sectionIdx > 0) reexplain(sectionIdx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePause, sectionIdx, phase]);

  // ── Resize ────────────────────────────────────────────────────────────────────

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = true;
    resizeStart.current = { mx: e.clientX, my: e.clientY, pw: panelSize.w, ph: panelSize.h };
    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      setPanelSize({
        w: Math.max(WB_MIN_W, Math.min(window.innerWidth  - 32, resizeStart.current.pw + ev.clientX - resizeStart.current.mx)),
        h: Math.max(WB_MIN_H, Math.min(window.innerHeight - 32, resizeStart.current.ph + ev.clientY - resizeStart.current.my)),
      });
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const revealed = currentSection?.type === "diagram"
    ? currentSection.boardContent
    : (currentSection?.boardContent.slice(0, displayedChars) ?? "");

  const isPaused = phase === "paused";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Blink keyframe */}
      <style>{`
        @keyframes wb-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .wb-katex .katex { color: #e2e8f0; }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[190]"
        style={{ background: "rgba(0,0,0,0.68)", backdropFilter: "blur(10px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) { wbStopSpeech(); onClose(); } }}
      />

      {/* Panel */}
      <div
        className="fixed z-[200] flex flex-col rounded-2xl overflow-hidden"
        style={{
          width:     panelSize.w,
          height:    panelSize.h,
          top:       "50%",
          left:      "50%",
          transform: "translate(-50%, -50%)",
          background:   "rgba(14,14,18,0.98)",
          border:       "1px solid rgba(255,255,255,0.09)",
          boxShadow:    "0 40px 120px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}
        >
          <div
            className="h-7 w-7 rounded-[10px] grid place-items-center shrink-0"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4338ca)" }}
          >
            <GraduationCap className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/35 uppercase tracking-widest">Forge Whiteboard</div>
            <div className="text-[13px] font-semibold text-white/90 truncate leading-snug">{lesson.topic}</div>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1 items-center shrink-0">
            {lesson.sections.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width:      i === sectionIdx ? 18 : 7,
                  height:     7,
                  background: completed.has(i)
                    ? "#f0c27f"
                    : i === sectionIdx
                    ? "rgba(240,194,127,0.55)"
                    : "rgba(255,255,255,0.14)",
                }}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={togglePause}
              className="h-8 w-8 rounded-lg grid place-items-center transition-all hover:bg-white/10"
              title={isPaused ? "Resume (Space)" : "Pause (Space)"}
            >
              {isPaused
                ? <Play  className="h-3.5 w-3.5 text-white/65" />
                : <Pause className="h-3.5 w-3.5 text-white/65" />}
            </button>
            <button
              onClick={() => { wbStopSpeech(); onClose(); }}
              className="h-8 w-8 rounded-lg grid place-items-center transition-all hover:bg-white/10"
              title="Close (Esc)"
            >
              <X className="h-3.5 w-3.5 text-white/65" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Section sidebar */}
          <div
            className="w-[152px] shrink-0 flex flex-col gap-1 p-2 overflow-y-auto"
            style={{ borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.18)" }}
          >
            {lesson.sections.map((s, i) => {
              const isDone   = completed.has(i);
              const isActive = i === sectionIdx;
              const isFuture = i > sectionIdx && !isDone;
              return (
                <button
                  key={s.id}
                  onClick={() => reexplain(i)}
                  disabled={isFuture && !isDone}
                  className="w-full text-left px-2.5 py-2 rounded-xl transition-all duration-150 group disabled:cursor-default"
                  style={{
                    background: isActive ? "rgba(240,194,127,0.10)" : isDone ? "rgba(255,255,255,0.04)" : "transparent",
                    border:     isActive ? "1px solid rgba(240,194,127,0.22)" : "1px solid transparent",
                    opacity:    isFuture ? 0.38 : 1,
                  }}
                  title={isDone ? "Click to re-explain this section" : undefined}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px]" style={{ color: TYPE_COLOR[s.type] }}>
                      {TYPE_LABEL[s.type]}
                    </span>
                    {isDone && (
                      <span className="ml-auto text-[10px]" style={{ color: "#f0c27f", opacity: 0.55 }}>✓</span>
                    )}
                  </div>
                  <div
                    className="text-[11px] leading-snug line-clamp-2 transition-colors"
                    style={{ color: isActive ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.55)" }}
                  >
                    {s.title}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Board */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* Scrollable content area */}
            <div ref={boardRef} className="flex-1 overflow-y-auto px-7 py-6 scroll-smooth wb-katex">

              {phase === "intro" && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-3xl mb-4">🎓</div>
                    <div className="text-[14px] text-white/40 animate-pulse">Preparing your lesson…</div>
                    <div className="text-[12px] text-white/25 mt-2">{lesson.intro}</div>
                  </div>
                </div>
              )}

              {(phase === "typing" || phase === "paused" || phase === "questioning") && currentSection && (
                <div>
                  <div
                    className="text-[10px] font-mono uppercase tracking-widest mb-4 flex items-center gap-2"
                    style={{ color: TYPE_COLOR[currentSection.type] }}
                  >
                    <span>{TYPE_LABEL[currentSection.type]}</span>
                    <span>{currentSection.type}</span>
                    {isPaused && (
                      <span className="ml-auto text-white/30 normal-case tracking-normal font-sans">
                        ⏸ paused
                      </span>
                    )}
                  </div>
                  <BoardContent section={currentSection} revealed={revealed} />
                </div>
              )}

              {phase === "complete" && (
                <div className="flex flex-col items-center justify-center h-full gap-5 text-center py-12">
                  <div className="text-5xl">🎓</div>
                  <div className="text-[20px] font-semibold text-white/90">Lesson complete!</div>
                  <div
                    className="text-[14px] leading-relaxed max-w-sm px-2"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    {lesson.closingQuestion}
                  </div>
                  <div className="flex gap-2.5 mt-1">
                    <button
                      onClick={restart}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] transition-all hover:bg-white/8"
                      style={{ color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restart
                    </button>
                    <button
                      onClick={() => { wbStopSpeech(); onClose(); }}
                      className="px-5 py-2 rounded-xl text-[13px] font-medium transition-all"
                      style={{
                        background: "rgba(240,194,127,0.14)",
                        color:      "#f0c27f",
                        border:     "1px solid rgba(240,194,127,0.22)",
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Comprehension question strip */}
            {phase === "questioning" && currentSection?.checkQuestion && (
              <div
                className="px-6 py-4 shrink-0"
                style={{
                  borderTop:  "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(240,194,127,0.04)",
                }}
              >
                <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(240,194,127,0.6)" }}>
                  Quick check
                </div>
                <div className="text-[13px] font-medium text-white/85 mb-3">
                  {currentSection.checkQuestion}
                </div>
                {!ansSubmitted ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={questionAns}
                      onChange={(e) => setQuestionAns(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && questionAns.trim() && submitAnswer()}
                      placeholder="Type your answer…"
                      className="flex-1 rounded-xl px-3 py-2 text-[13px] text-white/90 placeholder:text-white/28 outline-none transition-all"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border:     "1px solid rgba(255,255,255,0.12)",
                      }}
                      onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.25)")}
                      onBlur={(e)  => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
                    />
                    <button
                      onClick={submitAnswer}
                      disabled={!questionAns.trim()}
                      className="px-4 py-2 rounded-xl text-[13px] font-medium transition-all disabled:opacity-35"
                      style={{
                        background: "rgba(240,194,127,0.13)",
                        color:      "#f0c27f",
                        border:     "1px solid rgba(240,194,127,0.22)",
                      }}
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => advanceSection()}
                      className="px-3 py-2 rounded-xl text-[11px] transition-all hover:bg-white/5"
                      style={{ color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      Skip
                    </button>
                  </div>
                ) : (
                  <div className="text-[13px] text-emerald-400/80" style={{ animation: "wb-blink 0.4s ease" }}>
                    ✓ Moving on…
                  </div>
                )}
              </div>
            )}

            {/* Narration + nav strip */}
            {phase !== "complete" && phase !== "intro" && (
              <div
                className="px-5 py-2.5 flex items-center gap-3 shrink-0"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.22)" }}
              >
                <div
                  className="flex-1 text-[11px] leading-snug truncate"
                  style={{ color: "rgba(255,255,255,0.32)" }}
                  title={currentSection?.narration}
                >
                  🗣 {currentSection?.narration?.slice(0, 100)}{(currentSection?.narration?.length ?? 0) > 100 ? "…" : ""}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {sectionIdx > 0 && (
                    <button
                      onClick={() => reexplain(sectionIdx - 1)}
                      className="h-7 w-7 rounded-lg grid place-items-center transition-all hover:bg-white/10"
                      title="Previous section (←)"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 text-white/40" />
                    </button>
                  )}
                  <span className="text-[11px] text-white/25 px-1">
                    {sectionIdx + 1} / {lesson.sections.length}
                  </span>
                  {!isLastSection && phase !== "questioning" && (
                    <button
                      onClick={skip}
                      className="h-7 w-7 rounded-lg grid place-items-center transition-all hover:bg-white/10"
                      title="Next section (→)"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-white/40" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize"
          style={{ touchAction: "none", opacity: 0.3 }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-full h-full">
            <path d="M3 13L13 3M8 13L13 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </>
  );
}
