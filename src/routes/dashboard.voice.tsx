import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/dashboard/Topbar";
import { Button } from "@/components/ui/button";
import { Mic, Square, Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard/voice")({
  component: VoicePage,
});

type SR = typeof window extends { webkitSpeechRecognition: infer T } ? T : any;

function VoicePage() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev: any) => {
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
      <Topbar title="Voice scheduling" subtitle="Speak naturally. Forge structures it for you." />
      <main className="p-4 sm:p-6">
        <div className="ring-gradient glass rounded-2xl p-8 max-w-3xl mx-auto text-center">
          <div className="relative mx-auto h-28 w-28">
            <div className={`absolute inset-0 rounded-full bg-gradient-primary ${listening ? "animate-glow-pulse" : "opacity-60"}`} />
            <button
              onClick={toggle}
              disabled={!supported}
              className="relative h-28 w-28 rounded-full bg-gradient-primary grid place-items-center shadow-glow disabled:opacity-50"
            >
              {listening ? <Square className="h-8 w-8 text-primary-foreground" /> : <Mic className="h-10 w-10 text-primary-foreground" />}
            </button>
          </div>

          <h3 className="mt-6 font-display text-2xl font-semibold">
            {listening ? "Listening…" : supported ? "Tap to start" : "Voice not supported in this browser"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Try: <span className="text-foreground">"I have Calculus on Monday from 8 to 10 in LT 1."</span>
          </p>

          <div className="mt-6 ring-gradient glass rounded-xl p-5 text-left min-h-32">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary-glow" /> Live transcript
            </div>
            <p className="mt-2 text-base">{transcript || <span className="text-muted-foreground">…</span>}</p>
          </div>

          {transcript && !listening && (
            <Button className="mt-5 bg-gradient-primary hover:opacity-90 shadow-glow">
              Convert to schedule
            </Button>
          )}
        </div>
      </main>
    </>
  );
}
