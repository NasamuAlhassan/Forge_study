import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/dashboard/Topbar";
import { Mic, Square, Sparkles, Wand2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/voice")({
  component: VoicePage,
});

// Minimal Web Speech API typings (not included in the TS DOM lib).
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (ev: SpeechRecognitionEventLike) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function VoicePage() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      webkitSpeechRecognition?: SpeechRecognitionCtor;
      SpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev: SpeechRecognitionEventLike) => {
      let txt = "";
      for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
      setTranscript(txt);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
  }, []);

  const toggle = () => {
    if (!recRef.current) return;
    if (listening) recRef.current.stop();
    else {
      setTranscript("");
      recRef.current.start();
      setListening(true);
    }
  };

  return (
    <>
      <style>{`
        @keyframes voice-ring-pulse {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes voice-ring-pulse-2 {
          0% { transform: scale(1); opacity: 0.45; }
          70% { transform: scale(1.85); opacity: 0; }
          100% { transform: scale(1.85); opacity: 0; }
        }
        @keyframes voice-mic-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
      <Topbar title="Voice scheduling" subtitle="Speak naturally. Forge structures it for you." />
      <main className="p-4 sm:p-6">
        <div className="max-w-[480px] mx-auto text-center glass-panel rounded-3xl p-10 relative overflow-hidden">
          {/* Top-left light hit */}
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 40% at 10% 0%, oklch(1 0 0 / 0.06) 0%, transparent 60%)",
            }}
          />

          {/* Mic button + rings */}
          <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
            {listening && (
              <>
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "oklch(0.62 0.21 285 / 0.35)",
                    animation: "voice-ring-pulse 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite",
                  }}
                />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "oklch(0.62 0.21 285 / 0.2)",
                    animation:
                      "voice-ring-pulse-2 1.8s cubic-bezier(0.22, 1, 0.36, 1) 0.3s infinite",
                  }}
                />
              </>
            )}
            <button
              onClick={toggle}
              disabled={!supported}
              className="glass-circle relative h-28 w-28 rounded-full grid place-items-center disabled:opacity-40 active:scale-[0.94]"
              style={{
                borderRadius:  "50%",
                background:    listening ? "var(--glass-bg-active-dark)" : "var(--glass-bg-btn-dark)",
                backdropFilter:"blur(var(--glass-blur))",
                WebkitBackdropFilter:"blur(var(--glass-blur))",
                border:        listening ? "1px solid rgba(255,255,255,0.30)" : "1px solid var(--glass-border-dark)",
                boxShadow:     listening
                  ? "0 0 0 3px rgba(255,255,255,0.12), 0 1px 0 rgba(255,255,255,0.16) inset, var(--glass-shadow)"
                  : "0 1px 0 rgba(255,255,255,0.12) inset, var(--glass-shadow)",
                animation:     !listening && supported ? "voice-mic-float 3s ease-in-out infinite" : "none",
                transition:    "background 300ms ease, box-shadow 300ms ease, transform 150ms cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              {listening ? (
                <Square
                  className="h-8 w-8 text-white relative z-10"
                  style={{ filter: "drop-shadow(0 1px 2px oklch(0 0 0 / 0.3))" }}
                />
              ) : (
                <Mic
                  className="h-10 w-10 text-white relative z-10"
                  style={{ filter: "drop-shadow(0 1px 2px oklch(0 0 0 / 0.3))" }}
                />
              )}
            </button>
          </div>

          <h3
            className="mt-8 font-display text-2xl font-semibold relative"
            style={{
              letterSpacing: "-0.03em",
              color: "var(--foreground)",
              transition: "color 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {listening
              ? "Listening…"
              : supported
                ? "Tap to speak"
                : "Voice not supported in this browser"}
          </h3>
          <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: "var(--muted-foreground)" }}>
            Try:{" "}
            <span style={{ color: "var(--foreground)", fontStyle: "italic" }}>
              "I have Calculus on Monday from 8 to 10 in LT 1."
            </span>
          </p>

          {/* Transcript panel */}
          <div
            className="mt-7 glass-panel rounded-2xl p-5 text-left relative overflow-hidden"
            style={{
              minHeight: "8rem",
              transition: "border-color 0.3s ease",
              ...(listening ? { borderColor: "rgba(255,255,255,0.28)" } : {}),
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="h-5 w-5 rounded-lg grid place-items-center"
                style={{
                  background: "var(--glass-bg-btn-dark)",
                  border:     "1px solid var(--glass-border-dark)",
                }}
              >
                <Sparkles className="h-3 w-3 opacity-70" style={{ color: "var(--foreground)" }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                Live transcript
              </span>
              {listening && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.70)",
                    boxShadow:  "0 0 6px rgba(255,255,255,0.40)",
                    animation:  "voice-mic-float 1s ease-in-out infinite",
                  }}
                />
              )}
            </div>
            <p
              className="text-base leading-relaxed"
              style={{ color: transcript ? "var(--foreground)" : "var(--muted-foreground)" }}
            >
              {transcript || "…"}
            </p>
          </div>

          {/* Convert button */}
          {transcript && !listening && (
            <button className="btn-primary mt-5 px-6 py-2.5 text-sm">
              <Wand2 className="h-4 w-4 relative z-10" />
              <span className="relative z-10">Convert to schedule</span>
            </button>
          )}
        </div>
      </main>
    </>
  );
}
