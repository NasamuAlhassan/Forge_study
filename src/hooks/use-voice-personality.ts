import { useCallback, useState } from "react";

export interface VoicePersonality {
  tone: number;          // 0 = very casual, 100 = professional
  expressiveness: number;// 0 = chill/calm, 100 = animated/reactive
  replyLength: number;   // 0 = ultra-brief, 100 = detailed
  speechSpeed: number;   // 0 = slow, 100 = fast
}

const STORAGE_KEY = "forge_voice_personality";

export const DEFAULT_PERSONALITY: VoicePersonality = {
  tone: 25,
  expressiveness: 65,
  replyLength: 25,
  speechSpeed: 55,
};

/** Converts slider values into a voice-mode system-prompt instruction block. */
export function buildVoiceContext(p: VoicePersonality, userName: string): string {
  const tone =
    p.tone < 33
      ? "super casual and laid-back — informal language, contractions, feels like texting a close friend"
      : p.tone < 66
      ? "friendly and natural — conversational, warm"
      : "professional but approachable — clear and respectful";

  const expr =
    p.expressiveness < 33
      ? "calm and measured — few filler words, no over-the-top reactions"
      : p.expressiveness < 66
      ? `naturally expressive — occasional reactions like "Ohh", "Hmm", "Yeah!", "Right"`
      : `very animated — lots of reactions like "Ohhhh!", "Yhhhh!", "Ahh okay okay", "Right right right", "Ooh nice!", "Wait—"`;

  const length =
    p.replyLength < 33
      ? "ultra brief — 1 short sentence max, no padding"
      : p.replyLength < 66
      ? "brief — 1-2 sentences"
      : "can elaborate — 2-3 sentences when it genuinely adds value";

  return `[Voice mode — speak like a real person talking, NOT writing. No bullet points, no markdown, no lists.
Tone: ${tone}.
Expressiveness: ${expr}.
Reply length: ${length}.
The user's name is ${userName}.]`;
}

/** Maps speechSpeed (0–100) to SpeechSynthesisUtterance.rate (0.75–1.5). */
export function speedToRate(speed: number): number {
  return 0.75 + (speed / 100) * 0.75;
}

export function useVoicePersonality() {
  const [personality, setPersonality] = useState<VoicePersonality>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_PERSONALITY, ...(JSON.parse(stored) as Partial<VoicePersonality>) };
    } catch { /* ignore */ }
    return DEFAULT_PERSONALITY;
  });

  const update = useCallback((key: keyof VoicePersonality, value: number) => {
    setPersonality((prev) => {
      const next = { ...prev, [key]: Math.max(0, Math.min(100, value)) };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { personality, update };
}
